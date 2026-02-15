"""
Storage — persist extraction artifacts via ``db_layer``.

Tables created:
    financial_uploads           — one row per PDF upload
    financial_raw_extraction    — raw tables/text per statement page
    financial_normalized        — mapped line items (normalized schema)
    financial_validation        — accounting-check results
    financial_user_edits        — audit trail for manual corrections
"""

import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

from db_layer import (
    get_conn,
    get_connection,
    convert_sql,
    convert_params,
    get_last_insert_id,
    is_postgres,
    is_sqlite,
)


# ─────────────────────────────────────────────────────────────────────
# Schema creation
# ─────────────────────────────────────────────────────────────────────

_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS financial_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    stock_id    INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL,
    pdf_path    TEXT,
    pdf_type    TEXT DEFAULT 'text',
    status      TEXT DEFAULT 'processing',
    error_message TEXT,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE IF NOT EXISTS financial_raw_extraction (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    page_num        INTEGER,
    method          TEXT,
    table_id        INTEGER,
    table_json      TEXT,
    header_context  TEXT,
    confidence_score REAL DEFAULT 0.0,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE IF NOT EXISTS financial_normalized (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT NOT NULL,
    period_end_date TEXT,
    currency        TEXT DEFAULT 'USD',
    unit_scale      INTEGER DEFAULT 1,
    line_item_key   TEXT NOT NULL,
    label_raw       TEXT,
    value           REAL,
    source_page     INTEGER,
    source_table_id INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE IF NOT EXISTS financial_validation (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    rule_name       TEXT NOT NULL,
    expected_value  REAL,
    actual_value    REAL,
    diff            REAL,
    pass_fail       TEXT DEFAULT 'unknown',
    notes           TEXT,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE IF NOT EXISTS financial_user_edits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    period          TEXT,
    line_item_key   TEXT NOT NULL,
    old_value       REAL,
    new_value       REAL,
    edited_at       INTEGER NOT NULL,
    edited_by       INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE INDEX IF NOT EXISTS idx_fin_uploads_user ON financial_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_uploads_stock ON financial_uploads(stock_id);
CREATE INDEX IF NOT EXISTS idx_fin_raw_upload ON financial_raw_extraction(upload_id);
CREATE INDEX IF NOT EXISTS idx_fin_norm_upload ON financial_normalized(upload_id);
CREATE INDEX IF NOT EXISTS idx_fin_valid_upload ON financial_validation(upload_id);
CREATE INDEX IF NOT EXISTS idx_fin_edits_upload ON financial_user_edits(upload_id);
"""


def _create_pg_tables(cur) -> None:
    """Create extraction-pipeline tables with PostgreSQL DDL."""
    stmts = [
        """CREATE TABLE IF NOT EXISTS financial_uploads (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL,
            stock_id    INTEGER NOT NULL,
            uploaded_at INTEGER NOT NULL,
            pdf_path    TEXT,
            pdf_type    TEXT DEFAULT 'text',
            status      TEXT DEFAULT 'processing',
            error_message TEXT,
            FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
        )""",
        """CREATE TABLE IF NOT EXISTS financial_raw_extraction (
            id              SERIAL PRIMARY KEY,
            upload_id       INTEGER NOT NULL,
            statement_type  TEXT,
            page_num        INTEGER,
            method          TEXT,
            table_id        INTEGER,
            table_json      TEXT,
            header_context  TEXT,
            confidence_score DOUBLE PRECISION DEFAULT 0.0,
            FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
        )""",
        """CREATE TABLE IF NOT EXISTS financial_normalized (
            id              SERIAL PRIMARY KEY,
            upload_id       INTEGER NOT NULL,
            statement_type  TEXT NOT NULL,
            period_end_date TEXT,
            currency        TEXT DEFAULT 'USD',
            unit_scale      INTEGER DEFAULT 1,
            line_item_key   TEXT NOT NULL,
            label_raw       TEXT,
            value           DOUBLE PRECISION,
            source_page     INTEGER,
            source_table_id INTEGER,
            FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
        )""",
        """CREATE TABLE IF NOT EXISTS financial_validation (
            id              SERIAL PRIMARY KEY,
            upload_id       INTEGER NOT NULL,
            statement_type  TEXT,
            rule_name       TEXT NOT NULL,
            expected_value  DOUBLE PRECISION,
            actual_value    DOUBLE PRECISION,
            diff            DOUBLE PRECISION,
            pass_fail       TEXT DEFAULT 'unknown',
            notes           TEXT,
            FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
        )""",
        """CREATE TABLE IF NOT EXISTS financial_user_edits (
            id              SERIAL PRIMARY KEY,
            upload_id       INTEGER NOT NULL,
            statement_type  TEXT,
            period          TEXT,
            line_item_key   TEXT NOT NULL,
            old_value       DOUBLE PRECISION,
            new_value       DOUBLE PRECISION,
            edited_at       INTEGER NOT NULL,
            edited_by       INTEGER,
            FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
        )""",
    ]
    for s in stmts:
        cur.execute(s)
    for idx in [
        "CREATE INDEX IF NOT EXISTS idx_fin_uploads_user ON financial_uploads(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_fin_uploads_stock ON financial_uploads(stock_id)",
        "CREATE INDEX IF NOT EXISTS idx_fin_raw_upload ON financial_raw_extraction(upload_id)",
        "CREATE INDEX IF NOT EXISTS idx_fin_norm_upload ON financial_normalized(upload_id)",
        "CREATE INDEX IF NOT EXISTS idx_fin_valid_upload ON financial_validation(upload_id)",
        "CREATE INDEX IF NOT EXISTS idx_fin_edits_upload ON financial_user_edits(upload_id)",
    ]:
        try:
            cur.execute(idx)
        except Exception:
            pass


def ensure_extraction_tables() -> None:
    """Create pipeline tables if they don't exist (idempotent)."""
    with get_connection() as conn:
        if is_postgres():
            cur = conn.cursor()
            _create_pg_tables(cur)
            conn.commit()
        else:
            conn.executescript(_SQLITE_SCHEMA)
            conn.commit()


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

def _exec(sql: str, params: tuple = ()) -> int:
    """Execute INSERT/UPDATE/DELETE → return last-insert id."""
    conn = get_conn()
    try:
        if is_sqlite():
            import sqlite3
            conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(convert_sql(sql), convert_params(params))
        conn.commit()
        return get_last_insert_id(cur)
    finally:
        conn.close()


def _query(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    """Execute SELECT → list of dicts."""
    conn = get_conn()
    try:
        sql = convert_sql(sql)
        params = convert_params(params)
        if is_postgres():
            from psycopg2.extras import RealDictCursor
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
        else:
            import sqlite3
            conn.row_factory = sqlite3.Row
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

def create_upload(user_id: int, stock_id: int, pdf_path: str,
                  pdf_type: str = "text") -> int:
    """Insert a new financial_uploads row. Returns upload_id."""
    return _exec(
        """INSERT INTO financial_uploads
           (user_id, stock_id, uploaded_at, pdf_path, pdf_type, status)
           VALUES (?,?,?,?,?,?)""",
        (user_id, stock_id, int(time.time()), pdf_path, pdf_type, "processing"),
    )


def update_upload_status(upload_id: int, status: str,
                         error_message: Optional[str] = None) -> None:
    _exec(
        "UPDATE financial_uploads SET status = ?, error_message = ? WHERE id = ?",
        (status, error_message, upload_id),
    )


def save_raw_extraction(upload_id: int, statement_type: str,
                        page_num: int, method: str,
                        table_id: int, table_json: str,
                        header_context: str,
                        confidence: float) -> int:
    return _exec(
        """INSERT INTO financial_raw_extraction
           (upload_id, statement_type, page_num, method,
            table_id, table_json, header_context, confidence_score)
           VALUES (?,?,?,?,?,?,?,?)""",
        (upload_id, statement_type, page_num, method,
         table_id, table_json, header_context, confidence),
    )


def save_normalized_item(upload_id: int, statement_type: str,
                         period_end_date: str, currency: str,
                         unit_scale: int, line_item_key: str,
                         label_raw: str, value: float,
                         source_page: Optional[int] = None,
                         source_table_id: Optional[int] = None) -> int:
    return _exec(
        """INSERT INTO financial_normalized
           (upload_id, statement_type, period_end_date, currency,
            unit_scale, line_item_key, label_raw, value,
            source_page, source_table_id)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (upload_id, statement_type, period_end_date, currency,
         unit_scale, line_item_key, label_raw, value,
         source_page, source_table_id),
    )


def save_validation_result(upload_id: int, statement_type: str,
                           rule_name: str, expected: Optional[float],
                           actual: Optional[float], diff: Optional[float],
                           pass_fail: str, notes: str = "") -> int:
    return _exec(
        """INSERT INTO financial_validation
           (upload_id, statement_type, rule_name,
            expected_value, actual_value, diff, pass_fail, notes)
           VALUES (?,?,?,?,?,?,?,?)""",
        (upload_id, statement_type, rule_name,
         expected, actual, diff, pass_fail, notes),
    )


def save_user_edit(upload_id: int, statement_type: str,
                   period: str, line_item_key: str,
                   old_value: float, new_value: float,
                   user_id: int) -> int:
    return _exec(
        """INSERT INTO financial_user_edits
           (upload_id, statement_type, period, line_item_key,
            old_value, new_value, edited_at, edited_by)
           VALUES (?,?,?,?,?,?,?,?)""",
        (upload_id, statement_type, period, line_item_key,
         old_value, new_value, int(time.time()), user_id),
    )


def get_upload(upload_id: int) -> Optional[Dict[str, Any]]:
    rows = _query("SELECT * FROM financial_uploads WHERE id = ?",
                  (upload_id,))
    return rows[0] if rows else None


def get_raw_extractions(upload_id: int) -> List[Dict[str, Any]]:
    return _query(
        "SELECT * FROM financial_raw_extraction WHERE upload_id = ? ORDER BY id",
        (upload_id,),
    )


def get_normalized_items(upload_id: int,
                         statement_type: Optional[str] = None) -> List[Dict[str, Any]]:
    if statement_type:
        return _query(
            """SELECT * FROM financial_normalized
               WHERE upload_id = ? AND statement_type = ? ORDER BY id""",
            (upload_id, statement_type),
        )
    return _query(
        "SELECT * FROM financial_normalized WHERE upload_id = ? ORDER BY id",
        (upload_id,),
    )


def get_validations(upload_id: int) -> List[Dict[str, Any]]:
    return _query(
        "SELECT * FROM financial_validation WHERE upload_id = ? ORDER BY id",
        (upload_id,),
    )
