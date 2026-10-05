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
def sa(monkeypatch):
    """Cache tests: stockanalysis.com fetch replaced by a counter, clock controlled."""
    clock = _Clock()
    monkeypatch.setattr(fl.time, "time", clock)
    fl._SA_MARKET_CACHE.clear()
    state = {"calls": 0, "result": {"Current Price": 10.0, "Beta": 1.2}}

    def live(_symbol, _currency):
        state["calls"] += 1
        return dict(state["result"])

    monkeypatch.setattr(fl, "_fetch_stockanalysis_market_data_live", live)
    yield state, clock
    fl._SA_MARKET_CACHE.clear()


def test_market_data_success_is_cached(sa):
    state, clock = sa
    assert fl._fetch_stockanalysis_market_data("AVGO", "USD") == {"Current Price": 10.0, "Beta": 1.2}
    clock.now += fl._SA_MARKET_TTL - 1
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    assert state["calls"] == 1
    clock.now += 2
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    assert state["calls"] == 2


def test_market_data_failure_is_remembered_briefly(sa):
    state, clock = sa
    state["result"] = {}
    assert fl._fetch_stockanalysis_market_data("AVGO", "USD") == {}
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    assert state["calls"] == 1  # not retried on every request
    clock.now += fl._SA_FAIL_TTL + 1
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    assert state["calls"] == 2


def test_last_good_market_data_is_served_while_the_site_is_down(sa):
    state, clock = sa
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    state["result"] = {}
    clock.now += fl._SA_MARKET_TTL + 1
    assert fl._fetch_stockanalysis_market_data("AVGO", "USD") == {"Current Price": 10.0, "Beta": 1.2}
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    assert state["calls"] == 2  # one failed retry, then backed off
    clock.now += fl._SA_STALE_MAX + 1
    assert fl._fetch_stockanalysis_market_data("AVGO", "USD") == {}  # too old to trust


def test_market_data_cache_is_per_symbol_and_currency(sa):
    state, _ = sa
    fl._fetch_stockanalysis_market_data("NBK", "KWD")
    fl._fetch_stockanalysis_market_data("NBK", "USD")
    fl._fetch_stockanalysis_market_data("AVGO", "USD")
    assert state["calls"] == 3


# ── parsing (synthetic payload modelled on the SvelteKit structure that the existing
#    stockanalysis.com parsers in this module rely on - NOT captured live HTML) ──

class _Resp:
    def __init__(self, text, status=200):
        self.text, self.status_code = text, status


def _page(price="362.08", stats=None):
    stats = stats if stats is not None else '{id:"pe",title:"PE Ratio",value:"45.33",hover:"45.33"},{id:"beta",title:"Beta (5Y)",value:"1.48",hover:"1.4821"}'
    return ('<script>kit.start(app, element, {node_ids:[0], data: [{type:"data",data:{quote:{s:"AVGO",p:' + price
            + ',c:6.94},stats:[' + stats + ']}}], form: null});</script>')


@pytest.fixture()
def http(monkeypatch):
    import httpx
    seen = {"urls": []}
    state = {"resp": _Resp(_page())}

    def fake_get(url, **_k):
        seen["urls"].append(url)
        if isinstance(state["resp"], Exception):
            raise state["resp"]
        return state["resp"]

    monkeypatch.setattr(httpx, "get", fake_get)
    return seen, state


def test_parses_price_and_beta(http):
    assert fl._fetch_stockanalysis_market_data_live("AVGO", "USD") == {"Current Price": 362.08, "Beta": 1.4821}


def test_us_and_kuwait_urls(http):
    seen, _ = http
    fl._fetch_stockanalysis_market_data_live("AVGO", "USD")
    fl._fetch_stockanalysis_market_data_live("nbk.kw", "KWD")
    assert seen["urls"] == [
        "https://stockanalysis.com/stocks/avgo/statistics/",
        "https://stockanalysis.com/quote/kwse/NBK/statistics/",
    ]


def test_beta_found_by_title_when_id_differs(http):
    _, state = http
    state["resp"] = _Resp(_page(stats='{key:"x",title:"Beta (5Y)",value:"0.91"}'))
    assert fl._fetch_stockanalysis_market_data_live("NBK", "KWD")["Beta"] == 0.91


def test_missing_or_na_beta_is_omitted_not_zero(http):
    _, state = http
    state["resp"] = _Resp(_page(stats='{id:"beta",title:"Beta (5Y)",value:"n/a",hover:"n/a"}'))
    assert fl._fetch_stockanalysis_market_data_live("AVGO", "USD") == {"Current Price": 362.08}


@pytest.mark.parametrize("resp", [_Resp("", 404), _Resp("<html>no data</html>"), RuntimeError("network down")])
def test_failures_return_empty(http, resp):
    _, state = http
    state["resp"] = resp
    assert fl._fetch_stockanalysis_market_data_live("AVGO", "USD") == {}


# ── the score itself ──────────────────────────────────────────────────────

def _seed_metrics(stock_id):
    with fl._batched_metric_writes():
        for name, val in (("Book Value / Share", 4.0), ("EPS", 0.5), ("ROE", 0.15), ("Net Margin", 0.12)):
            fl._upsert_metric(stock_id, 2024, "2024-12-31", "x", name, val)


def test_score_uses_stockanalysis_and_never_imports_yahoo(stock, calls, monkeypatch):
    import sys
    stock_id, _ = stock
    _seed_metrics(stock_id)
    monkeypatch.setitem(sys.modules, "yfinance", None)  # `import yfinance` would raise
    seen = {}

    def market(symbol, currency):
        seen["args"] = (symbol, currency)
        return {"Current Price": 8.0, "Beta": 1.3}

    monkeypatch.setattr(fl, "_fetch_stockanalysis_market_data", market)
    res = fl._compute_stock_score(stock_id, 1)
    assert seen["args"][1] == "KWD"  # the stock's own currency drives the URL
    assert res["details"]["Current Price"] == 8.0
    assert res["details"]["Beta"] == 1.3
    assert res["details"]["P/B"] == 2.0  # 8.0 / book value per share 4.0
    assert res["details"]["Earnings Yield"] == round(0.5 / 8.0, 6)
    beta_row = next(m for m in res["score_breakdown"]["risk"]["metrics"] if m["metric"] == "Beta")
    assert beta_row["value"] == 1.3 and beta_row["points"] != 0
    vol_row = next(m for m in res["score_breakdown"]["risk"]["metrics"] if m["metric"] == "1Y Volatility")
    assert vol_row["value"] is None and vol_row["points"] == 0  # no source -> N/A, neutral


def test_score_falls_back_to_the_portfolio_price(stock, calls, monkeypatch):
    stock_id, _ = stock
    _seed_metrics(stock_id)
    symbol = fl.query_val("SELECT symbol FROM analysis_stocks WHERE id = ?", (stock_id,))
    fl.exec_sql(
        "INSERT INTO stocks (user_id, symbol, name, currency, current_price, created_at) VALUES (1, ?, 'x', 'KWD', 0.75, 1)",
        (symbol,),
    )
    monkeypatch.setattr(fl, "_fetch_stockanalysis_market_data", lambda *_a: {})
    res = fl._compute_stock_score(stock_id, 1)
    assert res["details"]["Current Price"] == 0.75
    assert "Beta" not in res["details"]


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
