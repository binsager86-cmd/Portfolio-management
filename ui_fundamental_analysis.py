"""
Fundamental Analysis UI — thin wrapper
=======================================
Re-exports key functions from the stock_analysis package so the main
ui.py can import them with a flat path.
"""

import streamlit as st

# ── imports from the existing stock_analysis package ──────────────────

from stock_analysis.app import render_stock_analysis          # full tabbed view
from stock_analysis.ui.stock_creation_ui import (
    ui_stock_analysis_create,                                  # two-column stock creation
    render_stock_creation_page,
)
from stock_analysis.ui.financial_upload_ui import (
    ui_upload_financial_statement,                              # standalone upload form
    render_financial_upload_page,
)
from stock_analysis.ui.fundamental_analysis_ui import render_fundamental_analysis_page
from stock_analysis.ui.valuation_ui import render_valuation_page
from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.models.financial_data import FinancialDataManager


# ── convenience aliases matching user specification ───────────────────

def ui_stock_profile_creation():
    """Render the stock-profile creation form (calls stock_analysis)."""
    ui_stock_analysis_create()


def ui_upload_financials():
    """Render the financial-statement upload form (calls stock_analysis)."""
    ui_upload_financial_statement()


def ui_fundamental_analysis():
    """
    Full Fundamental Analysis section with sub-tabs:
    Stock Profiles | Upload Financials | Analysis | Valuation
    """
    user_id = st.session_state.get("user_id", 1)

    # Pre-load user's saved Gemini API key from DB into session_state
    # so the upload UIs pick it up automatically.
    if "gemini_api_key" not in st.session_state or not st.session_state.get("gemini_api_key"):
        try:
            import sqlite3, os
            db_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "portfolio.db"
            )
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute("SELECT gemini_api_key FROM users WHERE id = ?", (user_id,))
            row = cur.fetchone()
            conn.close()
            if row and row[0]:
                st.session_state["gemini_api_key"] = row[0]
        except Exception:
            pass

    render_stock_analysis(user_id)
