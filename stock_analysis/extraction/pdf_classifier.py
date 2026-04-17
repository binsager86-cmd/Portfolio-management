"""
PDF Classifier — detect text/scanned/mixed and locate statement pages.

Uses PyMuPDF (fitz) for fast text extraction and page scoring.
OCR is NOT invoked here — only lightweight text + image detection.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────

# Statement-type keywords (English + Arabic)
_STATEMENT_KEYWORDS: Dict[str, List[str]] = {
    "income": [
        # English
        "income statement", "statement of profit", "profit or loss",
        "statement of operations", "statement of earnings",
        "profit and loss", "statement of comprehensive income",
        "condensed consolidated statement of income",
        "consolidated statement of income",
        # Arabic
        "بيان الدخل", "قائمة الأرباح", "بيان الربح والخسارة",
        "قائمة الدخل الموحدة",
    ],
    "balance": [
        "statement of financial position", "balance sheet",
        "consolidated balance sheet",
        "condensed consolidated statement of financial position",
        "consolidated statement of financial position",
        # Arabic
        "قائمة المركز المالي", "الميزانية العمومية",
    ],
    "cashflow": [
        "statement of cash flows", "cash flow statement",
        "cash flows from operating", "cash flow from operations",
        "condensed consolidated statement of cash flows",
        "consolidated statement of cash flows",
        # Arabic
        "قائمة التدفقات النقدية", "بيان التدفقات النقدية",
    ],
    "equity": [
        "statement of changes in equity",
        "changes in equity", "changes in shareholders equity",
        "consolidated statement of changes in equity",
        "condensed consolidated statement of changes in equity",
        "statement of changes in owners equity",
        # Arabic
        "قائمة التغيرات في حقوق الملكية", "بيان التغيرات في حقوق المساهمين",
    ],
}

# Financial-content markers (boost score if found alongside keywords)
_FINANCIAL_MARKERS = [
    r"\bKD\b", r"\bKWD\b", r"\bUSD\b", r"\bSAR\b", r"\bAED\b",
    r"thousand", r"million", r"billion",
    r"'000", r"\(000\)", r"\(000s\)",
    r"\bfils\b",
    r"total\s+assets", r"total\s+liabilities", r"total\s+equity",
    r"net\s+income", r"revenue", r"gross\s+profit",
    r"operating", r"cash\s+from",
]

# How many chars of extracted text qualifies a page as "has text"
_MIN_TEXT_CHARS = 40
# Sampling: check these many pages to classify PDF type
_SAMPLE_PAGES = 5


# ─────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────

@dataclass
class PageInfo:
    """Metadata for one page of the PDF."""
    page_num: int            # 0-based
    text: str = ""
    text_length: int = 0
    image_count: int = 0
    has_text: bool = False
    statement_scores: Dict[str, float] = field(default_factory=dict)


@dataclass
class ClassificationResult:
    """Output of ``classify_pdf``."""
    pdf_type: str                       # "text" | "scanned" | "mixed"
    total_pages: int = 0
    text_pages: int = 0
    scanned_pages: int = 0
    sample_detail: str = ""


@dataclass
class StatementPages:
    """Output of ``find_statement_pages``."""
    income: List[int] = field(default_factory=list)     # 0-based page nums
    balance: List[int] = field(default_factory=list)
    cashflow: List[int] = field(default_factory=list)
    equity: List[int] = field(default_factory=list)
    scores: Dict[str, List[Tuple[int, float]]] = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

def classify_pdf(pdf_path: str) -> ClassificationResult:
    """Classify a PDF as text-based, scanned, or mixed.

    Samples up to ``_SAMPLE_PAGES`` pages.  If >80 % have text →
    "text"; if <20 % have text → "scanned"; else "mixed".
    """
    doc = fitz.open(pdf_path)
    total = len(doc)
    step = max(1, total // _SAMPLE_PAGES)
    sample_indices = list(range(0, total, step))[:_SAMPLE_PAGES]

    text_count = 0
    for idx in sample_indices:
        page = doc[idx]
        text = page.get_text("text") or ""
        if len(text.strip()) >= _MIN_TEXT_CHARS:
            text_count += 1
    doc.close()

    ratio = text_count / len(sample_indices) if sample_indices else 0

    if ratio >= 0.8:
        pdf_type = "text"
    elif ratio <= 0.2:
        pdf_type = "scanned"
    else:
        pdf_type = "mixed"

    return ClassificationResult(
        pdf_type=pdf_type,
        total_pages=total,
        text_pages=text_count,
        scanned_pages=len(sample_indices) - text_count,
        sample_detail=f"Sampled {len(sample_indices)} of {total} pages, "
                      f"{text_count} had extractable text",
    )


def find_statement_pages(
    pdf_path: str,
    pdf_type: str = "text",
    max_results_per_type: int = 3,
) -> StatementPages:
    """Score every page by keyword frequency and return the best
    candidate pages for each statement type.

    For scanned PDFs with no extractable text, returns empty lists
    (caller should fall back to OCR on a few pages).
    """
    doc = fitz.open(pdf_path)
    pages: List[PageInfo] = []

    for idx in range(len(doc)):
        page = doc[idx]
        text = page.get_text("text") or ""
        pinfo = PageInfo(
            page_num=idx,
            text=text,
            text_length=len(text.strip()),
            image_count=len(page.get_images(full=False)),
            has_text=len(text.strip()) >= _MIN_TEXT_CHARS,
        )
        if pinfo.has_text:
            pinfo.statement_scores = _score_page(text)
        pages.append(pinfo)

    doc.close()

    result = StatementPages()
    result.scores = {}

    for stmt_type in ("income", "balance", "cashflow", "equity"):
        scored = [
            (p.page_num, p.statement_scores.get(stmt_type, 0.0))
            for p in pages
            if p.statement_scores.get(stmt_type, 0.0) > 0
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        result.scores[stmt_type] = scored[:max_results_per_type * 2]

        best = [pn for pn, sc in scored[:max_results_per_type]]
        setattr(result, stmt_type, best)

    return result


def extract_page_text(pdf_path: str, page_nums: List[int]) -> Dict[int, str]:
    """Extract text for specific pages (0-based). Fast, cached-friendly."""
    doc = fitz.open(pdf_path)
    result = {}
    for pn in page_nums:
        if 0 <= pn < len(doc):
            result[pn] = doc[pn].get_text("text") or ""
    doc.close()
    return result


# ─────────────────────────────────────────────────────────────────────
# Internal scoring
# ─────────────────────────────────────────────────────────────────────

def _score_page(text: str) -> Dict[str, float]:
    """Return per-statement-type relevance score for a page."""
    text_lower = text.lower()
    scores: Dict[str, float] = {}

    for stmt_type, keywords in _STATEMENT_KEYWORDS.items():
        kw_hits = sum(1 for kw in keywords if kw.lower() in text_lower)
        # Exact header match (stronger signal)
        header_bonus = 0
        for kw in keywords:
            # Check if keyword appears near start of a line (likely a header)
            pattern = r"(?:^|\n)\s*" + re.escape(kw.lower())
            if re.search(pattern, text_lower):
                header_bonus += 15

        # Financial marker bonus
        marker_hits = sum(
            1 for m in _FINANCIAL_MARKERS
            if re.search(m, text, re.IGNORECASE)
        )

        # Numbers density — financial tables have lots of numbers
        numbers = re.findall(r"[\d,]+(?:\.\d+)?", text)
        number_density = min(30, len(numbers) * 0.5)

        score = (kw_hits * 10) + header_bonus + (marker_hits * 3) + number_density
        if score > 0:
            scores[stmt_type] = round(score, 1)

    return scores
