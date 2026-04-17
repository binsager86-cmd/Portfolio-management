"""
Robust financial-amount parser.

Handles formats commonly found in scanned Arabic / English financial PDFs:
  • Thousands separators  :  1,234,567
  • Parenthesised negatives:  (1,234)  →  -1234
  • Arabic-Indic digits   :  ١٢٣٤     →  1234
  • Dash / em-dash / hyphen standing for zero/nil:  -  –  —
  • Currency symbols       :  $, KD, KWD, ر.ك, USD (stripped)
  • Percentage signs       :  12.5%  →  12.5
  • Whitespace inside numbers:  1 234  →  1234

Public API:
    parse_amount(raw: str) -> Tuple[Optional[float], Optional[str]]
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional, Tuple

# Bump this whenever the parsing logic changes materially.
EXTRACTOR_VERSION = "v4.0"

# ──────────────────────────────────────────────────────────────
# Arabic-Indic → ASCII digit mapping
# ──────────────────────────────────────────────────────────────
_ARABIC_DIGIT_MAP = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩",  # Arabic-Indic
    "0123456789",
)

# Currency / unit tokens to strip
_CURRENCY_RE = re.compile(
    r"(?:KWD|KD|USD|SAR|AED|BHD|OMR|QAR|EGP|JOD|GBP|EUR|"
    r"\$|£|€|¥|ر\.ك|د\.ك|ريال|دينار|fils|فلس)",
    re.IGNORECASE,
)

# Dash-like characters that mean "zero" or "nil"
_DASH_RE = re.compile(r"^[\s\-–—]+$")

# After cleaning: should look like an optional minus, digits, optional dot+digits
_FINAL_NUMBER_RE = re.compile(r"^-?\d+(?:\.\d+)?$")


def parse_amount(raw: str) -> Tuple[Optional[float], Optional[str]]:
    """Parse a raw financial-cell string into (amount, error).

    Returns:
        (float_value, None)    on success
        (None, error_msg)      on failure — the caller must still keep
                                the original ``raw`` text.
    """
    if raw is None:
        return None, "input_is_none"

    text = str(raw).strip()

    # Empty cell
    if not text:
        return None, "empty_cell"

    # Dash = nil/zero (common in financial tables for "not applicable")
    if _DASH_RE.match(text):
        return None, "dash_nil"

    # Transliterate Arabic-Indic digits
    text = text.translate(_ARABIC_DIGIT_MAP)

    # Strip currency symbols / unit labels
    text = _CURRENCY_RE.sub("", text)

    # Detect parenthesised negative: (1,234.56) → -1234.56
    neg = False
    paren_match = re.match(r"^\((.+)\)$", text.strip())
    if paren_match:
        neg = True
        text = paren_match.group(1)

    # Explicit minus already present
    text = text.strip()
    if text.startswith("-") or text.startswith("−"):  # ASCII minus or Unicode minus
        neg = True
        text = text.lstrip("-−")

    # Strip percentage sign (keep numeric value)
    text = text.replace("%", "").strip()

    # Remove whitespace inside number tokens  (e.g. "1 234 567")
    text = re.sub(r"(?<=\d)\s+(?=\d)", "", text)

    # Remove thousands separators (commas)
    text = text.replace(",", "")

    # Strip any remaining non-numeric characters except dot and minus
    text = re.sub(r"[^\d.]", "", text)

    if not text:
        return None, "no_digits_after_clean"

    # Handle multiple dots (keep only the last as decimal)
    parts = text.split(".")
    if len(parts) > 2:
        text = "".join(parts[:-1]) + "." + parts[-1]

    if not _FINAL_NUMBER_RE.match(text) and not _FINAL_NUMBER_RE.match("-" + text):
        return None, f"bad_format:{text}"

    try:
        value = float(text)
        if neg:
            value = -abs(value)
        return value, None
    except (ValueError, OverflowError) as exc:
        return None, f"float_error:{exc}"
