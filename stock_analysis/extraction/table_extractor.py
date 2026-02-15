"""
Table Extractor — extract tables from PDF pages using a tiered approach.

Priority:
    1. Camelot lattice  (ruled tables with visible borders)
    2. Camelot stream   (borderless tables inferred from spacing)
    3. pdfplumber       (fallback, often handles mixed layouts well)
    4. OCR              (LAST RESORT — only for scanned/image pages)

Each method returns ``ExtractedTable`` objects with provenance metadata.
"""

import json
import logging
import os
import re
import tempfile
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────

@dataclass
class ExtractedTable:
    """One table extracted from a single page."""
    page_num: int            # 0-based
    table_id: int            # sequential within the page
    method: str              # camelot_lattice | camelot_stream | pdfplumber | ocr
    headers: List[str] = field(default_factory=list)
    rows: List[List[str]] = field(default_factory=list)
    confidence: float = 0.0
    header_context: str = ""  # text above/near the table
    row_count: int = 0
    col_count: int = 0

    def to_json_str(self) -> str:
        """Serialize to compact JSON for storage."""
        return json.dumps({
            "headers": self.headers,
            "rows": self.rows,
        }, ensure_ascii=False)

    @property
    def is_empty(self) -> bool:
        return self.row_count == 0

    def has_numbers(self) -> bool:
        """Does any cell look like it contains a numeric value?"""
        for row in self.rows:
            for cell in row:
                if cell and re.search(r"\d", str(cell)):
                    return True
        return False


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

def extract_tables(
    pdf_path: str,
    pages: List[int],
    header_context_map: Optional[Dict[int, str]] = None,
) -> List[ExtractedTable]:
    """Extract tables from *pages* (0-based) using the tiered approach.

    ``header_context_map`` optionally maps page_num → text context above
    the main table region (used by the LLM for unit/currency detection).

    Returns all non-empty tables found across all requested pages.
    """
    all_tables: List[ExtractedTable] = []
    header_ctx = header_context_map or {}

    for page_num in pages:
        page_tables = _extract_page_tables(pdf_path, page_num, header_ctx.get(page_num, ""))
        all_tables.extend(page_tables)

    return all_tables


def extract_tables_ocr(
    pdf_path: str,
    pages: List[int],
) -> List[ExtractedTable]:
    """OCR fallback — only invoked for scanned pages with no tables.

    Uses pytesseract + pdfplumber page-to-image.
    """
    tables: List[ExtractedTable] = []
    try:
        import pdfplumber
        import pytesseract
        from PIL import Image
    except ImportError:
        logger.warning("OCR dependencies not installed (pytesseract, Pillow)")
        return tables

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num in pages:
                if page_num >= len(pdf.pages):
                    continue
                page = pdf.pages[page_num]
                img = page.to_image(resolution=300)
                text = pytesseract.image_to_string(img.original, config="--psm 6")
                if not text.strip():
                    continue

                # Build pseudo-table from OCR text lines
                rows = _ocr_text_to_rows(text)
                if rows:
                    tables.append(ExtractedTable(
                        page_num=page_num,
                        table_id=0,
                        method="ocr",
                        headers=rows[0] if len(rows) > 1 else [],
                        rows=rows[1:] if len(rows) > 1 else rows,
                        confidence=0.3,
                        row_count=len(rows) - 1,
                        col_count=max(len(r) for r in rows) if rows else 0,
                    ))
    except Exception as exc:
        logger.error("OCR extraction failed: %s", exc)

    return tables


# ─────────────────────────────────────────────────────────────────────
# Internal — per-page tiered extraction
# ─────────────────────────────────────────────────────────────────────

def _extract_page_tables(
    pdf_path: str, page_num: int, header_context: str
) -> List[ExtractedTable]:
    """Try Camelot lattice → stream → pdfplumber for a single page."""
    # Camelot uses 1-based page numbers (as a string)
    camelot_page = str(page_num + 1)

    # ── 1. Camelot lattice ────────────────────────────────────────
    tables = _try_camelot(pdf_path, camelot_page, "lattice", page_num, header_context)
    if tables:
        return tables

    # ── 2. Camelot stream ─────────────────────────────────────────
    tables = _try_camelot(pdf_path, camelot_page, "stream", page_num, header_context)
    if tables:
        return tables

    # ── 3. pdfplumber ─────────────────────────────────────────────
    tables = _try_pdfplumber(pdf_path, page_num, header_context)
    if tables:
        return tables

    return []


def _try_camelot(
    pdf_path: str, camelot_page: str, flavor: str,
    page_num: int, header_context: str,
) -> List[ExtractedTable]:
    """Attempt Camelot extraction (lattice or stream)."""
    try:
        import camelot
    except ImportError:
        logger.debug("camelot-py not installed — skipping %s", flavor)
        return []

    method_name = f"camelot_{flavor}"
    try:
        result = camelot.read_pdf(
            pdf_path,
            pages=camelot_page,
            flavor=flavor,
            suppress_stdout=True,
        )
        tables: List[ExtractedTable] = []
        for idx, tbl in enumerate(result):
            df = tbl.df
            if df.empty or len(df) < 2:
                continue
            # First row as headers, rest as data
            headers = [str(c).strip() for c in df.iloc[0].tolist()]
            rows = []
            for _, row in df.iloc[1:].iterrows():
                rows.append([str(c).strip() for c in row.tolist()])

            accuracy = getattr(tbl, "parsing_report", {}).get("accuracy", 0)
            if isinstance(accuracy, (int, float)):
                conf = round(accuracy / 100.0, 2)
            else:
                conf = 0.6 if flavor == "lattice" else 0.4

            et = ExtractedTable(
                page_num=page_num,
                table_id=idx,
                method=method_name,
                headers=headers,
                rows=rows,
                confidence=conf,
                header_context=header_context,
                row_count=len(rows),
                col_count=len(headers),
            )
            if et.has_numbers():
                tables.append(et)

        if tables:
            logger.info("Camelot %s found %d table(s) on page %d",
                        flavor, len(tables), page_num + 1)
        return tables

    except Exception as exc:
        logger.debug("Camelot %s failed on page %d: %s",
                     flavor, page_num + 1, exc)
        return []


def _try_pdfplumber(
    pdf_path: str, page_num: int, header_context: str,
) -> List[ExtractedTable]:
    """Fallback to pdfplumber table extraction."""
    try:
        import pdfplumber
    except ImportError:
        return []

    tables: List[ExtractedTable] = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if page_num >= len(pdf.pages):
                return []
            page = pdf.pages[page_num]
            raw_tables = page.extract_tables()
            if not raw_tables:
                return []

            for idx, tbl in enumerate(raw_tables):
                if not tbl or len(tbl) < 2:
                    continue
                headers = [str(c or "").strip() for c in tbl[0]]
                rows = []
                for row in tbl[1:]:
                    rows.append([str(c or "").strip() for c in row])

                et = ExtractedTable(
                    page_num=page_num,
                    table_id=idx,
                    method="pdfplumber",
                    headers=headers,
                    rows=rows,
                    confidence=0.5,
                    header_context=header_context,
                    row_count=len(rows),
                    col_count=len(headers),
                )
                if et.has_numbers():
                    tables.append(et)

        if tables:
            logger.info("pdfplumber found %d table(s) on page %d",
                        len(tables), page_num + 1)
    except Exception as exc:
        logger.debug("pdfplumber failed on page %d: %s", page_num + 1, exc)

    return tables


# ─────────────────────────────────────────────────────────────────────
# OCR helpers
# ─────────────────────────────────────────────────────────────────────

def _ocr_text_to_rows(text: str) -> List[List[str]]:
    """Convert raw OCR text into table-like rows.

    Splits lines by 2+ spaces or tabs (common in OCR'd financial tables).
    Filters lines that have at least one number.
    """
    lines = text.strip().split("\n")
    rows: List[List[str]] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Split on 2+ whitespace
        cells = re.split(r"\s{2,}|\t", line)
        cells = [c.strip() for c in cells if c.strip()]
        if len(cells) >= 2:
            rows.append(cells)
    return rows
