"""
AI-Vision Financial Statement Extractor
========================================
Extracts Income Statement, Balance Sheet, and Cash Flow data from
scanned-image PDFs using **Gemini Vision** (AI-first, not OCR-first).

Pipeline
--------
1. **Render** — PyMuPDF (fitz) renders each PDF page at 350 DPI → PNG bytes.
2. **Classify** — Gemini vision identifies statement type per page.
3. **Extract** — Gemini vision returns strict JSON with 2-period data.
4. **Normalize** — Raw labels are mapped to canonical keys.
5. **Validate** — Accounting checks flag errors but NEVER discard data.
6. **Persist** — Raw AI output, normalized rows, and validation results
   are stored via ``storage.py``.

Public API
----------
    ai_extract_financials(pdf_path, api_key=None, *, force=False,
                          user_id=1, stock_id=1) → dict
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Repo-root on sys.path ────────────────────────────────────────────
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

from stock_analysis.config import (
    CACHE_DIR,
    FINANCIAL_LINE_ITEM_CODES,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    MAX_RETRIES,
    MODEL_FALLBACK_ORDER,
    RATE_LIMIT_DELAY,
)
from stock_analysis.extraction import storage

# Lazy-import heavy deps
_genai = None
_fitz = None
_json_repair = None


def _get_genai():
    global _genai
    if _genai is None:
        from google import genai
        _genai = genai
    return _genai


def _get_fitz():
    global _fitz
    if _fitz is None:
        import fitz
        _fitz = fitz
    return _fitz


def _get_json_repair():
    global _json_repair
    if _json_repair is None:
        try:
            import json_repair as jr
            _json_repair = jr
        except ImportError:
            _json_repair = False  # sentinel — tried and missing
    return _json_repair if _json_repair is not False else None


# ─────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────

EXTRACTOR_VERSION = "vision-v1.0"
_RENDER_DPI = 350
_CACHE_TTL_SECONDS = 86_400  # 24 h
_VALID_STMT_TYPES = {"balance_sheet", "income_statement", "cash_flow"}

# ─────────────────────────────────────────────────────────────────────
# Canonical key mappings (label_raw → key)
# ─────────────────────────────────────────────────────────────────────

# These are fuzzy-match targets.  The AI is prompted to output
# canonical keys directly, but normalisation fixes any drift.

_BALANCE_SHEET_MAP: Dict[str, str] = {
    "cash and bank balances": "cash_and_bank_balances",
    "cash and cash equivalents": "cash_and_bank_balances",
    "cash & cash equivalents": "cash_and_bank_balances",
    "accounts receivable": "accounts_receivable",
    "trade receivables": "accounts_receivable",
    "inventories": "inventory",
    "inventory": "inventory",
    "total current assets": "total_current_assets",
    "property plant and equipment": "ppe_net",
    "property, plant and equipment": "ppe_net",
    "goodwill": "goodwill",
    "intangible assets": "intangible_assets",
    "total non-current assets": "total_non_current_assets",
    "total assets": "total_assets",
    "accounts payable": "accounts_payable",
    "trade payables": "accounts_payable",
    "total current liabilities": "total_current_liabilities",
    "total non-current liabilities": "total_non_current_liabilities",
    "total liabilities": "total_liabilities",
    "share capital": "share_capital",
    "common stock": "share_capital",
    "retained earnings": "retained_earnings",
    "total equity": "total_equity",
    "shareholders equity": "total_equity",
    "shareholders' equity": "total_equity",
    "total liabilities and equity": "total_liabilities_and_equity",
    "total liabilities and shareholders equity": "total_liabilities_and_equity",
    "total liabilities and shareholders' equity": "total_liabilities_and_equity",
    "short term debt": "short_term_debt",
    "long term debt": "long_term_debt",
    "short-term borrowings": "short_term_debt",
    "long-term borrowings": "long_term_debt",
    "investment properties": "investment_properties",
    "investments in associates": "investments_in_associates",
    "other current assets": "other_current_assets",
    "other non-current assets": "other_non_current_assets",
    "other current liabilities": "other_current_liabilities",
    "other non-current liabilities": "other_non_current_liabilities",
    "treasury stock": "treasury_stock",
    "treasury shares": "treasury_stock",
    "reserves": "reserves",
    "statutory reserve": "statutory_reserve",
    "voluntary reserve": "voluntary_reserve",
    "general reserve": "general_reserve",
    "fair value reserve": "fair_value_reserve",
    "foreign currency translation reserve": "foreign_currency_translation_reserve",
    "non-controlling interests": "non_controlling_interests",
    "minority interest": "non_controlling_interests",
}

_INCOME_STATEMENT_MAP: Dict[str, str] = {
    "revenue": "revenue",
    "total revenue": "revenue",
    "net revenue": "revenue",
    "sales": "revenue",
    "net sales": "revenue",
    "cost of revenue": "cogs",
    "cost of sales": "cogs",
    "cost of goods sold": "cogs",
    "gross profit": "gross_profit",
    "operating expenses": "operating_expenses",
    "selling general and administrative": "sga",
    "selling, general and administrative": "sga",
    "research and development": "r_and_d",
    "operating income": "operating_profit",
    "operating profit": "operating_profit",
    "profit from operations": "operating_profit",
    "interest income": "interest_income",
    "interest expense": "interest_expense",
    "finance costs": "interest_expense",
    "finance income": "interest_income",
    "other income": "other_income",
    "other expenses": "other_expenses",
    "income before tax": "income_before_tax",
    "profit before tax": "income_before_tax",
    "income tax": "income_tax",
    "income tax expense": "income_tax",
    "net income": "net_income",
    "net profit": "net_income",
    "profit for the period": "net_income",
    "profit for the year": "net_income",
    "earnings per share": "eps",
    "eps": "eps",
    "basic eps": "eps_basic",
    "diluted eps": "eps_diluted",
    "basic earnings per share": "eps_basic",
    "diluted earnings per share": "eps_diluted",
    "ebitda": "ebitda",
    "depreciation and amortization": "depreciation_and_amortization",
    "depreciation": "depreciation",
    "amortization": "amortization",
    "share of results of associates": "share_of_associates",
    "dividend income": "dividend_income",
    "impairment losses": "impairment_losses",
}

_CASH_FLOW_MAP: Dict[str, str] = {
    "cash from operating activities": "cfo",
    "net cash from operating activities": "cfo",
    "cash used in operating activities": "cfo",
    "cash from investing activities": "cfi",
    "net cash from investing activities": "cfi",
    "cash used in investing activities": "cfi",
    "cash from financing activities": "cff",
    "net cash from financing activities": "cff",
    "cash used in financing activities": "cff",
    "net change in cash": "net_change_cash",
    "net increase in cash": "net_change_cash",
    "net decrease in cash": "net_change_cash",
    "increase in cash and cash equivalents": "net_change_cash",
    "decrease in cash and cash equivalents": "net_change_cash",
    "cash at beginning of period": "beginning_cash",
    "cash at beginning of year": "beginning_cash",
    "cash and cash equivalents at beginning": "beginning_cash",
    "cash at end of period": "ending_cash",
    "cash at end of year": "ending_cash",
    "cash and cash equivalents at end": "ending_cash",
    "capital expenditures": "capex",
    "purchase of property plant and equipment": "capex",
    "dividends paid": "dividends_paid",
    "debt issued": "debt_issued",
    "debt repaid": "debt_repaid",
    "repayment of borrowings": "debt_repaid",
    "proceeds from borrowings": "debt_issued",
    "depreciation and amortization": "depreciation_and_amortization",
    "net income": "net_income_cf",
    "profit for the year": "net_income_cf",
    "changes in working capital": "changes_working_capital",
}

_KEY_MAPS = {
    "balance_sheet": _BALANCE_SHEET_MAP,
    "income_statement": _INCOME_STATEMENT_MAP,
    "cash_flow": _CASH_FLOW_MAP,
}


# ─────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────

_CLASSIFY_PROMPT = """\
Look at this financial document image carefully.
Determine what type of financial statement it shows.

Common names for each type (English AND Arabic):
- balance_sheet: "Balance Sheet", "Statement of Financial Position",
  "Consolidated Statement of Financial Position",
  Arabic: "بيان المركز المالي", "الميزانية العمومية",
  "قائمة المركز المالي الموحدة"
- income_statement: "Income Statement", "Statement of Profit or Loss",
  "Consolidated Statement of Profit or Loss", "Statement of Income",
  "Statement of Comprehensive Income",
  Arabic: "بيان الربح أو الخسارة", "قائمة الدخل",
  "بيان الدخل الشامل"
- cash_flow: "Cash Flow Statement", "Statement of Cash Flows",
  "Consolidated Statement of Cash Flows", "Cash Flows",
  Arabic: "بيان التدفقات النقدية", "قائمة التدفقات النقدية",
  "التدفقات النقدية الموحدة"

IMPORTANT CLASSIFICATION HINTS:
- If the page mentions "Operating Activities", "Investing Activities",
  or "Financing Activities" (or their Arabic equivalents: "أنشطة تشغيلية",
  "أنشطة استثمارية", "أنشطة تمويلية") → it is cash_flow.
- If the page has rows like "Cash and cash equivalents at beginning/end",
  "Net cash from/used in" → it is cash_flow.
- If the page is a continuation of a financial table (no header but has
  numbered rows with financial data), classify it the same as the
  statement it continues.
- When in doubt between cash_flow and unknown, prefer cash_flow if the
  page contains monetary amounts in a tabular format with activity sections.

Return ONLY one of these exact strings (no quotes, no extra text):
balance_sheet
income_statement
cash_flow
unknown
"""

_EXTRACT_PROMPT_TEMPLATE = """\
You are a financial statement extraction engine.
Return STRICT JSON ONLY — no markdown, no explanation, no commentary.

TASK:
1) The image shows a {stmt_hint} (verify this).
2) Extract ALL line items with both year columns.
3) Detect the currency and unit scale (e.g. KD, KD'000, USD millions).
4) Use parentheses or negative signs as NEGATIVE numbers.
5) A dash or blank cell means null.
6) Do NOT invent lines that aren't visible.

OUTPUT THIS EXACT JSON SCHEMA:
{{
  "statement_type": "{stmt_type}",
  "currency": "KWD",
  "unit_scale": 1,
  "periods": [
    {{"label": "2025-12-31", "col_name": "2025"}},
    {{"label": "2024-12-31", "col_name": "2024"}}
  ],
  "items": [
    {{
      "label_raw": "Cash and bank balances",
      "key": "cash_and_bank_balances",
      "values": {{
        "2025-12-31": 67007011,
        "2024-12-31": 74286447
      }},
      "is_total": false
    }}
  ]
}}

RULES:
- "values" must contain numbers or null — never strings.
- Parentheses (1,234) → -1234.
- Dash or blank → null.
- Detect unit_scale: if header says "KD'000" set unit_scale=1000.
- period labels should be ISO dates if year is visible, otherwise "col_1"/"col_2".
- is_total=true for subtotals and totals.
- Return ONLY the JSON object. No extra text.
"""


# ─────────────────────────────────────────────────────────────────────
# CACHE helpers
# ─────────────────────────────────────────────────────────────────────

def _build_cache_key(pdf_bytes: bytes) -> str:
    """sha256(pdf_bytes) + extractor version."""
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    return f"{digest}_{EXTRACTOR_VERSION}"


def _page_hash(png_bytes: bytes) -> str:
    return hashlib.sha256(png_bytes).hexdigest()[:16]


def _cache_path(cache_key: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"aivision_{cache_key}.json")


def _get_cached(cache_key: str) -> Optional[dict]:
    path = _cache_path(cache_key)
    if not os.path.exists(path):
        return None
    try:
        age = time.time() - os.path.getmtime(path)
        if age > _CACHE_TTL_SECONDS:
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("Cache HIT for %s", cache_key[:16])
        return data
    except Exception as exc:
        logger.warning("Cache read error: %s", exc)
        return None


def _save_cache(cache_key: str, result: dict) -> None:
    path = _cache_path(cache_key)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2, default=str)
        logger.debug("Cached result → %s", path)
    except Exception as exc:
        logger.warning("Cache write error: %s", exc)


# ─────────────────────────────────────────────────────────────────────
# PDF → images
# ─────────────────────────────────────────────────────────────────────

def _render_pages(pdf_path: str, dpi: int = _RENDER_DPI) -> List[bytes]:
    """Render every page to PNG bytes at *dpi*. Returns list of PNG bytes."""
    fitz = _get_fitz()
    doc = fitz.open(pdf_path)
    pages: List[bytes] = []
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    for page in doc:
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pages.append(pix.tobytes("png"))
    doc.close()
    return pages


# ─────────────────────────────────────────────────────────────────────
# Gemini call with retry + fallback (reuses proven pattern)
# ─────────────────────────────────────────────────────────────────────

def _call_gemini(
    client: Any,
    contents: list,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """Send *contents* (text + image parts) to Gemini.

    Retries on rate-limit; falls back through MODEL_FALLBACK_ORDER.
    Returns the raw response text.
    """
    from google.genai import types

    last_error: Optional[Exception] = None

    for model_name in MODEL_FALLBACK_ORDER:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        temperature=temperature,
                        max_output_tokens=max_tokens,
                    ),
                )
                resp_text = response.text
                if resp_text is None:
                    raise RuntimeError(
                        f"Empty response from {model_name} "
                        f"(finish_reason="
                        f"{getattr(response.candidates[0], 'finish_reason', '?')})"
                    )
                return resp_text

            except Exception as exc:
                last_error = exc
                err = str(exc).lower()

                # Model not found → skip
                if any(s in err for s in ("404", "not found", "does not exist")):
                    logger.warning("Model %s unavailable — skipping", model_name)
                    break

                # Rate limit → wait
                if any(s in err for s in ("429", "quota", "rate limit", "resource has been exhausted")):
                    wait = RATE_LIMIT_DELAY * attempt
                    logger.warning("Rate limit on %s, waiting %ds…", model_name, wait)
                    time.sleep(wait)
                else:
                    time.sleep(2 ** attempt)

        time.sleep(2)

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")


# ─────────────────────────────────────────────────────────────────────
# JSON repair (reuses the proven multi-stage pipeline)
# ─────────────────────────────────────────────────────────────────────

def _clean_json_text(text: str) -> str:
    """Strip markdown fences and surrounding whitespace."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _repair_json(raw_text: str) -> Any:
    """Multi-stage JSON repair.  Returns parsed Python object."""
    text = _clean_json_text(raw_text)

    # Stage 1: direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Stage 2: json_repair library
    jr = _get_json_repair()
    if jr is not None:
        try:
            repaired = jr.repair_json(text, return_objects=True)
            if repaired:
                return repaired
        except Exception:
            pass

    # Stage 3: regex fixes
    fixed = text
    fixed = re.sub(r",\s*([}\]])", r"\1", fixed)          # trailing commas
    fixed = re.sub(r'(?m)^(\s*)([a-zA-Z_]\w*)\s*:', r'\1"\2":', fixed)  # unquoted keys

    # Balance braces
    opens = fixed.count("{") - fixed.count("}")
    if opens > 0:
        fixed += "}" * opens
    closeb = fixed.count("[") - fixed.count("]")
    if closeb > 0:
        fixed += "]" * closeb

    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    if jr is not None:
        try:
            repaired = jr.repair_json(fixed, return_objects=True)
            if repaired:
                return repaired
        except Exception:
            pass

    # Stage 4: extract first JSON object/array
    for pattern in (r'\{[\s\S]*\}', r'\[[\s\S]*\]'):
        m = re.search(pattern, text)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                if jr is not None:
                    try:
                        return jr.repair_json(m.group(), return_objects=True)
                    except Exception:
                        pass

    raise json.JSONDecodeError(
        f"All JSON repair stages failed. Preview: {text[:200]}",
        text, 0,
    )


# ─────────────────────────────────────────────────────────────────────
# Page classification
# ─────────────────────────────────────────────────────────────────────

def _classify_page(client: Any, png_bytes: bytes) -> str:
    """Ask Gemini what statement type a page image shows.

    Returns one of: balance_sheet, income_statement, cash_flow, unknown.
    """
    from google.genai import types

    image_part = types.Part.from_bytes(data=png_bytes, mime_type="image/png")
    contents = [image_part, _CLASSIFY_PROMPT]

    try:
        raw = _call_gemini(client, contents, max_tokens=32, temperature=0.0)
        answer = raw.strip().lower().replace(" ", "_")
        # Normalise common variants
        if "balance" in answer:
            return "balance_sheet"
        if "income" in answer or "profit" in answer:
            return "income_statement"
        if "cash" in answer:
            return "cash_flow"
        return "unknown"
    except Exception as exc:
        logger.warning("Page classification failed: %s", exc)
        return "unknown"


def _classify_page_targeted(
    client: Any, png_bytes: bytes, candidates: set
) -> str:
    """Re-classify an unknown page with a narrower prompt.

    *candidates* is the set of statement types still missing
    (e.g. ``{"cash_flow"}``).  The prompt tells Gemini to pick one
    of those or ``unknown``.
    """
    from google.genai import types

    options = "\n".join(sorted(candidates)) + "\nunknown"
    prompt = (
        "This financial document page was not identified on the first try.\n"
        "Look carefully at the content — headings, row labels, section titles.\n\n"
        "It might be one of these statement types:\n"
        f"{options}\n\n"
        "Hints:\n"
        "- If you see 'Operating Activities', 'Investing Activities', "
        "'Financing Activities', 'Net cash', or Arabic equivalents "
        "('أنشطة تشغيلية', 'أنشطة استثمارية', 'أنشطة تمويلية', "
        "'التدفقات النقدية') → it is cash_flow.\n"
        "- If you see 'Total Assets', 'Total Equity', 'Liabilities' → balance_sheet.\n"
        "- If you see 'Revenue', 'Net Income', 'Earnings per share' → income_statement.\n\n"
        "Return ONLY one of these exact strings:\n"
        f"{options}\n"
    )

    image_part = types.Part.from_bytes(data=png_bytes, mime_type="image/png")
    try:
        raw = _call_gemini(client, [image_part, prompt], max_tokens=32, temperature=0.0)
        answer = raw.strip().lower().replace(" ", "_")
        if "balance" in answer:
            return "balance_sheet"
        if "income" in answer or "profit" in answer:
            return "income_statement"
        if "cash" in answer:
            return "cash_flow"
        return "unknown"
    except Exception as exc:
        logger.warning("Targeted re-classification failed: %s", exc)
        return "unknown"


# ─────────────────────────────────────────────────────────────────────
# Page extraction (Vision → JSON)
# ─────────────────────────────────────────────────────────────────────

def _extract_page(
    client: Any,
    png_bytes: bytes,
    stmt_type: str,
) -> Dict[str, Any]:
    """Send page image to Gemini and get structured JSON back.

    Returns the parsed JSON dict (may contain AI quirks that
    _normalize will clean up).
    """
    from google.genai import types

    hint_labels = {
        "balance_sheet": "Balance Sheet / Statement of Financial Position",
        "income_statement": "Income Statement / Statement of Profit or Loss",
        "cash_flow": "Cash Flow Statement",
    }
    prompt = _EXTRACT_PROMPT_TEMPLATE.format(
        stmt_hint=hint_labels.get(stmt_type, stmt_type),
        stmt_type=stmt_type,
    )

    image_part = types.Part.from_bytes(data=png_bytes, mime_type="image/png")
    contents = [image_part, prompt]

    raw_text = _call_gemini(client, contents, max_tokens=8192, temperature=0.1)
    parsed = _repair_json(raw_text)

    # Ensure required keys exist
    if not isinstance(parsed, dict):
        parsed = {"items": [], "raw_parse": parsed}

    parsed.setdefault("statement_type", stmt_type)
    parsed.setdefault("currency", "KWD")
    parsed.setdefault("unit_scale", 1)
    parsed.setdefault("periods", [])
    parsed.setdefault("items", [])

    return parsed


def _extract_multi_page(
    client: Any,
    png_list: List[bytes],
    stmt_type: str,
) -> Dict[str, Any]:
    """Send multiple page images for the SAME statement to Gemini.

    Cash flow (and occasionally balance sheet) can span 2+ pages.
    We attach all pages as image parts so the model sees the full table.
    """
    from google.genai import types

    hint_labels = {
        "balance_sheet": "Balance Sheet / Statement of Financial Position",
        "income_statement": "Income Statement / Statement of Profit or Loss",
        "cash_flow": "Cash Flow Statement",
    }
    prompt = _EXTRACT_PROMPT_TEMPLATE.format(
        stmt_hint=hint_labels.get(stmt_type, stmt_type),
        stmt_type=stmt_type,
    )

    # Build contents: all images first, then the prompt
    contents: list = []
    for png_bytes in png_list:
        contents.append(
            types.Part.from_bytes(data=png_bytes, mime_type="image/png")
        )
    multi_hint = (
        f"\nThese {len(png_list)} images are consecutive pages of the "
        f"SAME {hint_labels.get(stmt_type, stmt_type)}. "
        "Combine all line items into ONE unified JSON. "
        "Do not duplicate rows that appear on both pages."
    )
    contents.append(prompt + multi_hint)

    raw_text = _call_gemini(client, contents, max_tokens=8192, temperature=0.1)
    parsed = _repair_json(raw_text)

    if not isinstance(parsed, dict):
        parsed = {"items": [], "raw_parse": parsed}

    parsed.setdefault("statement_type", stmt_type)
    parsed.setdefault("currency", "KWD")
    parsed.setdefault("unit_scale", 1)
    parsed.setdefault("periods", [])
    parsed.setdefault("items", [])

    return parsed


# ─────────────────────────────────────────────────────────────────────
# Normalization
# ─────────────────────────────────────────────────────────────────────

def _normalize_key(label_raw: str, stmt_type: str) -> str:
    """Map a raw label to a canonical key using fuzzy matching.

    Falls back to snake_case of the raw label.
    """
    key_map = _KEY_MAPS.get(stmt_type, {})
    label_lower = label_raw.strip().lower()

    # Exact match
    if label_lower in key_map:
        return key_map[label_lower]

    # Partial / contains match
    for pattern, canonical in key_map.items():
        if pattern in label_lower or label_lower in pattern:
            return canonical

    # Fallback: snake_case
    slug = re.sub(r"[^a-z0-9]+", "_", label_lower).strip("_")
    return slug or "unknown_item"


def _normalize_statement(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a single AI-extracted statement.

    - Maps label_raw → canonical key.
    - Ensures values are numeric or None.
    - Preserves label_raw for audit trail.
    """
    stmt_type = raw.get("statement_type", "unknown")
    periods = raw.get("periods", [])
    items = raw.get("items", [])

    normalized_items: List[Dict[str, Any]] = []
    for item in items:
        label_raw = item.get("label_raw", item.get("label", ""))
        key = item.get("key", "")

        # If AI already gave a key, keep it; otherwise normalize
        if not key or key == label_raw:
            key = _normalize_key(label_raw, stmt_type)

        values = item.get("values", {})
        clean_values: Dict[str, Any] = {}
        for period_label, val in values.items():
            clean_values[period_label] = _clean_value(val)

        normalized_items.append({
            "label_raw": label_raw,
            "key": key,
            "values": clean_values,
            "is_total": bool(item.get("is_total", False)),
        })

    return {
        "statement_type": stmt_type,
        "currency": raw.get("currency", "KWD"),
        "unit_scale": raw.get("unit_scale", 1),
        "periods": periods,
        "items": normalized_items,
    }


def _clean_value(val: Any) -> Optional[float]:
    """Coerce a value to float or None."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        text = val.strip()
        if not text or text in ("-", "–", "—", "N/A", "n/a", "nil"):
            return None
        # Parenthesised negative
        m = re.match(r"^\((.+)\)$", text)
        if m:
            text = "-" + m.group(1)
        text = re.sub(r"[^\d.\-]", "", text)
        try:
            return float(text)
        except (ValueError, TypeError):
            return None
    return None


# ─────────────────────────────────────────────────────────────────────
# Validation (flag-only — never discard)
# ─────────────────────────────────────────────────────────────────────

@dataclass
class _ValResult:
    statement_type: str
    rule_name: str
    expected: Optional[float] = None
    actual: Optional[float] = None
    diff: Optional[float] = None
    passed: bool = True
    note: str = ""


def _validate_statements(
    statements: Dict[str, Dict[str, Any]],
    tolerance_pct: float = 0.02,
) -> Tuple[List[_ValResult], bool]:
    """Run accounting sanity checks.  Returns (results, needs_review)."""
    results: List[_ValResult] = []
    needs_review = False

    def _get(stmt_key: str, item_key: str, period_label: str) -> Optional[float]:
        stmt = statements.get(stmt_key, {})
        for item in stmt.get("items", []):
            if item.get("key") == item_key:
                return item.get("values", {}).get(period_label)
        return None

    # Collect all period labels from all statements
    all_periods: set = set()
    for stmt in statements.values():
        for p in stmt.get("periods", []):
            all_periods.add(p.get("label", ""))

    for period_label in all_periods:
        # ── Balance Sheet: total_assets ≈ total_liabilities + total_equity
        ta = _get("balance_sheet", "total_assets", period_label)
        tl = _get("balance_sheet", "total_liabilities", period_label)
        te = _get("balance_sheet", "total_equity", period_label)

        if ta is not None and tl is not None and te is not None:
            expected = tl + te
            diff = abs(ta - expected)
            base = max(abs(ta), 1)
            ok = diff / base <= tolerance_pct
            if not ok:
                needs_review = True
            results.append(_ValResult(
                "balance_sheet", "assets_eq_liab_plus_equity",
                expected, ta, diff, ok,
                f"period={period_label} diff={diff:,.0f} ({diff/base:.2%})",
            ))

        # ── Cash Flow: net_change ≈ cfo + cfi + cff
        cfo = _get("cash_flow", "cfo", period_label)
        cfi = _get("cash_flow", "cfi", period_label)
        cff = _get("cash_flow", "cff", period_label)
        net = _get("cash_flow", "net_change_cash", period_label)

        if cfo is not None and cfi is not None and cff is not None and net is not None:
            expected = cfo + cfi + cff
            diff = abs(net - expected)
            base = max(abs(cfo), 1)
            ok = diff / base <= tolerance_pct
            if not ok:
                needs_review = True
            results.append(_ValResult(
                "cash_flow", "net_change_eq_components",
                expected, net, diff, ok,
                f"period={period_label} diff={diff:,.0f}",
            ))

        # ── Cash Flow: ending_cash ≈ beginning_cash + net_change
        beg = _get("cash_flow", "beginning_cash", period_label)
        end = _get("cash_flow", "ending_cash", period_label)
        if beg is not None and net is not None and end is not None:
            expected = beg + net
            diff = abs(end - expected)
            base = max(abs(beg), abs(end), 1)
            ok = diff / base <= tolerance_pct
            if not ok:
                needs_review = True
            results.append(_ValResult(
                "cash_flow", "ending_cash_eq",
                expected, end, diff, ok,
                f"period={period_label} diff={diff:,.0f}",
            ))

        # ── Income Statement: gross_profit ≈ revenue - cogs
        rev = _get("income_statement", "revenue", period_label)
        cogs = _get("income_statement", "cogs", period_label)
        gp = _get("income_statement", "gross_profit", period_label)

        if rev is not None and cogs is not None and gp is not None:
            expected = rev - abs(cogs)  # COGS often stored as positive
            diff = abs(gp - expected)
            base = max(abs(rev), 1)
            ok = diff / base <= tolerance_pct
            if not ok:
                needs_review = True
            results.append(_ValResult(
                "income_statement", "gross_profit_eq",
                expected, gp, diff, ok,
                f"period={period_label} diff={diff:,.0f}",
            ))

    return results, needs_review


# ─────────────────────────────────────────────────────────────────────
# Persistence helpers
# ─────────────────────────────────────────────────────────────────────

def _persist(
    upload_id: int,
    statements: Dict[str, Dict[str, Any]],
    raw_outputs: Dict[str, str],
    validations: List[_ValResult],
    page_hashes: Dict[int, str],
) -> None:
    """Store everything via the storage module."""
    # Raw AI outputs
    for stmt_type, raw_json_str in raw_outputs.items():
        page_num = {"balance_sheet": 0, "income_statement": 1, "cash_flow": 2}.get(stmt_type, -1)
        storage.save_raw_extraction(
            upload_id=upload_id,
            statement_type=stmt_type,
            page_num=page_num,
            method="ai_vision",
            table_id=0,
            table_json=raw_json_str,
            header_context=f"page_hash={page_hashes.get(page_num, 'unknown')}",
            confidence=0.9,
        )

    # Normalized items
    for stmt_type, stmt_data in statements.items():
        currency = stmt_data.get("currency", "KWD")
        unit_scale = stmt_data.get("unit_scale", 1)

        for period_info in stmt_data.get("periods", []):
            period_label = period_info.get("label", "")

            for item in stmt_data.get("items", []):
                value = item.get("values", {}).get(period_label)
                storage.save_normalized_item(
                    upload_id=upload_id,
                    statement_type=stmt_type,
                    period_end_date=period_label,
                    currency=currency,
                    unit_scale=unit_scale,
                    line_item_key=item.get("key", "unknown"),
                    label_raw=item.get("label_raw", ""),
                    value=value if value is not None else 0.0,
                    source_page=None,
                    source_table_id=None,
                )

    # Validation results
    for v in validations:
        storage.save_validation_result(
            upload_id=upload_id,
            statement_type=v.statement_type,
            rule_name=v.rule_name,
            expected=v.expected,
            actual=v.actual,
            diff=v.diff,
            pass_fail="pass" if v.passed else "fail",
            notes=v.note,
        )


# ─────────────────────────────────────────────────────────────────────
# ███ PUBLIC API ███
# ─────────────────────────────────────────────────────────────────────

def ai_extract_financials(
    pdf_path: str,
    api_key: Optional[str] = None,
    *,
    force: bool = False,
    user_id: int = 1,
    stock_id: int = 1,
) -> Dict[str, Any]:
    """AI-vision extraction of financial statements from a PDF.

    Parameters
    ----------
    pdf_path : str
        Path to a (scanned-image) PDF.
    api_key : str, optional
        Gemini API key.  Falls back to env var / config.
    force : bool
        Bypass disk cache.
    user_id, stock_id : int
        For the upload audit trail.

    Returns
    -------
    dict
        ``{"statements": {...}, "validations": [...], "status": ...,
           "timings": {...}, "upload_id": int, ...}``
    """
    t_total = time.time()
    pdf_path = str(Path(pdf_path).resolve())

    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # ── 1. Read PDF bytes & cache key ────────────────────────────
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    cache_key = _build_cache_key(pdf_bytes)

    if not force:
        cached = _get_cached(cache_key)
        if cached is not None:
            # Invalidate cache if any statement type was missed
            cached_stmts = set(cached.get("statements", {}).keys())
            cached_ptypes = cached.get("page_types", {})
            has_unknown = any(v == "unknown" for v in cached_ptypes.values())
            if has_unknown and cached_stmts != _VALID_STMT_TYPES:
                logger.info(
                    "Cache invalidated — had unknown pages and only %s",
                    cached_stmts,
                )
            else:
                cached["_from_cache"] = True
                return cached

    # ── 2. Render pages to PNG ───────────────────────────────────
    t0 = time.time()
    page_images = _render_pages(pdf_path, dpi=_RENDER_DPI)
    timings: Dict[str, float] = {"render": round(time.time() - t0, 2)}
    logger.info("Rendered %d pages at %d DPI (%.2fs)", len(page_images), _RENDER_DPI, timings["render"])

    if not page_images:
        raise RuntimeError("PDF rendered 0 pages")

    page_hashes = {i: _page_hash(img) for i, img in enumerate(page_images)}

    # ── 3. Init Gemini client ────────────────────────────────────
    genai = _get_genai()
    key = api_key or GEMINI_API_KEY
    if not key:
        raise ValueError("Gemini API key is required")
    client = genai.Client(api_key=key)

    # ── 4. Ensure DB tables ──────────────────────────────────────
    storage.ensure_extraction_tables()
    upload_id = storage.create_upload(
        user_id=user_id,
        stock_id=stock_id,
        pdf_path=pdf_path,
        pdf_type="scanned",
    )

    flags: List[str] = []
    raw_outputs: Dict[str, str] = {}
    statements: Dict[str, Dict[str, Any]] = {}

    try:
        # ── 5. Classify each page ────────────────────────────────
        t0 = time.time()
        page_types: Dict[int, str] = {}
        for idx, png in enumerate(page_images):
            ptype = _classify_page(client, png)
            page_types[idx] = ptype
            logger.info("Page %d → %s", idx + 1, ptype)
        timings["classify"] = round(time.time() - t0, 2)

        # Group pages by statement type
        type_to_pages: Dict[str, List[int]] = {}
        unknown_pages: List[int] = []
        for idx, stype in page_types.items():
            if stype in _VALID_STMT_TYPES:
                type_to_pages.setdefault(stype, []).append(idx)
            elif stype == "unknown":
                unknown_pages.append(idx)

        # ── 5b. Fallback: assign unknown pages to missing types ────
        missing_types = _VALID_STMT_TYPES - set(type_to_pages.keys())
        if missing_types and unknown_pages:
            logger.info(
                "Missing %s — re-examining %d unknown page(s)",
                missing_types, len(unknown_pages),
            )

            # DEDUCTIVE: exactly 1 missing type + unknown pages → assign
            if len(missing_types) == 1:
                the_type = next(iter(missing_types))
                for idx in unknown_pages:
                    page_types[idx] = the_type
                    type_to_pages.setdefault(the_type, []).append(idx)
                    logger.info(
                        "Deductively assigned page %d → %s "
                        "(only missing type)",
                        idx + 1, the_type,
                    )
                missing_types.clear()
            else:
                # Multiple missing types → targeted re-classification
                for idx in list(unknown_pages):
                    if not missing_types:
                        break
                    ptype = _classify_page_targeted(
                        client, page_images[idx], missing_types,
                    )
                    if ptype in missing_types:
                        page_types[idx] = ptype
                        type_to_pages.setdefault(ptype, []).append(idx)
                        missing_types.discard(ptype)
                        logger.info(
                            "Re-classified page %d → %s", idx + 1, ptype
                        )

        if not type_to_pages:
            flags.append("no_statements_classified")
            logger.warning("No financial statements classified in %d pages", len(page_images))

        # ── 6. Extract each statement (multi-page aware) ─────────
        for stmt_type, page_idxs in type_to_pages.items():
            t0 = time.time()

            try:
                if len(page_idxs) == 1:
                    # Single-page statement
                    raw_result = _extract_page(
                        client, page_images[page_idxs[0]], stmt_type
                    )
                else:
                    # Multi-page: send ALL pages for this statement
                    raw_result = _extract_multi_page(
                        client,
                        [page_images[i] for i in page_idxs],
                        stmt_type,
                    )
                raw_json_str = json.dumps(raw_result, ensure_ascii=False, default=str)
                raw_outputs[stmt_type] = raw_json_str

                # ── 7. Normalize ─────────────────────────────────
                normalized = _normalize_statement(raw_result)
                statements[stmt_type] = normalized

                logger.info(
                    "Extracted %s from page(s) %s: %d items, %d periods",
                    stmt_type,
                    [p + 1 for p in page_idxs],
                    len(normalized.get("items", [])),
                    len(normalized.get("periods", [])),
                )
            except Exception as exc:
                logger.error(
                    "Extraction failed for %s (page(s) %s): %s",
                    stmt_type, [p + 1 for p in page_idxs], exc,
                )
                flags.append(f"extraction_failed_{stmt_type}")

            timings[f"extract_{stmt_type}"] = round(time.time() - t0, 2)

        # ── 8. Validate ──────────────────────────────────────────
        t0 = time.time()
        validations, needs_review = _validate_statements(statements)
        timings["validate"] = round(time.time() - t0, 2)

        val_dicts = [
            {
                "statement_type": v.statement_type,
                "rule_name": v.rule_name,
                "expected": v.expected,
                "actual": v.actual,
                "diff": v.diff,
                "passed": v.passed,
                "note": v.note,
            }
            for v in validations
        ]

        if needs_review:
            flags.append("validation_needs_review")

        # ── 9. Persist ───────────────────────────────────────────
        t0 = time.time()
        _persist(upload_id, statements, raw_outputs, validations, page_hashes)
        timings["persist"] = round(time.time() - t0, 2)

        # ── 10. Determine status ─────────────────────────────────
        total_items = sum(len(s.get("items", [])) for s in statements.values())
        if total_items == 0:
            status = "failed"
            flags.append("no_items_extracted")
        elif needs_review or flags:
            status = "needs_review"
        else:
            status = "success"

        storage.update_upload_status(upload_id, status)

    except Exception as exc:
        storage.update_upload_status(upload_id, "failed", str(exc))
        raise

    timings["total"] = round(time.time() - t_total, 2)

    result = {
        "upload_id": upload_id,
        "cache_key": cache_key,
        "extractor_version": EXTRACTOR_VERSION,
        "status": status,
        "flags": flags,
        "statements": statements,
        "validations": val_dicts,
        "page_types": page_types,
        "page_hashes": page_hashes,
        "timings": timings,
        "_from_cache": False,
    }

    # Log summary
    logger.info(
        "AI extraction complete: %d statements, %d items, status=%s, %.2fs",
        len(statements),
        sum(len(s.get("items", [])) for s in statements.values()),
        status,
        timings["total"],
    )

    # ── 11. Cache ────────────────────────────────────────────────
    _save_cache(cache_key, result)

    return result
