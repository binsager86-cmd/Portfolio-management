"""
Tiered Financial Statement Extraction Pipeline
================================================
Replaces OCR-first extraction with a fast, deterministic pipeline:

    classify → locate pages → extract tables → LLM map → validate → store

Modules:
    pdf_classifier    — detect text/scanned/mixed, find statement pages
    table_extractor   — Camelot → pdfplumber → OCR fallback
    llm_mapper        — Gemini-based table → normalized schema mapping
    validators        — accounting balance checks with tolerance
    storage           — persist raw + normalized + validation results
    pipeline          — orchestrates the full flow
"""

def __getattr__(name):
    """Lazy import so lightweight consumers (e.g. tests) don't need all deps."""
    if name == "ExtractionPipeline":
        from stock_analysis.extraction.pipeline import ExtractionPipeline
        return ExtractionPipeline
    if name == "extract_financials_from_pdf":
        from stock_analysis.extraction.scanned_extractor import extract_financials_from_pdf
        return extract_financials_from_pdf
    if name == "ai_extract_financials":
        from stock_analysis.extraction.ai_vision_extractor import ai_extract_financials
        return ai_extract_financials
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = ["ExtractionPipeline", "extract_financials_from_pdf", "ai_extract_financials"]
