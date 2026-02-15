"""
Financial Data — CRUD for financial statements and line items.
Bridges the PDF extractor output → database storage → UI display.

Includes:
  • create_stock_profile  — quick stock creation from this manager
  • upload_financial_statement — end-to-end PDF → extract → validate → save
  • get_stock_financials   — structured dict of all statements + items
  • calculate_metrics      — key ratios across Income / Balance / CashFlow
  • save / edit / delete helpers
"""

import json
import time
from typing import Any, Dict, List, Optional

import pandas as pd

from stock_analysis.database.analysis_db import AnalysisDatabase
from stock_analysis.models.financial_extractor import FinancialPDFExtractor
from stock_analysis.config import STATEMENT_TYPES, FINANCIAL_LINE_ITEM_CODES

# ── AI-type → legacy type mapping ────────────────────────────────────
_AI_TYPE_TO_LEGACY = {
    "income_statement": "income",
    "balance_sheet": "balance",
    "cash_flow": "cashflow",
}


class FinancialDataManager:
    """High-level CRUD for financial statements & line items."""

    def __init__(self, db: Optional[AnalysisDatabase] = None):
        self.db = db or AnalysisDatabase()

    # ──────────────────────────────────────────────────────────────────
    # Stock-profile quick-create (convenience wrapper)
    # ──────────────────────────────────────────────────────────────────
    def create_stock_profile(
        self, user_id: int, symbol: str, company_data: Dict[str, Any]
    ) -> int:
        """Create a new stock analysis profile. Returns stock_id."""
        existing = self.db.get_stock_by_symbol(user_id, symbol)
        if existing:
            raise Exception(
                f"Stock {symbol} already exists in your analysis portfolio"
            )

        stock_id = self.db.execute_update(
            """INSERT INTO analysis_stocks
               (user_id, symbol, company_name, exchange, currency,
                sector, industry, country, description, website,
                created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                user_id,
                symbol.upper(),
                company_data["name"],
                company_data.get("exchange", "NYSE"),
                company_data.get("currency", "USD"),
                company_data.get("sector"),
                company_data.get("industry"),
                company_data.get("country"),
                company_data.get("description", ""),
                company_data.get("website", ""),
                int(time.time()),
                int(time.time()),
            ),
        )

        self._log_audit(
            user_id, "CREATE", "stock", stock_id,
            None, json.dumps(company_data),
        )
        return stock_id

    # ──────────────────────────────────────────────────────────────────
    # End-to-end upload workflow
    # ──────────────────────────────────────────────────────────────────
    def upload_financial_statement(
        self,
        stock_id: int,
        statement_type: str,
        *,
        pdf_file=None,
        pdf_path: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        source_filename: Optional[str] = None,
        user_id: int = 1,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upload PDF → AI Vision Extract → Validate → Save.

        Delegates to ``upload_full_report`` (AI Vision) and returns
        the result for the requested *statement_type* only.
        """
        result = self.upload_full_report(
            stock_id,
            pdf_file=pdf_file,
            pdf_path=pdf_path,
            fiscal_year=fiscal_year,
            source_filename=source_filename,
            user_id=user_id,
            api_key=api_key,
        )

        if not result.get("success"):
            return result

        # Find the requested statement_type among the extracted ones
        for stmt in result.get("statements", []):
            if stmt.get("statement_type") == statement_type:
                return {
                    "success": True,
                    "statement_id": stmt.get("statement_id"),
                    "validation": stmt.get("validation", {}),
                    "requires_review": stmt.get("requires_review", False),
                    "extracted_data": stmt.get("extracted_data", {}),
                }

        # Statement type not found in PDF
        detected = result.get("detected_types", [])
        return {
            "success": False,
            "error": (
                f"Requested '{statement_type}' statement was not found. "
                f"AI detected: {', '.join(detected) or 'none'}."
            ),
        }

    # ──────────────────────────────────────────────────────────────────
    # AI Vision helpers
    # ──────────────────────────────────────────────────────────────────
    @staticmethod
    def _resolve_period_label(raw_period) -> Optional[str]:
        """Extract a usable string label from a period that may be a
        dict ``{"label": "2025-12-31", "col_name": "2025"}`` or a plain
        string."""
        if raw_period is None:
            return None
        if isinstance(raw_period, dict):
            return (
                raw_period.get("label")
                or raw_period.get("col_name")
                or str(raw_period)
            )
        return str(raw_period)

    @staticmethod
    def _year_and_date(period_label: Optional[str]):
        """Return ``(fiscal_year, period_end_date)`` from a label."""
        import re as _re
        if not period_label:
            return None, None
        m = _re.search(r"(\d{4})", period_label)
        fiscal_year = int(m.group(1)) if m else None
        if _re.match(r"\d{4}-\d{2}-\d{2}", period_label):
            period_end_date = period_label
        elif fiscal_year:
            period_end_date = f"{fiscal_year}-12-31"
        else:
            period_end_date = None
        return fiscal_year, period_end_date

    @staticmethod
    def _convert_ai_vision_to_legacy(
        ai_result: Dict[str, Any],
        period_mode: str = "both",
    ) -> List[Dict[str, Any]]:
        """Convert ``ai_extract_financials()`` output → list of
        legacy-shaped dicts that ``_save_financial_statement`` and the
        review UI expect.

        *period_mode* controls which columns are saved:

        * ``"both"``     — one entry per period detected (e.g. 2025 **and** 2024).
        * ``"latest"``   — only the most-recent period.
        * ``"previous"`` — only the second / older period.

        Each item has: statement_type, fiscal_year, period_end_date,
        confidence_score, line_items=[{code, name, amount, is_total}].
        """
        legacy: List[Dict[str, Any]] = []
        statements = ai_result.get("statements", {})
        if not statements:
            return legacy

        for ai_type, stmt_data in statements.items():
            legacy_type = _AI_TYPE_TO_LEGACY.get(ai_type, ai_type)
            items = stmt_data.get("items", [])
            periods = stmt_data.get("periods", [])

            # Resolve all period labels
            all_labels = [
                FinancialDataManager._resolve_period_label(p)
                for p in periods
            ]
            all_labels = [l for l in all_labels if l]  # drop None

            # Decide which period(s) to emit
            if period_mode == "latest":
                target_labels = all_labels[:1]
            elif period_mode == "previous":
                target_labels = all_labels[1:2] if len(all_labels) > 1 else all_labels[:1]
            else:  # "both"
                target_labels = all_labels if all_labels else [None]

            for period_label in target_labels:
                fiscal_year, period_end_date = (
                    FinancialDataManager._year_and_date(period_label)
                )

                # Flatten items → legacy line_items for this period
                line_items: List[Dict[str, Any]] = []
                for item in items:
                    key = item.get("key", "UNKNOWN")
                    label = item.get("label_raw", key)
                    values = item.get("values", {})
                    is_total = item.get("is_total", False)

                    amount = None
                    if period_label and period_label in values:
                        amount = values[period_label]
                    elif values:
                        amount = next(iter(values.values()), None)
                    if amount is None:
                        amount = 0.0

                    code = key.upper()
                    line_items.append({
                        "code": code,
                        "name": label,
                        "amount": float(amount) if amount is not None else 0.0,
                        "is_total": is_total,
                    })

                legacy.append({
                    "statement_type": legacy_type,
                    "fiscal_year": fiscal_year,
                    "period_end_date": period_end_date,
                    "confidence_score": 0.85,
                    "line_items": line_items,
                })

        return legacy

    def upload_full_report(
        self,
        stock_id: int,
        *,
        pdf_file=None,
        pdf_path: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        source_filename: Optional[str] = None,
        user_id: int = 1,
        progress_callback=None,
        api_key: Optional[str] = None,
        period_mode: str = "both",
    ) -> Dict[str, Any]:
        """Upload a full financial report PDF → AI Vision extraction.

        *period_mode* — ``"both"`` | ``"latest"`` | ``"previous"``
        controls which financial period(s) from the PDF are saved.

        Uses ``ai_extract_financials()`` (Gemini Vision) to render
        pages as images, classify statement types, and extract
        structured financial data — **no OCR step required**.

        Returns::

            {
                "success": True,
                "statements": [
                    {
                        "statement_type": "income",
                        "statement_id": 42,
                        "validation": {...},
                        "extracted_data": {...},
                        "requires_review": True,
                    },
                    ...
                ],
                "detected_types": ["income", "balance", "cashflow"],
                "ai_result": { … raw AI vision output … },
            }
        """
        import os, tempfile

        from stock_analysis.extraction.ai_vision_extractor import (
            ai_extract_financials,
        )

        # --- resolve file path ---
        _tmp_path: Optional[str] = None
        if pdf_file is not None:
            suffix = ".pdf"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(pdf_file.read())
                _tmp_path = tmp.name
            actual_path = _tmp_path
            source_filename = source_filename or getattr(pdf_file, "name", "upload.pdf")
        elif pdf_path is not None:
            actual_path = pdf_path
            source_filename = source_filename or os.path.basename(pdf_path)
        else:
            return {"success": False, "error": "No PDF provided."}

        try:
            # 1) AI Vision extraction — renders pages as images and
            #    sends them directly to Gemini Vision (no OCR/text step)
            if progress_callback:
                progress_callback("🧠 AI Vision: rendering pages…", 0.05)

            ai_result = ai_extract_financials(
                pdf_path=actual_path,
                api_key=api_key,
                user_id=user_id,
                stock_id=stock_id,
            )

            if progress_callback:
                progress_callback("🧠 AI Vision: extraction complete, processing…", 0.60)

            ai_status = ai_result.get("status", "failed")
            if ai_status == "failed" and not ai_result.get("statements"):
                return {
                    "success": False,
                    "error": (
                        "AI Vision could not extract any financial "
                        "statements from this PDF. "
                        + "; ".join(ai_result.get("flags", []))
                    ),
                    "ai_result": ai_result,
                }

            # 2) Convert AI format → legacy format for DB + UI
            all_stmts = self._convert_ai_vision_to_legacy(ai_result, period_mode)
            if not all_stmts:
                return {
                    "success": False,
                    "error": "AI Vision returned no statement data.",
                    "ai_result": ai_result,
                }

            # 3) Validate and save each detected statement
            results: List[Dict[str, Any]] = []
            detected_types: List[str] = []
            total = len(all_stmts)

            for idx, stmt_data in enumerate(all_stmts):
                stype = stmt_data.get("statement_type", "unknown")
                detected_types.append(stype)

                if progress_callback:
                    pct = 0.60 + 0.35 * ((idx + 1) / total)
                    progress_callback(
                        f"Saving {stype} statement ({idx + 1}/{total})…",
                        pct,
                    )

                # Override fiscal year if caller specified
                if fiscal_year is not None:
                    stmt_data["fiscal_year"] = fiscal_year
                    if not stmt_data.get("period_end_date"):
                        stmt_data["period_end_date"] = f"{fiscal_year}-12-31"

                # Build validation dict from AI validations
                ai_vals = [
                    v for v in ai_result.get("validations", [])
                    if v.get("statement_type") == _AI_TYPE_TO_LEGACY.get(stype, stype)
                    or v.get("statement_type") == stype
                ]
                validation = {
                    "is_valid": all(v.get("passed", True) for v in ai_vals),
                    "errors": [],
                    "warnings": [
                        f"{v.get('rule_name', '?')}: expected={v.get('expected')}, "
                        f"actual={v.get('actual')}, diff={v.get('diff')}"
                        for v in ai_vals if not v.get("passed", True)
                    ],
                }

                stmt_id = self._save_financial_statement(
                    stock_id=stock_id,
                    statement_type=stype,
                    extracted_data=stmt_data,
                    source_file=source_filename or "upload.pdf",
                    confidence_score=stmt_data.get("confidence_score", 0.85),
                )

                results.append({
                    "statement_type": stype,
                    "statement_id": stmt_id,
                    "validation": validation,
                    "extracted_data": stmt_data,
                    "requires_review": (
                        ai_status == "needs_review"
                        or len(validation.get("warnings", [])) > 0
                    ),
                })

            if progress_callback:
                progress_callback("Done! ✅", 1.0)

            return {
                "success": True,
                "statements": results,
                "detected_types": detected_types,
                "ai_result": ai_result,
            }

        except Exception as exc:
            err = str(exc)
            is_rate_limit = any(
                kw in err.lower()
                for kw in ("429", "quota", "rate limit", "resource has been exhausted")
            )
            return {
                "success": False,
                "error": err,
                "rate_limited": is_rate_limit,
            }
        finally:
            if _tmp_path:
                try:
                    os.unlink(_tmp_path)
                except OSError:
                    pass

    # ──────────────────────────────────────────────────────────────────
    # Internal: save statement + line items
    # ──────────────────────────────────────────────────────────────────
    def _save_financial_statement(
        self,
        stock_id: int,
        statement_type: str,
        extracted_data: Dict[str, Any],
        source_file: str,
        confidence_score: float,
    ) -> int:
        """Persist statement header + line items. Returns statement_id.

        Uses explicit SELECT→UPDATE/INSERT instead of INSERT OR REPLACE
        to avoid FOREIGN KEY constraint failures (SQLite's REPLACE
        internally DELETEs the parent row first, which violates FKs
        from financial_line_items).
        """

        # ── Verify stock exists BEFORE insert ──
        stock_check = self.db.execute_query(
            "SELECT id FROM analysis_stocks WHERE id = ?",
            (stock_id,),
        )
        if not stock_check:
            raise ValueError(
                f"Cannot save statement: Stock ID {stock_id} does not exist. "
                "Please create a stock profile first."
            )

        # Check if a statement already exists for this stock/type/period
        # Match by period_end_date first, fall back to fiscal_year so
        # re-uploading the same year always overwrites.
        try:
            existing = self.db.execute_query(
                """SELECT id FROM financial_statements
                   WHERE stock_id = ? AND statement_type = ? AND period_end_date = ?""",
                (stock_id, statement_type, extracted_data["period_end_date"]),
            )
            if not existing:
                existing = self.db.execute_query(
                    """SELECT id FROM financial_statements
                       WHERE stock_id = ? AND statement_type = ? AND fiscal_year = ?""",
                    (stock_id, statement_type, extracted_data["fiscal_year"]),
                )

            if existing:
                # UPDATE existing row (avoids DELETE that breaks FK constraints)
                statement_id = existing[0]["id"]
                self.db.execute_update(
                    """UPDATE financial_statements
                       SET fiscal_year = ?, fiscal_quarter = ?,
                           period_end_date = ?,
                           filing_date = ?, source_file = ?,
                           extracted_by = 'gemini', confidence_score = ?,
                           created_at = ?
                       WHERE id = ?""",
                    (
                        extracted_data["fiscal_year"],
                        extracted_data.get("fiscal_quarter"),
                        extracted_data["period_end_date"],
                        extracted_data.get("filing_date"),
                        source_file,
                        confidence_score,
                        int(time.time()),
                        statement_id,
                    ),
                )
            else:
                # INSERT new row
                statement_id = self.db.execute_update(
                    """INSERT INTO financial_statements
                       (stock_id, statement_type, fiscal_year, fiscal_quarter,
                        period_end_date, filing_date, source_file,
                        extracted_by, confidence_score, created_at)
                       VALUES (?,?,?,?,?,?,?,'gemini',?,?)""",
                    (
                        stock_id,
                        statement_type,
                        extracted_data["fiscal_year"],
                        extracted_data.get("fiscal_quarter"),
                        extracted_data["period_end_date"],
                        extracted_data.get("filing_date"),
                        source_file,
                        confidence_score,
                        int(time.time()),
                    ),
                )

            # Remove prior line items (safe now — statement row still exists)
            self.db.delete_line_items_for_statement(statement_id)

            # Insert line items (use .get() to guard against missing keys
            # — Gemini may occasionally omit 'amount' or 'code').
            for item in extracted_data.get("line_items", []):
                code = item.get("code") or item.get("name", "UNKNOWN").upper().replace(" ", "_")
                amount = item.get("amount") or item.get("value") or 0.0
                if isinstance(amount, str):
                    try:
                        amount = float(amount.replace(",", ""))
                    except (ValueError, TypeError):
                        amount = 0.0
                elif amount is None:
                    amount = 0.0
                else:
                    try:
                        amount = float(amount)
                    except (ValueError, TypeError):
                        amount = 0.0
                self.db.execute_update(
                    """INSERT INTO financial_line_items
                       (statement_id, line_item_code, line_item_name,
                        amount, currency, order_index, parent_item_id, is_total)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (
                        statement_id,
                        code,
                        item.get("name", code),
                        amount,
                        extracted_data.get("currency", "USD"),
                        item.get("order", 0),
                        None,
                        item.get("is_total", False),
                    ),
                )

            return statement_id

        except Exception as e:
            err_msg = str(e).upper()
            if "FOREIGN KEY" in err_msg or "INTEGRITY" in err_msg or "VIOLATES" in err_msg:
                raise ValueError(
                    f"Database integrity error: Stock ID {stock_id} missing. "
                    "Please recreate the stock profile and try again."
                ) from e
            raise

    # ──────────────────────────────────────────────────────────────────
    def save_extracted_data(
        self,
        stock_id: int,
        extracted_data: Dict[str, Any],
        source_file: Optional[str] = None,
        user_id: int = 1,
    ) -> int:
        """Persist Gemini-extracted data → financial_statements + line_items.

        Returns the statement_id.
        """
        stmt_id = self._save_financial_statement(
            stock_id=stock_id,
            statement_type=extracted_data["statement_type"],
            extracted_data=extracted_data,
            source_file=source_file or "manual",
            confidence_score=extracted_data.get("confidence_score", 0.9),
        )

        self.db.log_audit(
            user_id, "INSERT", "statement", stmt_id,
            new_value=json.dumps({
                "type": extracted_data["statement_type"],
                "year": extracted_data["fiscal_year"],
                "items": len(extracted_data.get("line_items", [])),
            }),
        )
        return stmt_id

    # ──────────────────────────────────────────────────────────────────
    # Query helpers
    # ──────────────────────────────────────────────────────────────────
    def get_statements(
        self, stock_id: int, statement_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        return self.db.get_financial_statements(stock_id, statement_type)

    def get_statement_with_items(
        self, statement_id: int
    ) -> Dict[str, Any]:
        """Return statement header + nested line_items list."""
        rows = self.db.execute_query(
            "SELECT * FROM financial_statements WHERE id = ?",
            (statement_id,),
        )
        if not rows:
            raise ValueError(f"Statement {statement_id} not found")
        stmt = dict(rows[0])
        stmt["line_items"] = self.db.get_line_items(statement_id)
        return stmt

    def get_line_items_df(self, statement_id: int) -> pd.DataFrame:
        """Return line items for a statement as a DataFrame."""
        items = self.db.get_line_items(statement_id)
        if not items:
            return pd.DataFrame()
        df = pd.DataFrame(items)
        df["display_name"] = df["line_item_code"].map(
            FINANCIAL_LINE_ITEM_CODES
        ).fillna(df["line_item_name"])
        return df

    # ──────────────────────────────────────────────────────────────────
    # Structured financials (dict by type → period → items)
    # ──────────────────────────────────────────────────────────────────
    def get_stock_financials(
        self, stock_id: int, statement_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Retrieve all financial statements for a stock as a nested dict.

        Structure:
            { "income": { "2023": { "statement_id": …, "items": { CODE: {...} } } }, … }
        """
        statements = self.db.get_financial_statements(stock_id, statement_type)
        result: Dict[str, Any] = {}

        for stmt in statements:
            stmt_id = stmt["id"]
            stmt_type = stmt["statement_type"]
            fq = stmt.get("fiscal_quarter")
            period_key = f"{stmt['fiscal_year']}"
            if fq:
                period_key = f"{stmt['fiscal_year']}Q{fq}"

            line_items = self.db.get_line_items(stmt_id)
            items_dict = {
                item["line_item_code"]: {
                    "name": item["line_item_name"],
                    "amount": item["amount"],
                    "currency": item["currency"],
                    "order": item["order_index"],
                    "is_total": item["is_total"],
                    "manually_edited": item["manually_edited"],
                }
                for item in line_items
            }

            result.setdefault(stmt_type, {})[period_key] = {
                "statement_id": stmt_id,
                "period_end": stmt["period_end_date"],
                "fiscal_year": stmt["fiscal_year"],
                "fiscal_quarter": fq,
                "filing_date": stmt.get("filing_date"),
                "confidence": stmt.get("confidence_score"),
                "verified": stmt.get("verified_by_user"),
                "items": items_dict,
            }

        return result

    # ──────────────────────────────────────────────────────────────────
    # Multi-period comparison pivot
    # ──────────────────────────────────────────────────────────────────
    def get_comparison_df(
        self, stock_id: int, statement_type: str
    ) -> pd.DataFrame:
        """Build a pivot table: rows = line items, columns = periods."""
        stmts = self.db.get_financial_statements(stock_id, statement_type)
        if not stmts:
            return pd.DataFrame()

        frames = []
        for st in stmts:
            items = self.db.get_line_items(st["id"])
            for it in items:
                frames.append({
                    "code": it["line_item_code"],
                    "name": it["line_item_name"],
                    "order": it["order_index"],
                    "period": st["period_end_date"],
                    "amount": it["amount"],
                })
        if not frames:
            return pd.DataFrame()

        df = pd.DataFrame(frames)
        pivot = df.pivot_table(
            index=["order", "code", "name"],
            columns="period",
            values="amount",
            aggfunc="first",
        ).reset_index()
        pivot.sort_values("order", inplace=True)
        pivot.drop(columns=["order"], inplace=True)
        return pivot

    # ──────────────────────────────────────────────────────────────────
    # Calculate key metrics
    # ──────────────────────────────────────────────────────────────────
    def calculate_metrics(self, stock_id: int) -> Dict[str, Any]:
        """Calculate key financial metrics and ratios.

        Returns dict keyed by period label with ratios per period.
        """
        financials = self.get_stock_financials(stock_id)
        metrics: Dict[str, Any] = {}

        # ── Income statement ratios ────────────────────────────────────
        if "income" in financials:
            periods = sorted(financials["income"].keys(), reverse=True)[:5]
            for period in periods:
                items = financials["income"][period]["items"]
                revenue = items.get("REVENUE", {}).get("amount", 0)
                net_income = items.get("NET_INCOME", {}).get("amount", 0)
                gross_profit = items.get("GROSS_PROFIT", {}).get("amount", 0)
                oper_income = items.get("OPERATING_INCOME", {}).get("amount", 0)

                metrics[period] = {
                    "revenue": revenue,
                    "net_income": net_income,
                    "gross_profit": gross_profit,
                    "operating_income": oper_income,
                    "net_margin": (net_income / revenue * 100) if revenue else 0,
                    "gross_margin": (gross_profit / revenue * 100) if revenue else 0,
                    "operating_margin": (oper_income / revenue * 100) if revenue else 0,
                }

        # ── Balance sheet ratios ───────────────────────────────────────
        if "balance" in financials:
            for period in financials["balance"]:
                if period not in metrics:
                    metrics[period] = {}
                items = financials["balance"][period]["items"]
                total_assets = items.get("TOTAL_ASSETS", {}).get("amount", 0)
                total_equity = items.get("TOTAL_EQUITY", {}).get("amount", 0)
                total_liab = items.get("TOTAL_LIABILITIES", {}).get("amount", 0)
                cash = items.get("CASH_EQUIVALENTS", {}).get("amount", 0)
                ni = metrics.get(period, {}).get("net_income", 0)

                metrics[period].update({
                    "total_assets": total_assets,
                    "total_equity": total_equity,
                    "total_liabilities": total_liab,
                    "cash": cash,
                    "roe": (ni / total_equity * 100) if total_equity else 0,
                    "roa": (ni / total_assets * 100) if total_assets else 0,
                    "debt_to_equity": (total_liab / total_equity) if total_equity else 0,
                    "cash_ratio": (cash / total_liab * 100) if total_liab else 0,
                })

        # ── Cash flow metrics ──────────────────────────────────────────
        if "cashflow" in financials:
            for period in financials["cashflow"]:
                if period not in metrics:
                    metrics[period] = {}
                items = financials["cashflow"][period]["items"]
                cfo = items.get("CASH_FROM_OPERATIONS", {}).get("amount", 0)
                capex = (
                    items.get("CAPITAL_EXPENDITURES", {}).get("amount", 0)
                    or items.get("CAPEX", {}).get("amount", 0)
                )
                fcf = cfo + capex  # capex is typically negative

                metrics[period].update({
                    "cash_from_operations": cfo,
                    "capex": capex,
                    "free_cash_flow": fcf,
                })

        return metrics

    # ──────────────────────────────────────────────────────────────────
    # Editing helpers
    # ──────────────────────────────────────────────────────────────────
    def update_line_item(
        self,
        item_id: int,
        user_id: int,
        new_amount: float,
        new_name: Optional[str] = None,
    ) -> None:
        """Update a line item (manual correction by user)."""
        old = self.db.execute_query(
            "SELECT amount, line_item_name FROM financial_line_items WHERE id = ?",
            (item_id,),
        )

        self.db.execute_update(
            """UPDATE financial_line_items
               SET amount = ?, line_item_name = ?,
                   manually_edited = 1,
                   edited_by_user_id = ?, edited_at = ?
               WHERE id = ?""",
            (
                new_amount,
                new_name if new_name else (old[0]["line_item_name"] if old else ""),
                user_id,
                int(time.time()),
                item_id,
            ),
        )

        # Mark parent statement as user-verified
        self.db.execute_update(
            """UPDATE financial_statements SET verified_by_user = 1
               WHERE id IN (
                   SELECT statement_id FROM financial_line_items WHERE id = ?
               )""",
            (item_id,),
        )

        self._log_audit(
            user_id, "UPDATE", "line_item", item_id,
            json.dumps({"old_amount": old[0]["amount"] if old else None}),
            json.dumps({"new_amount": new_amount}),
        )

    def update_line_item_amount(
        self, item_id: int, new_amount: float, user_id: int = 1
    ) -> None:
        """Convenience alias for update_line_item (amount only)."""
        self.update_line_item(item_id, user_id, new_amount)

    def mark_statement_verified(
        self, statement_id: int, user_id: int = 1
    ) -> None:
        """Mark a statement as user-verified."""
        self.db.execute_update(
            "UPDATE financial_statements SET verified_by_user = 1 WHERE id = ?",
            (statement_id,),
        )
        self.db.log_audit(
            user_id, "UPDATE", "statement", statement_id,
            new_value="verified_by_user=True",
        )

    # ──────────────────────────────────────────────────────────────────
    # Delete
    # ──────────────────────────────────────────────────────────────────
    def delete_statement(
        self, statement_id: int, user_id: int = 1
    ) -> None:
        self.db.delete_line_items_for_statement(statement_id)
        self.db.execute_update(
            "DELETE FROM financial_statements WHERE id = ?",
            (statement_id,),
        )
        self.db.log_audit(
            user_id, "DELETE", "statement", statement_id,
        )

    # ──────────────────────────────────────────────────────────────────
    # Available periods
    # ──────────────────────────────────────────────────────────────────
    def available_periods(
        self, stock_id: int, statement_type: str
    ) -> List[str]:
        """Return sorted list of period_end_date strings."""
        rows = self.db.execute_query(
            """SELECT DISTINCT period_end_date
               FROM financial_statements
               WHERE stock_id = ? AND statement_type = ?
               ORDER BY period_end_date""",
            (stock_id, statement_type),
        )
        return [r["period_end_date"] for r in rows]

    # ──────────────────────────────────────────────────────────────────
    # Audit helper
    # ──────────────────────────────────────────────────────────────────
    def _log_audit(
        self,
        user_id: int,
        operation: str,
        entity_type: str,
        entity_id: int,
        old_value: Optional[str],
        new_value: Optional[str],
    ) -> None:
        self.db.execute_update(
            """INSERT INTO analysis_audit_log
               (user_id, operation, entity_type, entity_id,
                old_value, new_value, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (user_id, operation, entity_type, entity_id,
             old_value, new_value, int(time.time())),
        )

    # ──────────────────────────────────────────────────────────────────
    # Per-user Gemini quota tracking
    # ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _get_db_helpers():
        """Import db_layer helpers lazily to avoid circular imports."""
        import sys, os
        repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if repo not in sys.path:
            sys.path.insert(0, repo)
        from db_layer import get_conn, convert_sql, convert_params, is_postgres
        return get_conn, convert_sql, convert_params, is_postgres

    @staticmethod
    def get_user_gemini_key(user_id: int) -> Optional[str]:
        """Retrieve and decrypt the user's Gemini API key.

        Resolution order:
          1. Encrypted column (``gemini_api_key_encrypted``)
          2. Legacy plaintext column (``gemini_api_key``)
          3. ``None``
        """
        get_conn, convert_sql, convert_params, is_postgres = FinancialDataManager._get_db_helpers()
        try:
            conn = get_conn()
            sql = convert_sql(
                "SELECT gemini_api_key_encrypted, gemini_api_key FROM users WHERE id = ?"
            )
            if is_postgres():
                from psycopg2.extras import RealDictCursor
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(sql, convert_params((user_id,)))
                row = cur.fetchone()
            else:
                cur = conn.cursor()
                cur.execute(sql, (user_id,))
                row = cur.fetchone()
            conn.close()
            if not row:
                return None

            enc_key = row['gemini_api_key_encrypted'] if isinstance(row, dict) else row[0]
            plain_key = row['gemini_api_key'] if isinstance(row, dict) else row[1]

            # Try encrypted first
            if enc_key:
                try:
                    from stock_analysis.utils.encryption import decrypt_api_key
                    decrypted = decrypt_api_key(enc_key)
                    if decrypted:
                        return decrypted
                except Exception:
                    pass

            # Fall back to plaintext
            if plain_key and not str(plain_key).startswith("your_"):
                return plain_key
        except Exception:
            pass
        return None

    @staticmethod
    def increment_user_quota(user_id: int) -> None:
        """Bump daily Gemini usage counter for *user_id*."""
        get_conn, convert_sql, convert_params, is_postgres = FinancialDataManager._get_db_helpers()
        today = int(time.time() / 86400)  # days since epoch
        try:
            conn = get_conn()
            sql = convert_sql(
                "SELECT gemini_quota_reset_at, gemini_requests_today FROM users WHERE id = ?"
            )
            if is_postgres():
                from psycopg2.extras import RealDictCursor
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(sql, convert_params((user_id,)))
                row = cur.fetchone()
            else:
                cur = conn.cursor()
                cur.execute(sql, (user_id,))
                row = cur.fetchone()
            if row:
                last_reset = (row['gemini_quota_reset_at'] if isinstance(row, dict) else row[0]) or 0
                reqs = (row['gemini_requests_today'] if isinstance(row, dict) else row[1]) or 0
                if last_reset < today:
                    reqs = 0  # new day — reset
                upd_sql = convert_sql(
                    "UPDATE users SET gemini_requests_today = ?, gemini_quota_reset_at = ? WHERE id = ?"
                )
                conn.cursor().execute(upd_sql, convert_params((reqs + 1, today, user_id)))
                conn.commit()
            conn.close()
        except Exception:
            pass

    @staticmethod
    def get_user_quota_remaining(user_id: int, daily_limit: int = 50) -> int:
        """Return how many free-tier requests remain today."""
        get_conn, convert_sql, convert_params, is_postgres = FinancialDataManager._get_db_helpers()
        try:
            conn = get_conn()
            sql = convert_sql(
                "SELECT gemini_quota_reset_at, gemini_requests_today FROM users WHERE id = ?"
            )
            if is_postgres():
                from psycopg2.extras import RealDictCursor
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(sql, convert_params((user_id,)))
                row = cur.fetchone()
            else:
                cur = conn.cursor()
                cur.execute(sql, (user_id,))
                row = cur.fetchone()
            conn.close()
            if row:
                today = int(time.time() / 86400)
                last_reset = (row['gemini_quota_reset_at'] if isinstance(row, dict) else row[0]) or 0
                reqs = (row['gemini_requests_today'] if isinstance(row, dict) else row[1]) or 0
                if last_reset < today:
                    reqs = 0
                return max(0, daily_limit - reqs)
        except Exception:
            pass
        return daily_limit
