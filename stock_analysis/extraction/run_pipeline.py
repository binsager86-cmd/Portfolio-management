"""
CLI runner for the tiered extraction pipeline.

Usage::

    python -m stock_analysis.extraction.run_pipeline path/to/annual_report.pdf \\
        --user-id 1 --stock-id 42 --api-key AIza...

If ``--api-key`` is omitted the ``GEMINI_API_KEY`` env-var is used.
"""

import argparse
import json
import logging
import os
import sys

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

from stock_analysis.extraction.pipeline import ExtractionPipeline


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the tiered financial-statement extraction pipeline.",
    )
    parser.add_argument("pdf", help="Path to the PDF file to process.")
    parser.add_argument("--user-id", type=int, default=1, help="User ID (default: 1)")
    parser.add_argument("--stock-id", type=int, default=1, help="Stock ID (default: 1)")
    parser.add_argument("--api-key", default="", help="Gemini API key (overrides env)")
    parser.add_argument(
        "--statements",
        nargs="+",
        default=["income", "balance", "cashflow", "equity"],
        help="Statement types to extract (default: all four)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable DEBUG logging",
    )
    args = parser.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )

    if not os.path.isfile(args.pdf):
        print(f"ERROR: File not found: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    api_key = args.api_key or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        print("WARNING: No Gemini API key provided — LLM mapping step will fail.",
              file=sys.stderr)

    pipeline = ExtractionPipeline(api_key=api_key)

    print(f"\n📄  Processing: {args.pdf}")
    print(f"    Statements: {', '.join(args.statements)}\n")

    result = pipeline.run(
        pdf_path=args.pdf,
        user_id=args.user_id,
        stock_id=args.stock_id,
        statement_types=args.statements,
    )

    # Print summary
    print("=" * 60)
    print(f"  Status     : {result['status']}")
    print(f"  Upload ID  : {result['upload_id']}")
    print(f"  PDF Type   : {result['pdf_type']}")

    for key, label in [
        ("income_statement", "Income Statement"),
        ("balance_sheet", "Balance Sheet"),
        ("cash_flow", "Cash Flow"),
    ]:
        stmt = result.get("statements", {}).get(key, {})
        n_periods = len(stmt.get("periods", []))
        n_items = sum(len(p.get("items", [])) for p in stmt.get("periods", []))
        print(f"  {label:20s}: {n_periods} period(s), {n_items} line items")

    validations = result.get("validations", [])
    n_pass = sum(1 for v in validations if v.get("pass_fail") == "pass")
    n_fail = sum(1 for v in validations if v.get("pass_fail") == "fail")
    print(f"  Validations        : {n_pass} passed, {n_fail} failed")

    if result.get("flags"):
        print(f"  Flags              : {', '.join(result['flags'])}")

    timings = result.get("timings", {})
    if timings:
        print(f"  Total time         : {timings.get('total', '?')}s")

    print("=" * 60)

    # Full JSON to stdout for piping / debugging
    print("\n" + json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
