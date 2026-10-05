"""Unit tests for the score tab's metric-recalculation cache."""

import time
import uuid

import pytest

from app.api.v1 import fundamental_legacy as fl
from app.core.database import exec_sql, query_val

pytestmark = pytest.mark.usefixtures("_init_test_db")


@pytest.fixture()
def stock(_init_test_db):
    """A stock with one statement and two line items; cache + counters reset."""
    fl._ensure_schema()
    now = int(time.time())
    exec_sql(
        "INSERT INTO analysis_stocks (user_id, symbol, company_name, exchange, currency, created_at, updated_at) "
        "VALUES (1, ?, 'Cache Test Co', 'KSE', 'KWD', ?, ?)",
        (f"C{uuid.uuid4().hex[:10]}", now, now),
    )
    stock_id = query_val("SELECT MAX(id) FROM analysis_stocks")
    exec_sql(
        "INSERT INTO financial_statements (stock_id, statement_type, fiscal_year, period_end_date, created_at) "
        "VALUES (?, 'income', 2024, '2024-12-31', ?)",
        (stock_id, now),
    )
    stmt_id = query_val("SELECT MAX(id) FROM financial_statements")
    for code, amount in (("REVENUE", 1000.0), ("NET_INCOME", 100.0)):
        exec_sql(
            "INSERT INTO financial_line_items (statement_id, line_item_code, line_item_name, amount) VALUES (?,?,?,?)",
            (stmt_id, code, code, amount),
        )
    fl._METRICS_FRESH.pop(stock_id, None)
    return stock_id, stmt_id


@pytest.fixture()
def calls(monkeypatch):
    counter = {"metrics": 0, "growth": 0, "fail": False}

    def fake_metrics(*_a, **_k):
        counter["metrics"] += 1
        if counter["fail"]:
            raise RuntimeError("boom")

    def fake_growth(*_a, **_k):
        counter["growth"] += 1

    monkeypatch.setattr(fl, "_calculate_all_metrics", fake_metrics)
    monkeypatch.setattr(fl, "_calculate_growth", fake_growth)
    return counter


def test_recalculates_once_then_serves_cache(stock, calls):
    stock_id, _ = stock
    fl._ensure_metrics_fresh(stock_id)
    fl._ensure_metrics_fresh(stock_id)
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 1
    assert calls["growth"] == 1


def test_edited_amount_invalidates_cache(stock, calls):
    stock_id, stmt_id = stock
    fl._ensure_metrics_fresh(stock_id)
    exec_sql(
        "UPDATE financial_line_items SET amount = 1200 WHERE statement_id = ? AND line_item_code = 'REVENUE'",
        (stmt_id,),
    )
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 2


def test_offsetting_edits_are_still_detected(stock, calls):
    """Sum is unchanged (+50 / -50) but the weighted checksum differs."""
    stock_id, stmt_id = stock
    fl._ensure_metrics_fresh(stock_id)
    exec_sql("UPDATE financial_line_items SET amount = amount + 50 WHERE statement_id = ? AND line_item_code = 'REVENUE'", (stmt_id,))
    exec_sql("UPDATE financial_line_items SET amount = amount - 50 WHERE statement_id = ? AND line_item_code = 'NET_INCOME'", (stmt_id,))
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 2


def test_new_and_deleted_statements_invalidate_cache(stock, calls):
    stock_id, stmt_id = stock
    fl._ensure_metrics_fresh(stock_id)
    exec_sql(
        "INSERT INTO financial_statements (stock_id, statement_type, fiscal_year, period_end_date, created_at) "
        "VALUES (?, 'income', 2023, '2023-12-31', ?)",
        (stock_id, int(time.time())),
    )
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 1 + 2  # first run: 1 period, second run: 2 periods

    exec_sql("DELETE FROM financial_line_items WHERE statement_id = ?", (stmt_id,))
    before = calls["metrics"]
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] > before


def test_failed_run_is_not_cached(stock, calls):
    stock_id, _ = stock
    calls["fail"] = True
    fl._ensure_metrics_fresh(stock_id)
    calls["fail"] = False
    fl._ensure_metrics_fresh(stock_id)  # retried because the first run failed
    fl._ensure_metrics_fresh(stock_id)  # now cached
    assert calls["metrics"] == 2


def test_stocks_are_cached_independently(stock, calls):
    stock_id, _ = stock
    fl._METRICS_FRESH[stock_id + 9999] = "other"
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 1
    assert fl._METRICS_FRESH[stock_id + 9999] == "other"
