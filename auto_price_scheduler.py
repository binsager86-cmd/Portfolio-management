"""
Auto Price Fetcher & Portfolio Snapshot — Cron Job Worker
=========================================================
Designed for DigitalOcean App Platform cron jobs.
Replicates the exact "Fetch All Prices" logic from ui.py.

Uses raw psycopg2 cursors (no pandas read_sql) to avoid the pandas 2.x
silent-empty-DataFrame bug with DBAPI2 connections.

Usage:
    python auto_price_scheduler.py           # Run once (default for cron)
    python auto_price_scheduler.py --run-now # Alias (same behaviour)
"""

import os
import sys
import time
import logging
import datetime

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("AutoPriceScheduler")

# ---------------------------------------------------------------------------
# Add project root to path so we can import stock_data
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# yfinance
# ---------------------------------------------------------------------------
try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
    YFINANCE_VERSION = getattr(yf, "__version__", "unknown")
except (ImportError, TypeError) as e:
    YFINANCE_AVAILABLE = False
    YFINANCE_VERSION = None
    yf = None
    logger.warning(f"yfinance import issue: {e}")

# ---------------------------------------------------------------------------
# stock_data helpers (same ones the UI uses)
# ---------------------------------------------------------------------------
try:
    from stock_data import KUWAIT_STOCKS, US_STOCKS, normalize_kwd_price
    STOCK_DATA_AVAILABLE = True
except ImportError:
    STOCK_DATA_AVAILABLE = False
    KUWAIT_STOCKS = []
    US_STOCKS = []

    def normalize_kwd_price(price, currency):
        if price is None:
            return 0.0
        if currency == "KWD" and price > 50:
            return round(price / 1000.0, 3)
        return price


# ---------------------------------------------------------------------------
# Flatten yfinance MultiIndex columns
# ---------------------------------------------------------------------------
def _flatten_yf_columns(df):
    if hasattr(df, "columns") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)
    return df


# ---------------------------------------------------------------------------
# DB connection (raw psycopg2 — no pandas, no SQLAlchemy)
# ---------------------------------------------------------------------------
def get_connection():
    """Return a raw psycopg2 connection using DATABASE_URL."""
    import psycopg2
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        logger.error("DATABASE_URL environment variable not set")
        return None
    try:
        conn = psycopg2.connect(url, sslmode="require")
        conn.autocommit = False
        return conn
    except Exception as e:
        logger.error(f"DB connection failed: {e}")
        return None


def db_rows(conn, sql, params=None):
    """Execute SELECT, return list of dicts."""
    from psycopg2.extras import RealDictCursor
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params or ())
        return [dict(r) for r in cur.fetchall()]


def db_one(conn, sql, params=None):
    """Execute SELECT, return single dict or None."""
    from psycopg2.extras import RealDictCursor
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params or ())
        row = cur.fetchone()
        return dict(row) if row else None


def db_exec(conn, sql, params=None):
    """Execute INSERT/UPDATE/DELETE."""
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
    conn.commit()


# ═══════════════════════════════════════════════════════════════════════════
# FIND USERS  (the exact same integer user_id as ui.py uses)
# ═══════════════════════════════════════════════════════════════════════════
def get_all_user_ids(conn):
    """
    Return a list of integer user_ids that have stocks OR transactions.
    Matches ui.py which stores user_id as INTEGER from users.id.
    """
    user_ids = set()

    # 1. users table
    try:
        rows = db_rows(conn, "SELECT id FROM users;")
        for r in rows:
            uid = r.get("id")
            if uid is not None:
                user_ids.add(uid)
        logger.info(f"  users table IDs: {sorted(user_ids)}")
    except Exception as e:
        logger.warning(f"  users table query failed: {e}")
        conn.rollback()

    # 2. DISTINCT user_id from stocks
    try:
        rows = db_rows(conn, "SELECT DISTINCT user_id FROM stocks WHERE user_id IS NOT NULL;")
        for r in rows:
            uid = r.get("user_id")
            if uid is not None:
                user_ids.add(uid)
        logger.info(f"  stocks user_ids: {sorted([r.get('user_id') for r in rows])}")
    except Exception as e:
        logger.warning(f"  stocks user_id query failed: {e}")
        conn.rollback()

    # 3. DISTINCT user_id from transactions
    try:
        rows = db_rows(conn, "SELECT DISTINCT user_id FROM transactions WHERE user_id IS NOT NULL;")
        for r in rows:
            uid = r.get("user_id")
            if uid is not None:
                user_ids.add(uid)
        logger.info(f"  transactions user_ids: {sorted([r.get('user_id') for r in rows])}")
    except Exception as e:
        logger.warning(f"  transactions user_id query failed: {e}")
        conn.rollback()

    # Filter out system user 1 (admin seed) if there are real users
    real_ids = sorted(user_ids)
    if len(real_ids) > 1 and 1 in real_ids:
        # Keep user 1 only if they have transactions
        try:
            row = db_one(conn, "SELECT COUNT(*) as cnt FROM transactions WHERE user_id = 1;")
            if not row or row.get("cnt", 0) == 0:
                real_ids.remove(1)
                logger.info(f"  Excluded user_id=1 (no transactions)")
        except Exception:
            conn.rollback()

    logger.info(f"  Final user_ids: {real_ids}")
    return real_ids


# ═══════════════════════════════════════════════════════════════════════════
# GET ACTIVE HOLDINGS (replicates ui.py "Fetch All" query exactly)
# ═══════════════════════════════════════════════════════════════════════════
def get_active_holdings(conn, user_id):
    """
    Derive active stock holdings from transactions — same query as
    the 'Fetch All Prices' button in ui.py Portfolio Analysis tab.

    Returns list of dicts with keys: symbol, currency, portfolio, net_shares
    """
    rows = db_rows(conn, """
        SELECT
            t.stock_symbol   AS symbol,
            COALESCE(s.currency,
                CASE WHEN t.portfolio = 'USA' THEN 'USD' ELSE 'KWD' END
            )                AS currency,
            MAX(t.portfolio) AS portfolio,
            SUM(CASE WHEN t.txn_type = 'Buy'  THEN COALESCE(t.shares, 0) ELSE 0 END)
              + SUM(COALESCE(t.bonus_shares, 0))
              - SUM(CASE WHEN t.txn_type = 'Sell' THEN COALESCE(t.shares, 0) ELSE 0 END)
                             AS net_shares
        FROM transactions t
        LEFT JOIN stocks s
            ON UPPER(TRIM(t.stock_symbol)) = UPPER(TRIM(s.symbol))
           AND s.user_id = t.user_id
        WHERE t.user_id = %s
          AND COALESCE(t.category, 'portfolio') = 'portfolio'
        GROUP BY t.stock_symbol,
                 COALESCE(s.currency,
                     CASE WHEN t.portfolio = 'USA' THEN 'USD' ELSE 'KWD' END)
        HAVING (
            SUM(CASE WHEN t.txn_type = 'Buy'  THEN COALESCE(t.shares, 0) ELSE 0 END)
              + SUM(COALESCE(t.bonus_shares, 0))
              - SUM(CASE WHEN t.txn_type = 'Sell' THEN COALESCE(t.shares, 0) ELSE 0 END)
        ) > 0;
    """, (user_id,))
    return rows


# ═══════════════════════════════════════════════════════════════════════════
# TICKER RESOLUTION  (replicates resolve_yf_ticker from ui.py)
# ═══════════════════════════════════════════════════════════════════════════
def resolve_yf_ticker(db_symbol, currency="KWD", portfolio=None):
    """Map a DB symbol to a Yahoo Finance ticker."""
    if not db_symbol:
        return db_symbol
    sym = str(db_symbol).strip().upper()
    ccy = str(currency or "KWD").strip().upper()

    # Already has exchange suffix
    if any(sym.endswith(sfx) for sfx in [".KW", ".BH", ".L", ".TO"]):
        return sym

    is_kwd = ccy in ("KWD", "BHD") and portfolio not in ("USA",)
    is_usd = ccy == "USD" or portfolio == "USA"

    # Strategy 1: Exact match in authoritative stock lists
    if is_kwd and STOCK_DATA_AVAILABLE:
        for stock in KUWAIT_STOCKS:
            if stock["symbol"].upper() == sym:
                return stock.get("yf_ticker", f"{sym}.KW")

    if is_usd and STOCK_DATA_AVAILABLE:
        for stock in US_STOCKS:
            if stock["symbol"].upper() == sym:
                return stock.get("yf_ticker", sym)

    # Strategy 2: Known Kuwait variations
    KUWAIT_VARIATIONS = {
        "AGLTY": "AGILITY", "AGILITY PLC": "AGILITY",
        "MABNEE": "MABANEE", "MABNE": "MABANEE",
        "OORED": "OOREDOO", "OREDOO": "OOREDOO",
        "HUMAN SOFT": "HUMANSOFT", "H-SOFT": "HUMANSOFT", "HSOFT": "HUMANSOFT", "HUM": "HUMANSOFT",
        "SANAM BUSINESS": "SANAM", "SANAM SYS": "SANAM",
        "KFH.KW": "KFH", "KUWAIT FINANCE HOUSE": "KFH",
        "ZAIN KUWAIT": "ZAIN", "ZAIN.KW": "ZAIN",
        "GFH FINANCIAL": "GFH", "GFH.BH": "GFH",
        "NATIONAL INVESTMENTS": "NIH", "NIH.KW": "NIH",
        "KUWAIT REAL ESTATE": "KRE", "KRE.KW": "KRE",
        "BOUBYAN PETROCHEMICAL": "BPCC", "BPCC.KW": "BPCC",
        "KUWAIT INTERNATIONAL BANK": "KIB", "KIB.KW": "KIB",
        "MUNSHAAT.KW": "MUNSHAAT",
        "ALG.KW": "ALG",
        "INCYTE": "INCY", "INCYTE CORP": "INCY",
    }
    if is_kwd and STOCK_DATA_AVAILABLE:
        reverse_map = {}
        for variation, canonical in KUWAIT_VARIATIONS.items():
            reverse_map.setdefault(canonical, set()).add(variation)
        if sym in reverse_map:
            for variation in reverse_map[sym]:
                var_upper = variation.upper().replace(".KW", "").replace(".BH", "").strip()
                for stock in KUWAIT_STOCKS:
                    if stock["symbol"].upper() == var_upper:
                        return stock.get("yf_ticker", f"{var_upper}.KW")

    # Strategy 3: Currency-based suffix fallback
    if is_usd:
        return sym
    if ccy == "BHD":
        return f"{sym}.BH"
    return f"{sym}.KW"


# ═══════════════════════════════════════════════════════════════════════════
# PRICE FETCHING  (batch + individual retry, same as ui.py)
# ═══════════════════════════════════════════════════════════════════════════
def fetch_usd_kwd_rate():
    """Fetch live USD→KWD rate."""
    if not YFINANCE_AVAILABLE:
        logger.warning("yfinance unavailable, using fallback rate 0.3077")
        return 0.3077
    try:
        logger.info("Fetching USD/KWD rate from yfinance ...")
        data = yf.download("KWD=X", period="5d", interval="1d", progress=False)
        if data is not None and not data.empty:
            data = _flatten_yf_columns(data)
            if "Close" in data.columns:
                rate = float(data["Close"].dropna().iloc[-1])
                logger.info(f"USD/KWD rate fetched: {rate}")
                return rate
    except Exception as e:
        logger.warning(f"USD/KWD fetch error: {e}")
    return 0.3077


def fetch_prices_batch(ticker_map):
    """
    Batch-download prices for all tickers in one yfinance call.
    Returns dict: { yf_ticker: float_price } for successful fetches.
    Also returns list of failed yf_tickers.
    """
    results = {}
    failed = []

    if not ticker_map or not YFINANCE_AVAILABLE:
        return results, list(ticker_map.keys())

    yf_tickers = list(ticker_map.keys())
    tickers_str = " ".join(yf_tickers)

    logger.info(f"  Batch downloading {len(yf_tickers)} tickers ...")
    try:
        batch_data = yf.download(
            tickers_str,
            period="5d",
            progress=False,
            threads=True,
            group_by="ticker",
        )

        for yf_tick in yf_tickers:
            try:
                if len(yf_tickers) == 1:
                    ticker_data = batch_data
                    if ticker_data.columns.nlevels > 1:
                        ticker_data.columns = ticker_data.columns.get_level_values(0)
                else:
                    if yf_tick in batch_data.columns.get_level_values(0):
                        ticker_data = batch_data[yf_tick]
                    else:
                        failed.append(yf_tick)
                        continue

                if ticker_data is not None and not ticker_data.empty and "Close" in ticker_data.columns:
                    close = ticker_data["Close"].dropna()
                    if not close.empty:
                        results[yf_tick] = float(close.iloc[-1])
                        continue
                failed.append(yf_tick)
            except Exception:
                failed.append(yf_tick)
    except Exception as e:
        logger.warning(f"  Batch download error: {e}")
        failed = yf_tickers

    logger.info(f"  Batch results: {len(results)} OK, {len(failed)} failed")
    return results, failed


def fetch_price_individual(yf_ticker):
    """Fetch price for a single ticker (retry fallback)."""
    if not YFINANCE_AVAILABLE:
        return None
    try:
        data = yf.download(yf_ticker, period="5d", interval="1d", progress=False)
        if data is not None and not data.empty:
            data = _flatten_yf_columns(data)
            if "Close" in data.columns:
                close = data["Close"].dropna()
                if not close.empty:
                    return float(close.iloc[-1])
    except Exception as e:
        logger.warning(f"    Individual fetch error for {yf_ticker}: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════════════
# SNAPSHOT — ensure table exists
# ═══════════════════════════════════════════════════════════════════════════
def ensure_snapshot_table(conn):
    """Create portfolio_snapshots if missing, with UNIQUE index."""
    db_exec(conn, """
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id SERIAL PRIMARY KEY,
            user_id INTEGER DEFAULT 1,
            snapshot_date DATE NOT NULL,
            total_value REAL DEFAULT 0,
            total_cost REAL DEFAULT 0,
            total_gain_loss REAL DEFAULT 0,
            num_holdings INTEGER DEFAULT 0,
            created_at INTEGER
        );
    """)
    try:
        db_exec(conn, """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_snapshot_date_user'
                ) THEN
                    CREATE UNIQUE INDEX uq_snapshot_date_user
                    ON portfolio_snapshots(snapshot_date, user_id);
                END IF;
            END $$;
        """)
    except Exception:
        conn.rollback()


def save_snapshot(conn, user_id, snapshot_date, total_value, total_cost, gain_loss, num_holdings):
    """UPSERT a portfolio snapshot."""
    try:
        db_exec(conn, """
            INSERT INTO portfolio_snapshots
                (user_id, snapshot_date, total_value, total_cost, total_gain_loss, num_holdings, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (snapshot_date, user_id) DO UPDATE SET
                total_value     = EXCLUDED.total_value,
                total_cost      = EXCLUDED.total_cost,
                total_gain_loss = EXCLUDED.total_gain_loss,
                num_holdings    = EXCLUDED.num_holdings,
                created_at      = EXCLUDED.created_at;
        """, (user_id, snapshot_date, total_value, total_cost, gain_loss, num_holdings, int(time.time())))
        logger.info(f"  💾 Snapshot saved: user={user_id}, value={total_value:,.2f}, cost={total_cost:,.2f}, P&L={gain_loss:,.2f}")
    except Exception as e:
        logger.error(f"  Snapshot save failed: {e}")
        conn.rollback()
        # Fallback: delete + insert
        try:
            db_exec(conn, "DELETE FROM portfolio_snapshots WHERE snapshot_date = %s AND user_id = %s;", (snapshot_date, user_id))
            db_exec(conn, """
                INSERT INTO portfolio_snapshots
                    (user_id, snapshot_date, total_value, total_cost, total_gain_loss, num_holdings, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """, (user_id, snapshot_date, total_value, total_cost, gain_loss, num_holdings, int(time.time())))
            logger.info(f"  💾 Snapshot saved (fallback): user={user_id}")
        except Exception as e2:
            logger.error(f"  Snapshot fallback also failed: {e2}")
            conn.rollback()


# ═══════════════════════════════════════════════════════════════════════════
# COMPUTE TOTAL COST FROM TRANSACTIONS
# ═══════════════════════════════════════════════════════════════════════════
def compute_total_cost(conn, user_id):
    """
    Compute total cost per stock from transactions (Buy cost - sold proportions).
    Returns dict: { 'SYMBOL': total_cost_kwd }
    """
    rows = db_rows(conn, """
        SELECT stock_symbol,
               SUM(CASE WHEN txn_type = 'Buy' THEN COALESCE(purchase_cost, 0) ELSE 0 END) as total_buy_cost,
               SUM(CASE WHEN txn_type = 'Buy' THEN COALESCE(shares, 0) ELSE 0 END)
                 + SUM(COALESCE(bonus_shares, 0)) as total_bought,
               SUM(CASE WHEN txn_type = 'Sell' THEN COALESCE(shares, 0) ELSE 0 END) as total_sold
        FROM transactions
        WHERE user_id = %s AND COALESCE(category, 'portfolio') = 'portfolio'
        GROUP BY stock_symbol;
    """, (user_id,))

    costs = {}
    for r in rows:
        sym = (r.get("stock_symbol") or "").strip().upper()
        total_buy = float(r.get("total_buy_cost") or 0)
        bought = float(r.get("total_bought") or 0)
        sold = float(r.get("total_sold") or 0)
        if bought > 0 and total_buy > 0:
            remaining = max(bought - sold, 0)
            # Proportional cost for remaining shares
            costs[sym] = total_buy * (remaining / bought)
        else:
            costs[sym] = 0.0
    return costs


# ═══════════════════════════════════════════════════════════════════════════
# MAIN JOB — replicates "Fetch All Prices" from ui.py
# ═══════════════════════════════════════════════════════════════════════════
def run_price_update_job():
    logger.info("=" * 60)
    logger.info("🚀 AUTO PRICE UPDATE JOB STARTED")
    logger.info(f"📅 Date: {datetime.date.today()}")

    try:
        from zoneinfo import ZoneInfo
        kw_time = datetime.datetime.now(ZoneInfo("Asia/Kuwait")).strftime("%H:%M:%S")
        logger.info(f"🕐 Kuwait Time: {kw_time}")
    except Exception:
        pass

    logger.info(f"📦 yfinance available: {YFINANCE_AVAILABLE} (v{YFINANCE_VERSION})")
    logger.info("=" * 60)

    if not YFINANCE_AVAILABLE:
        logger.error("❌ yfinance not available — cannot fetch prices.")
        return

    # ── Connect ──
    conn = get_connection()
    if not conn:
        logger.error("❌ Cannot connect to database. Aborting.")
        return

    try:
        # ── Ensure snapshot table ──
        ensure_snapshot_table(conn)

        # ── Exchange rate ──
        usd_kwd = fetch_usd_kwd_rate()
        logger.info(f"💱 USD/KWD Rate: {usd_kwd:.4f}")

        # ── Find users ──
        user_ids = get_all_user_ids(conn)
        if not user_ids:
            logger.warning("⚠️ No users found in database — nothing to do.")
            return

        logger.info(f"👥 Processing {len(user_ids)} user(s): {user_ids}")
        today = datetime.date.today().isoformat()

        for user_id in user_ids:
            logger.info("")
            logger.info(f"{'─' * 55}")
            logger.info(f"👤 User {user_id}")
            logger.info(f"{'─' * 55}")

            # ── Get active holdings from transactions (same as UI) ──
            holdings = get_active_holdings(conn, user_id)
            logger.info(f"  📊 Active holdings (from transactions): {len(holdings)}")

            if not holdings:
                # Fallback: check stocks table directly
                stocks_rows = db_rows(conn, """
                    SELECT symbol, currency, portfolio FROM stocks
                    WHERE user_id = %s AND COALESCE(current_price, 0) >= 0;
                """, (user_id,))
                if stocks_rows:
                    logger.info(f"  ℹ️ No transactions found, but {len(stocks_rows)} stocks in stocks table")
                    holdings = [{"symbol": r["symbol"], "currency": r.get("currency", "KWD"),
                                 "portfolio": r.get("portfolio", "KFH"), "net_shares": 0}
                                for r in stocks_rows]
                else:
                    logger.info(f"  ⏭️ No holdings for user {user_id}, skipping.")
                    continue

            # ── Build ticker map (yf_ticker → {symbol, currency, portfolio}) ──
            ticker_map = {}
            for h in holdings:
                db_sym = str(h.get("symbol", "")).strip()
                ccy = str(h.get("currency", "KWD") or "KWD").strip().upper()
                ptf = str(h.get("portfolio", "KFH") or "KFH")
                yf_tick = resolve_yf_ticker(db_sym.upper(), currency=ccy, portfolio=ptf)
                ticker_map[yf_tick] = {
                    "symbol": db_sym,
                    "currency": ccy,
                    "portfolio": ptf,
                    "net_shares": float(h.get("net_shares") or 0),
                }
                logger.info(f"    {db_sym} → {yf_tick} ({ccy}, {ptf}, shares={h.get('net_shares', 0)})")

            # ── Phase 1: Batch fetch prices ──
            batch_prices, failed_tickers = fetch_prices_batch(ticker_map)

            # ── Phase 2: Individual retry for failed tickers ──
            if failed_tickers:
                logger.info(f"  🔄 Retrying {len(failed_tickers)} failed tickers individually ...")
                for ft in failed_tickers:
                    price = fetch_price_individual(ft)
                    if price is not None:
                        batch_prices[ft] = price
                        logger.info(f"    ✅ {ft} retry OK: {price}")
                    else:
                        logger.warning(f"    ❌ {ft} retry failed")
                    time.sleep(0.5)

            # ── Phase 3: Update stock prices in DB ──
            success_count = 0
            for yf_tick, raw_price in batch_prices.items():
                info = ticker_map.get(yf_tick, {})
                db_sym = info.get("symbol", "")
                ccy = info.get("currency", "KWD")
                ptf = info.get("portfolio", "KFH")

                # Normalize Kuwait prices (Fils → KWD)
                if ccy == "KWD":
                    price = normalize_kwd_price(raw_price, ccy)
                else:
                    price = raw_price

                # UPSERT into stocks table — exact same SQL as ui.py
                try:
                    db_exec(conn, """
                        INSERT INTO stocks (symbol, user_id, current_price, currency, portfolio)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT(symbol, user_id) DO UPDATE SET
                            current_price = EXCLUDED.current_price;
                    """, (db_sym, user_id, price, ccy, ptf))
                    success_count += 1
                    logger.info(f"  ✅ {db_sym} = {price:,.4f} {ccy}")
                except Exception as e:
                    logger.error(f"  ❌ DB update failed for {db_sym}: {e}")
                    conn.rollback()

            logger.info(f"  📈 Prices updated: {success_count}/{len(ticker_map)}")

            # ── Phase 4: Compute portfolio value & save snapshot ──
            cost_map = compute_total_cost(conn, user_id)

            total_value = 0.0
            total_cost = 0.0
            num_holdings = 0

            for yf_tick, info in ticker_map.items():
                db_sym = info["symbol"].upper()
                ccy = info["currency"]
                net_shares = info["net_shares"]

                if net_shares <= 0:
                    continue

                raw_price = batch_prices.get(yf_tick)
                if raw_price is None:
                    # Try to get existing price from DB
                    row = db_one(conn, "SELECT current_price FROM stocks WHERE UPPER(symbol) = %s AND user_id = %s;",
                                 (db_sym, user_id))
                    raw_price = float(row.get("current_price") or 0) if row else 0

                if ccy == "KWD":
                    px = normalize_kwd_price(raw_price, ccy) if raw_price else 0
                else:
                    px = raw_price or 0

                # Convert to KWD for unified value
                if ccy == "USD":
                    val_kwd = px * net_shares * usd_kwd
                else:
                    val_kwd = px * net_shares

                total_value += val_kwd
                total_cost += cost_map.get(db_sym, 0)
                num_holdings += 1

                logger.info(f"    {db_sym}: {net_shares:.2f} × {px:,.4f} {ccy} = {val_kwd:,.2f} KWD")

            gain_loss = total_value - total_cost

            logger.info(f"  💰 Portfolio Summary:")
            logger.info(f"     Value: {total_value:,.2f} KWD")
            logger.info(f"     Cost:  {total_cost:,.2f} KWD")
            logger.info(f"     P&L:   {gain_loss:,.2f} KWD")
            logger.info(f"     Holdings: {num_holdings}")

            if num_holdings > 0:
                save_snapshot(conn, user_id, today, total_value, total_cost, gain_loss, num_holdings)
            else:
                logger.info(f"  ⏭️ No valued holdings, skipping snapshot")

    except Exception as e:
        logger.error(f"❌ Job failed: {e}", exc_info=True)
    finally:
        try:
            conn.close()
        except Exception:
            pass

    logger.info("")
    logger.info("=" * 60)
    logger.info("✅ AUTO PRICE UPDATE JOB FINISHED")
    logger.info(f"📅 {datetime.datetime.utcnow().isoformat()} UTC")


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    run_price_update_job()
