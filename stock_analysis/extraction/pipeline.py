"""
Extraction Pipeline — orchestrates the full tiered flow.

    classify → locate pages → extract tables → LLM map → validate → store

Returns a UI-ready JSON result with all statements, validations,
and status flags.
"""

import json
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

from stock_analysis.extraction.pdf_classifier import (
    classify_pdf,
    find_statement_pages,
    extract_page_text,
    ClassificationResult,
    StatementPages,
)
from stock_analysis.extraction.table_extractor import (
    extract_tables,
    extract_tables_ocr,
    ExtractedTable,
)
from stock_analysis.extraction.llm_mapper import LLMMapper
from stock_analysis.extraction.validators import validate_all, ValidationResult
from stock_analysis.extraction import storage

logger = logging.getLogger(__name__)

# Map internal statement keys to output keys
_STMT_OUTPUT_KEY = {
    "income": "income_statement",
    "balance": "balance_sheet",
    "cashflow": "cash_flow",
    "equity": "equity_statement",
}
_STMT_LABEL = {
    "income": "Income Statement",
    "balance": "Balance Sheet",
    "cashflow": "Cash Flow Statement",
    "equity": "Statement of Changes in Equity",
}


class ExtractionPipeline:
    """Orchestrate PDF → structured financials extraction.

    Usage::

        pipe = ExtractionPipeline(api_key="AIza...")
        result = pipe.run("report.pdf", user_id=1, stock_id=42)
        print(json.dumps(result, indent=2))
    """

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self._mapper: Optional[LLMMapper] = None
        # Ensure DB tables exist
        storage.ensure_extraction_tables()

    @property
    def mapper(self) -> LLMMapper:
        if self._mapper is None:
            self._mapper = LLMMapper(api_key=self._api_key)
        return self._mapper

    # ──────────────────────────────────────────────────────────────────
    # Main entry point
    # ──────────────────────────────────────────────────────────────────

    def run(
        self,
        pdf_path: str,
        user_id: int = 1,
        stock_id: int = 1,
        *,
        statement_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Execute the full pipeline.

        ``statement_types`` defaults to ``["income", "balance", "cashflow", "equity"]``.
        Returns a UI-ready dict.
        """
        if statement_types is None:
            statement_types = ["income", "balance", "cashflow", "equity"]

        timings: Dict[str, float] = {}
        flags: List[str] = []
        t_total = time.time()

        # ── Step A: Classify PDF ─────────────────────────────────────
        t0 = time.time()
        classification = classify_pdf(pdf_path)
        timings["classify"] = round(time.time() - t0, 2)
        logger.info("PDF classified: %s (%s)", classification.pdf_type,
                     classification.sample_detail)

        # ── Create upload record ─────────────────────────────────────
        upload_id = storage.create_upload(
            user_id=user_id,
            stock_id=stock_id,
            pdf_path=pdf_path,
            pdf_type=classification.pdf_type,
        )

        try:
            result = self._run_inner(
                pdf_path, upload_id, classification,
                statement_types, timings, flags,
            )
        except Exception as exc:
            storage.update_upload_status(upload_id, "failed", str(exc))
            raise

        result["upload_id"] = upload_id
        result["pdf_type"] = classification.pdf_type
        result["timings"] = timings
        result["timings"]["total"] = round(time.time() - t_total, 2)

        # Determine overall status
        has_any = any(
            result["statements"].get(k, {}).get("periods")
            for k in _STMT_OUTPUT_KEY.values()
        )
        val_failures = [v for v in result.get("validations", [])
                        if v.get("pass_fail") == "fail"]

        if not has_any:
            result["status"] = "failed"
            flags.append("no_statements_extracted")
        elif val_failures or flags:
            result["status"] = "needs_review"
        else:
            result["status"] = "success"

        result["flags"] = flags
        storage.update_upload_status(upload_id, result["status"])

        return result

    # ──────────────────────────────────────────────────────────────────
    def _run_inner(
        self,
        pdf_path: str,
        upload_id: int,
        classification: ClassificationResult,
        statement_types: List[str],
        timings: Dict[str, float],
        flags: List[str],
    ) -> Dict[str, Any]:
        """Core logic — separated for error handling."""

        # ── Step B: Locate statement pages ───────────────────────────
        t0 = time.time()
        stmt_pages = find_statement_pages(pdf_path, classification.pdf_type)
        timings["locate_pages"] = round(time.time() - t0, 2)

        # Gather all needed pages + extract text
        all_pages = set()
        for st in statement_types:
            pages = getattr(stmt_pages, st, [])
            all_pages.update(pages)
            if not pages:
                flags.append(f"no_pages_for_{st}")

        if not all_pages:
            # Fallback: try first 6 pages
            logger.warning("No statement pages found — using first 6 pages")
            all_pages = set(range(min(6, classification.total_pages)))
            flags.append("fallback_first_pages")

        page_texts = extract_page_text(pdf_path, sorted(all_pages))

        # ── Step C + D: Extract tables per statement ─────────────────
        statements_output: Dict[str, Any] = {}

        for stmt_type in statement_types:
            out_key = _STMT_OUTPUT_KEY[stmt_type]
            pages = getattr(stmt_pages, stmt_type, [])
            if not pages:
                # Use all available pages as fallback
                pages = sorted(all_pages)

            t0 = time.time()
            result = self._process_statement(
                pdf_path, upload_id, stmt_type, pages,
                page_texts, classification, flags,
            )
            timings[f"extract_{stmt_type}"] = round(time.time() - t0, 2)
            statements_output[out_key] = result

        # ── Step E: Validate ─────────────────────────────────────────
        t0 = time.time()
        full_result = {"statements": statements_output}
        validations = validate_all(full_result)
        timings["validate"] = round(time.time() - t0, 2)

        # Persist validations
        val_dicts: List[Dict[str, Any]] = []
        for v in validations:
            storage.save_validation_result(
                upload_id, v.statement_type, v.rule_name,
                v.expected_value, v.actual_value, v.diff,
                v.pass_fail, v.notes,
            )
            val_dicts.append({
                "statement_type": v.statement_type,
                "rule_name": v.rule_name,
                "expected_value": v.expected_value,
                "actual_value": v.actual_value,
                "diff": v.diff,
                "pass_fail": v.pass_fail,
                "notes": v.notes,
            })
            if v.pass_fail == "fail":
                flags.append(f"validation_failed_{v.rule_name}")

        full_result["validations"] = val_dicts
        return full_result

    # ──────────────────────────────────────────────────────────────────
    def _process_statement(
        self,
        pdf_path: str,
        upload_id: int,
        stmt_type: str,
        pages: List[int],
        page_texts: Dict[int, str],
        classification: ClassificationResult,
        flags: List[str],
    ) -> Dict[str, Any]:
        """Extract + map one statement type."""

        # Build header context from page text
        header_ctx_map: Dict[int, str] = {}
        combined_header = ""
        for pn in pages:
            text = page_texts.get(pn, "")
            # Take first 500 chars as header context (unit info is usually at top)
            header_ctx_map[pn] = text[:500]
            combined_header += text[:500] + "\n"

        # ── Table extraction (tiered) ────────────────────────────────
        tables = extract_tables(pdf_path, pages, header_ctx_map)

        # If no tables and PDF is scanned → OCR fallback
        if not tables and classification.pdf_type in ("scanned", "mixed"):
            logger.info("No tables for %s — trying OCR on %d pages",
                        stmt_type, len(pages))
            tables = extract_tables_ocr(pdf_path, pages)
            if not tables:
                flags.append(f"ocr_no_tables_{stmt_type}")

        if not tables:
            flags.append(f"no_tables_{stmt_type}")
            logger.warning("No tables extracted for %s", stmt_type)
            return {"periods": [], "items": []}

        # ── Persist raw extractions ──────────────────────────────────
        for tbl in tables:
            storage.save_raw_extraction(
                upload_id=upload_id,
                statement_type=stmt_type,
                page_num=tbl.page_num,
                method=tbl.method,
                table_id=tbl.table_id,
                table_json=tbl.to_json_str(),
                header_context=tbl.header_context[:1000],
                confidence=tbl.confidence,
            )

        # ── LLM Mapping ─────────────────────────────────────────────
        tables_data = [
            {"headers": t.headers, "rows": t.rows}
            for t in tables
        ]
        source_pages = [t.page_num for t in tables]

        try:
            mapped = self.mapper.map_tables(
                statement_type=stmt_type,
                tables_data=tables_data,
                header_context=combined_header,
                source_pages=source_pages,
            )
        except Exception as exc:
            logger.error("LLM mapping failed for %s: %s", stmt_type, exc)
            flags.append(f"mapping_failed_{stmt_type}")
            return {"periods": [], "items": []}

        # ── Persist normalised items ─────────────────────────────────
        currency = mapped.get("currency", "USD")
        unit_scale = mapped.get("unit_scale", 1)

        for period in mapped.get("periods", []):
            period_date = period.get("period_end_date", "")
            for item in period.get("items", []):
                storage.save_normalized_item(
                    upload_id=upload_id,
                    statement_type=stmt_type,
                    period_end_date=period_date,
                    currency=currency,
                    unit_scale=unit_scale,
                    line_item_key=item.get("line_item_key", "UNKNOWN"),
                    label_raw=item.get("label_raw", ""),
                    value=item.get("value", 0.0),
                    source_page=item.get("source_page"),
                    source_table_id=item.get("source_table_id"),
                )

        return mapped
