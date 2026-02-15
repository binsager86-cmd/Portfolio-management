"""
Valuation UI — Interactive valuation model calculators:
Graham Number, DCF, DDM, Comparable Multiples.
Results are persisted and shown in a history view.
"""

import json
import streamlit as st
import pandas as pd
from datetime import date
from typing import Any, Dict, Optional

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

    tab_graham, tab_dcf, tab_ddm, tab_multiples, tab_history = st.tabs([
        "📏 Graham", "📉 DCF", "💵 DDM", "🔢 Multiples", "📋 History"
    ])

    with tab_graham:
        _render_graham(stock_id, user_id, vm)
    with tab_dcf:
        _render_dcf(stock_id, user_id, vm)
    with tab_ddm:
        _render_ddm(stock_id, user_id, vm)
    with tab_multiples:
        _render_multiples(stock_id, user_id, vm)
    with tab_history:
        _render_history(stock_id, vm)


# ── Graham Number ─────────────────────────────────────────────────────

def _render_graham(stock_id: int, user_id: int, vm: ValuationModels) -> None:
    st.subheader("📏 Graham Number")
    st.latex(r"V = \sqrt{22.5 \times EPS \times BVPS}")
    st.caption(
        "Benjamin Graham's formula: maximum price a defensive investor "
        "should pay.  Assumes P/E ≤ 15 and P/B ≤ 1.5."
    )

    with st.form("graham_form"):
        c1, c2, c3 = st.columns(3)
        eps = c1.number_input("EPS (Diluted)", value=5.0, step=0.01, format="%.2f")
        bvps = c2.number_input("Book Value / Share", value=30.0, step=0.01, format="%.2f")
        mult = c3.number_input("Multiplier", value=22.5, step=0.1, format="%.1f",
                               help="Default 22.5 = 15 × 1.5")
        submitted = st.form_submit_button("Calculate", type="primary")

    if submitted:
        result = ValuationModels.graham_number(eps, bvps, mult)
        _show_result(result, stock_id, user_id, vm, "graham")


# ── DCF ───────────────────────────────────────────────────────────────

def _render_dcf(stock_id: int, user_id: int, vm: ValuationModels) -> None:
    st.subheader("📉 Discounted Cash Flow (Two-Stage)")
    st.caption(
        "Projects free cash flow through a high-growth phase, a transition "
        "phase, and a terminal value via Gordon Growth."
    )

    with st.form("dcf_form"):
        c1, c2 = st.columns(2)
        fcf = c1.number_input("Last FCF ($)", value=10_000_000_000.0,
                              step=1e8, format="%.0f")
        shares = c2.number_input("Shares Outstanding", value=15_000_000_000.0,
                                 step=1e6, format="%.0f")
        c3, c4, c5 = st.columns(3)
        g1 = c3.number_input("Stage 1 Growth %", value=12.0, step=0.5) / 100
        g2 = c4.number_input("Stage 2 Growth %", value=6.0, step=0.5) / 100
        wacc = c5.number_input("Discount Rate (WACC) %", value=10.0, step=0.5) / 100

        c6, c7, c8 = st.columns(3)
        s1y = c6.number_input("Stage 1 Years", value=5, min_value=1, max_value=15)
        s2y = c7.number_input("Stage 2 Years", value=5, min_value=1, max_value=15)
        tg = c8.number_input("Terminal Growth %", value=2.5, step=0.1) / 100

        submitted = st.form_submit_button("Calculate", type="primary")

    if submitted:
        result = ValuationModels.dcf(
            fcf, g1, g2, wacc, s1y, s2y, tg, shares,
        )
        _show_result(result, stock_id, user_id, vm, "dcf")

        # Extra DCF breakdown
        if result.get("intrinsic_value"):
            st.divider()
            cc1, cc2, cc3 = st.columns(3)
            cc1.metric("PV of FCFs", fmt_number(result.get("pv_fcfs"), abbreviate=True, prefix="$"))
            cc2.metric("PV of Terminal", fmt_number(result.get("pv_terminal"), abbreviate=True, prefix="$"))
            cc3.metric("Enterprise Value", fmt_number(result.get("enterprise_value"), abbreviate=True, prefix="$"))


# ── DDM ───────────────────────────────────────────────────────────────

def _render_ddm(stock_id: int, user_id: int, vm: ValuationModels) -> None:
    st.subheader("💵 Dividend Discount Model")
    st.caption(
        "Values a stock by the present value of expected future dividends."
    )

    model_variant = st.radio(
        "Model variant",
        ["Gordon Growth (Single Stage)", "Two-Stage DDM"],
        key="ddm_variant",
        horizontal=True,
    )

    with st.form("ddm_form"):
        c1, c2, c3 = st.columns(3)
        div = c1.number_input("Last Annual Dividend / Share", value=2.0,
                              step=0.01, format="%.2f")
        stable_g = c2.number_input("Stable Growth %", value=4.0, step=0.1) / 100
        req_r = c3.number_input("Required Return %", value=10.0, step=0.5) / 100

        high_g = None
        high_y = 5
        if model_variant.startswith("Two"):
            c4, c5 = st.columns(2)
            high_g = c4.number_input("High Growth %", value=15.0, step=0.5) / 100
            high_y = c5.number_input("High Growth Years", value=5,
                                     min_value=1, max_value=15)

        submitted = st.form_submit_button("Calculate", type="primary")

    if submitted:
        result = ValuationModels.ddm(div, stable_g, req_r, high_y, high_g)
        _show_result(result, stock_id, user_id, vm, "ddm")

        if result.get("pv_dividends") is not None:
            st.divider()
            dc1, dc2 = st.columns(2)
            dc1.metric("PV Dividends (High-Growth)", fmt_number(result["pv_dividends"], prefix="$"))
            dc2.metric("PV Terminal", fmt_number(result["pv_terminal"], prefix="$"))


# ── Comparable Multiples ──────────────────────────────────────────────

def _render_multiples(
    stock_id: int, user_id: int, vm: ValuationModels
) -> None:
    st.subheader("🔢 Comparable Multiples")
    st.caption(
        "Apply a peer-group multiple to a fundamental metric "
        "(EPS, EBITDA, Revenue, etc.)."
    )

    with st.form("multiples_form"):
        mult_type = st.selectbox(
            "Multiple type",
            ["P/E", "EV/EBITDA", "P/S", "P/B", "P/FCF"],
            key="mult_type",
        )
        c1, c2, c3 = st.columns(3)
        metric_val = c1.number_input(
            "Metric value (per share or total)", value=5.0,
            step=0.01, format="%.2f",
        )
        peer_mult = c2.number_input(
            "Peer multiple", value=15.0, step=0.1, format="%.1f",
        )
        shares = c3.number_input(
            "Shares outstanding (use 1 if metric is per-share)",
            value=1.0, step=1e6, format="%.0f",
        )
        submitted = st.form_submit_button("Calculate", type="primary")

    if submitted:
        result = ValuationModels.comparable_multiples(
            metric_val, peer_mult, mult_type, shares,
        )
        _show_result(result, stock_id, user_id, vm, "multiples")


# ── shared result display ─────────────────────────────────────────────

def _show_result(
    result: Dict[str, Any],
    stock_id: int,
    user_id: int,
    vm: ValuationModels,
    model_key: str,
) -> None:
    if result.get("error"):
        st.error(result["error"])
        return

    iv = result.get("intrinsic_value")
    st.success(f"**Intrinsic Value: {fmt_number(iv, prefix='$')}**")

    if st.button("💾 Save Result", key=f"save_{model_key}"):
        vid = vm.save_result(stock_id, result, user_id)
        st.success(f"Saved (id={vid})")


# ── history ───────────────────────────────────────────────────────────

def _render_history(stock_id: int, vm: ValuationModels) -> None:
    st.subheader("📋 Valuation History")
    rows = vm.get_history(stock_id)
    if not rows:
        st.info("No valuations saved yet.")
        return

    data = []
    for r in rows:
        params = json.loads(r["parameters"]) if isinstance(r["parameters"], str) else (r["parameters"] or {})
        data.append({
            "Date": r["valuation_date"],
            "Model": VALUATION_MODEL_TYPES.get(r["model_type"], r["model_type"]),
            "Intrinsic Value": fmt_number(r.get("intrinsic_value"), prefix="$"),
            "Key Params": ", ".join(
                f"{k}={v}" for k, v in list(params.items())[:4]
            ),
        })

    st.dataframe(pd.DataFrame(data), use_container_width=True, hide_index=True)

    # Comparison chart
    chart_data = pd.DataFrame([
        {
            "date": r["valuation_date"],
            "model": r["model_type"],
            "value": r.get("intrinsic_value") or 0,
        }
        for r in rows
        if r.get("intrinsic_value")
    ])
    if not chart_data.empty:
        st.subheader("Value Comparison")
        pivot = chart_data.pivot_table(
            index="date", columns="model", values="value", aggfunc="last",
        )
        st.line_chart(pivot)
