"""
Stock Analysis Module — Main Streamlit Application
===================================================
Run standalone:  streamlit run stock_analysis/app.py
Or import render_stock_analysis() into the main portfolio UI.
"""

import time
import streamlit as st
import pandas as pd
import sys
import os

# Ensure repo root is on sys.path so `stock_analysis.*` imports work
# when running this file directly with `streamlit run stock_analysis/app.py`
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import os

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.models.financial_data import FinancialDataManager
from stock_analysis.models.metrics_calculator import MetricsCalculator
from stock_analysis.ui.stock_creation_ui import (
    render_stock_creation_page,
    ui_stock_analysis_create,
)
from stock_analysis.ui.financial_upload_ui import (
    render_financial_upload_page,
    ui_upload_financial_statement,
)
from stock_analysis.ui.fundamental_analysis_ui import render_fundamental_analysis_page
from stock_analysis.ui.valuation_ui import render_valuation_page
from stock_analysis.config import STATEMENT_TYPES


# ── helpers ────────────────────────────────────────────────────────────

def _get_db() -> AnalysisDatabase:
    if "analysis_db" not in st.session_state:
        st.session_state["analysis_db"] = AnalysisDatabase()
    return st.session_state["analysis_db"]


# ── public API (for embedding in another Streamlit app) ────────────────

def render_stock_analysis(user_id: int = 1) -> None:
    """Render the full Stock Analysis module inside an existing page."""
    tab_profiles, tab_upload, tab_analysis, tab_valuation, tab_debug = st.tabs(
        [
            "📊 Stock Profiles",
            "📄 Upload Financials",
            "📈 Fundamental Analysis",
            "💰 Valuation Models",
            "🔧 API Debug",
        ]
    )

    with tab_profiles:
        render_stock_creation_page(user_id)
    with tab_upload:
        render_financial_upload_page(user_id)
    with tab_analysis:
        render_fundamental_analysis_page(user_id)
    with tab_valuation:
        render_valuation_page(user_id)
    with tab_debug:
        _render_gemini_debug_tab()


# ── Gemini API debug tab ──────────────────────────────────────────────

def _render_gemini_debug_tab() -> None:
    """Interactive Gemini API connection tester."""
    st.markdown("## 🔍 Gemini API Debugger")

    # SDK version
    try:
        import importlib.metadata as _meta

        sdk_ver = _meta.version("google-genai")
    except Exception:
        sdk_ver = "unknown"
    st.info(f"📦 **google-genai** installed version: **{sdk_ver}**")

    # API key — prefer session, then env
    default_key = st.session_state.get(
        "gemini_api_key", os.getenv("GEMINI_API_KEY", "")
    )
    api_key = st.text_input(
        "Gemini API Key",
        type="password",
        value=default_key,
        help="Get a free key at https://aistudio.google.com/app/apikey",
        key="debug_gemini_key",
    )

    if st.button("🔍 Test API Connection", type="primary"):
        if not api_key:
            st.error("Please enter an API key first.")
            return

        with st.spinner("Connecting to Gemini API…"):
            try:
                from stock_analysis.models.financial_extractor import (
                    FinancialPDFExtractor,
                )

                available = FinancialPDFExtractor.list_available_models(api_key)

                if available:
                    st.success(
                        f"✅ API connection successful — "
                        f"**{len(available)}** models available"
                    )
                    flash = [m for m in available if "flash" in m.lower()]
                    pro = [m for m in available if "pro" in m.lower()]

                    c1, c2 = st.columns(2)
                    with c1:
                        st.markdown("**⚡ Flash models (free tier)**")
                        for m in flash:
                            st.code(m, language=None)
                        if not flash:
                            st.warning("No flash models found")
                    with c2:
                        st.markdown("**🧠 Pro models (paid tier)**")
                        for m in pro:
                            st.code(m, language=None)
                        if not pro:
                            st.caption("None listed")

                    with st.expander("All models", expanded=False):
                        for m in available:
                            st.text(m)
                else:
                    st.warning(
                        "⚠️ Connected but no generateContent models found."
                    )
            except Exception as e:
                st.error(f"❌ API connection failed: {e}")
                st.info(
                    "**Common fixes:**\n"
                    "1. Get a valid key at "
                    "https://aistudio.google.com/app/apikey\n"
                    "2. Upgrade library: "
                    "`pip install --upgrade google-genai`\n"
                    "3. Free tier only supports `gemini-2.5-flash`\n"
                    "4. Wait 1-2 min if you hit rate limits"
                )

    # Show current config
    with st.expander("⚙️ Current Configuration"):
        from stock_analysis.config import (
            GEMINI_MODEL,
            MODEL_FALLBACK_ORDER,
            RATE_LIMIT_DELAY,
            MAX_RETRIES,
        )

        st.json(
            {
                "default_model": GEMINI_MODEL,
                "fallback_order": MODEL_FALLBACK_ORDER,
                "rate_limit_delay_sec": RATE_LIMIT_DELAY,
                "max_retries_per_model": MAX_RETRIES,
                "sdk_version": sdk_ver,
            }
        )


# ── dashboard ──────────────────────────────────────────────────────────

def show_dashboard() -> None:
    """Landing dashboard with summary counts and recent activity."""
    st.markdown("## 📊 Stock Analysis Dashboard")

    db = _get_db()
    user_id = st.session_state.get("user_id", 1)

    # Summary counts
    stock_count = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM analysis_stocks WHERE user_id = ?",
        (user_id,),
    )
    stmt_count = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM financial_statements fs "
        "JOIN analysis_stocks s ON s.id = fs.stock_id WHERE s.user_id = ?",
        (user_id,),
    )
    metric_count = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM stock_metrics sm "
        "JOIN analysis_stocks s ON s.id = sm.stock_id WHERE s.user_id = ?",
        (user_id,),
    )

    n_stocks = stock_count[0]["cnt"] if stock_count else 0
    n_stmts = stmt_count[0]["cnt"] if stmt_count else 0
    n_metrics = metric_count[0]["cnt"] if metric_count else 0

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("📈 Stocks", n_stocks)
    col2.metric("📄 Statements", n_stmts)
    col3.metric("📊 Metrics", n_metrics)
    col4.metric("🏆 Scored", "—")

    # Recent activity
    st.subheader("Recent Activity")
    recent = db.execute_query(
        "SELECT s.symbol, s.company_name, s.created_at "
        "FROM analysis_stocks s WHERE s.user_id = ? "
        "ORDER BY s.created_at DESC LIMIT 5",
        (user_id,),
    )
    if recent:
        for r in recent:
            created = time.strftime(
                "%Y-%m-%d %H:%M", time.localtime(r["created_at"])
            )
            st.write(f"• **{r['symbol']}** — {r['company_name']} (added {created})")
    else:
        st.info("No stocks yet. Click **Create Stock** to get started!")

    # Quick-start cards
    st.divider()
    st.subheader("Quick Start")
    qs1, qs2, qs3 = st.columns(3)
    with qs1:
        st.markdown(
            "**1️⃣ Create Stock**\n\nAdd a company profile for analysis."
        )
        if st.button("➕ Create Stock", key="qs_create"):
            st.session_state["active_tab"] = "Create Stock"
            st.rerun()
    with qs2:
        st.markdown(
            "**2️⃣ Upload Financials**\n\nUpload PDF reports for AI extraction."
        )
        if st.button("📄 Upload", key="qs_upload"):
            st.session_state["active_tab"] = "Upload Financials"
            st.rerun()
    with qs3:
        st.markdown(
            "**3️⃣ Analyse**\n\nView ratios, metrics, and valuations."
        )
        if st.button("📈 Analyse", key="qs_analyse"):
            st.session_state["active_tab"] = "Fundamental Analysis"
            st.rerun()


# ── fundamental analysis sub-page ──────────────────────────────────────

def show_fundamental_analysis() -> None:
    """Fundamental analysis with sub-tabs."""
    st.markdown("## 📈 Fundamental Analysis")

    db = _get_db()
    user_id = st.session_state.get("user_id", 1)

    stocks = db.execute_query(
        "SELECT id, symbol, company_name FROM analysis_stocks "
        "WHERE user_id = ? ORDER BY symbol",
        (user_id,),
    )

    if not stocks:
        st.warning("No stocks found. Create a stock profile first.")
        return

    options_map = {f"{s['symbol']} - {s['company_name']}": s for s in stocks}
    selected = st.selectbox(
        "Select Stock", list(options_map.keys()), key="fa_stock_select"
    )
    stock = options_map[selected]

    sub_tab = st.radio(
        "Analysis Section",
        [
            "📄 Financial Statements",
            "📊 Financial Metrics",
            "📈 Trend Analysis",
            "🔍 Ratio Analysis",
        ],
        horizontal=True,
        key="fa_sub_tab",
    )

    if sub_tab == "📄 Financial Statements":
        show_financial_statements(stock, db)
    elif sub_tab == "📊 Financial Metrics":
        show_financial_metrics(stock, db)
    elif sub_tab == "📈 Trend Analysis":
        show_trend_analysis(stock, db)
    elif sub_tab == "🔍 Ratio Analysis":
        show_ratio_analysis(stock, db)


def show_financial_statements(stock: dict, db: AnalysisDatabase) -> None:
    """Display saved financial statements for a stock."""
    manager = FinancialDataManager(db)
    financials = manager.get_stock_financials(stock["id"])

    if not financials:
        st.info(
            f"No financial statements for **{stock['symbol']}**. "
            "Upload some first."
        )
        return

    for stmt_type, periods in financials.items():
        type_label = STATEMENT_TYPES.get(stmt_type, stmt_type)
        st.subheader(f"📄 {type_label}")
        for period, items in sorted(periods.items(), reverse=True):
            with st.expander(f"Period: {period}", expanded=False):
                if items:
                    df = pd.DataFrame(items)
                    cols = [
                        c
                        for c in [
                            "line_item_code",
                            "display_name",
                            "amount",
                            "is_total",
                        ]
                        if c in df.columns
                    ]
                    st.dataframe(df[cols], use_container_width=True)
                else:
                    st.write("No items for this period.")


def show_financial_metrics(stock: dict, db: AnalysisDatabase) -> None:
    """Calculate and display financial metrics."""
    manager = FinancialDataManager(db)

    if st.button("🔄 Recalculate Metrics", key="recalc_metrics"):
        with st.spinner("Calculating metrics..."):
            try:
                metrics = manager.calculate_metrics(stock["id"])
                if metrics:
                    st.success(
                        f"✅ Calculated {len(metrics)} metrics for "
                        f"**{stock['symbol']}**"
                    )
                else:
                    st.warning("No data available to calculate metrics.")
            except Exception as e:
                st.error(f"❌ Error: {e}")

    # Show existing metrics
    rows = db.execute_query(
        "SELECT metric_name, metric_value, metric_type AS category, period_end_date "
        "FROM stock_metrics WHERE stock_id = ? "
        "ORDER BY metric_type, metric_name",
        (stock["id"],),
    )
    if rows:
        df = pd.DataFrame(rows)
        for cat in df["category"].unique():
            st.subheader(f"📊 {cat}")
            cat_df = df[df["category"] == cat][
                ["metric_name", "metric_value", "period_end_date"]
            ]
            st.dataframe(cat_df, use_container_width=True)
    else:
        st.info("No metrics calculated yet. Click the button above.")


def show_trend_analysis(stock: dict, db: AnalysisDatabase) -> None:
    """Placeholder for trend analysis charts."""
    st.info(
        f"📈 Trend analysis for **{stock['symbol']}** — "
        "Charts will appear here once multiple periods are available."
    )

    manager = FinancialDataManager(db)
    all_periods = []
    for stype in ["income", "balance", "cashflow", "equity"]:
        all_periods.extend(manager.available_periods(stock["id"], stype))
    unique_periods = sorted(set(all_periods))
    if unique_periods:
        st.write(f"Available periods: {', '.join(unique_periods)}")
    else:
        st.write("No periods available yet.")


def show_ratio_analysis(stock: dict, db: AnalysisDatabase) -> None:
    """Display ratio analysis using MetricsCalculator."""
    st.subheader(f"🔍 Ratio Analysis — {stock['symbol']}")

    manager = FinancialDataManager(db)
    calc = MetricsCalculator(db)

    stmt_type = st.selectbox(
        "Statement Type",
        list(STATEMENT_TYPES.keys()),
        format_func=lambda x: STATEMENT_TYPES[x],
        key="ratio_stmt_type",
    )

    try:
        comp_df = manager.get_comparison_df(stock["id"], stmt_type)
        if comp_df is not None and not comp_df.empty:
            st.dataframe(comp_df, use_container_width=True)
        else:
            st.info("Not enough data for ratio comparison.")
    except Exception as e:
        st.warning(f"Could not generate comparison: {e}")


# ── valuation sub-page ─────────────────────────────────────────────────

def show_valuation_models() -> None:
    """Valuation models page."""
    user_id = st.session_state.get("user_id", 1)
    render_valuation_page(user_id)


# ── standalone mode ────────────────────────────────────────────────────

def main() -> None:
    st.set_page_config(
        page_title="Stock Analysis — CFA Level",
        page_icon="📊",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    # Sidebar navigation
    with st.sidebar:
        st.title("📊 Stock Analysis")
        st.caption("CFA-Level Financial Analysis")
        st.divider()

        user_id = st.number_input("User ID", value=1, min_value=1, step=1)
        st.session_state["user_id"] = user_id
        st.divider()

        # Determine default from session
        default_tab = st.session_state.get("active_tab", "Dashboard")
        nav_options = [
            "Dashboard",
            "Create Stock",
            "Upload Financials",
            "Fundamental Analysis",
            "Valuation Models",
        ]
        default_idx = (
            nav_options.index(default_tab)
            if default_tab in nav_options
            else 0
        )

        active_tab = st.radio(
            "Navigation",
            nav_options,
            index=default_idx,
            key="sidebar_nav",
        )
        st.session_state["active_tab"] = active_tab

        st.divider()
        st.caption("Stock Analysis Module v1.0")
        st.caption("Database: data/stock_analysis.db")

    # Route to correct page
    if active_tab == "Dashboard":
        show_dashboard()
    elif active_tab == "Create Stock":
        ui_stock_analysis_create()
    elif active_tab == "Upload Financials":
        ui_upload_financial_statement()
    elif active_tab == "Fundamental Analysis":
        show_fundamental_analysis()
    elif active_tab == "Valuation Models":
        show_valuation_models()


if __name__ == "__main__":
    main()
