"""
Validators — accounting balance checks on normalised financial data.

Each checker returns a list of ``ValidationResult`` objects.
Failures are logged but do NOT block storage — the system stores
data with ``needs_review`` flags instead.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """One accounting-check outcome."""
    statement_type: str
    rule_name: str
    expected_value: Optional[float] = None
    actual_value: Optional[float] = None
    diff: Optional[float] = None
    pass_fail: str = "skip"      # pass | fail | skip
    notes: str = ""


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

def validate_all(
    normalised: Dict[str, Any],
    tolerance_pct: float = 0.01,
) -> List[ValidationResult]:
    """Run all applicable checks on a pipeline result.

    ``normalised`` is the dict with key ``statements`` containing
    sub-dicts for ``income_statement``, ``balance_sheet``, ``cash_flow``,
    each with ``periods`` → ``items``.

    Returns a flat list of ``ValidationResult``.
    """
    results: List[ValidationResult] = []

    stmts = normalised.get("statements", {})

    # Income Statement
    for period in _iter_periods(stmts.get("income_statement")):
        results.extend(_validate_income(period, tolerance_pct))

    # Balance Sheet
    for period in _iter_periods(stmts.get("balance_sheet")):
        results.extend(_validate_balance(period, tolerance_pct))

    # Cash Flow
    for period in _iter_periods(stmts.get("cash_flow")):
        results.extend(_validate_cashflow(period, tolerance_pct))

    return results


# ─────────────────────────────────────────────────────────────────────
# Per-statement validators
# ─────────────────────────────────────────────────────────────────────

def _validate_income(
    period: Dict[str, Any], tol: float,
) -> List[ValidationResult]:
    """Income Statement checks."""
    items = _items_map(period)
    results: List[ValidationResult] = []

    # gross_profit ≈ revenue - cogs
    rev = items.get("REVENUE")
    cogs = items.get("COST_OF_REVENUE")
    gp = items.get("GROSS_PROFIT")
    if rev is not None and cogs is not None and gp is not None:
        expected = rev - cogs
        results.append(_check("income", "gross_profit_eq",
                               expected, gp, tol, rev))

    # operating_income ≈ gross_profit - opex
    opex = items.get("OPERATING_EXPENSES")
    oi = items.get("OPERATING_INCOME")
    if gp is not None and opex is not None and oi is not None:
        expected = gp - opex
        results.append(_check("income", "operating_income_eq",
                               expected, oi, tol, rev or gp))

    # net_income ≈ operating_income +/- other +/- tax
    ni = items.get("NET_INCOME")
    tax = items.get("INCOME_TAX", 0)
    other = items.get("OTHER_INCOME", 0)
    interest = items.get("INTEREST_EXPENSE", 0)
    if oi is not None and ni is not None:
        expected = oi + (other or 0) - (interest or 0) - (tax or 0)
        results.append(_check("income", "net_income_eq",
                               expected, ni, tol, rev or oi))

    return results


def _validate_balance(
    period: Dict[str, Any], tol: float,
) -> List[ValidationResult]:
    """Balance Sheet: total_assets ≈ total_liabilities + total_equity."""
    items = _items_map(period)
    results: List[ValidationResult] = []

    ta = items.get("TOTAL_ASSETS")
    tl = items.get("TOTAL_LIABILITIES")
    te = items.get("TOTAL_EQUITY")

    if ta is not None and tl is not None and te is not None:
        expected = tl + te
        results.append(_check("balance", "assets_eq_liab_equity",
                               expected, ta, tol, ta))

    # total_liabilities_equity ≈ total_assets
    tle = items.get("TOTAL_LIABILITIES_EQUITY")
    if ta is not None and tle is not None:
        results.append(_check("balance", "tle_eq_assets",
                               ta, tle, tol, ta))

    return results


def _validate_cashflow(
    period: Dict[str, Any], tol: float,
) -> List[ValidationResult]:
    """Cash Flow checks."""
    items = _items_map(period)
    results: List[ValidationResult] = []

    cfo = items.get("CASH_FROM_OPERATIONS")
    cfi = items.get("CASH_FROM_INVESTING")
    cff = items.get("CASH_FROM_FINANCING")
    net = items.get("NET_CHANGE_CASH")

    # net_change ≈ cfo + cfi + cff
    if cfo is not None and cfi is not None and cff is not None and net is not None:
        expected = cfo + cfi + cff
        results.append(_check("cashflow", "net_change_eq_sum",
                               expected, net, tol, abs(cfo)))

    # ending_cash ≈ beginning_cash + net_change
    beg = items.get("BEGINNING_CASH")
    end = items.get("ENDING_CASH")
    if beg is not None and net is not None and end is not None:
        expected = beg + net
        results.append(_check("cashflow", "ending_cash_eq",
                               expected, end, tol, abs(beg) or abs(end)))

    return results


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

def _iter_periods(stmt: Optional[Dict[str, Any]]):
    """Yield period dicts from a statement sub-dict."""
    if not stmt:
        return
    for p in stmt.get("periods", []):
        yield p


def _items_map(period: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """Build a key → value map from a period's items list."""
    m: Dict[str, Optional[float]] = {}
    for item in period.get("items", []):
        key = item.get("line_item_key", "").upper()
        val = item.get("value")
        if val is not None:
            try:
                m[key] = float(val)
            except (ValueError, TypeError):
                pass
    return m


def _check(
    stmt_type: str, rule: str,
    expected: float, actual: float,
    tol_pct: float, base: Optional[float],
) -> ValidationResult:
    """Compare expected vs actual with tolerance."""
    diff = abs(expected - actual)
    base_val = abs(base) if base else abs(expected) or 1
    rel = diff / base_val if base_val else 0

    if rel <= tol_pct:
        pf = "pass"
        note = f"Within {tol_pct*100:.1f}% tolerance (diff={diff:,.0f}, rel={rel:.4f})"
    else:
        pf = "fail"
        note = f"Exceeds {tol_pct*100:.1f}% tolerance (diff={diff:,.0f}, rel={rel:.4f})"
        logger.warning("Validation FAIL [%s/%s]: expected=%.2f actual=%.2f diff=%.2f",
                        stmt_type, rule, expected, actual, diff)

    return ValidationResult(
        statement_type=stmt_type,
        rule_name=rule,
        expected_value=round(expected, 2),
        actual_value=round(actual, 2),
        diff=round(diff, 2),
        pass_fail=pf,
        notes=note,
    )
