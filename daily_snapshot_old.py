# daily_snapshot.py
# Clean, professional daily snapshot builder aligned to your DB schema.
#
# CONFIRMED schema:
# assets:        asset_id, symbol, asset_type, exchange, currency
# prices:        price_id, asset_id, price_date, close_price, source
# fx_rates:      fx_id, rate_date, from_ccy, to_ccy, rate, source
# ledger_entries (your table exists; column names may vary slightly) -> auto-detected
#
# Behavior:
# - Uses latest available PRICE <= snapshot_date
# - Uses latest FX <= snapshot_date; if missing -> warn once and use 1.0 (no crash)
# - Qty logic: BUY + BONUS - SELL
# - Avg cost: total BUY cost / (BUY qty + BONUS qty)  (bonus dilutes average cost)
# - Writes daily_snapshots rows (one per asset per snapshot_date)

from __future__ import annotations

import argparse
import datetime as dt
import sqlite3
from typing import Iterable, Optional, Set, Dict, List


DB_PATH_DEFAULT = "portfolio.db"

ASSETS_TABLE = "assets"
ASSETS_ID_COL = "asset_id"

PRICES_TABLE = "prices"
PRICES_ID_COL = "asset_id"
PRICES_DATE_COL = "price_date"
PRICES_PRICE_COL = "close_price"

FX_TABLE = "fx_rates"
FX_DATE_COL = "rate_date"
FX_FROM_COL = "from_ccy"
FX_TO_COL = "to_ccy"
FX_RATE_COL = "rate"

LEDGER_TABLE = "ledger_entries"

_warned_fx_pairs: Set[str] = set()


# ---------------- DB helpers ----------------

def connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON;")
    return con


def table_exists(con: sqlite3.Connection, name: str) -> bool:
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone() is not None


def get_cols(con: sqlite3.Connection, table: str) -> List[str]:
    return [r["name"] for r in con.execute(f"PRAGMA table_info({table});").fetchall()]


def require_columns(con: sqlite3.Connection, table: str, required: List[str]) -> None:
    if not table_exists(con, table):
        raise RuntimeError(f"Missing required table: {table}")
    cols = get_cols(con, table)
    missing = [c for c in required if c not in cols]
    if missing:
        raise RuntimeError(
            f"Table '{table}' missing columns {missing}. Existing columns: {cols}"
        )


def pick_col(cols: List[str], candidates: List[str]) -> Optional[str]:
    m = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand.lower() in m:
            return m[cand.lower()]
    return None


# ---------------- Settings ----------------

def get_base_currency(con: sqlite3.Connection) -> str:
    if not table_exists(con, "settings"):
        return "KWD"

    cols = get_cols(con, "settings")
    cols_l = [c.lower() for c in cols]

    if "key" in cols_l and "value" in cols_l:
        row = con.execute(
            "SELECT value FROM settings WHERE LOWER(key) IN ('base_currency','basecurrency') LIMIT 1"
        ).fetchone()
        return (row["value"] if row and row["value"] else "KWD").upper()

    for c in cols:
        if c.lower() in ("base_currency", "basecurrency"):
            row = con.execute(f"SELECT {c} AS v FROM settings LIMIT 1").fetchone()
            return (row["v"] if row and row["v"] else "KWD").upper()

    return "KWD"


# ---------------- Output table ----------------

def ensure_daily_snapshots(con: sqlite3.Connection) -> None:
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_snapshots (
            snapshot_date TEXT NOT NULL,
            asset_id      INTEGER NOT NULL,
            quantity      REAL NOT NULL,
            avg_cost      REAL NOT NULL,
            cost_value    REAL NOT NULL,
            mkt_price     REAL NOT NULL,
            mkt_value     REAL NOT NULL,
            currency      TEXT NOT NULL,
            fx_to_base     REAL NOT NULL,
            mkt_value_base REAL NOT NULL,
            cost_value_base REAL NOT NULL,
            pnl_base      REAL NOT NULL,
            PRIMARY KEY (snapshot_date, asset_id)
        );
        """
    )


# ---------------- Ledger schema detection ----------------

def detect_ledger_schema(con: sqlite3.Connection) -> Dict[str, str]:
    if not table_exists(con, LEDGER_TABLE):
        raise RuntimeError(f"Missing required table: {LEDGER_TABLE}")

    cols = get_cols(con, LEDGER_TABLE)

    asset_col = pick_col(cols, ["asset_id", "assetid"])
    date_col = pick_col(cols, ["txn_date", "trade_date", "date", "entry_date"])
    type_col = pick_col(cols, ["txn_type", "type", "transaction_type"])
    qty_col = pick_col(cols, ["quantity", "qty", "shares"])
    price_col = pick_col(cols, ["price", "unit_price", "trade_price"])  # optional but expected for BUY

    if not (asset_col and date_col and type_col and qty_col):
        raise RuntimeError(
            f"Ledger table '{LEDGER_TABLE}' missing required columns. "
            f"Need asset_id/date/type/quantity. Existing: {cols}"
        )

    # price column is optional; if missing then BUY cost becomes 0 (not recommended)
    return {
        "asset_col": asset_col,
        "date_col": date_col,
        "type_col": type_col,
        "qty_col": qty_col,
        "price_col": price_col or "",
    }


# ---------------- Price & FX ----------------

def price_asof(con: sqlite3.Connection, asset_id: int, asof: dt.date) -> float:
    row = con.execute(
        f"""
        SELECT {PRICES_PRICE_COL} AS px
        FROM {PRICES_TABLE}
        WHERE {PRICES_ID_COL} = ?
          AND DATE({PRICES_DATE_COL}) <= DATE(?)
        ORDER BY DATE({PRICES_DATE_COL}) DESC
        LIMIT 1;
        """,
        (asset_id, asof.isoformat()),
    ).fetchone()

    if not row or row["px"] is None:
        raise RuntimeError(f"Missing price for asset_id={asset_id} as of {asof.isoformat()}")

    return float(row["px"])


def fx_to_base(con: sqlite3.Connection, base: str, ccy: str, asof: dt.date) -> float:
    base = base.upper()
    ccy = ccy.upper()

    if ccy == base:
        return 1.0

    # direct
    row = con.execute(
        f"""
        SELECT {FX_RATE_COL} AS r
        FROM {FX_TABLE}
        WHERE UPPER(TRIM({FX_FROM_COL})) = UPPER(TRIM(?))
          AND UPPER(TRIM({FX_TO_COL}))   = UPPER(TRIM(?))
          AND DATE({FX_DATE_COL}) <= DATE(?)
        ORDER BY DATE({FX_DATE_COL}) DESC
        LIMIT 1;
        """,
        (ccy, base, asof.isoformat()),
    ).fetchone()

    if row and row["r"] is not None:
        return float(row["r"])

    # inverse
    row = con.execute(
        f"""
        SELECT {FX_RATE_COL} AS r
        FROM {FX_TABLE}
        WHERE UPPER(TRIM({FX_FROM_COL})) = UPPER(TRIM(?))
          AND UPPER(TRIM({FX_TO_COL}))   = UPPER(TRIM(?))
          AND DATE({FX_DATE_COL}) <= DATE(?)
        ORDER BY DATE({FX_DATE_COL}) DESC
        LIMIT 1;
        """,
        (base, ccy, asof.isoformat()),
    ).fetchone()

    if row and row["r"] is not None:
        inv = float(row["r"])
        if inv != 0:
            return 1.0 / inv

    # fallback warn once
    key = f"{ccy}->{base}"
    if key not in _warned_fx_pairs:
        print(f"⚠️ WARNING: Missing FX {key} as of {asof.isoformat()}. Using fx=1.0 (no conversion).")
        _warned_fx_pairs.add(key)

    return 1.0


# ---------------- Positions (qty + avg cost) ----------------

def positions_asof(con: sqlite3.Connection, asof: dt.date):
    # assets must have asset_id + currency
    require_columns(con, ASSETS_TABLE, [ASSETS_ID_COL, "currency"])

    ledger = detect_ledger_schema(con)

    px_expr = f"COALESCE(l.{ledger['price_col']}, 0)" if ledger["price_col"] else "0"

    sql = f"""
    WITH tx AS (
        SELECT
            l.{ledger['asset_col']} AS asset_id,
            DATE(l.{ledger['date_col']}) AS d,
            UPPER(TRIM(l.{ledger['type_col']})) AS t,
            COALESCE(l.{ledger['qty_col']}, 0) AS qty,
            {px_expr} AS px
        FROM {LEDGER_TABLE} l
        WHERE DATE(l.{ledger['date_col']}) <= DATE(?)
    ),
    agg AS (
        SELECT
            asset_id,
            SUM(CASE
                WHEN t = 'BUY' THEN qty
                WHEN t IN ('BONUS','BONUS_SHARES','STOCK_DIVIDEND') THEN qty
                WHEN t = 'SELL' THEN -qty
                ELSE 0
            END) AS quantity,
            SUM(CASE WHEN t = 'BUY' THEN qty * px ELSE 0 END) AS buy_cost,
            SUM(CASE WHEN t IN ('BUY','BONUS','BONUS_SHARES','STOCK_DIVIDEND') THEN qty ELSE 0 END) AS basis_qty
        FROM tx
        GROUP BY asset_id
    )
    SELECT
        a.{ASSETS_ID_COL} AS asset_id,
        UPPER(TRIM(a.currency)) AS currency,
        agg.quantity AS quantity,
        CASE WHEN agg.basis_qty > 0 THEN agg.buy_cost / agg.basis_qty ELSE 0 END AS avg_cost
    FROM {ASSETS_TABLE} a
    JOIN agg ON agg.asset_id = a.{ASSETS_ID_COL}
    WHERE agg.quantity <> 0
    ORDER BY a.{ASSETS_ID_COL};
    """

    return con.execute(sql, (asof.isoformat(),)).fetchall()


# ---------------- Build snapshot ----------------

def build_snapshot_for_date(con: sqlite3.Connection, snap_date: dt.date) -> None:
    # enforce confirmed schemas
    require_columns(con, PRICES_TABLE, [PRICES_ID_COL, PRICES_DATE_COL, PRICES_PRICE_COL])
    require_columns(con, FX_TABLE, [FX_DATE_COL, FX_FROM_COL, FX_TO_COL, FX_RATE_COL])
    require_columns(con, ASSETS_TABLE, [ASSETS_ID_COL, "currency"])
    ensure_daily_snapshots(con)

    base = get_base_currency(con)

    con.execute("DELETE FROM daily_snapshots WHERE snapshot_date = ?", (snap_date.isoformat(),))

    for p in positions_asof(con, snap_date):
        asset_id = int(p["asset_id"])
        ccy = str(p["currency"]).upper()
        qty = float(p["quantity"])
        avg_cost = float(p["avg_cost"])

        px = price_asof(con, asset_id, snap_date)
        fx = fx_to_base(con, base, ccy, snap_date)

        cost_val = qty * avg_cost
        mkt_val = qty * px

        con.execute(
            """
            INSERT INTO daily_snapshots (
                snapshot_date, asset_id, quantity, avg_cost, cost_value,
                mkt_price, mkt_value, currency, fx_to_base,
                mkt_value_base, cost_value_base, pnl_base
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                snap_date.isoformat(),
                asset_id,
                qty,
                avg_cost,
                cost_val,
                px,
                mkt_val,
                ccy,
                fx,
                mkt_val * fx,
                cost_val * fx,
                (mkt_val - cost_val) * fx,
            ),
        )


# ---------------- CLI ----------------

def parse_date(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y-%m-%d").date()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_PATH_DEFAULT)
    ap.add_argument("--date", help="YYYY-MM-DD (single day)")
    args = ap.parse_args()

    snap_date = parse_date(args.date) if args.date else dt.date.today()

    con = connect(args.db)
    try:
        with con:
            build_snapshot_for_date(con, snap_date)
        print(f"✅ Snapshot built for {snap_date.isoformat()}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
