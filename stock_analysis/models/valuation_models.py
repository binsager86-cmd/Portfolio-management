"""
Valuation Models — Graham Number, DCF, DDM, and Comparable Multiples.

Each model is a pure function that takes financial inputs and returns
an intrinsic-value estimate with assumptions.
"""

import json
import math
import time
from datetime import date
from typing import Any, Dict, List, Optional

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.config import VALUATION_MODEL_TYPES


class ValuationModels:
    """CFA-aligned valuation model calculators + DB persistence."""

    def __init__(self, db: Optional[AnalysisDatabase] = None):
        self.db = db or AnalysisDatabase()

    # ──────────────────────────────────────────────────────────────────
    # 1.  Graham Number
    # ──────────────────────────────────────────────────────────────────
    @staticmethod
    def graham_number(
        eps: float,
        book_value_per_share: float,
        multiplier: float = 22.5,
    ) -> Dict[str, Any]:
        """V = sqrt(multiplier × EPS × BVPS)

        Default multiplier = 22.5 = 15 (P/E) × 1.5 (P/B).
        """
        if eps <= 0 or book_value_per_share <= 0:
            return {
                "model": "graham",
                "intrinsic_value": None,
                "error": "EPS and BVPS must both be positive for Graham Number.",
                "parameters": {
                    "eps": eps,
                    "bvps": book_value_per_share,
                    "multiplier": multiplier,
                },
            }
        iv = math.sqrt(multiplier * eps * book_value_per_share)
        return {
            "model": "graham",
            "intrinsic_value": round(iv, 2),
            "parameters": {
                "eps": eps,
                "bvps": book_value_per_share,
                "multiplier": multiplier,
            },
            "assumptions": {
                "max_pe": 15,
                "max_pb": 1.5,
            },
        }

    # ──────────────────────────────────────────────────────────────────
    # 2.  Discounted Cash Flow (Two-Stage)
    # ──────────────────────────────────────────────────────────────────
    @staticmethod
    def dcf(
        fcf: float,
        growth_rate_stage1: float,
        growth_rate_stage2: float,
        discount_rate: float,
        stage1_years: int = 5,
        stage2_years: int = 5,
        terminal_growth: float = 0.025,
        shares_outstanding: float = 1.0,
    ) -> Dict[str, Any]:
        """Two-stage DCF with terminal value via Gordon Growth.

        Parameters
        ----------
        fcf : float – last-twelve-months free cash flow
        growth_rate_stage1 : float – high-growth phase rate (e.g. 0.12)
        growth_rate_stage2 : float – transition phase rate
        discount_rate : float – WACC or required return (e.g. 0.10)
        stage1_years, stage2_years : int
        terminal_growth : float – perpetuity growth rate
        shares_outstanding : float
        """
        if discount_rate <= terminal_growth:
            return {
                "model": "dcf",
                "intrinsic_value": None,
                "error": "Discount rate must exceed terminal growth rate.",
            }

        projected_cfs: List[float] = []
        cf = fcf

        # Stage 1
        for yr in range(1, stage1_years + 1):
            cf *= 1 + growth_rate_stage1
            pv = cf / ((1 + discount_rate) ** yr)
            projected_cfs.append(round(pv, 2))

        # Stage 2
        for yr in range(
            stage1_years + 1, stage1_years + stage2_years + 1
        ):
            cf *= 1 + growth_rate_stage2
            pv = cf / ((1 + discount_rate) ** yr)
            projected_cfs.append(round(pv, 2))

        # Terminal value (Gordon Growth)
        terminal_cf = cf * (1 + terminal_growth)
        terminal_value = terminal_cf / (discount_rate - terminal_growth)
        total_years = stage1_years + stage2_years
        pv_terminal = terminal_value / ((1 + discount_rate) ** total_years)

        enterprise_value = sum(projected_cfs) + pv_terminal
        equity_value = enterprise_value  # simplified (no net-debt adj here)
        per_share = equity_value / shares_outstanding if shares_outstanding else 0

        return {
            "model": "dcf",
            "intrinsic_value": round(per_share, 2),
            "enterprise_value": round(enterprise_value, 2),
            "pv_terminal": round(pv_terminal, 2),
            "pv_fcfs": round(sum(projected_cfs), 2),
            "parameters": {
                "fcf": fcf,
                "growth_stage1": growth_rate_stage1,
                "growth_stage2": growth_rate_stage2,
                "discount_rate": discount_rate,
                "stage1_years": stage1_years,
                "stage2_years": stage2_years,
                "terminal_growth": terminal_growth,
                "shares_outstanding": shares_outstanding,
            },
            "assumptions": {
                "method": "Two-stage DCF with Gordon Growth terminal value",
            },
        }

    # ──────────────────────────────────────────────────────────────────
    # 3.  Dividend Discount Model (Multi-Stage)
    # ──────────────────────────────────────────────────────────────────
    @staticmethod
    def ddm(
        last_dividend: float,
        growth_rate: float,
        required_return: float,
        high_growth_years: int = 5,
        high_growth_rate: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Dividend Discount Model.

        If *high_growth_rate* is supplied → two-stage DDM;
        otherwise → single-stage (Gordon Growth Model).
        """
        if required_return <= growth_rate:
            return {
                "model": "ddm",
                "intrinsic_value": None,
                "error": "Required return must exceed stable growth rate.",
            }

        if high_growth_rate is None:
            # Gordon Growth single stage
            iv = last_dividend * (1 + growth_rate) / (
                required_return - growth_rate
            )
            return {
                "model": "ddm",
                "intrinsic_value": round(iv, 2),
                "parameters": {
                    "last_dividend": last_dividend,
                    "growth_rate": growth_rate,
                    "required_return": required_return,
                },
                "assumptions": {"method": "Gordon Growth (single stage)"},
            }

        # Two-stage
        pv_dividends = 0.0
        div = last_dividend
        for yr in range(1, high_growth_years + 1):
            div *= 1 + high_growth_rate
            pv_dividends += div / ((1 + required_return) ** yr)

        # Terminal value at end of high-growth phase
        terminal_div = div * (1 + growth_rate)
        terminal_value = terminal_div / (required_return - growth_rate)
        pv_terminal = terminal_value / (
            (1 + required_return) ** high_growth_years
        )

        iv = pv_dividends + pv_terminal
        return {
            "model": "ddm",
            "intrinsic_value": round(iv, 2),
            "pv_dividends": round(pv_dividends, 2),
            "pv_terminal": round(pv_terminal, 2),
            "parameters": {
                "last_dividend": last_dividend,
                "growth_rate": growth_rate,
                "required_return": required_return,
                "high_growth_years": high_growth_years,
                "high_growth_rate": high_growth_rate,
            },
            "assumptions": {"method": "Two-stage DDM"},
        }

    # ──────────────────────────────────────────────────────────────────
    # 4.  Comparable Multiples
    # ──────────────────────────────────────────────────────────────────
    @staticmethod
    def comparable_multiples(
        metric_value: float,
        peer_multiple: float,
        multiple_type: str = "P/E",
        shares_outstanding: float = 1.0,
    ) -> Dict[str, Any]:
        """Apply a peer-group multiple to a fundamental metric.

        Examples:
            metric_value = EPS,  peer_multiple = sector median P/E
            metric_value = EBITDA, peer_multiple = EV/EBITDA
        """
        implied_value = metric_value * peer_multiple
        per_share = implied_value / shares_outstanding if shares_outstanding else 0

        return {
            "model": "multiples",
            "intrinsic_value": round(per_share, 2),
            "implied_total": round(implied_value, 2),
            "parameters": {
                "metric_value": metric_value,
                "peer_multiple": peer_multiple,
                "multiple_type": multiple_type,
                "shares_outstanding": shares_outstanding,
            },
            "assumptions": {
                "method": f"Comparable {multiple_type} multiple",
            },
        }

    # ──────────────────────────────────────────────────────────────────
    # Persist result to DB
    # ──────────────────────────────────────────────────────────────────
    def save_result(
        self,
        stock_id: int,
        result: Dict[str, Any],
        user_id: int = 1,
    ) -> int:
        """Save a valuation result dict to the database."""
        return self.db.save_valuation(
            stock_id,
            model_type=result["model"],
            valuation_date=date.today().isoformat(),
            intrinsic_value=result.get("intrinsic_value"),
            parameters=result.get("parameters", {}),
            assumptions=result.get("assumptions", {}),
            created_by_user_id=user_id,
        )

    def get_history(self, stock_id: int) -> List[Dict[str, Any]]:
        return self.db.get_valuations(stock_id)
