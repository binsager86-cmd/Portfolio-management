"""
Validators — Data-quality checks for the stock-analysis module.
"""

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from stock_analysis.config import (
    EXCHANGE_CHOICES,
    FINANCIAL_LINE_ITEM_CODES,
    STATEMENT_TYPES,
    VALIDATION_CONFIG,
)


# ── Stock profile validation ──────────────────────────────────────────

def validate_stock_profile(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Return (is_valid, list_of_error_messages)."""
    errors: List[str] = []

    symbol = (data.get("symbol") or "").strip()
    if not symbol:
        errors.append("Symbol is required.")
    elif not re.match(r"^[A-Za-z0-9.\-]{1,20}$", symbol):
        errors.append("Symbol must be 1-20 alphanumeric chars (dots/hyphens ok).")

    name = (data.get("company_name") or "").strip()
    if not name:
        errors.append("Company name is required.")
    elif len(name) > 200:
        errors.append("Company name is too long (max 200 chars).")

    isin = (data.get("isin") or "").strip()
    if isin and not re.match(r"^[A-Z]{2}[A-Z0-9]{10}$", isin):
        errors.append("ISIN must be 2-letter country code + 10 alphanum chars.")

    website = (data.get("website") or "").strip()
    if website and not website.startswith(("http://", "https://")):
        errors.append("Website must start with http:// or https://.")

    return (len(errors) == 0, errors)


# ── Financial statement validation ────────────────────────────────────

def validate_statement_type(stype: str) -> bool:
    return stype in STATEMENT_TYPES


def validate_period_end_date(d: str) -> Tuple[bool, str]:
    """Validate ISO date string. Returns (ok, normalised_date_or_error)."""
    try:
        parsed = datetime.strptime(d, "%Y-%m-%d").date()
        if parsed > date.today():
            return False, "Period end date is in the future."
        return True, parsed.isoformat()
    except ValueError:
        return False, f"Invalid date format: '{d}'. Use YYYY-MM-DD."


def validate_fiscal_year(year: int) -> Tuple[bool, str]:
    if not isinstance(year, int):
        return False, "Fiscal year must be an integer."
    if year < 1900 or year > date.today().year + 1:
        return False, f"Fiscal year {year} is out of reasonable range."
    return True, ""


# ── Line-item validation ──────────────────────────────────────────────

def validate_line_items(
    items: List[Dict[str, Any]],
) -> Tuple[bool, List[str]]:
    """Validate a list of extracted line-item dicts."""
    warnings: List[str] = []
    if not items:
        return False, ["No line items provided."]

    for idx, it in enumerate(items):
        code = it.get("code", "")
        if not code:
            warnings.append(f"Item {idx}: missing 'code'.")
        amount = it.get("amount")
        if amount is None:
            warnings.append(f"Item {idx} ({code}): missing 'amount'.")
        elif not isinstance(amount, (int, float)):
            try:
                float(amount)
            except (ValueError, TypeError):
                warnings.append(f"Item {idx} ({code}): non-numeric amount '{amount}'.")

    is_ok = not any("missing 'code'" in w or "missing 'amount'" in w for w in warnings)
    return is_ok, warnings


# ── Balance-sheet balance check ───────────────────────────────────────

def check_balance_sheet_balance(
    items: List[Dict[str, Any]],
) -> Tuple[bool, str]:
    """Assets == Liabilities + Equity within tolerance."""
    lookup = {it["code"]: it.get("amount", 0) for it in items if "code" in it}
    total_a = lookup.get("TOTAL_ASSETS")
    total_le = lookup.get("TOTAL_LIABILITIES_EQUITY")
    if total_a is None or total_le is None:
        return True, "Cannot check: TOTAL_ASSETS or TOTAL_LIABILITIES_EQUITY missing."
    diff = abs(total_a - total_le)
    tol = max(abs(total_a), abs(total_le)) * VALIDATION_CONFIG["balance_sheet_tolerance"]
    if diff <= tol:
        return True, f"Balanced (diff={diff:,.0f}, tol={tol:,.0f})."
    return False, (
        f"IMBALANCED: Assets={total_a:,.0f}, L+E={total_le:,.0f}, "
        f"diff={diff:,.0f} exceeds {VALIDATION_CONFIG['balance_sheet_tolerance']:.0%} tolerance."
    )


# ── Amount reasonableness ─────────────────────────────────────────────

def check_yoy_growth(
    current: float, previous: float, label: str = "item"
) -> Optional[str]:
    """Return a warning string if YoY growth exceeds threshold."""
    if previous == 0:
        return None
    growth = (current - previous) / abs(previous)
    threshold = VALIDATION_CONFIG["max_reasonable_growth_rate"]
    if abs(growth) > threshold:
        return (
            f"{label}: YoY change {growth:.1%} exceeds ±{threshold:.0%} threshold — review."
        )
    return None
