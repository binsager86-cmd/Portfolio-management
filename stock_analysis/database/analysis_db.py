"""
Stock Analysis Database — Connection manager & helpers.

Routes all queries through the main app's ``db_layer`` module,
which auto-detects SQLite (local development) vs PostgreSQL
(DigitalOcean / Supabase / other cloud).

The stock-analysis tables live **inside the same database** as
the portfolio tracker so there is a single connection pool.
"""

import os
import time
from typing import Any, Dict, List, Optional, Tuple

# ── Import the app-wide database abstraction layer ───────────────────
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from stock_analysis.config import normalize_line_item_code

from db_layer import (
    get_conn,
    get_connection,
    convert_sql,
    convert_params,
    get_last_insert_id,
    is_postgres,
    is_sqlite,
)


class AnalysisDatabase:
    """Thread-safe* database manager for the stock analysis module.

    All SQL is routed through ``db_layer`` which handles
    SQLite ↔ PostgreSQL translation automatically.

    *Each public method opens its own connection ➜ safe with Streamlit's
    multi-rerun model (no shared cursor across reruns).
    """

    def __init__(self, db_path: Optional[str] = None):
        # db_path kept for backward-compat but ignored —
        # db_layer controls where the database actually is.
        self._initialized = False
        self._initialize_database()

    # ── schema initialisation ──────────────────────────────────────────

    def _initialize_database(self) -> None:
        """Create analysis tables if they don't already exist."""
        if self._initialized:
            return
        with get_connection() as conn:
            cur = conn.cursor()
            if is_postgres():
                self._create_postgres_tables(cur)
            else:
                self._create_sqlite_tables(cur)
            conn.commit()
        self._initialized = True

    # ── SQLite schema (uses schema.sql) ───────────────────────────────
    def _create_sqlite_tables(self, cur) -> None:
        """Create tables with SQLite syntax using schema.sql."""
        schema_file = os.path.join(os.path.dirname(__file__), 'schema.sql')
        with open(schema_file, 'r', encoding='utf-8') as fh:
            sql = fh.read()
        # executescript only works with sqlite3, and cur is from sqlite3
        import sqlite3
        conn = cur.connection
        conn.executescript(sql)

    # ── PostgreSQL schema ─────────────────────────────────────────────
    @staticmethod
    def _create_postgres_tables(cur) -> None:
        """Create analysis tables with PostgreSQL syntax."""

        cur.execute("""
            CREATE TABLE IF NOT EXISTS analysis_stocks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                company_name TEXT NOT NULL,
                exchange TEXT DEFAULT 'NYSE',
                currency TEXT DEFAULT 'USD',
                sector TEXT,
                industry TEXT,
                country TEXT,
                isin TEXT,
                cik TEXT,
                description TEXT,
                website TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, symbol)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_statements (
                id SERIAL PRIMARY KEY,
                stock_id INTEGER NOT NULL,
                statement_type TEXT NOT NULL,
                fiscal_year INTEGER NOT NULL,
                fiscal_quarter INTEGER,
                period_end_date TEXT NOT NULL,
                filing_date TEXT,
                source_file TEXT,
                extracted_by TEXT DEFAULT 'gemini',
                confidence_score DOUBLE PRECISION,
                verified_by_user BOOLEAN DEFAULT FALSE,
                notes TEXT,
                created_at INTEGER NOT NULL,
                UNIQUE(stock_id, statement_type, period_end_date),
                FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_line_items (
                id SERIAL PRIMARY KEY,
                statement_id INTEGER NOT NULL,
                line_item_code TEXT NOT NULL,
                line_item_name TEXT NOT NULL,
                amount DOUBLE PRECISION NOT NULL,
                currency TEXT DEFAULT 'USD',
                order_index INTEGER,
                parent_item_id INTEGER,
                is_total BOOLEAN DEFAULT FALSE,
                manually_edited BOOLEAN DEFAULT FALSE,
                edited_by_user_id INTEGER,
                edited_at INTEGER,
                FOREIGN KEY (statement_id) REFERENCES financial_statements(id)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS stock_metrics (
                id SERIAL PRIMARY KEY,
                stock_id INTEGER NOT NULL,
                fiscal_year INTEGER NOT NULL,
                fiscal_quarter INTEGER,
                period_end_date TEXT NOT NULL,
                metric_type TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                metric_value DOUBLE PRECISION,
                created_at INTEGER NOT NULL,
                UNIQUE(stock_id, metric_name, period_end_date),
                FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS valuation_models (
                id SERIAL PRIMARY KEY,
                stock_id INTEGER NOT NULL,
                model_type TEXT NOT NULL,
                valuation_date TEXT NOT NULL,
                intrinsic_value DOUBLE PRECISION,
                parameters TEXT,
                assumptions TEXT,
                created_by_user_id INTEGER,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS stock_scores (
                id SERIAL PRIMARY KEY,
                stock_id INTEGER NOT NULL,
                scoring_date TEXT NOT NULL,
                overall_score DOUBLE PRECISION,
                fundamental_score DOUBLE PRECISION,
                valuation_score DOUBLE PRECISION,
                growth_score DOUBLE PRECISION,
                quality_score DOUBLE PRECISION,
                details TEXT,
                analyst_notes TEXT,
                created_by_user_id INTEGER,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS analysis_audit_log (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                operation TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER,
                old_value TEXT,
                new_value TEXT,
                reason TEXT,
                details TEXT,
                created_at INTEGER NOT NULL
            )
        """)

        # Indexes (IF NOT EXISTS is PG 9.5+)
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_analysis_stocks_user ON analysis_stocks(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_analysis_stocks_symbol ON analysis_stocks(symbol)",
            "CREATE INDEX IF NOT EXISTS idx_financial_statements_stock ON financial_statements(stock_id)",
            "CREATE INDEX IF NOT EXISTS idx_financial_statements_type_date ON financial_statements(statement_type, period_end_date)",
            "CREATE INDEX IF NOT EXISTS idx_line_items_statement ON financial_line_items(statement_id)",
            "CREATE INDEX IF NOT EXISTS idx_line_items_code ON financial_line_items(line_item_code)",
            "CREATE INDEX IF NOT EXISTS idx_stock_metrics_stock ON stock_metrics(stock_id)",
            "CREATE INDEX IF NOT EXISTS idx_valuation_models_stock ON valuation_models(stock_id)",
            "CREATE INDEX IF NOT EXISTS idx_stock_scores_stock ON stock_scores(stock_id)",
        ]:
            try:
                cur.execute(idx_sql)
            except Exception:
                pass  # index already exists

    # ── connection (delegates to db_layer) ─────────────────────────────

    @staticmethod
    def get_connection():
        """Return a new connection from the app-wide pool.

        For SQLite the row factory is set so ``fetchall()`` returns
        dict-like Row objects.  For PostgreSQL we use RealDictCursor
        at the query level instead.
        """
        conn = get_conn()
        if is_sqlite():
            import sqlite3
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
        return conn

    # ── generic query helpers ──────────────────────────────────────────
    def execute_query(
        self, query: str, params: tuple = ()
    ) -> List[Dict[str, Any]]:
        """SELECT → list of dicts."""
        query = convert_sql(query)
        params = convert_params(params)
        conn = self.get_connection()
        try:
            if is_postgres():
                from psycopg2.extras import RealDictCursor
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(query, params)
                rows = cur.fetchall()
                return [dict(r) for r in rows]
            else:
                rows = conn.execute(query, params).fetchall()
                return [dict(r) for r in rows]
        finally:
            conn.close()

    def execute_update(self, query: str, params: tuple = ()) -> int:
        """INSERT / UPDATE / DELETE → last inserted id."""
        query = convert_sql(query)
        params = convert_params(params)
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(query, params)
            conn.commit()
            return get_last_insert_id(cur)
        finally:
            conn.close()

    def execute_many(self, query: str, params_list: List[tuple]) -> int:
        """Batch insert/update → rows affected."""
        query = convert_sql(query)
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            if is_postgres():
                for params in params_list:
                    cur.execute(query, convert_params(params))
            else:
                conn.executemany(query, params_list)
            conn.commit()
            return cur.rowcount if hasattr(cur, 'rowcount') else len(params_list)
        finally:
            conn.close()

    # ── stock helpers ──────────────────────────────────────────────────
    def get_all_stocks(self, user_id: int) -> List[Dict[str, Any]]:
        return self.execute_query(
            "SELECT * FROM analysis_stocks WHERE user_id = ? ORDER BY symbol",
            (user_id,),
        )

    def get_stock_by_id(self, stock_id: int) -> Optional[Dict[str, Any]]:
        rows = self.execute_query(
            "SELECT * FROM analysis_stocks WHERE id = ?", (stock_id,)
        )
        return rows[0] if rows else None

    def get_stock_by_symbol(
        self, user_id: int, symbol: str
    ) -> Optional[Dict[str, Any]]:
        rows = self.execute_query(
            "SELECT * FROM analysis_stocks WHERE user_id = ? AND symbol = ?",
            (user_id, symbol.upper()),
        )
        return rows[0] if rows else None

    def create_stock(self, user_id: int, **kwargs) -> int:
        """Insert a new analysis_stock row. Returns new row id."""
        now = int(time.time())
        return self.execute_update(
            """INSERT INTO analysis_stocks
               (user_id, symbol, company_name, exchange, currency,
                sector, industry, country, isin, cik,
                description, website, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                user_id,
                kwargs['symbol'].upper(),
                kwargs['company_name'],
                kwargs.get('exchange', 'NYSE'),
                kwargs.get('currency', 'USD'),
                kwargs.get('sector'),
                kwargs.get('industry'),
                kwargs.get('country'),
                kwargs.get('isin'),
                kwargs.get('cik'),
                kwargs.get('description'),
                kwargs.get('website'),
                now,
                now,
            ),
        )

    def update_stock(self, stock_id: int, **kwargs) -> None:
        sets = ', '.join(f"{k} = ?" for k in kwargs)
        vals = list(kwargs.values()) + [int(time.time()), stock_id]
        self.execute_update(
            f"UPDATE analysis_stocks SET {sets}, updated_at = ? WHERE id = ?",
            tuple(vals),
        )

    def delete_stock(self, stock_id: int) -> None:
        conn = self.get_connection()
        try:
            _p = "%s" if is_postgres() else "?"

            # cascade: line_items → statements, metrics, valuations, scores
            if is_postgres():
                from psycopg2.extras import RealDictCursor
                dict_cur = conn.cursor(cursor_factory=RealDictCursor)
                dict_cur.execute(
                    f"SELECT id FROM financial_statements WHERE stock_id = {_p}",
                    (stock_id,),
                )
                stmt_ids = [r['id'] for r in dict_cur.fetchall()]
            else:
                rows = conn.execute(
                    "SELECT id FROM financial_statements WHERE stock_id = ?",
                    (stock_id,),
                ).fetchall()
                stmt_ids = [r['id'] for r in rows]

            cur = conn.cursor()
            for sid in stmt_ids:
                cur.execute(
                    f"DELETE FROM financial_line_items WHERE statement_id = {_p}",
                    (sid,),
                )
            cur.execute(
                f"DELETE FROM financial_statements WHERE stock_id = {_p}",
                (stock_id,),
            )
            cur.execute(
                f"DELETE FROM stock_metrics WHERE stock_id = {_p}",
                (stock_id,),
            )
            cur.execute(
                f"DELETE FROM valuation_models WHERE stock_id = {_p}",
                (stock_id,),
            )
            cur.execute(
                f"DELETE FROM stock_scores WHERE stock_id = {_p}",
                (stock_id,),
            )
            cur.execute(
                f"DELETE FROM analysis_stocks WHERE id = {_p}",
                (stock_id,),
            )
            conn.commit()
        finally:
            conn.close()

    # ── financial statement helpers ────────────────────────────────────
    def get_financial_statements(
        self, stock_id: int, statement_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        if statement_type:
            return self.execute_query(
                """SELECT * FROM financial_statements
                   WHERE stock_id = ? AND statement_type = ?
                   ORDER BY period_end_date DESC""",
                (stock_id, statement_type),
            )
        return self.execute_query(
            """SELECT * FROM financial_statements
               WHERE stock_id = ?
               ORDER BY period_end_date DESC""",
            (stock_id,),
        )

    def create_financial_statement(self, stock_id: int, **kwargs) -> int:
        """Upsert a financial_statements row.

        Uses SELECT→UPDATE/INSERT instead of INSERT OR REPLACE to
        avoid FOREIGN KEY constraint failures (REPLACE internally
        DELETEs the parent row, which violates FKs from
        financial_line_items).

        Matches on ``(stock_id, statement_type, period_end_date)`` first;
        falls back to ``(stock_id, statement_type, fiscal_year)`` so that
        re-uploading the same year always overwrites.
        """
        now = int(time.time())
        existing = self.execute_query(
            """SELECT id FROM financial_statements
               WHERE stock_id = ? AND statement_type = ? AND period_end_date = ?""",
            (stock_id, kwargs['statement_type'], kwargs['period_end_date']),
        )
        if not existing:
            existing = self.execute_query(
                """SELECT id FROM financial_statements
                   WHERE stock_id = ? AND statement_type = ? AND fiscal_year = ?""",
                (stock_id, kwargs['statement_type'], kwargs['fiscal_year']),
            )
        if existing:
            stmt_id = existing[0]['id']
            self.execute_update(
                """UPDATE financial_statements
                   SET fiscal_year = ?, fiscal_quarter = ?,
                       period_end_date = ?,
                       filing_date = ?, source_file = ?,
                       extracted_by = ?, confidence_score = ?,
                       verified_by_user = ?, notes = ?, created_at = ?
                   WHERE id = ?""",
                (
                    kwargs['fiscal_year'],
                    kwargs.get('fiscal_quarter'),
                    kwargs['period_end_date'],
                    kwargs.get('filing_date'),
                    kwargs.get('source_file'),
                    kwargs.get('extracted_by', 'gemini'),
                    kwargs.get('confidence_score'),
                    kwargs.get('verified_by_user', False),
                    kwargs.get('notes'),
                    now,
                    stmt_id,
                ),
            )
            return stmt_id
        else:
            return self.execute_update(
                """INSERT INTO financial_statements
                   (stock_id, statement_type, fiscal_year, fiscal_quarter,
                    period_end_date, filing_date, source_file,
                    extracted_by, confidence_score, verified_by_user,
                    notes, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    stock_id,
                    kwargs['statement_type'],
                    kwargs['fiscal_year'],
                    kwargs.get('fiscal_quarter'),
                    kwargs['period_end_date'],
                    kwargs.get('filing_date'),
                    kwargs.get('source_file'),
                    kwargs.get('extracted_by', 'gemini'),
                    kwargs.get('confidence_score'),
                    kwargs.get('verified_by_user', False),
                    kwargs.get('notes'),
                    now,
                ),
            )

    # ── line item helpers ──────────────────────────────────────────────
    def get_line_items(self, statement_id: int) -> List[Dict[str, Any]]:
        return self.execute_query(
            """SELECT * FROM financial_line_items
               WHERE statement_id = ?
               ORDER BY order_index""",
            (statement_id,),
        )

    def bulk_insert_line_items(
        self, statement_id: int, items: List[Dict[str, Any]]
    ) -> int:
        """Insert many line items at once for a statement."""
        def _safe_amount(it: Dict[str, Any]) -> float:
            val = it.get('amount') or it.get('value') or 0.0
            if isinstance(val, str):
                try:
                    return float(val.replace(",", ""))
                except (ValueError, TypeError):
                    return 0.0
            try:
                return float(val)
            except (ValueError, TypeError):
                return 0.0

        params = [
            (
                statement_id,
                normalize_line_item_code(
                    it.get('code') or it.get('name', 'UNKNOWN').upper().replace(' ', '_')
                ),
                it.get('name', it.get('code', 'Unknown')),
                _safe_amount(it),
                it.get('currency', 'USD'),
                it.get('order', idx),
                it.get('parent_item_id'),
                it.get('is_total', False),
            )
            for idx, it in enumerate(items, 1)
        ]
        return self.execute_many(
            """INSERT INTO financial_line_items
               (statement_id, line_item_code, line_item_name,
                amount, currency, order_index, parent_item_id, is_total)
               VALUES (?,?,?,?,?,?,?,?)""",
            params,
        )

    def update_line_item(
        self, item_id: int, amount: float, user_id: int
    ) -> None:
        self.execute_update(
            """UPDATE financial_line_items
               SET amount = ?, manually_edited = 1,
                   edited_by_user_id = ?, edited_at = ?
               WHERE id = ?""",
            (amount, user_id, int(time.time()), item_id),
        )

    def delete_line_items_for_statement(self, statement_id: int) -> None:
        self.execute_update(
            "DELETE FROM financial_line_items WHERE statement_id = ?",
            (statement_id,),
        )

    # ── metrics helpers ────────────────────────────────────────────────
    def upsert_metric(
        self, stock_id: int, fiscal_year: int, period_end_date: str,
        metric_type: str, metric_name: str, metric_value: float,
        fiscal_quarter: Optional[int] = None,
    ) -> int:
        """Upsert a metric row (SELECT→UPDATE/INSERT for PG compat)."""
        now = int(time.time())
        existing = self.execute_query(
            """SELECT id FROM stock_metrics
               WHERE stock_id = ? AND metric_name = ? AND period_end_date = ?""",
            (stock_id, metric_name, period_end_date),
        )
        if existing:
            return self.execute_update(
                """UPDATE stock_metrics
                   SET fiscal_year = ?, fiscal_quarter = ?,
                       metric_type = ?, metric_value = ?, created_at = ?
                   WHERE id = ?""",
                (fiscal_year, fiscal_quarter, metric_type, metric_value, now,
                 existing[0]['id']),
            )
        else:
            return self.execute_update(
                """INSERT INTO stock_metrics
                   (stock_id, fiscal_year, fiscal_quarter, period_end_date,
                    metric_type, metric_name, metric_value, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (stock_id, fiscal_year, fiscal_quarter, period_end_date,
                 metric_type, metric_name, metric_value, now),
            )

    def get_metrics(
        self, stock_id: int, metric_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        if metric_type:
            return self.execute_query(
                """SELECT * FROM stock_metrics
                   WHERE stock_id = ? AND metric_type = ?
                   ORDER BY period_end_date DESC""",
                (stock_id, metric_type),
            )
        return self.execute_query(
            """SELECT * FROM stock_metrics WHERE stock_id = ?
               ORDER BY period_end_date DESC""",
            (stock_id,),
        )

    # ── valuation helpers ──────────────────────────────────────────────
    def save_valuation(self, stock_id: int, **kwargs) -> int:
        import json as _json
        now = int(time.time())
        return self.execute_update(
            """INSERT INTO valuation_models
               (stock_id, model_type, valuation_date, intrinsic_value,
                parameters, assumptions, created_by_user_id, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                stock_id,
                kwargs['model_type'],
                kwargs['valuation_date'],
                kwargs.get('intrinsic_value'),
                _json.dumps(kwargs.get('parameters', {})),
                _json.dumps(kwargs.get('assumptions', {})),
                kwargs.get('created_by_user_id'),
                now,
            ),
        )

    def get_valuations(self, stock_id: int) -> List[Dict[str, Any]]:
        return self.execute_query(
            """SELECT * FROM valuation_models WHERE stock_id = ?
               ORDER BY valuation_date DESC""",
            (stock_id,),
        )

    # ── score helpers ──────────────────────────────────────────────────
    def save_score(self, stock_id: int, **kwargs) -> int:
        import json as _json
        now = int(time.time())
        return self.execute_update(
            """INSERT INTO stock_scores
               (stock_id, scoring_date, overall_score,
                fundamental_score, valuation_score, growth_score,
                quality_score, details, analyst_notes,
                created_by_user_id, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                stock_id,
                kwargs['scoring_date'],
                kwargs.get('overall_score'),
                kwargs.get('fundamental_score'),
                kwargs.get('valuation_score'),
                kwargs.get('growth_score'),
                kwargs.get('quality_score'),
                _json.dumps(kwargs.get('details', {})),
                kwargs.get('analyst_notes'),
                kwargs.get('created_by_user_id'),
                now,
            ),
        )

    def get_scores(self, stock_id: int) -> List[Dict[str, Any]]:
        return self.execute_query(
            """SELECT * FROM stock_scores WHERE stock_id = ?
               ORDER BY scoring_date DESC""",
            (stock_id,),
        )

    # ── audit log ──────────────────────────────────────────────────────
    def log_audit(
        self, user_id: int, operation: str, entity_type: str,
        entity_id: Optional[int] = None, old_value: Optional[str] = None,
        new_value: Optional[str] = None, reason: Optional[str] = None,
        details: Optional[str] = None,
    ) -> int:
        return self.execute_update(
            """INSERT INTO analysis_audit_log
               (user_id, operation, entity_type, entity_id,
                old_value, new_value, reason, details, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (user_id, operation, entity_type, entity_id,
             old_value, new_value, reason, details, int(time.time())),
        )
