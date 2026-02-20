"""
Stock Creation UI — Streamlit page for creating and managing
stock profiles in the analysis module.
"""

import streamlit as st
import time
from typing import Optional

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.models.stock_profile import StockProfileManager
from stock_analysis.models.financial_data import FinancialDataManager
from stock_analysis.utils.validators import validate_stock_profile
from stock_analysis.utils.helpers import badge_html, iso_today
from stock_analysis.config import (
    EXCHANGE_CHOICES,
    SECTOR_CHOICES,
    COUNTRY_CHOICES,
    CURRENCY_CHOICES,
)


def _get_db() -> AnalysisDatabase:
    if "analysis_db" not in st.session_state:
        st.session_state["analysis_db"] = AnalysisDatabase()
    return st.session_state["analysis_db"]


def _get_mgr() -> StockProfileManager:
    return StockProfileManager(_get_db())


# ── public API  ────────────────────────────────────────────────────────
# render_stock_creation_page()  — embeddable in the tab-based layout
# ui_stock_analysis_create()    — standalone two-column page for sidebar nav

def render_stock_creation_page(user_id: int = 1) -> None:
    """Embeddable tab-based stock-profile CRUD (used by render_stock_analysis)."""
    tab_list, tab_create, tab_edit = st.tabs(
        ["🗂️ My Stocks", "➕ Create New", "✏️ Edit / Delete"]
    )
    with tab_list:
        _render_stock_list(user_id)
    with tab_create:
        _render_create_form(user_id)
    with tab_edit:
        _render_edit_form(user_id)


def ui_stock_analysis_create() -> None:
    """Full-page stock creation interface (two-column layout)."""
    st.markdown("## 📈 Create Stock Analysis Profile")

    db = _get_db()
    manager = FinancialDataManager(db)

    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("Company Information")

        symbol = st.text_input(
            "Stock Symbol (e.g., AAPL, TSLA)",
            key="stock_symbol",
            placeholder="Enter stock symbol",
        ).upper()

        company_name = st.text_input(
            "Company Name",
            key="company_name",
            placeholder="Enter company name",
        )

        col_a, col_b, col_c = st.columns(3)
        with col_a:
            exchange = st.selectbox(
                "Exchange",
                ["NYSE", "NASDAQ", "LSE", "TSE", "HKEX", "Other"],
                key="exchange",
            )
        with col_b:
            currency = st.selectbox(
                "Reporting Currency",
                ["USD", "EUR", "GBP", "JPY", "CNY", "Other"],
                key="currency",
            )
        with col_c:
            country = st.text_input("Country", key="country", placeholder="e.g., USA")

        sector = st.selectbox(
            "Sector",
            [
                "Select Sector",
                "Technology",
                "Healthcare",
                "Financials",
                "Consumer Discretionary",
                "Consumer Staples",
                "Energy",
                "Materials",
                "Industrials",
                "Utilities",
                "Real Estate",
                "Communication Services",
                "Other",
            ],
            key="sector",
        )

        industry = st.text_input("Industry", key="industry", placeholder="e.g., Software")

        st.subheader("Additional Details")
        description = st.text_area(
            "Company Description",
            height=100,
            key="description",
            placeholder="Brief company description",
        )
        website = st.text_input("Website", key="website", placeholder="https://")

    with col2:
        st.subheader("Quick Actions")

        if st.button("🔍 Lookup Symbol Info", key="lookup_symbol"):
            if symbol:
                st.info(
                    "Stock lookup feature coming soon! "
                    "For now, please fill in details manually."
                )

        st.divider()

        st.info(
            """
            **What happens next:**
            1. ✅ Create stock profile
            2. 📄 Upload financial statements (PDF)
            3. 🤖 AI extracts all line items
            4. ✏️ Review & edit if needed
            5. 💾 Save to database
            6. 📊 Calculate metrics & valuations
            """
        )

        st.divider()

        if st.button(
            "✅ Create Stock Profile",
            type="primary",
            key="create_profile",
            use_container_width=True,
        ):
            if not symbol or not company_name:
                st.error("❌ Please fill in both Symbol and Company Name")
            elif sector == "Select Sector":
                st.warning("⚠️ Please select a sector")
            else:
                try:
                    user_id = st.session_state.get("user_id", 1)
                    stock_data = {
                        "name": company_name,
                        "exchange": exchange,
                        "currency": currency,
                        "sector": sector if sector != "Other" else None,
                        "industry": industry,
                        "country": country,
                        "description": description,
                        "website": website,
                    }
                    stock_id = manager.create_stock_profile(
                        user_id, symbol, stock_data
                    )
                    st.success("✅ Stock profile created successfully!")
                    st.info(f"**Stock ID:** {stock_id} | **Symbol:** {symbol}")

                    st.session_state["current_stock_id"] = stock_id
                    st.session_state["current_stock_symbol"] = symbol

                    with st.spinner("Redirecting to financial upload..."):
                        time.sleep(1)

                    st.session_state["active_tab"] = "Upload Financials"
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Error creating profile: {e}")

    # ── existing stocks list ───────────────────────────────────────────
    st.divider()
    st.subheader("Your Analysis Stocks")

    user_id = st.session_state.get("user_id", 1)
    existing_stocks = db.execute_query(
        "SELECT id, symbol, company_name, created_at "
        "FROM analysis_stocks WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    )

    if existing_stocks:
        for stock in existing_stocks:
            created_date = time.strftime(
                "%Y-%m-%d", time.localtime(stock["created_at"])
            )
            col_s1, col_s2, col_s3 = st.columns([2, 3, 1])
            with col_s1:
                st.write(f"**{stock['symbol']}**")
            with col_s2:
                st.write(stock["company_name"])
            with col_s3:
                if st.button("View", key=f"view_{stock['id']}"):
                    st.session_state["current_stock_id"] = stock["id"]
                    st.session_state["current_stock_symbol"] = stock["symbol"]
                    st.session_state["active_tab"] = "Upload Financials"
                    st.rerun()
    else:
        st.info("📭 No stocks in your analysis portfolio yet. Create one above!")


# ── internal helpers (shared by both layouts) ──────────────────────────

def _render_stock_list(user_id: int) -> None:
    mgr = _get_mgr()
    stocks = mgr.list_stocks(user_id)

    if not stocks:
        st.info("No analysis stocks yet. Go to **Create New** to add one.")
        return

    query = st.text_input("🔍 Search stocks", key="stock_search")
    if query:
        stocks = mgr.search_stocks(user_id, query)

    st.write(f"**{len(stocks)}** stock(s)")

    for s in stocks:
        with st.expander(f"**{s['symbol']}** — {s['company_name']}", expanded=False):
            c1, c2, c3 = st.columns(3)
            c1.metric("Exchange", s.get("exchange", "—"))
            c2.metric("Currency", s.get("currency", "—"))
            c3.metric("Sector", s.get("sector") or "—")

            summary = mgr.get_stock_summary(s["id"])
            sc1, sc2, sc3 = st.columns(3)
            sc1.metric("Statements", summary["statement_count"])
            sc2.metric("Metrics", summary["metric_count"])
            sc3.metric("Valuations", summary["valuation_count"])

            latest_score = summary.get("latest_score")
            if latest_score:
                st.markdown(
                    f"**Latest Score:** {latest_score['overall_score']}/100  "
                    f"({latest_score['scoring_date']})"
                )

            if s.get("description"):
                st.caption(s["description"])

            col_a, col_b = st.columns(2)
            if col_a.button("📄 View Details", key=f"view_detail_{s['id']}"):
                st.session_state["current_stock_id"] = s["id"]
                st.session_state["current_stock_symbol"] = s["symbol"]
                st.rerun()
            if col_b.button("🗑️ Delete", key=f"del_{s['id']}"):
                st.session_state[f"confirm_delete_{s['id']}"] = True

            if st.session_state.get(f"confirm_delete_{s['id']}"):
                st.warning(f"Delete **{s['symbol']}** and ALL related data?")
                cc1, cc2 = st.columns(2)
                if cc1.button("✅ Yes, delete", key=f"yes_del_{s['id']}"):
                    mgr.delete_stock(user_id, s["id"])
                    del st.session_state[f"confirm_delete_{s['id']}"]
                    st.success(f"Deleted {s['symbol']}")
                    st.rerun()
                if cc2.button("❌ Cancel", key=f"no_del_{s['id']}"):
                    del st.session_state[f"confirm_delete_{s['id']}"]
                    st.rerun()


def _render_create_form(user_id: int) -> None:
    st.subheader("Create New Stock Profile")
    mgr = _get_mgr()

    with st.form("create_stock_form", clear_on_submit=True):
        c1, c2 = st.columns(2)
        symbol = c1.text_input("Symbol *", placeholder="AAPL").strip().upper()
        company = c2.text_input("Company Name *", placeholder="Apple Inc.")

        c3, c4 = st.columns(2)
        exchange = c3.selectbox("Exchange", EXCHANGE_CHOICES, index=0)
        currency = c4.selectbox("Currency", CURRENCY_CHOICES, index=0)

        c5, c6 = st.columns(2)
        sector = c5.selectbox("Sector", [""] + SECTOR_CHOICES, index=0)
        country = c6.selectbox("Country", [""] + COUNTRY_CHOICES, index=0)

        industry = st.text_input("Industry", placeholder="Consumer Electronics")

        c7, c8 = st.columns(2)
        isin = c7.text_input("ISIN (optional)", placeholder="US0378331005")
        cik = c8.text_input("CIK (optional)", placeholder="0000320193")

        outstanding_shares = st.number_input(
            "Outstanding Shares",
            min_value=0.0,
            step=1000000.0,
            format="%.0f",
            value=0.0,
            help="Total shares outstanding (used for Book Value, EPS, P/E calculations)",
        )

        description = st.text_area("Description", height=80)
        website = st.text_input("Website", placeholder="https://www.apple.com")

        submitted = st.form_submit_button("💾 Create Stock", type="primary")

    if submitted:
        data = {
            "symbol": symbol,
            "company_name": company,
            "exchange": exchange,
            "currency": currency,
            "sector": sector or None,
            "industry": industry or None,
            "country": country or None,
            "isin": isin or None,
            "cik": cik or None,
            "description": description or None,
            "website": website or None,
            "outstanding_shares": outstanding_shares if outstanding_shares else None,
        }
        ok, errors = validate_stock_profile(data)
        if not ok:
            for e in errors:
                st.error(e)
            return

        try:
            new_id = mgr.create_stock(user_id, **data)
            st.success(f"✅ Created **{symbol}** (id={new_id})")
            st.info(f"**{symbol}** is ready for financial statement uploads")
            st.balloons()

            # Auto-redirect to upload page
            st.session_state["current_stock_id"] = new_id
            st.session_state["current_stock_symbol"] = symbol
            st.session_state["active_tab"] = "Upload Financials"
            import time as _t
            with st.spinner("Redirecting to upload page..."):
                _t.sleep(1.5)
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))


def _render_edit_form(user_id: int) -> None:
    st.subheader("Edit or Delete Stock Profile")
    mgr = _get_mgr()
    stocks = mgr.list_stocks(user_id)

    if not stocks:
        st.info("Nothing to edit — create a stock first.")
        return

    options = {f"{s['symbol']} — {s['company_name']}": s for s in stocks}
    choice = st.selectbox("Select stock", list(options.keys()), key="edit_stock_sel")
    if not choice:
        return
    stock = options[choice]

    with st.form("edit_stock_form"):
        c1, c2 = st.columns(2)
        company = c1.text_input("Company Name", value=stock["company_name"])
        exchange = c2.selectbox(
            "Exchange",
            EXCHANGE_CHOICES,
            index=EXCHANGE_CHOICES.index(stock.get("exchange", "NYSE")),
        )
        c3, c4 = st.columns(2)
        currency = c3.selectbox(
            "Currency",
            CURRENCY_CHOICES,
            index=CURRENCY_CHOICES.index(stock.get("currency", "USD")),
        )
        sector_idx = 0
        if stock.get("sector") in SECTOR_CHOICES:
            sector_idx = SECTOR_CHOICES.index(stock["sector"]) + 1
        sector = c4.selectbox("Sector", [""] + SECTOR_CHOICES, index=sector_idx)

        industry = st.text_input("Industry", value=stock.get("industry") or "")

        outstanding_shares = st.number_input(
            "Outstanding Shares",
            min_value=0.0,
            step=1000000.0,
            format="%.0f",
            value=float(stock.get("outstanding_shares") or 0),
            help="Total shares outstanding (used for Book Value, EPS, P/E calculations)",
            key="edit_outstanding_shares",
        )

        description = st.text_area("Description", value=stock.get("description") or "")
        website = st.text_input("Website", value=stock.get("website") or "")

        submitted = st.form_submit_button("💾 Save Changes")

    if submitted:
        updates = {
            "company_name": company,
            "exchange": exchange,
            "currency": currency,
            "sector": sector or None,
            "industry": industry or None,
            "outstanding_shares": outstanding_shares if outstanding_shares else None,
            "description": description or None,
            "website": website or None,
        }
        try:
            mgr.update_stock(user_id, stock["id"], **updates)
            st.success(f"✅ Updated **{stock['symbol']}**")
        except ValueError as exc:
            st.error(str(exc))
