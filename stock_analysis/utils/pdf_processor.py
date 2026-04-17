"""
PDF Processor — Extract text and tables from financial-report PDFs.
Wraps pdfplumber with helpers for table detection and OCR fallback.
"""

import os
import tempfile
from typing import Any, Dict, List, Optional

import pdfplumber


class PDFProcessor:
    """Stateless utilities for reading PDF financial documents."""

    # ── full-text extraction ───────────────────────────────────────────
    @staticmethod
    def extract_text(
        pdf_path: str,
        max_pages: int = 50,
    ) -> str:
        """Return concatenated text from up to *max_pages* pages."""
        parts: List[str] = []
        with pdfplumber.open(pdf_path) as pdf:
            for idx, page in enumerate(pdf.pages[:max_pages]):
                text = page.extract_text()
                if text:
                    parts.append(f"--- Page {idx + 1} ---\n{text}")
        return "\n".join(parts)

    # ── table extraction ───────────────────────────────────────────────
    @staticmethod
    def extract_tables(
        pdf_path: str,
        max_pages: int = 50,
    ) -> List[Dict[str, Any]]:
        """Return every table found as a list of dicts.

        Each dict:
            page  : int
            header: list[str] | None
            rows  : list[list[str]]
        """
        tables: List[Dict[str, Any]] = []
        with pdfplumber.open(pdf_path) as pdf:
            for idx, page in enumerate(pdf.pages[:max_pages]):
                for tbl in page.extract_tables():
                    if not tbl:
                        continue
                    header = tbl[0] if len(tbl) > 1 else None
                    rows = tbl[1:] if header else tbl
                    tables.append({
                        "page": idx + 1,
                        "header": header,
                        "rows": rows,
                    })
        return tables

    # ── page count ─────────────────────────────────────────────────────
    @staticmethod
    def page_count(pdf_path: str) -> int:
        with pdfplumber.open(pdf_path) as pdf:
            return len(pdf.pages)

    # ── save uploaded file to temp ─────────────────────────────────────
    @staticmethod
    def save_upload(uploaded_file) -> str:
        """Save a Streamlit UploadedFile to a temp path and return it."""
        suffix = os.path.splitext(uploaded_file.name)[1] or ".pdf"
        fd, path = tempfile.mkstemp(suffix=suffix)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(uploaded_file.getbuffer())
        except Exception:
            os.close(fd)
            raise
        return path

    # ── identify statement pages heuristically ─────────────────────────
    @staticmethod
    def find_statement_pages(
        pdf_path: str,
    ) -> Dict[str, List[int]]:
        """Scan page text for keywords and return probable page numbers
        for each statement type.

        Returns e.g.:
            {"income": [12, 13], "balance": [14], "cashflow": [15, 16]}
        """
        keywords = {
            "income": [
                "income statement", "statement of operations",
                "statement of earnings", "profit and loss",
                "consolidated statements of income",
            ],
            "balance": [
                "balance sheet", "statement of financial position",
                "consolidated balance sheet",
            ],
            "cashflow": [
                "cash flow", "statement of cash flows",
                "consolidated statements of cash flows",
            ],
            "equity": [
                "changes in equity", "statement of changes in equity",
                "consolidated statement of changes in equity",
                "changes in shareholders equity",
            ],
        }
        result: Dict[str, List[int]] = {k: [] for k in keywords}

        with pdfplumber.open(pdf_path) as pdf:
            for idx, page in enumerate(pdf.pages):
                text = (page.extract_text() or "").lower()
                for stype, kws in keywords.items():
                    if any(kw in text for kw in kws):
                        result[stype].append(idx + 1)

        return result

    # ── extract specific page range ────────────────────────────────────
    @staticmethod
    def extract_page_range(
        pdf_path: str, start: int, end: int
    ) -> str:
        """Extract text from a 1-based inclusive page range."""
        parts: List[str] = []
        with pdfplumber.open(pdf_path) as pdf:
            for idx in range(max(0, start - 1), min(len(pdf.pages), end)):
                text = pdf.pages[idx].extract_text()
                if text:
                    parts.append(f"--- Page {idx + 1} ---\n{text}")
        return "\n".join(parts)
