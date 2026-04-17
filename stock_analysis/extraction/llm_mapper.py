"""
LLM Mapper — map extracted tables to a normalised financial schema
using Gemini (``google.genai`` Client SDK).

The LLM receives ONLY extracted table data + header context,
NOT the entire PDF.  This keeps prompts small, deterministic,
and fast.
"""

import json
import logging
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

try:
    import json_repair
except ImportError:
    json_repair = None

from stock_analysis.config import (
    FINANCIAL_LINE_ITEM_CODES,
    GEMINI_MODEL,
    MODEL_FALLBACK_ORDER,
    RATE_LIMIT_DELAY,
    MAX_RETRIES,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────

# Concise code list sent to LLM
_CODES_CSV = ", ".join(f'"{c}"' for c in FINANCIAL_LINE_ITEM_CODES)


# ─────────────────────────────────────────────────────────────────────
# Prompt template
# ─────────────────────────────────────────────────────────────────────

_PROMPT_TEMPLATE = """You are a financial-data extraction expert.

INPUT:
- Statement type: {statement_type}
- Tables (JSON arrays of rows): see below.
- Header/context text (may contain currency, unit scale, period info)

TASK:
1. Determine which column is the **latest period** vs prior period.
2. Detect the **unit scale** from headers/context (e.g. "KD '000" → 1000, "millions" → 1000000, "fils" → 0.001). If unclear default to 1.
3. Detect the **currency** (KWD, USD, etc.).
4. Map every financial row to a normalised line item.
5. Handle parentheses as negative: "(1,234)" → -1234.
6. Ignore notes, narrative paragraphs, and non-numeric rows.

OUTPUT: Return ONLY valid JSON (no markdown fences, no comments).
{{
  "statement_type": "{statement_type}",
  "currency": "USD",
  "unit_scale": 1,
  "periods": [
    {{
      "period_end_date": "2023-12-31",
      "fiscal_year": 2023,
      "items": [
        {{
          "line_item_key": "REVENUE",
          "label_raw": "Total Revenue",
          "value": 1234567.0,
          "is_total": false,
          "source_page": 5,
          "source_table_id": 0
        }}
      ]
    }}
  ]
}}

RULES:
- Use these normalised keys where possible: {codes}
- If no match, create an UPPER_SNAKE_CASE key.
- ``value`` must be a plain float (apply unit_scale so values are in base units).
- Set ``is_total`` = true for subtotals/totals (Gross Profit, Total Assets, etc.).
- Max ~30 items per period.
- If a table spans two periods (two year columns), return both periods.
- Return ONLY valid, complete JSON. No truncation.

HEADER CONTEXT:
{header_context}

TABLES:
{tables_json}
"""


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

class LLMMapper:
    """Map extracted table data to normalised financial items via Gemini."""

    def __init__(self, api_key: Optional[str] = None):
        from google import genai
        self._api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not self._api_key:
            raise ValueError("Gemini API key required for LLM mapping")
        self._client = genai.Client(api_key=self._api_key)
        self._model = GEMINI_MODEL

    # ──────────────────────────────────────────────────────────────────
    def map_tables(
        self,
        statement_type: str,
        tables_data: List[Dict[str, Any]],
        header_context: str = "",
        source_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Send extracted tables to Gemini and return normalised JSON.

        ``tables_data`` is a list of dicts each with ``headers`` and
        ``rows`` keys (as produced by ``ExtractedTable``).

        Returns the parsed JSON dict or raises on failure.
        """
        # Build compact table representation for the prompt
        tables_json = json.dumps(tables_data, ensure_ascii=False, indent=1)

        prompt = _PROMPT_TEMPLATE.format(
            statement_type=statement_type.upper(),
            codes=_CODES_CSV,
            header_context=header_context[:2000] if header_context else "(none)",
            tables_json=tables_json[:8000],  # cap to keep prompt manageable
        )

        result = self._call_gemini(prompt)

        # Post-process: ensure values are floats, keys are uppercase
        if isinstance(result, dict):
            result = _normalise_result(result, statement_type, source_pages)

        return result

    # ──────────────────────────────────────────────────────────────────
    def _call_gemini(self, prompt: str) -> Any:
        """Call Gemini with retry + model fallback, return parsed JSON."""
        from google.genai import types

        last_error: Optional[Exception] = None

        for model_name in MODEL_FALLBACK_ORDER:
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    resp = self._client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            temperature=0.05,
                            max_output_tokens=4096,
                        ),
                    )
                    text = resp.text
                    if not text:
                        raise RuntimeError(f"Empty response from {model_name}")

                    return _parse_json(text)

                except json.JSONDecodeError as jexc:
                    last_error = jexc
                    if attempt < MAX_RETRIES:
                        time.sleep(2 ** attempt)
                        continue
                    break

                except Exception as exc:
                    last_error = exc
                    err = str(exc).lower()
                    if "404" in str(exc) or "not found" in err:
                        break  # skip model
                    if "429" in str(exc) or "quota" in err or "rate limit" in err:
                        time.sleep(RATE_LIMIT_DELAY * attempt)
                    else:
                        time.sleep(2 ** attempt)

            time.sleep(2)

        raise RuntimeError(f"LLM mapping failed after all retries: {last_error}")


# ─────────────────────────────────────────────────────────────────────
# JSON parsing helpers
# ─────────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> Any:
    """Multi-stage JSON repair (matches existing extractor pattern)."""
    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text.strip())

    # Stage 1: direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Stage 2: json_repair library
    if json_repair:
        try:
            return json_repair.loads(text)
        except Exception:
            pass

    # Stage 3: manual fixes
    cleaned = text
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)  # trailing commas
    cleaned = cleaned.replace("'", '"')                 # single quotes
    cleaned = re.sub(r':\s*None\b', ": null", cleaned)
    cleaned = re.sub(r':\s*True\b', ": true", cleaned)
    cleaned = re.sub(r':\s*False\b', ": false", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Stage 4: extract first JSON object/array
    for pattern in [
        r"\{[\s\S]*\}",  # outermost { … }
        r"\[[\s\S]*\]",  # outermost [ … ]
    ]:
        m = re.search(pattern, text)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                if json_repair:
                    try:
                        return json_repair.loads(m.group(0))
                    except Exception:
                        pass

    raise json.JSONDecodeError("All JSON repair stages failed", text, 0)


# ─────────────────────────────────────────────────────────────────────
# Normalisation helpers
# ─────────────────────────────────────────────────────────────────────

def _normalise_result(
    data: Dict[str, Any],
    statement_type: str,
    source_pages: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """Clean up and validate the LLM output."""
    data.setdefault("statement_type", statement_type)
    data.setdefault("currency", "USD")
    data.setdefault("unit_scale", 1)
    data.setdefault("periods", [])

    unit_scale = data.get("unit_scale", 1)
    if isinstance(unit_scale, str):
        unit_scale = _parse_unit_scale(unit_scale)
        data["unit_scale"] = unit_scale

    for period in data.get("periods", []):
        for item in period.get("items", []):
            # Ensure value is float
            val = item.get("value", 0)
            if isinstance(val, str):
                val = _parse_number(val)
            item["value"] = float(val) if val is not None else 0.0

            # Normalise key
            key = item.get("line_item_key", "")
            if not key:
                key = (item.get("label_raw", "") or "UNKNOWN").upper().replace(" ", "_")
            item["line_item_key"] = key.upper()

            # Defaults
            item.setdefault("is_total", False)
            item.setdefault("label_raw", key)
            if source_pages:
                item.setdefault("source_page", source_pages[0])

    return data


def _parse_number(s: str) -> float:
    """Parse a string number, handling parentheses as negative."""
    s = s.strip()
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    s = s.replace(",", "").replace(" ", "")
    # Remove currency prefixes
    s = re.sub(r"^[A-Z]{2,3}\s*", "", s)
    try:
        val = float(s)
        return -val if neg else val
    except (ValueError, TypeError):
        return 0.0


def _parse_unit_scale(s: str) -> int:
    """Convert unit scale strings to integers."""
    s = s.lower().strip()
    if "million" in s:
        return 1_000_000
    if "billion" in s:
        return 1_000_000_000
    if "thousand" in s or "'000" in s or "(000" in s:
        return 1_000
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 1
