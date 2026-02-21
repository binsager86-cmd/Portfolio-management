"""
Fundamental Analysis UI — Multi-tab view of financial statements,
metrics / ratios, multi-period comparison, growth analysis, and
CFA-based stock scoring.
"""

import json
import streamlit as st
import pandas as pd
from typing import Any, Dict, List, Optional

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.models.stock_profile import StockProfileManager
from stock_analysis.models.financial_data import FinancialDataManager
from stock_analysis.models.metrics_calculator import MetricsCalculator
from stock_analysis.utils.helpers import (
    fmt_number,
    fmt_percent,
    fmt_ratio,
    metric_color,
    score_emoji,
    colored_metric_html,
    fiscal_year_label,
)
from stock_analysis.config import STATEMENT_TYPES, METRIC_CATEGORIES, FINANCIAL_LINE_ITEM_CODES

# Currency display signs by ISO code
_CURRENCY_SIGNS = {
    "KWD": "KD", "USD": "$", "EUR": "\u20ac", "GBP": "\u00a3",
    "SAR": "SAR", "AED": "AED", "BHD": "BD", "OMR": "OMR", "QAR": "QAR",
}

def _ccy(stock: Optional[Dict]) -> str:
    """Return display currency sign for a stock dict."""
    if not stock:
        return "$"
    code = (stock.get("currency") or "USD").upper()
    return _CURRENCY_SIGNS.get(code, code + " ")


def _get_db() -> AnalysisDatabase:
    if "analysis_db" not in st.session_state:
        st.session_state["analysis_db"] = AnalysisDatabase()
    return st.session_state["analysis_db"]


# ── yfinance price helper ─────────────────────────────────────────────

def _fetch_current_price(symbol: str) -> Optional[float]:
    """Fetch the current / last-close price from Yahoo Finance.
    Returns None on any failure so the UI can degrade gracefully.

    Kuwaiti (.KW) tickers are quoted in fils on Yahoo; divide by 1000
    to convert to KWD.
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
        raw: Optional[float] = None
        # Try multiple fields — yfinance varies by market
        for field in ("currentPrice", "regularMarketPrice",
                      "previousClose", "regularMarketPreviousClose"):
            price = info.get(field)
            if price and float(price) > 0:
                raw = float(price)
                break
        # Fallback to last row of history
        if raw is None:
            hist = ticker.history(period="5d")
            if hist is not None and not hist.empty:
                raw = float(hist["Close"].iloc[-1])
        # Kuwaiti tickers: Yahoo quotes in fils → convert to KWD
        if raw is not None and symbol.upper().endswith(".KW"):
            raw = raw / 1000.0
        return raw
    except Exception:
        pass
    return None


# ── financials data-extraction helper ──────────────────────────────────

# Mapping of canonical codes → all known DB-stored variants.
# The lookup helper checks the canonical code first, then all variants.
_CODE_VARIANTS: Dict[str, List[str]] = {
    # ── Income statement ──────────────────────────────────────────
    "NET_INCOME":       ["PROFIT_FOR_THE_YEAR", "NET_PROFIT",
                         "PROFIT_FOR_THE_PERIOD", "NET_INCOME_LOSS",
                         "NET_PROFIT_FOR_THE_YEAR", "NET_INCOME_FOR_THE_YEAR",
                         "PROFIT_ATTRIBUTABLE_TO_SHAREHOLDERS",
                         "PROFIT_ATTRIBUTABLE_TO_EQUITY_HOLDERS",
                         "PROFIT_ATTRIBUTABLE_TO_THE_PARENT",
                         "NET_PROFIT_ATTRIBUTABLE_TO_SHAREHOLDERS_OF_THE_PARENT_COMPANY"],
    "REVENUE":          ["TOTAL_REVENUE", "REVENUES", "NET_REVENUE",
                         "SALES", "NET_SALES", "TOTAL_OPERATING_REVENUE",
                         "TUITION_FEES", "TUITION_AND_TRAINING_FEES",
                         "TUITION_FEES_AND_TRAINING_INCOME",
                         "TOTAL_INCOME", "INCOME"],
    "GROSS_PROFIT":     ["GROSS_MARGIN", "GROSS_INCOME"],
    "OPERATING_INCOME": ["OPERATING_PROFIT", "INCOME_FROM_OPERATIONS",
                         "PROFIT_FROM_OPERATIONS",
                         "PROFIT_BEFORE_KFAS_NLST_ZAKAT_AND_DIRECTORS_REMUNERATION",
                         "PROFIT_BEFORE_CONTRIBUTION_TO_KFAS_NLST_ZAKAT_AND_DIRECTORS_REMUNERATION",
                         "PROFIT_BEFORE_KFAS_NLST_AND_ZAKAT",
                         "PROFIT_BEFORE_CONTRIBUTION_TO_KFAS_NLST_ZAKAT_AND_BOARD_OF_DIRECTORS_REMUNERATION",
                         "INCOME_BEFORE_TAX"],
    "INTEREST_EXPENSE": ["FINANCE_CHARGES", "FINANCE_COSTS",
                         "FINANCING_COSTS", "INTEREST_AND_FINANCE_CHARGES",
                         "FINANCE_COST", "FINANCING_CHARGES",
                         "INTEREST_EXPENSES"],
    # ── Balance sheet ─────────────────────────────────────────────
    "TOTAL_ASSETS":     ["ASSETS"],
    "TOTAL_EQUITY":     ["EQUITY", "SHAREHOLDERS_EQUITY",
                         "TOTAL_SHAREHOLDERS_EQUITY",
                         "EQUITY_ATTRIBUTABLE_TO_SHAREHOLDERS",
                         "EQUITY_ATTRIBUTABLE_TO_EQUITY_HOLDERS_OF_THE_PARENT",
                         "EQUITY_ATTRIBUTABLE_TO_SHAREHOLDERS_OF_THE_PARENT_COMPANY",
                         "STOCKHOLDERS_EQUITY"],
    "TOTAL_CURRENT_ASSETS":       ["CURRENT_ASSETS", "CURRENT_ASSETS_TOTAL"],
    "TOTAL_CURRENT_LIABILITIES":  ["CURRENT_LIABILITIES",
                                    "CURRENT_LIABILITIES_TOTAL"],
    "TOTAL_LIABILITIES":          ["LIABILITIES"],
    "CASH_EQUIVALENTS":           ["CASH_AND_CASH_EQUIVALENTS",
                                    "CASH_AND_BANK_BALANCES",
                                    "CASH_AND_BALANCES_WITH_BANKS",
                                    "BANK_BALANCES_AND_CASH",
                                    "BANK_BALANCES_AND_SHORT_TERM_DEPOSITS"],
    "INVENTORY":                  ["INVENTORIES"],
    "SHORT_TERM_DEBT":            ["SHORT_TERM_LOAN",
                                    "SHORT_TERM_BORROWINGS",
                                    "CURRENT_PORTION_OF_BORROWINGS",
                                    "BANK_BORROWINGS"],
    "CURRENT_PORTION_OF_LONG_TERM_DEBTS": [
                                    "CURRENT_PORTION_OF_LONG_TERM_DEBT",
                                    "CURRENT_MATURITIES_OF_LONG_TERM_DEBT",
                                    "CURRENT_PORTION_OF_TERM_LOANS"],
    "LONG_TERM_DEBT":             ["LONG_TERM_DEBTS",
                                    "NON_CURRENT_BORROWINGS",
                                    "LONG_TERM_BORROWINGS",
                                    "NON_CURRENT_PORTION_OF_BORROWINGS",
                                    "TERM_LOANS"],
    # ── Kuwait-specific income items ──────────────────────────────
    "CONTRIBUTION_TO_KFAS":       ["KFAS", "KFAS_CONTRIBUTION",
                                    "CONTRIBUTION_TO_KUWAIT_FOUNDATION"],
    "NLST":                       ["NATIONAL_LABOUR_SUPPORT_TAX",
                                    "NLST_CONTRIBUTION"],
    "ZAKAT":                      ["ZAKAT_CONTRIBUTION", "ZAKAT_EXPENSE"],
    # ── Cash flow ─────────────────────────────────────────────────
    "CASH_FROM_OPERATIONS":       ["NET_CASH_FROM_OPERATING_ACTIVITIES",
                                    "NET_CASH_GENERATED_FROM_OPERATING_ACTIVITIES",
                                    "NET_CASH_PROVIDED_BY_OPERATING_ACTIVITIES",
                                    "NET_CASH_FLOWS_FROM_OPERATING_ACTIVITIES",
                                    "CASH_FROM_OPERATING_ACTIVITIES",
                                    "CASH_GENERATED_FROM_OPERATIONS",
                                    "NET_CASH_FROM_USED_IN_OPERATING_ACTIVITIES"],
    "CAPITAL_EXPENDITURES":       ["CAPEX",
                                    "PURCHASE_OF_PROPERTY_AND_EQUIPMENT",
                                    "PURCHASE_OF_PROPERTY_PLANT_AND_EQUIPMENT",
                                    "PURCHASE_OF_FURNITURE_AND_EQUIPMENT",
                                    "ADDITIONS_TO_PROPERTY_AND_EQUIPMENT",
                                    "PAYMENTS_FOR_PROPERTY_AND_EQUIPMENT",
                                    "ACQUISITION_OF_PROPERTY_AND_EQUIPMENT",
                                    "PURCHASE_OF_EQUIPMENT",
                                    "PURCHASE_OF_FIXED_ASSETS",
                                    "ADDITIONS_TO_FIXED_ASSETS",
                                    "ACQUISITION_OF_FIXED_ASSETS",
                                    "PURCHASE_OF_INTANGIBLE_ASSETS",
                                    "PURCHASE_OF_PROPERTY_EQUIPMENT_AND_INTANGIBLE_ASSETS"],
    "CASH_FROM_INVESTING":        ["NET_CASH_USED_IN_FROM_INVESTING_ACTIVITIES",
                                    "NET_CASH_USED_IN_INVESTING_ACTIVITIES",
                                    "NET_CASH_PROVIDED_BY_INVESTING_ACTIVITIES",
                                    "NET_CASH_FLOWS_FROM_INVESTING_ACTIVITIES",
                                    "NET_CASH_FROM_INVESTING_ACTIVITIES",
                                    "NET_CASH_GENERATED_FROM_INVESTING_ACTIVITIES",
                                    "CASH_USED_IN_INVESTING_ACTIVITIES",
                                    "NET_CASH_FROM_USED_IN_INVESTING_ACTIVITIES"],
    "CASH_FROM_FINANCING":        ["NET_CASH_USED_IN_FINANCING_ACTIVITIES",
                                    "NET_CASH_USED_IN_FROM_FINANCING_ACTIVITIES",
                                    "NET_CASH_FROM_FINANCING_ACTIVITIES",
                                    "NET_CASH_PROVIDED_BY_FINANCING_ACTIVITIES",
                                    "NET_CASH_FLOWS_FROM_FINANCING_ACTIVITIES",
                                    "NET_CASH_GENERATED_FROM_FINANCING_ACTIVITIES",
                                    "CASH_USED_IN_FINANCING_ACTIVITIES",
                                    "NET_CASH_FROM_USED_IN_FINANCING_ACTIVITIES"],
    "DIVIDENDS_PAID":             ["DIVIDENDS", "DIVIDEND_PAID",
                                    "CASH_DIVIDENDS_PAID",
                                    "DIVIDENDS_PAID_TO_SHAREHOLDERS"],
}


def _get_item_amount(items: Dict[str, Any], *codes: str) -> Optional[float]:
    """Look up a line-item amount by trying the given codes **and**
    all known variant names from ``_CODE_VARIANTS``.

    Falls back to a fuzzy substring match: all underscore-separated
    words in the canonical code must appear in the DB code.
    """
    # 1. Try each explicit code first
    for code in codes:
        entry = items.get(code)
        if entry:
            val = entry.get("amount")
            if val is not None:
                return float(val)
    # 2. Expand via _CODE_VARIANTS for each code
    for code in codes:
        for variant in _CODE_VARIANTS.get(code, []):
            entry = items.get(variant)
            if entry:
                val = entry.get("amount")
                if val is not None:
                    return float(val)
    # 3. Fuzzy substring fallback — catches future AI-extracted codes
    #    e.g. canonical "CAPITAL_EXPENDITURES" matches any DB code
    #    containing both "capital" and "expenditures".
    for code in codes:
        parts = code.lower().split("_")
        for db_code, entry in items.items():
            if not isinstance(entry, dict):
                continue
            db_lower = db_code.lower()
            if all(p in db_lower for p in parts):
                val = entry.get("amount")
                if val is not None:
                    return float(val)
    return None


def _calc_fcf(cf: Dict[str, Any]) -> Optional[float]:
    """CFA Level I: FCF = Operating CF − |CapEx|.

    CapEx on cash-flow statements is usually negative (cash outflow).
    Using ``abs()`` makes the formula sign-safe regardless of convention.
    Returns None when either component is missing.
    """
    cfo = _get_item_amount(cf, "CASH_FROM_OPERATIONS")
    if cfo is None:
        return None
    capex = _get_item_amount(cf, "CAPITAL_EXPENDITURES")
    if capex is None:
        return None
    return cfo - abs(capex)


# ── main entry ─────────────────────────────────────────────────────────

def render_fundamental_analysis_page(user_id: int = 1) -> None:
    st.header("📈 Fundamental Analysis")

    db = _get_db()
    mgr = StockProfileManager(db)
    stocks = mgr.list_stocks(user_id)

    if not stocks:
        st.warning("Create a stock profile and upload financials first.")
        return

    options = {f"{s['symbol']} — {s['company_name']}": s for s in stocks}
    choice = st.selectbox("Select stock", list(options.keys()), key="fa_stock_sel")
    stock = options[choice]
    stock_id = stock["id"]

    tab_stmts, tab_compare, tab_metrics, tab_growth, tab_score = st.tabs([
        "📊 Statements",
        "🔄 Multi-Period",
        "📐 Ratios & Metrics",
        "📈 Growth Analysis",
        "🏆 Stock Score",
    ])

    with tab_stmts:
        _render_statements_tab(stock_id, db)
    with tab_compare:
        _render_comparison_tab(stock_id, db)
    with tab_metrics:
        _render_metrics_tab(stock_id, user_id, db)
    with tab_growth:
        _render_growth_tab(stock_id, db)
    with tab_score:
        _render_score_tab(stock_id, user_id, db)


# ── helper ────────────────────────────────────────────────────────────

def _fmt_amt(val) -> str:
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


# ── statements tab ────────────────────────────────────────────────────

def _render_statements_tab(stock_id: int, db: AnalysisDatabase) -> None:
    fdm = FinancialDataManager(db)

    stmt_type = st.selectbox(
        "Statement type",
        list(STATEMENT_TYPES.keys()),
        format_func=lambda x: STATEMENT_TYPES[x],
        key="fa_stmt_type",
    )
    stmts = fdm.get_statements(stock_id, stmt_type)

    if not stmts:
        st.info(f"No {STATEMENT_TYPES[stmt_type]} data. Upload a PDF first.")
        return

    type_label = STATEMENT_TYPES.get(stmt_type, stmt_type)

    # Sort periods oldest → newest (left → right)
    stmts.sort(key=lambda s: s.get("period_end_date", ""))
    years = [str(s["fiscal_year"]) for s in stmts]

    # ── collect line items across all years ────────────────────────
    items_by_year: Dict[str, pd.DataFrame] = {}
    all_codes_ordered: List[str] = []
    code_to_display: Dict[str, str] = {}
    code_is_total: Dict[str, bool] = {}

    for s in stmts:
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
        return

    # ── build display table ───────────────────────────────────────
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
                    row_dict[yr] = _fmt_amt(match.iloc[0]["amount"])
                else:
                    row_dict[yr] = "—"
        table_data.append(row_dict)

    display_df = pd.DataFrame(table_data)

    # ── title ─────────────────────────────────────────────────────
    period_range = (
        f"year ended {stmts[-1].get('period_end_date', years[-1])}"
        if stmts else ""
    )
    st.markdown(
        f"### {type_label} "
        f"<span style='font-size:0.75em;color:gray;'>— {period_range}</span>",
        unsafe_allow_html=True,
    )

    # ── style: bold total rows, right-align numbers ───────────────
    def _style_rows(row_series):
        label = row_series.get("Line Item", "")
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


# ── multi-period comparison ───────────────────────────────────────────

def _render_comparison_tab(stock_id: int, db: AnalysisDatabase) -> None:
    fdm = FinancialDataManager(db)

    stmt_type = st.selectbox(
        "Compare statement type",
        list(STATEMENT_TYPES.keys()),
        format_func=lambda x: STATEMENT_TYPES[x],
        key="fa_compare_type",
    )

    pivot = fdm.get_comparison_df(stock_id, stmt_type)
    if pivot.empty:
        st.info("Need ≥ 1 period of data.")
        return

    st.subheader(f"{STATEMENT_TYPES[stmt_type]} — Period Comparison")

    # Format numbers in period columns — full numbers, parentheses for negatives
    period_cols = [c for c in pivot.columns if c not in ("code", "name")]
    for col in period_cols:
        pivot[col] = pivot[col].apply(
            lambda x: _fmt_amt(x) if pd.notna(x) else "—"
        )

    st.dataframe(pivot, use_container_width=True, hide_index=True)

    # YoY change table
    if len(period_cols) >= 2:
        st.subheader("Year-over-Year Change")
        raw_pivot = fdm.get_comparison_df(stock_id, stmt_type)
        rp_cols = [c for c in raw_pivot.columns if c not in ("code", "name")]
        change_data = []
        for _, row in raw_pivot.iterrows():
            change_row = {"Code": row["code"], "Name": row["name"]}
            for i in range(1, len(rp_cols)):
                prev_val = row[rp_cols[i - 1]]
                curr_val = row[rp_cols[i]]
                if pd.notna(prev_val) and pd.notna(curr_val) and prev_val != 0:
                    chg = (curr_val - prev_val) / abs(prev_val) * 100
                    change_row[f"{rp_cols[i - 1]} → {rp_cols[i]}"] = f"{chg:+.1f}%"
                else:
                    change_row[f"{rp_cols[i - 1]} → {rp_cols[i]}"] = "—"
            change_data.append(change_row)
        st.dataframe(pd.DataFrame(change_data), use_container_width=True, hide_index=True)


# ── metrics tab ───────────────────────────────────────────────────────

def _render_metrics_tab(
    stock_id: int, user_id: int, db: AnalysisDatabase
) -> None:
    """CFA-level Ratios & Metrics — five sections all rendered as tables."""
    fdm = FinancialDataManager(db)
    financials = fdm.get_stock_financials(stock_id)

    if not financials:
        st.info("Upload financial statements to see metrics.")
        return

    stock = db.get_stock_by_id(stock_id)
    symbol = stock.get("symbol", "") if stock else ""
    ccy = _ccy(stock)
    outstanding_shares = float(stock.get("outstanding_shares") or 0) if stock else 0

    # ── Outstanding shares editor (quick inline) ──────────────────
    with st.expander("⚙️ Outstanding Shares setting", expanded=not outstanding_shares):
        new_shares = st.number_input(
            "Outstanding Shares",
            min_value=0.0,
            step=1000000.0,
            format="%.0f",
            value=float(outstanding_shares),
            help="Required for Book Value, EPS and P/E calculations",
            key="fa_metrics_outstanding_shares",
        )
        if st.button("💾 Save", key="save_shares_inline"):
            db.update_stock(stock_id, outstanding_shares=new_shares)
            st.success("✅ Outstanding shares saved")
            st.rerun()
        outstanding_shares = new_shares

    # ── Collect all periods (years) sorted oldest → newest ────────
    all_periods: Dict[str, Dict[str, Dict]] = {}  # year → {income, balance, cashflow, equity}
    for stmt_type in ("income", "balance", "cashflow", "equity"):
        for period_key, data in financials.get(stmt_type, {}).items():
            yr = str(data.get("fiscal_year", period_key))
            all_periods.setdefault(yr, {})[stmt_type] = data["items"]

    years = sorted(all_periods.keys())
    if not years:
        st.info("No financial data found.")
        return

    latest_year = years[-1]

    # ── Helper: derive Total Equity when the line item is missing ─
    def _equity(bal: Dict) -> float:
        """Return Total Equity from the balance sheet items.
        If the explicit TOTAL_EQUITY line is missing, derive it via
        the accounting identity: Equity = Total Assets − Total Liabilities."""
        eq = _get_item_amount(bal, "TOTAL_EQUITY")
        if eq is not None:
            return eq
        ta = _get_item_amount(bal, "TOTAL_ASSETS") or 0
        tl = _get_item_amount(bal, "TOTAL_LIABILITIES") or 0
        if ta:
            return ta - tl
        return 0

    # ── Fetch price once ──────────────────────────────────────────
    price = None
    if symbol:
        with st.spinner(f"Fetching price for {symbol}…"):
            price = _fetch_current_price(symbol)
        if price:
            st.caption(f"📈 Current price for **{symbol}**: **{ccy}{price:,.3f}**  _(source: Yahoo Finance)_")
        else:
            st.caption(f"⚠️ Could not fetch price for **{symbol}** — valuation ratios needing price will show '—'.")

    # ================================================================
    # A. PROFITABILITY  (historical table)
    # ================================================================
    st.markdown("### A. Profitability")
    prof_rows = []
    for yr in years:
        inc = all_periods[yr].get("income", {})
        bal = all_periods[yr].get("balance", {})
        cf  = all_periods[yr].get("cashflow", {})

        revenue     = _get_item_amount(inc, "REVENUE", "TOTAL_REVENUE") or 0
        gross_profit = _get_item_amount(inc, "GROSS_PROFIT") or 0
        net_income  = _get_item_amount(inc, "NET_INCOME") or 0
        total_assets = _get_item_amount(bal, "TOTAL_ASSETS") or 0
        total_equity = _equity(bal)

        # CFA L1: FCF = CFO − |CapEx|
        has_cf = bool(cf)
        fcf_val = _calc_fcf(cf) if has_cf else None

        prof_rows.append({
            "Year": yr,
            "Gross Profit Margin": f"{gross_profit / revenue * 100:.1f}%" if revenue else "—",
            "Net Income / Sales": f"{net_income / revenue * 100:.1f}%" if revenue else "—",
            "Free Cash Flow": _fmt_amt(fcf_val) if fcf_val is not None else "—",
            "ROA": f"{net_income / total_assets * 100:.1f}%" if total_assets else "—",
            "ROE": f"{net_income / total_equity * 100:.1f}%" if total_equity else "—",
        })

    st.dataframe(
        pd.DataFrame(prof_rows).set_index("Year").T.rename_axis("Metric"),
        use_container_width=True,
    )

    # ================================================================
    # B. VALUATION  (latest year only)
    # ================================================================
    st.markdown("### B. Valuation")
    inc_latest = all_periods[latest_year].get("income", {})
    bal_latest = all_periods[latest_year].get("balance", {})

    net_income_latest = _get_item_amount(inc_latest, "NET_INCOME", "PROFIT_FOR_THE_YEAR") or 0
    total_equity_latest = _equity(bal_latest)

    # EPS Trailing 12M — try to combine latest 4 quarters, otherwise use annual
    eps_ttm = None
    eps_annual = None
    # Gather quarterly net incomes
    quarterly_nis: List[float] = []
    for period_key, data in financials.get("income", {}).items():
        fq = data.get("fiscal_quarter")
        if fq:  # quarterly data
            ni = _get_item_amount(data["items"], "NET_INCOME", "PROFIT_FOR_THE_YEAR")
            if ni is not None:
                quarterly_nis.append(ni)
    # Sort recent quarters and take last 4
    if len(quarterly_nis) >= 4 and outstanding_shares:
        ttm_ni = sum(quarterly_nis[-4:])
        eps_ttm = ttm_ni / outstanding_shares
    elif outstanding_shares and net_income_latest:
        eps_ttm = net_income_latest / outstanding_shares  # fallback to annual

    if outstanding_shares and net_income_latest:
        eps_annual = net_income_latest / outstanding_shares

    book_value = (total_equity_latest / outstanding_shares) if outstanding_shares else None
    pe_ratio = (price / eps_annual) if (price and eps_annual and eps_annual != 0) else None
    pb_ratio = (price / book_value) if (price and book_value and book_value != 0) else None

    val_data = {
        "Metric": [
            "EPS Trailing 12M",
            "EPS Annual",
            "P/E Ratio",
            f"Book Value (Equity / Shares)",
            "Price to Book Value",
        ],
        "Value": [
            f"{eps_ttm:,.4f}" if eps_ttm is not None else "—",
            f"{eps_annual:,.4f}" if eps_annual is not None else "—",
            f"{pe_ratio:,.2f}x" if pe_ratio is not None else "—",
            f"{book_value:,.4f}" if book_value is not None else "—",
            f"{pb_ratio:,.2f}x" if pb_ratio is not None else "—",
        ],
        "Notes": [
            "TTM from 4 quarters" if len(quarterly_nis) >= 4 else "Annual (no quarterly data)",
            f"FY {latest_year}",
            f"Price: {ccy}{price:,.3f}" if price else "Price unavailable",
            f"Equity: {_fmt_amt(total_equity_latest)}, Shares: {_fmt_amt(outstanding_shares)}",
            f"Price: {ccy}{price:,.3f}" if price else "Price unavailable",
        ],
    }
    st.dataframe(pd.DataFrame(val_data), use_container_width=True, hide_index=True)

    if not outstanding_shares:
        st.warning("⚠️ Set **Outstanding Shares** above to enable EPS, Book Value and P/E calculations.")

    # ================================================================
    # C. DIVIDEND  (historical table)
    # ================================================================
    st.markdown("### C. Dividend")
    div_rows = []
    for yr in years:
        inc = all_periods[yr].get("income", {})
        cf  = all_periods[yr].get("cashflow", {})

        ni = _get_item_amount(inc, "NET_INCOME", "PROFIT_FOR_THE_YEAR") or 0
        eps_yr = (ni / outstanding_shares) if outstanding_shares else None

        # Dividend — try income statement first, then cash flow DIVIDENDS_PAID/DIVIDEND_PAID
        div_amount = _get_item_amount(inc, "DIVIDENDS", "DIVIDENDS_PAID", "DIVIDEND_PAID")
        if div_amount is None:
            div_amount = _get_item_amount(cf, "DIVIDENDS_PAID", "DIVIDEND_PAID", "DIVIDENDS")
        if div_amount is not None:
            div_amount = abs(div_amount)  # make positive

        payout = (div_amount / ni * 100) if (div_amount and ni and ni != 0) else None
        dps = (div_amount / outstanding_shares) if (div_amount and outstanding_shares) else None
        div_yield = (dps / price * 100) if (dps and price and price != 0) else None

        div_rows.append({
            "Year": yr,
            "EPS": f"{eps_yr:,.4f}" if eps_yr is not None else "—",
            "Payout Ratio": f"{payout:.1f}%" if payout is not None else "—",
            "Annual Dividend": _fmt_amt(div_amount) if div_amount else "—",
            "Yield": f"{div_yield:.2f}%" if div_yield is not None else "—",
        })

    st.dataframe(
        pd.DataFrame(div_rows).set_index("Year").T.rename_axis("Metric"),
        use_container_width=True,
    )

    # ================================================================
    # D. CASH FLOW  (historical table)
    # ================================================================
    st.markdown("### D. Cash Flow")
    cf_rows = []
    for yr in years:
        cf = all_periods[yr].get("cashflow", {})
        has_cf = bool(cf)

        # CFA L1: FCF = CFO − |CapEx|
        fcf_ = _calc_fcf(cf) if has_cf else None

        cfo_raw = _get_item_amount(cf, "CASH_FROM_OPERATIONS") if has_cf else None
        cfi = _get_item_amount(cf, "CASH_FROM_INVESTING") if has_cf else None
        cff = _get_item_amount(cf, "CASH_FROM_FINANCING") if has_cf else None

        cf_rows.append({
            "Year": yr,
            "Operating Cash Flow": _fmt_amt(cfo_raw) if cfo_raw is not None else "—",
            "Free Cash Flow": _fmt_amt(fcf_) if fcf_ is not None else "—",
            "Investing Cash Flow": _fmt_amt(cfi) if cfi is not None else "—",
            "Financing Cash Flow": _fmt_amt(cff) if cff is not None else "—",
        })

    st.dataframe(
        pd.DataFrame(cf_rows).set_index("Year").T.rename_axis("Metric"),
        use_container_width=True,
    )

    # ================================================================
    # E. CAPITAL STRUCTURE  (historical table)
    # ================================================================
    st.markdown("### E. Capital Structure")
    cap_rows = []
    for yr in years:
        bal = all_periods[yr].get("balance", {})
        inc = all_periods[yr].get("income", {})
        cf  = all_periods[yr].get("cashflow", {})

        cash = (_get_item_amount(bal, "CASH_EQUIVALENTS",
                                 "CASH_AND_CASH_EQUIVALENTS",
                                 "CASH_AND_BANK_BALANCES") or 0)
        short_invest = _get_item_amount(bal, "SHORT_TERM_INVESTMENTS") or 0
        total_cash = cash + short_invest

        short_term_debt = (_get_item_amount(bal, "SHORT_TERM_DEBT",
                                            "SHORT_TERM_LOAN",
                                            "CURRENT_PORTION_OF_LONG_TERM_DEBTS") or 0)
        long_term_debt = (_get_item_amount(bal, "LONG_TERM_DEBT",
                                           "LONG_TERM_DEBTS") or 0)
        total_debt = short_term_debt + long_term_debt
        net_debt = total_debt - total_cash

        total_equity = _equity(bal)
        total_current_assets = _get_item_amount(bal, "TOTAL_CURRENT_ASSETS") or 0
        total_current_liab = _get_item_amount(bal, "TOTAL_CURRENT_LIABILITIES") or 0
        inventory = _get_item_amount(bal, "INVENTORY", "INVENTORIES") or 0

        interest_expense = abs(_get_item_amount(inc, "INTEREST_EXPENSE", "FINANCE_CHARGES",
                                                     "FINANCE_COSTS") or 0)
        operating_income = (_get_item_amount(inc, "OPERATING_INCOME", "OPERATING_PROFIT",
                                             "PROFIT_BEFORE_KFAS_NLST_ZAKAT_AND_DIRECTORS_REMUNERATION",
                                             "INCOME_BEFORE_TAX") or 0)

        # CFA L1: FCF = CFO − |CapEx| — only when cashflow data exists
        has_cf = bool(cf)
        fcf_ = _calc_fcf(cf) if has_cf else None

        # Ratios
        de_ratio = (total_debt / total_equity) if total_equity else None
        current_ratio = (total_current_assets / total_current_liab) if total_current_liab else None
        quick_ratio = ((total_current_assets - inventory) / total_current_liab) if total_current_liab else None
        coverage_ratio = (operating_income / interest_expense) if interest_expense else None
        bvps = (total_equity / outstanding_shares) if outstanding_shares else None
        debt_fcf = (total_debt / fcf_) if (fcf_ and fcf_ != 0) else None
        total_capital = total_equity + long_term_debt
        ltd_cap = (long_term_debt / total_capital * 100) if total_capital else None

        cap_rows.append({
            "Year": yr,
            "Total Cash": _fmt_amt(total_cash),
            "Total Debt": _fmt_amt(total_debt),
            "Net Debt": _fmt_amt(net_debt),
            "Total Debt/Equity": f"{de_ratio:.2f}x" if de_ratio is not None else "—",
            "Short Term Debt": _fmt_amt(short_term_debt),
            "Long Term Debt": _fmt_amt(long_term_debt),
            "Current Ratio": f"{current_ratio:.2f}x" if current_ratio is not None else "—",
            "Quick Ratio": f"{quick_ratio:.2f}x" if quick_ratio is not None else "—",
            "Interest Coverage": f"{coverage_ratio:.2f}x" if coverage_ratio is not None else "—",
            "Book Value / Share": f"{bvps:,.4f}" if bvps is not None else "—",
            "Debt / FCF": f"{debt_fcf:.2f}x" if debt_fcf is not None else "—",
            "LT Debt / Total Capital": f"{ltd_cap:.1f}%" if ltd_cap is not None else "—",
        })

    st.dataframe(
        pd.DataFrame(cap_rows).set_index("Year").T.rename_axis("Metric"),
        use_container_width=True,
    )

    # ================================================================
    # 🔍 DEBUG: Raw DB codes per year (for troubleshooting)
    # ================================================================
    with st.expander("🔍 Debug: Raw DB Codes per Year (for troubleshooting)"):
        for yr in years:
            st.markdown(f"**FY {yr}**")
            for stype in ("income", "balance", "cashflow", "equity"):
                data = all_periods[yr].get(stype, {})
                if data:
                    codes_list = sorted(data.keys())
                    st.caption(f"{stype} ({len(codes_list)} items): " + ", ".join(codes_list))
                else:
                    st.caption(f"{stype}: ⚠️ **NO DATA**")
            st.divider()


# ── growth analysis tab ───────────────────────────────────────────────

def _render_growth_tab(stock_id: int, db: AnalysisDatabase) -> None:
    mc = MetricsCalculator(db)

    if st.button("🔄 Calculate Growth Rates", key="calc_growth"):
        with st.spinner("Analysing growth across periods…"):
            growth = mc.calculate_growth(stock_id)
        if not growth:
            st.warning("Need ≥ 2 periods of data for growth analysis.")
            return
        st.success("✅ Growth metrics calculated")

    # Show stored growth metrics
    growth_metrics = [
        m for m in db.get_metrics(stock_id) if m["metric_type"] == "growth"
    ]
    if not growth_metrics:
        st.info("Click **Calculate Growth Rates** (requires ≥ 2 periods).")
        return

    df = pd.DataFrame(growth_metrics)
    # Pivot: metric_name × period
    pivot = df.pivot_table(
        index="metric_name", columns="period_end_date",
        values="metric_value", aggfunc="first",
    )
    # Format as percentages
    styled = pivot.map(lambda x: fmt_percent(x) if pd.notna(x) else "—")
    st.dataframe(styled, use_container_width=True)

    # Bar chart for latest growth rates
    if not df.empty:
        latest_period = df["period_end_date"].max()
        latest = df[df["period_end_date"] == latest_period][["metric_name", "metric_value"]].copy()
        latest.columns = ["Metric", "Growth"]
        latest["Growth %"] = latest["Growth"] * 100
        st.subheader(f"Growth Rates — {latest_period}")
        st.bar_chart(latest.set_index("Metric")["Growth %"])


# ── stock score tab ───────────────────────────────────────────────────

def _render_score_tab(
    stock_id: int, user_id: int, db: AnalysisDatabase
) -> None:
    mc = MetricsCalculator(db)

    st.subheader("🏆 CFA-Based Stock Score")
    st.caption(
        "Composite score (0-100) weighted: "
        "Fundamentals 30%, Valuation 25%, Growth 25%, Quality 20%."
    )

    if st.button("🔄 Compute Score", type="primary", key="compute_score"):
        with st.spinner("Scoring…"):
            result = mc.compute_stock_score(stock_id, user_id)
        if result.get("error"):
            st.warning(result["error"])
            return
        st.success("✅ Score computed and saved")

    # Show latest score
    scores = db.get_scores(stock_id)
    if not scores:
        st.info("Click **Compute Score** after calculating metrics.")
        return

    latest = scores[0]
    overall = latest.get("overall_score")

    st.markdown(f"### {score_emoji(overall)} Overall Score: **{overall}** / 100")
    st.progress(overall / 100 if overall else 0)

    c1, c2, c3, c4 = st.columns(4)
    fund = latest.get("fundamental_score")
    c1.metric(f"{score_emoji(fund)} Fundamentals", f"{fund}/100" if fund else "—")
    val = latest.get("valuation_score")
    c2.metric(f"{score_emoji(val)} Valuation", f"{val}/100" if val else "—")
    growth = latest.get("growth_score")
    c3.metric(f"{score_emoji(growth)} Growth", f"{growth}/100" if growth else "—")
    qual = latest.get("quality_score")
    c4.metric(f"{score_emoji(qual)} Quality", f"{qual}/100" if qual else "—")

    # Score history
    if len(scores) > 1:
        st.subheader("Score History")
        hist_df = pd.DataFrame(scores)[
            ["scoring_date", "overall_score", "fundamental_score",
             "valuation_score", "growth_score", "quality_score"]
        ]
        st.dataframe(hist_df, use_container_width=True, hide_index=True)
        st.line_chart(
            hist_df.set_index("scoring_date")["overall_score"],
        )

    # Detailed metrics that fed the score
    details_raw = latest.get("details")
    if details_raw:
        details = json.loads(details_raw) if isinstance(details_raw, str) else details_raw
        with st.expander("📋 Score Input Details"):
            for k, v in details.items():
                st.write(f"**{k}:** {fmt_number(v, decimals=4) if isinstance(v, (int, float)) else v}")

    # Analyst notes
    notes = st.text_area(
        "Analyst Notes", value=latest.get("analyst_notes") or "",
        key="score_notes",
    )
    if st.button("💾 Save Notes", key="save_notes"):
        db.execute_update(
            "UPDATE stock_scores SET analyst_notes = ? WHERE id = ?",
            (notes, latest["id"]),
        )
        st.success("Notes saved")
