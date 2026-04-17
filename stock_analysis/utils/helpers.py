"""
Helpers — Formatting, currency, and misc utilities for the
stock-analysis module.
"""

import json
import math
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union


# ── number formatting ──────────────────────────────────────────────────

def fmt_number(
    value: Optional[float],
    decimals: int = 2,
    prefix: str = "",
    suffix: str = "",
    abbreviate: bool = False,
) -> str:
    """Human-friendly number formatting.

    >>> fmt_number(1_234_567_890, abbreviate=True, prefix="$")
    '$1.23B'
    """
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "—"
    if abbreviate:
        abs_val = abs(value)
        sign = "-" if value < 0 else ""
        if abs_val >= 1e12:
            return f"{sign}{prefix}{abs_val / 1e12:.{decimals}f}T{suffix}"
        if abs_val >= 1e9:
            return f"{sign}{prefix}{abs_val / 1e9:.{decimals}f}B{suffix}"
        if abs_val >= 1e6:
            return f"{sign}{prefix}{abs_val / 1e6:.{decimals}f}M{suffix}"
        if abs_val >= 1e3:
            return f"{sign}{prefix}{abs_val / 1e3:.{decimals}f}K{suffix}"
    return f"{prefix}{value:,.{decimals}f}{suffix}"


def fmt_percent(value: Optional[float], decimals: int = 2) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "—"
    return f"{value * 100:.{decimals}f}%"


def fmt_ratio(value: Optional[float], decimals: int = 2) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "—"
    return f"{value:.{decimals}f}x"


# ── colour coding ─────────────────────────────────────────────────────

def metric_color(
    value: Optional[float],
    good_above: Optional[float] = None,
    bad_below: Optional[float] = None,
) -> str:
    """Return a CSS-safe colour string for Streamlit st.markdown."""
    if value is None:
        return "gray"
    if good_above is not None and value >= good_above:
        return "green"
    if bad_below is not None and value <= bad_below:
        return "red"
    return "orange"


def score_emoji(score: Optional[float]) -> str:
    if score is None:
        return "⬜"
    if score >= 80:
        return "🟢"
    if score >= 60:
        return "🟡"
    if score >= 40:
        return "🟠"
    return "🔴"


# ── date helpers ───────────────────────────────────────────────────────

def iso_today() -> str:
    return date.today().isoformat()


def parse_iso_date(d: str) -> Optional[date]:
    try:
        return datetime.strptime(d, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def fiscal_year_label(year: int, quarter: Optional[int] = None) -> str:
    if quarter:
        return f"FY{year} Q{quarter}"
    return f"FY{year}"


# ── dict / JSON helpers ───────────────────────────────────────────────

def safe_json_loads(text: str) -> Any:
    """Parse JSON, returning None on failure instead of raising."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None


def flatten_dict(
    d: Dict[str, Any], parent_key: str = "", sep: str = "."
) -> Dict[str, Any]:
    """Flatten nested dicts into dot-separated keys."""
    items: List[tuple] = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


# ── Streamlit / UI helpers ─────────────────────────────────────────────

def colored_metric_html(
    label: str,
    value: str,
    color: str = "white",
) -> str:
    """Small HTML snippet for a coloured metric card."""
    return (
        f'<div style="text-align:center; padding:8px; '
        f'border-radius:8px; background:#1e1e1e; margin:4px;">'
        f'<div style="color:#888; font-size:0.8em;">{label}</div>'
        f'<div style="color:{color}; font-size:1.3em; font-weight:bold;">'
        f'{value}</div></div>'
    )


def badge_html(text: str, bg: str = "#444", fg: str = "white") -> str:
    return (
        f'<span style="background:{bg}; color:{fg}; padding:2px 8px; '
        f'border-radius:4px; font-size:0.8em;">{text}</span>'
    )
