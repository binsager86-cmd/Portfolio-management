"""
Stock Analysis Database — Connection manager & helpers.

Uses a SEPARATE database file (data/stock_analysis.db) from the main
portfolio tracker so both systems remain independent.
"""

import sqlite3
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class AnalysisDatabase:
    """Thread-safe* database manager for the stock analysis module.

    *Each public method opens its own connection ➜ safe with Streamlit's
    multi-rerun model (no shared cursor across reruns).
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            # Default: <repo>/data/stock_analysis.db
            db_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                'data', 'stock_analysis.db',
            )
        self.db_path = db_path
        self._ensure_directory()
        self._initialize_database()

    # ── internal helpers ───────────────────────────────────────────────
    def _ensure_directory(self) -> None:
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

    def _schema_sql(self) -> str:
        """Read the companion schema.sql shipped next to this file."""
        schema_file = os.path.join(os.path.dirname(__file__), 'schema.sql')
        with open(schema_file, 'r', encoding='utf-8') as fh:
            return fh.read()

    def _initialize_database(self) -> None:
        conn = self.get_connection()
        try:
            conn.executescript(self._schema_sql())
            conn.commit()
        finally:
            conn.close()

    # ── connection ─────────────────────────────────────────────────────
    def get_connection(self) -> sqlite3.Connection:
        """Return a new connection with Row factory enabled."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    # ── generic query helpers ──────────────────────────────────────────
    def execute_query(
        self, query: str, params: tuple = ()
    ) -> List[Dict[str, Any]]:
        """SELECT → list of dicts."""
        conn = self.get_connection()
        try:
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def execute_update(self, query: str, params: tuple = ()) -> int:
        """INSERT / UPDATE / DELETE → lastrowid."""
        conn = self.get_connection()
        try:
            cur = conn.execute(query, params)
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()

    def execute_many(self, query: str, params_list: List[tuple]) -> int:
        """Batch insert/update → rows affected."""
        conn = self.get_connection()
        try:
            cur = conn.executemany(query, params_list)
            conn.commit()
            return cur.rowcount
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
            # cascade: line_items → statements, metrics, valuations, scores
            stmt_ids = [
                r['id']
                for r in conn.execute(
                    "SELECT id FROM financial_statements WHERE stock_id = ?",
                    (stock_id,),
                ).fetchall()
            ]
            for sid in stmt_ids:
                conn.execute(
                    "DELETE FROM financial_line_items WHERE statement_id = ?",
                    (sid,),
                )
            conn.execute(
                "DELETE FROM financial_statements WHERE stock_id = ?",
                (stock_id,),
            )
            conn.execute(
                "DELETE FROM stock_metrics WHERE stock_id = ?", (stock_id,)
            )
            conn.execute(
                "DELETE FROM valuation_models WHERE stock_id = ?", (stock_id,)
            )
            conn.execute(
                "DELETE FROM stock_scores WHERE stock_id = ?", (stock_id,)
            )
            conn.execute(
                "DELETE FROM analysis_stocks WHERE id = ?", (stock_id,)
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
        """
        now = int(time.time())
        existing = self.execute_query(
            """SELECT id FROM financial_statements
               WHERE stock_id = ? AND statement_type = ? AND period_end_date = ?""",
            (stock_id, kwargs['statement_type'], kwargs['period_end_date']),
        )
        if existing:
            stmt_id = existing[0]['id']
            self.execute_update(
                """UPDATE financial_statements
                   SET fiscal_year = ?, fiscal_quarter = ?,
                       filing_date = ?, source_file = ?,
                       extracted_by = ?, confidence_score = ?,
                       verified_by_user = ?, notes = ?, created_at = ?
                   WHERE id = ?""",
                (
                    kwargs['fiscal_year'],
                    kwargs.get('fiscal_quarter'),
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
        params = [
            (
                statement_id,
                it.get('code') or it.get('name', 'UNKNOWN').upper().replace(' ', '_'),
                it.get('name', it.get('code', 'Unknown')),
                it.get('amount', it.get('value', 0.0)),
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
        now = int(time.time())
        return self.execute_update(
            """INSERT OR REPLACE INTO stock_metrics
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
