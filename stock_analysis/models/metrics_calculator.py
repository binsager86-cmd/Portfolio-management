"""
Metrics Calculator — CFA-aligned financial ratios and scoring.

Computes profitability, liquidity, leverage, efficiency, valuation,
growth, and cash-flow metrics from stored financial line items.
"""

from typing import Any, Dict, List, Optional, Tuple

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.config import METRIC_CATEGORIES


class MetricsCalculator:
    """Calculate and store financial metrics from extracted data."""

    def __init__(self, db: Optional[AnalysisDatabase] = None):
        self.db = db or AnalysisDatabase()

    # ── public entry point ─────────────────────────────────────────────
    def calculate_all_metrics(
        self,
        stock_id: int,
        period_end_date: str,
        fiscal_year: int,
        fiscal_quarter: Optional[int] = None,
    ) -> Dict[str, Dict[str, Optional[float]]]:
        """Calculate every available metric for one period and persist."""

        items = self._load_items_for_period(stock_id, period_end_date)
        if not items:
            return {}

        def _get(code: str) -> Optional[float]:
            return items.get(code)

        results: Dict[str, Dict[str, Optional[float]]] = {}

        # ── profitability ──────────────────────────────────────────────
        prof: Dict[str, Optional[float]] = {}
        revenue = _get("REVENUE")
        gross_profit = _get("GROSS_PROFIT")
        operating_income = _get("OPERATING_INCOME")
        net_income = _get("NET_INCOME")
        total_assets = _get("TOTAL_ASSETS")
        total_equity = _get("TOTAL_EQUITY")

        if revenue and revenue != 0:
            if gross_profit is not None:
                prof["Gross Margin"] = gross_profit / revenue
            if operating_income is not None:
                prof["Operating Margin"] = operating_income / revenue
            if net_income is not None:
                prof["Net Margin"] = net_income / revenue
        if total_assets and total_assets != 0 and net_income is not None:
            prof["ROA"] = net_income / total_assets
        if total_equity and total_equity != 0 and net_income is not None:
            prof["ROE"] = net_income / total_equity

        # DuPont decomposition
        if all(v is not None and v != 0 for v in [net_income, revenue, total_assets, total_equity]):
            margin = net_income / revenue
            turnover = revenue / total_assets
            leverage = total_assets / total_equity
            prof["DuPont ROE"] = margin * turnover * leverage

        ebitda = _get("EBITDA")
        if ebitda is None:
            # derive: Operating Income + D&A
            da = _get("DEPRECIATION_AMORTIZATION")
            if operating_income is not None and da is not None:
                ebitda = operating_income + abs(da)
        if ebitda is not None and revenue and revenue != 0:
            prof["EBITDA Margin"] = ebitda / revenue

        results["profitability"] = prof

        # ── liquidity ──────────────────────────────────────────────────
        liq: Dict[str, Optional[float]] = {}
        current_assets = _get("TOTAL_CURRENT_ASSETS")
        current_liab = _get("TOTAL_CURRENT_LIABILITIES")
        inventory = _get("INVENTORY")
        cash = _get("CASH_EQUIVALENTS")

        if current_assets is not None and current_liab and current_liab != 0:
            liq["Current Ratio"] = current_assets / current_liab
            if inventory is not None:
                liq["Quick Ratio"] = (current_assets - inventory) / current_liab
            if cash is not None:
                liq["Cash Ratio"] = cash / current_liab

        results["liquidity"] = liq

        # ── leverage / solvency ────────────────────────────────────────
        lev: Dict[str, Optional[float]] = {}
        total_liab = _get("TOTAL_LIABILITIES")
        lt_debt = _get("LONG_TERM_DEBT")
        st_debt = _get("SHORT_TERM_DEBT")
        interest_expense = _get("INTEREST_EXPENSE")

        if total_liab is not None and total_equity and total_equity != 0:
            lev["Debt-to-Equity"] = total_liab / total_equity
        if total_liab is not None and total_assets and total_assets != 0:
            lev["Debt-to-Assets"] = total_liab / total_assets
        total_debt = (lt_debt or 0) + (st_debt or 0)
        if total_debt and total_equity and total_equity != 0:
            lev["Total Debt / Equity"] = total_debt / total_equity
        if ebitda and ebitda != 0 and total_debt:
            lev["Debt / EBITDA"] = total_debt / ebitda
        if interest_expense and interest_expense != 0 and operating_income is not None:
            lev["Interest Coverage"] = operating_income / abs(interest_expense)
        if total_assets and total_equity and total_equity != 0:
            lev["Equity Multiplier"] = total_assets / total_equity

        results["leverage"] = lev

        # ── efficiency / activity ──────────────────────────────────────
        eff: Dict[str, Optional[float]] = {}
        ar = _get("ACCOUNTS_RECEIVABLE")
        ap = _get("ACCOUNTS_PAYABLE")
        cogs = _get("COST_OF_REVENUE")

        if revenue and total_assets and total_assets != 0:
            eff["Asset Turnover"] = revenue / total_assets
        if revenue and ar and ar != 0:
            eff["Receivables Turnover"] = revenue / ar
            eff["Days Sales Outstanding"] = 365.0 / (revenue / ar)
        if cogs and inventory and inventory != 0:
            eff["Inventory Turnover"] = cogs / inventory
            eff["Days Inventory"] = 365.0 / (cogs / inventory)
        if cogs and ap and ap != 0:
            eff["Payables Turnover"] = cogs / ap
            eff["Days Payable"] = 365.0 / (cogs / ap)

        # Cash Conversion Cycle
        dso = eff.get("Days Sales Outstanding")
        dio = eff.get("Days Inventory")
        dpo = eff.get("Days Payable")
        if all(v is not None for v in [dso, dio, dpo]):
            eff["Cash Conversion Cycle"] = dso + dio - dpo

        results["efficiency"] = eff

        # ── valuation (per-share) ──────────────────────────────────────
        val: Dict[str, Optional[float]] = {}
        eps = _get("EPS_DILUTED") or _get("EPS_BASIC")
        shares = _get("SHARES_DILUTED") or _get("SHARES_BASIC") or _get("SHARE_COUNT")
        bvps = None
        if total_equity is not None and shares and shares != 0:
            bvps = total_equity / shares
            val["Book Value / Share"] = bvps
        if eps is not None:
            val["EPS"] = eps
        dividends_paid = _get("DIVIDENDS_PAID")
        if dividends_paid is not None and shares and shares != 0:
            dps = abs(dividends_paid) / shares
            val["Dividends / Share"] = dps
            if eps and eps != 0:
                val["Payout Ratio"] = dps / eps

        results["valuation"] = val

        # ── cash flow ──────────────────────────────────────────────────
        cfm: Dict[str, Optional[float]] = {}
        cfo = _get("CASH_FROM_OPERATIONS")
        capex = _get("CAPITAL_EXPENDITURES") or _get("CAPEX")
        fcf = _get("FCF")
        if fcf is None and cfo is not None and capex is not None:
            fcf = cfo - abs(capex)
        if fcf is not None:
            cfm["Free Cash Flow"] = fcf
            if revenue and revenue != 0:
                cfm["FCF Margin"] = fcf / revenue
            if shares and shares != 0:
                cfm["FCF / Share"] = fcf / shares
        if cfo is not None and net_income and net_income != 0:
            cfm["CFO / Net Income"] = cfo / net_income

        results["cashflow"] = cfm

        # ── persist all metrics ────────────────────────────────────────
        for category, metrics in results.items():
            for name, value in metrics.items():
                if value is not None:
                    self.db.upsert_metric(
                        stock_id, fiscal_year, period_end_date,
                        category, name, value, fiscal_quarter,
                    )

        return results

    # ── growth metrics (needs ≥ 2 periods) ─────────────────────────────
    def calculate_growth(
        self, stock_id: int
    ) -> Dict[str, List[Dict[str, Any]]]:
        """YoY growth rates for key items across all available periods."""
        growth: Dict[str, List[Dict[str, Any]]] = {}
        growth_items = [
            ("REVENUE", "Revenue Growth"),
            ("NET_INCOME", "Net Income Growth"),
            ("EPS_DILUTED", "EPS Growth"),
            ("TOTAL_ASSETS", "Total Assets Growth"),
            ("CASH_FROM_OPERATIONS", "CFO Growth"),
        ]

        for code, label in growth_items:
            periods = self._get_item_across_periods(stock_id, code, "income")
            if code in ("TOTAL_ASSETS",):
                periods = self._get_item_across_periods(stock_id, code, "balance")
            elif code in ("CASH_FROM_OPERATIONS",):
                periods = self._get_item_across_periods(stock_id, code, "cashflow")

            if len(periods) < 2:
                continue

            rates: List[Dict[str, Any]] = []
            for i in range(1, len(periods)):
                prev = periods[i - 1]
                curr = periods[i]
                if prev["amount"] and prev["amount"] != 0:
                    g = (curr["amount"] - prev["amount"]) / abs(prev["amount"])
                    rates.append({
                        "period": curr["period"],
                        "prev_period": prev["period"],
                        "growth": round(g, 4),
                    })
                    # persist
                    self.db.upsert_metric(
                        stock_id,
                        curr.get("fiscal_year", 0),
                        curr["period"],
                        "growth",
                        label,
                        round(g, 4),
                    )
            growth[label] = rates

        return growth

    # ── scoring (CFA principles) ───────────────────────────────────────
    def compute_stock_score(
        self, stock_id: int, user_id: int = 1
    ) -> Dict[str, Any]:
        """Composite score (0-100) based on latest metrics.

        Sub-scores:
        - fundamental_score (profitability + liquidity + leverage)
        - valuation_score
        - growth_score
        - quality_score (cash-flow quality + consistency)
        """
        metrics = self.db.get_metrics(stock_id)
        if not metrics:
            return {"overall_score": None, "error": "No metrics available"}

        latest: Dict[str, float] = {}
        for m in metrics:
            if m["metric_name"] not in latest:
                latest[m["metric_name"]] = m["metric_value"]

        fund = self._score_fundamentals(latest)
        val = self._score_valuation(latest)
        growth = self._score_growth(latest)
        quality = self._score_quality(latest)

        overall = (
            fund * 0.30 + val * 0.25 + growth * 0.25 + quality * 0.20
        )

        result = {
            "overall_score": round(overall, 1),
            "fundamental_score": round(fund, 1),
            "valuation_score": round(val, 1),
            "growth_score": round(growth, 1),
            "quality_score": round(quality, 1),
            "details": latest,
        }

        # persist
        from datetime import date

        self.db.save_score(
            stock_id,
            scoring_date=date.today().isoformat(),
            overall_score=result["overall_score"],
            fundamental_score=result["fundamental_score"],
            valuation_score=result["valuation_score"],
            growth_score=result["growth_score"],
            quality_score=result["quality_score"],
            details=result["details"],
            created_by_user_id=user_id,
        )
        return result

    # ── private helpers ────────────────────────────────────────────────
    def _load_items_for_period(
        self, stock_id: int, period_end_date: str
    ) -> Dict[str, float]:
        """Flatten all line items across all statement types for one period."""
        rows = self.db.execute_query(
            """SELECT li.line_item_code, li.amount
               FROM financial_line_items li
               JOIN financial_statements fs ON fs.id = li.statement_id
               WHERE fs.stock_id = ? AND fs.period_end_date = ?""",
            (stock_id, period_end_date),
        )
        return {r["line_item_code"]: r["amount"] for r in rows}

    def _get_item_across_periods(
        self, stock_id: int, code: str, stmt_type: str
    ) -> List[Dict[str, Any]]:
        rows = self.db.execute_query(
            """SELECT fs.period_end_date AS period,
                      fs.fiscal_year,
                      li.amount
               FROM financial_line_items li
               JOIN financial_statements fs ON fs.id = li.statement_id
               WHERE fs.stock_id = ?
                 AND fs.statement_type = ?
                 AND li.line_item_code = ?
               ORDER BY fs.period_end_date""",
            (stock_id, stmt_type, code),
        )
        return [dict(r) for r in rows]

    # ── sub-score helpers (each returns 0-100) ─────────────────────────
    @staticmethod
    def _score_fundamentals(m: Dict[str, float]) -> float:
        score = 50.0  # neutral start
        roe = m.get("ROE")
        if roe is not None:
            if roe > 0.20:
                score += 15
            elif roe > 0.12:
                score += 10
            elif roe > 0.05:
                score += 5
            elif roe < 0:
                score -= 15

        cr = m.get("Current Ratio")
        if cr is not None:
            if 1.5 <= cr <= 3.0:
                score += 10
            elif cr >= 1.0:
                score += 5
            else:
                score -= 10

        de = m.get("Debt-to-Equity")
        if de is not None:
            if de < 0.5:
                score += 10
            elif de < 1.0:
                score += 5
            elif de > 2.0:
                score -= 10

        nm = m.get("Net Margin")
        if nm is not None:
            if nm > 0.15:
                score += 10
            elif nm > 0.05:
                score += 5
            elif nm < 0:
                score -= 10

        ic = m.get("Interest Coverage")
        if ic is not None:
            if ic > 5:
                score += 5
            elif ic < 1.5:
                score -= 10

        return max(0.0, min(100.0, score))

    @staticmethod
    def _score_valuation(m: Dict[str, float]) -> float:
        score = 50.0
        pr = m.get("Payout Ratio")
        if pr is not None:
            if 0.20 <= pr <= 0.60:
                score += 10
            elif pr > 1.0:
                score -= 10
        bvps = m.get("Book Value / Share")
        if bvps is not None and bvps > 0:
            score += 5
        return max(0.0, min(100.0, score))

    @staticmethod
    def _score_growth(m: Dict[str, float]) -> float:
        score = 50.0
        rg = m.get("Revenue Growth")
        if rg is not None:
            if rg > 0.10:
                score += 15
            elif rg > 0.03:
                score += 10
            elif rg < -0.05:
                score -= 15
        eg = m.get("EPS Growth")
        if eg is not None:
            if eg > 0.10:
                score += 15
            elif eg > 0:
                score += 5
            elif eg < -0.10:
                score -= 15
        return max(0.0, min(100.0, score))

    @staticmethod
    def _score_quality(m: Dict[str, float]) -> float:
        score = 50.0
        cfoni = m.get("CFO / Net Income")
        if cfoni is not None:
            if cfoni > 1.0:
                score += 15   # cash earnings > accrual earnings
            elif cfoni > 0.8:
                score += 5
            elif cfoni < 0.5:
                score -= 10

        fcf_m = m.get("FCF Margin")
        if fcf_m is not None:
            if fcf_m > 0.10:
                score += 10
            elif fcf_m > 0:
                score += 5
            else:
                score -= 10

        return max(0.0, min(100.0, score))
