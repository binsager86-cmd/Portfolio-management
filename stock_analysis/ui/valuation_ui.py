"""
Valuation UI — Interactive valuation model calculators:
Graham Valuation Model, DCF, Multiples, DDM, combined Result.
"""

import json
import math
import streamlit as st
import pandas as pd
from datetime import date
from typing import Any, Dict, List, Optional

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.models.stock_profile import StockProfileManager
from stock_analysis.models.valuation_models import ValuationModels
from stock_analysis.models.financial_data import FinancialDataManager
from stock_analysis.utils.helpers import fmt_number, fmt_percent, iso_today
from stock_analysis.config import VALUATION_MODEL_TYPES


def _get_db() -> AnalysisDatabase:
    if "analysis_db" not in st.session_state:
        st.session_state["analysis_db"] = AnalysisDatabase()
    return st.session_state["analysis_db"]


# ── helpers shared across tabs ─────────────────────────────────────────

def _fetch_price(symbol: str) -> Optional[float]:
    """Fetch current / last-close price from Yahoo Finance.

    Kuwaiti (.KW) tickers are quoted in fils on Yahoo; divide by 1000
    to convert to KWD.
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
        raw: Optional[float] = None
        for field in ("currentPrice", "regularMarketPrice",
                      "previousClose", "regularMarketPreviousClose"):
            p = info.get(field)
            if p and float(p) > 0:
                raw = float(p)
                break
        if raw is None:
            hist = ticker.history(period="5d")
            if hist is not None and not hist.empty:
                raw = float(hist["Close"].iloc[-1])
        if raw is not None and symbol.upper().endswith(".KW"):
            raw = raw / 1000.0
        return raw
    except Exception:
        pass
    return None


def _item_amount(items: Dict[str, Any], *codes: str) -> Optional[float]:
    """Look up a line-item amount by canonical codes + variant fallback.

    Replicates the logic from fundamental_analysis_ui but is self-contained
    so the valuation module has no circular import dependency.
    """
    from stock_analysis.ui.fundamental_analysis_ui import _get_item_amount
    return _get_item_amount(items, *codes)


# ── main entry ─────────────────────────────────────────────────────────

def render_valuation_page(user_id: int = 1) -> None:
    st.header("💰 Valuation Models")
    st.caption(
        "Compute intrinsic value using CFA-aligned models. "
        "Results are saved for comparison."
    )

    db = _get_db()
    mgr = StockProfileManager(db)
    vm = ValuationModels(db)
    stocks = mgr.list_stocks(user_id)

    if not stocks:
        st.warning("Create a stock profile first.")
        return

    options = {f"{s['symbol']} — {s['company_name']}": s for s in stocks}
    choice = st.selectbox("Select stock", list(options.keys()), key="val_stock_sel")
    stock = options[choice]
    stock_id = stock["id"]

    tab_graham, tab_dcf, tab_multiples, tab_ddm, tab_result = st.tabs([
        "📏 Graham Valuation",
        "📉 Discounted Cash Flow",
        "🔢 Multiple Model",
        "💵 Dividend Discount",
        "📊 Result",
    ])

    with tab_graham:
        _render_graham(stock_id, user_id, stock, db, vm)
    with tab_dcf:
        _render_dcf(stock_id, user_id, stock, db, vm)
    with tab_multiples:
        _render_multiples(stock_id, user_id, stock, db, vm)
    with tab_ddm:
        _render_ddm(stock_id, user_id, stock, db, vm)
    with tab_result:
        _render_result(stock_id, user_id, stock, db, vm)


# ── 1. Graham Valuation Model ────────────────────────────────────────

def _render_graham(
    stock_id: int, user_id: int, stock: Dict, db: AnalysisDatabase, vm: ValuationModels
) -> None:
    """Graham Valuation — Original (A) & Revised (B) formulas.

    Workflow:  auto-fetch data → edit params → 💾 Save → 🔄 Calculate
    """
    st.subheader("📏 Graham Valuation Model")

    # ── session-state keys (per stock) ───────────────────────────
    _P = f"graham_params_{stock_id}"   # saved parameter dict
    _C = f"graham_calc_{stock_id}"     # True when results should show

    fdm = FinancialDataManager(db)
    financials = fdm.get_stock_financials(stock_id)

    outstanding = float(stock.get("outstanding_shares") or 0)
    symbol = stock.get("symbol", "")

    # ── Auto-fetch: Trailing EPS ─────────────────────────────────
    eps: Optional[float] = None
    latest_fy: Optional[str] = None
    eps_series_map: Dict[str, float] = {}  # year → eps (for growth table)

    if outstanding and financials.get("income"):
        annual_keys = sorted(
            k for k in financials["income"] if "Q" not in k.upper()
        )
        for k in annual_keys:
            ni = _item_amount(
                financials["income"][k].get("items", {}), "NET_INCOME"
            )
            if ni is not None:
                eps_series_map[k] = ni / outstanding
        if annual_keys:
            latest_fy = annual_keys[-1]
            if latest_fy in eps_series_map:
                eps = eps_series_map[latest_fy]

    # ── Auto-fetch: Current Price ────────────────────────────────
    price: Optional[float] = None
    if symbol:
        with st.spinner(f"Fetching price for {symbol}…"):
            price = _fetch_price(symbol)

    # ── Auto-compute: Historical EPS Growth (CAGR) ───────────────
    growth_default = 1.0  # 1 % fallback
    positive_eps = [v for v in eps_series_map.values() if v > 0]
    if len(positive_eps) >= 2 and positive_eps[0] > 0:
        n = len(positive_eps) - 1
        cagr = (positive_eps[-1] / positive_eps[0]) ** (1.0 / n) - 1.0
        growth_default = round(cagr * 100, 2)

    # ── Display auto-fetched values ──────────────────────────────
    m1, m2, m3 = st.columns(3)
    m1.metric(
        "Trailing EPS",
        f"{eps:,.4f}" if eps else "—",
        help=f"FY {latest_fy}" if latest_fy else "",
    )
    m2.metric(
        "Current Price",
        f"{price:,.3f}" if price else "—",
        help=f"Yahoo Finance · {symbol}",
    )
    m3.metric(
        "Hist. EPS Growth (CAGR)",
        f"{growth_default:.2f}%",
        help="CAGR of annual EPS over available years",
    )

    # ── EPS per year breakdown ───────────────────────────────────
    if eps_series_map:
        with st.expander("📈 EPS by Year", expanded=False):
            rows = [(yr, round(e, 4)) for yr, e in sorted(eps_series_map.items())]
            st.dataframe(
                pd.DataFrame(rows, columns=["Fiscal Year", "EPS"]),
                hide_index=True,
                use_container_width=True,
            )

    if not eps:
        st.warning(
            "⚠️ Cannot compute — set **Outstanding Shares** in stock "
            "profile and ensure income statements are uploaded."
        )
        return
    if not price:
        st.warning(f"⚠️ Could not fetch current price for **{symbol}**.")
        return

    # ── Editable Parameters (double-click to edit) ───────────────
    st.divider()
    st.markdown("#### ✏️ Adjustable Parameters  *(double-click a value to edit)*")

    # Defaults: use saved values if available, otherwise auto-computed
    saved = st.session_state.get(_P, {})

    edit_df = pd.DataFrame({
        "Parameter": [
            "EPS (Trailing)",
            "Growth Rate (g) %",
            "Y — Current AAA Bond Yield %",
            "Margin of Safety %",
        ],
        "Value": [
            saved.get("eps", round(eps, 4)),
            saved.get("g", round(growth_default, 2)),
            saved.get("y", 3.75),
            saved.get("mos", 15.0),
        ],
        "Description": [
            f"Auto: Net Income ÷ Shares (FY {latest_fy})",
            f"Auto CAGR: {growth_default:.2f}% — override as needed",
            "Current yield on AAA corporate bonds",
            "Safety cushion below intrinsic value",
        ],
    })

    edited = st.data_editor(
        edit_df,
        key=f"graham_edit_{stock_id}",
        disabled=["Parameter", "Description"],
        hide_index=True,
        use_container_width=True,
        column_config={
            "Parameter": st.column_config.TextColumn(width="large"),
            "Value": st.column_config.NumberColumn(format="%.4f"),
            "Description": st.column_config.TextColumn(width="large"),
        },
    )

    # ── Save & Calculate buttons ─────────────────────────────────
    btn_col1, btn_col2, _ = st.columns([1, 1, 3])

    with btn_col1:
        if st.button("💾  Save Parameters", key=f"graham_save_{stock_id}",
                      use_container_width=True, type="secondary"):
            st.session_state[_P] = {
                "eps": float(edited.iloc[0]["Value"]),
                "g":   float(edited.iloc[1]["Value"]),
                "y":   float(edited.iloc[2]["Value"]),
                "mos": float(edited.iloc[3]["Value"]),
            }
            st.toast("✅ Parameters saved!", icon="💾")

    with btn_col2:
        if st.button("🔄  Calculate", key=f"graham_calc_btn_{stock_id}",
                      use_container_width=True, type="primary"):
            # Persist params + set calculated flag
            st.session_state[_P] = {
                "eps": float(edited.iloc[0]["Value"]),
                "g":   float(edited.iloc[1]["Value"]),
                "y":   float(edited.iloc[2]["Value"]),
                "mos": float(edited.iloc[3]["Value"]),
            }
            st.session_state[_C] = True

    # ── Only show results after Calculate is pressed ─────────────
    if not st.session_state.get(_C, False):
        st.info("👆 Adjust parameters above then press **🔄 Calculate** to see results.")
        return

    p = st.session_state[_P]
    calc_eps = p["eps"]
    g        = p["g"]
    y        = p["y"]
    mos      = p["mos"]

    if y <= 0:
        st.error("Y (Current AAA Bond Yield) must be positive.")
        return
    if calc_eps <= 0:
        st.error("EPS must be positive for Graham valuation.")
        return

    # ══════════════════════════════════════════════════════════════
    # A. ORIGINAL: IV = (EPS × (8.5 + 2g) × 4.4) / Y
    # ══════════════════════════════════════════════════════════════
    st.divider()
    st.markdown("### A. Graham's Original Valuation Formula")
    st.latex(r"IV = \frac{EPS \times (8.5 + 2g) \times 4.4}{Y}")

    iv_a = (calc_eps * (8.5 + 2 * g) * 4.4) / y
    diff_a = (price / iv_a) * 100 if iv_a else 0
    buy_a = (1 - mos / 100) * iv_a
    signal_a = price <= buy_a

    full_a = pd.DataFrame(
        [
            ("EPS", f"{calc_eps:,.4f}", "Trailing EPS (editable above)"),
            ("P/E of company w/ no growth", "8.5", "Fixed constant"),
            ("Growth Rate (g)", f"{g:.2f}", "Projected (editable above)"),
            ("2g", f"{2 * g:.2f}", "2 × Growth Rate"),
            ("Avg yield of AAA corp. bond", "4.4", "Historical constant"),
            ("Y (Current AAA Yield)", f"{y:.2f}", "Current (editable above)"),
            ("Intrinsic Value", f"{iv_a:,.4f}", "Calculated"),
            ("", "", ""),
            ("Current Price", f"{price:,.3f}", "Yahoo Finance"),
            ("Difference", f"{diff_a:.2f}%", "Price ÷ Intrinsic Value × 100"),
            ("Margin of Safety", f"{mos:.2f}%", "Editable above"),
            ("Acceptable Buy Price", f"{buy_a:,.4f}", "(1 − Margin) × IV"),
            (
                "Buy / Sell",
                "BUY 🟢" if signal_a else "SELL 🔴",
                "BUY when Price ≤ Acceptable Buy Price",
            ),
        ],
        columns=["Parameter", "Value", "Description"],
    )
    st.dataframe(full_a, hide_index=True, use_container_width=True)

    # ══════════════════════════════════════════════════════════════
    # B. REVISED: IV = (EPS × (7 + g) × 4.4) / Y
    # ══════════════════════════════════════════════════════════════
    st.divider()
    st.markdown("### B. Graham's Revised Valuation Formula")
    st.latex(r"IV = \frac{EPS \times (7 + g) \times 4.4}{Y}")

    iv_b = (calc_eps * (7 + g) * 4.4) / y
    diff_b = (price / iv_b) * 100 if iv_b else 0
    buy_b = (1 - mos / 100) * iv_b
    signal_b = price <= buy_b

    full_b = pd.DataFrame(
        [
            ("EPS", f"{calc_eps:,.4f}", "Trailing EPS (editable above)"),
            ("P/E of company w/ no growth", "7", "Fixed constant (revised)"),
            ("Growth Rate (g)", f"{g:.2f}", "Projected (editable above)"),
            ("g", f"{g:.2f}", "1 × Growth Rate"),
            ("Avg yield of AAA corp. bond", "4.4", "Historical constant"),
            ("Y (Current AAA Yield)", f"{y:.2f}", "Current (editable above)"),
            ("Intrinsic Value", f"{iv_b:,.4f}", "Calculated"),
            ("", "", ""),
            ("Current Price", f"{price:,.3f}", "Yahoo Finance"),
            ("Difference", f"{diff_b:.2f}%", "Price ÷ Intrinsic Value × 100"),
            ("Margin of Safety", f"{mos:.2f}%", "Editable above"),
            ("Acceptable Buy Price", f"{buy_b:,.4f}", "(1 − Margin) × IV"),
            (
                "Buy / Sell",
                "BUY 🟢" if signal_b else "SELL 🔴",
                "BUY when Price ≤ Acceptable Buy Price",
            ),
        ],
        columns=["Parameter", "Value", "Description"],
    )
    st.dataframe(full_b, hide_index=True, use_container_width=True)

    # ══════════════════════════════════════════════════════════════
    # AVERAGE of A & B
    # ══════════════════════════════════════════════════════════════
    st.divider()
    avg_iv = (iv_a + iv_b) / 2
    avg_buy = (1 - mos / 100) * avg_iv
    avg_diff = (price / avg_iv) * 100 if avg_iv else 0
    avg_signal = price <= avg_buy

    st.markdown("### Average Intrinsic Value (A + B)")
    ac1, ac2, ac3, ac4 = st.columns(4)
    ac1.metric("Avg Intrinsic Value", f"{avg_iv:,.4f}")
    ac2.metric("Avg Acceptable Buy", f"{avg_buy:,.4f}")
    ac3.metric("Avg Difference", f"{avg_diff:.2f}%")
    if avg_signal:
        ac4.metric("Signal", "BUY 🟢")
    else:
        ac4.metric("Signal", "SELL 🔴")

    # ── Save to DB button ────────────────────────────────────────
    st.divider()
    if st.button("💾  Save Result to Database", key=f"graham_db_save_{stock_id}",
                  type="secondary"):
        result = {
            "model": "graham",
            "intrinsic_value": round(avg_iv, 4),
            "parameters": {
                "eps": calc_eps,
                "growth_rate": g,
                "aaa_yield": y,
                "margin_of_safety": mos,
                "iv_original": round(iv_a, 4),
                "iv_revised": round(iv_b, 4),
                "price": price,
            },
            "assumptions": {
                "formula_a": "EPS × (8.5 + 2g) × 4.4 / Y",
                "formula_b": "EPS × (7 + g) × 4.4 / Y",
            },
        }
        vm.save_result(stock_id, result, user_id)
        st.success("✅ Graham valuation saved to database!")


# ── 2. Discounted Cash Flow ──────────────────────────────────────────

def _render_dcf(
    stock_id: int, user_id: int, stock: Dict, db: AnalysisDatabase, vm: ValuationModels
) -> None:
    """Full CFA-level two-stage DCF with WACC computation."""
    st.subheader("📉 Discounted Cash Flow (DCF)")

    # ── session-state keys ───────────────────────────────────────
    _P = f"dcf_params_{stock_id}"
    _C = f"dcf_calc_{stock_id}"

    fdm = FinancialDataManager(db)
    financials = fdm.get_stock_financials(stock_id)
    outstanding = float(stock.get("outstanding_shares") or 0)
    symbol = stock.get("symbol", "")

    if not outstanding:
        st.warning("⚠️ Set **Outstanding Shares** in stock profile first.")
        return

    # ── helpers (local) ──────────────────────────────────────────
    def _fcf(cf_items: Dict) -> Optional[float]:
        cfo = _item_amount(cf_items, "CASH_FROM_OPERATIONS")
        capex = _item_amount(cf_items, "CAPITAL_EXPENDITURES")
        if cfo is None:
            return None
        if capex is None:
            return cfo  # no capex → assume 0
        return cfo - abs(capex)

    # ================================================================
    # 2.1  HISTORICAL FREE CASH FLOW + GROWTH
    # ================================================================
    st.markdown("#### 2.1 Historical Free Cash Flow")

    annual_cf_keys = sorted(
        k for k in (financials.get("cashflow") or {}) if "Q" not in k.upper()
    )
    hist_years: List[str] = []
    hist_fcf: List[Optional[float]] = []
    for k in annual_cf_keys:
        items = financials["cashflow"][k].get("items", {})
        fcf_val = _fcf(items)
        hist_years.append(k)
        hist_fcf.append(fcf_val)

    # Growth rates
    hist_growth: List[Optional[float]] = [None]  # first year has no growth
    for i in range(1, len(hist_fcf)):
        if hist_fcf[i] is not None and hist_fcf[i - 1] and hist_fcf[i - 1] != 0:
            hist_growth.append((hist_fcf[i] - hist_fcf[i - 1]) / abs(hist_fcf[i - 1]) * 100)
        else:
            hist_growth.append(None)

    if hist_years:
        fcf_row = {yr: (f"{v:,.0f}" if v is not None else "—") for yr, v in zip(hist_years, hist_fcf)}
        growth_row = {yr: (f"{g:.2f}%" if g is not None else "—") for yr, g in zip(hist_years, hist_growth)}
        hist_df = pd.DataFrame([fcf_row, growth_row], index=["Free Cash Flow", "Growth"])
        st.dataframe(hist_df, use_container_width=True)
    else:
        st.info("No cash flow statements found.")
        return

    # Last available FCF
    last_fcf: Optional[float] = None
    last_fy: Optional[str] = None
    for yr, val in reversed(list(zip(hist_years, hist_fcf))):
        if val is not None:
            last_fcf = val
            last_fy = yr
            break

    if last_fcf is None or last_fcf <= 0:
        st.warning("⚠️ No positive historical FCF found — cannot project.")
        return

    # Average growth rate (of non-None)
    valid_growths = [g for g in hist_growth if g is not None]
    avg_growth = sum(valid_growths) / len(valid_growths) if valid_growths else 5.0

    # ================================================================
    # 2.2  GROWTH RATE INPUT
    # ================================================================
    st.divider()
    st.markdown("#### 2.2 Growth Rate")
    gc1, gc2 = st.columns(2)
    gc1.metric("Average Historical Growth", f"{avg_growth:.2f}%",
               help="Average of annual FCF growth rates")

    # ================================================================
    # 2.4  WACC COMPONENTS (auto-computed)
    # ================================================================
    # ── Fetch price ──────────────────────────────────────────────
    price: Optional[float] = None
    if symbol:
        with st.spinner(f"Fetching price for {symbol}…"):
            price = _fetch_price(symbol)

    # ── Beta from yfinance ───────────────────────────────────────
    beta_val = 1.0
    try:
        import yfinance as yf
        info = yf.Ticker(symbol).info or {}
        b = info.get("beta")
        if b and float(b) > 0:
            beta_val = round(float(b), 4)
    except Exception:
        pass

    # ── Latest balance sheet items ───────────────────────────────
    annual_bal_keys = sorted(
        k for k in (financials.get("balance") or {}) if "Q" not in k.upper()
    )
    latest_bal_items: Dict = {}
    if annual_bal_keys:
        latest_bal_items = financials["balance"][annual_bal_keys[-1]].get("items", {})

    # Total debt
    lt_debt = abs(_item_amount(latest_bal_items, "LONG_TERM_DEBT") or 0)
    cur_debt = abs(_item_amount(latest_bal_items, "SHORT_TERM_DEBT") or 0)
    cur_portion = abs(_item_amount(latest_bal_items, "CURRENT_PORTION_OF_LONG_TERM_DEBTS") or 0)
    total_debt = lt_debt + cur_debt + cur_portion

    # Cash & equivalents
    cash_eq = abs(_item_amount(latest_bal_items, "CASH_EQUIVALENTS") or 0)

    # ── Latest income statement items ────────────────────────────
    annual_inc_keys = sorted(
        k for k in (financials.get("income") or {}) if "Q" not in k.upper()
    )
    latest_inc_items: Dict = {}
    if annual_inc_keys:
        latest_inc_items = financials["income"][annual_inc_keys[-1]].get("items", {})

    # Finance cost
    finance_cost = abs(_item_amount(latest_inc_items, "INTEREST_EXPENSE") or 0)

    # Cost of debt: Rd = Finance Cost / Total Debt (if debt > 0)
    cost_of_debt_pct = (finance_cost / total_debt * 100) if total_debt > 0 else 0.0

    # ── Corporate tax (Kuwait: KFAS + NLST + ZAKAT) ──────────────
    kfas = abs(_item_amount(latest_inc_items, "CONTRIBUTION_TO_KFAS") or 0)
    nlst = abs(_item_amount(latest_inc_items, "NLST") or 0)
    zakat = abs(_item_amount(latest_inc_items, "ZAKAT") or 0)
    profit_before_tax = abs(_item_amount(latest_inc_items, "OPERATING_INCOME") or 0)
    total_tax = kfas + nlst + zakat
    corp_tax_pct = (total_tax / profit_before_tax * 100) if profit_before_tax > 0 else 4.5

    # ── Market value of equity ───────────────────────────────────
    mkt_equity = (outstanding * price) if price else 0

    # ── Cost of equity via CAPM: Re = Rf + β × MRP ──────────────
    #    Default risk-free & market risk premium for Kuwait
    rf_default = 3.50    # Kuwait Central Bank discount rate (CBK cut to 4.00% Sep-2024, est. ~3.50% by early 2026)
    mrp_default = 7.0    # Emerging-market equity risk premium
    re_default = round(rf_default + beta_val * mrp_default, 2)

    # ── WACC ─────────────────────────────────────────────────────
    total_capital = mkt_equity + total_debt
    if total_capital > 0:
        wacc_default = round(
            (mkt_equity / total_capital) * re_default +
            (total_debt / total_capital) * cost_of_debt_pct * (1 - corp_tax_pct / 100),
            2
        )
    else:
        wacc_default = re_default

    # ================================================================
    # EDITABLE PARAMETERS
    # ================================================================
    st.divider()
    st.markdown("#### ✏️ Adjustable Parameters  *(double-click a value to edit)*")

    saved = st.session_state.get(_P, {})

    # Market selector for risk-free / MRP
    market_choice = st.radio(
        "Market for risk-free rate & market premium",
        ["Kuwait", "USA"],
        horizontal=True,
        key=f"dcf_market_{stock_id}",
    )
    if market_choice == "USA":
        rf_auto = 4.00   # ~10Y US Treasury (est. early 2026)
        mrp_auto = 5.5   # Damodaran US ERP
    else:
        rf_auto = 3.50   # Kuwait CBK discount rate (est. early 2026)
        mrp_auto = 7.0   # Emerging-market ERP

    re_auto = round(rf_auto + beta_val * mrp_auto, 2)

    edit_df = pd.DataFrame({
        "Parameter": [
            "Growth Rate (%)",
            "Projection Years",
            "Perpetual Growth Rate (%)",
            "Risk-Free Rate (%)",
            "Market Risk Premium (%)",
            "Beta",
            "Cost of Equity — Re (%)",
            "Cost of Debt — Rd (%)",
            "Corporate Tax Rate (%)",
            "WACC / Discount Rate (%)",
        ],
        "Value": [
            saved.get("g", round(avg_growth, 2)),
            saved.get("proj_yrs", 9),
            saved.get("perp_g", 1.5),
            saved.get("rf", rf_auto),
            saved.get("mrp", mrp_auto),
            saved.get("beta", beta_val),
            saved.get("re", re_auto),
            saved.get("rd", round(cost_of_debt_pct, 2)),
            saved.get("tc", round(corp_tax_pct, 2)),
            saved.get("wacc", wacc_default),
        ],
        "Auto-Source": [
            f"Avg hist. growth: {avg_growth:.2f}%",
            "Default 9 years",
            "AI estimate for Kuwait",
            f"{'US 10Y Treasury' if market_choice == 'USA' else 'Kuwait CBK rate'}",
            f"{'Damodaran US ERP' if market_choice == 'USA' else 'Emerging-mkt ERP'}",
            f"yfinance: {beta_val}",
            f"CAPM: {rf_auto} + {beta_val} × {mrp_auto}",
            f"Finance Cost / Total Debt",
            f"KFAS+NLST+ZAKAT / Pre-tax profit",
            f"Computed WACC: {wacc_default}%",
        ],
    })

    edited = st.data_editor(
        edit_df,
        key=f"dcf_edit_{stock_id}",
        disabled=["Parameter", "Auto-Source"],
        hide_index=True,
        use_container_width=True,
        column_config={
            "Parameter": st.column_config.TextColumn(width="large"),
            "Value": st.column_config.NumberColumn(format="%.2f"),
            "Auto-Source": st.column_config.TextColumn(width="large"),
        },
    )

    # ── WACC breakdown expander ──────────────────────────────────
    with st.expander("📐 WACC Calculation Breakdown", expanded=False):
        st.latex(r"WACC = \frac{E}{E+D} \times R_e + \frac{D}{E+D} \times R_d \times (1 - T_c)")
        wacc_rows = [
            ("E — Market Value of Equity", f"{mkt_equity:,.0f}", f"Shares ({outstanding:,.0f}) × Price ({price:,.3f})" if price else "—"),
            ("D — Total Debt", f"{total_debt:,.0f}", f"LT Debt ({lt_debt:,.0f}) + Current ({cur_portion:,.0f}) + ST ({cur_debt:,.0f})"),
            ("E + D", f"{total_capital:,.0f}", "Total Capital"),
            ("E / (E+D)", f"{mkt_equity / total_capital * 100:.2f}%" if total_capital else "—", "Equity weight"),
            ("D / (E+D)", f"{total_debt / total_capital * 100:.2f}%" if total_capital else "—", "Debt weight"),
            ("Rf — Risk-Free Rate", f"{rf_auto:.2f}%", market_choice),
            ("β — Beta", f"{beta_val:.4f}", "yfinance"),
            ("MRP — Market Risk Premium", f"{mrp_auto:.2f}%", market_choice),
            ("Re — Cost of Equity (CAPM)", f"{re_auto:.2f}%", f"Rf + β × MRP"),
            ("Finance Cost (annual)", f"{finance_cost:,.0f}", "From income statement"),
            ("Rd — Cost of Debt", f"{cost_of_debt_pct:.2f}%", "Finance Cost / Total Debt"),
            ("KFAS", f"{kfas:,.0f}", "From income statement"),
            ("NLST", f"{nlst:,.0f}", "From income statement"),
            ("ZAKAT", f"{zakat:,.0f}", "From income statement"),
            ("Tc — Corporate Tax Rate", f"{corp_tax_pct:.2f}%", "(KFAS + NLST + ZAKAT) / Pre-tax Profit"),
            ("WACC", f"{wacc_default:.2f}%", "Computed"),
        ]
        st.dataframe(
            pd.DataFrame(wacc_rows, columns=["Component", "Value", "Source"]),
            hide_index=True, use_container_width=True,
        )

    # ── Save & Calculate buttons ─────────────────────────────────
    btn1, btn2, _ = st.columns([1, 1, 3])
    with btn1:
        if st.button("💾  Save Parameters", key=f"dcf_save_{stock_id}",
                      use_container_width=True, type="secondary"):
            st.session_state[_P] = {
                "g":        float(edited.iloc[0]["Value"]),
                "proj_yrs": int(edited.iloc[1]["Value"]),
                "perp_g":   float(edited.iloc[2]["Value"]),
                "rf":       float(edited.iloc[3]["Value"]),
                "mrp":      float(edited.iloc[4]["Value"]),
                "beta":     float(edited.iloc[5]["Value"]),
                "re":       float(edited.iloc[6]["Value"]),
                "rd":       float(edited.iloc[7]["Value"]),
                "tc":       float(edited.iloc[8]["Value"]),
                "wacc":     float(edited.iloc[9]["Value"]),
            }
            st.toast("✅ Parameters saved!", icon="💾")

    with btn2:
        if st.button("🔄  Calculate", key=f"dcf_calc_btn_{stock_id}",
                      use_container_width=True, type="primary"):
            st.session_state[_P] = {
                "g":        float(edited.iloc[0]["Value"]),
                "proj_yrs": int(edited.iloc[1]["Value"]),
                "perp_g":   float(edited.iloc[2]["Value"]),
                "rf":       float(edited.iloc[3]["Value"]),
                "mrp":      float(edited.iloc[4]["Value"]),
                "beta":     float(edited.iloc[5]["Value"]),
                "re":       float(edited.iloc[6]["Value"]),
                "rd":       float(edited.iloc[7]["Value"]),
                "tc":       float(edited.iloc[8]["Value"]),
                "wacc":     float(edited.iloc[9]["Value"]),
            }
            st.session_state[_C] = True

    if not st.session_state.get(_C, False):
        st.info("👆 Adjust parameters above then press **🔄 Calculate** to see projections.")
        return

    # ── Read saved params ────────────────────────────────────────
    p = st.session_state[_P]
    g_rate    = p["g"] / 100.0
    proj_yrs  = int(p["proj_yrs"])
    perp_g    = p["perp_g"] / 100.0
    wacc      = p["wacc"] / 100.0

    if wacc <= perp_g:
        st.error("WACC must be greater than Perpetual Growth Rate.")
        return
    if wacc <= 0:
        st.error("WACC must be positive.")
        return

    # ================================================================
    # 2.3  FUTURE FREE CASH FLOW PROJECTIONS
    # ================================================================
    st.divider()
    st.markdown("#### 2.3 Future Free Cash Flow Projections")
    st.latex(r"FFCF_t = FFCF_{t-1} \times (1 + g)")
    st.latex(r"PV_t = \frac{FFCF_t}{(1 + WACC)^t}")
    st.latex(r"TV = \frac{FFCF_n \times (1 + g_{\infty})}{WACC - g_{\infty}}")

    start_year = int(last_fy) + 1 if last_fy and last_fy.isdigit() else date.today().year + 1

    proj_years_labels = [str(start_year + i) for i in range(proj_yrs)] + ["Terminal Value"]
    proj_fcf: List[float] = []
    proj_pv: List[float] = []

    cf = last_fcf
    for t in range(1, proj_yrs + 1):
        cf = cf * (1 + g_rate)
        pv = cf / ((1 + wacc) ** t)
        proj_fcf.append(cf)
        proj_pv.append(pv)

    # Terminal value (Gordon Growth — CFA Level III)
    # TV_n = FCF_{n+1} / (WACC − g∞)  where FCF_{n+1} = FCF_n × (1 + g∞)
    # TV sits at end of year n → discount by (1 + WACC)^n
    fcf_n = proj_fcf[-1]                              # last projected FCF
    fcf_n_plus_1 = fcf_n * (1 + perp_g)              # first year of perpetuity
    terminal_value = fcf_n_plus_1 / (wacc - perp_g)  # TV at end of year n
    pv_terminal = terminal_value / ((1 + wacc) ** proj_yrs)  # PV to today

    proj_fcf.append(terminal_value)
    proj_pv.append(pv_terminal)

    proj_df = pd.DataFrame({
        "Year": proj_years_labels,
        "Future FCF": [f"{v:,.0f}" for v in proj_fcf],
        "PV of FFCF": [f"{v:,.0f}" for v in proj_pv],
    })
    st.dataframe(proj_df, hide_index=True, use_container_width=True)

    # ================================================================
    # 2.5  DCF RESULT
    # ================================================================
    st.divider()
    st.markdown("#### 2.5 DCF Valuation Result")

    sum_pv_projected = sum(proj_pv[:-1])   # PV of projected FCFs only (excl TV)
    total_enterprise = sum_pv_projected + pv_terminal
    equity_value = total_enterprise + cash_eq - total_debt
    dcf_price = equity_value / outstanding if outstanding else 0

    diff_pct = 0.0
    if price and dcf_price:
        diff_pct = ((dcf_price - price) / price) * 100

    # TV as % of Enterprise Value (CFA Level III reasonableness check)
    tv_pct = (pv_terminal / total_enterprise * 100) if total_enterprise else 0

    result_rows = [
        ("Sum of PV of Projected FCFs", f"{sum_pv_projected:,.0f}"),
        ("PV of Terminal Value", f"{pv_terminal:,.0f}"),
        ("Total Enterprise Value", f"{total_enterprise:,.0f}"),
        ("( + ) Cash & Cash Equivalents", f"{cash_eq:,.0f}"),
        ("( − ) Total Debt", f"{total_debt:,.0f}"),
        ("Equity Value", f"{equity_value:,.0f}"),
        ("Shares Outstanding", f"{outstanding:,.0f}"),
        ("**DCF Price per Share**", f"**{dcf_price:,.4f}**"),
        ("", ""),
        ("Current Price", f"{price:,.3f}" if price else "—"),
        ("Difference", f"{diff_pct:+.2f}%"),
        ("TV as % of EV", f"{tv_pct:.1f}%"),
    ]
    st.dataframe(
        pd.DataFrame(result_rows, columns=["Item", "Value"]),
        hide_index=True, use_container_width=True,
    )

    # TV reasonableness check (CFA Level III)
    if tv_pct > 75:
        st.warning(
            f"⚠️ Terminal Value = **{tv_pct:.1f}%** of Enterprise Value. "
            "CFA guidance: if TV > 75%, the model is highly sensitive to "
            "g∞ and WACC assumptions. Consider stress-testing."
        )

    # Metric cards
    rc1, rc2, rc3 = st.columns(3)
    rc1.metric("DCF Price", f"{dcf_price:,.4f}")
    rc2.metric("Current Price", f"{price:,.3f}" if price else "—")
    if price:
        signal = "UNDERVALUED 🟢" if dcf_price > price else "OVERVALUED 🔴"
        rc3.metric("Signal", signal, delta=f"{diff_pct:+.2f}%")

    # ── Terminal Value breakdown (expandable) ────────────────────
    with st.expander("📐 Terminal Value Breakdown (CFA Level III)"):
        st.latex(r"TV_n = \frac{FCF_n \times (1 + g_{\infty})}{WACC - g_{\infty}}")
        st.latex(r"PV(TV) = \frac{TV_n}{(1 + WACC)^n}")
        tv_detail = pd.DataFrame([
            ("FCF at year n (last projected)", f"{fcf_n:,.0f}"),
            ("FCF at year n+1 = FCF_n × (1 + g∞)", f"{fcf_n_plus_1:,.0f}"),
            ("WACC", f"{wacc * 100:.2f}%"),
            ("Perpetual Growth Rate (g∞)", f"{perp_g * 100:.2f}%"),
            ("WACC − g∞", f"{(wacc - perp_g) * 100:.2f}%"),
            ("**Terminal Value at year n**", f"**{terminal_value:,.0f}**"),
            ("Discount factor = (1 + WACC)^n", f"{(1 + wacc) ** proj_yrs:.6f}"),
            ("**PV of Terminal Value**", f"**{pv_terminal:,.0f}**"),
            ("TV as % of Enterprise Value", f"{tv_pct:.1f}%"),
        ], columns=["Component", "Value"])
        st.dataframe(tv_detail, hide_index=True, use_container_width=True)
        st.caption(
            "CFA Level III: g∞ should be ≤ long-run nominal GDP growth (1–3%). "
            "TV typically represents 60–80% of total enterprise value."
        )

    # ── Save to DB ───────────────────────────────────────────────
    st.divider()
    if st.button("💾  Save DCF Result to Database", key=f"dcf_db_save_{stock_id}",
                  type="secondary"):
        result = {
            "model": "dcf",
            "intrinsic_value": round(dcf_price, 4),
            "parameters": {
                "last_fcf": last_fcf,
                "growth_rate": p["g"],
                "projection_years": proj_yrs,
                "perpetual_growth": p["perp_g"],
                "wacc": p["wacc"],
                "beta": p["beta"],
                "cost_of_equity": p["re"],
                "cost_of_debt": p["rd"],
                "tax_rate": p["tc"],
                "total_debt": total_debt,
                "cash_equivalents": cash_eq,
                "sum_pv_projected": round(sum_pv_projected, 2),
                "pv_terminal": round(pv_terminal, 2),
                "terminal_value": round(terminal_value, 2),
                "tv_pct_of_ev": round(tv_pct, 2),
                "equity_value": round(equity_value, 2),
                "price": price,
            },
            "assumptions": {
                "method": "Two-stage DCF with Gordon Growth terminal value",
                "tv_formula": "TV = FCF_n × (1+g∞) / (WACC−g∞), discounted by (1+WACC)^n",
                "wacc_formula": "E/(E+D) × Re + D/(E+D) × Rd × (1-Tc)",
                "capm": "Re = Rf + β × MRP",
                "market": market_choice,
            },
        }
        vm.save_result(stock_id, result, user_id)
        st.success("✅ DCF valuation saved to database!")


# ── 3. Multiple Model ────────────────────────────────────────────────

def _render_multiples(
    stock_id: int, user_id: int, stock: Dict, db: AnalysisDatabase, vm: ValuationModels
) -> None:
    st.subheader("🔢 Multiple Model")
    st.info("⏳ Awaiting detailed specification — coming soon.")


# ── 4. Dividend Discount Model ───────────────────────────────────────

def _render_ddm(
    stock_id: int, user_id: int, stock: Dict, db: AnalysisDatabase, vm: ValuationModels
) -> None:
    """Gordon Growth DDM: Price = D1 / (r − g)  where D1 = D0 × (1 + g)."""
    st.subheader("💵 Dividend Discount Model (DDM)")

    # ── session-state keys ───────────────────────────────────────
    _P = f"ddm_params_{stock_id}"
    _C = f"ddm_calc_{stock_id}"

    fdm = FinancialDataManager(db)
    financials = fdm.get_stock_financials(stock_id)
    outstanding = float(stock.get("outstanding_shares") or 0)
    symbol = stock.get("symbol", "")

    # ── Auto-fetch current price ─────────────────────────────────
    price: Optional[float] = None
    if symbol:
        with st.spinner(f"Fetching price for {symbol}…"):
            price = _fetch_price(symbol)

    # ═══════════════════════════════════════════════════════════════
    # 4.1  HISTORICAL DIVIDEND PER SHARE
    # ═══════════════════════════════════════════════════════════════
    st.markdown("#### 4.1 Historical Dividend Per Share")

    db = _get_db()
    dps_map: Dict[str, float] = {}  # year → DPS

    if outstanding and financials.get("cashflow"):
        annual_cf_keys = sorted(
            k for k in financials["cashflow"] if "Q" not in k.upper()
        )
        for k in annual_cf_keys:
            items = financials["cashflow"][k].get("items", {})
            div_paid = _item_amount(items, "DIVIDENDS_PAID")
            if div_paid is not None and div_paid != 0:
                dps_map[k] = abs(div_paid) / outstanding

    # Overlay any previously saved manual DPS overrides from DB
    saved_metrics = db.get_metrics(stock_id, metric_type="ddm_manual_dps")
    for m in saved_metrics:
        yr = str(m.get("fiscal_year", ""))
        if yr:
            dps_map[yr] = float(m["metric_value"])

    if not dps_map:
        st.warning(
            "⚠️ No dividend data found. Ensure cashflow statements are uploaded "
            "and **Outstanding Shares** is set in the stock profile."
        )
        # Allow manual DPS entry
        st.markdown("**Enter dividend per share manually:**")
        manual_dps = st.number_input(
            "Current DPS (D₀)", value=0.0, min_value=0.0, step=0.01,
            format="%.4f", key=f"ddm_manual_dps_{stock_id}",
        )
        if manual_dps > 0:
            current_year = str(date.today().year)
            dps_map[current_year] = manual_dps
        else:
            return

    # Sort and pick last 5 years for display
    sorted_years = sorted(dps_map.keys())
    display_years = sorted_years[-5:] if len(sorted_years) > 5 else sorted_years

    # Compute year-over-year growth rates
    growth_map: Dict[str, float] = {}
    for i in range(1, len(sorted_years)):
        prev_dps = dps_map[sorted_years[i - 1]]
        curr_dps = dps_map[sorted_years[i]]
        if prev_dps and prev_dps > 0:
            growth_map[sorted_years[i]] = ((curr_dps - prev_dps) / prev_dps) * 100

    # Build display labels
    labels: Dict[str, str] = {}
    for idx, yr in enumerate(display_years):
        n = len(display_years) - 1 - idx
        if n == 0:
            labels[yr] = f"Current ({yr})"
        else:
            labels[yr] = f"{n} Year{'s' if n > 1 else ''} Ago ({yr})"

    # Apply any previous manual edits from session state before computing growth
    _edit_key = f"ddm_hist_edit_{stock_id}"
    _prev_edits = st.session_state.get(_edit_key, {})
    if isinstance(_prev_edits, dict):
        edited_rows = _prev_edits.get("edited_rows", {})
        # Row 0 = DPS row
        dps_edits = edited_rows.get(0, edited_rows.get("0", {}))
        for yr in display_years:
            lbl = labels[yr]
            if lbl in dps_edits:
                try:
                    dps_map[yr] = float(dps_edits[lbl])
                except (TypeError, ValueError):
                    pass

    # Compute growth from (possibly edited) DPS values
    growth_map: Dict[str, float] = {}
    for i in range(1, len(sorted_years)):
        prev_dps = dps_map[sorted_years[i - 1]]
        curr_dps = dps_map[sorted_years[i]]
        if prev_dps and prev_dps > 0:
            growth_map[sorted_years[i]] = ((curr_dps - prev_dps) / prev_dps) * 100

    # Build unified table — both rows as strings, DPS row editable
    dps_row: Dict[str, str] = {"Metric": "Dividend Per Share"}
    gr_row: Dict[str, str] = {"Metric": "Growth Rate"}
    for yr in display_years:
        lbl = labels.get(yr, yr)
        dps_row[lbl] = f"{dps_map[yr]:.4f}"
        # Oldest displayed year has no prior context — show "—"
        if yr == display_years[0]:
            gr_row[lbl] = "—"
        else:
            gr_row[lbl] = f"{growth_map[yr]:+.2f}%" if yr in growth_map else "—"

    hist_df = pd.DataFrame([dps_row, gr_row])

    edited_hist = st.data_editor(
        hist_df,
        key=_edit_key,
        disabled=["Metric"],
        hide_index=True,
        use_container_width=True,
        column_config={
            "Metric": st.column_config.TextColumn(width="medium"),
        },
    )

    # Read back edited DPS values (row 0) into dps_map
    for yr in display_years:
        lbl = labels[yr]
        val = edited_hist[lbl].iloc[0]
        try:
            dps_map[yr] = float(val)
        except (TypeError, ValueError):
            pass

    # Recompute growth from edited values (for downstream use)
    growth_map = {}
    for i in range(1, len(sorted_years)):
        prev_dps = dps_map[sorted_years[i - 1]]
        curr_dps = dps_map[sorted_years[i]]
        if prev_dps and prev_dps > 0:
            growth_map[sorted_years[i]] = ((curr_dps - prev_dps) / prev_dps) * 100

    # Save DPS button — persist manual edits to DB
    if st.button("💾 Save DPS", key=f"ddm_save_dps_{stock_id}"):
        for yr in display_years:
            db.upsert_metric(
                stock_id=stock_id,
                fiscal_year=int(yr),
                period_end_date=f"{yr}-12-31",
                metric_type="ddm_manual_dps",
                metric_name="manual_dps",
                metric_value=dps_map[yr],
            )
        st.success("✅ Dividend per share saved.")

    # ═══════════════════════════════════════════════════════════════
    # 4.2  GROWTH RATE & DISCOUNT RATE
    # ═══════════════════════════════════════════════════════════════
    st.divider()
    st.markdown("#### 4.2 Parameters")

    # Current DPS (D0)
    current_dps = dps_map[sorted_years[-1]]

    # Average historical dividend growth — only from displayed years (excl. oldest)
    avg_growth = 0.0
    displayed_growths = [
        growth_map[yr] for yr in display_years
        if yr != display_years[0] and yr in growth_map
    ]
    if displayed_growths:
        avg_growth = sum(displayed_growths) / len(displayed_growths)

    # Try to pull WACC from saved DCF params
    dcf_saved = st.session_state.get(f"dcf_params_{stock_id}", {})
    wacc_from_dcf = dcf_saved.get("wacc", None)

    # Also try to get from DB (last saved DCF valuation)
    if wacc_from_dcf is None:
        try:
            history = vm.get_history(stock_id)
            for h in history:
                if h.get("model_type") == "dcf":
                    import json as _json
                    params = _json.loads(h.get("parameters", "{}"))
                    wacc_from_dcf = params.get("wacc")
                    break
        except Exception:
            pass

    discount_default = wacc_from_dcf if wacc_from_dcf else 13.0

    # Display auto metrics
    am1, am2, am3 = st.columns(3)
    am1.metric("Current DPS (D₀)", f"{current_dps:.4f}")
    am2.metric("Avg Historical Growth", f"{avg_growth:+.2f}%")
    am3.metric(
        "WACC (from DCF)",
        f"{discount_default:.2f}%",
        help="Pulled from saved DCF parameters" if wacc_from_dcf else "Default — run DCF tab first for auto",
    )

    st.markdown("*(double-click a value to edit)*")

    saved = st.session_state.get(_P, {})

    edit_df = pd.DataFrame({
        "Parameter": [
            "D₀ — Current Dividend Per Share",
            "Growth Rate (g) %",
            "Discount Rate (r) % — WACC",
        ],
        "Value": [
            saved.get("d0", round(current_dps, 4)),
            saved.get("g", round(avg_growth, 2) if avg_growth > 0 else 1.0),
            saved.get("r", round(discount_default, 2)),
        ],
        "Description": [
            f"Auto: |Div Paid| ÷ Shares (FY {sorted_years[-1]})",
            f"Average hist growth: {avg_growth:+.2f}% — override as needed",
            "From DCF tab" if wacc_from_dcf else "Default — run DCF first",
        ],
    })

    edited = st.data_editor(
        edit_df,
        key=f"ddm_edit_{stock_id}",
        disabled=["Parameter", "Description"],
        hide_index=True,
        use_container_width=True,
        column_config={
            "Parameter": st.column_config.TextColumn(width="large"),
            "Value": st.column_config.NumberColumn(format="%.4f"),
            "Description": st.column_config.TextColumn(width="large"),
        },
    )

    # ── Save & Calculate buttons ─────────────────────────────────
    btn1, btn2, _ = st.columns([1, 1, 3])

    with btn1:
        if st.button("💾  Save Parameters", key=f"ddm_save_{stock_id}",
                      use_container_width=True, type="secondary"):
            st.session_state[_P] = {
                "d0": float(edited.iloc[0]["Value"]),
                "g":  float(edited.iloc[1]["Value"]),
                "r":  float(edited.iloc[2]["Value"]),
            }
            st.toast("✅ DDM parameters saved!", icon="💾")

    with btn2:
        if st.button("🔄  Calculate", key=f"ddm_calc_btn_{stock_id}",
                      use_container_width=True, type="primary"):
            st.session_state[_P] = {
                "d0": float(edited.iloc[0]["Value"]),
                "g":  float(edited.iloc[1]["Value"]),
                "r":  float(edited.iloc[2]["Value"]),
            }
            st.session_state[_C] = True

    if not st.session_state.get(_C, False):
        st.info("👆 Adjust parameters above then press **🔄 Calculate**.")
        return

    # ═══════════════════════════════════════════════════════════════
    # 4.3  DDM CALCULATION — Gordon Growth Model
    # ═══════════════════════════════════════════════════════════════
    st.divider()
    st.markdown("#### 4.3 DDM Valuation — Gordon Growth Model")
    st.latex(r"\text{DDM Price} = \frac{D_1}{r - g} = \frac{D_0 \times (1 + g)}{r - g}")

    p = st.session_state[_P]
    d0 = p["d0"]
    g  = p["g"] / 100.0   # convert to decimal
    r  = p["r"] / 100.0   # convert to decimal

    if r <= g:
        st.error("Discount rate (r) must be greater than growth rate (g).")
        return
    if d0 <= 0:
        st.error("D₀ must be positive.")
        return

    d1 = d0 * (1 + g)
    ddm_price = d1 / (r - g)

    diff_pct = ((ddm_price - price) / price * 100) if price else 0

    calc_df = pd.DataFrame([
        ("D₀ — Current DPS", f"{d0:.4f}", "From parameters"),
        ("g — Growth Rate", f"{g * 100:.2f}%", "Editable above"),
        ("D₁ = D₀ × (1 + g)", f"{d1:.4f}", "Next year's expected dividend"),
        ("r — Discount Rate (WACC)", f"{r * 100:.2f}%", "Editable above"),
        ("r − g", f"{(r - g) * 100:.2f}%", "Spread"),
        ("", "", ""),
        ("**DDM Price per Share**", f"**{ddm_price:.4f}**", "D₁ / (r − g)"),
        ("", "", ""),
        ("Current Price", f"{price:.3f}" if price else "—", "Yahoo Finance"),
        ("Difference", f"{diff_pct:+.2f}%", "(DDM − Price) / Price × 100"),
    ], columns=["Item", "Value", "Description"])

    st.dataframe(calc_df, hide_index=True, use_container_width=True)

    # Metric cards
    rc1, rc2, rc3 = st.columns(3)
    rc1.metric("DDM Price", f"{ddm_price:.4f}")
    rc2.metric("Current Price", f"{price:.3f}" if price else "—")
    if price:
        signal = "UNDERVALUED 🟢" if ddm_price > price else "OVERVALUED 🔴"
        rc3.metric("Signal", signal, delta=f"{diff_pct:+.2f}%")

    # ── Save to DB ───────────────────────────────────────────────
    st.divider()
    if st.button("💾  Save DDM Result to Database", key=f"ddm_db_save_{stock_id}",
                  type="secondary"):
        result = {
            "model": "ddm",
            "intrinsic_value": round(ddm_price, 4),
            "parameters": {
                "d0": d0,
                "d1": round(d1, 4),
                "growth_rate": p["g"],
                "discount_rate": p["r"],
                "avg_hist_growth": round(avg_growth, 2),
                "price": price,
            },
            "assumptions": {
                "method": "Gordon Growth Model (single-stage DDM)",
                "formula": "DDM Price = D₁ / (r − g) = D₀ × (1+g) / (r−g)",
            },
        }
        vm.save_result(stock_id, result, user_id)
        st.success("✅ DDM valuation saved to database!")


# ── 5. Result (combined summary) ─────────────────────────────────────

def _render_result(
    stock_id: int, user_id: int, stock: Dict, db: AnalysisDatabase, vm: ValuationModels
) -> None:
    st.subheader("📊 Valuation Result — Combined Summary")
    st.info("⏳ Awaiting detailed specification — coming soon.")
