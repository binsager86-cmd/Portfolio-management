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

_CURRENCY_SIGNS = {
    "KWD": "KD",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "SAR": "SAR",
    "AED": "AED",
    "BHD": "BD",
    "OMR": "OMR",
    "QAR": "QAR",
}


def _ccy(stock: Dict) -> str:
    """Return the display currency sign for a stock based on its currency field."""
    currency = (stock.get("currency") or "USD").upper()
    return _CURRENCY_SIGNS.get(currency, currency)


def _load_saved_params(
    vm: ValuationModels, stock_id: int, model_type: str,
) -> Dict[str, Any]:
    """Load the most recent saved parameters from DB for a model type.

    Returns the parsed *parameters* dict, or {} if nothing saved.
    """
    try:
        history = vm.get_history(stock_id)
        for h in history:
            if h.get("model_type") == model_type:
                raw = h.get("parameters", "{}")
                if isinstance(raw, str):
                    return json.loads(raw)
                if isinstance(raw, dict):
                    return raw
                return {}
        return {}
    except Exception:
        return {}


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
    ccy = _ccy(stock)

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
        f"{ccy}{price:,.3f}" if price else "—",
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

    # Defaults: session state → DB saved → auto-computed
    saved = st.session_state.get(_P, {})
    if not saved:
        db_params = _load_saved_params(vm, stock_id, "graham")
        if db_params:
            saved = {
                "eps": db_params.get("eps"),
                "g":   db_params.get("growth_rate"),
                "y":   db_params.get("aaa_yield"),
                "mos": db_params.get("margin_of_safety"),
            }
            # Remove None entries so .get() fallback still works
            saved = {k: v for k, v in saved.items() if v is not None}
            if saved:
                st.session_state[_P] = saved

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
            ("Intrinsic Value", f"{ccy}{iv_a:,.4f}", "Calculated"),
            ("", "", ""),
            ("Current Price", f"{ccy}{price:,.3f}", "Yahoo Finance"),
            ("Difference", f"{diff_a:.2f}%", "Price ÷ Intrinsic Value × 100"),
            ("Margin of Safety", f"{mos:.2f}%", "Editable above"),
            ("Acceptable Buy Price", f"{ccy}{buy_a:,.4f}", "(1 − Margin) × IV"),
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
            ("Intrinsic Value", f"{ccy}{iv_b:,.4f}", "Calculated"),
            ("", "", ""),
            ("Current Price", f"{ccy}{price:,.3f}", "Yahoo Finance"),
            ("Difference", f"{diff_b:.2f}%", "Price ÷ Intrinsic Value × 100"),
            ("Margin of Safety", f"{mos:.2f}%", "Editable above"),
            ("Acceptable Buy Price", f"{ccy}{buy_b:,.4f}", "(1 − Margin) × IV"),
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
    ac1.metric("Avg Intrinsic Value", f"{ccy}{avg_iv:,.4f}")
    ac2.metric("Avg Acceptable Buy", f"{ccy}{avg_buy:,.4f}")
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
    ccy = _ccy(stock)

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

    # Defaults: session state → DB saved → auto-computed
    saved = st.session_state.get(_P, {})
    if not saved:
        db_params = _load_saved_params(vm, stock_id, "dcf")
        if db_params:
            saved = {
                "g":        db_params.get("growth_rate"),
                "proj_yrs": db_params.get("projection_years"),
                "perp_g":   db_params.get("perpetual_growth"),
                "rf":       db_params.get("risk_free_rate"),
                "mrp":      db_params.get("market_risk_premium"),
                "beta":     db_params.get("beta"),
                "re":       db_params.get("cost_of_equity"),
                "rd":       db_params.get("cost_of_debt"),
                "tc":       db_params.get("tax_rate"),
                "wacc":     db_params.get("wacc"),
            }
            saved = {k: v for k, v in saved.items() if v is not None}
            if saved:
                st.session_state[_P] = saved

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
        ("**DCF Price per Share**", f"**{ccy}{dcf_price:,.4f}**"),
        ("", ""),
        ("Current Price", f"{ccy}{price:,.3f}" if price else "—"),
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
    rc1.metric("DCF Price", f"{ccy}{dcf_price:,.4f}")
    rc2.metric("Current Price", f"{ccy}{price:,.3f}" if price else "—")
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

def _fetch_peer_data(ticker: str) -> Dict[str, Any]:
    """Fetch company name, price, EPS, and P/E from yfinance for a peer ticker."""
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.strip())
        info = t.info or {}

        name = info.get("shortName") or info.get("longName") or ticker

        # Price
        raw_price: Optional[float] = None
        for field in ("currentPrice", "regularMarketPrice",
                      "previousClose", "regularMarketPreviousClose"):
            p = info.get(field)
            if p and float(p) > 0:
                raw_price = float(p)
                break
        if raw_price is None:
            hist = t.history(period="5d")
            if hist is not None and not hist.empty:
                raw_price = float(hist["Close"].iloc[-1])

        # EPS
        eps_val = info.get("trailingEps")
        if eps_val is not None:
            eps_val = float(eps_val)

        # P/E
        pe_val = info.get("trailingPE")
        if pe_val is not None:
            pe_val = float(pe_val)
        elif raw_price and eps_val and eps_val > 0:
            pe_val = raw_price / eps_val

        return {
            "ticker": ticker.strip().upper(),
            "company": name,
            "price": round(raw_price, 2) if raw_price else None,
            "eps": round(eps_val, 2) if eps_val else None,
            "pe": round(pe_val, 2) if pe_val else None,
        }
    except Exception as e:
        return {"ticker": ticker.strip().upper(), "company": ticker, "price": None, "eps": None, "pe": None}


def _render_multiples(
    stock_id: int, user_id: int, stock: Dict, db: AnalysisDatabase, vm: ValuationModels
) -> None:
    """Comparable P/E Multiples Valuation Model."""
    st.subheader("🔢 Multiple Valuation Model")

    # ── session-state keys ───────────────────────────────────────
    _P = f"mult_params_{stock_id}"          # saved parameter dict
    _PEERS = f"mult_peers_{stock_id}"       # list of peer dicts
    _SKIP = f"mult_skip_{stock_id}"         # skip checkbox
    _C = f"mult_calc_{stock_id}"            # calculated flag

    fdm = FinancialDataManager(db)
    financials = fdm.get_stock_financials(stock_id)
    outstanding = float(stock.get("outstanding_shares") or 0)
    symbol = stock.get("symbol", "")
    company_name = stock.get("company_name", symbol)
    ccy = _ccy(stock)

    # ── Skip checkbox ────────────────────────────────────────────
    skip = st.checkbox(
        "⏭️ Skip this model (mark as N/A — no comparable peers)",
        key=_SKIP,
        value=st.session_state.get(_SKIP, False),
    )
    if skip:
        st.info("Multiples valuation skipped. Uncheck to enable.")
        return

    # ── Trailing EPS for the target company ──────────────────────
    eps: Optional[float] = None
    latest_fy: Optional[str] = None
    if outstanding and financials.get("income"):
        annual_keys = sorted(
            k for k in financials["income"] if "Q" not in k.upper()
        )
        for k in annual_keys:
            ni = _item_amount(
                financials["income"][k].get("items", {}), "NET_INCOME"
            )
            if ni is not None:
                eps = ni / outstanding
                latest_fy = k

    # ── Fetch price for target ───────────────────────────────────
    price: Optional[float] = None
    if symbol:
        with st.spinner(f"Fetching price for {symbol}…"):
            price = _fetch_price(symbol)

    # ══════════════════════════════════════════════════════════════
    # STEP 1: Peer Comparable Table
    # ══════════════════════════════════════════════════════════════
    st.markdown("#### 1. Peer Comparable Companies")
    st.caption("Add comparable companies by ticker. Data is fetched from Yahoo Finance. "
               "Double-click any cell to override.")

    # Load peers: session state → DB → empty default
    if _PEERS not in st.session_state:
        db_params = _load_saved_params(vm, stock_id, "multiples")
        if db_params and db_params.get("peers"):
            st.session_state[_PEERS] = db_params["peers"]
        else:
            st.session_state[_PEERS] = []

    peers: List[Dict] = st.session_state[_PEERS]

    # ── Add peer row ─────────────────────────────────────────────
    add_col1, add_col2 = st.columns([2, 1])
    with add_col1:
        new_ticker = st.text_input(
            "Ticker symbol (e.g. AAPL, GOOG)", key=f"mult_add_ticker_{stock_id}",
            placeholder="Enter ticker…",
        )
    with add_col2:
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("➕ Add Company", key=f"mult_add_btn_{stock_id}",
                      type="primary", use_container_width=True):
            if new_ticker.strip():
                # Check for duplicate
                existing_tickers = {p.get("ticker", "").upper() for p in peers}
                if new_ticker.strip().upper() in existing_tickers:
                    st.warning(f"**{new_ticker.strip().upper()}** already in the list.")
                else:
                    with st.spinner(f"Fetching data for {new_ticker.strip().upper()}…"):
                        data = _fetch_peer_data(new_ticker)
                    peers.append(data)
                    st.session_state[_PEERS] = peers
                    st.rerun()

    if not peers:
        st.info("👆 Add comparable companies above to start the multiples valuation.")
        return

    # ── Build editable peer table ────────────────────────────────
    peer_df = pd.DataFrame({
        "Ticker": [p.get("ticker", "") for p in peers],
        "Company": [p.get("company", "") for p in peers],
        "Stock Price": [p.get("price") for p in peers],
        "Earnings per Share": [p.get("eps") for p in peers],
        "P/E Multiple": [p.get("pe") for p in peers],
    })

    edited_peers = st.data_editor(
        peer_df,
        key=f"mult_peer_edit_{stock_id}",
        hide_index=True,
        use_container_width=True,
        num_rows="fixed",
        column_config={
            "Ticker": st.column_config.TextColumn(width="small"),
            "Company": st.column_config.TextColumn(width="medium"),
            "Stock Price": st.column_config.NumberColumn(format=f"{ccy}%.2f", width="small"),
            "Earnings per Share": st.column_config.NumberColumn(format="%.2f", width="small"),
            "P/E Multiple": st.column_config.NumberColumn(format="%.2f", width="small"),
        },
    )

    # ── Delete buttons ───────────────────────────────────────────
    if peers:
        st.caption("🗑️ Remove a company:")
        del_cols = st.columns(min(len(peers), 6))
        for idx, p in enumerate(peers):
            col_idx = idx % min(len(peers), 6)
            with del_cols[col_idx]:
                if st.button(
                    f"✖ {p.get('ticker', '?')}",
                    key=f"mult_del_{stock_id}_{idx}",
                    use_container_width=True,
                ):
                    peers.pop(idx)
                    st.session_state[_PEERS] = peers
                    st.rerun()

    # ── Sync edits back to session state ─────────────────────────
    for idx in range(len(peers)):
        if idx < len(edited_peers):
            peers[idx]["ticker"] = edited_peers.iloc[idx]["Ticker"]
            peers[idx]["company"] = edited_peers.iloc[idx]["Company"]
            peers[idx]["price"] = edited_peers.iloc[idx]["Stock Price"]
            peers[idx]["eps"] = edited_peers.iloc[idx]["Earnings per Share"]
            peers[idx]["pe"] = edited_peers.iloc[idx]["P/E Multiple"]
    st.session_state[_PEERS] = peers

    # ── Save peers button ────────────────────────────────────────
    if st.button("💾 Save Peer Table", key=f"mult_save_peers_{stock_id}",
                  type="secondary"):
        st.session_state[_PEERS] = peers
        st.toast("✅ Peer table saved!", icon="💾")

    # ══════════════════════════════════════════════════════════════
    # STEP 2: Average & Median P/E
    # ══════════════════════════════════════════════════════════════
    st.divider()
    st.markdown("#### 2. P/E Multiple Summary")

    valid_pe = [p.get("pe") for p in peers if p.get("pe") is not None and p.get("pe") > 0]

    if not valid_pe:
        st.warning("⚠️ No valid P/E multiples found. Ensure peer data is complete.")
        return

    import statistics
    avg_pe = sum(valid_pe) / len(valid_pe)
    median_pe = statistics.median(valid_pe)

    pe_col1, pe_col2 = st.columns(2)
    pe_col1.metric("Average P/E", f"{avg_pe:.5f}")
    pe_col2.metric("Median P/E", f"{median_pe:.5f}")

    # ══════════════════════════════════════════════════════════════
    # STEP 3: Target Company Valuation
    # ══════════════════════════════════════════════════════════════
    st.divider()
    st.markdown("#### 3. Valuation")

    if not eps:
        st.warning(
            "⚠️ Cannot compute — set **Outstanding Shares** in stock "
            "profile and ensure income statements are uploaded."
        )
        return
    if not price:
        st.warning(f"⚠️ Could not fetch current price for **{symbol}**.")
        return

    target_df = pd.DataFrame({
        "Company": [company_name],
        "Stock Price": [f"{ccy}{price:,.2f}" if price else "—"],
        "Earnings per Share": [f"{eps:.2f}" if eps else "—"],
    })
    st.dataframe(target_df, hide_index=True, use_container_width=True)

    # Intrinsic value = EPS × Average (or Median) P/E
    iv_avg = eps * avg_pe
    iv_median = eps * median_pe

    diff_avg = ((iv_avg - price) / price * 100) if price else 0
    diff_median = ((iv_median - price) / price * 100) if price else 0

    result_df = pd.DataFrame([
        ("**Using Average P/E**", "", ""),
        ("Average P/E", f"{avg_pe:.5f}", "From peer table"),
        ("Trailing EPS", f"{eps:.4f}", f"FY {latest_fy}" if latest_fy else "Auto"),
        ("Intrinsic Value (Avg P/E × EPS)", f"{iv_avg:.4f}", "Calculated"),
        ("Current Price", f"{price:.3f}" if price else "—", "Yahoo Finance"),
        ("Difference", f"{diff_avg:+.2f}%", "(IV − Price) / Price × 100"),
        ("Signal", "UNDERVALUED 🟢" if iv_avg > price else "OVERVALUED 🔴", ""),
        ("", "", ""),
        ("**Using Median P/E**", "", ""),
        ("Median P/E", f"{median_pe:.5f}", "From peer table"),
        ("Trailing EPS", f"{eps:.4f}", f"FY {latest_fy}" if latest_fy else "Auto"),
        ("Intrinsic Value (Median P/E × EPS)", f"{iv_median:.4f}", "Calculated"),
        ("Current Price", f"{price:.3f}" if price else "—", "Yahoo Finance"),
        ("Difference", f"{diff_median:+.2f}%", "(IV − Price) / Price × 100"),
        ("Signal", "UNDERVALUED 🟢" if iv_median > price else "OVERVALUED 🔴", ""),
    ], columns=["Item", "Value", "Description"])
    st.dataframe(result_df, hide_index=True, use_container_width=True)

    # Metric cards
    rc1, rc2, rc3 = st.columns(3)
    rc1.metric("IV (Avg P/E)", f"{ccy}{iv_avg:.4f}", delta=f"{diff_avg:+.2f}%")
    rc2.metric("IV (Median P/E)", f"{ccy}{iv_median:.4f}", delta=f"{diff_median:+.2f}%")
    rc3.metric("Current Price", f"{ccy}{price:.3f}" if price else "—")

    # ── Save to DB ───────────────────────────────────────────────
    st.divider()
    if st.button("💾  Save Multiples Result to Database",
                  key=f"mult_db_save_{stock_id}", type="secondary"):
        result = {
            "model": "multiples",
            "intrinsic_value": round(iv_avg, 4),
            "parameters": {
                "eps": round(eps, 4),
                "avg_pe": round(avg_pe, 5),
                "median_pe": round(median_pe, 5),
                "iv_avg_pe": round(iv_avg, 4),
                "iv_median_pe": round(iv_median, 4),
                "price": price,
                "peers": [
                    {
                        "ticker": p.get("ticker"),
                        "company": p.get("company"),
                        "price": p.get("price"),
                        "eps": p.get("eps"),
                        "pe": p.get("pe"),
                    }
                    for p in peers
                ],
            },
            "assumptions": {
                "method": "Comparable P/E Multiples",
                "formula": "Intrinsic Value = Trailing EPS × Peer P/E Multiple",
                "peer_count": len(valid_pe),
            },
        }
        vm.save_result(stock_id, result, user_id)
        st.success("✅ Multiples valuation saved to database!")


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
    ccy = _ccy(stock)

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
    _DPS_CACHE = f"ddm_dps_cache_{stock_id}"  # persistent DPS overrides

    if outstanding and financials.get("cashflow"):
        annual_cf_keys = sorted(
            k for k in financials["cashflow"] if "Q" not in k.upper()
        )
        for k in annual_cf_keys:
            items = financials["cashflow"][k].get("items", {})
            div_paid = _item_amount(items, "DIVIDENDS_PAID")
            if div_paid is not None and div_paid != 0:
                dps_map[k] = abs(div_paid) / outstanding

    # Overlay saved DPS: session-state cache → DB → computed
    if _DPS_CACHE in st.session_state:
        # Session cache has latest edits (survives within session)
        for yr, val in st.session_state[_DPS_CACHE].items():
            dps_map[yr] = val
    else:
        # Fall back to DB-persisted manual overrides
        saved_metrics = db.get_metrics(stock_id, metric_type="ddm_manual_dps")
        if saved_metrics:
            cache = {}
            for m in saved_metrics:
                yr = str(m.get("fiscal_year", ""))
                if yr:
                    dps_map[yr] = float(m["metric_value"])
                    cache[yr] = float(m["metric_value"])
            if cache:
                st.session_state[_DPS_CACHE] = cache

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

    # Build display labels
    labels: Dict[str, str] = {}
    reverse_labels: Dict[str, str] = {}  # label → year
    for idx, yr in enumerate(display_years):
        n = len(display_years) - 1 - idx
        if n == 0:
            labels[yr] = f"Current ({yr})"
        else:
            labels[yr] = f"{n} Year{'s' if n > 1 else ''} Ago ({yr})"
        reverse_labels[labels[yr]] = yr

    # ── Editable DPS + Growth table (combined) ─────────────────
    _edit_key = f"ddm_hist_edit_{stock_id}"

    # Build DPS row (numeric, editable)
    dps_row_data: Dict[str, Any] = {"Metric": "Dividend Per Share"}
    for yr in display_years:
        dps_row_data[labels[yr]] = round(dps_map[yr], 4)

    # Pre-compute growth for display
    _pre_growth: Dict[str, float] = {}
    for i in range(1, len(sorted_years)):
        prev_dps = dps_map[sorted_years[i - 1]]
        curr_dps = dps_map[sorted_years[i]]
        if prev_dps and prev_dps > 0:
            _pre_growth[sorted_years[i]] = round(
                ((curr_dps - prev_dps) / prev_dps) * 100, 2
            )

    gr_row_data: Dict[str, Any] = {"Metric": "Growth Rate (%)"}
    for yr in display_years:
        if yr == display_years[0]:
            gr_row_data[labels[yr]] = None
        else:
            gr_row_data[labels[yr]] = _pre_growth.get(yr)

    combined_df = pd.DataFrame([dps_row_data, gr_row_data])

    col_config: Dict[str, Any] = {
        "Metric": st.column_config.TextColumn(width="medium"),
    }
    for yr in display_years:
        col_config[labels[yr]] = st.column_config.NumberColumn(
            format="%.4f", step=0.001,
        )

    st.caption("Double-click a DPS value to edit · Growth recalculates on Save:")
    edited_combined = st.data_editor(
        combined_df,
        key=_edit_key,
        disabled=["Metric"],
        hide_index=True,
        use_container_width=True,
        column_config=col_config,
    )

    # Read back edited DPS values (row 0) into dps_map
    for yr in display_years:
        lbl = labels[yr]
        try:
            val = edited_combined[lbl].iloc[0]
            if val is not None:
                dps_map[yr] = float(val)
        except (TypeError, ValueError, KeyError):
            pass

    # Recompute growth from (possibly edited) DPS values
    growth_map: Dict[str, float] = {}
    for i in range(1, len(sorted_years)):
        prev_dps = dps_map[sorted_years[i - 1]]
        curr_dps = dps_map[sorted_years[i]]
        if prev_dps and prev_dps > 0:
            growth_map[sorted_years[i]] = ((curr_dps - prev_dps) / prev_dps) * 100

    # Save DPS button — persist to DB + session state + rerun
    if st.button("💾 Save DPS", key=f"ddm_save_dps_{stock_id}"):
        cache = {}
        for yr in display_years:
            db.upsert_metric(
                stock_id=stock_id,
                fiscal_year=int(yr),
                period_end_date=f"{yr}-12-31",
                metric_type="ddm_manual_dps",
                metric_name="manual_dps",
                metric_value=dps_map[yr],
            )
            cache[yr] = dps_map[yr]
        st.session_state[_DPS_CACHE] = cache
        # Clear the data_editor widget state so it picks up fresh values
        if _edit_key in st.session_state:
            del st.session_state[_edit_key]
        st.toast("✅ Dividend per share saved!", icon="💾")
        st.rerun()

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

    # Defaults: session state → DB saved → auto-computed
    saved = st.session_state.get(_P, {})
    if not saved:
        db_params = _load_saved_params(vm, stock_id, "ddm")
        if db_params:
            saved = {
                "d0": db_params.get("d0"),
                "g":  db_params.get("growth_rate"),
                "r":  db_params.get("discount_rate"),
            }
            saved = {k: v for k, v in saved.items() if v is not None}
            if saved:
                st.session_state[_P] = saved

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
        ("**DDM Price per Share**", f"**{ccy}{ddm_price:.4f}**", "D₁ / (r − g)"),
        ("", "", ""),
        ("Current Price", f"{ccy}{price:.3f}" if price else "—", "Yahoo Finance"),
        ("Difference", f"{diff_pct:+.2f}%", "(DDM − Price) / Price × 100"),
    ], columns=["Item", "Value", "Description"])

    st.dataframe(calc_df, hide_index=True, use_container_width=True)

    # Metric cards
    rc1, rc2, rc3 = st.columns(3)
    rc1.metric("DDM Price", f"{ccy}{ddm_price:.4f}")
    rc2.metric("Current Price", f"{ccy}{price:.3f}" if price else "—")
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

    _MOS_KEY = f"result_mos_{stock_id}"
    symbol = stock.get("symbol", "")
    company_name = stock.get("company_name", symbol)
    ccy = _ccy(stock)

    # ── Collect intrinsic values from session state (current session)
    #    and fall back to latest DB-saved valuation for each model ──
    model_labels = {
        "graham": "Graham's Valuation",
        "dcf": "Discounted Cash Flow Valuation",
        "multiples": "Multiples Valuation",
        "ddm": "Dividend Discount Model Valuation",
    }

    iv_map: Dict[str, Optional[float]] = {}

    # Graham: session state → DB
    gp = st.session_state.get(f"graham_params_{stock_id}", {})
    if gp and gp.get("eps") and gp.get("g") and gp.get("y"):
        eps_g = gp["eps"]; g_g = gp["g"]; y_g = gp["y"]
        if y_g > 0 and eps_g > 0:
            iv_a = (eps_g * (8.5 + 2 * g_g) * 4.4) / y_g
            iv_b = (eps_g * (7 + g_g) * 4.4) / y_g
            iv_map["graham"] = round((iv_a + iv_b) / 2, 4)

    # DCF: session state calc flag → iv stored during calc
    if st.session_state.get(f"dcf_calc_{stock_id}"):
        dcf_p = st.session_state.get(f"dcf_params_{stock_id}", {})
        # We can't easily recompute DCF here, so pull from DB
        pass

    # DDM: session state
    ddm_p = st.session_state.get(f"ddm_params_{stock_id}", {})
    if ddm_p and ddm_p.get("d0") and ddm_p.get("g") and ddm_p.get("r"):
        d0 = ddm_p["d0"]; g_d = ddm_p["g"] / 100; r_d = ddm_p["r"] / 100
        if r_d > g_d and d0 > 0:
            d1 = d0 * (1 + g_d)
            iv_map["ddm"] = round(d1 / (r_d - g_d), 4)

    # Fill remaining from DB history
    try:
        history = vm.get_history(stock_id)
        for h in history:
            mt = h.get("model_type", "")
            if mt in model_labels and mt not in iv_map:
                iv_val = h.get("intrinsic_value")
                if iv_val is not None:
                    iv_map[mt] = round(float(iv_val), 4)
    except Exception:
        pass

    # Multiples from session peers (if calculated)
    if "multiples" not in iv_map:
        mult_db = _load_saved_params(vm, stock_id, "multiples")
        if mult_db and mult_db.get("iv_avg_pe"):
            iv_map["multiples"] = round(float(mult_db["iv_avg_pe"]), 4)

    # ══════════════════════════════════════════════════════════════
    # 1. Four valuation boxes in 2×2 grid
    # ══════════════════════════════════════════════════════════════
    st.markdown("#### Stock Valuation")

    row1_c1, row1_c2 = st.columns(2)
    row2_c1, row2_c2 = st.columns(2)

    boxes = [
        ("graham", row1_c1),
        ("dcf", row1_c2),
        ("multiples", row2_c1),
        ("ddm", row2_c2),
    ]
    for model_key, col in boxes:
        val = iv_map.get(model_key)
        with col:
            if val is not None:
                st.metric(
                    label=model_labels[model_key],
                    value=f"{ccy}{val:,.4f}",
                )
            else:
                st.metric(
                    label=model_labels[model_key],
                    value="— not calculated —",
                )

    # ══════════════════════════════════════════════════════════════
    # 2. Average Intrinsic Value
    # ══════════════════════════════════════════════════════════════
    valid_ivs = [v for v in iv_map.values() if v is not None and v > 0]

    if not valid_ivs:
        st.warning("⚠️ No valuation results available. Complete at least one model first.")
        return

    avg_iv = sum(valid_ivs) / len(valid_ivs)

    st.divider()
    st.markdown("#### Intrinsic Value (Average Result)")
    st.metric(
        label="Average Intrinsic Value",
        value=f"{ccy}{avg_iv:,.4f}",
        help=f"Average of {len(valid_ivs)} model(s): "
             + ", ".join(
                 f"{model_labels.get(k, k)} ({ccy}{v:,.4f})"
                 for k, v in iv_map.items() if v is not None and v > 0
             ),
    )

    # ══════════════════════════════════════════════════════════════
    # 3. Details — price, difference, margin, buy/sell
    # ══════════════════════════════════════════════════════════════
    st.divider()
    st.markdown("#### Details")

    # Fetch current price (reuse from session or fetch)
    price: Optional[float] = None
    # Try session state from other tabs
    for _tab_key in ("graham_params", "dcf_params", "ddm_params"):
        p_dict = st.session_state.get(f"{_tab_key}_{stock_id}", {})
        if "price" in p_dict and p_dict["price"]:
            price = float(p_dict["price"])
            break

    # Try DB-saved valuations
    if price is None:
        try:
            for h in vm.get_history(stock_id):
                raw = h.get("parameters", "{}")
                params = json.loads(raw) if isinstance(raw, str) else (raw or {})
                if params.get("price"):
                    price = float(params["price"])
                    break
        except Exception:
            pass

    # Last resort: live fetch
    if price is None and symbol:
        with st.spinner(f"Fetching price for {symbol}…"):
            price = _fetch_price(symbol)

    if price is None:
        st.warning(f"⚠️ Could not determine current price for **{symbol}**.")
        return

    # Difference %
    diff_pct = ((avg_iv - price) / price * 100) if price else 0

    # Margin of Safety — editable
    # Load: session state → DB → default 25%
    if _MOS_KEY not in st.session_state:
        db_result_params = _load_saved_params(vm, stock_id, "result_summary")
        if db_result_params and db_result_params.get("margin_of_safety") is not None:
            st.session_state[_MOS_KEY] = float(db_result_params["margin_of_safety"])
        else:
            st.session_state[_MOS_KEY] = 25.0

    mos_df = pd.DataFrame({
        "Parameter": ["Margin of Safety (%)"],
        "Value": [st.session_state[_MOS_KEY]],
    })
    edited_mos = st.data_editor(
        mos_df,
        key=f"result_mos_edit_{stock_id}",
        disabled=["Parameter"],
        hide_index=True,
        use_container_width=True,
        column_config={
            "Parameter": st.column_config.TextColumn(width="large"),
            "Value": st.column_config.NumberColumn(format="%.2f", min_value=0.0, max_value=99.0, step=1.0),
        },
    )
    mos = float(edited_mos.iloc[0]["Value"])

    # Acceptable buy price
    acceptable_buy = avg_iv * (1 - mos / 100)

    # Buy/Sell signal: BUY if current price ≤ acceptable buy price
    signal = "BUY 🟢" if price <= acceptable_buy else "SELL 🔴"

    detail_df = pd.DataFrame([
        ("Current Price", f"{ccy}{price:,.3f}"),
        ("Difference", f"{diff_pct:+.2f}%"),
        ("Margin of Safety", f"{mos:.2f}%"),
        ("Acceptable Buy Price", f"{ccy}{acceptable_buy:,.4f}"),
        ("Buy / Sell", signal),
    ], columns=["Item", "Value"])

    st.dataframe(detail_df, hide_index=True, use_container_width=True)

    # Metric cards
    dc1, dc2, dc3 = st.columns(3)
    dc1.metric("Current Price", f"{ccy}{price:,.3f}")
    dc2.metric("Acceptable Buy", f"{ccy}{acceptable_buy:,.4f}")
    if price <= acceptable_buy:
        dc3.metric("Signal", "BUY 🟢", delta=f"{diff_pct:+.2f}%")
    else:
        dc3.metric("Signal", "SELL 🔴", delta=f"{diff_pct:+.2f}%")

    # ── Save combined result to DB ───────────────────────────────
    st.divider()
    btn1, btn2, _ = st.columns([1, 1, 3])
    with btn1:
        if st.button("💾 Save Margin of Safety", key=f"result_save_mos_{stock_id}",
                      type="secondary", use_container_width=True):
            st.session_state[_MOS_KEY] = mos
            st.toast("✅ Margin of Safety saved!", icon="💾")

    with btn2:
        if st.button("💾 Save Summary to DB", key=f"result_db_save_{stock_id}",
                      type="primary", use_container_width=True):
            result = {
                "model": "result_summary",
                "intrinsic_value": round(avg_iv, 4),
                "parameters": {
                    "graham_iv": iv_map.get("graham"),
                    "dcf_iv": iv_map.get("dcf"),
                    "multiples_iv": iv_map.get("multiples"),
                    "ddm_iv": iv_map.get("ddm"),
                    "avg_iv": round(avg_iv, 4),
                    "price": price,
                    "difference_pct": round(diff_pct, 2),
                    "margin_of_safety": mos,
                    "acceptable_buy": round(acceptable_buy, 4),
                    "signal": signal,
                },
                "assumptions": {
                    "method": "Average of available valuation models",
                    "models_used": [k for k, v in iv_map.items() if v is not None and v > 0],
                },
            }
            vm.save_result(stock_id, result, user_id)
            st.session_state[_MOS_KEY] = mos
            st.success("✅ Valuation summary saved to database!")
