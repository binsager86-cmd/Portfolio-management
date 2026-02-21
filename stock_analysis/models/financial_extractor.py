"""
Financial PDF Extractor — Gemini AI-powered extraction of structured
financial data from 10-K, 10-Q, and annual report PDFs.
"""

import json
import logging
import os
import hashlib
import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

try:
    import json_repair  # pip install json-repair
except ImportError:
    json_repair = None  # graceful fallback

logger = logging.getLogger(__name__)

from stock_analysis.config import (
    FINANCIAL_LINE_ITEM_CODES,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    VALIDATION_CONFIG,
    MODEL_FALLBACK_ORDER,
    RATE_LIMIT_DELAY,
    MAX_RETRIES,
    CACHE_DIR,
)

# Lazy-import heavy deps so the module loads even without google-genai
_genai = None


def _get_genai():
    global _genai
    if _genai is None:
        from google import genai

        _genai = genai
    return _genai


class FinancialPDFExtractor:
    """Extract financial data from PDF using Gemini AI.

    Features:
    - Automatic retry with exponential backoff on rate-limit (429)
    - Model fallback: if the primary model quota is exhausted, tries
      the next model in MODEL_FALLBACK_ORDER
    - On-disk caching: identical PDFs + statement types return cached
      results instantly (24-hour TTL)
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY
        if not self.api_key or self.api_key == "your_gemini_api_key_here":
            raise ValueError(
                "❌ Gemini API key is missing or invalid!\n"
                "Get a free key at: https://aistudio.google.com/app/apikey\n"
                "Then set GEMINI_API_KEY in your environment or .env file."
            )
        genai = _get_genai()
        self._client = genai.Client(api_key=self.api_key)
        # Verify API connection early so problems surface immediately
        self._verify_api_connection()
        self._model_name = GEMINI_MODEL
        # Ensure cache directory exists
        os.makedirs(CACHE_DIR, exist_ok=True)

    # ── API verification ───────────────────────────────────────────────
    def _verify_api_connection(self) -> List[str]:
        """Check API connectivity and log available models."""
        try:
            models_response = self._client.models.list()
            available = [
                m.name
                for m in models_response
                if "generateContent" in (m.supported_actions or [])
            ]
            flash_ok = any("flash" in m.lower() for m in available)
            logger.info(
                "Gemini API connected — %d content models available%s",
                len(available),
                "" if flash_ok else " (⚠️ no flash model found)",
            )
            if not flash_ok:
                logger.warning(
                    "gemini-2.5-flash not listed — may be region-restricted "
                    "or quota-limited"
                )
            return available
        except Exception as exc:
            logger.warning("Could not list Gemini models: %s", exc)
            return []

    # ── Statement-specific keywords for intelligent page scoring ──────
    _PAGE_KEYWORDS: Dict[str, List[str]] = {
        "income": [
            "revenue", "sales", "net income", "operating income",
            "gross profit", "ebitda", "eps", "earnings per share",
            "cost of revenue", "operating expenses",
            "income statement", "statement of operations",
            "statement of earnings", "profit and loss",
        ],
        "balance": [
            "assets", "liabilities", "equity", "cash", "inventory",
            "property", "plant", "equipment", "goodwill",
            "accounts receivable", "accounts payable",
            "retained earnings", "shareholders equity",
            "total assets", "total liabilities",
            "balance sheet", "statement of financial position",
        ],
        "cashflow": [
            "cash flow", "operating activities",
            "investing activities", "financing activities",
            "capital expenditures", "dividends", "net cash",
            "cash from operations", "free cash flow",
            "cash used in investing",
            "statement of cash flows",
        ],
        "equity": [
            "changes in equity", "statement of changes in equity",
            "shareholders equity", "stockholders equity",
            "share capital", "statutory reserve", "voluntary reserve",
            "retained earnings", "other comprehensive income",
            "non-controlling interest", "treasury shares",
            "consolidated statement of changes in equity",
        ],
    }

    # ── PDF text extraction ────────────────────────────────────────────
    def extract_text_from_pdf(
        self,
        pdf_path: str,
        statement_type: Optional[str] = None,
        max_pages: int = 50,
    ) -> str:
        """Extract text from a PDF.

        When *statement_type* is given (``income``, ``balance``,
        ``cashflow``) the method scores every page by financial-keyword
        density and returns only the top-ranked pages.  This keeps the
        prompt within Gemini's context window even for 200-page annual
        reports.

        When *statement_type* is ``None`` it falls back to plain
        sequential extraction (first *max_pages* pages).
        """
        import pdfplumber

        # ── Fallback: plain extraction (no statement type) ──
        if not statement_type or statement_type not in self._PAGE_KEYWORDS:
            text_content = ""
            try:
                with pdfplumber.open(pdf_path) as pdf:
                    pages_to_process = min(len(pdf.pages), max_pages)
                    for page_num in range(pages_to_process):
                        page = pdf.pages[page_num]
                        text = page.extract_text()
                        if text:
                            text_content += f"\n--- Page {page_num + 1} ---\n{text}"
                return text_content.strip()
            except Exception as e:
                raise RuntimeError(f"PDF extraction error: {e}") from e

        # ── Intelligent page selection ──
        target_keywords = [kw.lower() for kw in self._PAGE_KEYWORDS[statement_type]]
        page_scores: List[Tuple[int, int, str]] = []  # (page_num, score, text)

        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = min(len(pdf.pages), max_pages)

                # Stage 1 — score each page by keyword density
                for page_num in range(total_pages):
                    text = pdf.pages[page_num].extract_text() or ""
                    if not text.strip():
                        continue
                    text_lower = text.lower()
                    hits = sum(text_lower.count(kw) for kw in target_keywords)
                    score = min(100, hits * 10)
                    if score > 5:
                        page_scores.append((page_num, score, text))

                # Stage 2 — select top relevant pages
                if not page_scores:
                    # Fallback: first 4 pages if nothing matched
                    logger.warning(
                        "No financial keywords found for '%s'; "
                        "falling back to first 4 pages", statement_type
                    )
                    for pn in range(min(len(pdf.pages), 4)):
                        text = pdf.pages[pn].extract_text() or ""
                        page_scores.append((pn, 0, text))
                else:
                    page_scores.sort(key=lambda x: x[1], reverse=True)
                    page_scores = page_scores[:4]  # top 4 pages

                # Stage 3 — build focused text with page markers
                parts: list[str] = []
                parts.append("=== FINANCIAL STATEMENT EXTRACTION CONTEXT ===")
                parts.append(f"Requested Statement Type: {statement_type.upper()}")
                parts.append(f"Relevant Pages Identified: {len(page_scores)}")
                parts.append("")

                for page_num, score, text in page_scores:
                    parts.append(
                        f"--- PAGE {page_num + 1} (Relevance: {score}%) ---"
                    )
                    # 1500 chars per page keeps total under 6000
                    parts.append(text[:1500])
                    parts.append("")

                extracted_text = "\n".join(parts)
                # Overall cap for Gemini
                return extracted_text.strip()[:6000]

        except Exception as e:
            raise RuntimeError(
                f"PDF intelligent page selection failed: {e}"
            ) from e

    # ── PDF validation ─────────────────────────────────────────────────
    def validate_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """Check if PDF is readable and contains extractable text.

        Returns::

            {'is_valid': bool, 'reason': str, 'has_text': bool,
             'suggestion': str (only on failure)}
        """
        import pdfplumber

        try:
            with pdfplumber.open(pdf_path) as pdf:
                has_text = False
                for page in pdf.pages[:3]:  # Check first 3 pages
                    text = page.extract_text()
                    if text and text.strip():
                        has_text = True
                        break

                if not has_text:
                    # Detect scanned PDFs by checking for images
                    try:
                        image_count = 0
                        for page in pdf.pages[:3]:
                            if page.images:
                                image_count += len(page.images)

                        if image_count > 0:
                            return {
                                "is_valid": False,
                                "reason": "scanned",
                                "has_text": False,
                                "suggestion": (
                                    "This appears to be a scanned document. "
                                    "Attempting OCR extraction…"
                                ),
                            }
                    except Exception:
                        pass

                    return {
                        "is_valid": False,
                        "reason": "empty",
                        "has_text": False,
                        "suggestion": "The PDF appears to have no extractable text.",
                    }

                return {"is_valid": True, "reason": "valid", "has_text": True}

        except Exception as e:
            return {
                "is_valid": False,
                "reason": "error",
                "has_text": False,
                "error": str(e),
                "suggestion": f"PDF error: {e}",
            }

    # ── OCR fallback for scanned documents ─────────────────────────────
    @staticmethod
    def _find_tesseract() -> Optional[str]:
        """Auto-detect Tesseract binary on the current platform."""
        import shutil

        found = shutil.which("tesseract")
        if found:
            return found

        # Common Windows install paths
        if os.name == "nt":
            for candidate in (
                r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                os.path.join(
                    os.environ.get("LOCALAPPDATA", ""),
                    "Tesseract-OCR", "tesseract.exe",
                ),
                os.path.join(
                    os.environ.get("LOCALAPPDATA", ""),
                    "Programs", "Tesseract-OCR", "tesseract.exe",
                ),
            ):
                if os.path.isfile(candidate):
                    return candidate
        return None

    def extract_text_with_ocr(
        self, pdf_path: str, max_pages: int = 10
    ) -> str:
        """Extract text from a scanned PDF via OCR.

        Requires the **Tesseract OCR** engine (system binary),
        plus the Python packages *pytesseract* and *Pillow*.

        Returns extracted text, or an empty string if OCR produces
        no usable output.  Raises *RuntimeError* if dependencies
        are missing so the caller can surface an accurate message.
        """
        # ── check Python packages ──
        try:
            from PIL import Image  # noqa: F811
            import pytesseract
            import pdfplumber
        except ImportError as exc:
            raise RuntimeError(
                "OCR Python packages missing — run: "
                "pip install pytesseract Pillow"
            ) from exc

        # ── check Tesseract binary ──
        tess_path = self._find_tesseract()
        if tess_path:
            pytesseract.pytesseract.tesseract_cmd = tess_path
            logger.info(f"Tesseract found at: {tess_path}")
        else:
            # Verify the default command works
            try:
                pytesseract.get_tesseract_version()
            except Exception:
                raise RuntimeError(
                    "Tesseract OCR engine is not installed. "
                    "On Windows run:  winget install UB-Mannheim.TesseractOCR\n"
                    "On macOS run:    brew install tesseract\n"
                    "On Linux run:    sudo apt install tesseract-ocr"
                )

        # ── perform OCR ──
        text_content = ""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages[:max_pages]):
                    img = page.to_image(resolution=300)
                    text = pytesseract.image_to_string(
                        img.original, config="--psm 6"
                    )
                    if text.strip():
                        text_content += (
                            f"\n--- Page {page_num + 1} ---\n{text}"
                        )
            return text_content.strip()
        except Exception as e:
            logger.error(f"OCR extraction error: {e}")
            return ""

    # ── Gemini extraction ──────────────────────────────────────────────
    def extract_financial_data(
        self, pdf_text: str, statement_type: str
    ) -> Dict[str, Any]:
        """Send PDF text to Gemini and return structured financial data.

        Results are cached on disk for 24 hours.
        """
        t0 = time.time()

        # ── cache check ──
        text_hash = self._hash_text(pdf_text)
        ckey = self._cache_key(text_hash, statement_type)
        cached = self.get_cached(ckey)
        if cached is not None:
            cached["_meta"] = {
                "cache_hit": True,
                "elapsed_sec": round(time.time() - t0, 2),
                "model_used": "cache",
                "text_chars_sent": 0,
            }
            return cached


        codes_list = ", ".join(
            f'"{code}"' for code in FINANCIAL_LINE_ITEM_CODES
        )

        # Limit text sent to Gemini for speed
        text_limit = 5000
        trimmed_text = pdf_text[:text_limit]

        prompt = f"""You are a financial statement extraction expert. Follow this EXACT workflow:

STEP 1: IDENTIFY THE STATEMENT TYPE
- Scan the provided text for these KEY MARKERS:
  * INCOME STATEMENT: Contains "Revenue", "Net Income", "Operating Income", "EPS"
  * BALANCE SHEET: Contains "Total Assets", "Total Liabilities", "Shareholders Equity"
  * CASH FLOW: Contains "Cash from Operating Activities", "Capital Expenditures"
- CONFIRM the statement matches the requested type: {statement_type.upper()}

STEP 2: EXTRACT ONLY FINANCIAL LINE ITEMS
- IGNORE: Headers, footers, page numbers, disclaimers, management discussion
- FOCUS ON: Tables with numeric values and clear line item labels
- EXTRACT: Only items with actual monetary values (ignore percentages/ratios alone)

STEP 3: OUTPUT VALID JSON (STRICT FORMAT)
{{
  "statement_type": "{statement_type}",
  "fiscal_year": 2023,
  "fiscal_quarter": null,
  "period_end_date": "2023-12-31",
  "currency": "USD",
  "line_items": [
    {{"code": "REVENUE", "name": "Total Revenue", "amount": 1000000, "order": 1, "is_total": false, "parent": null}}
  ],
  "confidence_score": 0.95,
  "pages_used": [5, 6]
}}

CRITICAL RULES:
1. If statement type does NOT match requested type, output MINIMAL structure with confidence 0.1
2. ALL strings MUST use double quotes; EVERY opening quote MUST have a closing quote
3. No trailing commas before ]] or }}}}
4. Amounts as plain numbers (no commas/currency symbols; thousands/millions to full numbers)
5. If uncertain about ANY value, set amount to 0 and confidence to 0.3
6. Return ONLY JSON — no explanations, no markdown fences
7. Use null (not None or N/A) for missing values
8. Do NOT truncate — complete all braces and brackets
9. Use these codes where possible: {codes_list}
10. If no code match, use UPPER_SNAKE_CASE. Limit ~25 line items.

TEXT TO ANALYZE:
{trimmed_text}
"""

        result = self._call_gemini(prompt, max_tokens=2048)
        # normalise line items — Gemini may use 'value' instead of
        # 'amount', or omit keys entirely.
        for item in result.get("line_items", []):
            if "amount" not in item and "value" in item:
                item["amount"] = item.pop("value")
            if "amount" not in item:
                item["amount"] = 0.0
            if isinstance(item["amount"], str):
                item["amount"] = self._parse_amount(item["amount"])
            if "code" not in item:
                item["code"] = item.get("name", "UNKNOWN").upper().replace(" ", "_")

        result["_meta"] = {
            "cache_hit": False,
            "elapsed_sec": round(time.time() - t0, 2),
            "model_used": self._model_name,
            "text_chars_sent": len(trimmed_text),
        }
        self.save_cache(ckey, result)
        return result

    # ── Smart full-report extraction ───────────────────────────────────
    def extract_all_statements(
        self, pdf_text: str
    ) -> List[Dict[str, Any]]:
        """Auto-detect and extract all financial statements from a full
        annual report in a single Gemini call.

        Results are cached on disk for 24 hours.
        """
        t0 = time.time()

        # ── cache check ──
        text_hash = self._hash_text(pdf_text)
        ckey = self._cache_key(text_hash, "_all_statements")
        cached = self.get_cached(ckey)
        if cached is not None:
            # Inject cache-hit meta into each statement
            if isinstance(cached, list):
                for stmt in cached:
                    if isinstance(stmt, dict):
                        stmt["_meta"] = {
                            "cache_hit": True,
                            "elapsed_sec": round(time.time() - t0, 2),
                            "model_used": "cache",
                            "text_chars_sent": 0,
                        }
            return cached


        codes_list = ", ".join(
            f'"{code}"' for code in FINANCIAL_LINE_ITEM_CODES
        )

        # Limit text sent to Gemini for speed
        text_limit = 10000
        trimmed_text = pdf_text[:text_limit]

        prompt = f"""Extract all financial statements from this annual report.
Return ONLY a valid JSON array (no markdown fences, no comments, no trailing text).

CRITICAL JSON RULES:
- Every string value MUST be properly closed with a double-quote.
- No trailing commas before }} or ]].
- All keys must be double-quoted strings.
- Use null (not None or N/A) for missing values.
- Numbers must be plain digits (no commas, no currency symbols).
- Do NOT truncate the response — complete all braces and brackets.

Detect which of these are present and extract each:
- Income Statement → statement_type = "income"
- Balance Sheet → statement_type = "balance"
- Cash Flow Statement → statement_type = "cashflow"

Format per statement:
{{
  "statement_type": "income",
  "fiscal_year": 2023,
  "fiscal_quarter": null,
  "period_end_date": "2023-12-31",
  "currency": "USD",
  "line_items": [
    {{"code": "REVENUE", "name": "Total Revenue", "amount": 1000000, "order": 1, "is_total": false, "parent": null}}
  ],
  "confidence_score": 0.95
}}

Rules:
1. Use these codes: {codes_list}
2. If no match, use UPPER_SNAKE_CASE.
3. Include key line items with breakdowns (~25 per statement).
4. Set is_total=true for subtotals/totals; use parent for hierarchy.
5. Convert amounts to numbers (no commas/symbols; thousands/millions → full numbers).
6. Detect fiscal_year, period_end_date, currency from text.
7. Omit statements not found. Return ONLY valid, complete JSON array.

Text:
{trimmed_text}
"""

        result = self._call_gemini(prompt, max_tokens=4096)

        # Gemini may return a single object instead of an array
        if isinstance(result, dict):
            result = [result]

        # Normalise each statement
        cleaned: List[Dict[str, Any]] = []
        elapsed = round(time.time() - t0, 2)
        for stmt in result:
            if not isinstance(stmt, dict):
                continue
            if "statement_type" not in stmt or "line_items" not in stmt:
                continue
            # Normalise line items — Gemini may use 'value' instead
            # of 'amount', or omit keys entirely.
            for item in stmt.get("line_items", []):
                if "amount" not in item and "value" in item:
                    item["amount"] = item.pop("value")
                if "amount" not in item:
                    item["amount"] = 0.0
                if isinstance(item["amount"], str):
                    item["amount"] = self._parse_amount(item["amount"])
                if "code" not in item:
                    item["code"] = item.get("name", "UNKNOWN").upper().replace(" ", "_")
            stmt["_meta"] = {
                "cache_hit": False,
                "elapsed_sec": elapsed,
                "model_used": self._model_name,
                "text_chars_sent": len(trimmed_text),
            }
            cleaned.append(stmt)

        self.save_cache(ckey, cleaned)
        return cleaned

    # ── shared Gemini call ─────────────────────────────────────────────
    def _call_gemini(
        self,
        prompt: str,
        max_tokens: int = 4096,
    ) -> Any:
        """Send a prompt to Gemini with retry, exponential back-off,
        and automatic model fallback on 429 rate-limit errors.

        Uses the new ``google.genai`` Client API.
        """
        from google.genai import types

        last_error: Optional[Exception] = None

        for model_name in MODEL_FALLBACK_ORDER:
            model_skipped = False
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    response = self._client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            temperature=0.1,
                            max_output_tokens=max_tokens,
                        ),
                    )
                    resp_text = response.text
                    if resp_text is None:
                        # Thinking models may consume all tokens for
                        # reasoning, leaving no output text.
                        raise RuntimeError(
                            f"Empty response from {model_name} "
                            f"(finish_reason="
                            f"{getattr(response.candidates[0], 'finish_reason', '?')}). "
                            f"Try increasing max_tokens."
                        )

                    # ── JSON parsing with multi-stage repair ──
                    try:
                        parsed = self._repair_json(resp_text)
                    except json.JSONDecodeError as jexc:
                        # Log the raw response for debugging
                        self._debug_log_response(resp_text, model_name)
                        logger.warning(
                            "JSON repair failed on %s (attempt %d): %s",
                            model_name, attempt, jexc,
                        )
                        # On first attempt: retry with the same model
                        # (Gemini may produce valid JSON on a second try)
                        if attempt < MAX_RETRIES:
                            print(
                                f"⚠️ Malformed JSON from {model_name} "
                                f"(attempt {attempt}/{MAX_RETRIES}). "
                                f"Retrying…"
                            )
                            time.sleep(2 ** attempt)
                            continue
                        # All retries exhausted for this model —
                        # fall through to next model in fallback order
                        last_error = jexc
                        break

                    self._model_name = model_name  # track which model worked
                    return parsed

                except Exception as exc:
                    last_error = exc
                    err = str(exc).lower()

                    # ── Model not found → skip immediately ──
                    is_not_found = (
                        "404" in str(exc)
                        or "not found" in err
                        or "does not exist" in err
                        or "is not available" in err
                    )
                    if is_not_found:
                        logger.warning(
                            "Model %s unavailable (404) — "
                            "skipping to next fallback",
                            model_name,
                        )
                        model_skipped = True
                        break  # skip remaining retries for this model

                    # ── Rate-limit → wait & retry ──
                    is_rate_limit = (
                        "429" in str(exc)
                        or "quota" in err
                        or "rate limit" in err
                        or "resource has been exhausted" in err
                    )
                    if is_rate_limit:
                        wait = RATE_LIMIT_DELAY * attempt
                        print(
                            f"\u23f3 Rate limit on {model_name} "
                            f"(attempt {attempt}/{MAX_RETRIES}). "
                            f"Waiting {wait}s…"
                        )
                        time.sleep(wait)
                    else:
                        # Non-rate-limit error — exponential backoff
                        logger.warning(
                            "Error on %s attempt %d: %s",
                            model_name, attempt, exc,
                        )
                        time.sleep(2 ** attempt)

            # Exhausted retries (or model skipped) — try next
            if not model_skipped:
                print(f"\u23ed\ufe0f Switching from {model_name} to next fallback…")
            time.sleep(2)

        # All models exhausted
        raise RuntimeError(
            f"All Gemini models failed after retries. "
            f"Last error: {last_error}\n\n"
            f"💡 TROUBLESHOOTING:\n"
            f"1. Verify API key: https://aistudio.google.com/app/apikey\n"
            f"2. Free tier: only gemini-2.5-flash is available\n"
            f"3. Wait 1-2 min if you hit rate limits\n"
            f"4. Run: pip install --upgrade google-genai"
        )

    # ── caching helpers ────────────────────────────────────────────────
    @staticmethod
    def _cache_key(content_hash: str, label: str) -> str:
        return f"{content_hash}_{label}"

    @staticmethod
    def _hash_text(text: str) -> str:
        return hashlib.md5(text.encode("utf-8", errors="replace")).hexdigest()

    @staticmethod
    def get_cached(cache_key: str) -> Optional[Any]:
        """Return cached JSON if < 24 h old, else None."""
        path = os.path.join(CACHE_DIR, f"{cache_key}.json")
        if not os.path.exists(path):
            return None
        age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(path))
        if age > timedelta(hours=24):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    @staticmethod
    def save_cache(cache_key: str, data: Any) -> None:
        """Persist extraction result to disk."""
        try:
            path = os.path.join(CACHE_DIR, f"{cache_key}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
        except Exception:
            pass

    # ── validation ─────────────────────────────────────────────────────
    def validate_extraction(
        self, extracted_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate extracted data and return warnings / errors."""
        validation: Dict[str, Any] = {
            "is_valid": True,
            "warnings": [],
            "errors": [],
            "confidence": extracted_data.get("confidence_score", 0.8),
        }

        # Required fields
        for field in (
            "statement_type", "fiscal_year", "period_end_date", "line_items"
        ):
            if field not in extracted_data:
                validation["is_valid"] = False
                validation["errors"].append(f"Missing required field: {field}")

        # Line-item checks
        items = extracted_data.get("line_items", [])
        if not items:
            validation["errors"].append("No line items extracted")

        for idx, item in enumerate(items):
            if "code" not in item:
                validation["warnings"].append(
                    f"Line item {idx} missing code"
                )
            if "amount" not in item:
                validation["warnings"].append(
                    f"Line item {idx} missing amount"
                )
            elif not isinstance(item["amount"], (int, float)):
                try:
                    item["amount"] = float(item["amount"])
                except (ValueError, TypeError):
                    validation["warnings"].append(
                        f"Line item {idx}: amount is not numeric"
                    )
            if (
                "code" in item
                and item["code"] not in FINANCIAL_LINE_ITEM_CODES
            ):
                validation["warnings"].append(
                    f"Non-standard code '{item['code']}' "
                    f"for '{item.get('name', '')}'"
                )

        # Statement-specific checks
        stype = extracted_data.get("statement_type")
        if stype == "balance":
            extra = self._validate_balance_sheet(extracted_data)
            validation["warnings"].extend(extra.get("warnings", []))
            validation["errors"].extend(extra.get("errors", []))
        elif stype == "income":
            extra = self._validate_income_statement(extracted_data)
            validation["warnings"].extend(extra.get("warnings", []))
            validation["errors"].extend(extra.get("errors", []))

        # Key-item verification per statement type
        item_codes = [
            item.get("code") for item in items if item.get("code")
        ]
        if stype == "income":
            _required = ["REVENUE", "NET_INCOME"]
            _found = [c for c in _required if c in item_codes]
            if len(_found) < 2:
                validation["warnings"].append(
                    f"Income statement missing key items. "
                    f"Found: {', '.join(_found) or 'none'}. "
                    f"Expected: Revenue, Net Income"
                )
        elif stype == "balance":
            _required = ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"]
            _found = [c for c in _required if c in item_codes]
            if len(_found) < 2:
                validation["warnings"].append(
                    f"Balance sheet missing key items. "
                    f"Found: {', '.join(_found) or 'none'}. "
                    f"Expected: Assets, Liabilities, Equity"
                )
        elif stype == "cashflow":
            _required = ["CASH_FROM_OPERATIONS", "NET_CHANGE_CASH"]
            _found = [c for c in _required if c in item_codes]
            if len(_found) < 1:
                validation["warnings"].append(
                    f"Cash flow statement missing key items. "
                    f"Found: {', '.join(_found) or 'none'}. "
                    f"Expected: Cash from Operations"
                )

        # Confidence threshold
        conf = extracted_data.get("confidence_score", 0.8)
        if conf < VALIDATION_CONFIG["min_confidence_threshold"]:
            validation["warnings"].append(
                f"Low confidence score: {conf:.2%}"
            )

        return validation

    # ── private helpers ────────────────────────────────────────────────
    @staticmethod
    def _clean_json_response(text: str) -> str:
        """Strip markdown fences and do basic whitespace cleanup."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    # ── Multi-stage JSON repair pipeline ──────────────────────────────

    @staticmethod
    def _fix_unclosed_strings(text: str) -> str:
        """Find unterminated strings and close them."""
        lines = text.split("\n")
        fixed: list[str] = []
        for line in lines:
            # Count unescaped double-quotes
            quotes = 0
            i = 0
            while i < len(line):
                if line[i] == '"' and (i == 0 or line[i - 1] != "\\"):
                    quotes += 1
                i += 1
            # Odd number of quotes → unterminated string
            if quotes % 2 != 0:
                stripped = line.rstrip()
                # Append closing quote before trailing comma / colon / brace
                if stripped.endswith(","):
                    line = stripped[:-1] + '",'
                elif stripped.endswith(":"):
                    line = stripped + '"'
                else:
                    line = stripped + '"'
            fixed.append(line)
        return "\n".join(fixed)

    @staticmethod
    def _fix_trailing_commas(text: str) -> str:
        """Remove trailing commas before } or ]."""
        text = re.sub(r",\s*([}\]])", r"\1", text)
        return text

    @staticmethod
    def _fix_unquoted_keys(text: str) -> str:
        """Add quotes around unquoted JSON keys."""
        text = re.sub(
            r'(?m)^(\s*)([a-zA-Z_]\w*)\s*:',
            r'\1"\2":',
            text,
        )
        return text

    @staticmethod
    def _escape_special_chars(text: str) -> str:
        """Escape literal newlines and tabs inside JSON strings."""
        result: list[str] = []
        in_string = False
        i = 0
        while i < len(text):
            ch = text[i]
            if ch == '"' and (i == 0 or text[i - 1] != "\\"):
                in_string = not in_string
            if in_string:
                if ch == "\n":
                    result.append("\\n")
                    i += 1
                    continue
                if ch == "\t":
                    result.append("\\t")
                    i += 1
                    continue
            result.append(ch)
            i += 1
        return "".join(result)

    @staticmethod
    def _balance_braces(text: str) -> str:
        """Append missing closing braces / brackets."""
        opens = text.count("{") - text.count("}")
        closeb = text.count("[") - text.count("]")
        if opens > 0:
            text += "}" * opens
        if closeb > 0:
            text += "]" * closeb
        return text

    @classmethod
    def _repair_json(cls, raw_text: str) -> Any:
        """Multi-stage JSON repair pipeline.

        1. Strip markdown fences (basic clean)
        2. Try json.loads directly
        3. Try json_repair library
        4. Apply custom fixers → json.loads
        5. Apply custom fixers → json_repair
        6. Raise on total failure
        """
        # Stage 1: basic cleanup
        text = cls._clean_json_response(raw_text)

        # Stage 2: direct parse (fast path)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Stage 3: json_repair library (handles most issues)
        if json_repair is not None:
            try:
                repaired = json_repair.repair_json(text, return_objects=True)
                if repaired:
                    logger.info("JSON repaired via json_repair library")
                    return repaired
            except Exception:
                pass

        # Stage 4: custom fixers → json.loads
        fixed = text
        for fixer in (
            cls._fix_unclosed_strings,
            cls._fix_trailing_commas,
            cls._fix_unquoted_keys,
            cls._escape_special_chars,
            cls._balance_braces,
        ):
            fixed = fixer(fixed)

        try:
            result = json.loads(fixed)
            logger.info("JSON repaired via custom fixers")
            return result
        except json.JSONDecodeError:
            pass

        # Stage 5: custom fixers → json_repair
        if json_repair is not None:
            try:
                repaired = json_repair.repair_json(fixed, return_objects=True)
                if repaired:
                    logger.info(
                        "JSON repaired via custom fixers + json_repair"
                    )
                    return repaired
            except Exception:
                pass

        # Stage 6: aggressive — try to extract first JSON object / array
        obj_match = re.search(r'\{[\s\S]*\}', text)
        arr_match = re.search(r'\[[\s\S]*\]', text)
        for candidate in (arr_match, obj_match):
            if candidate:
                try:
                    return json.loads(candidate.group())
                except json.JSONDecodeError:
                    if json_repair is not None:
                        try:
                            repaired = json_repair.repair_json(
                                candidate.group(), return_objects=True
                            )
                            if repaired:
                                logger.info(
                                    "JSON repaired via regex extraction + json_repair"
                                )
                                return repaired
                        except Exception:
                            pass

        # Total failure — raise with debug info
        preview = text[:300] + ("…" if len(text) > 300 else "")
        raise json.JSONDecodeError(
            f"All JSON repair stages failed. Preview: {preview}",
            text,
            0,
        )

    @staticmethod
    def _debug_log_response(raw_text: str, model_name: str) -> None:
        """Save raw Gemini response to debug_logs/ for post-mortem analysis."""
        try:
            log_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "debug_logs",
            )
            os.makedirs(log_dir, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = os.path.join(log_dir, f"gemini_raw_{ts}.txt")
            with open(path, "w", encoding="utf-8") as f:
                f.write(f"Model: {model_name}\n")
                f.write(f"Timestamp: {ts}\n")
                f.write("=" * 60 + "\n")
                f.write(raw_text)
            logger.debug("Raw Gemini response saved to %s", path)
        except Exception:
            pass  # never let debug logging crash extraction

    @staticmethod
    def _parse_amount(amount_str: str) -> float:
        try:
            cleaned = re.sub(r"[^\d.\-]", "", amount_str)
            return float(cleaned)
        except (ValueError, TypeError):
            return 0.0

    def _get_line_item_amount(
        self, data: Dict[str, Any], code: str
    ) -> Optional[float]:
        for item in data.get("line_items", []):
            if item.get("code") == code:
                return item.get("amount")
        return None

    def _validate_balance_sheet(
        self, data: Dict[str, Any]
    ) -> Dict[str, list]:
        result: Dict[str, list] = {"warnings": [], "errors": []}
        total_assets = self._get_line_item_amount(data, "TOTAL_ASSETS")
        total_le = self._get_line_item_amount(data, "TOTAL_LIABILITIES_EQUITY")
        if total_assets is not None and total_le is not None:
            diff = abs(total_assets - total_le)
            tol = max(total_assets, total_le) * VALIDATION_CONFIG[
                "balance_sheet_tolerance"
            ]
            if diff > tol:
                pct = (diff / max(total_assets, total_le)) * 100
                result["warnings"].append(
                    f"Balance sheet imbalance: Assets={total_assets:,.0f}, "
                    f"L+E={total_le:,.0f}, Diff={diff:,.0f} ({pct:.2f}%)"
                )
        return result

    def _validate_income_statement(
        self, data: Dict[str, Any]
    ) -> Dict[str, list]:
        result: Dict[str, list] = {"warnings": [], "errors": []}
        revenue = self._get_line_item_amount(data, "REVENUE")
        net_income = self._get_line_item_amount(data, "NET_INCOME")
        if revenue is not None and net_income is not None:
            if net_income > revenue:
                result["warnings"].append(
                    f"Net income ({net_income:,.0f}) > revenue "
                    f"({revenue:,.0f}) — possible error"
                )
            margin = (net_income / revenue) * 100 if revenue else 0
            if abs(margin) > 50:
                result["warnings"].append(
                    f"Unusual net margin: {margin:.2f}% — verify data"
                )
        return result

    # ── Debug helper: list available Gemini models ─────────────────────
    @staticmethod
    def list_available_models(
        api_key: Optional[str] = None,
    ) -> List[str]:
        """List Gemini models that support generateContent.

        Useful for debugging when model names change or quotas differ.
        Prints SDK version, available models, and flash-model status.
        """
        print("\n" + "=" * 60)
        print("🔍 DEBUG: Checking Available Gemini Models")
        print("=" * 60)

        # SDK version
        try:
            import importlib.metadata as _meta

            sdk_ver = _meta.version("google-genai")
            print(f"📦 google-genai version: {sdk_ver}")
        except Exception:
            sdk_ver = "unknown"
            print("📦 google-genai version: unknown")

        genai = _get_genai()
        client = genai.Client(api_key=api_key or GEMINI_API_KEY)
        try:
            models_response = client.models.list()
            available = [
                m.name
                for m in models_response
                if "generateContent" in (m.supported_actions or [])
            ]
            print(f"\n✅ {len(available)} models support generateContent:\n")
            for name in available:
                print(f"  • {name}")

            flash = [n for n in available if "flash" in n.lower()]
            if flash:
                print(f"\n✅ FLASH MODELS: {', '.join(flash)}")
                print("   → Use 'models/gemini-2.5-flash' for free tier")
            else:
                print("\n⚠️  No flash models found!")
                print("   Possible causes: invalid key, region restriction, quota")

            print("=" * 60 + "\n")
            return available
        except Exception as exc:
            print(f"\n❌ Error listing models: {exc}")
            print("\n💡 TROUBLESHOOTING:")
            print("1. Verify API key: https://aistudio.google.com/app/apikey")
            print("2. Upgrade: pip install --upgrade google-genai")
            print("3. Check network / firewall")
            print("=" * 60 + "\n")
            return []
