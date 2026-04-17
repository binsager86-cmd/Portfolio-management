"""
Scanned-PDF Financial Extractor
================================
Purpose-built for scanned financial statements with a known layout:

    Page 1  →  Balance Sheet
    Page 2  →  Income Statement
    Page 3  →  Cash Flow Statement

Each page is rendered at 350 DPI, pre-processed (grayscale, threshold,
deskew), then OpenCV detects the table grid (horizontal / vertical lines)
to produce per-cell bounding boxes.  Cells are OCR'd individually with
tesseract (digits-only config for numeric columns, regular for the label
column).

Amounts are parsed with :func:`number_parser.parse_amount`.
Rows are **NEVER** dropped — if parsing fails the row keeps
``amount_raw`` and ``amount=None`` with a ``parse_error`` flag.

Caching uses ``sha256(pdf_bytes) + EXTRACTOR_VERSION`` on disk.

Public API
----------
    extract_financials_from_pdf(pdf_path, force=False)  →  dict
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import fitz  # PyMuPDF
import numpy as np

logger = logging.getLogger(__name__)

# ── Local imports ────────────────────────────────────────────────────
from stock_analysis.config import CACHE_DIR
from stock_analysis.extraction.number_parser import EXTRACTOR_VERSION, parse_amount

# ── Try importing tesseract — graceful if missing ────────────────────
try:
    import pytesseract
except ImportError:
    pytesseract = None
    logger.warning("pytesseract not installed — OCR will be unavailable")

# ── Constants ────────────────────────────────────────────────────────

# Hard-map: 0-based page index → statement type
PAGE_STATEMENT_MAP: Dict[int, str] = {
    0: "balance_sheet",
    1: "income_statement",
    2: "cash_flow",
}

# Minimum characters per page to consider it "text-based" (not scanned)
_TEXT_THRESHOLD = 40

# DPI for rendering scanned pages
_RENDER_DPI = 350

# Cache TTL (24 hours)
_CACHE_TTL_SECONDS = 86_400

# Column names for the expected 3-column layout
_EXPECTED_COLUMNS = ["label", "current_year", "prior_year"]


# ─────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────

@dataclass
class ExtractedRow:
    """One row from a financial table — never deleted, even on parse error."""
    label: str
    amount_raw_col1: str = ""
    amount_raw_col2: str = ""
    amount_col1: Optional[float] = None
    amount_col2: Optional[float] = None
    parse_error_col1: Optional[str] = None
    parse_error_col2: Optional[str] = None
    page_num: int = 0
    row_index: int = 0
    confidence: float = 0.0


@dataclass
class StatementResult:
    """Extraction result for one statement type."""
    statement_type: str
    page_num: int
    rows: List[ExtractedRow] = field(default_factory=list)
    column_headers: List[str] = field(default_factory=list)
    is_scanned: bool = True
    method: str = "opencv_ocr"
    extraction_time_s: float = 0.0


@dataclass
class ExtractionResult:
    """Top-level result returned by extract_financials_from_pdf."""
    pdf_path: str
    cache_key: str
    extractor_version: str
    statements: Dict[str, StatementResult] = field(default_factory=dict)
    timings: Dict[str, float] = field(default_factory=dict)
    total_rows: int = 0
    rows_with_errors: int = 0
    status: str = "success"  # success | needs_review | failed
    flags: List[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────
# CACHE helpers
# ─────────────────────────────────────────────────────────────────────

def _build_cache_key(pdf_bytes: bytes) -> str:
    """sha256(pdf_bytes) + extractor version."""
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    return f"{digest}_{EXTRACTOR_VERSION}"


def _cache_path(cache_key: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"scanned_{cache_key}.json")


def _get_cached(cache_key: str) -> Optional[dict]:
    """Return cached result dict if valid and within TTL."""
    path = _cache_path(cache_key)
    if not os.path.exists(path):
        return None
    try:
        age = time.time() - os.path.getmtime(path)
        if age > _CACHE_TTL_SECONDS:
            logger.debug("Cache expired for %s (%.0fs old)", cache_key[:16], age)
            return None
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("Cache HIT for %s", cache_key[:16])
        return data
    except Exception as exc:
        logger.warning("Cache read error: %s", exc)
        return None


def _save_cache(cache_key: str, result: dict) -> None:
    """Persist result dict to disk."""
    path = _cache_path(cache_key)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logger.debug("Cached result → %s", path)
    except Exception as exc:
        logger.warning("Cache write error: %s", exc)


# ─────────────────────────────────────────────────────────────────────
# IMAGE PRE-PROCESSING
# ─────────────────────────────────────────────────────────────────────

def _render_page(doc: fitz.Document, page_idx: int, dpi: int = _RENDER_DPI) -> np.ndarray:
    """Render a single PDF page to a NumPy BGR image at *dpi*."""
    page = doc[page_idx]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
        pix.height, pix.width, 3
    )
    # fitz gives RGB; OpenCV wants BGR
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)


def _preprocess(img: np.ndarray) -> np.ndarray:
    """Grayscale → threshold → deskew → return binary image."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Adaptive threshold for uneven lighting on scans
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 15, 10,
    )

    # Deskew based on minAreaRect of all white pixels
    coords = np.column_stack(np.where(binary > 0))
    if len(coords) > 100:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > 0.5:  # only deskew if > 0.5 degrees
            h, w = binary.shape
            centre = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(centre, angle, 1.0)
            binary = cv2.warpAffine(
                binary, M, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE,
            )

    return binary


# ─────────────────────────────────────────────────────────────────────
# OPENCV TABLE GRID DETECTION
# ─────────────────────────────────────────────────────────────────────

def _detect_grid(binary: np.ndarray) -> Tuple[List[int], List[int]]:
    """Detect horizontal and vertical line positions in a binary image.

    Returns:
        (row_ys, col_xs) — sorted lists of y-coordinates for horizontal
        lines and x-coordinates for vertical lines.
    """
    h, w = binary.shape

    # ── Horizontal lines ─────────────────────────────────────────
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(w // 15, 40), 1))
    horiz = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horiz_kernel, iterations=2)

    # ── Vertical lines ───────────────────────────────────────────
    vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(h // 15, 40)))
    vert = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vert_kernel, iterations=2)

    # ── Extract line y-positions (horizontal) ────────────────────
    row_ys = _line_positions(horiz, axis=1, merge_gap=15)
    col_xs = _line_positions(vert, axis=0, merge_gap=15)

    return row_ys, col_xs


def _line_positions(mask: np.ndarray, axis: int, merge_gap: int = 15) -> List[int]:
    """Project mask along *axis* and find peaks (line positions).

    axis=1 → project onto Y (horizontal lines),
    axis=0 → project onto X (vertical lines).
    """
    projection = np.sum(mask, axis=axis)
    # Threshold: at least 20% of dimension should be white
    threshold = 0.20 * (mask.shape[1 - axis])
    peaks = np.where(projection > threshold)[0]
    if len(peaks) == 0:
        return []

    # Merge nearby peaks
    merged: List[int] = [int(peaks[0])]
    for p in peaks[1:]:
        if p - merged[-1] > merge_gap:
            merged.append(int(p))
        else:
            # Keep the average
            merged[-1] = (merged[-1] + int(p)) // 2

    return merged


def _grid_to_cells(
    row_ys: List[int],
    col_xs: List[int],
    img_h: int,
    img_w: int,
) -> List[List[Tuple[int, int, int, int]]]:
    """Convert grid lines into a 2D array of cell bounding boxes.

    Returns rows × cols of (x1, y1, x2, y2) tuples.
    """
    # Add image boundaries if not already present
    if not row_ys or row_ys[0] > 30:
        row_ys = [0] + row_ys
    if not row_ys or row_ys[-1] < img_h - 30:
        row_ys = row_ys + [img_h]

    if not col_xs or col_xs[0] > 30:
        col_xs = [0] + col_xs
    if not col_xs or col_xs[-1] < img_w - 30:
        col_xs = col_xs + [img_w]

    cells: List[List[Tuple[int, int, int, int]]] = []
    for ri in range(len(row_ys) - 1):
        row_cells: List[Tuple[int, int, int, int]] = []
        for ci in range(len(col_xs) - 1):
            row_cells.append((col_xs[ci], row_ys[ri], col_xs[ci + 1], row_ys[ri + 1]))
        cells.append(row_cells)

    return cells


def _infer_columns_from_width(img_w: int) -> List[int]:
    """Fallback: if no vertical lines detected, split into 3 columns.

    Label column gets ~55%, numeric columns ~22.5% each.
    """
    c1 = int(img_w * 0.55)
    c2 = int(img_w * 0.775)
    return [0, c1, c2, img_w]


def _infer_rows_from_text(binary: np.ndarray, min_row_height: int = 20) -> List[int]:
    """Fallback: detect row boundaries by projecting text onto Y axis."""
    projection = np.sum(binary, axis=1)
    threshold = np.max(projection) * 0.05 if np.max(projection) > 0 else 1

    in_text = False
    row_ys: List[int] = []
    for y, val in enumerate(projection):
        if not in_text and val > threshold:
            in_text = True
            row_ys.append(y)
        elif in_text and val <= threshold:
            in_text = False
            row_ys.append(y)

    # Filter out very small gaps
    filtered: List[int] = []
    for i, y in enumerate(row_ys):
        if i == 0:
            filtered.append(y)
        elif y - filtered[-1] >= min_row_height:
            filtered.append(y)
        else:
            filtered[-1] = (filtered[-1] + y) // 2

    return filtered


# ─────────────────────────────────────────────────────────────────────
# PER-CELL OCR
# ─────────────────────────────────────────────────────────────────────

_DIGITS_CONFIG = r"--psm 7 -c tessedit_char_whitelist=0123456789,.-()% "
_LABEL_CONFIG = r"--psm 6"


def _ocr_cell(img: np.ndarray, bbox: Tuple[int, int, int, int], is_numeric: bool) -> str:
    """OCR a single cell bounding box.

    Args:
        img:        Full-page BGR image.
        bbox:       (x1, y1, x2, y2) of the cell.
        is_numeric: If True, uses digits-only whitelist.

    Returns:
        Cleaned OCR text.
    """
    if pytesseract is None:
        return ""

    x1, y1, x2, y2 = bbox
    # Add small padding
    pad = 3
    h, w = img.shape[:2]
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)

    cell_img = img[y1:y2, x1:x2]
    if cell_img.size == 0:
        return ""

    # Convert to grayscale for OCR
    if len(cell_img.shape) == 3:
        cell_gray = cv2.cvtColor(cell_img, cv2.COLOR_BGR2GRAY)
    else:
        cell_gray = cell_img

    # Upscale small cells for better OCR
    ch, cw = cell_gray.shape
    if ch < 30 or cw < 50:
        scale = max(2, 60 // max(ch, 1))
        cell_gray = cv2.resize(
            cell_gray, None, fx=scale, fy=scale,
            interpolation=cv2.INTER_CUBIC,
        )

    # Binarise
    _, cell_bin = cv2.threshold(cell_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    config = _DIGITS_CONFIG if is_numeric else _LABEL_CONFIG
    try:
        text = pytesseract.image_to_string(cell_bin, config=config)
    except Exception:
        text = ""

    return text.strip()


# ─────────────────────────────────────────────────────────────────────
# TEXT vs SCANNED detection
# ─────────────────────────────────────────────────────────────────────

def _is_page_scanned(doc: fitz.Document, page_idx: int) -> bool:
    """Return True if the page has less than *_TEXT_THRESHOLD* chars of
    extractable text (i.e. it is a scanned image)."""
    page = doc[page_idx]
    text = page.get_text("text") or ""
    return len(text.strip()) < _TEXT_THRESHOLD


def _extract_text_rows(doc: fitz.Document, page_idx: int) -> List[List[str]]:
    """For text-based pages, extract rows using fitz text extraction.

    Returns list of [label, col1, col2].
    Splits lines by 2+ spaces (similar to table_extractor's OCR helper).
    """
    import re as _re
    page = doc[page_idx]
    text = page.get_text("text") or ""
    rows: List[List[str]] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        cells = _re.split(r"\s{2,}|\t", line)
        cells = [c.strip() for c in cells if c.strip()]
        if len(cells) >= 2:
            rows.append(cells)
    return rows


# ─────────────────────────────────────────────────────────────────────
# PER-PAGE EXTRACTION
# ─────────────────────────────────────────────────────────────────────

def _extract_page(
    doc: fitz.Document,
    page_idx: int,
    statement_type: str,
) -> StatementResult:
    """Extract rows from a single page (scanned or text).

    Returns a StatementResult — rows are NEVER dropped.
    """
    t0 = time.time()
    is_scanned = _is_page_scanned(doc, page_idx)

    if not is_scanned:
        # Fast text-based extraction
        raw_rows = _extract_text_rows(doc, page_idx)
        return _text_rows_to_result(
            raw_rows, page_idx, statement_type,
            method="text_direct", t0=t0,
        )

    # ── Scanned pipeline ─────────────────────────────────────────
    img = _render_page(doc, page_idx, dpi=_RENDER_DPI)
    binary = _preprocess(img)
    img_h, img_w = binary.shape

    # Detect grid
    row_ys, col_xs = _detect_grid(binary)

    # Fallback if no lines detected
    has_rows = len(row_ys) >= 3
    has_cols = len(col_xs) >= 2

    if not has_rows:
        row_ys = _infer_rows_from_text(binary)
        if not row_ys:
            # Last resort: treat whole page as one block
            logger.warning("Page %d: no rows detected, full-page OCR", page_idx + 1)
            full_text = _ocr_cell(img, (0, 0, img_w, img_h), is_numeric=False)
            import re as _re
            lines = _re.split(r"\n", full_text)
            raw_rows = []
            for ln in lines:
                cells = _re.split(r"\s{2,}|\t", ln.strip())
                cells = [c.strip() for c in cells if c.strip()]
                if len(cells) >= 2:
                    raw_rows.append(cells)
            return _text_rows_to_result(
                raw_rows, page_idx, statement_type,
                method="ocr_fullpage", t0=t0,
            )

    if not has_cols:
        col_xs = _infer_columns_from_width(img_w)

    # Build cell grid
    cells = _grid_to_cells(row_ys, col_xs, img_h, img_w)

    # Determine which columns are numeric (all except the first)
    num_cols = len(cells[0]) if cells else 0

    # Detect column headers from first row
    column_headers: List[str] = []
    data_start = 0
    if cells:
        first_row_texts = [
            _ocr_cell(img, cells[0][ci], is_numeric=False) for ci in range(num_cols)
        ]
        # If first row looks like headers (contains year-like numbers or text)
        has_year = any(
            _looks_like_year(t) for t in first_row_texts
        )
        if has_year:
            column_headers = first_row_texts
            data_start = 1
        else:
            column_headers = _EXPECTED_COLUMNS[:num_cols]

    # OCR each data cell
    extracted_rows: List[ExtractedRow] = []
    for ri in range(data_start, len(cells)):
        if ri >= len(cells):
            break
        row_cells = cells[ri]

        # First column = label (text)
        label = _ocr_cell(img, row_cells[0], is_numeric=False) if num_cols > 0 else ""
        label = label.strip()

        # Skip empty label rows (likely separator lines)
        if not label and num_cols > 1:
            # Still check if numeric cells have content
            any_content = any(
                _ocr_cell(img, row_cells[ci], is_numeric=True).strip()
                for ci in range(1, min(num_cols, 3))
            )
            if not any_content:
                continue  # truly empty separator row

        # Numeric columns
        raw_col1 = ""
        raw_col2 = ""
        amt1: Optional[float] = None
        amt2: Optional[float] = None
        err1: Optional[str] = None
        err2: Optional[str] = None

        if num_cols > 1:
            raw_col1 = _ocr_cell(img, row_cells[1], is_numeric=True)
            amt1, err1 = parse_amount(raw_col1)

        if num_cols > 2:
            raw_col2 = _ocr_cell(img, row_cells[2], is_numeric=True)
            amt2, err2 = parse_amount(raw_col2)

        extracted_rows.append(ExtractedRow(
            label=label,
            amount_raw_col1=raw_col1,
            amount_raw_col2=raw_col2,
            amount_col1=amt1,
            amount_col2=amt2,
            parse_error_col1=err1,
            parse_error_col2=err2,
            page_num=page_idx,
            row_index=ri,
        ))

    elapsed = round(time.time() - t0, 2)
    return StatementResult(
        statement_type=statement_type,
        page_num=page_idx,
        rows=extracted_rows,
        column_headers=column_headers,
        is_scanned=True,
        method="opencv_ocr",
        extraction_time_s=elapsed,
    )


def _text_rows_to_result(
    raw_rows: List[List[str]],
    page_idx: int,
    statement_type: str,
    method: str,
    t0: float,
) -> StatementResult:
    """Convert raw text rows to a StatementResult — never drops rows."""
    extracted_rows: List[ExtractedRow] = []
    column_headers: List[str] = []

    # Check if first row looks like a header
    if raw_rows and any(_looks_like_year(c) for c in raw_rows[0]):
        column_headers = raw_rows[0]
        data_rows = raw_rows[1:]
    else:
        data_rows = raw_rows

    for ri, cells in enumerate(data_rows):
        label = cells[0] if cells else ""
        raw_col1 = cells[1] if len(cells) > 1 else ""
        raw_col2 = cells[2] if len(cells) > 2 else ""

        amt1, err1 = parse_amount(raw_col1)
        amt2, err2 = parse_amount(raw_col2)

        extracted_rows.append(ExtractedRow(
            label=label,
            amount_raw_col1=raw_col1,
            amount_raw_col2=raw_col2,
            amount_col1=amt1,
            amount_col2=amt2,
            parse_error_col1=err1,
            parse_error_col2=err2,
            page_num=page_idx,
            row_index=ri,
        ))

    elapsed = round(time.time() - t0, 2)
    return StatementResult(
        statement_type=statement_type,
        page_num=page_idx,
        rows=extracted_rows,
        column_headers=column_headers,
        is_scanned=False,
        method=method,
        extraction_time_s=elapsed,
    )


def _looks_like_year(text: str) -> bool:
    """Does *text* look like a year header (e.g. '2025', '2024')?"""
    import re as _re
    return bool(_re.search(r"\b20[12]\d\b", str(text)))


# ─────────────────────────────────────────────────────────────────────
# SERIALISATION helpers (for caching)
# ─────────────────────────────────────────────────────────────────────

def _result_to_dict(result: ExtractionResult) -> dict:
    """Serialise ExtractionResult → JSON-safe dict."""
    d: Dict[str, Any] = {
        "pdf_path": result.pdf_path,
        "cache_key": result.cache_key,
        "extractor_version": result.extractor_version,
        "total_rows": result.total_rows,
        "rows_with_errors": result.rows_with_errors,
        "status": result.status,
        "flags": result.flags,
        "timings": result.timings,
        "statements": {},
    }
    for key, stmt in result.statements.items():
        d["statements"][key] = {
            "statement_type": stmt.statement_type,
            "page_num": stmt.page_num,
            "column_headers": stmt.column_headers,
            "is_scanned": stmt.is_scanned,
            "method": stmt.method,
            "extraction_time_s": stmt.extraction_time_s,
            "rows": [asdict(r) for r in stmt.rows],
        }
    return d


def _dict_to_result(d: dict) -> ExtractionResult:
    """Deserialise cached dict → ExtractionResult."""
    result = ExtractionResult(
        pdf_path=d["pdf_path"],
        cache_key=d["cache_key"],
        extractor_version=d["extractor_version"],
        total_rows=d.get("total_rows", 0),
        rows_with_errors=d.get("rows_with_errors", 0),
        status=d.get("status", "success"),
        flags=d.get("flags", []),
        timings=d.get("timings", {}),
    )
    for key, stmt_d in d.get("statements", {}).items():
        rows = [ExtractedRow(**r) for r in stmt_d.get("rows", [])]
        result.statements[key] = StatementResult(
            statement_type=stmt_d["statement_type"],
            page_num=stmt_d["page_num"],
            rows=rows,
            column_headers=stmt_d.get("column_headers", []),
            is_scanned=stmt_d.get("is_scanned", True),
            method=stmt_d.get("method", "unknown"),
            extraction_time_s=stmt_d.get("extraction_time_s", 0.0),
        )
    return result


# ─────────────────────────────────────────────────────────────────────
# MAIN PUBLIC FUNCTION
# ─────────────────────────────────────────────────────────────────────

def extract_financials_from_pdf(
    pdf_path: str,
    *,
    force: bool = False,
) -> ExtractionResult:
    """Extract structured financial data from a (possibly scanned) PDF.

    Parameters
    ----------
    pdf_path : str
        Path to the PDF file.
    force : bool
        If True, bypass the disk cache and re-extract.

    Returns
    -------
    ExtractionResult
        Contains per-statement rows, timings, flags.  Rows are NEVER
        dropped — parse failures are flagged, not deleted.

    Raises
    ------
    FileNotFoundError
        If *pdf_path* does not exist.
    RuntimeError
        If the PDF cannot be opened.
    """
    t_total = time.time()
    pdf_path = str(Path(pdf_path).resolve())

    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # ── Step 1: Read bytes & build cache key ─────────────────────
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    cache_key = _build_cache_key(pdf_bytes)

    # ── Step 2: Check cache ──────────────────────────────────────
    if not force:
        cached = _get_cached(cache_key)
        if cached is not None:
            result = _dict_to_result(cached)
            result.timings["total"] = round(time.time() - t_total, 2)
            result.flags.append("from_cache")
            return result

    # ── Step 3: Open PDF ─────────────────────────────────────────
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        raise RuntimeError(f"Cannot open PDF: {exc}") from exc

    total_pages = len(doc)
    flags: List[str] = []
    timings: Dict[str, float] = {}

    if total_pages == 0:
        doc.close()
        raise RuntimeError("PDF has zero pages")

    # ── Step 4: Extract each mapped page ─────────────────────────
    statements: Dict[str, StatementResult] = {}

    for page_idx, stmt_type in PAGE_STATEMENT_MAP.items():
        if page_idx >= total_pages:
            flags.append(f"missing_page_{page_idx}_for_{stmt_type}")
            logger.warning(
                "PDF has %d pages; expected page %d for %s",
                total_pages, page_idx + 1, stmt_type,
            )
            continue

        t0 = time.time()
        stmt_result = _extract_page(doc, page_idx, stmt_type)
        timings[f"extract_{stmt_type}"] = round(time.time() - t0, 2)
        statements[stmt_type] = stmt_result

    doc.close()

    # ── Step 5: Aggregate metrics ────────────────────────────────
    total_rows = sum(len(s.rows) for s in statements.values())
    rows_with_errors = sum(
        1
        for s in statements.values()
        for r in s.rows
        if r.parse_error_col1 or r.parse_error_col2
    )
    # Don't count "dash_nil" or "empty_cell" as real errors for status
    real_errors = sum(
        1
        for s in statements.values()
        for r in s.rows
        if (r.parse_error_col1 and r.parse_error_col1 not in ("dash_nil", "empty_cell", "input_is_none"))
        or (r.parse_error_col2 and r.parse_error_col2 not in ("dash_nil", "empty_cell", "input_is_none"))
    )

    if total_rows == 0:
        status = "failed"
        flags.append("no_rows_extracted")
    elif real_errors > total_rows * 0.3:
        status = "needs_review"
        flags.append(f"high_error_rate:{real_errors}/{total_rows}")
    else:
        status = "success"

    timings["total"] = round(time.time() - t_total, 2)

    result = ExtractionResult(
        pdf_path=pdf_path,
        cache_key=cache_key,
        extractor_version=EXTRACTOR_VERSION,
        statements=statements,
        timings=timings,
        total_rows=total_rows,
        rows_with_errors=rows_with_errors,
        status=status,
        flags=flags,
    )

    # ── Step 6: Log extraction metrics ───────────────────────────
    logger.info(
        "Extraction complete: %d statements, %d rows (%d with errors), "
        "status=%s, time=%.2fs",
        len(statements), total_rows, rows_with_errors,
        status, timings["total"],
    )
    for stype, stmt in statements.items():
        logger.info(
            "  %s: %d rows, method=%s, scanned=%s, time=%.2fs",
            stype, len(stmt.rows), stmt.method, stmt.is_scanned,
            stmt.extraction_time_s,
        )

    # ── Step 7: Cache result ─────────────────────────────────────
    _save_cache(cache_key, _result_to_dict(result))

    return result
