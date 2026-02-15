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
from stock_analysis.config import STATEMENT_TYPES, METRIC_CATEGORIES


def _get_db() -> AnalysisDatabase:
    if "analysis_db" not in st.session_state:
        st.session_state["analysis_db"] = AnalysisDatabase()
    return st.session_state["analysis_db"]


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

    for s in stmts:
        label = f"FY{s['fiscal_year']} — {s['period_end_date']}"
        with st.expander(label, expanded=(stmts.index(s) == 0)):
            df = fdm.get_line_items_df(s["id"])
            if df.empty:
                st.write("No line items.")
                continue

            # Format amounts
            df["formatted"] = df["amount"].apply(
                lambda x: fmt_number(x, abbreviate=True, prefix="$")
            )

            # Highlight totals
            def _row_style(row):
                if row.get("is_total"):
                    return ["font-weight: bold"] * len(row)
                return [""] * len(row)

            display = df[["line_item_code", "display_name", "formatted", "is_total"]].copy()
            display.columns = ["Code", "Name", "Amount", "Total"]
            st.dataframe(display, use_container_width=True, hide_index=True)


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

    # Format numbers in period columns
    period_cols = [c for c in pivot.columns if c not in ("code", "name")]
    for col in period_cols:
        pivot[col] = pivot[col].apply(
            lambda x: fmt_number(x, abbreviate=True, prefix="$") if pd.notna(x) else "—"
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
    mc = MetricsCalculator(db)
    fdm = FinancialDataManager(db)

    # Period selector
    periods = fdm.available_periods(stock_id, "income")
    if not periods:
        periods = fdm.available_periods(stock_id, "balance")
    if not periods:
        st.info("Upload financial statements to calculate metrics.")
        return

    selected_period = st.selectbox(
        "Period", periods, index=len(periods) - 1, key="fa_metric_period"
    )

    # Get the fiscal year for this period
    stmt = db.execute_query(
        "SELECT fiscal_year, fiscal_quarter FROM financial_statements "
        "WHERE stock_id = ? AND period_end_date = ? LIMIT 1",
        (stock_id, selected_period),
    )
    if not stmt:
        st.warning("No statement data for this period.")
        return
    fy = stmt[0]["fiscal_year"]
    fq = stmt[0]["fiscal_quarter"]

    if st.button("🔄 Calculate / Refresh Metrics", type="primary", key="calc_metrics"):
        with st.spinner("Calculating…"):
            results = mc.calculate_all_metrics(
                stock_id, selected_period, fy, fq
            )
        if not results:
            st.warning("No data to calculate metrics from.")
            return
        st.success("✅ Metrics calculated and saved")

    # Display stored metrics
    metrics = db.get_metrics(stock_id)
    if not metrics:
        st.info("Click **Calculate / Refresh Metrics** to compute ratios.")
        return

    # Filter to selected period
    period_metrics = [m for m in metrics if m["period_end_date"] == selected_period]
    if not period_metrics:
        st.info("No metrics for this period yet.")
        return

    # Group by category
    by_cat: Dict[str, List[Dict]] = {}
    for m in period_metrics:
        cat = m["metric_type"]
        by_cat.setdefault(cat, []).append(m)

    for cat, cat_metrics in by_cat.items():
        cat_label = METRIC_CATEGORIES.get(cat, cat.title())
        st.subheader(cat_label)

        cols = st.columns(min(len(cat_metrics), 4))
        for idx, m in enumerate(cat_metrics):
            col = cols[idx % len(cols)]
            val = m["metric_value"]
            name = m["metric_name"]

            # Choose formatter based on metric type
            if "Margin" in name or "ROE" in name or "ROA" in name or "Growth" in name or "Ratio" in name and "Current" not in name:
                formatted = fmt_percent(val)
            elif "Turnover" in name or "Multiplier" in name or "Coverage" in name:
                formatted = fmt_ratio(val)
            elif "Days" in name or "Cycle" in name:
                formatted = f"{val:.1f} days" if val is not None else "—"
            else:
                formatted = fmt_number(val, abbreviate=True, prefix="$")

            col.metric(name, formatted)


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
