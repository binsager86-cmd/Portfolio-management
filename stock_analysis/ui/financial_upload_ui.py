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
        import sqlite3
        db_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "portfolio.db",
        )
        conn = sqlite3.connect(db_path)
        conn.execute(
            "UPDATE users SET gemini_api_key = ? WHERE id = ?",
            (api_key, user_id),
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

    For smart (multi-statement) results the meta lives inside each
    statement's ``extracted_data["_meta"]``.  For single-statement
    results it lives directly in ``result["extracted_data"]["_meta"]``.
    """
    # Collect _meta dicts
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

    # ── Cache-hit banner (always shown) ──
    if any(m.get("cache_hit") for m in metas):
        st.info("💾 **Using cached extraction** — no API call needed.")

    # ── Debug panel (only when toggled on) ──
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
            "🧠 Smart Upload (Auto-Detect All Statements)",
            "📄 Single Statement",
            "📝 Manual Entry (No AI)",
        ],
        horizontal=True,
        key="upload_mode_radio",
        help="Smart Upload uses AI to detect all statements. "
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
        if not is_smart:
            statement_type = st.selectbox(
                "Statement Type",
                list(STATEMENT_TYPES.keys()),
                format_func=lambda x: STATEMENT_TYPES[x],
                key="statement_type_upload",
            )
        else:
            st.markdown(
                "**Auto-Detect:** AI will identify Income Statement, "
                "Balance Sheet & Cash Flow from the full report."
            )
            statement_type = None

        fiscal_year = st.number_input(
            "Fiscal Year",
            min_value=2000,
            max_value=2030,
            value=2024,
            key="fiscal_year_upload",
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

    btn_label = "🧠 Smart Extract All Statements" if is_smart else "🤖 Extract with AI"

    if uploaded_file and st.button(btn_label, type="primary", use_container_width=True):
        if not api_key:
            st.error("Gemini API key is required for extraction.")
            return

        if is_smart:
            # ── Smart upload: auto-detect all statements ──
            progress_bar = st.progress(0, text="Starting…")
            status_text = st.empty()

            def _progress(msg, pct):
                progress_bar.progress(min(pct, 1.0), text=msg)
                status_text.caption(msg)

            try:
                result = manager.upload_full_report(
                    stock_id=stock_id,
                    pdf_file=uploaded_file,
                    fiscal_year=fiscal_year,
                    user_id=user_id,
                    progress_callback=_progress,
                    api_key=api_key,
                )
                if result.get("success"):
                    st.session_state["smart_extraction_result"] = result
                    detected = result.get("detected_types", [])
                    st.success(
                        f"✅ Auto-detected **{len(detected)}** statement(s): "
                        f"{', '.join(STATEMENT_TYPES.get(t, t) for t in detected)}"
                    )
                    # Show pages used per statement
                    for _s_res in result.get("statements", []):
                        _s_pages = _s_res.get("extracted_data", {}).get("pages_used", [])
                        if _s_pages:
                            _s_label = STATEMENT_TYPES.get(
                                _s_res.get("statement_type", ""),
                                _s_res.get("statement_type", ""),
                            )
                            st.info(
                                f"📄 **{_s_label}** found on page(s): "
                                f"{', '.join(map(str, _s_pages))}"
                            )
                    # ── cache / debug info ──
                    _show_extraction_debug(result, debug_mode, smart=True)
                else:
                    err_msg = result.get("error", "Unknown error")
                    st.error(f"❌ {err_msg}")
                    if result.get("rate_limited"):
                        _show_rate_limit_help()
                    pv = result.get("pdf_validation", {})
                    if pv.get("reason") == "scanned":
                        st.info(
                            "💡 **Tip:** Install `pytesseract` and `Pillow` "
                            "for automatic OCR, or use **📝 Manual Entry** mode."
                        )
                    elif "empty or unreadable" in err_msg:
                        st.info(
                            "**How to fix:**\n"
                            "- This PDF might be a scanned document (image-based)\n"
                            "- Try uploading a text-based PDF instead\n"
                            "- Or switch to **📝 Manual Entry** mode"
                        )
            except Exception as e:
                st.error(f"❌ Smart extraction failed: {e}")
        else:
            # ── Single statement upload (original flow) ──
            with st.spinner("Processing PDF and extracting financial data..."):
                try:
                    result = manager.upload_financial_statement(
                        stock_id=stock_id,
                        pdf_file=uploaded_file,
                        statement_type=statement_type,
                        fiscal_year=fiscal_year,
                        user_id=user_id,
                        api_key=api_key,
                    )
                    if result.get("success"):
                        st.session_state["extraction_result"] = result
                        _pages = result.get("pages_used", [])
                        if _pages:
                            st.success(
                                f"✅ Extraction complete! "
                                f"Data found on page(s): {', '.join(map(str, _pages))}"
                            )
                        else:
                            st.success("✅ Extraction complete! Review below.")
                        # ── cache / debug info ──
                        _show_extraction_debug(result, debug_mode, smart=False)
                    else:
                        err_msg = result.get("error", "Unknown error")
                        st.error(f"❌ {err_msg}")
                        if result.get("rate_limited"):
                            _show_rate_limit_help()
                        pv = result.get("pdf_validation", {})
                        if pv.get("reason") == "scanned":
                            st.info(
                                "💡 **Tip:** Install `pytesseract` and `Pillow` "
                                "for automatic OCR, or use **📝 Manual Entry** mode."
                            )
                        elif "empty or unreadable" in err_msg:
                            st.info(
                                "**How to fix:**\n"
                                "- This PDF might be a scanned document (image-based)\n"
                                "- Try uploading a text-based PDF instead\n"
                                "- Or switch to **📝 Manual Entry** mode"
                            )
                except Exception as e:
                    st.error(f"❌ Extraction failed: {e}")

    # -- Show smart extraction results --
    if "smart_extraction_result" in st.session_state:
        _show_smart_extraction_review(
            st.session_state["smart_extraction_result"],
            stock_id, manager, user_id,
        )

    # -- Show single extraction review --
    if "extraction_result" in st.session_state:
        show_extraction_review(
            st.session_state["extraction_result"], stock_id, manager, user_id
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

    # Global discard
    st.divider()
    if st.button("🗑️ Discard All Results", key="discard_smart_results"):
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
        ["🧠 Smart (Auto-Detect All)", "📄 Single Statement", "📝 Manual Entry"],
        horizontal=True,
        key="tab_upload_mode",
    )
    is_smart_tab = tab_mode.startswith("🧠")
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

    btn_label = "🧠 Smart Extract All" if is_smart_tab else "🚀 Extract with Gemini AI"

    if uploaded and st.button(btn_label, type="primary"):
        if not api_key:
            st.error("Gemini API key is required for extraction.")
            return

        if is_smart_tab:
            # ── Smart mode: auto-detect all statements ──
            manager = FinancialDataManager(db)
            progress_bar = st.progress(0, text="Starting…")

            def _prog(msg, pct):
                progress_bar.progress(min(pct, 1.0), text=msg)

            try:
                result = manager.upload_full_report(
                    stock_id=stock_id,
                    pdf_file=uploaded,
                    user_id=user_id,
                    progress_callback=_prog,
                    api_key=api_key,
                )
                if result.get("success"):
                    st.session_state["smart_tab_result"] = result
                    st.session_state["smart_tab_stock_id"] = stock_id
                    detected = result.get("detected_types", [])
                    st.success(
                        f"✅ Detected **{len(detected)}** statement(s): "
                        f"{', '.join(STATEMENT_TYPES.get(t, t) for t in detected)}"
                    )
                    # Show pages used per statement
                    for _s_res in result.get("statements", []):
                        _s_pages = _s_res.get("extracted_data", {}).get("pages_used", [])
                        if _s_pages:
                            _s_label = STATEMENT_TYPES.get(
                                _s_res.get("statement_type", ""),
                                _s_res.get("statement_type", ""),
                            )
                            st.info(
                                f"📄 **{_s_label}** found on page(s): "
                                f"{', '.join(map(str, _s_pages))}"
                            )
                    _show_extraction_debug(result, debug_mode, smart=True)
                else:
                    err_msg = result.get("error", "Unknown error")
                    st.error(f"❌ {err_msg}")
                    if result.get("rate_limited"):
                        _show_rate_limit_help()
                    pv = result.get("pdf_validation", {})
                    if pv.get("reason") == "scanned":
                        st.info(
                            "💡 **Tip:** Install `pytesseract` and `Pillow` "
                            "for automatic OCR, or use **📝 Manual Entry** mode."
                        )
                    elif "empty or unreadable" in err_msg:
                        st.info(
                            "**How to fix:**\n"
                            "- This PDF might be a scanned document (image-based)\n"
                            "- Try uploading a text-based PDF instead\n"
                            "- Or switch to **📝 Manual Entry** mode"
                        )
            except Exception as e:
                st.error(f"Smart extraction failed: {e}")
        else:
            # ── Single statement mode (original) ──
            with st.spinner("Processing PDF & extracting data…"):
                try:
                    pdf_path = PDFProcessor.save_upload(uploaded)

                    # ── PDF validation ──
                    extractor = FinancialPDFExtractor(api_key=api_key)
                    pdf_check = extractor.validate_pdf(pdf_path)

                    if not pdf_check["is_valid"]:
                        if pdf_check.get("reason") == "scanned":
                            st.warning(
                                "⚠️ Scanned PDF detected — attempting OCR extraction…"
                            )
                            try:
                                pdf_text = extractor.extract_text_with_ocr(pdf_path)
                            except RuntimeError as ocr_err:
                                st.error(f"❌ {ocr_err}")
                                try:
                                    os.unlink(pdf_path)
                                except OSError:
                                    pass
                                return
                            if not pdf_text.strip():
                                st.error(
                                    "❌ OCR ran but extracted no usable text. "
                                    "The document may be too low quality. "
                                    "Try **📝 Manual Entry** mode instead."
                                )
                                try:
                                    os.unlink(pdf_path)
                                except OSError:
                                    pass
                                return
                            st.info("✅ OCR text extracted — proceeding with AI…")
                        else:
                            st.error(
                                f"❌ {pdf_check.get('suggestion', 'PDF validation failed.')}"
                            )
                            try:
                                os.unlink(pdf_path)
                            except OSError:
                                pass
                            return
                    else:
                        page_map = PDFProcessor.find_statement_pages(pdf_path)
                        pages = page_map.get(statement_type, [])
                        if pages:
                            st.info(
                                f"Detected {STATEMENT_TYPES[statement_type]} on "
                                f"page(s): {pages}"
                            )
                        pdf_text = PDFProcessor.extract_text(pdf_path, max_pages=50)

                    st.session_state["pdf_text_preview"] = pdf_text[:2000]

                    extracted = extractor.extract_financial_data(
                        pdf_text, statement_type
                    )

                    validation = extractor.validate_extraction(extracted)

                    st.session_state["extracted_data"] = extracted
                    st.session_state["extraction_validation"] = validation
                    st.session_state["extraction_source_file"] = uploaded.name
                    st.session_state["extraction_stock_id"] = stock_id

                    st.success("✅ Extraction complete!")

                    # ── cache / debug info ──
                    _show_extraction_debug(
                        {"extracted_data": extracted}, debug_mode, smart=False
                    )

                    try:
                        os.unlink(pdf_path)
                    except OSError:
                        pass
                except Exception as e:
                    err_lower = str(e).lower()
                    st.error(f"Extraction failed: {e}")
                    if any(kw in err_lower for kw in ("rate", "429", "quota", "limit")):
                        _show_rate_limit_help()
                    return

    # -- Smart mode results --
    if (
        "smart_tab_result" in st.session_state
        and st.session_state.get("smart_tab_stock_id") == stock_id
    ):
        manager = FinancialDataManager(db)
        _show_smart_extraction_review(
            st.session_state["smart_tab_result"],
            stock_id, manager, user_id,
        )

    # -- Single mode results --
    if (
        "extracted_data" in st.session_state
        and st.session_state.get("extraction_stock_id") == stock_id
    ):
        _render_review_section(stock_id, user_id, db)


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

        fdm = FinancialDataManager(db)
        try:
            stmt_id = fdm.save_extracted_data(
                stock_id,
                extracted,
                source_file=st.session_state.get("extraction_source_file"),
                user_id=user_id,
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

def _render_existing_tab(
    stock_id: int, user_id: int, db: AnalysisDatabase
) -> None:
    fdm = FinancialDataManager(db)
    stmts = fdm.get_statements(stock_id)

    if not stmts:
        st.info("No financial statements saved for this stock yet.")
        return

    st.write(f"**{len(stmts)}** statement(s) on file")

    for s in stmts:
        label = (
            f"{STATEMENT_TYPES.get(s['statement_type'], s['statement_type'])} — "
            f"FY{s['fiscal_year']} — {s['period_end_date']}"
        )
        verified = "✅" if s.get("verified_by_user") else "⏳"
        with st.expander(f"{verified} {label}", expanded=False):
            c1, c2, c3 = st.columns(3)
            c1.metric("Source", s.get("source_file") or "—")
            c2.metric("Extracted By", s.get("extracted_by") or "—")
            conf = s.get("confidence_score")
            c3.metric("Confidence", f"{conf:.0%}" if conf else "—")

            df = fdm.get_line_items_df(s["id"])
            if not df.empty:
                st.dataframe(
                    df[
                        [
                            "line_item_code",
                            "display_name",
                            "amount",
                            "is_total",
                            "manually_edited",
                        ]
                    ],
                    use_container_width=True,
                )

            ac1, ac2, ac3 = st.columns(3)
            if not s.get("verified_by_user"):
                if ac1.button("✅ Mark Verified", key=f"verify_{s['id']}"):
                    fdm.mark_statement_verified(s["id"], user_id)
                    st.success("Marked as verified")
                    st.rerun()

            if ac2.button("🗑️ Delete Statement", key=f"delstmt_{s['id']}"):
                st.session_state[f"confirm_del_stmt_{s['id']}"] = True

            if st.session_state.get(f"confirm_del_stmt_{s['id']}"):
                st.warning("Delete this statement and all its line items?")
                yc1, yc2 = st.columns(2)
                if yc1.button("Yes", key=f"yes_delstmt_{s['id']}"):
                    fdm.delete_statement(s["id"], user_id)
                    del st.session_state[f"confirm_del_stmt_{s['id']}"]
                    st.success("Deleted")
                    st.rerun()
                if yc2.button("No", key=f"no_delstmt_{s['id']}"):
                    del st.session_state[f"confirm_del_stmt_{s['id']}"]
                    st.rerun()
