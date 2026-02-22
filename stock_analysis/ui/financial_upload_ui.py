"""
Financial Upload UI — PDF upload, Gemini extraction, review & edit,
and save workflow.

Provides two entry points:
  • render_financial_upload_page()  — embeddable tab layout
  • ui_upload_financial_statement() — standalone page for sidebar nav
"""

import os
import time
import streamlit as st
import pandas as pd
from typing import Any, Dict, List, Optional

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.models.stock_profile import StockProfileManager
from stock_analysis.models.financial_extractor import FinancialPDFExtractor
from stock_analysis.models.financial_data import FinancialDataManager
from stock_analysis.utils.pdf_processor import PDFProcessor
from stock_analysis.utils.validators import (
    validate_line_items,
    validate_statement_type,
    check_balance_sheet_balance,
)
from stock_analysis.utils.helpers import fmt_number, badge_html
from stock_analysis.config import (
    STATEMENT_TYPES,
    FINANCIAL_LINE_ITEM_CODES,
    GEMINI_API_KEY,
    MODEL_FALLBACK_ORDER,
)

# Lazy import for the new extraction pipeline
def _get_pipeline(api_key: str):
    """Lazy-load ExtractionPipeline to avoid hard dependency on fitz/camelot."""
    from stock_analysis.extraction.pipeline import ExtractionPipeline
    return ExtractionPipeline(api_key=api_key)

# ── Default line items per statement type (for manual entry) ──────────
_DEFAULT_LINE_ITEMS: Dict[str, List[Dict[str, Any]]] = {
    "income": [
        {"code": "REVENUE", "name": "Total Revenue", "amount": 0.0, "is_total": False},
        {"code": "COST_OF_REVENUE", "name": "Cost of Revenue", "amount": 0.0, "is_total": False},
        {"code": "GROSS_PROFIT", "name": "Gross Profit", "amount": 0.0, "is_total": True},
        {"code": "SGA", "name": "Selling General & Administrative", "amount": 0.0, "is_total": False},
        {"code": "R&D", "name": "Research & Development", "amount": 0.0, "is_total": False},
        {"code": "OPERATING_EXPENSES", "name": "Operating Expenses", "amount": 0.0, "is_total": True},
        {"code": "OPERATING_INCOME", "name": "Operating Income", "amount": 0.0, "is_total": True},
        {"code": "INTEREST_EXPENSE", "name": "Interest Expense", "amount": 0.0, "is_total": False},
        {"code": "OTHER_INCOME", "name": "Other Income/Expense", "amount": 0.0, "is_total": False},
        {"code": "INCOME_BEFORE_TAX", "name": "Income Before Tax", "amount": 0.0, "is_total": True},
        {"code": "INCOME_TAX", "name": "Income Tax Expense", "amount": 0.0, "is_total": False},
        {"code": "NET_INCOME", "name": "Net Income", "amount": 0.0, "is_total": True},
        {"code": "EPS_BASIC", "name": "EPS (Basic)", "amount": 0.0, "is_total": False},
        {"code": "EPS_DILUTED", "name": "EPS (Diluted)", "amount": 0.0, "is_total": False},
    ],
    "balance": [
        {"code": "CASH_EQUIVALENTS", "name": "Cash & Cash Equivalents", "amount": 0.0, "is_total": False},
        {"code": "ACCOUNTS_RECEIVABLE", "name": "Accounts Receivable", "amount": 0.0, "is_total": False},
        {"code": "INVENTORY", "name": "Inventory", "amount": 0.0, "is_total": False},
        {"code": "OTHER_CURRENT_ASSETS", "name": "Other Current Assets", "amount": 0.0, "is_total": False},
        {"code": "TOTAL_CURRENT_ASSETS", "name": "Total Current Assets", "amount": 0.0, "is_total": True},
        {"code": "PPE_NET", "name": "Property Plant & Equipment (Net)", "amount": 0.0, "is_total": False},
        {"code": "GOODWILL", "name": "Goodwill", "amount": 0.0, "is_total": False},
        {"code": "INTANGIBLE_ASSETS", "name": "Intangible Assets", "amount": 0.0, "is_total": False},
        {"code": "TOTAL_NON_CURRENT_ASSETS", "name": "Total Non-Current Assets", "amount": 0.0, "is_total": True},
        {"code": "TOTAL_ASSETS", "name": "Total Assets", "amount": 0.0, "is_total": True},
        {"code": "ACCOUNTS_PAYABLE", "name": "Accounts Payable", "amount": 0.0, "is_total": False},
        {"code": "SHORT_TERM_DEBT", "name": "Short Term Debt", "amount": 0.0, "is_total": False},
        {"code": "TOTAL_CURRENT_LIABILITIES", "name": "Total Current Liabilities", "amount": 0.0, "is_total": True},
        {"code": "LONG_TERM_DEBT", "name": "Long Term Debt", "amount": 0.0, "is_total": False},
        {"code": "TOTAL_LIABILITIES", "name": "Total Liabilities", "amount": 0.0, "is_total": True},
        {"code": "COMMON_STOCK", "name": "Common Stock", "amount": 0.0, "is_total": False},
        {"code": "RETAINED_EARNINGS", "name": "Retained Earnings", "amount": 0.0, "is_total": False},
        {"code": "TOTAL_EQUITY", "name": "Total Equity", "amount": 0.0, "is_total": True},
        {"code": "TOTAL_LIABILITIES_EQUITY", "name": "Total Liabilities & Equity", "amount": 0.0, "is_total": True},
    ],
    "cashflow": [
        {"code": "NET_INCOME_CF", "name": "Net Income (CF)", "amount": 0.0, "is_total": False},
        {"code": "DEPRECIATION_AMORTIZATION", "name": "Depreciation & Amortization", "amount": 0.0, "is_total": False},
        {"code": "CHANGES_WORKING_CAPITAL", "name": "Changes in Working Capital", "amount": 0.0, "is_total": False},
        {"code": "CASH_FROM_OPERATIONS", "name": "Cash from Operating Activities", "amount": 0.0, "is_total": True},
        {"code": "CAPITAL_EXPENDITURES", "name": "Capital Expenditures", "amount": 0.0, "is_total": False},
        {"code": "OTHER_INVESTING", "name": "Other Investing Activities", "amount": 0.0, "is_total": False},
        {"code": "CASH_FROM_INVESTING", "name": "Cash from Investing Activities", "amount": 0.0, "is_total": True},
        {"code": "DEBT_ISSUED", "name": "Debt Issued", "amount": 0.0, "is_total": False},
        {"code": "DEBT_REPAID", "name": "Debt Repaid", "amount": 0.0, "is_total": False},
        {"code": "DIVIDENDS_PAID", "name": "Dividends Paid", "amount": 0.0, "is_total": False},
        {"code": "CASH_FROM_FINANCING", "name": "Cash from Financing Activities", "amount": 0.0, "is_total": True},
        {"code": "NET_CHANGE_CASH", "name": "Net Change in Cash", "amount": 0.0, "is_total": True},
    ],
    "equity": [
        {"code": "SHARE_CAPITAL", "name": "Share Capital", "amount": 0.0, "is_total": False},
        {"code": "SHARE_PREMIUM", "name": "Share Premium", "amount": 0.0, "is_total": False},
        {"code": "STATUTORY_RESERVE", "name": "Statutory Reserve", "amount": 0.0, "is_total": False},
        {"code": "VOLUNTARY_RESERVE", "name": "Voluntary Reserve", "amount": 0.0, "is_total": False},
        {"code": "GENERAL_RESERVE", "name": "General Reserve", "amount": 0.0, "is_total": False},
        {"code": "TREASURY_SHARES_EQUITY", "name": "Treasury Shares", "amount": 0.0, "is_total": False},
        {"code": "RETAINED_EARNINGS_EQUITY", "name": "Retained Earnings", "amount": 0.0, "is_total": False},
        {"code": "FAIR_VALUE_RESERVE", "name": "Fair Value Reserve", "amount": 0.0, "is_total": False},
        {"code": "FOREIGN_CURRENCY_TRANSLATION", "name": "Foreign Currency Translation Reserve", "amount": 0.0, "is_total": False},
        {"code": "OTHER_COMPREHENSIVE_INCOME", "name": "Other Comprehensive Income", "amount": 0.0, "is_total": False},
        {"code": "DIVIDENDS_DECLARED", "name": "Dividends Declared", "amount": 0.0, "is_total": False},
        {"code": "TRANSFER_TO_RESERVES", "name": "Transfer to Reserves", "amount": 0.0, "is_total": False},
        {"code": "NON_CONTROLLING_INTEREST", "name": "Non-Controlling Interest", "amount": 0.0, "is_total": False},
        {"code": "CLOSING_EQUITY", "name": "Closing Equity", "amount": 0.0, "is_total": True},
        {"code": "TOTAL_EQUITY_AND_NCI", "name": "Total Equity (incl. NCI)", "amount": 0.0, "is_total": True},
    ],
}


def _get_db() -> AnalysisDatabase:
    if "analysis_db" not in st.session_state:
        st.session_state["analysis_db"] = AnalysisDatabase()
    return st.session_state["analysis_db"]


def _resolve_gemini_key(input_key: str = "gemini_key_resolve") -> Optional[str]:
    """Resolve Gemini API key with encrypted-key support.

    Resolution order:
      1. ``st.session_state.gemini_api_key`` (already loaded)
      2. Encrypted column in DB (``gemini_api_key_encrypted``)
      3. Legacy plaintext column (``gemini_api_key``)
      4. ``GEMINI_API_KEY`` env var
      5. Manual text-input fallback

    When the user enters a key manually it is persisted to session
    state, the ``users`` table, **and** the environment.
    """
    # 1) Already loaded by main ui.py from the users table
    api_key = st.session_state.get("gemini_api_key", "") or ""

    # 2) Try encrypted key from DB
    if not api_key:
        user_id = st.session_state.get("user_id")
        if user_id:
            try:
                from stock_analysis.models.financial_data import FinancialDataManager
                api_key = FinancialDataManager.get_user_gemini_key(user_id) or ""
            except Exception:
                pass

    # 3) Env-var fallback
    if not api_key:
        api_key = GEMINI_API_KEY or ""

    # 4) Manual entry fallback
    if not api_key:
        api_key = st.text_input(
            "🔑 Gemini API Key",
            type="password",
            help="Get a free key at https://aistudio.google.com/app/apikey",
            key=input_key,
        )

    # Persist back so the extractor and other pages pick it up
    if api_key:
        st.session_state["gemini_api_key"] = api_key
        # Also push into env so FinancialPDFExtractor sees it
        if not os.environ.get("GEMINI_API_KEY"):
            os.environ["GEMINI_API_KEY"] = api_key
        # Save to DB (best-effort; main ui.py's get_conn may not be importable)
        _save_key_to_db(api_key)

    return api_key or None


def _save_key_to_db(api_key: str) -> None:
    """Persist the Gemini key to the users table (best-effort)."""
    user_id = st.session_state.get("user_id")
    if not user_id:
        return
    try:
        import sys
        _repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if _repo not in sys.path:
            sys.path.insert(0, _repo)
        from db_layer import get_conn, convert_sql, convert_params
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            convert_sql("UPDATE users SET gemini_api_key = ? WHERE id = ?"),
            convert_params((api_key, user_id)),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # non-critical — key is still in session_state


# ── Manual entry form ──────────────────────────────────────────────────

def show_manual_entry_form(
    statement_type: str,
    stock_id: int,
    db: AnalysisDatabase,
    user_id: int = 1,
) -> None:
    """Render a manual-entry form for a single financial statement.

    Pre-populates an editable dataframe with default line items for
    the given statement type. When the user clicks 'Save Manual Entry'
    the data is persisted exactly like an AI-extracted statement.
    """
    st.subheader(
        f"📝 Manual Entry — {STATEMENT_TYPES.get(statement_type, statement_type)}"
    )
    st.caption(
        "Fill in amounts from the financial report. "
        "You can add or remove rows as needed."
    )

    # Period metadata
    mc1, mc2, mc3, mc4 = st.columns(4)
    with mc1:
        fiscal_year = st.number_input(
            "Fiscal Year", min_value=2000, max_value=2030, value=2024,
            key=f"manual_fy_{statement_type}",
        )
    with mc2:
        fiscal_quarter = st.selectbox(
            "Quarter",
            ["FY", "Q1", "Q2", "Q3", "Q4"],
            key=f"manual_fq_{statement_type}",
            help="Select FY for annual statements",
        )
    with mc3:
        period_end_date = st.date_input(
            "Period End Date",
            key=f"manual_ped_{statement_type}",
        )
    with mc4:
        currency = st.selectbox(
            "Currency",
            ["KWD", "USD", "EUR", "GBP", "SAR", "AED", "BHD"],
            key=f"manual_ccy_{statement_type}",
        )

    # Editable line items
    defaults = _DEFAULT_LINE_ITEMS.get(statement_type, [])
    df = pd.DataFrame(defaults)

    edited_df = st.data_editor(
        df,
        column_config={
            "code": st.column_config.TextColumn("Code", width="medium"),
            "name": st.column_config.TextColumn("Name", width="large"),
            "amount": st.column_config.NumberColumn("Amount", format="%.2f"),
            "is_total": st.column_config.CheckboxColumn("Total?"),
        },
        num_rows="dynamic",
        use_container_width=True,
        key=f"manual_editor_{statement_type}",
    )

    # Balance sheet check
    if statement_type == "balance":
        items_dict = edited_df.to_dict("records")
        ok, msg = check_balance_sheet_balance(items_dict)
        if ok:
            st.success(f"✅ {msg}")
        else:
            st.warning(f"⚠️ {msg}")

    # Save
    if st.button(
        "💾 Save Manual Entry", type="primary",
        key=f"save_manual_{statement_type}",
        use_container_width=True,
    ):
        items = edited_df.to_dict("records")
        non_zero = [i for i in items if i.get("amount", 0) != 0]
        if not non_zero:
            st.warning("Please enter at least one non-zero line item.")
            return

        extracted_data = {
            "statement_type": statement_type,
            "fiscal_year": int(fiscal_year),
            "fiscal_quarter": fiscal_quarter,
            "period_end_date": str(period_end_date),
            "currency": currency,
            "confidence_score": 1.0,  # manual = full confidence
            "line_items": items,
        }

        try:
            fdm = FinancialDataManager(db)
            stmt_id = fdm.save_extracted_data(
                stock_id,
                extracted_data,
                source_file="manual_entry",
                user_id=user_id,
            )
            st.success(
                f"✅ Saved manual {STATEMENT_TYPES[statement_type]} "
                f"(ID {stmt_id}) with {len(items)} line items"
            )
            st.rerun()
        except Exception as e:
            st.error(f"❌ Save failed: {e}")


def _show_rate_limit_help() -> None:
    """Display rate-limit troubleshooting guidance."""
    with st.expander("🔧 Rate Limit Troubleshooting", expanded=True):
        st.markdown(
            """
**Your Gemini API quota has been exhausted.** The system tried
multiple models automatically but all returned a rate-limit error.

**What you can do right now:**

1. **⏳ Wait & retry** — Free-tier quotas reset within 1–15 minutes.
2. **📝 Manual entry** — Switch to *Manual Entry* mode below and
   type the numbers directly from the PDF.
3. **🔄 Use a different API key** — Create a new key at
   [Google AI Studio](https://aistudio.google.com/app/apikey).
4. **📦 Cached extractions** — Re-uploading the same PDF will use
   cached results if available (24 h TTL).

**Models attempted** (in order):
"""
        )
        for m in MODEL_FALLBACK_ORDER:
            st.markdown(f"- `{m}`")


# ── public API ─────────────────────────────────────────────────────────

def render_financial_upload_page(user_id: int = 1) -> None:
    """Embeddable tab layout (used by render_stock_analysis)."""
    st.header("📄 Financial Statement Upload & Extraction")
    st.caption(
        "Upload PDF financial reports (10-K, annual reports). "
        "Gemini AI extracts structured data for you to review and save."
    )

    db = _get_db()
    mgr = StockProfileManager(db)
    stocks = mgr.list_stocks(user_id)

    if not stocks:
        st.warning(
            "⚠️ No stock profiles found. "
            "Create one in the **📊 Stock Profiles** tab first."
        )
        st.info(
            "**Quick start:**\n\n"
            "1. Switch to the **📊 Stock Profiles** tab above\n"
            "2. Click **➕ Create New** and fill in symbol & company name\n"
            "3. Return here to upload PDFs"
        )
        return

    options = {f"{s['symbol']} — {s['company_name']}": s for s in stocks}
    choice = st.selectbox("Select stock", list(options.keys()), key="upload_stock_sel")
    stock = options[choice]
    stock_id = stock["id"]

    # Verify stock actually exists in DB (guard against stale session)
    stock_check = db.execute_query(
        "SELECT id FROM analysis_stocks WHERE id = ? AND user_id = ?",
        (stock_id, user_id),
    )
    if not stock_check:
        st.error(
            f"❌ Stock ID {stock_id} no longer exists in the database. "
            "Please select another stock or create a new profile."
        )
        return

    tab_upload, tab_existing = st.tabs(
        ["⬆️ Upload & Extract", "📋 Existing Statements"]
    )
    with tab_upload:
        _render_upload_tab(stock_id, user_id, db)
    with tab_existing:
        _render_existing_tab(stock_id, user_id, db)


# ── Debug / cache-hit helper ──────────────────────────────────────────

def _show_extraction_debug(
    result: Dict[str, Any],
    debug_mode: bool,
    smart: bool = False,
) -> None:
    """Display cache-hit banner (always) and debug panel (if enabled).

    Supports both legacy ``_meta`` dicts and AI Vision ``ai_result``.
    """
    # ── AI Vision result (preferred) ──
    ai_res = result.get("ai_result", {})
    if ai_res:
        # Cache-hit banner
        if ai_res.get("_from_cache"):
            st.info("💾 **Using cached AI Vision extraction** — no API call needed.")

        if debug_mode:
            with st.expander("🔍 AI Vision Debug Info", expanded=True):
                timings = ai_res.get("timings", {})
                if timings:
                    cols = st.columns(4)
                    cols[0].metric("⏱ Total", f"{timings.get('total', '?')}s")
                    cols[1].metric("📸 Render", f"{timings.get('render', '?')}s")
                    cols[2].metric("🤖 Batch Extract", f"{timings.get('batch_extract', timings.get('classify', '?'))}s")
                    cols[3].metric("📊 Validate", f"{timings.get('validate', '?')}s")

                flags = ai_res.get("flags", [])
                if flags:
                    st.warning(f"🏳️ Flags: {', '.join(flags)}")

                page_types = ai_res.get("page_types", {})
                if page_types:
                    st.text("Page classifications:")
                    for pg, ptype in page_types.items():
                        st.text(f"  Page {int(pg) + 1}: {ptype}")

                st.metric("🔑 Cache Key", ai_res.get("cache_key", "—")[:24] + "…")
                st.metric("📌 Version", ai_res.get("extractor_version", "—"))
        return

    # ── Legacy _meta dicts (fallback) ──
    metas: List[Dict[str, Any]] = []
    if smart:
        for stmt in result.get("statements", []):
            m = stmt.get("extracted_data", {}).get("_meta")
            if m:
                metas.append(m)
    else:
        m = result.get("extracted_data", {}).get("_meta")
        if m:
            metas.append(m)

    if not metas:
        return

    if any(m.get("cache_hit") for m in metas):
        st.info("💾 **Using cached extraction** — no API call needed.")

    if debug_mode:
        with st.expander("🔍 Debug Info", expanded=True):
            for i, m in enumerate(metas):
                if len(metas) > 1:
                    st.markdown(f"**Statement {i + 1}**")
                cols = st.columns(4)
                cols[0].metric("⏱ Elapsed", f"{m.get('elapsed_sec', '?')}s")
                cols[1].metric("🤖 Model", m.get("model_used", "?"))
                cols[2].metric(
                    "💾 Cache",
                    "HIT" if m.get("cache_hit") else "MISS",
                )
                cols[3].metric("📏 Chars Sent", f"{m.get('text_chars_sent', '?'):,}")


def ui_upload_financial_statement() -> None:
    """Full-page financial-upload interface (sidebar nav layout)."""
    st.markdown("## 📄 Upload Financial Statement")

    db = _get_db()
    manager = FinancialDataManager(db)
    user_id = st.session_state.get("user_id", 1)

    # ── Step 1: require a selected stock ──
    stock_id = st.session_state.get("current_stock_id")
    stock_symbol = st.session_state.get("current_stock_symbol", "")

    if not stock_id:
        st.error("❌ No stock profile selected!")
        st.info(
            "**To upload financial statements:**\n\n"
            "1. Go to **\"📈 Stock Profile\"** tab (left sidebar)\n"
            "2. Create a stock profile first (enter symbol & company name)\n"
            "3. Return here to upload PDFs\n\n"
            "⚠️ You must create a stock profile BEFORE uploading financial statements."
        )

        # Show existing stocks to re-select
        existing = db.execute_query(
            "SELECT id, symbol, company_name FROM analysis_stocks "
            "WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        if existing:
            st.subheader("Or select an existing stock:")
            options_map = {
                f"{s['symbol']} - {s['company_name']}": s for s in existing
            }
            selected = st.selectbox(
                "Your stocks:",
                list(options_map.keys()),
                key="upload_stock_picker",
            )
            if st.button("✅ Select This Stock", type="primary"):
                chosen = options_map[selected]
                st.session_state["current_stock_id"] = chosen["id"]
                st.session_state["current_stock_symbol"] = chosen["symbol"]
                st.rerun()
        else:
            if st.button("➡️ Create Stock Profile Now", type="primary"):
                st.session_state["fundamental_subtab"] = "📈 Stock Profile"
                st.rerun()

        st.stop()

    # ── Step 2: verify stock actually exists in database ──
    stock_exists = db.execute_query(
        "SELECT id FROM analysis_stocks WHERE id = ? AND user_id = ?",
        (stock_id, user_id),
    )
    if not stock_exists:
        st.error(f"❌ Stock profile #{stock_id} not found in database!")
        st.warning(
            "This usually happens after:\n"
            "• Page refresh (session lost)\n"
            "• Stock was deleted\n"
            "• Browser tab closed/reopened\n\n"
            "**Fix:** Re-select your stock below or create a new profile."
        )
        user_stocks = db.execute_query(
            "SELECT id, symbol, company_name FROM analysis_stocks "
            "WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        if user_stocks:
            st.subheader("Your Stocks")
            for stock in user_stocks:
                sid = stock["id"]
                sym = stock["symbol"]
                name = stock["company_name"]
                if st.button(f"{sym} - {name}", key=f"reselect_{sid}"):
                    st.session_state["current_stock_id"] = sid
                    st.session_state["current_stock_symbol"] = sym
                    st.rerun()
        else:
            if st.button("➕ Create New Stock Profile", type="primary"):
                st.session_state["fundamental_subtab"] = "📈 Stock Profile"
                st.rerun()
        st.stop()

    # ── Stock validated — proceed ──
    st.info(f"📊 Uploading for: **{stock_symbol}** (ID: {stock_id})")

    # -- Upload mode selector --
    upload_mode = st.radio(
        "Upload Mode",
        [
            "🧠 AI Vision (Auto-Detect All Statements)",
            "📝 Manual Entry (No AI)",
        ],
        horizontal=True,
        key="upload_mode_radio",
        help="AI Vision renders PDF pages as images and sends them to Gemini Vision — "
             "works with both text PDFs and scanned documents. "
             "Manual Entry lets you type values directly.",
    )
    is_smart = upload_mode.startswith("🧠")
    is_manual = upload_mode.startswith("📝")

    # -- Developer debug mode --
    debug_mode = st.checkbox(
        "🔍 Debug Mode",
        key="debug_mode_upload",
        help="Show extraction timing, model info, cache status, and text length.",
    )

    # ── Manual entry mode ──
    if is_manual:
        manual_type = st.selectbox(
            "Statement Type",
            list(STATEMENT_TYPES.keys()),
            format_func=lambda x: STATEMENT_TYPES[x],
            key="manual_stmt_type_main",
        )
        show_manual_entry_form(manual_type, stock_id, db, user_id)
        return

    # -- Upload section (AI modes) --
    col1, col2 = st.columns([2, 1])
    with col1:
        uploaded_file = st.file_uploader(
            "Upload PDF Financial Statement",
            type=["pdf"],
            key="financial_pdf_upload",
            help="Supports 10-K, 10-Q, Annual Reports, Earnings Releases",
        )
        if uploaded_file:
            file_size_mb = uploaded_file.size / (1024 * 1024)
            st.info(
                f"📄 **File:** {uploaded_file.name} | "
                f"**Size:** {file_size_mb:.2f} MB"
            )

    with col2:
        st.markdown(
            "**AI Vision:** renders each page as an image and sends it to "
            "Gemini Vision — works with both text and scanned PDFs."
        )
        statement_type = None

        fiscal_year = st.number_input(
            "Fiscal Year",
            min_value=2000,
            max_value=2030,
            value=2024,
            key="fiscal_year_upload",
        )

        period_mode = st.radio(
            "Financial Periods to Extract",
            ["both", "latest", "previous"],
            format_func={
                "both": "📊 Both Periods (e.g. 2025 & 2024)",
                "latest": "📅 Latest Period Only",
                "previous": "📅 Previous Period Only",
            }.get,
            horizontal=True,
            key="period_mode_upload",
            help="Most financial PDFs show 2 columns (current year & prior year). "
                 "Choose which period(s) to save.",
        )

    # API key: session (per-user DB) → env → manual entry
    api_key = _resolve_gemini_key(input_key="gemini_key_inline")

    # ── Quota status ──
    if api_key:
        try:
            _q_remaining = FinancialDataManager.get_user_quota_remaining(user_id)
            if _q_remaining <= 5:
                st.error(f"🚨 Quota almost exhausted! **{_q_remaining}** extractions left today")
            elif _q_remaining <= 15:
                st.warning(f"⚠️ **{_q_remaining}** extractions remaining today (resets midnight UTC)")
            else:
                st.success(f"✅ **{_q_remaining}** extractions available today")
            if _q_remaining <= 10:
                st.info("💡 **Tip:** Use Manual Entry for simple statements to save quota")
        except Exception:
            pass

    btn_label = "🧠 Extract with AI Vision"

    if uploaded_file and st.button(btn_label, type="primary", use_container_width=True):
        if not api_key:
            st.error("Gemini API key is required for extraction.")
            return

        # ── AI Vision upload: auto-detect all statements ──
        progress_bar = st.progress(0, text="Starting AI Vision extraction…")
        status_text = st.empty()

        def _progress(msg, pct):
            progress_bar.progress(min(pct, 1.0), text=msg)
            status_text.caption(msg)

        try:
            # Persist fiscal_year so downstream review screens can access it
            st.session_state["review_fiscal_year"] = int(fiscal_year)

            result = manager.upload_full_report(
                stock_id=stock_id,
                pdf_file=uploaded_file,
                fiscal_year=fiscal_year,
                user_id=user_id,
                progress_callback=_progress,
                api_key=api_key,
                period_mode=period_mode,
            )
            if result.get("success"):
                st.session_state["smart_extraction_result"] = result
                detected = result.get("detected_types", [])
                st.success(
                    f"✅ AI Vision detected **{len(detected)}** statement(s): "
                    f"{', '.join(STATEMENT_TYPES.get(t, t) for t in detected)}"
                )

                # Show AI vision page classifications
                ai_res = result.get("ai_result", {})
                page_types = ai_res.get("page_types", {})
                if page_types:
                    for pg_idx, pg_type in page_types.items():
                        if pg_type != "unknown":
                            st.info(
                                f"📄 Page {int(pg_idx) + 1} → "
                                f"**{pg_type.replace('_', ' ').title()}**"
                            )

                _show_extraction_debug(result, debug_mode, smart=True)
            else:
                err_msg = result.get("error", "Unknown error")
                st.error(f"❌ {err_msg}")
                if result.get("rate_limited"):
                    _show_rate_limit_help()
                if "empty or unreadable" in str(err_msg).lower():
                    st.info(
                        "**How to fix:**\n"
                        "- Ensure the PDF is not corrupted\n"
                        "- AI Vision works with both text and scanned PDFs\n"
                        "- Or switch to **📝 Manual Entry** mode"
                    )
        except Exception as e:
            st.error(f"❌ AI Vision extraction failed: {e}")

    # -- Show smart extraction results --
    if "smart_extraction_result" in st.session_state:
        _show_smart_extraction_review(
            st.session_state["smart_extraction_result"],
            stock_id, manager, user_id,
        )


# ── Smart extraction review (multi-statement) ─────────────────────────

def _show_smart_extraction_review(
    result: Dict[str, Any],
    stock_id: int,
    manager: FinancialDataManager,
    user_id: int,
) -> None:
    """Display results of auto-detect extraction — one expandable section
    per detected statement."""
    st.divider()
    st.subheader("📋 Smart Extraction Results")

    statements = result.get("statements", [])
    detected = result.get("detected_types", [])

    # Summary metrics
    cols = st.columns(4)
    cols[0].metric("Statements Found", len(detected))
    type_labels = [STATEMENT_TYPES.get(t, t) for t in detected]
    cols[1].metric("Types", ", ".join(type_labels) if type_labels else "—")
    avg_conf = (
        sum(s.get("extracted_data", {}).get("confidence_score", 0) for s in statements)
        / max(len(statements), 1)
    )
    cols[2].metric("Avg Confidence", f"{avg_conf:.0%}")
    total_items = sum(
        len(s.get("extracted_data", {}).get("line_items", [])) for s in statements
    )
    cols[3].metric("Total Line Items", total_items)

    # Per-statement expandable sections
    for idx, stmt_result in enumerate(statements):
        stype = stmt_result.get("statement_type", "unknown")
        label = STATEMENT_TYPES.get(stype, stype)
        validation = stmt_result.get("validation", {})
        extracted = stmt_result.get("extracted_data", {})
        stmt_id = stmt_result.get("statement_id")
        conf = extracted.get("confidence_score", 0)
        n_items = len(extracted.get("line_items", []))
        verified_icon = "✅" if validation.get("is_valid") and not validation.get("warnings") else "⚠️"

        with st.expander(
            f"{verified_icon} {label}  —  {n_items} items  |  "
            f"Confidence {conf:.0%}  |  ID {stmt_id}",
            expanded=(idx == 0),
        ):
            # Validation messages
            if validation.get("errors"):
                for e in validation["errors"]:
                    st.error(f"❌ {e}")
            if validation.get("warnings"):
                for w in validation["warnings"]:
                    st.warning(f"⚠️ {w}")
            if validation.get("is_valid") and not validation.get("warnings"):
                st.success("✅ All validation checks passed")

            st.progress(min(conf, 1.0), text=f"Confidence: {conf:.0%}")

            items = extracted.get("line_items", [])
            if items:
                df = pd.DataFrame(items)
                display_cols = ["code", "name", "amount", "is_total"]
                for col in display_cols:
                    if col not in df.columns:
                        df[col] = None
                df["standard_name"] = (
                    df["code"].map(FINANCIAL_LINE_ITEM_CODES).fillna("(custom)")
                )
                st.dataframe(
                    df[["code", "name", "standard_name", "amount", "is_total"]],
                    use_container_width=True,
                    height=min(35 * len(df) + 38, 500),
                )
            else:
                st.info("No line items extracted for this statement.")

            # Per-statement actions
            ac1, ac2 = st.columns(2)
            if not stmt_result.get("verified"):
                if ac1.button(
                    "✅ Mark Verified", key=f"smart_verify_{stype}_{idx}"
                ):
                    try:
                        manager.mark_statement_verified(stmt_id, user_id)
                        st.success(f"Marked {label} as verified!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error: {e}")

            if ac2.button("🗑️ Delete", key=f"smart_del_{stype}_{idx}"):
                try:
                    manager.delete_statement(stmt_id, user_id)
                    st.success(f"Deleted {label}")
                    # Remove from session
                    statements.pop(idx)
                    if not statements:
                        st.session_state.pop("smart_extraction_result", None)
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

    # Global actions
    st.divider()
    gc1, gc2 = st.columns(2)

    # ── Verify All button ──
    unverified = [
        s for s in statements
        if not s.get("verified") and s.get("statement_id")
    ]
    if unverified:
        if gc1.button(
            f"✅ Verify All ({len(unverified)} statements)",
            type="primary",
            key="verify_all_smart",
        ):
            ok, fail = 0, 0
            errors = []
            for s in unverified:
                sid = s.get("statement_id")
                try:
                    manager.mark_statement_verified(sid, user_id)
                    s["verified"] = True
                    ok += 1
                except Exception as exc:
                    fail += 1
                    errors.append(f"Statement #{sid}: {exc}")
                    import traceback
                    traceback.print_exc()
                    # The DB UPDATE may have committed even if
                    # audit-logging afterwards raised.  Mark the
                    # session entry so the button doesn't re-appear.
                    s["verified"] = True
            # Use st.toast so message survives the rerun
            if ok:
                st.toast(f"✅ Verified {ok} statement(s)", icon="✅")
            if fail:
                for err_msg in errors:
                    st.error(f"❌ {err_msg}")
            # Always rerun to refresh the UI state
            st.rerun()
    else:
        gc1.success("✅ All statements verified")

    if gc2.button("🗑️ Discard All Results", key="discard_smart_results"):
        st.session_state.pop("smart_extraction_result", None)
        st.rerun()


def show_extraction_review(
    result: Dict[str, Any],
    stock_id: int,
    manager: FinancialDataManager,
    user_id: int,
) -> None:
    """Show the extracted data for user review, editing, and approval."""
    st.divider()
    st.subheader("📋 Extraction Review")

    extracted_data = result.get("extracted_data", {})
    validation = result.get("validation", {})
    statement_id = result.get("statement_id")

    # -- validation summary --
    col1, col2, col3 = st.columns(3)
    with col1:
        status = "✅ Valid" if validation.get("is_valid") else "⚠️ Issues Found"
        st.metric("Validation", status)
    with col2:
        conf = validation.get("confidence", 0)
        st.metric("Confidence", f"{conf:.0%}")
    with col3:
        items = extracted_data.get("line_items", [])
        st.metric("Items Extracted", len(items))

    # Validation messages
    if validation.get("errors"):
        for e in validation["errors"]:
            st.error(f"❌ {e}")
    if validation.get("warnings"):
        for w in validation["warnings"]:
            st.warning(f"⚠️ {w}")

    # -- editable line items --
    if items:
        st.subheader("📝 Edit Extracted Items")
        st.caption("Review and correct any values before saving")

        for i, item in enumerate(items):
            code = item.get("code", "UNKNOWN")
            name = item.get("name", code)
            amount = item.get("amount", 0)
            std_name = FINANCIAL_LINE_ITEM_CODES.get(code, "(custom)")

            col_a, col_b, col_c = st.columns([2, 2, 1])
            with col_a:
                st.text(f"{code}: {std_name}")
            with col_b:
                new_amount = st.number_input(
                    f"Amount for {name}",
                    value=float(amount) if amount else 0.0,
                    key=f"edit_amount_{i}",
                    label_visibility="collapsed",
                )
            with col_c:
                is_total = st.checkbox(
                    "Total",
                    value=item.get("is_total", False),
                    key=f"edit_total_{i}",
                )

            # Track edits in session
            if new_amount != amount:
                items[i]["amount"] = new_amount
                items[i]["manually_edited"] = True
            items[i]["is_total"] = is_total

    # Balance check for balance sheets
    stmt_type = extracted_data.get("statement_type", "")
    if stmt_type == "balance" and items:
        ok, msg = check_balance_sheet_balance(items)
        if ok:
            st.success(f"✅ {msg}")
        else:
            st.warning(f"⚠️ {msg}")

    # -- actions --
    st.divider()
    col_save, col_approve, col_discard = st.columns(3)

    with col_save:
        if st.button(
            "💾 Save Changes",
            type="primary",
            use_container_width=True,
        ):
            if statement_id:
                try:
                    for item in items:
                        if item.get("manually_edited") and item.get("item_id"):
                            manager.update_line_item(
                                item["item_id"],
                                item["amount"],
                                user_id=user_id,
                                name=item.get("name"),
                            )
                    st.success("✅ Changes saved!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Save failed: {e}")
            else:
                st.warning("No statement ID — data was not persisted yet.")

    with col_approve:
        if st.button(
            "✅ Approve & Continue",
            use_container_width=True,
        ):
            if statement_id:
                try:
                    manager.mark_statement_verified(statement_id, user_id)
                    st.success("✅ Statement approved!")
                    st.session_state.pop("extraction_result", None)
                    st.session_state["active_tab"] = "Fundamental Analysis"
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Approval failed: {e}")
            else:
                st.warning("No statement ID to approve.")

    with col_discard:
        if st.button("🗑️ Discard", use_container_width=True):
            st.session_state.pop("extraction_result", None)
            st.rerun()


# ── upload & extract tab (embeddable) ─────────────────────────────────

def _render_upload_tab(
    stock_id: int, user_id: int, db: AnalysisDatabase
) -> None:
    api_key = _resolve_gemini_key(input_key="gemini_key_tab")

    # ── Quota status display ──
    if api_key:
        try:
            from stock_analysis.models.financial_data import FinancialDataManager
            _q_remaining = FinancialDataManager.get_user_quota_remaining(user_id)
            if _q_remaining <= 5:
                st.error(f"🚨 Quota almost exhausted! **{_q_remaining}** extractions left today")
            elif _q_remaining <= 15:
                st.warning(f"⚠️ **{_q_remaining}** extractions remaining today (resets at midnight UTC)")
            else:
                st.success(f"✅ **{_q_remaining}** extractions available today")
            if _q_remaining <= 10:
                st.info("💡 **Tip:** Use Manual Entry for simple statements to save quota")
        except Exception:
            pass
    else:
        st.warning(
            "⚠️ **No API key configured** — "
            "Go to **Settings → API Keys** to add one, or enter it above."
        )
    tab_mode = st.radio(
        "Upload Mode",
        ["🧠 AI Vision (Auto-Detect All)", "📝 Manual Entry"],
        horizontal=True,
        key="tab_upload_mode",
    )
    is_smart_tab = tab_mode.startswith("🧠")
    is_pipeline_tab = False  # removed — AI Vision handles everything
    is_manual_tab = tab_mode.startswith("📝")

    # -- Developer debug mode --
    debug_mode = st.checkbox(
        "🔍 Debug Mode",
        key="debug_mode_tab",
        help="Show extraction timing, model info, cache status, and text length.",
    )

    # ── Manual entry shortcut ──
    if is_manual_tab:
        manual_type = st.selectbox(
            "Statement type",
            list(STATEMENT_TYPES.keys()),
            format_func=lambda x: STATEMENT_TYPES[x],
            key="manual_stmt_type_tab",
        )
        show_manual_entry_form(manual_type, stock_id, db, user_id)
        return

    if is_pipeline_tab:
        pass  # Pipeline mode removed — AI Vision handles everything

    uploaded = st.file_uploader(
        "Upload PDF Financial Statement",
        type=["pdf"],
        key="pdf_upload",
        help="Supports 10-K, 10-Q, Annual Reports, Earnings Releases",
    )
    if uploaded:
        file_size_mb = uploaded.size / (1024 * 1024)
        st.info(
            f"📄 **File:** {uploaded.name} | "
            f"**Size:** {file_size_mb:.2f} MB"
        )

    if not is_smart_tab:
        statement_type = st.selectbox(
            "Statement type to extract",
            list(STATEMENT_TYPES.keys()),
            format_func=lambda x: STATEMENT_TYPES[x],
            key="stmt_type",
        )
    else:
        statement_type = None

    period_mode_tab = st.radio(
        "Financial Periods to Extract",
        ["both", "latest", "previous"],
        format_func={
            "both": "📊 Both Periods",
            "latest": "📅 Latest Only",
            "previous": "📅 Previous Only",
        }.get,
        horizontal=True,
        key="period_mode_tab",
        help="Most financial PDFs show 2 year-columns. Choose which to save.",
    )

    btn_label = "🧠 Extract with AI Vision"

    if uploaded and st.button(btn_label, type="primary"):
        if not api_key:
            st.error("Gemini API key is required for extraction.")
            return

        # ── AI Vision mode: all PDFs go through Gemini Vision ──
        manager = FinancialDataManager(db)
        progress_bar = st.progress(0, text="Starting AI Vision extraction…")

        def _prog(msg, pct):
            progress_bar.progress(min(pct, 1.0), text=msg)

        try:
            result = manager.upload_full_report(
                stock_id=stock_id,
                pdf_file=uploaded,
                user_id=user_id,
                progress_callback=_prog,
                api_key=api_key,
                period_mode=period_mode_tab,
            )
            if result.get("success"):
                st.session_state["smart_tab_result"] = result
                st.session_state["smart_tab_stock_id"] = stock_id
                detected = result.get("detected_types", [])
                st.success(
                    f"✅ AI Vision detected **{len(detected)}** statement(s): "
                    f"{', '.join(STATEMENT_TYPES.get(t, t) for t in detected)}"
                )

                # Show AI vision details
                ai_res = result.get("ai_result", {})
                page_types = ai_res.get("page_types", {})
                if page_types:
                    for pg_idx, pg_type in page_types.items():
                        if pg_type != "unknown":
                            st.info(f"📄 Page {int(pg_idx) + 1} → **{pg_type.replace('_', ' ').title()}**")

                _show_extraction_debug(result, debug_mode, smart=True)
            else:
                err_msg = result.get("error", "Unknown error")
                st.error(f"❌ {err_msg}")
                if result.get("rate_limited"):
                    _show_rate_limit_help()
                if "empty or unreadable" in str(err_msg).lower():
                    st.info(
                        "**How to fix:**\n"
                        "- Ensure the PDF is not corrupted\n"
                        "- AI Vision works with both text and scanned PDFs\n"
                        "- Or switch to **📝 Manual Entry** mode"
                    )
        except Exception as e:
            st.error(f"AI Vision extraction failed: {e}")

    # -- AI Vision results --
    if (
        "smart_tab_result" in st.session_state
        and st.session_state.get("smart_tab_stock_id") == stock_id
    ):
        manager = FinancialDataManager(db)
        _show_smart_extraction_review(
            st.session_state["smart_tab_result"],
            stock_id, manager, user_id,
        )


# ── Pipeline mode helpers ─────────────────────────────────────────────

def _run_pipeline_extraction(
    uploaded,
    stock_id: int,
    user_id: int,
    api_key: str,
    db: AnalysisDatabase,
    debug_mode: bool,
) -> None:
    """Execute the new tiered extraction pipeline and store result in
    session state."""
    import tempfile

    progress = st.progress(0, text="Starting pipeline…")
    try:
        # Save uploaded file to temp path
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(uploaded.read())
            pdf_path = tmp.name

        progress.progress(0.05, text="Classifying PDF…")
        pipeline = _get_pipeline(api_key)

        progress.progress(0.10, text="Running tiered extraction…")
        result = pipeline.run(
            pdf_path=pdf_path,
            user_id=user_id,
            stock_id=stock_id,
        )

        progress.progress(1.0, text="Done!")

        # Clean up temp file
        try:
            os.unlink(pdf_path)
        except OSError:
            pass

        # Store result for review
        st.session_state["pipeline_result"] = result
        st.session_state["pipeline_stock_id"] = stock_id

        status = result.get("status", "unknown")
        if status == "success":
            st.success("✅ Pipeline extraction complete — all checks passed!")
        elif status == "needs_review":
            st.warning("⚠️ Extraction complete — some items need review.")
        else:
            st.error("❌ Pipeline could not extract financial data.")

        if debug_mode:
            timings = result.get("timings", {})
            if timings:
                with st.expander("⏱️ Pipeline Timings"):
                    for step, secs in timings.items():
                        st.text(f"  {step:25s} {secs:>6.2f}s")
            flags = result.get("flags", [])
            if flags:
                with st.expander("🏳️ Flags"):
                    for f in flags:
                        st.text(f"  • {f}")

    except Exception as e:
        st.error(f"Pipeline extraction failed: {e}")
        import traceback
        if debug_mode:
            st.code(traceback.format_exc())


def _show_pipeline_review(result: Dict[str, Any]) -> None:
    """Display pipeline extraction results for user review."""
    st.divider()
    st.subheader("⚡ Pipeline Extraction Results")

    status = result.get("status", "unknown")
    upload_id = result.get("upload_id", "—")
    pdf_type = result.get("pdf_type", "—")

    # Summary metrics
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Status", status.replace("_", " ").title())
    c2.metric("Upload ID", upload_id)
    c3.metric("PDF Type", pdf_type)
    total_time = result.get("timings", {}).get("total", 0)
    c4.metric("Total Time", f"{total_time:.1f}s")

    statements = result.get("statements", {})

    _LABELS = {
        "income_statement": "Income Statement",
        "balance_sheet": "Balance Sheet",
        "cash_flow": "Cash Flow Statement",
    }

    for key, label in _LABELS.items():
        stmt = statements.get(key, {})
        periods = stmt.get("periods", [])
        if not periods:
            st.info(f"📄 **{label}** — not extracted")
            continue

        with st.expander(f"📊 {label} — {len(periods)} period(s)", expanded=True):
            for p_idx, period in enumerate(periods):
                period_date = period.get("period_end_date", "?")
                items = period.get("items", [])
                st.markdown(f"**Period ending:** {period_date}  •  **{len(items)} line items**")

                if items:
                    rows = []
                    for item in items:
                        rows.append({
                            "Code": item.get("line_item_key", ""),
                            "Label": item.get("label_raw", ""),
                            "Value": item.get("value", 0),
                        })
                    df = pd.DataFrame(rows)
                    st.dataframe(df, use_container_width=True,
                                 height=min(35 * len(df) + 38, 500))

    # Validations
    validations = result.get("validations", [])
    if validations:
        with st.expander(f"✅ Validations ({len(validations)} checks)"):
            for v in validations:
                icon = "✅" if v.get("pass_fail") == "pass" else "❌"
                st.text(
                    f"  {icon} [{v.get('statement_type')}/{v.get('rule_name')}] "
                    f"expected={v.get('expected_value')}  actual={v.get('actual_value')}  "
                    f"diff={v.get('diff')}  — {v.get('notes', '')}"
                )

    # Discard
    if st.button("🗑️ Discard Pipeline Results", key="discard_pipeline"):
        st.session_state.pop("pipeline_result", None)
        st.session_state.pop("pipeline_stock_id", None)
        st.rerun()


def _render_review_section(
    stock_id: int, user_id: int, db: AnalysisDatabase
) -> None:
    """Show extracted data for review / edit / save."""
    extracted = st.session_state["extracted_data"]
    validation = st.session_state["extraction_validation"]

    st.subheader("📝 Review Extracted Data")

    if validation.get("errors"):
        for e in validation["errors"]:
            st.error(f"❌ {e}")
    if validation.get("warnings"):
        for w in validation["warnings"]:
            st.warning(f"⚠️ {w}")
    if validation["is_valid"] and not validation.get("warnings"):
        st.success("✅ All validation checks passed")

    conf = validation.get("confidence", 0)
    st.progress(min(conf, 1.0), text=f"Confidence: {conf:.0%}")

    c1, c2, c3 = st.columns(3)
    c1.metric(
        "Statement Type",
        STATEMENT_TYPES.get(extracted.get("statement_type"), "—"),
    )
    c2.metric("Fiscal Year", extracted.get("fiscal_year", "—"))
    c3.metric("Period End", extracted.get("period_end_date", "—"))

    items = extracted.get("line_items", [])
    if not items:
        st.warning("No line items were extracted.")
        return

    st.subheader(f"Line Items ({len(items)})")

    df = pd.DataFrame(items)
    display_cols = ["code", "name", "amount", "is_total"]
    for col in display_cols:
        if col not in df.columns:
            df[col] = None

    df["standard_name"] = (
        df["code"].map(FINANCIAL_LINE_ITEM_CODES).fillna("(custom)")
    )

    edited_df = st.data_editor(
        df[["code", "name", "standard_name", "amount", "is_total"]],
        column_config={
            "code": st.column_config.TextColumn("Code", width="medium"),
            "name": st.column_config.TextColumn("Name", width="large"),
            "standard_name": st.column_config.TextColumn(
                "Std Name", disabled=True
            ),
            "amount": st.column_config.NumberColumn("Amount", format="%.2f"),
            "is_total": st.column_config.CheckboxColumn("Total?"),
        },
        num_rows="dynamic",
        use_container_width=True,
        key="line_items_editor",
    )

    if extracted.get("statement_type") == "balance":
        items_for_check = edited_df.to_dict("records")
        ok, msg = check_balance_sheet_balance(items_for_check)
        if ok:
            st.success(f"✅ {msg}")
        else:
            st.warning(f"⚠️ {msg}")

    st.divider()
    c_save, c_discard = st.columns(2)

    if c_save.button("💾 Save to Database", type="primary"):
        updated_items = edited_df.to_dict("records")
        extracted["line_items"] = updated_items

        # ── Guard: resolve fiscal_year from multiple sources ──
        _fy_resolved = (
            extracted.get("fiscal_year")
            or st.session_state.get("fiscal_year_upload")
            or st.session_state.get("review_fiscal_year")
        )
        if _fy_resolved:
            extracted["fiscal_year"] = int(_fy_resolved)
        if not extracted.get("period_end_date") and extracted.get("fiscal_year"):
            extracted["period_end_date"] = f"{extracted['fiscal_year']}-12-31"

        fdm = FinancialDataManager(db)
        try:
            stmt_id = fdm.save_extracted_data(
                stock_id,
                extracted,
                source_file=st.session_state.get("extraction_source_file"),
                user_id=user_id,
                fiscal_year_override=int(_fy_resolved) if _fy_resolved else None,
            )
            st.success(
                f"✅ Saved statement (id={stmt_id}) with "
                f"{len(updated_items)} line items"
            )
            for key in [
                "extracted_data",
                "extraction_validation",
                "extraction_source_file",
                "extraction_stock_id",
                "pdf_text_preview",
            ]:
                st.session_state.pop(key, None)
            st.rerun()
        except Exception as e:
            st.error(f"Save failed: {e}")

    if c_discard.button("🗑️ Discard"):
        for key in [
            "extracted_data",
            "extraction_validation",
            "extraction_source_file",
            "extraction_stock_id",
            "pdf_text_preview",
        ]:
            st.session_state.pop(key, None)
        st.rerun()

    if st.session_state.get("pdf_text_preview"):
        with st.expander("📝 Raw PDF Text Preview"):
            st.text(st.session_state["pdf_text_preview"])


# ── existing statements tab ───────────────────────────────────────────

def _fmt_amount(val) -> str:
    """Format a number with thousands separator; negatives in parentheses."""
    if val is None or val == "":
        return "—"
    try:
        num = float(val)
    except (ValueError, TypeError):
        return str(val)
    if num < 0:
        return f"({abs(num):,.0f})"
    return f"{num:,.0f}"


# Equity-component codes — should live in equity statements, not income/balance
_EQUITY_COMPONENT_CODES = {
    "SHARE_CAPITAL", "SHARE_PREMIUM", "STATUTORY_RESERVE",
    "VOLUNTARY_RESERVE", "GENERAL_RESERVE", "TREASURY_SHARES",
    "TREASURY_SHARES_EQUITY", "RETAINED_EARNINGS", "RETAINED_EARNINGS_EQUITY",
    "FOREIGN_CURRENCY_TRANSLATION", "FOREIGN_CURRENCY_TRANSLATION_RESERVE",
    "FAIR_VALUE_RESERVE", "OTHER_COMPREHENSIVE_INCOME",
    "GAIN_ON_SALE_OF_TREASURY_SHARES", "OPENING_EQUITY", "CLOSING_EQUITY",
    "TOTAL_EQUITY_AND_NCI", "NON_CONTROLLING_INTEREST",
}
_EQUITY_CODE_LOWER = {c.lower() for c in _EQUITY_COMPONENT_CODES}


def _auto_migrate_equity_items(
    stock_id: int,
    db: AnalysisDatabase,
    fdm: FinancialDataManager,
) -> None:
    """Move equity-component line items from income/balance/cashflow
    statements into proper equity statements.  Runs max once per
    session per stock to avoid repeated DB work."""
    cache_key = f"_eq_migrated_{stock_id}"
    if st.session_state.get(cache_key):
        return

    import time as _time

    stmts = fdm.get_statements(stock_id)
    if not stmts:
        st.session_state[cache_key] = True
        return

    # Find non-equity statements that have equity-component line items
    moved_count = 0
    for s in stmts:
        if s["statement_type"] == "equity":
            continue
        items = db.get_line_items(s["id"])
        if not items:
            continue

        equity_items = []
        keep_ids = []
        for item in items:
            code = (item.get("line_item_code") or "").upper()
            name = (item.get("line_item_name") or "").lower()
            is_equity = (
                code in _EQUITY_COMPONENT_CODES
                or any(ec in name for ec in [
                    "share capital", "share premium", "statutory reserve",
                    "voluntary reserve", "treasury shares",
                    "retained earnings", "gain on sale of treasury",
                    "foreign currency translation",
                ])
            )
            if is_equity:
                equity_items.append(item)
            else:
                keep_ids.append(item["id"])

        if not equity_items:
            continue

        # If ALL items are equity, delete the whole statement
        if not keep_ids:
            try:
                fdm.delete_statement(s["id"], user_id=1)
                moved_count += len(equity_items)
            except Exception:
                pass
            continue

        # Otherwise, remove only the equity items from this statement
        for eq_item in equity_items:
            try:
                db.execute_update(
                    "DELETE FROM financial_line_items WHERE id = ?",
                    (eq_item["id"],),
                )
                moved_count += 1
            except Exception:
                pass

    st.session_state[cache_key] = True


# ─────────────────────────────────────────────────────────────────────
# DATA ORGANIZER — AI-driven normalization of financial statements
# ─────────────────────────────────────────────────────────────────────

_NORMALIZATION_PROMPT = """\
You are a financial-statement normalization engine.
I will provide raw multi-year financial statements that may have inconsistent
line names, missing items, merged/split categories, or auditor-added lines.

Your task is to:
1. Detect the correct financial category of every line and map it to a
   standardized name (IFRS/GAAP style).
2. Normalize naming across all years so the same item always uses the
   same label.
3. Rebuild the statements into a clean, comparable structure with
   consistent rows and years as columns.
4. Handle new/deleted/reclassified items by aligning them to the closest
   standard category and flagging one-off or ambiguous items.
5. Preserve EVERY number exactly as-is — do NOT round, estimate, or drop
   any value.  If a line item is missing in one year, set its amount to 0.
6. Keep all subtotals and totals as separate rows with is_total=true.

INPUT DATA (JSON):
{input_json}

PRODUCE THIS EXACT JSON OUTPUT (no markdown, no explanation):
{{
  "mapping": [
    {{
      "raw_name": "original line item name from input",
      "standardized_code": "UPPER_SNAKE_CASE code",
      "standardized_name": "Clean Display Name",
      "category": "one of: revenue, expense, asset, liability, equity, cashflow_operating, cashflow_investing, cashflow_financing, other",
      "is_total": false
    }}
  ],
  "clean_statements": {{
    "income": [
      {{
        "statement_id": 42,
        "fiscal_year": 2024,
        "line_items": [
          {{
            "code": "REVENUE",
            "name": "Total Revenue",
            "amount": 12345678,
            "is_total": false,
            "order": 1
          }}
        ]
      }}
    ],
    "balance": [ ... ],
    "cashflow": [ ... ],
    "equity": [ ... ]
  }}
}}

RULES:
- clean_statements must have the SAME statement_id values as the input.
- Every line item from the input must appear in the output — never drop rows.
- Amounts must be copied EXACTLY — no rounding or modification.
- Use UPPER_SNAKE_CASE for standardized_code.
- Order items logically within each statement (revenue first, then COGS,
  gross profit, etc. for income; current assets first for balance sheet, etc.)
- Return ONLY the JSON object. No extra text, no markdown fences.
"""


def _call_gemini_for_normalization(
    api_key: str, payload: dict
) -> dict:
    """Send the normalization prompt to Gemini and return parsed JSON."""
    import json as _json

    from stock_analysis.extraction.ai_vision_extractor import (
        _get_genai,
        _call_gemini,
        _repair_json,
    )

    genai = _get_genai()
    client = genai.Client(api_key=api_key)

    input_json = _json.dumps(payload, indent=2, default=str)
    prompt = _NORMALIZATION_PROMPT.format(input_json=input_json)

    raw_text = _call_gemini(client, [prompt], max_tokens=16384, temperature=0.1)
    parsed = _repair_json(raw_text)

    if not isinstance(parsed, dict):
        raise ValueError(f"AI returned unexpected format: {type(parsed)}")

    if "clean_statements" not in parsed:
        raise ValueError("AI response missing 'clean_statements' key")

    return parsed


def _render_data_organizer(
    stock_id: int,
    user_id: int,
    db: AnalysisDatabase,
    fdm: FinancialDataManager,
    stmts: list,
) -> None:
    """Render the Data Organizer section with AI normalization."""

    st.markdown("---")
    st.subheader("🗂️ Data Organizer")
    st.caption(
        "Use AI to normalize all financial statements — consistent line-item "
        "names, logical ordering, and clean cross-year presentation."
    )

    api_key = _resolve_gemini_key(input_key="gemini_key_organizer")

    # ── Backup status ─────────────────────────────────────────────
    has_backup = f"organizer_backup_{stock_id}" in st.session_state
    has_result = f"organizer_result_{stock_id}" in st.session_state

    col_org, col_restore = st.columns([2, 1])

    # ── Run Data Organizer button ─────────────────────────────────
    with col_org:
        if st.button(
            "🗂️ Data Organizer",
            type="primary",
            use_container_width=True,
            help="Send all statements to AI for normalization",
            key="btn_data_organizer",
        ):
            if not api_key:
                st.error("🔑 Gemini API key required. Enter it above.")
            elif not stmts:
                st.warning("No statements to organize.")
            else:
                # 1. Backup current data
                backup_json, n_items = fdm.backup_line_items(stock_id, user_id)
                st.session_state[f"organizer_backup_{stock_id}"] = backup_json

                # 2. Build payload
                payload = fdm.build_normalization_payload(stock_id)

                # 3. Call AI
                with st.spinner("🧠 AI is normalizing your financial statements…"):
                    try:
                        result = _call_gemini_for_normalization(api_key, payload)
                        st.session_state[f"organizer_result_{stock_id}"] = result
                        st.toast("✅ Normalization complete! Review below.", icon="✅")
                        st.rerun()
                    except Exception as exc:
                        st.error(f"❌ Normalization failed: {exc}")
                        import traceback
                        traceback.print_exc()

    # ── Restore original data button ──────────────────────────────
    with col_restore:
        if has_backup:
            if st.button(
                "↩️ Restore Original Data",
                use_container_width=True,
                help="Revert to the data before normalization",
                key="btn_restore_organizer",
            ):
                backup_json = st.session_state[f"organizer_backup_{stock_id}"]
                try:
                    n_restored = fdm.restore_line_items_from_backup(
                        stock_id, backup_json, user_id
                    )
                    st.session_state.pop(f"organizer_result_{stock_id}", None)
                    st.session_state.pop(f"organizer_backup_{stock_id}", None)
                    st.toast(
                        f"↩️ Restored {n_restored} original line items.",
                        icon="↩️",
                    )
                    st.rerun()
                except Exception as exc:
                    st.error(f"❌ Restore failed: {exc}")
        else:
            st.info("No backup available yet. Run the organizer first.")

    # ── Show normalization result for review ──────────────────────
    if has_result:
        result = st.session_state[f"organizer_result_{stock_id}"]
        mapping = result.get("mapping", [])
        clean = result.get("clean_statements", {})

        # --- Mapping table ---
        if mapping:
            with st.expander("📋 Name Mapping (raw → standardized)", expanded=False):
                map_df = pd.DataFrame(mapping)
                display_cols = [c for c in ["raw_name", "standardized_name", "category", "is_total"] if c in map_df.columns]
                if display_cols:
                    st.dataframe(map_df[display_cols], use_container_width=True, hide_index=True)

        # --- Preview normalized statements ---
        type_order = ["income", "balance", "cashflow", "equity"]
        for stype in type_order:
            periods = clean.get(stype, [])
            if not periods:
                continue
            type_label = STATEMENT_TYPES.get(stype, stype)
            periods.sort(key=lambda p: p.get("fiscal_year", 0))
            years = [str(p.get("fiscal_year", "?")) for p in periods]

            all_codes = []
            code_names = {}
            code_totals = {}
            items_by_year = {}
            for p in periods:
                yr = str(p.get("fiscal_year", "?"))
                yr_items = {}
                for it in p.get("line_items", []):
                    code = it.get("code", "UNKNOWN")
                    if code not in code_names:
                        all_codes.append(code)
                        code_names[code] = it.get("name", code)
                        code_totals[code] = it.get("is_total", False)
                    yr_items[code] = it.get("amount", 0)
                items_by_year[yr] = yr_items

            if not all_codes:
                continue

            st.markdown(f"#### {type_label} (Normalized Preview)")
            rows = []
            for code in all_codes:
                row = {"Line Item": code_names.get(code, code)}
                for yr in years:
                    val = items_by_year.get(yr, {}).get(code)
                    row[yr] = _fmt_amount(val) if val is not None else "—"
                rows.append(row)
            preview_df = pd.DataFrame(rows)
            st.dataframe(preview_df, use_container_width=True, hide_index=True,
                         height=min(40 + len(all_codes) * 35, 600))

        # --- Save / Discard buttons ---
        st.markdown("---")
        sc1, sc2 = st.columns(2)
        with sc1:
            if st.button(
                "💾 Save Normalized Data",
                type="primary",
                use_container_width=True,
                key="btn_save_normalized",
            ):
                try:
                    n_written = fdm.apply_normalization_result(
                        stock_id, clean, user_id
                    )
                    st.session_state.pop(f"organizer_result_{stock_id}", None)
                    st.toast(
                        f"💾 Saved {n_written} normalized line items.",
                        icon="💾",
                    )
                    st.rerun()
                except Exception as exc:
                    st.error(f"❌ Save failed: {exc}")
        with sc2:
            if st.button(
                "🗑️ Discard Normalization",
                use_container_width=True,
                key="btn_discard_normalized",
            ):
                st.session_state.pop(f"organizer_result_{stock_id}", None)
                st.toast("Normalization discarded.", icon="🗑️")
                st.rerun()


def _render_existing_tab(
    stock_id: int, user_id: int, db: AnalysisDatabase
) -> None:
    fdm = FinancialDataManager(db)

    # ── Auto-cleanup: move misclassified equity items ─────────────
    # Earlier AI uploads may have saved equity-component line items
    # (Share Capital, Statutory Reserve …) under "income" or "balance"
    # types.  Detect and migrate them to proper "equity" statements.
    _auto_migrate_equity_items(stock_id, db, fdm)

    stmts = fdm.get_statements(stock_id)

    if not stmts:
        st.info("No financial statements saved for this stock yet.")
        return

    # ── group statements by type ──────────────────────────────────────
    # { "income": [ {stmt_dict, ...}, ... ], "balance": [...], ... }
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for s in stmts:
        grouped.setdefault(s["statement_type"], []).append(s)

    # Canonical display order
    type_order = ["income", "balance", "cashflow", "equity"]
    ordered_types = [t for t in type_order if t in grouped]
    # Append any unexpected types that don't appear in type_order
    ordered_types += [t for t in grouped if t not in type_order]

    for stype in ordered_types:
        type_stmts = grouped[stype]
        type_label = STATEMENT_TYPES.get(stype, stype)

        # Sort periods oldest → newest (left → right)
        type_stmts.sort(key=lambda s: s.get("period_end_date", ""))
        years = [str(s["fiscal_year"]) for s in type_stmts]

        # ── build combined table: line items × years ──────────────
        # Collect line items from each statement, preserving order
        items_by_year: Dict[str, pd.DataFrame] = {}
        all_codes_ordered: List[str] = []
        code_to_display: Dict[str, str] = {}
        code_is_total: Dict[str, bool] = {}

        for s in type_stmts:
            yr = str(s["fiscal_year"])
            df = fdm.get_line_items_df(s["id"])
            items_by_year[yr] = df
            if not df.empty:
                for _, row in df.iterrows():
                    code = row.get("line_item_code") or row.get("line_item_name", "")
                    if code and code not in code_to_display:
                        all_codes_ordered.append(code)
                        code_to_display[code] = (
                            row.get("display_name")
                            or FINANCIAL_LINE_ITEM_CODES.get(code, code)
                        )
                        code_is_total[code] = bool(row.get("is_total"))

        if not all_codes_ordered:
            st.info(f"No line items for {type_label}.")
            continue

        # Build display DataFrame
        table_data: List[Dict[str, Any]] = []
        for code in all_codes_ordered:
            row_dict: Dict[str, Any] = {
                "Line Item": code_to_display.get(code, code),
            }
            for yr in years:
                df = items_by_year.get(yr, pd.DataFrame())
                if df.empty:
                    row_dict[yr] = "—"
                else:
                    mask = pd.Series(False, index=df.index)
                    if "line_item_code" in df.columns:
                        mask = mask | (df["line_item_code"] == code)
                    if "line_item_name" in df.columns:
                        mask = mask | (df["line_item_name"] == code)
                    match = df[mask]
                    if not match.empty:
                        row_dict[yr] = _fmt_amount(match.iloc[0]["amount"])
                    else:
                        row_dict[yr] = "—"
            table_data.append(row_dict)

        display_df = pd.DataFrame(table_data)

        # ── Title + period range ──────────────────────────────────
        period_range = (
            f"year ended {type_stmts[-1].get('period_end_date', years[-1])}"
            if type_stmts
            else ""
        )
        st.markdown(
            f"### {type_label} "
            f"<span style='font-size:0.75em;color:gray;'>— {period_range}</span>",
            unsafe_allow_html=True,
        )

        # ── Style: bold total rows, right-align numbers ───────────
        def _style_rows(row_series):
            """Return list of CSS styles per cell for the row."""
            label = row_series.get("Line Item", "")
            # Check if this line item is a total row
            code_match = [
                c for c, d in code_to_display.items() if d == label
            ]
            is_total = (
                code_is_total.get(code_match[0], False) if code_match else False
            )
            n = len(row_series)
            if is_total:
                return ["font-weight:bold; border-top:1px solid #888;"] * n
            return [""] * n

        styled = (
            display_df.style
            .apply(_style_rows, axis=1)
            .set_properties(
                subset=years,
                **{"text-align": "right"},
            )
            .set_properties(
                subset=["Line Item"],
                **{"text-align": "left", "min-width": "220px"},
            )
            .hide(axis="index")
        )

        st.dataframe(
            styled,
            use_container_width=True,
            hide_index=True,
            height=min(40 + len(all_codes_ordered) * 35, 800),
        )

        # ── Action buttons per year (verify / delete) ─────────────
        btn_cols = st.columns(len(type_stmts))
        for idx, s in enumerate(type_stmts):
            yr = str(s["fiscal_year"])
            verified = s.get("verified_by_user")
            with btn_cols[idx]:
                st.caption(f"**{yr}**")
                if not verified:
                    if st.button(
                        "✅ Verify",
                        key=f"verify_{s['id']}",
                    ):
                        fdm.mark_statement_verified(s["id"], user_id)
                        st.success(f"Verified {yr}")
                        st.rerun()
                else:
                    st.markdown("✅ Verified")

                if st.button(
                    "🗑️ Delete",
                    key=f"delstmt_{s['id']}",
                ):
                    st.session_state[f"confirm_del_stmt_{s['id']}"] = True

                if st.session_state.get(f"confirm_del_stmt_{s['id']}"):
                    st.warning(f"Delete {yr}?")
                    yc1, yc2 = st.columns(2)
                    if yc1.button("Yes", key=f"yes_delstmt_{s['id']}"):
                        fdm.delete_statement(s["id"], user_id)
                        del st.session_state[f"confirm_del_stmt_{s['id']}"]
                        st.success("Deleted")
                        st.rerun()
                    if yc2.button("No", key=f"no_delstmt_{s['id']}"):
                        del st.session_state[f"confirm_del_stmt_{s['id']}"]
                        st.rerun()

        st.divider()

    # ══════════════════════════════════════════════════════════════════
    # DATA ORGANIZER — AI-driven normalization
    # ══════════════════════════════════════════════════════════════════
    _render_data_organizer(stock_id, user_id, db, fdm, stmts)
