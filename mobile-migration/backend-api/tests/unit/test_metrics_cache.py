"""Unit tests for the score tab's metric-recalculation cache."""

import threading
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
    fl._store_metrics_fingerprint(stock_id + 9999, "other")
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 1
    assert fl._stored_metrics_fingerprint(stock_id + 9999) == "other"


def test_marker_is_stored_in_the_database_not_the_process(stock, calls):
    """Shared by all workers and surviving restarts: a fresh 'process' sees it."""
    stock_id, _ = stock
    fl._ensure_metrics_fresh(stock_id)
    assert fl._stored_metrics_fingerprint(stock_id) is not None
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 1


def test_formula_version_bump_recalculates(stock, calls, monkeypatch):
    stock_id, _ = stock
    fl._ensure_metrics_fresh(stock_id)
    monkeypatch.setattr(fl, "_METRICS_CALC_VERSION", fl._METRICS_CALC_VERSION + 1)
    fl._ensure_metrics_fresh(stock_id)
    assert calls["metrics"] == 2


def _metric_rows(stock_id):
    return fl.query_all(
        "SELECT metric_name, period_end_date, metric_value FROM stock_metrics WHERE stock_id = ? ORDER BY metric_name, period_end_date",
        (stock_id,),
    )


def test_batched_upserts_dedupe_chunk_and_update(stock):
    stock_id, _ = stock
    n = fl._METRIC_BATCH_CHUNK * 2 + 17  # forces several chunked statements
    with fl._batched_metric_writes():
        for i in range(n):
            fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", f"M{i}", float(i))
        fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", "M0", 111.0)  # last write wins
    rows = _metric_rows(stock_id)
    assert len(rows) == n
    assert dict((r[0], r[2]) for r in rows)["M0"] == 111.0

    # re-running updates in place instead of duplicating
    with fl._batched_metric_writes():
        for i in range(n):
            fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", f"M{i}", float(i) + 1)
    rows = _metric_rows(stock_id)
    assert len(rows) == n
    assert dict((r[0], r[2]) for r in rows)["M5"] == 6.0


def test_unbatched_upsert_inserts_then_updates(stock):
    stock_id, _ = stock
    fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", "Solo", 1.0)
    fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", "Solo", 2.0)
    rows = [r for r in _metric_rows(stock_id) if r[0] == "Solo"]
    assert len(rows) == 1 and rows[0][2] == 2.0


def test_flush_makes_buffered_writes_readable(stock):
    stock_id, _ = stock
    with fl._batched_metric_writes():
        fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", "Visible", 3.0)
        assert not [r for r in _metric_rows(stock_id) if r[0] == "Visible"]
        fl._flush_metric_writes()
        assert [r for r in _metric_rows(stock_id) if r[0] == "Visible"]


def test_buffered_writes_are_kept_when_the_body_raises(stock):
    stock_id, _ = stock
    with pytest.raises(RuntimeError), fl._batched_metric_writes():
        fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", "Kept", 4.0)
        raise RuntimeError("boom")
    assert [r for r in _metric_rows(stock_id) if r[0] == "Kept"]
    assert getattr(fl._metric_buf, "rows", None) is None  # batch closed


class _Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now


@pytest.fixture()
def yf(monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(fl.time, "time", clock)
    fl._YF_RISK_CACHE.clear()
    state = {"calls": 0, "result": {"Current Price": 10.0}}

    def live(_symbol):
        state["calls"] += 1
        return dict(state["result"])

    monkeypatch.setattr(fl, "_fetch_yfinance_risk_data_live", live)
    yield state, clock
    fl._YF_RISK_CACHE.clear()


def test_yahoo_success_is_cached(yf):
    state, clock = yf
    assert fl._fetch_yfinance_risk_data("AVGO") == {"Current Price": 10.0}
    clock.now += fl._YF_RISK_TTL - 1
    fl._fetch_yfinance_risk_data("AVGO")
    assert state["calls"] == 1
    clock.now += 2
    fl._fetch_yfinance_risk_data("AVGO")
    assert state["calls"] == 2


def test_yahoo_failure_is_remembered_briefly(yf):
    state, clock = yf
    state["result"] = {}
    assert fl._fetch_yfinance_risk_data("AVGO") == {}
    fl._fetch_yfinance_risk_data("AVGO")
    fl._fetch_yfinance_risk_data("AVGO")
    assert state["calls"] == 1  # not retried on every request
    clock.now += fl._YF_FAIL_TTL + 1
    fl._fetch_yfinance_risk_data("AVGO")
    assert state["calls"] == 2


def test_last_good_data_is_served_while_yahoo_is_down(yf):
    state, clock = yf
    fl._fetch_yfinance_risk_data("AVGO")
    state["result"] = {}
    clock.now += fl._YF_RISK_TTL + 1
    assert fl._fetch_yfinance_risk_data("AVGO") == {"Current Price": 10.0}  # stale but better than nothing
    fl._fetch_yfinance_risk_data("AVGO")
    assert state["calls"] == 2  # one failed retry, then backed off
    clock.now += fl._YF_STALE_MAX + 1
    assert fl._fetch_yfinance_risk_data("AVGO") == {}  # too old to trust


def test_concurrent_first_opens_recalculate_once(stock, calls, monkeypatch):
    stock_id, _ = stock
    counting = fl._calculate_all_metrics  # the `calls` fixture's counting fake

    def slow(*a, **k):
        time.sleep(0.2)  # keep the first request busy so the others arrive meanwhile
        return counting(*a, **k)

    monkeypatch.setattr(fl, "_calculate_all_metrics", slow)
    threads = [threading.Thread(target=fl._ensure_metrics_fresh, args=(stock_id,)) for _ in range(4)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert calls["metrics"] == 1  # one period, calculated once despite 4 simultaneous requests
