"""
Stock Profile Management — CRUD operations for analysis_stocks.
"""

import time
from typing import Any, Dict, List, Optional

from stock_analysis.database.analysis_db import AnalysisDatabase


class StockProfileManager:
    """Business-logic wrapper around analysis_stocks table."""

    def __init__(self, db: Optional[AnalysisDatabase] = None):
        self.db = db or AnalysisDatabase()

    # ── queries ────────────────────────────────────────────────────────
    def list_stocks(self, user_id: int) -> List[Dict[str, Any]]:
        return self.db.get_all_stocks(user_id)

    def get_stock(self, stock_id: int) -> Optional[Dict[str, Any]]:
        return self.db.get_stock_by_id(stock_id)

    def search_stocks(
        self, user_id: int, query: str
    ) -> List[Dict[str, Any]]:
        """Search stocks by symbol or company name (case-insensitive)."""
        q = f"%{query}%"
        return self.db.execute_query(
            """SELECT * FROM analysis_stocks
               WHERE user_id = ?
                 AND (symbol LIKE ? OR company_name LIKE ?)
               ORDER BY symbol""",
            (user_id, q, q),
        )

    # ── mutations ──────────────────────────────────────────────────────
    def create_stock(self, user_id: int, **kwargs) -> int:
        """Create a new stock profile.

        Required kwargs: symbol, company_name
        Optional:  exchange, currency, sector, industry, country,
                   isin, cik, description, website
        """
        symbol = kwargs.get('symbol', '').strip().upper()
        if not symbol:
            raise ValueError("Symbol is required")
        if not kwargs.get('company_name', '').strip():
            raise ValueError("Company name is required")

        # Duplicate check
        existing = self.db.get_stock_by_symbol(user_id, symbol)
        if existing:
            raise ValueError(
                f"Stock '{symbol}' already exists for this user (id={existing['id']})"
            )

        stock_id = self.db.create_stock(user_id, **kwargs)
        self.db.log_audit(
            user_id, 'INSERT', 'stock', stock_id,
            new_value=f"{symbol} – {kwargs.get('company_name')}",
        )
        return stock_id

    def update_stock(self, user_id: int, stock_id: int, **kwargs) -> None:
        """Update an existing stock profile."""
        old = self.db.get_stock_by_id(stock_id)
        if old is None:
            raise ValueError(f"Stock id {stock_id} not found")
        self.db.update_stock(stock_id, **kwargs)
        self.db.log_audit(
            user_id, 'UPDATE', 'stock', stock_id,
            old_value=str(old),
            new_value=str(kwargs),
        )

    def delete_stock(self, user_id: int, stock_id: int) -> None:
        """Delete stock and all related data (cascade)."""
        old = self.db.get_stock_by_id(stock_id)
        if old is None:
            raise ValueError(f"Stock id {stock_id} not found")
        self.db.delete_stock(stock_id)
        self.db.log_audit(
            user_id, 'DELETE', 'stock', stock_id,
            old_value=f"{old['symbol']} – {old['company_name']}",
        )

    # ── summary helpers ────────────────────────────────────────────────
    def get_stock_summary(self, stock_id: int) -> Dict[str, Any]:
        """Return stock profile + counts of statements, metrics, etc."""
        stock = self.db.get_stock_by_id(stock_id)
        if stock is None:
            raise ValueError(f"Stock id {stock_id} not found")

        stmt_count = self.db.execute_query(
            "SELECT COUNT(*) AS cnt FROM financial_statements WHERE stock_id = ?",
            (stock_id,),
        )[0]['cnt']

        metric_count = self.db.execute_query(
            "SELECT COUNT(*) AS cnt FROM stock_metrics WHERE stock_id = ?",
            (stock_id,),
        )[0]['cnt']

        val_count = self.db.execute_query(
            "SELECT COUNT(*) AS cnt FROM valuation_models WHERE stock_id = ?",
            (stock_id,),
        )[0]['cnt']

        score_rows = self.db.get_scores(stock_id)
        latest_score = score_rows[0] if score_rows else None

        return {
            **stock,
            'statement_count': stmt_count,
            'metric_count': metric_count,
            'valuation_count': val_count,
            'latest_score': latest_score,
        }
