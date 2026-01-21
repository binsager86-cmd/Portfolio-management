from typing import Optional
import sqlite3
import time
import uuid
import html
try:
    import pandas as pd
    from datetime import date, datetime, timedelta # Added for peer analysis
except ImportError:
    pass

import bcrypt

# Import centralized stock data and helpers
from stock_data import (
    KUWAIT_STOCKS, US_STOCKS,
    normalize_kwd_price,
    get_kuwait_stock_options, get_us_stock_options,
    parse_stock_selection, parse_kuwait_stock_selection
)

try:
    import extra_streamlit_components as stx
except ImportError:
    stx = None

import numpy as np
import io
import sys
import streamlit as st

# ✅ PROFESSIONAL: Python version check (checks actual version, not path)
REQUIRED = (3, 11)

if sys.version_info < REQUIRED:
    st.error("❌ **Wrong Python Version Detected**")
    st.error(f"Expected: Python {REQUIRED[0]}.{REQUIRED[1]}+")
    st.error(f"Detected: Python {sys.version.split()[0]}")
    st.code(f"Executable: {sys.executable}")
    st.info("💡 **Solution:** Run app inside Python 3.11 virtual environment")
    st.code("venv\\Scripts\\activate\npython -m streamlit run ui.py", language="bash")
    st.stop()

try:
    import altair as alt
except Exception:
    alt = None
import math

try:
    import plotly.express as px
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
except Exception:
    px = None
    go = None
    make_subplots = None
import json
import urllib.request
import urllib.parse
try:
    import requests
except Exception:
    requests = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

# Check yfinance availability WITH DIAGNOSTICS
YFINANCE_AVAILABLE = False
YFINANCE_ERROR = None

# =========================
# CONFIGURATION
# =========================

# Configuration for the 8 Tables in Peer Analysis
PEER_METRICS = {
    "Total Return": {
        "1 Month": "calc_ret_1mo",
        "3 Month": "calc_ret_3mo",
        "6 Month": "calc_ret_6mo",
        "9 Month": "calc_ret_9mo",
        "YTD": "calc_ret_ytd",
        "1 Year": "calc_ret_1y",
        "3 Year": "calc_ret_3y",
        "5 Year": "calc_ret_5y",
        "10 Year": "calc_ret_10y"
    },
    "Dividends": {
        "Dividend Yield (TTM)": "info_dividendYield",
        "Payout Ratio": "info_payoutRatio",
        "5 Year Avg Yield": "info_fiveYearAvgDividendYield",
        "Dividend Rate (TTM)": "info_dividendRate",
        "Ex-Dividend Date": "info_exDividendDate"
    },
    "Valuation": {
        "P/E (TTM)": "info_trailingPE",
        "Forward P/E": "info_forwardPE",
        "PEG Ratio": "info_pegRatio",
        "Price/Sales (TTM)": "info_priceToSalesTrailing12Months",
        "Price/Book (TTM)": "info_priceToBook",
        "EV/Revenue": "info_enterpriseToRevenue",
        "EV/EBITDA": "info_enterpriseToEbitda",
        "Price/Cash Flow": "info_operatingCashflow" # Note: Usually calc needed, strictly info here per request
    },
    "Growth": {
        "Revenue Growth (YoY)": "info_revenueGrowth",
        "Earnings Growth (YoY)": "info_earningsGrowth",
        "Revenue 3Y CAGR": "calc_cagr_revenue_3y",
        "Net Income 3Y CAGR": "calc_cagr_netincome_3y",
        "EPS Diluted 3Y CAGR": "calc_cagr_eps_3y"
    },
    "Profitability": {
        "Gross Margin": "info_grossMargins",
        "EBITDA Margin": "info_ebitdaMargins",
        "Operating Margin": "info_operatingMargins",
        "Net Profit Margin": "info_profitMargins",
        "Return on Equity (ROE)": "info_returnOnEquity",
        "Return on Assets (ROA)": "info_returnOnAssets"
    },
    "Performance": {
        "1 Year Price Perf": "calc_ret_1y",
        "52 Week High": "info_fiftyTwoWeekHigh",
        "52 Week Low": "info_fiftyTwoWeekLow",
        "Beta": "info_beta"
    },
    "Income Statement (TTM/MRQ)": {
        "Total Revenue": "info_totalRevenue",
        "Gross Profit": "sheet_Gross Profit",
        "EBITDA": "info_ebitda",
        "Operating Income": "sheet_Operating Income",
        "Net Income": "sheet_Net Income",
        "EPS Diluted": "info_trailingEps"
    },
    "Balance Sheet (MRQ)": {
        "Total Cash": "info_totalCash",
        "Total Debt": "info_totalDebt",
        "Net Debt": "calc_net_debt", 
        "Total Debt/Equity": "info_debtToEquity",
        "Current Ratio": "info_currentRatio",
        "Quick Ratio": "info_quickRatio",
        "Book Value Per Share": "info_bookValue"
    },
    "Cash Flow": {
        "Operating Cash Flow": "info_operatingCashflow",
        "Free Cash Flow": "info_freeCashflow",
        "CapEx": "calc_capex" 
    }
}

# Currency Configuration (Single Source of Truth)
BASE_CCY = "KWD"  # Overall portfolio must be in KWD
USD_CCY = "USD"
DEFAULT_USD_TO_KWD = 0.307190  # Default USD→KWD rate

# Portfolio Currency Mapping
PORTFOLIO_CCY = {
    "KFH": "KWD",
    "BBYN": "KWD",
    "USA": "USD",
}
YFINANCE_PATH = None

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
    YFINANCE_PATH = yf.__file__
except Exception as e:
    YFINANCE_ERROR = str(e)
    yf = None


def session_tv(timeout=20):
    """Create a TradingView session with proper browser-like headers and cookie warm-up."""
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.tradingview.com/",
        "Origin": "https://www.tradingview.com",
        "DNT": "1",
        "Connection": "keep-alive",
    })
    try:
        s.get("https://www.tradingview.com/", timeout=timeout)
    except Exception:
        pass
    return s


@st.cache_data(ttl=3600, show_spinner=False)
def get_pe_ratios(items):
    """
    Fetch P/E ratios for a list of (symbol, currency) tuples.
    Returns a dict {symbol: pe_ratio}.
    """
    if not YFINANCE_AVAILABLE:
        return {}
        
    results = {}
    # Create a progress bar if there are many items
    progress_bar = None
    if len(items) > 5:
        progress_bar = st.progress(0, text="Fetching P/E ratios...")
        
    for i, (sym, ccy) in enumerate(items):
        ticker_name = sym
        # Heuristic for Kuwaiti stocks
        if ccy == "KWD" and not sym.endswith(".KW"):
            ticker_name = f"{sym}.KW"
            
        try:
            # Use Ticker to get info
            t = yf.Ticker(ticker_name)
            # Accessing info triggers the fetch
            info = t.info
            pe = info.get('trailingPE')
            if pe is None:
                pe = info.get('forwardPE')
            results[sym] = pe
        except Exception:
            results[sym] = None
            
        if progress_bar:
            progress_bar.progress((i + 1) / len(items))
            
    if progress_bar:
        progress_bar.empty()
        
    return results


# Stock data and helper functions imported from stock_data.py

def normalize_tv_key(exchange: str, symbol: str) -> str:
    """Normalize TradingView exchange:symbol key."""
    return f"{(exchange or '').strip().upper()}:{(symbol or '').strip().upper()}"


def tradingview_search(query: str, exchange: str = None, limit: int = 20, session=None):
    """Search TradingView symbols using their public symbol_search endpoint.
    Returns list of results with 'exchange', 'symbol', 'full_name', 'description'.
    Per TradingView docs: exchange param is mandatory for Kuwait stocks (use 'KSE').
    """
    if not query:
        return [], None
    if session is None:
        session = session_tv() if requests else None
    
    url = "https://symbol-search.tradingview.com/symbol_search/"
    params = {"text": query, "hl": 1, "lang": "en"}
    if exchange:
        params["exchange"] = exchange
    
    try:
        if requests is not None and session:
            r = session.get(url, params=params, timeout=20)
            r.raise_for_status()
            data = r.json()
        else:
            q = urllib.parse.urlencode(params)
            with urllib.request.urlopen(url + "?" + q, timeout=20) as resp:
                data = json.loads(resp.read().decode())
        if isinstance(data, list):
            return data[:limit], None
        return data, None
    except Exception as e:
        return None, str(e)


def map_to_tradingview(symbol: str, exchange: str = "KSE", limit: int = 20):
    """Return candidate TradingView symbols for a given local symbol.
    Defaults to KSE (Kuwait Stock Exchange) but can override.
    """
    import re
    candidates = []
    seen = set()
    session = session_tv() if requests else None
    
    # Try with specified exchange first
    data, err = tradingview_search(symbol, exchange=exchange, limit=limit, session=session)
    if data and isinstance(data, list):
        for item in data:
            sym = item.get("symbol") or item.get("ticker")
            exch = item.get("exchange") or item.get("exchange_short")
            if not sym:
                continue
            # Strip HTML tags (TradingView may return <em> tags)
            sym = re.sub(r'<[^>]+>', '', sym).strip()
            key = normalize_tv_key(exch, sym)
            if key in seen:
                continue
            seen.add(key)
            full_name = item.get("full_name") or item.get("description") or ""
            full_name = re.sub(r'<[^>]+>', '', full_name).strip()
            candidates.append({
                "tv_symbol": sym,
                "exchange": exch,
                "full_name": full_name,
                "type": item.get("type"),
            })
    
    # If no results, try without exchange filter
    if not candidates:
        data, err = tradingview_search(symbol, exchange=None, limit=limit, session=session)
        if data and isinstance(data, list):
            for item in data:
                sym = item.get("symbol") or item.get("ticker")
                exch = item.get("exchange") or item.get("exchange_short")
                if not sym:
                    continue
                sym = re.sub(r'<[^>]+>', '', sym).strip()
                key = normalize_tv_key(exch, sym)
                if key in seen:
                    continue
                seen.add(key)
                full_name = item.get("full_name") or item.get("description") or ""
                full_name = re.sub(r'<[^>]+>', '', full_name).strip()
                candidates.append({
                    "tv_symbol": sym,
                    "exchange": exch,
                    "full_name": full_name,
                    "type": item.get("type"),
                })
    
    return candidates

# =========================
# CONFIG
# =========================
st.set_page_config(page_title="Portfolio App", layout="wide")

# =========================
# DATABASE LAYER (Supports SQLite & PostgreSQL/Supabase)
# =========================
from db_layer import (
    get_conn, 
    query_df, 
    query_val, 
    exec_sql, 
    table_columns, 
    add_column_if_missing,
    get_db_type,
    is_postgres,
    init_postgres_schema,
    get_connection,
    convert_sql,
    convert_params,
    execute_with_cursor,
    DB_TYPE,
    DB_CONFIG,
    IS_PRODUCTION
)

# Initialize PostgreSQL schema if using Supabase/DigitalOcean PostgreSQL
if is_postgres():
    try:
        init_postgres_schema()
        print("✅ PostgreSQL schema initialized successfully")
    except Exception as e:
        import streamlit as st
        st.error(f"""
        ❌ **Database Connection Error**
        
        Could not connect to PostgreSQL database: `{e}`
        
        **Possible causes:**
        - DATABASE_URL is not set correctly in DigitalOcean/Heroku config vars
        - DATABASE_URL is empty or malformed
        - Database server is not accessible
        - psycopg2 driver not installed
        
        **To fix:**
        1. Verify DATABASE_URL is set in your app's environment variables
        2. Check the database is running and accessible
        3. Ensure the connection string includes `?sslmode=require`
        """)
        st.stop()
else:
    if IS_PRODUCTION:
        import streamlit as st
        st.error("""
        ❌ **CRITICAL: No PostgreSQL database in production!**
        
        Your app is running in a cloud environment but is using SQLite.
        **All data will be LOST on each deployment!**
        
        To fix: Add DATABASE_URL to your app's environment variables.
        """)
        st.stop()
    else:
        print("📁 SQLite database ready (local development)")


def get_db_info():
    """Get current database type and status for display."""
    try:
        from db_layer import DB_TYPE, DB_CONFIG, IS_PRODUCTION
        from urllib.parse import urlparse
        
        if DB_TYPE == 'postgres':
            # Parse URL to show host safely
            url = DB_CONFIG.get('url', '')
            if url:
                try:
                    parsed = urlparse(url)
                    host = parsed.hostname or 'unknown'
                    dbname = parsed.path.lstrip('/') if parsed.path else 'unknown'
                    return f"🐘 PostgreSQL ({host[:20]}.../{dbname})"
                except:
                    pass
            return "🐘 PostgreSQL (persistent)"
        elif DB_TYPE == 'sqlite':
            path = DB_CONFIG.get('path', 'portfolio.db')
            if '/tmp/' in path:
                return "⚠️ SQLite (EPHEMERAL - /tmp)"
            if IS_PRODUCTION:
                return "❌ SQLite in PRODUCTION (DATA LOSS RISK!)"
            return f"📁 SQLite ({path}) - Local Dev"
        return "❓ Unknown"
    except Exception as e:
        return f"📁 SQLite ({e})"


def db_execute(cur, sql: str, params: tuple = ()):
    """Execute SQL with automatic ? to %s conversion for PostgreSQL.
    
    Use this wrapper instead of cur.execute() to ensure cross-database compatibility.
    """
    return execute_with_cursor(None, cur, sql, params)


def convert_sql_placeholders(sql: str) -> str:
    """Convert ? placeholders to %s for PostgreSQL compatibility.
    
    Use this for pd.read_sql_query() which doesn't use db_execute().
    """
    if is_postgres():
        return sql.replace("?", "%s")
    return sql


# =========================
# AUTH HELPER FUNCTIONS
# =========================
def hash_password(password: str) -> str:
    """Hash a password for storing."""
    try:
        import bcrypt
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    except ImportError:
        return password

def check_password(password: str, hashed: str) -> bool:
    """Check a password against a hash. No plain text fallback for security."""
    try:
        import bcrypt
        # checkpw raises ValueError if hashed is not a valid salt/hash
        if not hashed or not isinstance(hashed, (str, bytes)):
            return False
        
        # Ensure hashed is bytes
        if isinstance(hashed, str):
            hashed_bytes = hashed.encode('utf-8')
        else:
            hashed_bytes = hashed
            
        return bcrypt.checkpw(password.encode('utf-8'), hashed_bytes)
    except Exception:
        return False

def get_current_user_id() -> Optional[int]:
    """Get the currently logged in user ID."""
    return st.session_state.get('user_id')

def create_session_token(user_id: int, days: int = 30) -> str:
    """Create a new session token for the user."""
    token = str(uuid.uuid4())
    now = int(time.time())
    expires_at = now + (days * 24 * 60 * 60)
    
    conn = get_conn()
    cur = conn.cursor()
    # Ensure cleanup of old tokens for this user to avoid bloat
    db_execute(cur, "DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
    
    db_execute(cur, "INSERT INTO user_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
               (token, user_id, expires_at, now))
    conn.commit()
    conn.close()
    return token, expires_at

def get_user_from_token(token: str) -> Optional[dict]:
    """Validate token and return user info if valid."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        now = int(time.time())
        
        # Clean expired sessions occasionally
        if np.random.random() < 0.1:
            try:
                conn.execute("DELETE FROM user_sessions WHERE expires_at < ?", (now,))
                conn.commit()
            except Exception:
                pass
            
        cur.execute("""
            SELECT u.id, u.username, sess.expires_at 
            FROM user_sessions sess
            JOIN users u ON sess.user_id = u.id
            WHERE sess.token = ? AND sess.expires_at > ?
        """, (token, now))
        
        row = cur.fetchone()
        conn.close()
        
        if row:
            return {"id": row[0], "username": row[1]}
        return None
    except Exception as e:
        # Table may not exist yet during init
        print(f"get_user_from_token error (may be expected on first run): {e}")
        return None

def delete_session_token(token: str):
    """Delete a specific session token."""
    conn = get_conn()
    conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def get_yf_ticker(symbol: str):
    """Get the correct Yahoo Finance ticker for a symbol from KUWAIT_STOCKS mapping.
    Returns the yf_ticker if found, otherwise returns the symbol as-is.
    """
    for stock in KUWAIT_STOCKS:
        if stock["symbol"] == symbol:
            return stock.get("yf_ticker", symbol)
    return symbol


def fetch_price_yfinance(symbol: str, max_retries: int = 3):
    """Fetch price using yfinance with correct Kuwait stock ticker mapping.
    
    Uses exponential backoff to avoid Yahoo Finance rate limits.
    Kuwait stock prices are divided by 1000 (fils to KWD conversion).
    
    Returns (price: float or None, used_ticker: str or None)
    """
    if not YFINANCE_AVAILABLE or yf is None:
        return None, None
    
    import time
    import random
    
    # Get the correct Yahoo Finance ticker (e.g., KRE -> KRE.KW)
    yf_ticker = get_yf_ticker(symbol)
    
    # Try the mapped ticker first, then fallback variants
    variants = [yf_ticker] if yf_ticker != symbol else [symbol, f"{symbol}.KW", f"{symbol}.KSE"]
    
    for variant in variants:
        is_kuwait_stock = variant.endswith('.KW') or variant.endswith('.KSE')
        
        for attempt in range(1, max_retries + 1):
            try:
                # Use .download() - more reliable than .history()
                hist = yf.download(
                    variant,
                    period="5d",
                    interval="1d",
                    progress=False,
                    auto_adjust=False,
                )
                
                if hist is not None and not hist.empty and 'Close' in hist.columns:
                    close_series = hist["Close"].dropna()
                    if not close_series.empty:
                        # Handle both single-ticker (Series) and multi-ticker (DataFrame) cases
                        last_close = close_series.iloc[-1]
                        if isinstance(last_close, pd.Series):
                            # Multi-ticker case - get the first (and only) value
                            price = float(last_close.iloc[0])
                        else:
                            # Single value case
                            price = float(last_close)
                        
                        if price > 0:
                            # Kuwait stocks: normalize Fils to KWD
                            if is_kuwait_stock:
                                price = normalize_kwd_price(price, 'KWD')
                            return float(price), variant
                        
            except Exception as e:
                # Exponential backoff for rate limits
                if attempt < max_retries:
                    wait = (2 ** attempt) + random.uniform(0.3, 1.0)
                    time.sleep(wait)
                continue
        
        # Small delay between ticker variants
        time.sleep(0.5)
    
    return None, None


@st.cache_data(ttl=3600)  # Cache for 1 hour
def cached_fetch_price(symbol: str):
    """Cached wrapper for fetch_price_yfinance to avoid repeated API calls."""
    return fetch_price_yfinance(symbol)


@st.cache_data(ttl=3600)  # Cache for 1 hour
def fetch_usd_kwd_rate(max_retries: int = 3):
    """Fetch USD to KWD exchange rate using yfinance.
    Returns rate as float. Falls back to hardcoded rate if API fails.
    """
    if not YFINANCE_AVAILABLE or yf is None:
        return 0.307  # Fallback rate
    
    import time
    import random
    
    for attempt in range(1, max_retries + 1):
        try:
            ticker = yf.Ticker("KWD=X")
            # Use history only - no .info
            hist = ticker.history(period="5d", interval="1d", auto_adjust=False)
            
            if hist is not None and not hist.empty and 'Close' in hist.columns:
                rate = float(hist["Close"].dropna().iloc[-1])
                if rate > 0:
                    return rate
                    
        except Exception:
            if attempt < max_retries:
                wait = (2 ** attempt) + random.uniform(0.3, 1.0)
                time.sleep(wait)
            continue
    
    # Return fallback rate if all attempts fail
    return 0.307  # Approximate USD/KWD rate


def fetch_price_tradingview_by_tv_symbol(tv_exchange: str, tv_symbol: str, session=None):
    """Fetch price from TradingView using best-effort methods.
    Returns (price, debug_msg).
    """
    if not tv_symbol:
        return None, "No TradingView symbol provided"
    
    if session is None:
        session = session_tv() if requests else None
    
    tv_key = normalize_tv_key(tv_exchange, tv_symbol)
    debug_parts = []
    
    # 1) Try TradingView widget quotes endpoint (unofficial best-effort)
    try:
        q = urllib.parse.quote_plus(tv_key)
        url = f"https://tvc4.forexpros.com/quotes/?symbols={q}"
        if requests and session:
            r = session.get(url, timeout=15)
            if r.status_code == 200:
                try:
                    payload = r.json()
                    if isinstance(payload, list) and payload:
                        item = payload[0]
                        price = None
                        if "d" in item and isinstance(item["d"], list) and item["d"]:
                            d0 = item["d"][0]
                            price = d0.get("v") or d0.get("price") or d0.get("last")
                        elif "price" in item:
                            price = item.get("price")
                        if price is not None:
                            return float(price), None
                except Exception as e:
                    debug_parts.append(f"quotes JSON error: {e}")
    except Exception as e:
        debug_parts.append(f"quotes endpoint error: {e}")
    
    # 2) Try symbol-search result (some include price)
    try:
        results = tradingview_search(tv_symbol, exchange=tv_exchange, limit=5, session=session)
        if results and isinstance(results, tuple):
            results = results[0]
        if results:
            for ritem in results:
                ex = (ritem.get("exchange") or "").strip().upper()
                sym = (ritem.get("symbol") or "").strip().upper()
                if ex == tv_exchange.strip().upper() and sym == tv_symbol.strip().upper():
                    price = ritem.get("price") or ritem.get("p")
                    if price is not None:
                        return float(price), None
            # Try first result if no exact match
            price = results[0].get("price") or results[0].get("p")
            if price is not None:
                return float(price), None
    except Exception as e:
        debug_parts.append(f"symbol-search price error: {e}")
    
    # 3) Page scrape (fragile last resort)
    try:
        url_page = f"https://www.tradingview.com/symbols/{tv_exchange}-{tv_symbol}/"
        if requests and session:
            rpage = session.get(url_page, timeout=20)
            if rpage.status_code == 200:
                import re
                txt = rpage.text
                m = re.search(r'"last_price"\s*:\s*([0-9]+\.[0-9]+)', txt)
                if m:
                    return float(m.group(1)), None
    except Exception as e:
        debug_parts.append(f"page scrape error: {e}")
    
    return None, " | ".join(debug_parts) if debug_parts else "No price found"


def init_db():
    """Initialize database schema. Handles both SQLite and PostgreSQL."""
    
    # If PostgreSQL, schema is already created by db_layer.init_postgres_schema()
    if is_postgres():
        print("🐘 Using PostgreSQL - schema already initialized")
        # Just ensure any missing columns are added
        for tbl in ["stocks", "transactions", "trading_history", "portfolio_cash", "cash_deposits"]:
            add_column_if_missing(tbl, "user_id", "INTEGER DEFAULT 1")
        add_column_if_missing("users", "email", "TEXT")
        add_column_if_missing("users", "name", "TEXT")
        add_column_if_missing("cash_deposits", "portfolio", "TEXT DEFAULT 'KFH'")
        add_column_if_missing("cash_deposits", "include_in_analysis", "INTEGER DEFAULT 1")
        add_column_if_missing("cash_deposits", "currency", "TEXT DEFAULT 'KWD'")
        add_column_if_missing("stocks", "current_price", "REAL DEFAULT 0")
        add_column_if_missing("stocks", "portfolio", "TEXT DEFAULT 'KFH'")
        add_column_if_missing("stocks", "currency", "TEXT DEFAULT 'KWD'")
        add_column_if_missing("stocks", "tradingview_symbol", "TEXT")
        add_column_if_missing("stocks", "tradingview_exchange", "TEXT")
        add_column_if_missing("transactions", "portfolio", "TEXT DEFAULT 'KFH'")
        add_column_if_missing("transactions", "category", "TEXT DEFAULT 'portfolio'")
        print("✅ PostgreSQL schema ready")
        return
    
    # SQLite initialization (original logic)
    conn = get_conn()
    cur = conn.cursor()
    
    print("🔧 Initializing SQLite database...")

    # ============================================
    # STEP 1: CREATE USERS TABLE FIRST (Priority #1)
    # This MUST exist before any table with user_id FK
    # ============================================
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name TEXT,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()  # Commit users table immediately
    
    # Verify users table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    if not cur.fetchone():
        raise Exception("CRITICAL: Failed to create users table!")
    print("✅ Step 1: Users table verified.")
    
    # Add missing columns to users (backwards compatibility)
    add_column_if_missing("users", "email", "TEXT")
    add_column_if_missing("users", "name", "TEXT")

    # ============================================
    # STEP 2: CREATE DEPENDENT TABLES (after users)
    # ============================================
    print("🔧 Step 2: Creating dependent tables...")

    # Password Resets (OTP)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS password_resets (
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )

    # User Sessions (for Keep me logged in)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )

    # Cash deposits
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS cash_deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            portfolio TEXT DEFAULT 'KFH',
            bank_name TEXT NOT NULL,
            deposit_date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            comments TEXT,
            created_at INTEGER NOT NULL
        )
        """
    )
    
    # Portfolio Cash (Manual Overrides)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_cash (
            portfolio TEXT,
            user_id INTEGER,
            balance REAL,
            currency TEXT DEFAULT 'KWD',
            last_updated INTEGER,
            PRIMARY KEY (portfolio, user_id)
        )
        """
    )
    
    # Add columns if they don't exist (Backwards compatibility)
    add_column_if_missing("cash_deposits", "user_id", "INTEGER")
    add_column_if_missing("cash_deposits", "portfolio", "TEXT DEFAULT 'KFH'")
    add_column_if_missing("cash_deposits", "include_in_analysis", "INTEGER DEFAULT 1")
    add_column_if_missing("cash_deposits", "currency", "TEXT DEFAULT 'KWD'")
    add_column_if_missing("cash_deposits", "source", "TEXT")  # New standardized column
    add_column_if_missing("cash_deposits", "notes", "TEXT")   # New standardized column
    
    # Check if we need to migrate portfolio_cash (it was PK=portfolio, now needs PK=(portfolio, user_id))
    # We can't casually alter PK in SQLite. We might need to handle this if old table exists.
    # Simple check: does it have user_id?
    try:
        # Check if portfolio_cash table exists and has user_id
        cols = table_columns("portfolio_cash")
        if "user_id" not in cols:
            # Need migration: Drop and recreate (Assuming data is ephemeral or simple enough to drop for this specific table which is just manual cache)
            # Or better: Create new table, copy data with default user_id=1, swap.
            pass # We'll handle migration logic below
    except Exception:
        pass

    # Stocks - COMPLEX: Needs UNIQUE(symbol, user_id)
    # If old table exists, it has UNIQUE(symbol).
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 1,
            symbol TEXT NOT NULL,
            name TEXT,
            current_price REAL DEFAULT 0,
            portfolio TEXT DEFAULT 'KFH',
            currency TEXT DEFAULT 'KWD',
            tradingview_symbol TEXT,
            tradingview_exchange TEXT,
            UNIQUE(symbol, user_id)
        )
        """
    )
    
    # Ensure stocks has all required columns immediately after creation
    # This handles case where table existed with old schema
    conn.commit()  # Commit the CREATE TABLE first
    add_column_if_missing("stocks", "current_price", "REAL DEFAULT 0")
    add_column_if_missing("stocks", "portfolio", "TEXT DEFAULT 'KFH'")
    add_column_if_missing("stocks", "currency", "TEXT DEFAULT 'KWD'")
    add_column_if_missing("stocks", "tradingview_symbol", "TEXT")
    add_column_if_missing("stocks", "tradingview_exchange", "TEXT")

    # Transactions - CREATE TABLE FIRST (for fresh DB)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            portfolio TEXT DEFAULT 'KFH',
            stock_symbol TEXT NOT NULL,
            txn_date TEXT NOT NULL,
            txn_type TEXT NOT NULL, 
            purchase_cost REAL NOT NULL DEFAULT 0,
            sell_value REAL NOT NULL DEFAULT 0,
            shares REAL NOT NULL DEFAULT 0,
            bonus_shares REAL NOT NULL DEFAULT 0,
            cash_dividend REAL NOT NULL DEFAULT 0,
            reinvested_dividend REAL NOT NULL DEFAULT 0,
            price_override REAL,
            planned_cum_shares REAL,
            fees REAL DEFAULT 0,
            broker TEXT,
            reference TEXT,
            notes TEXT,
            category TEXT DEFAULT 'portfolio',
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()
    
    # Ensure transactions has user_id (auto-migration for existing DBs)
    add_column_if_missing("transactions", "user_id", "INTEGER")
    add_column_if_missing("transactions", "portfolio", "TEXT DEFAULT 'KFH'")
    add_column_if_missing("transactions", "category", "TEXT DEFAULT 'portfolio'")

    # Transactions MIGRATION: Check if we need to expand txn_type constraint
    cur.execute("PRAGMA table_info(transactions)")
    cols = [r[1] for r in cur.fetchall()]

    # Check if we need to remove the strict CHECK constraint on txn_type
    # We do this by checking if we can insert a 'Deposit' type.
    try:
        cur.execute("INSERT INTO transactions (stock_symbol, txn_date, txn_type, created_at, user_id) VALUES ('TEST_Check', '2000-01-01', 'Deposit', 0, -1)")
        cur.execute("DELETE FROM transactions WHERE stock_symbol='TEST_Check'")
        # If successful, constraint is gone or compatible
    except sqlite3.IntegrityError:
        # Constraint exists. We need to recreate the table.
        # Rename old
        cur.execute("ALTER TABLE transactions RENAME TO transactions_old")
        
        # Create new with WIDER types and PORTFOLIO column
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                portfolio TEXT DEFAULT 'KFH',
                stock_symbol TEXT NOT NULL,
                txn_date TEXT NOT NULL,
                txn_type TEXT NOT NULL, 
                purchase_cost REAL NOT NULL DEFAULT 0,
                sell_value REAL NOT NULL DEFAULT 0,
                shares REAL NOT NULL DEFAULT 0,
                bonus_shares REAL NOT NULL DEFAULT 0,
                cash_dividend REAL NOT NULL DEFAULT 0,
                reinvested_dividend REAL NOT NULL DEFAULT 0,
                price_override REAL,
                planned_cum_shares REAL,
                fees REAL DEFAULT 0,
                broker TEXT,
                reference TEXT,
                notes TEXT,
                category TEXT,
                created_at INTEGER NOT NULL
            )
            """
        )
        
        # Copy data
        # Mapping old columns to new. 'portfolio' needs to be inferred from stocks table if possible
        # For now we default to KFH or try to join? 
        # Joining in an INSERT SELECT is possible.
        # NOTE: We avoid joining on stocks.user_id since it may not exist yet
        cur.execute("""
            INSERT INTO transactions (
                id, user_id, portfolio, stock_symbol, txn_date, txn_type, 
                purchase_cost, sell_value, shares, bonus_shares, 
                cash_dividend, reinvested_dividend, notes, created_at, category
            )
            SELECT 
                t.id, t.user_id, 'KFH', t.stock_symbol, t.txn_date, t.txn_type,
                t.purchase_cost, t.sell_value, t.shares, t.bonus_shares,
                t.cash_dividend, t.reinvested_dividend, t.notes, t.created_at, t.category
            FROM transactions_old t
        """)
        
        # Drop old
        cur.execute("DROP TABLE transactions_old")

    # Trading History (Separate Container for Trading Section)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trading_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            stock_symbol TEXT NOT NULL,
            txn_date TEXT NOT NULL,
            txn_type TEXT NOT NULL CHECK(txn_type IN ('Buy','Sell')),
            purchase_cost REAL NOT NULL DEFAULT 0,
            sell_value REAL NOT NULL DEFAULT 0,
            shares REAL NOT NULL DEFAULT 0,
            cash_dividend REAL NOT NULL DEFAULT 0,
            bonus_shares REAL NOT NULL DEFAULT 0,
            notes TEXT,
            created_at INTEGER NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()

    # ---- MIGRATION TO MULTI-USER ----
    # 1. Add user_id to all tables if missing
    for tbl in ["stocks", "transactions", "trading_history", "portfolio_cash", "cash_deposits"]:
        add_column_if_missing(tbl, "user_id", "INTEGER DEFAULT 1") # Default 1 for legacy data

    # 2. Fix 'stocks' unique constraint (UNIQUE(symbol) -> UNIQUE(symbol, user_id))
    # Check if we need to migrate
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Check if index is on just symbol
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='stocks'")
        res = cur.fetchone()
        if res:
            schema = res[0]
            if "UNIQUE(symbol, user_id)" not in schema and "UNIQUE (symbol, user_id)" not in schema:
                 # It likely has UNIQUE(symbol) or similar.
                 # We should reconstruct the table.
                 # st.info("Upgrading 'stocks' table for multi-user support...")
                 cur.execute("ALTER TABLE stocks RENAME TO stocks_old")
                 cur.execute("""
                    CREATE TABLE stocks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER DEFAULT 1,
                        symbol TEXT NOT NULL,
                        name TEXT,
                        current_price REAL DEFAULT 0,
                        portfolio TEXT DEFAULT 'KFH',
                        currency TEXT DEFAULT 'KWD',
                        tradingview_symbol TEXT,
                        tradingview_exchange TEXT,
                        UNIQUE(symbol, user_id)
                    )
                 """)
                 # Copy data - Handle potentially missing columns in old table gracefully if possible, but assuming standard schema here
                 # We just select known columns.
                 # Note: If cols missing in old table this might fail. But add_column_if_missing ran above so they should exist?
                 # Wait, add_column_if_missing runs on 'stocks' (the renamed one? No, we renamed it just now).
                 # Before rename, we haven't run add_column_if_missing on 'stocks' in THIS function run yet (it's below).
                 # So we rely on existing schema.
                 
                 # Better to select specific columns we know exist or use * if easy.
                 # Let's rely on add_column_if_missing having run in previous versions of the app.
                 cur.execute("INSERT INTO stocks (id, symbol, name) SELECT id, symbol, name FROM stocks_old")
                 
                 # Now update the other columns using UPDATE from old table, or just let them be default?
                 # If we just insert symbol/name, we lose prices/portfolio info!
                 # We must copy all data.
                 # PRAGMA table_info to get columns?
                 # Simpler: Just try to copy what we expect.
                 
                 cur.execute("UPDATE stocks SET current_price = (SELECT current_price FROM stocks_old WHERE stocks_old.id = stocks.id)")
                 cur.execute("UPDATE stocks SET portfolio = (SELECT portfolio FROM stocks_old WHERE stocks_old.id = stocks.id)")
                 cur.execute("UPDATE stocks SET currency = (SELECT currency FROM stocks_old WHERE stocks_old.id = stocks.id)")
                 cur.execute("UPDATE stocks SET tradingview_symbol = (SELECT tradingview_symbol FROM stocks_old WHERE stocks_old.id = stocks.id)")
                 
                 cur.execute("DROP TABLE stocks_old")
                 conn.commit()
    except Exception as e:
        # If migration fails, ensure we still have proper columns via add_column_if_missing
        try:
            conn.rollback()
        except:
            pass
        pass

    # Ensure stocks table has all needed columns (in case migration failed or table was created with old schema)
    add_column_if_missing("stocks", "current_price", "REAL DEFAULT 0")
    add_column_if_missing("stocks", "portfolio", "TEXT DEFAULT 'KFH'")
    add_column_if_missing("stocks", "currency", "TEXT DEFAULT 'KWD'")
    add_column_if_missing("stocks", "tradingview_symbol", "TEXT")
    add_column_if_missing("stocks", "tradingview_exchange", "TEXT")

    # 3. Fix 'portfolio_cash' PK (PK(portfolio) -> PK(portfolio, user_id))
    try:
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='portfolio_cash'")
        res = cur.fetchone()
        if res:
            schema = res[0]
            if "PRIMARY KEY (portfolio, user_id)" not in schema and "PRIMARY KEY(portfolio, user_id)" not in schema:
                 # st.info("Upgrading 'portfolio_cash' table...")
                 cur.execute("ALTER TABLE portfolio_cash RENAME TO portfolio_cash_old")
                 cur.execute("""
                    CREATE TABLE IF NOT EXISTS portfolio_cash (
                        portfolio TEXT,
                        user_id INTEGER DEFAULT 1,
                        balance REAL,
                        currency TEXT DEFAULT 'KWD',
                        last_updated INTEGER,
                        PRIMARY KEY (portfolio, user_id)
                    )
                 """)
                 cur.execute("INSERT INTO portfolio_cash (portfolio, balance, currency, last_updated) SELECT portfolio, balance, currency, last_updated FROM portfolio_cash_old")
                 cur.execute("UPDATE portfolio_cash SET user_id = 1")
                 cur.execute("DROP TABLE portfolio_cash_old")
                 conn.commit()
    except Exception as e:
         pass
    
    conn.close()

    # ---- Auto-upgrade (safe for existing DBs) ----
    add_column_if_missing("stocks", "current_price", "REAL DEFAULT 0")
    add_column_if_missing("stocks", "portfolio", "TEXT DEFAULT 'KFH'")   # ✅ KFH / BBYN / USA
    add_column_if_missing("stocks", "currency", "TEXT DEFAULT 'KWD'")    # ✅ KWD / USD
    add_column_if_missing("stocks", "tradingview_symbol", "TEXT")
    add_column_if_missing("stocks", "tradingview_exchange", "TEXT")

    add_column_if_missing("transactions", "price_override", "REAL DEFAULT NULL")
    add_column_if_missing("transactions", "planned_cum_shares", "REAL DEFAULT NULL")
    add_column_if_missing("transactions", "fees", "REAL DEFAULT 0")
    add_column_if_missing("transactions", "broker", "TEXT")
    add_column_if_missing("transactions", "reference", "TEXT")
    add_column_if_missing("transactions", "bonus_shares", "REAL DEFAULT 0")
    add_column_if_missing("transactions", "cash_dividend", "REAL DEFAULT 0")
    add_column_if_missing("transactions", "category", "TEXT DEFAULT 'portfolio'")  # 'portfolio' or 'trading'
    
    # Migrate CHECK constraint to allow DIVIDEND_ONLY (if needed)
    def migrate_transaction_type_constraint():
        """Update CHECK constraint to allow DIVIDEND_ONLY transaction type"""
        conn = get_conn()
        cur = conn.cursor()
        
        # Check if we need to migrate by testing if DIVIDEND_ONLY is allowed
        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
            if cur.fetchone():
                # Get the current schema
                cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")
                schema = cur.fetchone()
                if schema and "DIVIDEND_ONLY" not in schema[0]:
                    # Need to migrate - recreate table with new constraint
                    cur.execute("PRAGMA foreign_keys=off")
                    cur.execute("BEGIN TRANSACTION")
                    
                    # Rename old table
                    cur.execute("ALTER TABLE transactions RENAME TO transactions_old")
                    
                    # Create new table with updated constraint
                    cur.execute("""
                        CREATE TABLE transactions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            stock_symbol TEXT NOT NULL,
                            txn_date TEXT NOT NULL,
                            txn_type TEXT NOT NULL CHECK(txn_type IN ('Buy','Sell','DIVIDEND_ONLY')),
                            purchase_cost REAL NOT NULL DEFAULT 0,
                            sell_value REAL NOT NULL DEFAULT 0,
                            shares REAL NOT NULL DEFAULT 0,
                            reinvested_dividend REAL NOT NULL DEFAULT 0,
                            notes TEXT,
                            created_at INTEGER NOT NULL,
                            price_override REAL DEFAULT NULL,
                            planned_cum_shares REAL DEFAULT NULL,
                            fees REAL DEFAULT 0,
                            broker TEXT,
                            reference TEXT,
                            bonus_shares REAL DEFAULT 0,
                            cash_dividend REAL DEFAULT 0,
                            category TEXT DEFAULT 'portfolio'
                        )
                    """)
                    
                    # Copy data from old table
                    cur.execute("""
                        INSERT INTO transactions 
                        SELECT * FROM transactions_old
                    """)
                    
                    # Drop old table
                    cur.execute("DROP TABLE transactions_old")
                    cur.execute("COMMIT")
                    cur.execute("PRAGMA foreign_keys=on")
                    
                    conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Migration info: {e}")
        finally:
            conn.close()
    
    # NOTE: Migration disabled for performance - only needed once
    # migrate_transaction_type_constraint()
    
    # Portfolio tracker snapshots
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 1,
            snapshot_date TEXT NOT NULL,
            portfolio_value REAL NOT NULL,
            daily_movement REAL DEFAULT 0,
            beginning_difference REAL DEFAULT 0,
            deposit_cash REAL DEFAULT 0,
            accumulated_cash REAL DEFAULT 0,
            net_gain REAL DEFAULT 0,
            change_percent REAL DEFAULT 0,
            roi_percent REAL DEFAULT 0,
            created_at INTEGER NOT NULL,
            UNIQUE(snapshot_date, user_id)
        )
        """
    )
    
    # Migration for portfolio_snapshots to multi-user (UNIQUE snapshot_date -> UNIQUE snapshot_date, user_id)
    try:
        cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='portfolio_snapshots'")
        res = cur.fetchone()
        if res:
            schema = res[0]
            if "UNIQUE(snapshot_date, user_id)" not in schema and "UNIQUE (snapshot_date, user_id)" not in schema:
                # Need to migrate
                cur.execute("ALTER TABLE portfolio_snapshots RENAME TO portfolio_snapshots_old")
                cur.execute("""
                    CREATE TABLE portfolio_snapshots (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER DEFAULT 1,
                        snapshot_date TEXT NOT NULL,
                        portfolio_value REAL NOT NULL,
                        daily_movement REAL DEFAULT 0,
                        beginning_difference REAL DEFAULT 0,
                        deposit_cash REAL DEFAULT 0,
                        accumulated_cash REAL DEFAULT 0,
                        net_gain REAL DEFAULT 0,
                        change_percent REAL DEFAULT 0,
                        roi_percent REAL DEFAULT 0,
                        created_at INTEGER NOT NULL,
                        UNIQUE(snapshot_date, user_id)
                    )
                """)
                # Copy columns explicitly to match schema
                cur.execute("""
                    INSERT INTO portfolio_snapshots (id, user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                    SELECT id, 1, snapshot_date, portfolio_value, daily_movement, beginning_difference, deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at 
                    FROM portfolio_snapshots_old
                """)
                cur.execute("DROP TABLE portfolio_snapshots_old")
                conn.commit()
    except Exception:
        pass

    conn.commit()
    conn.close()
    
    # ============================================
    # PFM (Personal Financial Management) TABLES
    # ============================================
    conn = get_conn()
    cur = conn.cursor()
    
    # PFM Snapshots - master table for each reporting date
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pfm_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            snapshot_date TEXT NOT NULL,
            notes TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(user_id, snapshot_date)
        )
    """)
    
    # PFM Income & Expense Items
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pfm_income_expense_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
            category TEXT NOT NULL,
            monthly_amount REAL NOT NULL DEFAULT 0,
            is_finance_cost INTEGER DEFAULT 0,
            is_gna INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        )
    """)
    
    # PFM Asset Items
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pfm_asset_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            asset_type TEXT NOT NULL CHECK(asset_type IN ('real_estate', 'shares', 'gold', 'cash', 'crypto', 'other')),
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            quantity REAL,
            price REAL,
            currency TEXT DEFAULT 'KWD',
            value_kwd REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        )
    """)
    
    # PFM Liability Items
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pfm_liability_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            amount_kwd REAL NOT NULL DEFAULT 0,
            is_current INTEGER DEFAULT 0,
            is_long_term INTEGER DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()
    print("✅ PFM tables created.")
    
    # ============================================
    # DATABASE INDEXES FOR PERFORMANCE
    # ============================================
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Index on user_id for fast filtering (critical for multi-user queries)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_txn_user ON transactions(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_stocks_user ON stocks(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_user ON portfolio_snapshots(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_cash_deposits_user ON cash_deposits(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_trading_history_user ON trading_history(user_id)")
        
        # Composite indexes for common query patterns
        cur.execute("CREATE INDEX IF NOT EXISTS idx_txn_user_symbol ON transactions(user_id, stock_symbol)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date)")
        
        conn.commit()
        print("✅ Database indexes created for performance.")
    except Exception as e:
        print(f"⚠️ Index creation skipped: {e}")
    finally:
        conn.close()
    
    # ============================================
    # FIX NULL/DEFAULT USER_IDs (after restore or legacy data import)
    # ============================================
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Fix NULL/default user_ids by assigning to first active user with real data
        # First, find the main user (user with most transactions, typically user_id = 2)
        cur.execute("""
            SELECT user_id, COUNT(*) as cnt 
            FROM transactions 
            WHERE user_id > 1 
            GROUP BY user_id 
            ORDER BY cnt DESC 
            LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            default_user_id = row[0]
        else:
            # Fallback: find first user > 1
            cur.execute("SELECT id FROM users WHERE id > 1 ORDER BY id LIMIT 1")
            row = cur.fetchone()
            default_user_id = row[0] if row else 2
        
        # Fix cash_deposits with NULL user_id
        db_execute(cur, "UPDATE cash_deposits SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
        fixed_cash = cur.rowcount
        
        # Fix transactions with NULL user_id
        db_execute(cur, "UPDATE transactions SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
        fixed_txn = cur.rowcount
        
        # Fix stocks with NULL user_id  
        db_execute(cur, "UPDATE stocks SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
        fixed_stocks = cur.rowcount
        
        # Fix trading_history with NULL user_id
        db_execute(cur, "UPDATE trading_history SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
        fixed_trading = cur.rowcount
        
        # Fix portfolio_snapshots with NULL user_id OR default user_id=1 when main user is different
        db_execute(cur, "UPDATE portfolio_snapshots SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
        fixed_snapshots = cur.rowcount
        
        # Also migrate user_id=1 to main user if main user exists and has data
        if default_user_id > 1:
            cur.execute("SELECT COUNT(*) FROM portfolio_snapshots WHERE user_id = 1")
            old_user_count = cur.fetchone()[0]
            db_execute(cur, "SELECT COUNT(*) FROM portfolio_snapshots WHERE user_id = ?", (default_user_id,))
            new_user_count = cur.fetchone()[0]
            
            # If user_id=1 has snapshots but main user doesn't, migrate them
            if old_user_count > 0 and new_user_count == 0:
                db_execute(cur, "UPDATE portfolio_snapshots SET user_id = ? WHERE user_id = 1", (default_user_id,))
                fixed_snapshots += cur.rowcount
        
        conn.commit()
        
        total_fixed = fixed_cash + fixed_txn + fixed_stocks + fixed_trading + fixed_snapshots
        if total_fixed > 0:
            print(f"✅ Fixed {total_fixed} records with NULL/default user_id (assigned to user {default_user_id})")
    except Exception as e:
        print(f"⚠️ User ID fix skipped: {e}")
    finally:
        conn.close()
    
    # ============================================
    # STEP 3: VERIFICATION
    # ============================================
    print("✅ Step 3: Database initialized. Users table verified.")
    print("🔧 All tables created successfully.")
    
    # ============================================
    # SEED DEFAULT ADMIN USER (for cloud deployment)
    # ============================================
    seed_default_admin()


def seed_default_admin():
    """
    Create a default admin user if the users table is empty.
    This ensures cloud deployments have a login account.
    """
    conn = get_conn()
    cur = conn.cursor()
    
    try:
        cur.execute("SELECT count(*) FROM users")
        user_count = cur.fetchone()[0]
        
        if user_count == 0:
            import time
            
            # Hash the password with bcrypt
            try:
                import bcrypt
                hashed_pw = bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            except ImportError:
                # Fallback if bcrypt not available (plain text - not recommended for production)
                hashed_pw = "admin123"
                print("⚠️ WARNING: bcrypt not available, using plain text password")
            
            cur.execute(
                "INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                ('admin', 'admin@cloud.com', hashed_pw, int(time.time()))
            )
            conn.commit()
            print("✅ Default Admin User Created: admin / admin123")
            print("⚠️ IMPORTANT: Change this password after first login!")
    except Exception as e:
        print(f"Admin seed error: {e}")
    finally:
        conn.close()


# =========================
# UTIL
# =========================
def safe_float(v, default=0.0):
    try:
        if v is None or v == "":
            return default
        return float(v)
    except Exception:
        return default


def convert_to_kwd(amount: float, ccy: str) -> float:
    """Convert amount from given currency to KWD."""
    if amount is None:
        return 0.0
    if ccy == "KWD":
        return float(amount)
    if ccy == "USD":
        return float(amount) * float(st.session_state.usd_to_kwd)
    return float(amount)  # fallback


def fmt_money(amount: float, ccy: str) -> str:
    """Format money with appropriate decimals for currency."""
    if st.session_state.get("privacy_mode", False):
        return "*****"
    if amount is None:
        amount = 0.0
    if ccy == "KWD":
        return f"{ccy} {amount:,.3f}"
    elif ccy == "USD":
        return f"{ccy} {amount:,.2f}"
    else:
        return f"{ccy} {amount:,.2f}"


def fmt_money_plain(x, d=3):
    """Format money without currency prefix (legacy support)."""
    if st.session_state.get("privacy_mode", False):
        return "*****"
    try:
        return f"{float(x):,.{d}f}"
    except Exception:
        return f"{0:,.{d}f}"


def fmt_kwd(amount):
    """Format amount as KWD (for use with .map())."""
    return fmt_money(amount, "KWD")


# =========================
# PORTFOLIO CALCULATOR
# =========================
class PortfolioCalculator:
    """Calculate advanced portfolio metrics: TWR, MWRR, CAGR."""
    
    @staticmethod
    def calculate_twr(portfolio_history: pd.DataFrame, cash_flows: pd.DataFrame) -> Optional[float]:
        """
        Calculate Time-Weighted Return (TWR).
        
        Args:
            portfolio_history: DataFrame with columns [date, balance]
            cash_flows: DataFrame with columns [date, amount, type] 
                       where type can be 'DEPOSIT', 'WITHDRAWAL', or 'DIVIDEND'
        
        Returns:
            TWR as decimal (e.g., 0.125 = 12.5%) or None if calculation fails
        """
        try:
            if portfolio_history.empty:
                return None
            
            # Ensure dates are datetime
            portfolio_history = portfolio_history.copy()
            portfolio_history['date'] = pd.to_datetime(portfolio_history['date'])
            
            if cash_flows.empty:
                # No cash flows - simple return calculation
                v_start = portfolio_history.iloc[0]['balance']
                v_end = portfolio_history.iloc[-1]['balance']
                if v_start <= 0:
                    return None
                return (v_end - v_start) / v_start
            
            cash_flows = cash_flows.copy()
            cash_flows['date'] = pd.to_datetime(cash_flows['date'])
            cash_flows = cash_flows.sort_values('date')
            
            # Calculate sub-period returns
            period_returns = []
            prev_date = portfolio_history.iloc[0]['date']
            prev_value = portfolio_history.iloc[0]['balance']
            
            for i in range(len(cash_flows)):
                cf_date = cash_flows.iloc[i]['date']
                cf_amount = cash_flows.iloc[i]['amount']
                cf_type = cash_flows.iloc[i]['type']
                
                # Net cash flow interpretation:
                # - DEPOSIT: Money coming IN (+) - increases portfolio
                # - DIVIDEND: Money going OUT (-) - decreases portfolio but is return
                # - WITHDRAWAL: Money going OUT (-) - decreases portfolio
                if cf_type == 'DEPOSIT':
                    net_cf = cf_amount  # Money IN
                elif cf_type in ['DIVIDEND', 'WITHDRAWAL']:
                    net_cf = -cf_amount  # Money OUT
                else:
                    net_cf = 0
                
                # Get portfolio value just before this cash flow
                before_cf = portfolio_history[portfolio_history['date'] < cf_date]
                if before_cf.empty:
                    v0 = prev_value
                else:
                    v0 = before_cf.iloc[-1]['balance']
                
                # Get portfolio value at or after cash flow date
                at_or_after_cf = portfolio_history[portfolio_history['date'] >= cf_date]
                if at_or_after_cf.empty:
                    # No data after this cash flow, skip
                    continue
                
                # Value after the cash flow is reflected
                v1_with_cf = at_or_after_cf.iloc[0]['balance']
                
                # Remove the effect of cash flow to get the pre-cash-flow value
                # This gives us the market value change before the cash flow happened
                v1_before_cf = v1_with_cf - net_cf
                
                # Calculate period return: (V1 - V0) / V0
                # This measures pure market performance excluding the cash flow
                if v0 > 0:
                    period_return = (v1_before_cf - v0) / v0
                    period_returns.append(period_return)
                    prev_value = v1_with_cf
                    prev_date = cf_date
            
            # Add final period from last cash flow to end
            final_value = portfolio_history.iloc[-1]['balance']
            if prev_value > 0 and final_value != prev_value:
                final_return = (final_value - prev_value) / prev_value
                period_returns.append(final_return)
            
            # Calculate TWR by compounding all period returns
            if not period_returns:
                # Fallback to simple return
                v_start = portfolio_history.iloc[0]['balance']
                v_end = portfolio_history.iloc[-1]['balance']
                if v_start <= 0:
                    return None
                return (v_end - v_start) / v_start
            
            twr = 1.0
            for r in period_returns:
                twr *= (1 + r)
            
            return twr - 1
            
        except Exception as e:
            st.error(f"TWR calculation error: {e}")
            return None
    
    @staticmethod
    def calculate_mwrr(cash_flows: pd.DataFrame, current_value: float, start_date: date) -> Optional[float]:
        """
        Calculate Money-Weighted Return (MWRR/IRR) using XIRR with irregular dates.
        CFA-compliant calculation with proper cash flow signs.
        
        Args:
            cash_flows: DataFrame with columns [date, amount, type]
                       type can be 'DEPOSIT', 'DIVIDEND', 'WITHDRAWAL'
            current_value: Current portfolio value (must be > 0)
            start_date: Portfolio inception date
        
        Returns:
            MWRR as decimal (e.g., 0.125 = 12.5%) or None if calculation fails
        """
        try:
            # Validate current value
            if current_value is None or current_value <= 0:
                return None
            
            # Prepare cash flows from INVESTOR PERSPECTIVE
            # CRITICAL: Deposits = negative (money OUT), Dividends/Withdrawals = positive (money IN)
            cf_dates = []
            cf_amounts = []
            
            if not cash_flows.empty:
                cash_flows = cash_flows.copy()
                cash_flows['date'] = pd.to_datetime(cash_flows['date'])
                
                for _, row in cash_flows.iterrows():
                    cf_date = pd.to_datetime(row['date'])
                    amount = float(row['amount'])
                    cf_type = str(row['type']).upper()
                    
                    if amount == 0:
                        continue
                    
                    # Cash flow signs (investor perspective):
                    # - DEPOSIT: negative (money leaving investor to portfolio)
                    # - DIVIDEND: positive (cash returning to investor)
                    # - WITHDRAWAL: positive (money returning to investor)
                    if cf_type == 'DEPOSIT':
                        cf_value = -abs(amount)  # Always negative
                    elif cf_type in ['DIVIDEND', 'WITHDRAWAL']:
                        cf_value = abs(amount)   # Always positive
                    else:
                        continue
                    
                    cf_dates.append(cf_date)
                    cf_amounts.append(cf_value)
            
            # CRITICAL: Add final portfolio value as positive cash flow (withdrawal at end)
            today = pd.Timestamp.now()
            cf_dates.append(today)
            cf_amounts.append(abs(current_value))  # Always positive
            
            if len(cf_dates) < 2:
                return None  # Need at least one flow + final value
            
            # Validation: Must have at least one negative and one positive cash flow
            has_negative = any(cf < 0 for cf in cf_amounts)
            has_positive = any(cf > 0 for cf in cf_amounts)
            
            if not (has_negative and has_positive):
                return None  # IRR undefined without both signs
            
            # Sort by date
            sorted_pairs = sorted(zip(cf_dates, cf_amounts), key=lambda x: x[0])
            cf_dates = [x[0] for x in sorted_pairs]
            cf_amounts = [x[1] for x in sorted_pairs]
            
            # Combine same-day cash flows
            combined_dates = []
            combined_amounts = []
            current_date = None
            current_sum = 0.0
            
            for dt, amt in zip(cf_dates, cf_amounts):
                if current_date is None:
                    current_date = dt
                    current_sum = amt
                elif dt == current_date:
                    current_sum += amt
                else:
                    combined_dates.append(current_date)
                    combined_amounts.append(current_sum)
                    current_date = dt
                    current_sum = amt
            
            # Add last accumulated value
            if current_date is not None:
                combined_dates.append(current_date)
                combined_amounts.append(current_sum)
            
            cf_dates = combined_dates
            cf_amounts = combined_amounts
            
            # Reference date (first cash flow date)
            t0 = cf_dates[0]
            
            # Helper: Calculate year fraction using 365.25 (accounts for leap years)
            def year_frac(dt):
                days = (dt - t0).days
                return days / 365.25
            
            # NPV function: Sum of discounted cash flows
            def npv(rate):
                if rate <= -1.0:  # Prevent division by zero
                    return float('inf')
                total = 0.0
                for cf, dt in zip(cf_amounts, cf_dates):
                    tau = year_frac(dt)
                    total += cf / ((1 + rate) ** tau)
                return total
            
            # Derivative of NPV (for Newton-Raphson)
            def d_npv(rate):
                if rate <= -1.0:
                    return float('inf')
                total = 0.0
                for cf, dt in zip(cf_amounts, cf_dates):
                    tau = year_frac(dt)
                    total += -tau * cf / ((1 + rate) ** (tau + 1))
                return total
            
            # Newton-Raphson iteration
            r = 0.10  # Initial guess: 10%
            max_iterations = 100
            tolerance = 1e-8
            
            for iteration in range(max_iterations):
                f = npv(r)
                fp = d_npv(r)
                
                # Check for zero or very small derivative
                if abs(fp) < 1e-12:
                    break
                
                # Newton-Raphson update
                r_next = r - f / fp
                
                # Prevent invalid values
                if r_next < -0.999:
                    r_next = -0.95
                if r_next > 20:
                    r_next = 10.0
                
                # Check convergence
                if abs(r_next - r) < tolerance:
                    # Verify solution
                    final_npv = abs(npv(r_next))
                    if final_npv < 0.1:  # NPV close enough to zero
                        return r_next
                    break
                
                r = r_next
            
            # If Newton-Raphson didn't converge well, try scipy as fallback
            try:
                from scipy.optimize import newton
                
                def npv_func(rate):
                    return npv(rate)
                
                r_scipy = newton(npv_func, x0=0.1, maxiter=200, tol=1e-8)
                
                # Validate scipy result
                if abs(npv(r_scipy)) < 0.1 and -0.999 < r_scipy < 20:
                    return r_scipy
            except:
                pass  # Scipy failed, continue
            
            # Last resort: check if our Newton result is reasonable
            final_npv = abs(npv(r))
            if final_npv < 1.0 and -0.99 < r < 20:  # Relaxed tolerance
                return r
            
            return None  # Did not converge to valid solution
            
        except Exception as e:
            # Log error for debugging
            import traceback
            print(f"MWRR calculation error: {e}")
            traceback.print_exc()
            return None
    
    @staticmethod
    def calculate_cagr(v_start: float, v_end: float, date_start: date, date_end: date) -> Optional[float]:
        """
        Calculate Compound Annual Growth Rate (CAGR).
        
        Args:
            v_start: Initial portfolio value
            v_end: Final portfolio value
            date_start: Start date
            date_end: End date
        
        Returns:
            CAGR as decimal (e.g., 0.125 = 12.5%) or None if calculation fails
        """
        try:
            if v_start <= 0:
                return None
            
            # Calculate years
            days = (date_end - date_start).days
            years = days / 365.25
            
            if years < 0:
                return None
            
            # If less than 1 year, return absolute return
            if years < 1:
                return (v_end - v_start) / v_start
            
            # Calculate CAGR
            cagr = (v_end / v_start) ** (1 / years) - 1
            return cagr
            
        except Exception as e:
            st.error(f"CAGR calculation error: {e}")
            return None


def fmt_price(x, d=6):
    if st.session_state.get("privacy_mode", False):
        return "*****"
    try:
        return f"{float(x):.{d}f}"
    except Exception:
        return f"{0:.{d}f}"


def fmt_int(x):
    try:
        return f"{float(x):,.0f}"
    except Exception:
        return "0"


def pct(x, d=2):
    try:
        return f"{float(x)*100:.{d}f}%"
    except Exception:
        return "0.00%"

def _norm_col(c: str) -> str:
    return (
        str(c).strip().lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("/", "_")
        .replace("__", "_")
    )

def _to_iso_date(x) -> str:
    if x is None or (isinstance(x, float) and pd.isna(x)) or (isinstance(x, str) and x.strip() == ""):
        return ""
    try:
        dt = pd.to_datetime(x)
        return dt.date().isoformat()
    except Exception:
        return ""


def _safe_str(x) -> str:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return ""
    return str(x).strip()


def _safe_num(x, default=0.0) -> float:
    try:
        if x is None or (isinstance(x, float) and pd.isna(x)) or (isinstance(x, str) and x.strip() == ""):
            return float(default)
        return float(x)
    except Exception:
        return float(default)


from typing import Optional, List
def _pick_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:

    cols = set(df.columns)
    for c in candidates:
        if c in cols:
            return c
    return None

def compute_stock_metrics(tx_df: pd.DataFrame):
    if tx_df.empty:
        return {
            "total_buy_cost": 0.0,
            "total_buy_shares": 0.0,
            "current_shares": 0.0,
            "avg_cost": 0.0,
            "total_sell_value": 0.0,
            "total_reinvested": 0.0,
        }

    buy = tx_df[tx_df["txn_type"] == "Buy"]
    sell = tx_df[tx_df["txn_type"] == "Sell"]

    total_buy_cost = float(buy["purchase_cost"].sum())
    total_buy_shares = float(buy["shares"].sum())
    total_sell_value = float(sell["sell_value"].sum())
    total_reinvested = float(tx_df["reinvested_dividend"].sum())

    current_shares = float(buy["shares"].sum() - sell["shares"].sum() + tx_df.get("bonus_shares", 0).sum())
    avg_cost = (total_buy_cost / current_shares) if current_shares > 0 else 0.0

    return {
        "total_buy_cost": total_buy_cost,
        "total_buy_shares": total_buy_shares,
        "current_shares": current_shares,
        "avg_cost": float(avg_cost),
        "total_sell_value": total_sell_value,
        "total_reinvested": total_reinvested,
    }


def compute_transactions_view(tx_df: pd.DataFrame) -> pd.DataFrame:
    if tx_df.empty:
        return pd.DataFrame(columns=[
            "Serial", "id", "txn_date", "txn_type", "purchase_cost", "sell_value", "shares",
            "Price", "CUM shares", "planned_cum_shares", "Difference Shares",
            "bonus_shares", "cash_dividend", "reinvested_dividend",
            "fees", "broker", "reference", "notes", "created_at"
        ])

    df = tx_df.copy()
    df["txn_date"] = df["txn_date"].fillna("")
    df["created_at"] = df["created_at"].fillna(0)

    df = df.sort_values(["txn_date", "created_at", "id"], ascending=[True, True, True]).reset_index(drop=True)

    serial = []
    price_list = []
    cum_list = []
    diff_list = []

    running = 0.0

    for i, r in df.iterrows():
        serial.append(i + 1)

        shares = safe_float(r.get("shares", 0), 0)
        bonus = safe_float(r.get("bonus_shares", 0), 0)
        ttype = r.get("txn_type", "")
        pcost = safe_float(r.get("purchase_cost", 0), 0)
        svalue = safe_float(r.get("sell_value", 0), 0)
        override = r.get("price_override", None)
        planned = r.get("planned_cum_shares", None)

        # Auto price unless override exists
        if override is not None and str(override) != "" and pd.notna(override):
            p = safe_float(override, 0)
        else:
            if shares > 0 and ttype == "Buy":
                p = pcost / shares
            elif shares > 0 and ttype == "Sell":
                p = svalue / shares
            else:
                p = 0.0

        price_list.append(float(p))

        # cumulative shares
        if ttype == "Buy":
            running += shares
        elif ttype == "Sell":
            running -= shares

        # bonus shares always increase holdings
        running += bonus
        cum_list.append(float(running))

        # difference shares (if planned exists)
        if planned is None or str(planned) == "" or pd.isna(planned):
            diff_list.append(None)
        else:
            diff_list.append(float(safe_float(planned, 0) - running))

    df["Serial"] = serial
    df["Price"] = price_list
    df["CUM shares"] = cum_list
    df["Difference Shares"] = diff_list
    return df


# =========================
# PORTFOLIO ANALYSIS (FINANCE LOGIC)
# =========================
def compute_holdings_avg_cost(tx: pd.DataFrame):
    """
    Average cost method:
    - Buy: cost += purchase_cost + fees, shares += shares
    - Sell: reduce cost proportionally by avg cost, shares -= shares
    - Bonus shares: shares += bonus_shares (no cost)
    """
    if tx.empty:
        return {
            "shares": 0.0,
            "cost_basis": 0.0,
            "cash_div": 0.0,
            "bonus_shares": 0.0,
            "reinv": 0.0,
        }

    t = tx.copy()
    t["txn_date"] = t["txn_date"].fillna("")
    t["created_at"] = t["created_at"].fillna(0)
    t = t.sort_values(["txn_date", "created_at", "id"], ascending=[True, True, True])

    shares = 0.0
    cost = 0.0

    cash_div = float(t.get("cash_dividend", 0).fillna(0).sum())
    bonus_total = float(t.get("bonus_shares", 0).fillna(0).sum())
    reinv = float(t.get("reinvested_dividend", 0).fillna(0).sum())

    for _, r in t.iterrows():
        typ = str(r.get("txn_type", ""))
        sh = safe_float(r.get("shares", 0), 0.0)
        fees = safe_float(r.get("fees", 0), 0.0)
        buy_cost = safe_float(r.get("purchase_cost", 0), 0.0)
        bonus = safe_float(r.get("bonus_shares", 0), 0.0)

        if typ == "Buy":
            shares += sh
            cost += (buy_cost + fees)
        elif typ == "Sell":
            # reduce cost basis using current avg cost
            if shares > 0 and sh > 0:
                avg = cost / shares
                cost_removed = avg * sh
                cost -= cost_removed
                shares -= sh

        # bonus shares always increase shares with zero cost
        if bonus > 0:
            shares += bonus

    shares = max(shares, 0.0)
    cost = max(cost, 0.0)

    return {
        "shares": float(shares),
        "cost_basis": float(cost),
        "cash_div": float(cash_div),
        "bonus_shares": float(bonus_total),
        "reinv": float(reinv),
    }


def build_portfolio_table(portfolio_name: str):
    """Build portfolio table with optimized bulk transaction fetch (N+1 fix)."""
    user_id = st.session_state.get('user_id')
    
    # 1. Bulk Fetch Stocks for this portfolio
    stocks = query_df(
        """
        SELECT
            symbol,
            COALESCE(name,'') AS name,
            COALESCE(current_price,0) AS current_price,
            COALESCE(portfolio,'KFH') AS portfolio,
            COALESCE(currency,'KWD') AS currency
        FROM stocks
        WHERE COALESCE(portfolio,'KFH') = ? AND user_id = ?
        ORDER BY symbol ASC
        """,
        (portfolio_name, user_id),
    )

    if stocks.empty:
        return pd.DataFrame()

    # 2. Bulk Fetch All Transactions for this user (Performance Optimization)
    # Fetch once instead of per-stock query (eliminates N+1 problem)
    all_txs = query_df(
        """
        SELECT
            id, stock_symbol, txn_date, txn_type,
            purchase_cost, sell_value, shares,
            bonus_shares, cash_dividend,
            price_override, planned_cum_shares,
            reinvested_dividend, fees,
            broker, reference, notes, created_at
        FROM transactions
        WHERE user_id = ? AND COALESCE(category, 'portfolio') = 'portfolio'
        ORDER BY txn_date ASC, created_at ASC, id ASC
        """,
        (user_id,)
    )

    rows = []
    for _, srow in stocks.iterrows():
        sym = srow["symbol"]
        cp = safe_float(srow["current_price"], 0.0)

        # Filter transactions in memory (Fast - no DB round-trip)
        tx = all_txs[all_txs['stock_symbol'] == sym].copy()

        # Calculate metrics (business logic preserved)
        h = compute_holdings_avg_cost(tx)

        qty = h["shares"]
        
        # Skip empty positions early for performance
        if qty <= 0.001 and h["cost_basis"] <= 0.001 and h["cash_div"] <= 0.001:
            continue

        total_cost = h["cost_basis"]
        avg_cost = (total_cost / qty) if qty > 0 else 0.0

        mkt_price = cp
        mkt_value = qty * mkt_price
        unreal = mkt_value - total_cost

        cash_div = h["cash_div"]
        bonus_sh = h["bonus_shares"]
        reinv_div = h["reinv"]

        yield_pct = (cash_div / total_cost) if total_cost > 0 else 0.0
        total_pnl = (mkt_value + cash_div) - total_cost
        pnl_pct = (total_pnl / total_cost) if total_cost > 0 else 0.0
        
        display_name = srow.get('name') if srow.get('name') else sym
        
        rows.append({
            "Company": f"{display_name} - {sym}".strip(),
            "Symbol": sym,
            "Shares Qty": qty,
            "Avg Cost": avg_cost,
            "Total Cost": total_cost,
            "Market Price": mkt_price,
            "Market Value": mkt_value,
            "Unrealized P/L": unreal,
            "Cash Dividends": cash_div,
            "Reinvested Dividends": reinv_div,
            "Bonus Dividend Shares": bonus_sh,
            "Dividend Yield on Cost %": yield_pct,
            "Total PNL": total_pnl,
            "PNL %": pnl_pct,
            "Currency": srow["currency"],
        })

    df = pd.DataFrame(rows)
    
    if not df.empty:
        # Calculate weights
        total_cost_sum = float(df["Total Cost"].sum())
        df["Weight by Cost"] = df["Total Cost"].apply(lambda x: (x / total_cost_sum) if total_cost_sum > 0 else 0.0)
        df["Weighted Dividend Yield on Cost"] = df["Dividend Yield on Cost %"] * df["Weight by Cost"]
        df = df.sort_values(["Total Cost"], ascending=[False]).reset_index(drop=True)
        
    return df


def render_portfolio_table(title: str, df: pd.DataFrame, fx_usdkwd: Optional[float] = None):
    if df.empty:
        st.markdown('<div style="text-align: center; padding: 2rem; color: #9ca3af;">No stocks in this portfolio yet.</div>', unsafe_allow_html=True)
        return

    # --- PREPARE DATA FOR EXCEL-STYLE TABLE ---
    # 1. Calculate Total Portfolio Cost for Weighting
    total_portfolio_cost = df["Total Cost"].sum()
    
    # Fetch P/E Ratios
    if not df.empty and "Symbol" in df.columns:
        items = list(zip(df["Symbol"], df["Currency"]))
        pe_map = get_pe_ratios(items)
        df["P/E Ratio"] = df["Symbol"].map(pe_map)
    else:
        df["P/E Ratio"] = None

    # 2. Create the exact columns requested
    view_df = pd.DataFrame()
    view_df["Company"] = df["Company"]
    view_df["P/E Ratio"] = pd.to_numeric(df["P/E Ratio"], errors='coerce')
    view_df["Quantity"] = df["Shares Qty"]
    view_df["Avg. Cost Per Share"] = df["Avg Cost"]
    view_df["Total cost"] = df["Total Cost"]
    view_df["Market price"] = df["Market Price"]
    view_df["Market value"] = df["Market Value"]
    
    # Appreciation income = Market Value - Total Cost (Unrealized P/L)
    view_df["Appreciation income"] = df["Unrealized P/L"]
    
    view_df["Cash dividends"] = df["Cash Dividends"]
    view_df["amount reinvested from dividends"] = df["Reinvested Dividends"]
    view_df["Bonus dividend shares"] = df["Bonus Dividend Shares"]
    
    # Bonus share value = Bonus Shares * Market Price
    view_df["Bonus share value"] = view_df["Bonus dividend shares"] * view_df["Market price"]
    
    # Weight by Cost
    view_df["weight by Cost"] = (view_df["Total cost"] / total_portfolio_cost) if total_portfolio_cost > 0 else 0.0
    
    # Yield (%) = Cash Dividends / Total Cost
    view_df["Yield"] = view_df.apply(lambda x: (x["Cash dividends"] / x["Total cost"]) if x["Total cost"] > 0 else 0.0, axis=1)
    
    # Yield Amount = Cash Dividends
    view_df["Yield Amount"] = view_df["Cash dividends"]
    
    # Weighted yield = Weight * Yield
    view_df["Weighted yield"] = view_df["weight by Cost"] * view_df["Yield"]
    
    # Current Profit / Loss = Appreciation income + Cash dividends
    view_df["Current Profit / Loss"] = view_df["Appreciation income"] + view_df["Cash dividends"]
    
    # % = Current Profit / Loss / Total cost
    view_df["%"] = view_df.apply(lambda x: (x["Current Profit / Loss"] / x["Total cost"]) if x["Total cost"] > 0 else 0.0, axis=1)

    # --- TOTAL ROW ---
    total_row = {
        "Company": "TOTAL",
        "P/E Ratio": None,
        "Quantity": view_df["Quantity"].sum(),
        "Avg. Cost Per Share": 0.0, # Not applicable
        "Total cost": view_df["Total cost"].sum(),
        "Market price": 0.0, # Not applicable
        "Market value": view_df["Market value"].sum(),
        "Appreciation income": view_df["Appreciation income"].sum(),
        "Cash dividends": view_df["Cash dividends"].sum(),
        "amount reinvested from dividends": view_df["amount reinvested from dividends"].sum(),
        "Bonus dividend shares": view_df["Bonus dividend shares"].sum(),
        "Bonus share value": view_df["Bonus share value"].sum(),
        "weight by Cost": 1.0, # 100%
        "Yield": (view_df["Cash dividends"].sum() / view_df["Total cost"].sum()) if view_df["Total cost"].sum() > 0 else 0.0,
        "Yield Amount": view_df["Yield Amount"].sum(),
        "Weighted yield": view_df["Weighted yield"].sum(),
        "Current Profit / Loss": view_df["Current Profit / Loss"].sum(),
        "%": (view_df["Current Profit / Loss"].sum() / view_df["Total cost"].sum()) if view_df["Total cost"].sum() > 0 else 0.0
    }
    
    # Append Total Row
    view_df = pd.concat([view_df, pd.DataFrame([total_row])], ignore_index=True)

    # --- STYLING ---
    def color_positive_negative(val):
        """Color positive green, negative red, zero/neutral default."""
        if not isinstance(val, (int, float)):
            return ''
        if val > 0:
            return 'color: #10B981; font-weight: 600;' # Green
        elif val < 0:
            return 'color: #EF4444; font-weight: 600;' # Red
        return 'color: var(--text-color); opacity: 0.6;'

    # Formatters
    is_privacy = st.session_state.get("privacy_mode", False)
    
    def fmt_val(x, fmt_str):
        if is_privacy:
            return "*****"
        try:
            return fmt_str.format(x)
        except:
            return str(x)

    format_dict = {
        "Quantity": lambda x: fmt_val(x, "{:,.0f}"),
        "Avg. Cost Per Share": lambda x: fmt_val(x, "{:,.3f}"),
        "Total cost": lambda x: fmt_val(x, "{:,.3f}"),
        "Market price": lambda x: fmt_val(x, "{:,.3f}"),
        "P/E Ratio": "{:.2f}",
        "Market value": lambda x: fmt_val(x, "{:,.3f}"),
        "Appreciation income": lambda x: fmt_val(x, "{:,.3f}"),
        "Cash dividends": lambda x: fmt_val(x, "{:,.3f}"),
        "amount reinvested from dividends": lambda x: fmt_val(x, "{:,.3f}"),
        "Bonus dividend shares": lambda x: fmt_val(x, "{:,.0f}"),
        "Bonus share value": lambda x: fmt_val(x, "{:,.3f}"),
        "weight by Cost": "{:.2%}",
        "Yield": "{:.2%}",
        "Yield Amount": lambda x: fmt_val(x, "{:,.3f}"),
        "Weighted yield": "{:.2%}",
        "Current Profit / Loss": lambda x: fmt_val(x, "{:,.3f}"),
        "%": "{:.2%}"
    }

    # Apply Styling
    st.dataframe(
        view_df.style
        .format(format_dict)
        .applymap(color_positive_negative, subset=["Appreciation income", "Current Profit / Loss", "%"])
        .apply(lambda x: ['font-weight: bold; background-color: rgba(128,128,128,0.1); border-top: 2px solid gray' if x.name == len(view_df)-1 else '' for i in x], axis=1), # Style Total Row
        use_container_width=True,
        height=(len(view_df) + 1) * 35 + 3
    )
    
    st.markdown('</div>', unsafe_allow_html=True)


# =========================
# UI - CASH DEPOSITS
# =========================
def ui_cash_deposits():
    user_id = st.session_state.get('user_id')
    st.subheader("💰 Cash Deposits")
    
    # Clean up any deposits from year 1970 (likely corrupt data)
    try:
        corrupt_deposits = query_df(
            "SELECT COUNT(*) as count FROM cash_deposits WHERE deposit_date LIKE '1970%' AND user_id=?", (user_id,)
        )
        if not corrupt_deposits.empty and corrupt_deposits["count"].iloc[0] > 0:
            count = corrupt_deposits["count"].iloc[0]
            exec_sql("DELETE FROM cash_deposits WHERE deposit_date LIKE '1970%' AND user_id=?", (user_id,))
            st.success(f"🧹 Cleaned up {count:,} corrupt deposit(s) from year 1970")
    except:
        pass  # Silently continue if cleanup fails

    # Tabs for Manual Entry and Excel Upload
    tab1, tab2 = st.tabs(["➕ Manual Entry", "📥 Upload Excel"])
    
    with tab1:
        with st.expander("Add Deposit Manually", expanded=True):
            c1, c2, c3, c4, c5 = st.columns([1, 1, 1, 1, 0.8])
            portfolio = c1.selectbox("Portfolio", options=["KFH", "BBYN", "USA"], key="deposit_portfolio")
            bank_name = c2.text_input("Bank name", placeholder="e.g. KFH, NBK, KIB")
            deposit_date = c3.date_input("Date", value=date.today())
            amount = c4.number_input("Amount", min_value=0.0, step=10.0, format="%.3f")
            currency = c5.selectbox("Currency", options=["KWD", "USD"], key="deposit_currency")
            description = st.text_input("Description", placeholder="e.g. Salary, Transfer, Top-up")
            comments = st.text_area("Comments (optional)")
            include_in_analysis = st.checkbox("Include in Portfolio Analysis", value=True, 
                                            help="If checked, this deposit will be added to portfolio analysis. If unchecked, it will only be kept as a record.")

            if st.button("Save Deposit", type="primary"):
                if bank_name.strip() == "":
                    st.error("Bank name is required.")
                elif amount <= 0:
                    st.error("Amount must be > 0.")
                else:
                    deposit_date_str = deposit_date.isoformat()
                    
                    # Save to cash_deposits table
                    exec_sql(
                        """
                        INSERT INTO cash_deposits (user_id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            portfolio,
                            bank_name.strip(),
                            deposit_date_str,
                            float(amount),
                            currency,
                            description.strip(),
                            comments.strip(),
                            1 if include_in_analysis else 0,
                            int(time.time()),
                        ),
                    )
                    
                    # Only sync to portfolio_snapshots if include_in_analysis is True
                    if include_in_analysis:
                        # Check if snapshot already exists for this date
                        existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?", (deposit_date_str, user_id))
                        
                        if not existing.empty:
                            # Update existing snapshot with the deposit
                            exec_sql(
                                "UPDATE portfolio_snapshots SET deposit_cash = deposit_cash + ? WHERE snapshot_date = ? AND user_id = ?",
                                (float(amount), deposit_date_str, user_id)
                            )
                        else:
                            # Create new snapshot with just the deposit
                            # Get accumulated cash from previous date
                            prev_snap = query_df(
                                "SELECT accumulated_cash FROM portfolio_snapshots WHERE snapshot_date < ? AND user_id = ? ORDER BY snapshot_date DESC LIMIT 1",
                                (deposit_date_str, user_id)
                            )
                            
                            if not prev_snap.empty:
                                prev_acc = prev_snap["accumulated_cash"].iloc[0]
                                accumulated_cash = (float(prev_acc) if pd.notna(prev_acc) else 0) + float(amount)
                            else:
                                accumulated_cash = float(amount)
                            
                            # Calculate net_gain and roi
                            net_gain = 0 - accumulated_cash  # beginning_diff is 0 since no portfolio value yet
                            roi_percent = 0
                            
                            exec_sql(
                                """
                                INSERT INTO portfolio_snapshots 
                                (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (user_id, deposit_date_str, 0, 0, 0, float(amount), accumulated_cash, net_gain, 0, roi_percent, int(time.time()))
                            )
                    
                    success_msg = "Deposit saved!"
                    if include_in_analysis:
                        success_msg += " ✅ Added to Portfolio Analysis."
                    else:
                        success_msg += " 📝 Saved as record only (not in analysis)."
                    st.success(success_msg)
                    try:
                        st.rerun()
                    except:
                        pass
    
    with tab2:
        st.markdown("### 📥 Upload Cash Deposits from Excel")
        st.caption("Upload an Excel file with columns: **deposit_date**, **amount**, **currency**, **portfolio**, **include_in_analysis**, **bank_name**, **description**, **comments**")
        st.caption("📌 **include_in_analysis**: Use 'Yes' or 'Portfolio' to add to portfolio analysis, 'No' or 'Record' for record only")
        
        # Provide sample Excel template
        sample_deposits = pd.DataFrame([
            {
                "deposit_date": date.today().isoformat(),
                "amount": 1000.0,
                "currency": "KWD",
                "portfolio": "KFH",
                "include_in_analysis": "Yes",
                "bank_name": "KFH Bank",
                "description": "Monthly Salary",
                "comments": "Regular deposit",
            },
            {
                "deposit_date": date.today().isoformat(),
                "amount": 500.0,
                "currency": "USD",
                "portfolio": "USA",
                "include_in_analysis": "No",
                "bank_name": "US Bank",
                "description": "Transfer",
                "comments": "Record only",
            }
        ])
        
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            sample_deposits.to_excel(writer, sheet_name="Deposits", index=False)
        buf.seek(0)
        
        st.download_button(
            label="📥 Download Sample Template",
            data=buf,
            file_name="cash_deposits_template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        
        uploaded_file = st.file_uploader("Choose an Excel file", type=["xlsx"], key="cash_deposits_excel")
        
        if uploaded_file is not None:
            try:
                # Read and preview the file
                df = pd.read_excel(uploaded_file, sheet_name=0)
                
                # Normalize column names
                df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
                
                # Validate required columns
                required_cols = ["deposit_date", "amount"]
                missing = [c for c in required_cols if c not in df.columns]
                
                if missing:
                    st.error(f"❌ Missing required columns: {', '.join(missing)}")
                    st.info("Required columns: deposit_date, amount. Optional: currency, portfolio, include_in_analysis, bank_name, description, comments")
                else:
                    # Show preview
                    st.markdown("#### 📋 Preview (first 10 rows)")
                    st.dataframe(df.head(10), use_container_width=True)
                    st.info(f"📊 Found **{len(df):,}** deposits to import")
                    
                    # Import button
                    col_btn1, col_btn2 = st.columns([1, 3])
                    with col_btn1:
                        if st.button("✅ Import All Deposits", type="primary", use_container_width=True):
                            # Process the upload
                            success_count = 0
                            error_count = 0
                            in_analysis_count = 0
                            record_only_count = 0
                            error_messages = []
                            
                            # Add default values for optional columns
                            if "currency" not in df.columns:
                                df["currency"] = "KWD"
                            if "portfolio" not in df.columns:
                                df["portfolio"] = "KFH"
                            if "include_in_analysis" not in df.columns:
                                df["include_in_analysis"] = "Yes"
                            if "bank_name" not in df.columns:
                                df["bank_name"] = "N/A"
                            if "description" not in df.columns:
                                df["description"] = ""
                            if "comments" not in df.columns:
                                df["comments"] = ""
                            
                            progress_bar = st.progress(0, text="Importing deposits...")
                            
                            for idx, row in df.iterrows():
                                try:
                                    # Parse deposit date
                                    deposit_date_val = row["deposit_date"]
                                    if pd.isna(deposit_date_val):
                                        raise ValueError("deposit_date is empty")
                                    
                                    if isinstance(deposit_date_val, str):
                                        deposit_date_str = deposit_date_val.strip()
                                    else:
                                        deposit_date_str = pd.to_datetime(deposit_date_val).strftime("%Y-%m-%d")
                                    
                                    # Parse amount
                                    amount_val = row["amount"]
                                    if pd.isna(amount_val):
                                        raise ValueError("amount is empty")
                                    amount_val = float(amount_val)
                                    
                                    # Parse other fields with defaults
                                    currency_val = str(row.get("currency", "KWD")).strip().upper() if pd.notna(row.get("currency")) else "KWD"
                                    portfolio_val = str(row.get("portfolio", "KFH")).strip() if pd.notna(row.get("portfolio")) else "KFH"
                                    bank_name_val = str(row.get("bank_name", "N/A")).strip() if pd.notna(row.get("bank_name")) else "N/A"
                                    description_val = str(row.get("description", "")).strip() if pd.notna(row.get("description")) else ""
                                    comments_val = str(row.get("comments", "")).strip() if pd.notna(row.get("comments")) else ""
                                    
                                    # Parse include_in_analysis
                                    include_raw = row.get("include_in_analysis", "Yes")
                                    if pd.isna(include_raw):
                                        include_in_analysis = True
                                    else:
                                        include_val = str(include_raw).strip().lower()
                                        include_in_analysis = include_val in ["yes", "y", "true", "1", "portfolio"]
                                    
                                    if include_in_analysis:
                                        in_analysis_count += 1
                                    else:
                                        record_only_count += 1
                                    
                                    # Insert into database with user_id
                                    exec_sql(
                                        """
                                        INSERT INTO cash_deposits 
                                        (user_id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis, created_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        """,
                                        (
                                            user_id,
                                            portfolio_val,
                                            bank_name_val,
                                            deposit_date_str,
                                            amount_val,
                                            currency_val,
                                            description_val,
                                            comments_val,
                                            1 if include_in_analysis else 0,
                                            int(time.time()),
                                        ),
                                    )
                                    
                                    # Sync to portfolio_snapshots if include_in_analysis is True
                                    if include_in_analysis:
                                        existing = query_df(
                                            "SELECT * FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?", 
                                            (deposit_date_str, user_id)
                                        )
                                        
                                        if not existing.empty:
                                            exec_sql(
                                                "UPDATE portfolio_snapshots SET deposit_cash = deposit_cash + ? WHERE snapshot_date = ? AND user_id = ?",
                                                (amount_val, deposit_date_str, user_id)
                                            )
                                        else:
                                            prev_snap = query_df(
                                                "SELECT accumulated_cash FROM portfolio_snapshots WHERE snapshot_date < ? AND user_id = ? ORDER BY snapshot_date DESC LIMIT 1",
                                                (deposit_date_str, user_id)
                                            )
                                            
                                            if not prev_snap.empty:
                                                prev_acc = prev_snap["accumulated_cash"].iloc[0]
                                                accumulated_cash = (float(prev_acc) if pd.notna(prev_acc) else 0) + amount_val
                                            else:
                                                accumulated_cash = amount_val
                                            
                                            net_gain = 0 - accumulated_cash
                                            
                                            exec_sql(
                                                """
                                                INSERT INTO portfolio_snapshots 
                                                (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                                                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                                """,
                                                (user_id, deposit_date_str, 0, 0, 0, amount_val, accumulated_cash, net_gain, 0, 0, int(time.time()))
                                            )
                                    
                                    success_count += 1
                                    
                                except Exception as e:
                                    error_count += 1
                                    error_messages.append(f"Row {idx + 2}: {str(e)[:80]}")
                                
                                # Update progress
                                progress_bar.progress((idx + 1) / len(df), text=f"Importing... {idx + 1}/{len(df)}")
                            
                            progress_bar.empty()
                            
                            # Show results
                            if success_count > 0:
                                status_parts = [f"✅ Successfully imported **{success_count:,}** deposits!"]
                                if in_analysis_count > 0:
                                    status_parts.append(f"📊 {in_analysis_count:,} added to portfolio analysis")
                                if record_only_count > 0:
                                    status_parts.append(f"📝 {record_only_count:,} saved as records only")
                                st.success(" | ".join(status_parts))
                            
                            if error_count > 0:
                                st.error(f"❌ {error_count:,} deposits failed to import.")
                                with st.expander("View Error Details"):
                                    for msg in error_messages[:20]:  # Show first 20 errors
                                        st.text(msg)
                                    if len(error_messages) > 20:
                                        st.text(f"... and {len(error_messages) - 20} more errors")
                            
                            if success_count > 0:
                                time.sleep(1)
                                st.rerun()
                    
                    with col_btn2:
                        st.caption("This will import all deposits from the uploaded file.")
                        
            except Exception as e:
                st.error(f"❌ Error reading Excel file: {e}")
                st.info("Please ensure the file is a valid Excel file (.xlsx) with the correct column names.")


    st.divider()
    
    st.subheader("💰 Deposits History")
    
    # Filter and sort options
    col1, col2 = st.columns([1, 1])
    with col1:
        filter_option = st.selectbox(
            "Filter",
            ["All Deposits", "In Portfolio Analysis", "Records Only"],
            key="deposits_filter"
        )
    with col2:
        sort_option = st.selectbox(
            "Sort By",
            ["Newest First", "Oldest First"],
            key="deposits_sort"
        )
    
    sort_order = "DESC" if sort_option == "Newest First" else "ASC"
    
    # Build query based on filter
    if filter_option == "In Portfolio Analysis":
        deposits = query_df(
            f"""
            SELECT id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis
            FROM cash_deposits
            WHERE include_in_analysis = 1 AND user_id = ?
            ORDER BY deposit_date {sort_order}, id {sort_order}
            """, (user_id,)
        )
    elif filter_option == "Records Only":
        deposits = query_df(
            f"""
            SELECT id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis
            FROM cash_deposits
            WHERE include_in_analysis = 0 AND user_id = ?
            ORDER BY deposit_date {sort_order}, id {sort_order}
            """, (user_id,)
        )
    else:
        deposits = query_df(
            f"""
            SELECT id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis
            FROM cash_deposits
            WHERE user_id = ?
            ORDER BY deposit_date {sort_order}, id {sort_order}
            """, (user_id,)
        )

    if deposits.empty:
        st.info("No deposits yet.")
        return
    
    # Add human-readable status column
    deposits["Status"] = deposits["include_in_analysis"].apply(
        lambda x: "✅ In Analysis" if x == 1 else "📋 Record Only"
    )
    
    # Convert all amounts to KWD for total calculation
    deposits["amount_in_kwd"] = deposits.apply(
        lambda row: convert_to_kwd(row["amount"], row.get("currency", "KWD")),
        axis=1
    )
    
    # Summary cards (all in KWD)
    total_deposits = deposits["amount_in_kwd"].sum()
    total_in_analysis = deposits[deposits["include_in_analysis"] == 1]["amount_in_kwd"].sum()
    total_records_only = deposits[deposits["include_in_analysis"] == 0]["amount_in_kwd"].sum()
    
    # Group by portfolio for summary
    portfolios = deposits["portfolio"].unique()
    
    # Create columns: Total card + portfolio cards
    num_cols = len(portfolios) + 1
    cols = st.columns(num_cols)
    
    # Total card (in KWD)
    with cols[0]:
        st.metric("💰 Total Cash Deposits (KWD)", fmt_money_plain(total_deposits))
        st.caption(f"In Analysis: {fmt_money_plain(total_in_analysis)} | Records: {fmt_money_plain(total_records_only)}")
    
    # Portfolio cards
    for idx, port in enumerate(portfolios):
        port_deposits = deposits[deposits["portfolio"] == port]
        port_total = port_deposits["amount"].sum()
        port_in_analysis = port_deposits[port_deposits["include_in_analysis"] == 1]["amount"].sum()
        with cols[idx + 1]:
            st.metric(f"{port} Total", fmt_money_plain(port_total))
            st.caption(f"In Analysis: {fmt_money_plain(port_in_analysis)}")
    
    st.divider()
    
    # Delete options
    col1, col2, col3 = st.columns([2, 1, 1])
    
    if not st.session_state.get("confirm_delete_all"):
        with col2:
            if st.button("🗑️ Delete All Deposits", type="secondary", use_container_width=True, key="delete_all_btn"):
                st.session_state.confirm_delete_all = True
                st.rerun()
    else:
        with col2:
            if st.button("❌ Cancel", type="secondary", use_container_width=True, key="cancel_delete_btn"):
                st.session_state.confirm_delete_all = False
                st.rerun()
        
        with col3:
            if st.button("✅ Confirm Delete All", type="primary", use_container_width=True, key="confirm_delete_btn"):
                # Hard delete all deposits for current user only
                conn = get_conn()
                cur = conn.cursor()
                user_id = st.session_state.get('user_id', 1)
                db_execute(cur, "DELETE FROM cash_deposits WHERE user_id = ?", (user_id,))
                conn.commit()
                conn.close()
                st.session_state.confirm_delete_all = False
                st.rerun()
        
        st.warning("⚠️ Are you sure? This will permanently delete ALL deposits and cannot be undone!")
    
    # Show total count
    st.info(f"📊 Total: **{len(deposits)}** cash deposit transactions")
    
    # Column headers
    header_cols = st.columns([0.5, 1.5, 1.5, 1.8, 1.2, 0.8, 1.2, 2, 2, 1.2])
    with header_cols[0]:
        st.markdown("**#**")
    with header_cols[1]:
        st.markdown("**Date**")
    with header_cols[2]:
        st.markdown("**Portfolio**")
    with header_cols[3]:
        st.markdown("**Bank**")
    with header_cols[4]:
        st.markdown("**Amount**")
    with header_cols[5]:
        st.markdown("**Ccy**")
    with header_cols[6]:
        st.markdown("**Status**")
    with header_cols[7]:
        st.markdown("**Description**")
    with header_cols[8]:
        st.markdown("**Comments**")
    with header_cols[9]:
        st.markdown("**Actions**")
    
    st.divider()
    
    # Display deposits table with edit and delete buttons
    for row_num, (idx, row) in enumerate(deposits.iterrows(), start=1):
        deposit_id = int(row["id"])
        
        # Check if this deposit is being edited
        edit_key = f"edit_deposit_{deposit_id}"
        is_editing = st.session_state.get(edit_key, False)
        
        if is_editing:
            # Show edit form (without sequence number column in edit mode)
            with st.container():
                st.markdown(f"**✏️ Editing Deposit #{row_num} (ID: {deposit_id})**")
                
                edit_cols = st.columns([2, 2, 2, 2])
                
                with edit_cols[0]:
                    new_date = st.date_input(
                        "Date", 
                        value=pd.to_datetime(row["deposit_date"]).date(),
                        key=f"edit_date_{deposit_id}"
                    )
                
                with edit_cols[1]:
                    new_portfolio = st.selectbox(
                        "Portfolio",
                        ["KFH", "BBYN", "USA"],
                        index=["KFH", "BBYN", "USA"].index(row["portfolio"]) if row["portfolio"] in ["KFH", "BBYN", "USA"] else 0,
                        key=f"edit_portfolio_{deposit_id}"
                    )
                
                with edit_cols[2]:
                    new_bank = st.text_input(
                        "Bank Name",
                        value=row["bank_name"],
                        key=f"edit_bank_{deposit_id}"
                    )
                
                with edit_cols[3]:
                    new_amount = st.number_input(
                        "Amount",
                        value=float(row["amount"]),
                        min_value=0.0,
                        step=0.001,
                        format="%.3f",
                        key=f"edit_amount_{deposit_id}"
                    )
                
                edit_cols2 = st.columns([2, 2, 4])
                
                with edit_cols2[0]:
                    new_currency = st.selectbox(
                        "Currency",
                        [BASE_CCY, USD_CCY],
                        index=0 if row.get("currency", "KWD") == BASE_CCY else 1,
                        key=f"edit_currency_{deposit_id}"
                    )
                
                with edit_cols2[1]:
                    new_include = st.checkbox(
                        "Include in Portfolio Analysis",
                        value=bool(row["include_in_analysis"]),
                        key=f"edit_include_{deposit_id}"
                    )
                
                new_description = st.text_input(
                    "Description",
                    value=row["description"] if pd.notna(row["description"]) else "",
                    key=f"edit_description_{deposit_id}"
                )
                
                new_comments = st.text_area(
                    "Comments",
                    value=row["comments"] if pd.notna(row["comments"]) else "",
                    key=f"edit_comments_{deposit_id}",
                    height=80
                )
                
                # Action buttons
                action_cols = st.columns([1, 1, 4])
                with action_cols[0]:
                    if st.button("💾 Save", key=f"save_{deposit_id}", type="primary"):
                        # Update the deposit
                        exec_sql(
                            """
                            UPDATE cash_deposits 
                            SET deposit_date = ?, portfolio = ?, bank_name = ?, amount = ?, 
                                currency = ?, description = ?, comments = ?, include_in_analysis = ?
                            WHERE id = ?
                            """,
                            (
                                new_date.strftime("%Y-%m-%d"),
                                new_portfolio,
                                new_bank,
                                new_amount,
                                new_currency,
                                new_description,
                                new_comments,
                                1 if new_include else 0,
                                deposit_id
                            )
                        )
                        st.session_state[edit_key] = False
                        st.success("✅ Deposit updated successfully!")
                        st.rerun()
                
                with action_cols[1]:
                    if st.button("❌ Cancel", key=f"cancel_edit_{deposit_id}"):
                        st.session_state[edit_key] = False
                        st.rerun()
                
                st.divider()
        
        else:
            # Show normal row view
            with st.container():
                cols = st.columns([0.5, 1.5, 1.5, 1.8, 1.2, 0.8, 1.2, 2, 2, 1.2])
                
                with cols[0]:
                    st.text(f"{row_num}")
                with cols[1]:
                    st.text(row["deposit_date"])
                with cols[2]:
                    st.text(row["portfolio"])
                with cols[3]:
                    st.text(row["bank_name"])
                with cols[4]:
                    st.text(fmt_money_plain(row["amount"]))
                with cols[5]:
                    st.text(row.get("currency", "KWD"))
                with cols[6]:
                    st.text(row["Status"])
                with cols[7]:
                    st.text(row["description"] if pd.notna(row["description"]) else "")
                with cols[8]:
                    st.text(row["comments"] if pd.notna(row["comments"]) else "")
                with cols[9]:
                    action_cols = st.columns(2)
                    with action_cols[0]:
                        if st.button("✏️", key=f"edit_{deposit_id}", help="Edit this deposit"):
                            st.session_state[edit_key] = True
                            st.rerun()
                    with action_cols[1]:
                        if st.button("🗑️", key=f"delete_{deposit_id}", help="Delete this deposit"):
                            # Hard delete individual deposit
                            conn = get_conn()
                            cur = conn.cursor()
                            db_execute(cur, "DELETE FROM cash_deposits WHERE id = ?", (deposit_id,))
                            conn.commit()
                            conn.close()
                            st.rerun()
                
                st.divider()

def update_portfolio_cash(user_id: int, portfolio: str, delta: float, currency="KWD"):
    """
    Updates the cached cash balance (General Ledger).
    delta > 0: Deposit/Sell proceeds
    delta < 0: Withdrawal/Buy cost
    """
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Check current balance
        db_execute(cur, "SELECT balance FROM portfolio_cash WHERE user_id=? AND portfolio=?", (user_id, portfolio))
        row = cur.fetchone()
        
        if row:
            new_bal = row[0] + delta
            db_execute(cur, "UPDATE portfolio_cash SET balance=?, last_updated=? WHERE user_id=? AND portfolio=?", 
                       (new_bal, int(time.time()), user_id, portfolio))
        else:
            # Initialize if missing
            db_execute(cur, "INSERT INTO portfolio_cash (user_id, portfolio, balance, currency, last_updated) VALUES (?, ?, ?, ?, ?)",
                       (user_id, portfolio, delta, currency, int(time.time())))
        
        conn.commit()
        conn.close()
    except Exception as e:
        st.error(f"Cash Update Error: {e}")

@st.cache_data(ttl=300)
def load_stocks_master():
    """
    Loads distinct stored stocks from the database for the search dropdown.
    Returns a DataFrame with columns: symbol, name.
    """
    try:
        # We query the stocks table. 
        # The user has stocks stored here with symbol, name, portfolio, currency etc.
        # We'll use this as the master list.
        user_id = st.session_state.get('user_id', 1)
        df = query_df(
            "SELECT symbol, name, portfolio, currency FROM stocks WHERE user_id = ? ORDER BY symbol",
            (user_id,)
        )
        return df
    except Exception as e:
        print(f"Error loading stocks master: {e}")
        return pd.DataFrame(columns=["symbol", "name", "portfolio", "currency"])


def generate_sample_transactions_excel():
    """Generate a sample Excel file for transaction imports."""
    import io
    
    # Sample data matching database schema
    sample_data = {
        'stock_symbol': ['NBK', 'ZAIN', 'AAPL', 'KFH', 'AGILITY'],
        'stock_name': ['National Bank of Kuwait', 'Zain Telecom', 'Apple Inc', 'Kuwait Finance House', 'Agility Public Warehousing'],
        'portfolio': ['KFH', 'KFH', 'USA', 'BBYN', 'KFH'],
        'currency': ['KWD', 'KWD', 'USD', 'KWD', 'KWD'],
        'txn_date': ['2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05', '2024-05-15'],
        'txn_type': ['Buy', 'Buy', 'Buy', 'Buy', 'Sell'],
        'category': ['portfolio', 'portfolio', 'portfolio', 'portfolio', 'portfolio'],
        'shares': [1000, 500, 50, 2000, 300],
        'purchase_cost': [1050.000, 275.000, 8500.00, 1580.000, 0],
        'sell_value': [0, 0, 0, 0, 450.000],
        'cash_dividend': [0, 0, 0, 0, 0],
        'reinvested_dividend': [0, 0, 0, 0, 0],
        'bonus_shares': [0, 0, 0, 0, 0],
        'fees': [5.25, 2.75, 10.00, 7.90, 3.50],
        'broker': ['Markaz', 'NBK Capital', 'Interactive Brokers', 'KFH Capital', 'Markaz'],
        'reference': ['TXN-2024-001', 'TXN-2024-002', 'TXN-2024-003', 'TXN-2024-004', 'TXN-2024-005'],
        'notes': ['Initial purchase', 'Adding position', 'US market entry', 'Long term hold', 'Partial profit taking']
    }
    
    df = pd.DataFrame(sample_data)
    
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Transactions')
        
        workbook = writer.book
        worksheet = writer.sheets['Transactions']
        
        # Header format
        header_fmt = workbook.add_format({'bold': True, 'bg_color': '#4472C4', 'font_color': 'white', 'border': 1})
        for col_num, value in enumerate(df.columns.values):
            worksheet.write(0, col_num, value, header_fmt)
            worksheet.set_column(col_num, col_num, 18)
        
        # Add instructions sheet
        instructions_sheet = workbook.add_worksheet('Instructions')
        instructions = [
            ['Column', 'Required', 'Description', 'Example Values'],
            ['stock_symbol', 'YES', 'Stock ticker symbol (uppercase)', 'NBK, ZAIN, AAPL'],
            ['stock_name', 'No', 'Full company name', 'National Bank of Kuwait'],
            ['portfolio', 'No', 'Portfolio group (default: KFH)', 'KFH, BBYN, USA'],
            ['currency', 'No', 'Currency code (default: KWD)', 'KWD, USD'],
            ['txn_date', 'YES', 'Transaction date (YYYY-MM-DD)', '2024-01-15'],
            ['txn_type', 'YES', 'Transaction type', 'Buy, Sell, DIVIDEND_ONLY'],
            ['category', 'No', 'Category (default: portfolio)', 'portfolio, record'],
            ['shares', 'YES', 'Number of shares', '1000'],
            ['purchase_cost', 'No', 'Total cost for Buy (in currency)', '1050.000'],
            ['sell_value', 'No', 'Total value for Sell (in currency)', '1200.000'],
            ['cash_dividend', 'No', 'Cash dividend received', '25.500'],
            ['reinvested_dividend', 'No', 'Dividend reinvested', '0'],
            ['bonus_shares', 'No', 'Bonus shares received', '50'],
            ['fees', 'No', 'Transaction fees/commission', '5.25'],
            ['broker', 'No', 'Broker name', 'Markaz, NBK Capital'],
            ['reference', 'No', 'Reference number', 'TXN-2024-001'],
            ['notes', 'No', 'Additional notes', 'Long term investment'],
        ]
        
        title_fmt = workbook.add_format({'bold': True, 'font_size': 14, 'bg_color': '#4472C4', 'font_color': 'white'})
        header_fmt2 = workbook.add_format({'bold': True, 'bg_color': '#D9E2F3', 'border': 1})
        cell_fmt = workbook.add_format({'border': 1, 'text_wrap': True})
        
        instructions_sheet.set_column(0, 0, 20)
        instructions_sheet.set_column(1, 1, 10)
        instructions_sheet.set_column(2, 2, 45)
        instructions_sheet.set_column(3, 3, 30)
        
        for row_num, row_data in enumerate(instructions):
            fmt = header_fmt2 if row_num == 0 else cell_fmt
            for col_num, value in enumerate(row_data):
                instructions_sheet.write(row_num, col_num, value, fmt)
    
    return buffer.getvalue()


def ui_transactions():
    st.subheader("Add Transactions (per stock)")
    
    # --- Sample Download ---
    with st.expander("📥 Download Sample Template"):
        st.markdown("""
        Download a sample Excel template to see the expected format for importing transactions.
        The template includes:
        - **Transactions sheet**: Sample data with all columns
        - **Instructions sheet**: Description of each column
        """)
        
        sample_data = generate_sample_transactions_excel()
        st.download_button(
            label="📥 Download Sample Template",
            data=sample_data,
            file_name="transactions_sample_template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )
    
    # --- Import / Export All Transactions Option ---
    with st.expander("🔁 Import / Export All Transactions (Backup & Restore)"):
        col_export, col_import = st.columns(2)
        
        with col_export:
            st.markdown("### 📤 Export (Backup)")
            st.caption("Download a complete list of all transactions.")
            
            # Fetch data
            export_sql = """
                SELECT 
                    t.id, t.stock_symbol, s.name as stock_name, s.portfolio, s.currency,
                    t.txn_date, t.txn_type, t.category,
                    t.shares, t.purchase_cost, t.sell_value, 
                    t.cash_dividend, t.reinvested_dividend, t.bonus_shares,
                    t.fees, t.broker, t.reference, t.notes, t.created_at
                FROM transactions t
                LEFT JOIN stocks s ON t.stock_symbol = s.symbol
                ORDER BY t.txn_date DESC
            """
            df_export = query_df(export_sql)
            
            if not df_export.empty:
                # Convert to Excel buffer
                buffer = io.BytesIO()
                with pd.ExcelWriter(buffer, engine='xlsxwriter') as writer:
                    df_export.to_excel(writer, index=False, sheet_name='Transactions')
                    
                    # Format columns
                    workbook = writer.book
                    worksheet = writer.sheets['Transactions']
                    header_fmt = workbook.add_format({'bold': True, 'bg_color': '#D9EAD3', 'border': 1})
                    for col_num, value in enumerate(df_export.columns.values):
                        worksheet.write(0, col_num, value, header_fmt)
                        worksheet.set_column(col_num, col_num, 15) # Set width
                
                st.download_button(
                    label="📥 Download All Transactions",
                    data=buffer.getvalue(),
                    file_name=f"portfolio_backup_{date.today().strftime('%Y-%m-%d')}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True
                )
            else:
                st.info("No transactions found to export.")

        with col_import:
            st.markdown("### 🔁 Import (Restore)")
            st.caption("Upload a previously exported Excel file to restore data.")
            
            restore_file = st.file_uploader("Upload Backup Excel", type=['xlsx'], key="restore_uploader")
            
            if restore_file:
                if st.button("⚡ Restore / Import Data", type="primary", use_container_width=True):
                    try:
                        restore_df = pd.read_excel(restore_file)
                        
                        # Basic validation
                        required = ['stock_symbol', 'txn_date', 'txn_type']
                        if not all(col in restore_df.columns for col in required):
                            st.error(f"❌ Invalid file format. Required columns: {required}")
                        else:
                            conn = get_conn()
                            cur = conn.cursor()
                            restored_count = 0
                            skipped_count = 0
                            new_stocks = 0
                            
                            progress_bar = st.progress(0, text="Restoring data...")
                            
                            total_rows = len(restore_df)
                            for idx, row in restore_df.iterrows():
                                # Progress update
                                if idx % 10 == 0:
                                    progress_bar.progress((idx + 1) / total_rows, text=f"Processing row {idx+1}/{total_rows}")

                                symbol = str(row['stock_symbol']).strip().upper()
                                user_id = st.session_state.get('user_id', 1)
                                
                                # 1. Ensure Stock Exists for this user
                                db_execute(cur, "SELECT id FROM stocks WHERE symbol = ? AND user_id = ?", (symbol, user_id))
                                if not cur.fetchone():
                                    # Create stock if missing (use backup data if available)
                                    s_name = row.get('stock_name', symbol)
                                    s_port = row.get('portfolio', 'KFH')
                                    s_curr = row.get('currency', 'KWD')
                                    db_execute(cur, "INSERT INTO stocks (symbol, name, portfolio, currency, user_id) VALUES (?, ?, ?, ?, ?)", 
                                                (symbol, s_name, s_port, s_curr, user_id))
                                    new_stocks += 1
                                
                                # 2. Extract Data
                                t_date = pd.to_datetime(row['txn_date']).strftime('%Y-%m-%d')
                                t_type = row['txn_type']
                                t_cat = row.get('category', 'portfolio')
                                t_shares = float(row.get('shares', 0) or 0)
                                t_cost = float(row.get('purchase_cost', 0) or 0)
                                t_sell = float(row.get('sell_value', 0) or 0)
                                t_div = float(row.get('cash_dividend', 0) or 0)
                                t_reinv = float(row.get('reinvested_dividend', 0) or 0)
                                t_bonus = float(row.get('bonus_shares', 0) or 0)
                                t_fees = float(row.get('fees', 0) or 0)
                                t_broker = str(row.get('broker', '') or '')
                                t_ref = str(row.get('reference', '') or '')
                                t_notes = str(row.get('notes', '') or '')
                                t_created = int(row.get('created_at', time.time()) or time.time())
                                
                                # 3. Check Duplicate (Strict content match, ignoring ID)
                                cur.execute("""
                                    SELECT id FROM transactions 
                                    WHERE stock_symbol=? AND txn_date=? AND txn_type=? 
                                    AND shares=? AND purchase_cost=? AND sell_value=? AND user_id=?
                                """, (symbol, t_date, t_type, t_shares, t_cost, t_sell, user_id))
                                
                                if cur.fetchone():
                                    skipped_count += 1
                                else:
                                    cur.execute("""
                                        INSERT INTO transactions 
                                        (stock_symbol, txn_date, txn_type, category, shares, purchase_cost, 
                                         sell_value, cash_dividend, reinvested_dividend, bonus_shares, 
                                         fees, broker, reference, notes, created_at, user_id)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """, (symbol, t_date, t_type, t_cat, t_shares, t_cost, t_sell, 
                                          t_div, t_reinv, t_bonus, t_fees, t_broker, t_ref, t_notes, t_created, user_id))
                                    restored_count += 1
                            
                            conn.commit()
                            conn.close()
                            progress_bar.empty()
                            
                            st.success(f"✅ Restoration Complete: {restored_count:,} imported, {skipped_count:,} skipped (duplicates).")
                            if new_stocks > 0:
                                st.info(f"🆕 Created {new_stocks:,} missing stock entries.")
                            
                            time.sleep(2)
                            st.rerun()
                            
                    except Exception as e:
                        st.error(f"Error restoring data: {e}")
    
    # Add stock section first
    with st.expander("➕ Add New Stock", expanded=True):
        # Market selection row
        market_col, stock_dropdown_col = st.columns([1, 3])
        
        with market_col:
            market = st.selectbox("Market", ["Kuwait Market", "US Market"], key="add_stock_market")
        
        # Get stock options based on selected market
        if market == "Kuwait Market":
            stock_options = get_kuwait_stock_options()
            default_portfolio = "KFH"
            default_currency = "KWD"
        else:
            stock_options = get_us_stock_options()
            default_portfolio = "USA"
            default_currency = "USD"
        
        with stock_dropdown_col:
            selected_stock = st.selectbox(
                "Search Stock", 
                stock_options, 
                key="add_stock_dropdown",
                help="Select a stock from the list or enter manually below"
            )
        
        # Parse selection to pre-fill fields
        market_key = "Kuwait" if market == "Kuwait Market" else "US"
        parsed_symbol, parsed_name, parsed_yf_ticker = parse_stock_selection(selected_stock, market_key)
        
        # Input fields row
        c1, c2, c3, c4, c5 = st.columns([1.3, 3.5, 1.2, 1.2, 1.2])
        
        # Use parsed values as defaults if available
        symbol = c1.text_input("Symbol", value=parsed_symbol or "", placeholder="e.g. AAPL, TSLA")
        name = c2.text_input("Name (optional)", value=parsed_name or "", placeholder="Stock full name (optional)")
        portfolio = c3.selectbox("Portfolio", ["KFH", "BBYN", "USA"], index=["KFH", "BBYN", "USA"].index(default_portfolio), key="manual_portfolio")
        currency = c4.selectbox("Currency", ["KWD", "USD"], index=["KWD", "USD"].index(default_currency), key="manual_currency")
        
        if c5.button("Add Stock", type="primary", key="add_manual_stock"):
            sym = symbol.strip()
            if sym == "":
                st.error("Symbol is required.")
            else:
                try:
                    user_id = st.session_state.get('user_id', 1)
                    exec_sql(
                        "INSERT INTO stocks (symbol, name, current_price, portfolio, currency, user_id) VALUES (?, ?, ?, ?, ?, ?)",
                        (sym, name.strip(), 0.0, portfolio, currency, user_id),
                    )
                    st.success(f"Stock {sym} added.")
                    st.rerun()
                except sqlite3.IntegrityError:
                    st.warning("This symbol already exists.")

    st.divider()

    # Load stored stocks from master (Cached)
    stocks_master = load_stocks_master()
    
    if stocks_master.empty:
        st.info("Add a stock first, then you can add transactions.")
        return

    st.markdown("### 🔎 Select Stock")
    
    # Prepare options for the dropdown
    # Format: "Name - Ticker"
    stock_options = [
        (f"{row['name']} - {row['symbol']}".strip() if row['name'] else row['symbol'])
        for _, row in stocks_master.iterrows()
    ]

    # Stock Dropdown (Selectbox with built-in search)
    current_selection_index = 0
    if "selected_stock_label" in st.session_state:
         if st.session_state.selected_stock_label in stock_options:
             current_selection_index = stock_options.index(st.session_state.selected_stock_label)
    
    selected_opt = st.selectbox(
        "Select stock from list", 
        stock_options, 
        index=current_selection_index,
        key="stock_selector_dropdown"
    )
    
    # Update session state when selection changes
    if selected_opt:
        st.session_state.selected_stock_label = selected_opt
        # Extract symbol
        selected_symbol = selected_opt.rsplit(" - ", 1)[-1].strip()
        
        # Store in session state as requested
        st.session_state["selected_stock_ticker"] = selected_symbol
        st.session_state["selected_stock_name"] = selected_opt.split(" - ")[0].strip()

    if not selected_opt:
        return

    # Use selected_symbol for the rest of the page logic
    # Re-query specific row to get current_price etc (or use master if it has all info)
    # The load_stocks_master returned symbol, name, portfolio, currency.
    # We might need current_price which wasn't in the minimal load_stocks_master query I wrote?
    # Actually, the original query had current_price.
    # Let's re-fetch the single row to ensure we have fresh price/data for the "Stock Details" panel
    # without reloading the full master table every time a price changes.
    
    # Or better: keep using the `stock_row` query pattern the original code had, but using `selected_symbol`
    
    # Original code logic continues here...
    
    # Fetch FRESH details for the single selected stock
    # This ensures if we update price, it reflects immediately without invalidating the huge master cache.
    user_id = st.session_state.get('user_id', 1)
    stock_row_df = query_df("SELECT * FROM stocks WHERE symbol = ? AND user_id = ?", (selected_symbol, user_id))
    if stock_row_df.empty:
        st.error(f"Stock {selected_symbol} not found in DB.")
        return
    
    stock_row = stock_row_df.iloc[0]
    current_price_db = safe_float(stock_row.get("current_price"), 0)

    st.markdown(f"#### Managing: {stock_row.get('name')} ({selected_symbol})")
    
    # Fetch current price section
    cpx1, cpx2, cpx3 = st.columns([1, 2, 1])
    with cpx1:
        st.metric("Current Price", f"{current_price_db:.6f}")
    with cpx2:
        if st.button("Fetch Current Price", type="primary"):
                with st.spinner(f"Fetching price for {selected_symbol}..."):
                    p = None
                    err = None
                    source = None

                    # Try yfinance first (most reliable)
                    p, used_ticker = fetch_price_yfinance(selected_symbol)
                    if p is not None:
                        source = f"yfinance ({used_ticker})"
                    else:
                        # Fallback to TradingView
                        tv_sym = stock_row.get("tradingview_symbol") or None
                        tv_exch = stock_row.get("tradingview_exchange") or "KSE"
                        
                        if tv_sym:
                            p, err = fetch_price_tradingview_by_tv_symbol(tv_exch, tv_sym)
                            if p is not None:
                                source = f"TradingView ({tv_exch}:{tv_sym})"
                        else:
                            tv_cands = map_to_tradingview(selected_symbol, exchange="KSE")
                            if tv_cands:
                                for c in tv_cands:
                                    cand_sym = c.get("tv_symbol")
                                    cand_exch = c.get("exchange") or "KSE"
                                    p, err = fetch_price_tradingview_by_tv_symbol(cand_exch, cand_sym)
                                    if p is not None:
                                        source = f"TradingView ({cand_exch}:{cand_sym})"
                                        try:
                                            user_id = st.session_state.get('user_id', 1)
                                            exec_sql("UPDATE stocks SET tradingview_symbol = ?, tradingview_exchange = ? WHERE symbol = ? AND user_id = ?", (cand_sym, cand_exch, selected_symbol, user_id))
                                        except Exception:
                                            pass
                                        break
                            else:
                                err = "No price source found"

                if p is None:
                    st.error(f"Price fetch failed: {err or 'No price found'}")
                    st.info("Try mapping to TradingView symbol (Edit Stock Details -> Map to TradingView) or check ticker suffix (.KW, .KSE)")
                else:
                    try:
                        user_id = st.session_state.get('user_id', 1)
                        exec_sql("UPDATE stocks SET current_price = ? WHERE symbol = ? AND user_id = ?", (float(p), selected_symbol, user_id))
                        st.success(f"Price updated: {p:.6f} (from {source})")
                        try:
                            st.rerun()
                        except Exception:
                            pass
                    except Exception as e:
                        st.error(f"Failed to save fetched price: {e}")
    
    with cpx3:
        st.write("")
        st.write("")
        if st.button("🗑️ Delete Stock", type="secondary", help="Permanently delete this stock and all its transactions"):
            # Confirmation using session state
            if 'confirm_delete_stock' not in st.session_state:
                st.session_state['confirm_delete_stock'] = selected_symbol
                st.warning(f"⚠️ Click 'Confirm Delete' below to permanently remove {selected_symbol} and all its transactions")
                st.rerun()
    
    # Show confirmation button if delete was clicked
    if st.session_state.get('confirm_delete_stock') == selected_symbol:
        st.error(f"⚠️ **WARNING:** You are about to permanently delete **{selected_symbol}** and **ALL** its transactions. This cannot be undone!")
        
        col_confirm, col_cancel = st.columns([1, 1])
        with col_confirm:
            if st.button("✅ Confirm Delete", type="primary", key="confirm_delete_btn"):
                try:
                    user_id = st.session_state.get('user_id')
                    conn = get_conn()
                    cur = conn.cursor()
                    
                    # Delete all PORTFOLIO transactions for this stock (not trading)
                    db_execute(cur, "DELETE FROM transactions WHERE stock_symbol = ? AND user_id = ? AND COALESCE(category, 'portfolio') = 'portfolio'", (selected_symbol, user_id))
                    txn_deleted = cur.rowcount
                    
                    # Delete the stock itself
                    db_execute(cur, "DELETE FROM stocks WHERE symbol = ? AND user_id = ?", (selected_symbol, user_id))
                    
                    conn.commit()
                    conn.close()
                    
                    # Clear confirmation state
                    del st.session_state['confirm_delete_stock']
                    
                    st.success(f"✅ Deleted {selected_symbol} and {txn_deleted:,} transactions")
                    time.sleep(2)
                    st.rerun()
                    
                except Exception as e:
                    st.error(f"Error deleting stock: {e}")
        
        with col_cancel:
            if st.button("❌ Cancel", key="cancel_delete_btn"):
                del st.session_state['confirm_delete_stock']
                st.rerun()

    # Edit stock name (and other small fields) per user request
    with st.expander("✏️ Edit Stock Details", expanded=False):
        try:
            current_name = stock_row.get("name", "")
        except Exception:
            current_name = ""
        # Allow editing the ticker/symbol as well as the name.
        current_symbol = selected_symbol
        new_symbol = st.text_input("Ticker (symbol)", value=current_symbol, key=f"edit_symbol_{selected_symbol}")

        edited_name = st.text_input("Stock name", value=current_name, key=f"edit_name_{selected_symbol}")
        col_apply, col_validate = st.columns([1, 1])
        with col_apply:
            if st.button("Save Name"):
                # Replace the stock name completely with the entered value (allow empty string)
                try:
                    user_id = st.session_state.get('user_id', 1)
                    exec_sql("UPDATE stocks SET name = ? WHERE symbol = ? AND user_id = ?", (edited_name, selected_symbol, user_id))
                    st.success("Stock name updated.")
                    try:
                        st.rerun()
                    except Exception:
                        pass
                except Exception as e:
                    st.error(f"Failed to update stock name: {e}")

            if st.button("Save Ticker"):
                ns = (new_symbol or "").strip()
                if ns == "":
                    st.error("Ticker cannot be empty.")
                elif ns == current_symbol:
                    st.info("Ticker unchanged.")
                else:
                    # ensure no existing stock uses the new symbol
                    user_id = st.session_state.get('user_id', 1)
                    dup = query_df("SELECT COUNT(1) AS c FROM stocks WHERE symbol = ? AND user_id = ?", (ns, user_id))
                    if int(dup.iloc[0]["c"]) > 0:
                        st.error(f"Cannot rename: symbol '{ns}' already exists.")
                    else:
                        try:
                            conn = get_conn()
                            cur = conn.cursor()
                            # perform updates inside a transaction
                            user_id = st.session_state.get('user_id', 1)
                            db_execute(cur, "UPDATE transactions SET stock_symbol = ? WHERE stock_symbol = ? AND user_id = ?", (ns, current_symbol, user_id))
                            db_execute(cur, "UPDATE stocks SET symbol = ? WHERE symbol = ? AND user_id = ?", (ns, current_symbol, user_id))
                            conn.commit()
                            conn.close()
                            st.success(f"Ticker renamed {current_symbol} ➡️ {ns} and transactions updated.")
                            try:
                                st.rerun()
                            except Exception:
                                pass
                        except Exception as e:
                            try:
                                conn.rollback()
                                conn.close()
                            except Exception:
                                pass
                            st.error(f"Failed to rename ticker: {e}")

        with col_validate:
            st.markdown("---")
            if st.button("Map to TradingView"):
                with st.spinner("Searching TradingView..."):
                    tv_cands = map_to_tradingview(selected_symbol, exchange="KSE")
                if not tv_cands:
                    st.warning("No TradingView matches found.")
                else:
                    options = [f"{c['tv_symbol']} • {c.get('full_name','')} ({c.get('exchange','')})" for c in tv_cands]
                    choice = st.radio("Select TradingView symbol", options, key=f"tv_map_{selected_symbol}")
                    idx = options.index(choice)
                    chosen = tv_cands[idx]
                    if st.button("Apply TradingView Symbol"):
                        try:
                            user_id = st.session_state.get('user_id', 1)
                            exec_sql("UPDATE stocks SET tradingview_symbol = ?, tradingview_exchange = ? WHERE symbol = ? AND user_id = ?", (chosen['tv_symbol'], chosen.get('exchange'), selected_symbol, user_id))
                            st.success(f"Saved TradingView mapping: {chosen.get('exchange','')}:{chosen['tv_symbol']}")
                            try:
                                st.rerun()
                            except Exception:
                                pass
                        except Exception as e:
                            st.error(f"Failed to save TradingView symbol: {e}")

    tx = query_df(
        """
        SELECT
            id,
            stock_symbol,
            txn_date,
            txn_type,
            purchase_cost,
            sell_value,
            shares,
            bonus_shares,
            cash_dividend,
            price_override,
            planned_cum_shares,
            reinvested_dividend,
            fees,
            broker,
            reference,
            notes,
            category,
            created_at
        FROM transactions
        WHERE stock_symbol = ?
        ORDER BY txn_date ASC, created_at ASC, id ASC
        """,
        (selected_symbol,),
    )
    
    # Separate subset for metrics calculation (only 'portfolio' category)
    # Handle NULL category as 'portfolio'
    if not tx.empty:
        tx['category'] = tx['category'].fillna('portfolio')
        tx_calc = tx[tx['category'] == 'portfolio']
    else:
        tx_calc = tx

    metrics = compute_stock_metrics(tx_calc)
    current_price = float(current_price_db)
    market_value = metrics["current_shares"] * current_price

    st.markdown(f"### Transactions for: **{selected_symbol}**")
    
    # Excel Upload for this stock
    with st.expander("🔁 Upload Transactions for this Stock (Excel)", expanded=False):
        st.caption(f"Upload transactions for **{selected_symbol}** only. The Excel file should have columns: txn_date, txn_type, shares, purchase_cost/sell_value, etc.")
        uploaded_file = st.file_uploader("Choose Excel file", type=['xlsx'], key=f"upload_txn_{selected_symbol}")
        
        if uploaded_file:
            try:
                xl = pd.ExcelFile(uploaded_file)
                sheet = "Transactions" if "Transactions" in xl.sheet_names else xl.sheet_names[0]
                raw = xl.parse(sheet_name=sheet)
                
                if raw.empty:
                    st.warning("Excel sheet is empty.")
                else:
                    # Normalize columns
                    df = raw.copy()
                    df.columns = [_norm_col(c) for c in df.columns]
                    
                    st.write(f"Preview ({len(df):,} rows):")
                    st.dataframe(df.head(20), use_container_width=True)
                    
                    if st.button("Import These Transactions", type="primary", key=f"import_btn_{selected_symbol}"):
                        # Process each row and assign to selected_symbol
                        conn = get_conn()
                        cur = conn.cursor()
                        imported = 0
                        errors = []
                        
                        for idx, r in df.iterrows():
                            try:
                                iso_date = _to_iso_date(r.get(_pick_col(df, ["txn_date", "date", "trade_date"])))
                                ttype = _safe_str(r.get(_pick_col(df, ["txn_type", "type", "side"]))).title()
                                shares_val = _safe_num(r.get(_pick_col(df, ["shares", "quantity", "qty"])), 0)
                                
                                if ttype not in ("Buy", "Sell"):
                                    errors.append(f"Row {idx+2}: Invalid txn_type")
                                    continue
                                
                                purchase_cost = _safe_num(r.get(_pick_col(df, ["purchase_cost", "buy_cost", "cost"])), 0.0)
                                sell_value = _safe_num(r.get(_pick_col(df, ["sell_value", "proceeds"])), 0.0)
                                bonus_shares = _safe_num(r.get(_pick_col(df, ["bonus_shares", "bonus"])), 0.0)
                                cash_dividend = _safe_num(r.get(_pick_col(df, ["cash_dividend", "dividend"])), 0.0)
                                
                                # Insert transaction for selected stock
                                cur.execute("""
                                    INSERT INTO transactions
                                    (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares,
                                     bonus_shares, cash_dividend, reinvested_dividend, fees,
                                     broker, reference, notes, category, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', '', '', 'portfolio', ?)
                                """, (selected_symbol, iso_date, ttype, purchase_cost, sell_value, shares_val,
                                      bonus_shares, cash_dividend, int(time.time())))
                                imported += 1
                                
                            except Exception as e:
                                errors.append(f"Row {idx+2}: {str(e)}")
                        
                        conn.commit()
                        conn.close()
                        
                        if errors:
                            st.error(f"❌ {len(errors)} errors:")
                            st.write(errors[:10])
                        
                        if imported > 0:
                            st.success(f"✅ Imported {imported:,} transactions for {selected_symbol}")
                            time.sleep(1)
                            st.rerun()
                        
            except Exception as e:
                st.error(f"Error reading Excel: {e}")

    s1, s2, s3, s4, s5, s6 = st.columns(6)
    s1.metric("Total Purchase", fmt_money_plain(metrics["total_buy_cost"]))
    s2.metric("Total Shares Purchased", fmt_int(metrics["total_buy_shares"]))
    s3.metric("Total Shares (Current)", fmt_int(metrics["current_shares"]))
    s4.metric("Average Cost", fmt_price(metrics['avg_cost'], 6))
    s5.metric("Current Price", f"{current_price:.6f}")
    s6.metric("Market Value", fmt_money_plain(market_value))

    st.divider()

    # Add transaction form
    with st.expander("➕ Add Transaction (more fields)", expanded=True):
        c1, c2, c3, c4 = st.columns([1.1, 1, 1, 1])
        txn_date = c1.date_input("Date", value=date.today(), key="txn_date")
        txn_type = c2.selectbox("Type", ["Buy", "Sell", "Dividend only"], key="txn_type")
        
        # Conditional fields based on transaction type
        if txn_type == "Dividend only":
            # DIVIDEND ONLY MODE - Show only dividend-related fields
            st.info("ℹ️ Recording dividends only (no trade/shares impact)")
            
            d1, d2, d3 = st.columns([1, 1, 1])
            cash_dividend = d1.number_input("Cash Dividend received (KD)", min_value=0.0, step=1.0, format="%.3f", key="txn_cash_dividend")
            reinv = d2.number_input("Reinvested Dividend (KD)", min_value=0.0, step=1.0, format="%.3f", key="txn_reinv")
            bonus_shares = d3.number_input("Bonus Shares (stock dividend)", min_value=0.0, step=1.0, format="%.0f", key="txn_bonus_shares")
            
            # Option to include in portfolio analysis or keep as record only
            include_in_portfolio = st.radio(
                "Include in Portfolio Analysis?",
                ["Yes (Add to holdings/analysis)", "No (Record only)"],
                index=0,
                horizontal=True,
                key="txn_include_portfolio",
                help="If 'Yes', bonus shares will increase your holdings and dividends will appear in analysis. If 'No', this is just for record keeping."
            )
            category_val = 'portfolio' if include_in_portfolio.startswith("Yes") else 'record'
            
            notes = st.text_area("Notes (optional)", key="txn_notes")
            
            # Set all trade-related fields to 0
            shares = 0.0
            purchase_cost = 0.0
            sell_value = 0.0
            fees = 0.0
            broker = ""
            reference = ""
            price_override = None
            planned_cum = 0.0
            
            if st.button("Save Dividend Transaction", type="primary"):
                # Validation: at least one dividend field must be > 0
                if cash_dividend <= 0 and reinv <= 0 and bonus_shares <= 0:
                    st.error("⚠️ Please enter at least one of: Cash Dividend, Reinvested Dividend, or Bonus Shares.")
                else:
                    exec_sql(
                        """
                        INSERT INTO transactions
                        (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares,
                         bonus_shares, cash_dividend,
                         price_override, planned_cum_shares, reinvested_dividend, fees,
                         broker, reference, notes, category, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            selected_symbol,
                            txn_date.isoformat(),
                            "DIVIDEND_ONLY",
                            0.0,
                            0.0,
                            0.0,
                            float(bonus_shares),
                            float(cash_dividend),
                            None,
                            None,
                            float(reinv),
                            0.0,
                            "",
                            "",
                            notes.strip(),
                            category_val,
                            int(time.time()),
                        ),
                    )
                    st.success(f"Dividend transaction saved ({'Portfolio' if category_val == 'portfolio' else 'Record only'}).")
                    st.rerun()
        
        else:
            # BUY/SELL MODE - Show regular trade fields
            shares = c3.number_input("# of shares", min_value=0.0, step=1.0, format="%.0f", key="txn_shares")
            reinv = c4.number_input("Reinvested dividends (KD)", min_value=0.0, step=1.0, format="%.3f", key="txn_reinv")

            d1, d2 = st.columns([1, 1])
            bonus_shares = d1.number_input("Bonus Shares (stock dividend)", min_value=0.0, step=1.0, format="%.0f", key="txn_bonus_shares")
            cash_dividend = d2.number_input("Cash Dividend (received)", min_value=0.0, step=1.0, format="%.3f", key="txn_cash_dividend")

            c5, c6, c7 = st.columns([1.2, 1.2, 1.6])

            purchase_cost = 0.0
            sell_value = 0.0
            if txn_type == "Buy":
                purchase_cost = c5.number_input("Actual purchase cost", min_value=0.0, step=10.0, format="%.3f", key="txn_buy_cost")
            else:
                sell_value = c5.number_input("Actual sell value", min_value=0.0, step=10.0, format="%.3f", key="txn_sell_value")

            use_override = c6.checkbox("Override price?", value=False, key="use_override_price")
            price_override = None
            if use_override:
                price_override = c6.number_input("Override Price", min_value=0.0, step=0.001, format="%.6f", key="txn_price_override")
            else:
                c6.caption("Price will be calculated automatically from cost/value / shares.")

            planned_cum = c7.number_input("Planned CUM shares (optional)", min_value=0.0, step=1.0, format="%.0f", key="txn_planned_cum")

            # Live price preview
            calc_price = 0.0
            if shares > 0:
                if txn_type == "Buy":
                    calc_price = (float(purchase_cost) / float(shares)) if purchase_cost > 0 else 0.0
                else:
                    calc_price = (float(sell_value) / float(shares)) if sell_value > 0 else 0.0
            st.info(f"Auto Price Preview = {calc_price:.6f}")

            c8, c9, c10 = st.columns([1, 1, 2])
            fees = c8.number_input("Fees (optional)", min_value=0.0, step=0.100, format="%.3f", key="txn_fees")
            broker = c9.text_input("Broker/Platform (optional)", key="txn_broker")
            reference = c10.text_input("Reference / Order ID (optional)", key="txn_reference")

            notes = st.text_area("Notes (optional)", key="txn_notes")

            available_before = float(metrics["current_shares"])
            if txn_type == "Sell" and shares > available_before:
                st.error(f"You are trying to SELL {shares:,.0f} shares but available is {available_before:,.0f}.")

            if st.button("Save Transaction", type="primary"):
                # Only block when trying to sell more than available
                if txn_type == "Sell" and shares > available_before:
                    st.error("Cannot sell more than available quantity.")
                else:
                    # Allow empty/zero shares and costs; provide non-blocking warnings
                    if shares <= 0:
                        st.warning("Shares is empty or zero • transaction will be recorded with 0 shares.")
                    if txn_type == "Buy" and purchase_cost <= 0:
                        st.warning("Purchase cost is empty or zero • recorded as 0.0.")
                    if txn_type == "Sell" and sell_value <= 0:
                        st.warning("Sell value is empty or zero • recorded as 0.0.")

                    po = None if (price_override is None) else float(price_override)
                    pc = None if planned_cum == 0 else float(planned_cum)

                    exec_sql(
                        """
                        INSERT INTO transactions
                        (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares,
                         bonus_shares, cash_dividend,
                         price_override, planned_cum_shares, reinvested_dividend, fees,
                         broker, reference, notes, category, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            selected_symbol,
                            txn_date.isoformat(),
                            txn_type,
                            float(purchase_cost),
                            float(sell_value),
                            float(shares),
                            float(bonus_shares),
                            float(cash_dividend),
                            po,
                            pc,
                            float(reinv),
                            float(fees),
                            broker.strip(),
                            reference.strip(),
                            notes.strip(),
                            'portfolio',
                            int(time.time()),
                        ),
                    )

                    st.success("Transaction saved.")
                    st.rerun()

    st.markdown("### Transactions Table")
    
    # Initialize session state for editing
    if 'editing_tx_id' not in st.session_state:
        st.session_state.editing_tx_id = None
    if tx.empty:
        st.info("No transactions yet.")
        return


    # Filter controls
    f_col1, f_col2 = st.columns([1, 4])
    show_all_records = f_col1.checkbox("Show 'Record Only' items", value=True, help="Include items not in portfolio analysis")
    
    view = compute_transactions_view(tx)
    if not show_all_records and not tx.empty:
        # Filter out 'record' items from view if unchecked
        # Note: compute_transactions_view preserves all rows, so we filter by index or ID match if needed,
        # but simpler is to use the 'category' column if it was preserved.
        # compute_transactions_view creates a copy, so we need to ensure 'category' is in it.
        # Just map ID back to category
        id_to_cat = dict(zip(tx['id'], tx['category']))
        view['category'] = view['id'].map(id_to_cat)
        view = view[view['category'] == 'portfolio']

    # Column headers
    header_cols = st.columns([0.4, 0.8, 0.6, 0.6, 1, 1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1, 0.5])
    header_cols[0].markdown("**#**")
    header_cols[1].markdown("**ID**")
    header_cols[2].markdown("**Date**")
    header_cols[3].markdown("**Type**")
    header_cols[4].markdown("**Purchase**")
    header_cols[5].markdown("**Sell**")
    header_cols[6].markdown("**Shares**")
    header_cols[7].markdown("**Price**")
    header_cols[8].markdown("**CUM**")
    header_cols[9].markdown("**Bonus**")
    header_cols[10].markdown("**Cash Div**")
    header_cols[11].markdown("**Reinvest**")
    header_cols[12].markdown("**Notes**")
    header_cols[13].markdown("**Edit**")
    st.divider()
    
    # Display each transaction with edit button
    for idx, row in view.iterrows():
        tx_id = int(row['id'])
        
        # Check if this transaction is being edited
        if st.session_state.editing_tx_id == tx_id:
            # EDIT MODE - Show editable form
            with st.container():
                st.markdown(f"#### ✏️ Editing Transaction ID: {tx_id}")
                
                # Determine type index for selectbox
                type_options = ["Buy", "Sell", "Dividend only"]
                current_type = row['txn_type']
                if current_type == 'DIVIDEND_ONLY':
                    type_idx = 2
                elif current_type == 'Sell':
                    type_idx = 1
                else:
                    type_idx = 0
                
                ec1, ec2 = st.columns([1.5, 1.5])
                edit_date = ec1.date_input("Date", value=pd.to_datetime(row['txn_date']).date(), key=f"edit_date_{tx_id}")
                edit_type = ec2.selectbox("Type", type_options, index=type_idx, key=f"edit_type_{tx_id}")
                
                # Conditional fields based on type
                if edit_type == "Dividend only":
                    # DIVIDEND ONLY EDIT MODE
                    st.info("ℹ️ Editing dividend-only transaction")
                    
                    ed1, ed2, ed3 = st.columns([1, 1, 1])
                    edit_cash_div = ed1.number_input("Cash Dividend (KD)", min_value=0.0, step=1.0, format="%.3f", value=float(row.get('cash_dividend', 0)), key=f"edit_cash_div_{tx_id}")
                    edit_reinv = ed2.number_input("Reinvested (KD)", min_value=0.0, step=1.0, format="%.3f", value=float(row.get('reinvested_dividend', 0)), key=f"edit_reinv_{tx_id}")
                    edit_bonus = ed3.number_input("Bonus Shares", min_value=0.0, step=1.0, format="%.0f", value=float(row.get('bonus_shares', 0)), key=f"edit_bonus_{tx_id}")
                    
                    # Option to include in portfolio analysis or keep as record only
                    current_category = row.get('category', 'portfolio')
                    # Handle NULL category as 'portfolio'
                    if pd.isna(current_category) or current_category == '':
                        current_category = 'portfolio'
                        
                    edit_include_in_portfolio = st.radio(
                        "Include in Portfolio Analysis?",
                        ["Yes (Add to holdings/analysis)", "No (Record only)"],
                        index=0 if current_category == 'portfolio' else 1,
                        horizontal=True,
                        key=f"edit_include_portfolio_{tx_id}",
                        help="If 'Yes', bonus shares will increase your holdings and dividends will appear in analysis. If 'No', this is just for record keeping."
                    )
                    edit_category_val = 'portfolio' if edit_include_in_portfolio.startswith("Yes") else 'record'
                    
                    edit_notes = st.text_area("Notes", value=str(row.get('notes', '')), key=f"edit_notes_{tx_id}")
                    
                    # Set trade fields to 0 for dividend-only
                    edit_shares = 0.0
                    edit_purchase_cost = 0.0
                    edit_sell_value = 0.0
                    edit_fees = 0.0
                    edit_broker = ""
                    edit_reference = ""
                    edit_price_override = None
                    edit_planned_cum = 0.0
                    
                else:
                    # BUY/SELL EDIT MODE
                    edit_category_val = 'portfolio'  # Buy/Sell always portfolio for now
                    ec3, ec4 = st.columns([1, 1])
                    edit_shares = ec3.number_input("# of shares", min_value=0.0, step=1.0, format="%.0f", value=float(row['shares']), key=f"edit_shares_{tx_id}")
                    edit_reinv = ec4.number_input("Reinvested (KD)", min_value=0.0, step=1.0, format="%.3f", value=float(row.get('reinvested_dividend', 0)), key=f"edit_reinv_{tx_id}")

                    ed1, ed2 = st.columns([1, 1])
                    edit_bonus = ed1.number_input("Bonus Shares", min_value=0.0, step=1.0, format="%.0f", value=float(row.get('bonus_shares', 0)), key=f"edit_bonus_{tx_id}")
                    edit_cash_div = ed2.number_input("Cash Dividend (KD)", min_value=0.0, step=1.0, format="%.3f", value=float(row.get('cash_dividend', 0)), key=f"edit_cash_div_{tx_id}")

                    ec5, ec6, ec7 = st.columns([1.2, 1.2, 1.6])

                    if edit_type == "Buy":
                        edit_purchase_cost = ec5.number_input("Purchase cost", min_value=0.0, step=10.0, format="%.3f", value=float(row['purchase_cost']), key=f"edit_buy_cost_{tx_id}")
                        edit_sell_value = 0.0
                    else:
                        edit_purchase_cost = 0.0
                        edit_sell_value = ec5.number_input("Sell value", min_value=0.0, step=10.0, format="%.3f", value=float(row['sell_value']), key=f"edit_sell_value_{tx_id}")

                    edit_use_override = ec6.checkbox("Override price?", value=row['price_override'] is not None and not pd.isna(row['price_override']), key=f"edit_use_override_{tx_id}")
                    edit_price_override = None
                    if edit_use_override:
                        override_val = float(row['price_override']) if row['price_override'] is not None and not pd.isna(row['price_override']) else 0.0
                        edit_price_override = ec6.number_input("Override Price", min_value=0.0, step=0.001, format="%.6f", value=override_val, key=f"edit_price_override_{tx_id}")

                    edit_planned_cum = ec7.number_input("Planned CUM", min_value=0.0, step=1.0, format="%.0f", value=float(row.get('planned_cum_shares', 0) or 0), key=f"edit_planned_cum_{tx_id}")

                    ec8, ec9, ec10 = st.columns([1, 1, 2])
                    edit_fees = ec8.number_input("Fees", min_value=0.0, step=0.100, format="%.3f", value=float(row.get('fees', 0)), key=f"edit_fees_{tx_id}")
                    edit_broker = ec9.text_input("Broker", value=str(row.get('broker', '')), key=f"edit_broker_{tx_id}")
                    edit_reference = ec10.text_input("Reference", value=str(row.get('reference', '')), key=f"edit_reference_{tx_id}")

                    edit_notes = st.text_area("Notes", value=str(row.get('notes', '')), key=f"edit_notes_{tx_id}")

                col_save, col_cancel, col_delete = st.columns([1, 1, 1])
                
                with col_save:
                    if st.button("💾 Save", type="primary", key=f"save_{tx_id}"):
                        # Validation for dividend-only
                        if edit_type == "Dividend only":
                            if edit_cash_div <= 0 and edit_reinv <= 0 and edit_bonus <= 0:
                                st.error("⚠️ At least one dividend field must be > 0")
                            else:
                                exec_sql(
                                    """
                                    UPDATE transactions
                                    SET txn_date = ?, txn_type = ?, purchase_cost = ?, sell_value = ?, shares = ?,
                                        bonus_shares = ?, cash_dividend = ?, price_override = ?, planned_cum_shares = ?,
                                        reinvested_dividend = ?, fees = ?, broker = ?, reference = ?, notes = ?, category = ?
                                    WHERE id = ?
                                    """,
                                    (
                                        edit_date.isoformat(),
                                        "DIVIDEND_ONLY",
                                        0.0,
                                        0.0,
                                        0.0,
                                        float(edit_bonus),
                                        float(edit_cash_div),
                                        None,
                                        None,
                                        float(edit_reinv),
                                        0.0,
                                        "",
                                        "",
                                        edit_notes.strip(),
                                        edit_category_val,
                                        tx_id,
                                    ),
                                )
                                st.session_state.editing_tx_id = None
                                st.success(f"Transaction {tx_id} updated!")
                                st.rerun()
                        else:
                            # Regular buy/sell update
                            edit_po = None if not edit_use_override else float(edit_price_override)
                            edit_pc = None if edit_planned_cum == 0 else float(edit_planned_cum)

                            exec_sql(
                                """
                                UPDATE transactions
                                SET txn_date = ?, txn_type = ?, purchase_cost = ?, sell_value = ?, shares = ?,
                                    bonus_shares = ?, cash_dividend = ?, price_override = ?, planned_cum_shares = ?,
                                    reinvested_dividend = ?, fees = ?, broker = ?, reference = ?, notes = ?, category = ?
                                WHERE id = ?
                                """,
                                (
                                    edit_date.isoformat(),
                                    edit_type,
                                    float(edit_purchase_cost),
                                    float(edit_sell_value),
                                    float(edit_shares),
                                    float(edit_bonus),
                                    float(edit_cash_div),
                                    edit_po,
                                    edit_pc,
                                    float(edit_reinv),
                                    float(edit_fees),
                                    edit_broker.strip(),
                                    edit_reference.strip(),
                                    edit_notes.strip(),
                                    edit_category_val,
                                    tx_id,
                                ),
                            )
                            st.session_state.editing_tx_id = None
                            st.success(f"Transaction {tx_id} updated!")
                            st.rerun()
                
                with col_delete:
                    if st.button("🗑️ Delete", type="secondary", key=f"delete_{tx_id}"):
                        exec_sql("DELETE FROM transactions WHERE id = ?", (tx_id,))
                        st.session_state.editing_tx_id = None
                        st.success(f"Transaction {tx_id} deleted.")
                        st.rerun()
                
                st.divider()
        
        else:
            # VIEW MODE - Show transaction row with edit button
            with st.container():
                cols = st.columns([0.4, 0.8, 0.6, 0.6, 1, 1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1, 0.5])
                
                cols[0].write(f"**{row['Serial']}**")
                cols[1].write(f"ID: {tx_id}")
                cols[2].write(row['txn_date'])
                cols[3].write(row['txn_type'])
                cols[4].write(fmt_kwd(row['purchase_cost']))
                cols[5].write(fmt_kwd(row['sell_value']))
                cols[6].write(fmt_int(row['shares']))
                cols[7].write(fmt_price(row['Price'], 6))
                cols[8].write(fmt_int(row['CUM shares']))
                cols[9].write(fmt_int(row.get('bonus_shares', 0)))
                cols[10].write(fmt_kwd(row.get('cash_dividend', 0)))
                cols[11].write(fmt_kwd(row.get('reinvested_dividend', 0)))
                
                # Visual indicator for Record Only
                cat_val = row.get('category')
                # If category is missing in 'view', try to map it from tx
                if pd.isna(cat_val) and not tx.empty:
                     cat_val = tx.loc[tx['id'] == tx_id, 'category'].iloc[0] if not tx[tx['id'] == tx_id].empty else 'portfolio'
                
                if cat_val == 'record':
                    cols[12].markdown("📝 **(Record Only)** " + (str(row.get('notes', ''))[:15] + "..." if len(str(row.get('notes', ''))) > 15 else str(row.get('notes', ''))))
                else:
                    cols[12].write(str(row.get('notes', ''))[:20] + "..." if len(str(row.get('notes', ''))) > 20 else str(row.get('notes', '')))
                
                if cols[13].button("✏️", key=f"edit_btn_{tx_id}"):
                    st.session_state.editing_tx_id = tx_id
                    st.rerun()
                
                st.divider()

    with st.expander("⚠️ Remove Stock (deletes all transactions)"):
        st.warning("This deletes the stock AND all related PORTFOLIO transactions (trading transactions are preserved).")
        if st.button(f"Remove {selected_symbol}", type="secondary"):
            user_id = st.session_state.get('user_id', 1)
            exec_sql("DELETE FROM transactions WHERE stock_symbol = ? AND COALESCE(category, 'portfolio') = 'portfolio' AND user_id = ?", (selected_symbol, user_id))
            exec_sql("DELETE FROM stocks WHERE symbol = ? AND user_id = ?", (selected_symbol, user_id))
            st.success("Stock removed.")
            st.rerun()



# =========================
# FINANCIAL PLANNER TAB
# =========================

def ui_financial_planner():
    """Dynamic Financial Planner Calculator with TVM calculations - Gradio-inspired UI."""
    
    # Comprehensive Gradio-inspired CSS
    st.markdown("""
    <style>
        /* ===== GRADIO-INSPIRED THEME FOR PLANNER ===== */
        
        /* Container styling */
        [data-testid="stVerticalBlock"] > [data-testid="stVerticalBlock"] {
            background: transparent;
        }
        
        /* Modern card container */
        .planner-card {
            background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }
        
        /* Dark mode card */
        @media (prefers-color-scheme: dark) {
            .planner-card {
                background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
                border: 1px solid #334155;
            }
        }
        
        /* Modern header styling */
        .planner-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            border-radius: 20px;
            padding: 32px;
            margin-bottom: 24px;
            box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
            text-align: center;
        }
        
        .planner-header h1 {
            color: white;
            font-size: 2.5rem;
            font-weight: 800;
            margin: 0 0 8px 0;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .planner-header p {
            color: rgba(255,255,255,0.9);
            font-size: 1.1rem;
            margin: 0;
        }
        
        .planner-badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.85rem;
            color: white;
            font-weight: 600;
            margin-top: 12px;
        }
        
        /* Section headers */
        .section-title {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
        }
        
        .section-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.4rem;
        }
        
        .section-icon.green { background: linear-gradient(135deg, #10b981, #059669); }
        .section-icon.purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
        .section-icon.blue { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .section-icon.pink { background: linear-gradient(135deg, #ec4899, #db2777); }
        
        .section-title h2 {
            font-size: 1.4rem;
            font-weight: 700;
            color: #1e293b;
            margin: 0;
        }
        
        @media (prefers-color-scheme: dark) {
            .section-title h2 { color: #f1f5f9; }
        }
        
        /* Input labels */
        .input-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            color: #374151;
            margin-bottom: 8px;
        }
        
        .input-label .icon {
            font-size: 1.2rem;
        }
        
        @media (prefers-color-scheme: dark) {
            .input-label { color: #e2e8f0; }
        }
        
        /* Streamlit input overrides - Gradio style */
        .stNumberInput > div > div > input,
        .stTextInput > div > div > input {
            border: 2px solid #e2e8f0 !important;
            border-radius: 12px !important;
            padding: 14px 16px !important;
            font-size: 1rem !important;
            background: #ffffff !important;
            transition: all 0.2s ease !important;
        }
        
        .stNumberInput > div > div > input:focus,
        .stTextInput > div > div > input:focus {
            border-color: #8b5cf6 !important;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15) !important;
        }
        
        /* Select box styling */
        .stSelectbox > div > div {
            border: 2px solid #e2e8f0 !important;
            border-radius: 12px !important;
            background: #ffffff !important;
        }
        
        .stSelectbox > div > div:hover {
            border-color: #8b5cf6 !important;
        }
        
        /* Primary button - Gradio style */
        .stFormSubmitButton > button,
        .stButton > button[kind="primary"] {
            background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important;
            color: white !important;
            border: none !important;
            border-radius: 12px !important;
            padding: 16px 32px !important;
            font-weight: 700 !important;
            font-size: 1.1rem !important;
            box-shadow: 0 4px 15px rgba(249, 115, 22, 0.4) !important;
            transition: all 0.3s ease !important;
            text-transform: none !important;
        }
        
        .stFormSubmitButton > button:hover,
        .stButton > button[kind="primary"]:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 8px 25px rgba(249, 115, 22, 0.5) !important;
        }
        
        /* Secondary button */
        .stButton > button {
            border: 2px solid #e2e8f0 !important;
            border-radius: 12px !important;
            padding: 12px 24px !important;
            font-weight: 600 !important;
            background: white !important;
            color: #374151 !important;
            transition: all 0.2s ease !important;
        }
        
        .stButton > button:hover {
            border-color: #8b5cf6 !important;
            color: #8b5cf6 !important;
            background: #faf5ff !important;
        }
        
        /* Result card - Big prominent display */
        .result-display {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(16, 185, 129, 0.35);
            margin: 24px 0;
        }
        
        .result-display .label {
            color: rgba(255,255,255,0.85);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .result-display .value {
            color: white;
            font-size: 3rem;
            font-weight: 800;
            text-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        
        /* Stats grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin: 24px 0;
        }
        
        .stat-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 20px;
            text-align: center;
        }
        
        .stat-box .label {
            color: #64748b;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
            margin-bottom: 6px;
        }
        
        .stat-box .value {
            color: #1e293b;
            font-size: 1.3rem;
            font-weight: 700;
        }
        
        @media (prefers-color-scheme: dark) {
            .stat-box {
                background: #1e293b;
                border-color: #334155;
            }
            .stat-box .label { color: #94a3b8; }
            .stat-box .value { color: #f1f5f9; }
        }
        
        /* Progress bar */
        .progress-container {
            background: #e2e8f0;
            border-radius: 10px;
            height: 24px;
            overflow: hidden;
            margin: 16px 0;
        }
        
        .progress-fill {
            height: 100%;
            border-radius: 10px;
            transition: width 0.5s ease;
        }
        
        .progress-principal { background: linear-gradient(90deg, #22c55e, #16a34a); }
        .progress-interest { background: linear-gradient(90deg, #3b82f6, #2563eb); }
        
        /* Data table styling */
        .stDataFrame {
            border-radius: 12px !important;
            overflow: hidden !important;
        }
        
        /* Footer */
        .planner-footer {
            text-align: center;
            padding: 24px;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 16px;
            margin-top: 32px;
            border: 1px solid #e2e8f0;
        }
        
        .planner-footer .title {
            font-weight: 700;
            color: #475569;
            margin-bottom: 4px;
        }
        
        .planner-footer .subtitle {
            color: #94a3b8;
            font-size: 0.85rem;
        }
        
        @media (prefers-color-scheme: dark) {
            .planner-footer {
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                border-color: #334155;
            }
            .planner-footer .title { color: #e2e8f0; }
        }
    </style>
    """, unsafe_allow_html=True)
    
    # ===== HEADER =====
    st.markdown("""
    <div class="planner-header">
        <h1>📈 Financial Planner Pro</h1>
        <p>Advanced Time Value of Money Calculations</p>
        <span class="planner-badge">✨ TVM Calculator</span>
    </div>
    """, unsafe_allow_html=True)
    
    # ===== GOAL SELECTOR =====
    st.markdown("""
    <div class="section-title">
        <div class="section-icon purple">🎯</div>
        <h2>What do you want to calculate?</h2>
    </div>
    """, unsafe_allow_html=True)
    
    goal_options = {
        "future_value": "📊 Future Portfolio Value (Solve for FV)",
        "required_yield": "📈 Required Yield % to reach a target (Solve for Rate)",
        "required_contribution": "💰 Required Contribution to reach a target (Solve for PMT)"
    }
    
    selected_goal = st.selectbox(
        "Select goal",
        options=list(goal_options.keys()),
        format_func=lambda x: goal_options[x],
        key="planner_goal",
        label_visibility="collapsed"
    )
    
    # Use a form to prevent refreshes while inputting data
    with st.form("planner_form"):
        # Inputs Section
        st.markdown("""
        <div class="section-title">
            <div class="section-icon green">📋</div>
            <h2>Input Parameters</h2>
        </div>
        """, unsafe_allow_html=True)
        
        col1, col2, col3 = st.columns(3)
        
        with col1:
            st.markdown('<div class="input-label"><span class="icon">💰</span>Present Value (Current Savings)</div>', unsafe_allow_html=True)
            present_value = st.number_input(
                "Present Value",
                min_value=0.0,
                value=None,
                step=1000.0,
                format="%.2f",
                placeholder="Enter starting amount",
                label_visibility="collapsed"
            )
        
        with col2:
            st.markdown('<div class="input-label"><span class="icon">📅</span>Investment Period (Years)</div>', unsafe_allow_html=True)
            years = st.number_input(
                "Years",
                min_value=1,
                max_value=100,
                value=None,
                step=1,
                placeholder="Enter years",
                label_visibility="collapsed"
            )
        
        with col3:
            st.markdown('<div class="input-label"><span class="icon">🔄</span>Contribution Frequency</div>', unsafe_allow_html=True)
            frequency_options = {"Annually": 1, "Semiannually": 2, "Quarterly": 4, "Monthly": 12}
            frequency_label = st.selectbox(
                "Frequency",
                options=list(frequency_options.keys()),
                index=0,
                label_visibility="collapsed"
            )
            frequency = frequency_options[frequency_label]
        
        # Initialize variables
        annual_yield = None
        contribution = None
        target_fv = None
        
        if selected_goal == "future_value":
            col1, col2 = st.columns(2)
            with col1:
                st.markdown('<div class="input-label"><span class="icon">📈</span>Expected Annual Yield (%)</div>', unsafe_allow_html=True)
                annual_yield = st.number_input(
                    "Yield",
                    min_value=0.0,
                    max_value=100.0,
                    value=None,
                    step=0.5,
                    format="%.2f",
                    placeholder="e.g., 8.0",
                    label_visibility="collapsed"
                )
            with col2:
                st.markdown(f'<div class="input-label"><span class="icon">💵</span>{frequency_label} Contribution Amount</div>', unsafe_allow_html=True)
                contribution = st.number_input(
                    "Contribution",
                    min_value=0.0,
                    value=None,
                    step=100.0,
                    format="%.2f",
                    placeholder="Enter amount",
                    label_visibility="collapsed"
                )
        
        elif selected_goal == "required_yield":
            col1, col2 = st.columns(2)
            with col1:
                st.markdown('<div class="input-label"><span class="icon">🎯</span>Target Future Value</div>', unsafe_allow_html=True)
                target_fv = st.number_input(
                    "Target FV",
                    min_value=0.0,
                    value=None,
                    step=10000.0,
                    format="%.2f",
                    placeholder="Enter target amount",
                    label_visibility="collapsed"
                )
            with col2:
                st.markdown(f'<div class="input-label"><span class="icon">💵</span>{frequency_label} Contribution Amount</div>', unsafe_allow_html=True)
                contribution = st.number_input(
                    "Contribution",
                    min_value=0.0,
                    value=None,
                    step=100.0,
                    format="%.2f",
                    placeholder="Enter amount",
                    label_visibility="collapsed"
                )
        
        elif selected_goal == "required_contribution":
            col1, col2 = st.columns(2)
            with col1:
                st.markdown('<div class="input-label"><span class="icon">🎯</span>Target Future Value</div>', unsafe_allow_html=True)
                target_fv = st.number_input(
                    "Target FV",
                    min_value=0.0,
                    value=None,
                    step=10000.0,
                    format="%.2f",
                    placeholder="Enter target amount",
                    label_visibility="collapsed"
                )
            with col2:
                st.markdown('<div class="input-label"><span class="icon">📈</span>Expected Annual Yield (%)</div>', unsafe_allow_html=True)
                annual_yield = st.number_input(
                    "Yield",
                    min_value=0.0,
                    max_value=100.0,
                    value=None,
                    step=0.5,
                    format="%.2f",
                    placeholder="e.g., 8.0",
                    label_visibility="collapsed"
                )
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        # Calculate Button (form submit)
        calculate_btn = st.form_submit_button("🧮 Calculate Financial Future", use_container_width=True)
    
    # Validation
    if calculate_btn:
        # Check required fields
        missing_fields = []
        
        if present_value is None:
            missing_fields.append("Present Value")
        if years is None:
            missing_fields.append("Investment Period")
        
        if selected_goal == "future_value":
            if annual_yield is None:
                missing_fields.append("Expected Annual Yield")
            if contribution is None:
                missing_fields.append("Contribution Amount")
        elif selected_goal == "required_yield":
            if target_fv is None:
                missing_fields.append("Target Future Value")
            if contribution is None:
                missing_fields.append("Contribution Amount")
        elif selected_goal == "required_contribution":
            if target_fv is None:
                missing_fields.append("Target Future Value")
            if annual_yield is None:
                missing_fields.append("Expected Annual Yield")
        
        if missing_fields:
            st.error(f"❌ Please fill in: {', '.join(missing_fields)}")
        else:
            # Store calculation flag in session state
            st.session_state.planner_calculated = True
            st.session_state.planner_data = {
                "goal": selected_goal,
                "present_value": present_value,
                "years": years,
                "frequency": frequency,
                "frequency_label": frequency_label,
                "annual_yield": annual_yield,
                "contribution": contribution,
                "target_fv": target_fv
            }
    
    # --- Display Results (only after calculation) ---
    if st.session_state.get("planner_calculated") and st.session_state.get("planner_data"):
        data = st.session_state.planner_data
        
        # Extract data
        pv = data["present_value"]
        yrs = data["years"]
        freq = data["frequency"]
        freq_label = data["frequency_label"]
        total_periods = yrs * freq
        
        result = None
        result_label = ""
        result_format = ""
        calc_contribution = data["contribution"]
        calc_yield = data["annual_yield"]
        
        if data["goal"] == "future_value":
            # Calculate Future Value
            periodic_rate = (data["annual_yield"] / 100) / freq
            
            if periodic_rate > 0:
                fv_pv = pv * ((1 + periodic_rate) ** total_periods)
                fv_pmt = data["contribution"] * (((1 + periodic_rate) ** total_periods - 1) / periodic_rate)
                result = fv_pv + fv_pmt
            else:
                result = pv + (data["contribution"] * total_periods)
            
            result_label = "Future Portfolio Value"
            result_format = f"${result:,.2f}"
            final_value = result
            
        elif data["goal"] == "required_yield":
            # Solve for Rate using iterative method
            def calculate_fv_for_rate(rate_annual, pv_val, pmt, n, fr):
                periodic_rate = rate_annual / fr
                if periodic_rate > 0:
                    fv_pv = pv_val * ((1 + periodic_rate) ** n)
                    fv_pmt = pmt * (((1 + periodic_rate) ** n - 1) / periodic_rate)
                    return fv_pv + fv_pmt
                else:
                    return pv_val + (pmt * n)
            
            low_rate, high_rate = 0.0001, 1.0
            total_contributions = pv + (data["contribution"] * total_periods)
            
            if data["target_fv"] <= total_contributions:
                calc_yield = 0.0
                result = 0.0
            else:
                for _ in range(100):
                    mid_rate = (low_rate + high_rate) / 2
                    calc_fv = calculate_fv_for_rate(mid_rate, pv, data["contribution"], total_periods, freq)
                    
                    if abs(calc_fv - data["target_fv"]) < 0.01:
                        calc_yield = mid_rate * 100
                        break
                    elif calc_fv < data["target_fv"]:
                        low_rate = mid_rate
                    else:
                        high_rate = mid_rate
                    calc_yield = mid_rate * 100
                
                result = calc_yield
            
            result_label = "Required Annual Yield"
            result_format = f"{result:.2f}%"
            final_value = data["target_fv"]
            
        elif data["goal"] == "required_contribution":
            # Calculate Required PMT
            periodic_rate = (data["annual_yield"] / 100) / freq
            
            if periodic_rate > 0:
                fv_from_pv = pv * ((1 + periodic_rate) ** total_periods)
                remaining_fv = data["target_fv"] - fv_from_pv
                annuity_factor = ((1 + periodic_rate) ** total_periods - 1) / periodic_rate
                calc_contribution = remaining_fv / annuity_factor if annuity_factor > 0 else 0
            else:
                calc_contribution = (data["target_fv"] - pv) / total_periods if total_periods > 0 else 0
            
            result = max(0, calc_contribution)
            calc_contribution = result
            
            result_label = f"Required {freq_label} Contribution"
            result_format = f"${result:,.2f}"
            final_value = data["target_fv"]
        
        # --- Display Result ---
        st.markdown(f"""
        <div class="result-display">
            <div class="label">{result_label.upper()}</div>
            <div class="value">{result_format}</div>
        </div>
        """, unsafe_allow_html=True)
        
        # Summary stats
        if calc_yield is not None and calc_contribution is not None:
            total_contributions_amount = pv + (calc_contribution * total_periods)
            total_interest = final_value - total_contributions_amount
            
            st.markdown(f"""
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="label">Starting Amount</div>
                    <div class="value">${pv:,.2f}</div>
                </div>
                <div class="stat-box">
                    <div class="label">Total Contributions</div>
                    <div class="value">${total_contributions_amount:,.2f}</div>
                </div>
                <div class="stat-box">
                    <div class="label">Interest Earned</div>
                    <div class="value">${total_interest:,.2f}</div>
                </div>
                <div class="stat-box">
                    <div class="label">Time Period</div>
                    <div class="value">{yrs} Years</div>
                </div>
            </div>
            """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        # --- Projection Table ---
        st.markdown("""
        <div class="section-title">
            <div class="section-icon blue">📊</div>
            <h2>Projection Schedule</h2>
        </div>
        """, unsafe_allow_html=True)
        
        # Generate projection data
        if calc_yield is not None and calc_contribution is not None:
            periodic_rate = (calc_yield / 100) / freq
            
            projection_data = []
            balance = pv
            total_principal = pv
            cumulative_interest = 0
            
            projection_data.append({
                "Period": 0,
                "Year": 0,
                "Payment Added": 0,
                "Principal (Cash Invested)": pv,
                "Interest Earned": 0,
                "Cumulative Interest": 0,
                "Total Balance": pv
            })
            
            for period in range(1, total_periods + 1):
                balance += calc_contribution
                total_principal += calc_contribution
                
                interest_this_period = balance * periodic_rate
                balance += interest_this_period
                cumulative_interest += interest_this_period
                
                year = period / freq
                
                projection_data.append({
                    "Period": period,
                    "Year": round(year, 2),
                    "Payment Added": calc_contribution,
                    "Principal (Cash Invested)": total_principal,
                    "Interest Earned": interest_this_period,
                    "Cumulative Interest": cumulative_interest,
                    "Total Balance": balance
                })
            
            df_projection = pd.DataFrame(projection_data)
            
            if total_periods > 24:
                yearly_periods = [0] + [i for i in range(freq, total_periods + 1, freq)]
                df_display = df_projection[df_projection['Period'].isin(yearly_periods)].copy()
            else:
                df_display = df_projection.copy()
            
            df_formatted = df_display.copy()
            for col in ["Payment Added", "Principal (Cash Invested)", "Interest Earned", "Cumulative Interest", "Total Balance"]:
                df_formatted[col] = df_formatted[col].apply(lambda x: f"${x:,.2f}")
            
            st.dataframe(df_formatted, use_container_width=True, hide_index=True)
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            # --- Chart ---
            st.markdown("""
            <div class="section-header">
                <div class="icon-box icon-success">📈</div>
                <h3>Growth Visualization</h3>
            </div>
            """, unsafe_allow_html=True)
            
            chart_data = df_projection[["Year", "Principal (Cash Invested)", "Total Balance"]].copy()
            chart_data = chart_data.rename(columns={
                "Principal (Cash Invested)": "Principal",
                "Total Balance": "Portfolio Value"
            })
            
            chart_melted = chart_data.melt(
                id_vars=["Year"], 
                value_vars=["Principal", "Portfolio Value"],
                var_name="Type",
                value_name="Amount"
            )
            
            import altair as alt
            
            chart = alt.Chart(chart_melted).mark_area(opacity=0.6).encode(
                x=alt.X('Year:Q', title='Years'),
                y=alt.Y('Amount:Q', title='Value ($)', stack=None),
                color=alt.Color('Type:N', 
                               scale=alt.Scale(
                                   domain=['Principal', 'Portfolio Value'],
                                   range=['#4CAF50', '#2196F3']
                               ),
                               legend=alt.Legend(title=""))
            ).properties(
                height=400
            ).configure_axis(
                labelFontSize=12,
                titleFontSize=14
            )
            
            st.altair_chart(chart, use_container_width=True)
            
            # Interest vs Principal breakdown
            st.markdown("""
            <div class="section-title">
                <div class="section-icon pink">💎</div>
                <h2>Portfolio Breakdown</h2>
            </div>
            """, unsafe_allow_html=True)
            
            if len(projection_data) > 0:
                final_data = projection_data[-1]
                final_principal = final_data["Principal (Cash Invested)"]
                final_interest = final_data["Cumulative Interest"]
                final_bal = final_data["Total Balance"]
                
                if final_bal > 0:
                    principal_pct = (final_principal / final_bal) * 100
                    interest_pct = (final_interest / final_bal) * 100
                    
                    st.markdown(f"""
                    <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
                        <div class="stat-box">
                            <div class="label">💼 Principal (Your Money)</div>
                            <div class="value">${final_principal:,.2f}</div>
                            <div style="color: #22c55e; font-weight: 600; margin-top: 8px; font-size: 0.9rem;">{principal_pct:.1f}% of portfolio</div>
                        </div>
                        <div class="stat-box">
                            <div class="label">📈 Interest (Growth)</div>
                            <div class="value">${final_interest:,.2f}</div>
                            <div style="color: #3b82f6; font-weight: 600; margin-top: 8px; font-size: 0.9rem;">{interest_pct:.1f}% of portfolio</div>
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                    
                    # Visual breakdown bar
                    st.markdown(f"""
                    <div class="progress-container">
                        <div class="progress-fill progress-principal" style="width: {principal_pct}%; display: inline-block; float: left;"></div>
                        <div class="progress-fill progress-interest" style="width: {interest_pct}%; display: inline-block;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.85rem; color: #64748b;">
                        <span>🟢 Principal: {principal_pct:.1f}%</span>
                        <span>🔵 Interest: {interest_pct:.1f}%</span>
                    </div>
                    """, unsafe_allow_html=True)
        
        # ===== EXPORT BUTTONS =====
        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown("""
        <div class="section-title">
            <div class="section-icon blue">📥</div>
            <h2>Export Results</h2>
        </div>
        """, unsafe_allow_html=True)
        
        export_col1, export_col2 = st.columns(2)
        
        # Prepare export data
        export_summary = {
            "Goal Type": data["goal"].replace("_", " ").title(),
            "Present Value": f"${pv:,.2f}",
            "Investment Period": f"{yrs} years",
            "Frequency": freq_label,
            "Result": result_format,
        }
        if calc_yield is not None:
            export_summary["Annual Yield"] = f"{calc_yield:.2f}%"
        if calc_contribution is not None:
            export_summary["Contribution Amount"] = f"${calc_contribution:,.2f}"
        if data.get("target_fv"):
            export_summary["Target Future Value"] = f"${data['target_fv']:,.2f}"
        
        # Excel Export
        with export_col1:
            excel_buffer = io.BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                # Summary sheet
                summary_df = pd.DataFrame([export_summary]).T.reset_index()
                summary_df.columns = ["Parameter", "Value"]
                summary_df.to_excel(writer, sheet_name="Summary", index=False)
                
                # Projection sheet
                df_projection.to_excel(writer, sheet_name="Projection Schedule", index=False)
            
            excel_buffer.seek(0)
            st.download_button(
                label="📊 Export to Excel",
                data=excel_buffer,
                file_name=f"financial_plan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
        
        # PDF Export
        with export_col2:
            def generate_planner_pdf():
                """Generate a styled PDF report with visualization."""
                from reportlab.lib import colors
                from reportlab.lib.pagesizes import letter
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.lib.units import inch
                from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
                from reportlab.graphics.shapes import Drawing, Rect
                from reportlab.graphics.charts.lineplots import LinePlot
                from reportlab.graphics.charts.legends import Legend
                from reportlab.graphics.widgets.markers import makeMarker
                from reportlab.lib.enums import TA_CENTER
                
                pdf_buffer = io.BytesIO()
                doc = SimpleDocTemplate(pdf_buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
                
                styles = getSampleStyleSheet()
                title_style = ParagraphStyle(
                    'CustomTitle',
                    parent=styles['Heading1'],
                    fontSize=24,
                    textColor=colors.HexColor('#667eea'),
                    spaceAfter=20,
                    alignment=TA_CENTER
                )
                heading_style = ParagraphStyle(
                    'CustomHeading',
                    parent=styles['Heading2'],
                    fontSize=14,
                    textColor=colors.HexColor('#1e293b'),
                    spaceBefore=20,
                    spaceAfter=10
                )
                normal_style = styles['Normal']
                
                elements = []
                
                # Title
                elements.append(Paragraph("📈 Financial Planner Report", title_style))
                elements.append(Paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", 
                                         ParagraphStyle('Subtitle', parent=normal_style, alignment=TA_CENTER, textColor=colors.gray)))
                elements.append(Spacer(1, 20))
                
                # Result highlight
                result_data = [[result_label.upper()], [result_format]]
                result_table = Table(result_data, colWidths=[5*inch])
                result_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#10b981')),
                    ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 1), (-1, 1), 24),
                    ('TOPPADDING', (0, 0), (-1, -1), 15),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
                    ('ROUNDEDCORNERS', [10, 10, 10, 10]),
                ]))
                elements.append(result_table)
                elements.append(Spacer(1, 20))
                
                # Summary section
                elements.append(Paragraph("📋 Summary", heading_style))
                summary_table_data = [[k, v] for k, v in export_summary.items()]
                summary_table = Table(summary_table_data, colWidths=[2.5*inch, 3*inch])
                summary_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
                    ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1e293b')),
                    ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                    ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                ]))
                elements.append(summary_table)
                elements.append(Spacer(1, 20))
                
                # Statistics
                if calc_yield is not None and calc_contribution is not None:
                    elements.append(Paragraph("📊 Statistics", heading_style))
                    stats_data = [
                        ["Starting Value", f"${pv:,.2f}"],
                        ["Total Contributions", f"${total_contributions_amount:,.2f}"],
                        ["Total Interest Earned", f"${total_interest:,.2f}"],
                        ["Final Portfolio Value", f"${final_value:,.2f}"],
                    ]
                    stats_table = Table(stats_data, colWidths=[2.5*inch, 3*inch])
                    stats_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
                        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1e293b')),
                        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 10),
                        ('TOPPADDING', (0, 0), (-1, -1), 8),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                    ]))
                    elements.append(stats_table)
                    elements.append(Spacer(1, 20))
                
                # Growth Chart
                elements.append(Paragraph("📈 Growth Visualization", heading_style))
                
                drawing = Drawing(500, 200)
                
                # Prepare chart data - sample every few periods for clarity
                sample_rate = max(1, len(projection_data) // 20)
                sampled_data = projection_data[::sample_rate]
                if projection_data[-1] not in sampled_data:
                    sampled_data.append(projection_data[-1])
                
                principal_points = [(d["Year"], d["Principal (Cash Invested)"]) for d in sampled_data]
                balance_points = [(d["Year"], d["Total Balance"]) for d in sampled_data]
                
                lp = LinePlot()
                lp.x = 50
                lp.y = 30
                lp.height = 150
                lp.width = 420
                lp.data = [principal_points, balance_points]
                lp.lines[0].strokeColor = colors.HexColor('#4CAF50')
                lp.lines[0].strokeWidth = 2
                lp.lines[1].strokeColor = colors.HexColor('#2196F3')
                lp.lines[1].strokeWidth = 2
                lp.xValueAxis.valueMin = 0
                lp.xValueAxis.valueMax = yrs
                lp.yValueAxis.valueMin = 0
                lp.yValueAxis.valueMax = max(d["Total Balance"] for d in projection_data) * 1.1
                
                drawing.add(lp)
                
                # Legend
                legend = Legend()
                legend.x = 200
                legend.y = 5
                legend.dx = 8
                legend.dy = 8
                legend.fontName = 'Helvetica'
                legend.fontSize = 8
                legend.boxAnchor = 'c'
                legend.columnMaximum = 1
                legend.strokeWidth = 0.5
                legend.alignment = 'right'
                legend.colorNamePairs = [
                    (colors.HexColor('#4CAF50'), 'Principal'),
                    (colors.HexColor('#2196F3'), 'Portfolio Value')
                ]
                drawing.add(legend)
                
                elements.append(drawing)
                elements.append(Spacer(1, 20))
                
                # Portfolio Breakdown
                if len(projection_data) > 0:
                    final_d = projection_data[-1]
                    f_principal = final_d["Principal (Cash Invested)"]
                    f_interest = final_d["Cumulative Interest"]
                    f_bal = final_d["Total Balance"]
                    
                    if f_bal > 0:
                        p_pct = (f_principal / f_bal) * 100
                        i_pct = (f_interest / f_bal) * 100
                        
                        elements.append(Paragraph("💎 Portfolio Breakdown", heading_style))
                        breakdown_data = [
                            ["Component", "Amount", "Percentage"],
                            ["Principal (Your Money)", f"${f_principal:,.2f}", f"{p_pct:.1f}%"],
                            ["Interest (Growth)", f"${f_interest:,.2f}", f"{i_pct:.1f}%"],
                            ["Total", f"${f_bal:,.2f}", "100%"],
                        ]
                        breakdown_table = Table(breakdown_data, colWidths=[2*inch, 2*inch, 1.5*inch])
                        breakdown_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f8fafc')),
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                            ('FONTSIZE', (0, 0), (-1, -1), 10),
                            ('TOPPADDING', (0, 0), (-1, -1), 10),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                        ]))
                        elements.append(breakdown_table)
                
                # Build PDF
                doc.build(elements)
                pdf_buffer.seek(0)
                return pdf_buffer.getvalue()
            
            try:
                pdf_data = generate_planner_pdf()
                st.download_button(
                    label="📄 Export to PDF",
                    data=pdf_data,
                    file_name=f"financial_plan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
                    mime="application/pdf",
                    use_container_width=True
                )
            except ImportError:
                st.warning("⚠️ PDF export requires reportlab. Install with: pip install reportlab")
            except Exception as e:
                st.error(f"❌ PDF generation failed: {str(e)}")
        
        # Clear button with modern styling
        st.markdown("<br>", unsafe_allow_html=True)
        col_btn1, col_btn2, col_btn3 = st.columns([1, 2, 1])
        with col_btn2:
            if st.button("🔄 Clear & Start Over", use_container_width=True):
                st.session_state.planner_calculated = False
                st.session_state.planner_data = None
                st.rerun()
    
    # Footer
    st.markdown("""
    <div class="planner-footer">
        <div class="title">📈 Financial Planner Pro</div>
        <div class="subtitle">Professional Time Value of Money Calculator</div>
    </div>
    """, unsafe_allow_html=True)


def ui_backup_restore():
    """
    Professional Backup & Restore System
    - Exports ALL user data to a single Excel file with multiple sheets
    - The same exported file can be directly imported for restore
    - Supports Merge (add to existing) or Full Replace modes
    """
    user_id = st.session_state.get('user_id')
    username = st.session_state.get('username', 'user')
    
    # Professional styling
    st.markdown("""
    <style>
    .backup-card {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 12px;
        padding: 1.5rem;
        margin: 1rem 0;
    }
    .backup-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    .backup-info {
        font-size: 0.85rem;
        opacity: 0.8;
    }
    .data-table-header {
        background: rgba(59, 130, 246, 0.2);
        padding: 0.5rem 1rem;
        border-radius: 8px;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    </style>
    """, unsafe_allow_html=True)
    
    st.title("💾 Backup & Restore Center")
    st.caption("Securely export and restore all your portfolio data. The exported file can be directly re-imported.")
    
    # =============================
    # HELPER: Ensure all backup tables exist
    # =============================
    def ensure_backup_tables():
        """Create any missing tables required for backup."""
        conn = get_conn()
        cur = conn.cursor()
        try:
            # Create trading_history if missing
            db_execute(cur, """
                CREATE TABLE IF NOT EXISTS trading_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    symbol TEXT NOT NULL,
                    trade_date TEXT NOT NULL,
                    trade_type TEXT DEFAULT 'Buy',
                    quantity REAL DEFAULT 0,
                    price REAL DEFAULT 0,
                    total_value REAL DEFAULT 0,
                    notes TEXT,
                    created_at INTEGER
                )
            """)
            # Create portfolio_snapshots if missing
            db_execute(cur, """
                CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    snapshot_date TEXT NOT NULL,
                    portfolio_value REAL DEFAULT 0,
                    daily_movement REAL DEFAULT 0,
                    beginning_difference REAL DEFAULT 0,
                    deposit_cash REAL DEFAULT 0,
                    accumulated_cash REAL DEFAULT 0,
                    net_gain REAL DEFAULT 0,
                    change_percent REAL DEFAULT 0,
                    roi_percent REAL DEFAULT 0,
                    created_at INTEGER
                )
            """)
            conn.commit()
        except Exception:
            pass
        finally:
            conn.close()
    
    # Ensure tables exist
    ensure_backup_tables()
    
    # =============================
    # HELPER: Get all exportable data
    # =============================
    def safe_query(sql, params):
        """Query that returns empty DataFrame if table doesn't exist."""
        try:
            return query_df(sql, params)
        except Exception as e:
            return pd.DataFrame()
    
    def get_all_user_data():
        """Fetch all data tables for the current user."""
        data = {
            'stocks': safe_query("SELECT * FROM stocks WHERE user_id = ? ORDER BY symbol", (user_id,)),
            'transactions': safe_query("SELECT * FROM transactions WHERE user_id = ? ORDER BY txn_date DESC", (user_id,)),
            'cash_deposits': safe_query("SELECT * FROM cash_deposits WHERE user_id = ? ORDER BY deposit_date DESC", (user_id,)),
            'portfolio_cash': safe_query("SELECT * FROM portfolio_cash WHERE user_id = ?", (user_id,)),
            'trading_history': safe_query("SELECT * FROM trading_history WHERE user_id = ? ORDER BY trade_date DESC", (user_id,)),
            # Include only current user's portfolio_snapshots
            'portfolio_snapshots': safe_query(
                "SELECT * FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC", 
                (user_id,)
            ),
        }
        return data
    
    # =============================
    # HELPER: Parse date safely
    # =============================
    def safe_date(val, default=None):
        """Convert various date formats to YYYY-MM-DD string."""
        if pd.isna(val) or val is None:
            return default or str(date.today())
        if isinstance(val, pd.Timestamp):
            return val.strftime('%Y-%m-%d')
        if isinstance(val, datetime):
            return val.strftime('%Y-%m-%d')
        if isinstance(val, date):
            return val.strftime('%Y-%m-%d')
        return str(val).split(' ')[0].split('T')[0]
    
    # =============================
    # HELPER: Safe float conversion
    # =============================
    def safe_float(val, default=0.0):
        """Safely convert value to float."""
        if pd.isna(val) or val is None:
            return default
        try:
            return float(val)
        except:
            return default
    
    # =============================
    # HELPER: Safe string conversion
    # =============================
    def safe_str(val, default=''):
        """Safely convert value to string."""
        if pd.isna(val) or val is None:
            return default
        return str(val)
    
    tab_exp, tab_imp = st.tabs(["📤 Export Backup", "📥 Restore from Backup"])
    
    # =====================================================
    # TAB 1: EXPORT
    # =====================================================
    with tab_exp:
        st.markdown("### 📤 Download Complete Backup")
        
        # Fetch all data
        all_data = get_all_user_data()
        
        # Extract dividends from transactions for a dedicated sheet
        dividends_df = pd.DataFrame()
        txn_df = all_data['transactions']
        if not txn_df.empty:
            # Filter transactions that have dividends or bonus shares
            div_mask = pd.Series([False] * len(txn_df))
            if 'cash_dividend' in txn_df.columns:
                div_mask = div_mask | (txn_df['cash_dividend'].fillna(0) > 0)
            if 'bonus_shares' in txn_df.columns:
                div_mask = div_mask | (txn_df['bonus_shares'].fillna(0) > 0)
            if 'reinvested_dividend' in txn_df.columns:
                div_mask = div_mask | (txn_df['reinvested_dividend'].fillna(0) > 0)
            
            dividends_df = txn_df[div_mask].copy()
            if not dividends_df.empty:
                # Select relevant columns for dividend sheet
                div_cols = ['portfolio', 'stock_symbol', 'txn_date', 'cash_dividend', 'bonus_shares', 
                           'reinvested_dividend', 'notes']
                available_cols = [c for c in div_cols if c in dividends_df.columns]
                dividends_df = dividends_df[available_cols]
        
        # Add dividends to all_data for export
        all_data['dividends'] = dividends_df
        
        # Calculate statistics
        stats = {name: len(df) for name, df in all_data.items()}
        total_records = sum(stats.values())
        
        # Professional summary display
        st.markdown('<div class="data-table-header">📊 Your Data Summary</div>', unsafe_allow_html=True)
        
        col1, col2, col3 = st.columns(3)
        
        with col1:
            st.markdown("**📈 Portfolio Data**")
            st.metric("Stocks Tracked", stats['stocks'], help="Unique stocks in your portfolio")
            st.metric("Transactions", stats['transactions'], help="Buy, Sell, Dividend, Bonus transactions")
            st.metric("Dividends & Bonus", stats['dividends'], help="Cash dividends, bonus shares, reinvested dividends")
        
        with col2:
            st.markdown("**💰 Cash Management**")
            st.metric("Cash Deposits", stats['cash_deposits'], help="Capital injection records")
            st.metric("Manual Cash Balances", stats['portfolio_cash'], help="Per-portfolio available cash overrides")
        
        with col3:
            st.markdown("**📊 Tracking & History**")
            st.metric("📈 Portfolio Tracker", stats['portfolio_snapshots'], help="Daily portfolio value snapshots for performance tracking")
            st.metric("Trading History", stats['trading_history'], help="Short-term trading records")
        
        st.divider()
        
        # Show what's included
        st.markdown("**📋 What's Included in Backup:**")
        
        included_items = []
        if stats['stocks'] > 0:
            included_items.append(f"✅ **Stocks** ({stats['stocks']}) - Symbols, names, currency, sectors, TradingView mappings")
        if stats['transactions'] > 0:
            included_items.append(f"✅ **Transactions** ({stats['transactions']}) - All Buy/Sell transactions with costs, fees, notes")
        if stats['dividends'] > 0:
            # Calculate totals
            total_cash_div = 0
            total_bonus = 0
            if not dividends_df.empty:
                if 'cash_dividend' in dividends_df.columns:
                    total_cash_div = dividends_df['cash_dividend'].fillna(0).sum()
                if 'bonus_shares' in dividends_df.columns:
                    total_bonus = dividends_df['bonus_shares'].fillna(0).sum()
            included_items.append(f"✅ **Dividends** ({stats['dividends']}) - Cash: {total_cash_div:,.2f}, Bonus shares: {total_bonus:,.0f}")
        if stats['cash_deposits'] > 0:
            included_items.append(f"✅ **Cash Deposits** ({stats['cash_deposits']}) - Capital injections history")
        if stats['portfolio_cash'] > 0:
            included_items.append(f"✅ **Manual Cash Balances** ({stats['portfolio_cash']}) - Available cash overrides per portfolio")
        if stats['portfolio_snapshots'] > 0:
            # Show date range for snapshots
            snap_df = all_data['portfolio_snapshots']
            if not snap_df.empty and 'snapshot_date' in snap_df.columns:
                min_date = snap_df['snapshot_date'].min()
                max_date = snap_df['snapshot_date'].max()
                included_items.append(f"✅ **Portfolio Tracker History** ({stats['portfolio_snapshots']}) - Daily values from {min_date} to {max_date}")
            else:
                included_items.append(f"✅ **Portfolio Tracker History** ({stats['portfolio_snapshots']})")
        if stats['trading_history'] > 0:
            included_items.append(f"✅ **Trading History** ({stats['trading_history']}) - Short-term trading records")
        
        for item in included_items:
            st.markdown(item)
        
        if total_records == 0:
            st.warning("⚠️ No data to export. Start adding transactions and data to your portfolio!")
        else:
            st.divider()
            
            # Generate backup file
            buffer = io.BytesIO()
            with pd.ExcelWriter(buffer, engine='xlsxwriter') as writer:
                workbook = writer.book
                
                # Create formats
                header_format = workbook.add_format({
                    'bold': True, 'bg_color': '#4F81BD', 'font_color': 'white',
                    'border': 1, 'align': 'center'
                })
                
                # Write each non-empty table
                for sheet_name, df in all_data.items():
                    if not df.empty:
                        df.to_excel(writer, index=False, sheet_name=sheet_name)
                        # Format headers
                        worksheet = writer.sheets[sheet_name]
                        for col_num, value in enumerate(df.columns.values):
                            worksheet.write(0, col_num, value, header_format)
                            # Auto-adjust column width
                            max_len = max(df[value].astype(str).map(len).max(), len(str(value))) + 2
                            worksheet.set_column(col_num, col_num, min(max_len, 40))
                
                # Add metadata sheet (for validation on import)
                metadata = pd.DataFrame({
                    'key': [
                        'backup_version', 'backup_date', 'backup_time', 'username',
                        'stocks_count', 'transactions_count', 'dividends_count', 'cash_deposits_count',
                        'portfolio_cash_count', 'trading_history_count', 'portfolio_snapshots_count',
                        'total_records'
                    ],
                    'value': [
                        '3.1', str(date.today()), datetime.now().strftime('%H:%M:%S'), username,
                        stats['stocks'], stats['transactions'], stats['dividends'], stats['cash_deposits'],
                        stats['portfolio_cash'], stats['trading_history'], stats['portfolio_snapshots'],
                        total_records
                    ]
                })
                metadata.to_excel(writer, index=False, sheet_name='_backup_info')
            
            # Generate filename with timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M')
            filename = f"portfolio_backup_{username}_{timestamp}.xlsx"
            
            st.markdown(f"""
            <div class="backup-card">
                <div class="backup-title">📦 Backup Ready</div>
                <div class="backup-info">
                    Total: <strong>{total_records:,}</strong> records across <strong>{len([s for s in stats.values() if s > 0])}</strong> tables<br>
                    File: <strong>{filename}</strong>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            st.download_button(
                label="⬇️ Download Backup File",
                data=buffer.getvalue(),
                file_name=filename,
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                type="primary",
                use_container_width=True
            )
            
            st.info("💡 **Tip:** Store this file safely. You can restore from it anytime using the 'Restore from Backup' tab.")
            
            # === Database File Backup ===
            st.divider()
            st.markdown("### 🗄️ Full Database Backup")
            st.caption("Download the raw SQLite database file. Useful for migration, full system recovery, or advanced debugging.")
            
            try:
                db_path = "portfolio.db"
                with open(db_path, "rb") as fp:
                    db_timestamp = datetime.now().strftime('%Y%m%d_%H%M')
                    st.download_button(
                        label="⬇️ Download portfolio.db",
                        data=fp.read(),
                        file_name=f"portfolio_backup_{db_timestamp}.db",
                        mime="application/x-sqlite3",
                        use_container_width=True
                    )
                st.caption("⚠️ **Note:** This is your complete database. Handle with care - it contains all user data.")
            except FileNotFoundError:
                st.warning("Database file not found. You may be using an external database configuration.")
            except Exception as e:
                st.warning(f"Unable to read database file: {e}")
    
    # =====================================================
    # TAB 2: RESTORE
    # =====================================================
    with tab_imp:
        st.markdown("### 📥 Restore from Backup File")
        st.markdown("Upload a backup file previously exported from this app. The same Excel file you downloaded can be directly restored.")
        
        # Restore mode selection
        st.markdown("**🔧 Restore Mode:**")
        restore_mode = st.radio(
            "Select how to handle existing data:",
            options=["merge", "replace"],
            format_func=lambda x: "🔄 **Merge** - Add backup data to existing records (safe, no data loss)" if x == "merge" else "🗑️ **Full Replace** - Delete ALL current data and restore from backup",
            label_visibility="collapsed"
        )
        
        if restore_mode == "replace":
            st.error("⚠️ **DANGER:** Full Replace will permanently DELETE all your current data before restoring!")
        
        st.divider()
        
        # File upload
        uploaded_file = st.file_uploader(
            "📁 Upload your backup file (.xlsx)",
            type=['xlsx'],
            help="Upload the Excel backup file you want to restore from"
        )
        
        if uploaded_file:
            try:
                # Read and validate the file
                xl = pd.ExcelFile(uploaded_file)
                sheets = xl.sheet_names
                
                # Check for metadata
                backup_info = {}
                if '_backup_info' in sheets:
                    info_df = pd.read_excel(uploaded_file, sheet_name='_backup_info')
                    backup_info = dict(zip(info_df['key'], info_df['value']))
                elif '_metadata' in sheets:  # Legacy format
                    info_df = pd.read_excel(uploaded_file, sheet_name='_metadata')
                    backup_info = dict(zip(info_df['info'], info_df['value']))
                
                # Show backup info
                if backup_info:
                    st.success(f"✅ Valid backup file detected")
                    backup_date = backup_info.get('backup_date', backup_info.get('backup_date', 'Unknown'))
                    backup_version = backup_info.get('backup_version', backup_info.get('app_version', '1.0'))
                    st.info(f"📅 **Backup Date:** {backup_date} | **Version:** {backup_version}")
                
                # Preview contents
                st.markdown("**📋 Backup Contents:**")
                
                # Exclude dividends sheet from restore (it's derived from transactions)
                data_sheets = [s for s in sheets if not s.startswith('_') and s != 'dividends']
                preview_data = {}
                
                for sheet in data_sheets:
                    df = pd.read_excel(uploaded_file, sheet_name=sheet)
                    preview_data[sheet] = {'count': len(df), 'columns': list(df.columns)}
                
                # Also show dividends if present (read-only info)
                if 'dividends' in sheets:
                    div_df = pd.read_excel(uploaded_file, sheet_name='dividends')
                    st.info(f"💰 **Dividends sheet detected:** {len(div_df)} dividend records (included in transactions, no separate restore needed)")
                
                # Display in grid
                cols = st.columns(3)
                for idx, (sheet, info) in enumerate(preview_data.items()):
                    with cols[idx % 3]:
                        icon = {
                            'stocks': '📈',
                            'transactions': '💳',
                            'cash_deposits': '💵',
                            'portfolio_cash': '💰',
                            'trading_history': '📊',
                            'portfolio_snapshots': '📉'
                        }.get(sheet, '📄')
                        st.metric(f"{icon} {sheet}", f"{info['count']:,} rows")
                
                total_to_restore = sum(info['count'] for info in preview_data.values())
                
                st.divider()
                
                # Confirmation section - simple button confirmation
                if restore_mode == "replace":
                    st.warning("⚠️ **Full Replace Mode:** This will DELETE all your existing data and replace it with the backup.")
                else:
                    st.info("ℹ️ **Merge Mode:** This will add backup data to your existing data (duplicates may occur).")
                
                # Restore button with confirmation
                col1, col2 = st.columns(2)
                with col1:
                    if st.button("🔄 Confirm & Restore", type="primary", use_container_width=True):
                        
                        # IMPORTANT: Reset file pointer for reading sheets again
                        uploaded_file.seek(0)
                        
                        conn = get_conn()
                        cur = conn.cursor()
                        
                        try:
                            progress = st.progress(0, text="Initializing...")
                            imported = 0
                            errors = 0
                            error_details = []
                            
                            # STEP 1: Clear data if Full Replace
                            if restore_mode == "replace":
                                progress.progress(5, text="🗑️ Clearing existing data...")
                                tables_to_clear = ['trading_history', 'portfolio_snapshots', 'portfolio_cash', 
                                                 'cash_deposits', 'transactions', 'stocks']
                                for tbl in tables_to_clear:
                                    try:
                                        db_execute(cur, f"DELETE FROM {tbl} WHERE user_id = ?", (user_id,))
                                    except Exception as e:
                                        error_details.append(f"Clear {tbl}: {e}")
                                conn.commit()
                            
                            # STEP 2: Restore Stocks (must be first - other tables reference stocks)
                            if 'stocks' in preview_data:
                                progress.progress(15, text="📈 Restoring stocks...")
                                uploaded_file.seek(0)  # Reset file pointer
                                df = pd.read_excel(uploaded_file, sheet_name='stocks')
                                stocks_imported = 0
                                stocks_updated = 0
                                for _, row in df.iterrows():
                                    try:
                                        symbol = safe_str(row.get('symbol'))
                                        if not symbol:
                                            continue
                                        
                                        # Handle both 'name' (SQLite) and 'company_name' (PostgreSQL) columns
                                        stock_name = safe_str(row.get('name')) or safe_str(row.get('company_name')) or symbol
                                        
                                        # Check if exists
                                        existing = query_df("SELECT id FROM stocks WHERE symbol = ? AND user_id = ?", (symbol, user_id))
                                        if existing.empty:
                                            # INSERT new stock - use simpler column set that works for both schemas
                                            db_execute(cur, """
                                                INSERT INTO stocks (user_id, symbol, name, portfolio, currency, current_price)
                                                VALUES (?, ?, ?, ?, ?, ?)
                                            """, (
                                                user_id, symbol, stock_name,
                                                safe_str(row.get('portfolio'), 'KFH'),
                                                safe_str(row.get('currency'), 'KWD'),
                                                safe_float(row.get('current_price'))
                                            ))
                                            stocks_imported += 1
                                        else:
                                            # UPDATE existing stock with backup data
                                            db_execute(cur, """
                                                UPDATE stocks SET 
                                                    name = ?, portfolio = ?, currency = ?, current_price = ?
                                                WHERE symbol = ? AND user_id = ?
                                            """, (
                                                stock_name,
                                                safe_str(row.get('portfolio'), 'KFH'),
                                                safe_str(row.get('currency'), 'KWD'),
                                                safe_float(row.get('current_price')),
                                                symbol, user_id
                                            ))
                                            stocks_updated += 1
                                        imported += 1
                                    except Exception as e:
                                        errors += 1
                                        error_details.append(f"Stock {row.get('symbol')}: {e}")
                                conn.commit()
                                error_details.append(f"Stocks: {stocks_imported} new, {stocks_updated} updated")
                        
                            # STEP 3: Restore Transactions (includes dividends, bonus shares)
                            if 'transactions' in preview_data:
                                progress.progress(35, text="💳 Restoring transactions...")
                                uploaded_file.seek(0)  # Reset file pointer
                                df = pd.read_excel(uploaded_file, sheet_name='transactions')
                                txn_count = 0
                                txn_errors = 0
                                for idx, row in df.iterrows():
                                    try:
                                        stock_sym = safe_str(row.get('stock_symbol'))
                                        txn_date = safe_date(row.get('txn_date'))
                                        txn_type = safe_str(row.get('txn_type'), 'Buy')
                                        
                                        if not stock_sym:
                                            txn_errors += 1
                                            error_details.append(f"Transaction row {idx}: Missing stock_symbol")
                                            continue
                                        
                                        db_execute(cur, """
                                            INSERT INTO transactions 
                                            (user_id, portfolio, stock_symbol, txn_date, txn_type, 
                                             shares, purchase_cost, sell_value, cash_dividend, 
                                             bonus_shares, reinvested_dividend, fees, broker,
                                             reference, notes, category, price_override, planned_cum_shares, created_at)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        """, (
                                            user_id,
                                            safe_str(row.get('portfolio'), 'KFH'),
                                            stock_sym,
                                            txn_date,
                                            txn_type,
                                            safe_float(row.get('shares')),
                                            safe_float(row.get('purchase_cost')),
                                            safe_float(row.get('sell_value')),
                                            safe_float(row.get('cash_dividend')),
                                            safe_float(row.get('bonus_shares')),
                                            safe_float(row.get('reinvested_dividend')),
                                            safe_float(row.get('fees')),
                                            safe_str(row.get('broker')),
                                            safe_str(row.get('reference')),
                                            safe_str(row.get('notes')),
                                            safe_str(row.get('category'), 'portfolio'),
                                            safe_float(row.get('price_override')) if pd.notna(row.get('price_override')) else None,
                                            safe_float(row.get('planned_cum_shares')) if pd.notna(row.get('planned_cum_shares')) else None,
                                            int(time.time())
                                        ))
                                        imported += 1
                                        txn_count += 1
                                    except Exception as e:
                                        errors += 1
                                        txn_errors += 1
                                        error_details.append(f"Transaction row {idx} ({row.get('stock_symbol')}): {str(e)[:100]}")
                                conn.commit()
                                error_details.append(f"Transactions: {txn_count} imported, {txn_errors} errors")
                        
                            # STEP 4: Restore Cash Deposits
                            if 'cash_deposits' in preview_data:
                                progress.progress(50, text="💵 Restoring cash deposits...")
                                uploaded_file.seek(0)  # Reset file pointer
                                df = pd.read_excel(uploaded_file, sheet_name='cash_deposits')
                                cash_count = 0
                                
                                # Detect which schema we're using by checking table columns
                                try:
                                    db_cols = table_columns("cash_deposits")
                                    has_new_schema = 'source' in db_cols
                                    has_old_schema = 'bank_name' in db_cols
                                except:
                                    has_new_schema = True
                                    has_old_schema = False
                                
                                for _, row in df.iterrows():
                                    try:
                                        # Handle different column naming conventions in backup file
                                        # Old schema exports: bank_name, description, comments
                                        # New schema exports: source, notes
                                        source_val = (
                                            safe_str(row.get('source')) or 
                                            safe_str(row.get('bank_name')) or 
                                            ''
                                        )
                                        notes_val = (
                                            safe_str(row.get('notes')) or 
                                            safe_str(row.get('description')) or 
                                            safe_str(row.get('comments')) or 
                                            ''
                                        )
                                        
                                        # Use appropriate INSERT based on target DB schema
                                        if has_new_schema:
                                            # PostgreSQL / new SQLite with source, notes columns
                                            db_execute(cur, """
                                                INSERT INTO cash_deposits 
                                                (user_id, portfolio, amount, currency, deposit_date, 
                                                 source, notes, include_in_analysis, created_at)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                            """, (
                                                user_id,
                                                safe_str(row.get('portfolio'), 'KFH'),
                                                safe_float(row.get('amount')),
                                                safe_str(row.get('currency'), 'KWD'),
                                                safe_date(row.get('deposit_date')),
                                                source_val,
                                                notes_val,
                                                int(safe_float(row.get('include_in_analysis'), 1)),
                                                int(time.time())
                                            ))
                                        elif has_old_schema:
                                            # Old SQLite with bank_name, description, comments columns
                                            db_execute(cur, """
                                                INSERT INTO cash_deposits 
                                                (user_id, portfolio, bank_name, deposit_date, amount, 
                                                 description, comments, created_at)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                            """, (
                                                user_id,
                                                safe_str(row.get('portfolio'), 'KFH'),
                                                source_val or 'Unknown',  # bank_name is NOT NULL
                                                safe_date(row.get('deposit_date')),
                                                safe_float(row.get('amount')),
                                                notes_val,
                                                '',
                                                int(time.time())
                                            ))
                                        imported += 1
                                        cash_count += 1
                                    except Exception as e:
                                        errors += 1
                                        error_details.append(f"Cash deposit: {e}")
                                conn.commit()
                                error_details.append(f"Cash Deposits: {cash_count} imported")
                            
                            # STEP 5: Restore Portfolio Cash Balances
                            if 'portfolio_cash' in preview_data:
                                progress.progress(65, text="💰 Restoring cash balances...")
                                uploaded_file.seek(0)  # Reset file pointer
                                df = pd.read_excel(uploaded_file, sheet_name='portfolio_cash')
                                for _, row in df.iterrows():
                                    try:
                                        portfolio = safe_str(row.get('portfolio'))
                                        existing = query_df("SELECT id FROM portfolio_cash WHERE portfolio = ? AND user_id = ?", (portfolio, user_id))
                                        if existing.empty:
                                            db_execute(cur, """
                                                INSERT INTO portfolio_cash (user_id, portfolio, balance, currency, last_updated)
                                                VALUES (?, ?, ?, ?, ?)
                                            """, (
                                                user_id, portfolio,
                                                safe_float(row.get('balance')),
                                                safe_str(row.get('currency'), 'KWD'),
                                                int(time.time())
                                            ))
                                        else:
                                            db_execute(cur, """
                                                UPDATE portfolio_cash SET balance = ?, currency = ?, last_updated = ?
                                                WHERE portfolio = ? AND user_id = ?
                                            """, (
                                                safe_float(row.get('balance')),
                                                safe_str(row.get('currency'), 'KWD'),
                                                int(time.time()),
                                                portfolio, user_id
                                            ))
                                        imported += 1
                                    except Exception as e:
                                        errors += 1
                                conn.commit()
                            
                            # STEP 6: Restore Trading History
                            if 'trading_history' in preview_data:
                                progress.progress(80, text="📊 Restoring trading history...")
                                uploaded_file.seek(0)  # Reset file pointer
                                df = pd.read_excel(uploaded_file, sheet_name='trading_history')
                                for _, row in df.iterrows():
                                    try:
                                        db_execute(cur, """
                                            INSERT INTO trading_history 
                                            (user_id, symbol, trade_date, trade_type, quantity, 
                                             price, total_value, notes, created_at)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        """, (
                                            user_id,
                                            safe_str(row.get('symbol')),
                                            safe_date(row.get('trade_date')),
                                            safe_str(row.get('trade_type'), 'Buy'),
                                            safe_float(row.get('quantity')),
                                            safe_float(row.get('price')),
                                            safe_float(row.get('total_value')),
                                            safe_str(row.get('notes')),
                                            int(time.time())
                                        ))
                                        imported += 1
                                    except Exception as e:
                                        errors += 1
                                conn.commit()
                            
                            # STEP 7: Restore Portfolio Snapshots
                            if 'portfolio_snapshots' in preview_data:
                                progress.progress(92, text="📉 Restoring portfolio snapshots...")
                                uploaded_file.seek(0)  # Reset file pointer
                                df = pd.read_excel(uploaded_file, sheet_name='portfolio_snapshots')
                                snap_count = 0
                                for _, row in df.iterrows():
                                    try:
                                        snap_date = safe_date(row.get('snapshot_date'))
                                        # Check for existing (unique per user+date)
                                        existing = query_df("SELECT id FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?", (snap_date, user_id))
                                        if existing.empty:
                                            db_execute(cur, """
                                                INSERT INTO portfolio_snapshots 
                                                (user_id, snapshot_date, portfolio_value, daily_movement,
                                                 beginning_difference, deposit_cash, accumulated_cash,
                                                 net_gain, change_percent, roi_percent, created_at)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                            """, (
                                                user_id, snap_date,
                                                safe_float(row.get('portfolio_value')),
                                                safe_float(row.get('daily_movement')),
                                                safe_float(row.get('beginning_difference')),
                                                safe_float(row.get('deposit_cash')),
                                                safe_float(row.get('accumulated_cash')),
                                                safe_float(row.get('net_gain')),
                                                safe_float(row.get('change_percent')),
                                                safe_float(row.get('roi_percent')),
                                                int(time.time())
                                            ))
                                            imported += 1
                                            snap_count += 1
                                    except Exception as e:
                                        errors += 1
                                        error_details.append(f"Snapshot {snap_date}: {e}")
                                conn.commit()
                                error_details.append(f"Portfolio Snapshots: {snap_count} imported")
                            
                            progress.progress(100, text="✅ Complete!")
                            conn.close()
                            
                            # Show results with details
                            st.success(f"✅ **Restore completed! {imported:,} total records processed.**")
                            
                            # Show details breakdown
                            with st.expander("📋 View restore details", expanded=True):
                                for detail in error_details:
                                    if "imported" in detail or "new" in detail or "updated" in detail:
                                        st.info(detail)
                                    elif errors > 0:
                                        st.warning(detail)
                            
                            if errors > 0:
                                st.warning(f"⚠️ {errors:,} records skipped (likely duplicates or invalid data)")
                            
                            st.balloons()
                            time.sleep(2)
                            st.rerun()
                            
                        except Exception as e:
                            conn.rollback()
                            conn.close()
                            st.error(f"❌ Restore failed: {e}")
                with col2:
                    st.caption("Click the button to start restoring your backup data.")
                    
            except Exception as e:
                st.error(f"❌ Error reading file: {e}")
                st.info("Make sure you uploaded a valid Excel backup file exported from this app.")


# =========================
# UI - PORTFOLIO ANALYSIS
# =========================
def ui_portfolio_analysis():
    # Inject KPI Card CSS (once)
    def inject_kpi_css():
        st.markdown("""
        <style>
        .kpi-card {
            height: 120px;
            padding: 14px 16px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.3s ease;
        }
        .kpi-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(56, 189, 248, 0.15);
            border-color: rgba(59, 130, 246, 0.3);
        }
        .kpi-title {
            font-size: 0.75rem;
            opacity: 0.7;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .kpi-value {
            font-size: 1.45rem;
            font-weight: 700;
            line-height: 1.2;
        }
        .kpi-sub {
            font-size: 0.7rem;
            opacity: 0.65;
        }
        </style>
        """, unsafe_allow_html=True)
    
    inject_kpi_css()
    
    def kpi_card(title, value, subtext=None):
        """Render a professional KPI card with equal height."""
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-title">{title}</div>
            <div class="kpi-value">{value}</div>
            <div class="kpi-sub">{subtext if subtext else ""}</div>
        </div>
        """, unsafe_allow_html=True)
    
    # Determine colors based on user-selected theme
    if st.session_state.theme == "dark":
        bg_color = "#0f172a"
        text_color = "#f1f5f9"
        muted_color = "#94a3b8"
        card_bg = "rgba(30, 41, 59, 0.5)"
        card_border = "rgba(71, 85, 105, 0.5)"
        table_header_bg = "rgba(15, 23, 42, 0.8)"
        accent_color = "#3b82f6"
        success_color = "#10b981"
        warning_color = "#f59e0b"
        error_color = "#ef4444"
    else:  # Light mode
        bg_color = "#f8fafc"
        text_color = "#1e293b"
        muted_color = "#64748b"
        card_bg = "white"
        card_border = "rgba(203, 213, 225, 0.8)"
        table_header_bg = "rgba(241, 245, 249, 0.8)"
        accent_color = "#3b82f6"
        success_color = "#10b981"
        warning_color = "#f59e0b"
        error_color = "#ef4444"

    st.markdown(f"""
    <style>
    /* Base Theme */
    .stApp {{
        background: {bg_color};
        color: {text_color};
    }}
    /* Header - Theme Adaptive */
    .app-header {{
        padding: 1rem 0.5rem 0.75rem 0.5rem;
        border-bottom: 1px solid {card_border};
        margin-bottom: 1rem;
    }}
    .app-title {{
        font-size: 1.6rem;
        font-weight: 700;
        line-height: 1.2;
        color: {text_color};
    }}
    .app-subtitle {{
        font-size: 0.85rem;
        opacity: 0.7;
        margin-top: 0.2rem;
        color: {text_color};
    }}
    .app-status {{
        text-align: right;
        padding-top: 0.8rem;
        opacity: 0.6;
        font-size: 0.8rem;
        color: {text_color};
    }}
    /* Metric Cards - Consistent sizing */
    .stMetric {{
        background: {card_bg};
        border: 1px solid {card_border};
        border-radius: 12px;
        padding: 1.25rem !important;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
        min-height: 120px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }}
    .stMetric:hover {{
        transform: translateY(-5px);
        box-shadow: 0 8px 20px rgba(56, 189, 248, 0.2);
        border-color: {accent_color};
    }}
    .stMetric label {{
        color: {muted_color} !important;
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }}
    .stMetric [data-testid="stMetricValue"] {{
        color: {text_color} !important;
        font-size: 1.5rem !important;
        font-weight: 700;
        line-height: 1.2;
        margin: 0.5rem 0;
    }}
    .stMetric [data-testid="stMetricDelta"] {{
        font-weight: 600;
        font-size: 0.85rem;
        font-size: 0.8rem;
    }}
    /* Headers */
    h1, h2, h3 {{
        color: {text_color};
        font-weight: 700;
    }}
    /* Portfolio Section Cards */
    .portfolio-section {{
        background: {card_bg};
        border: 1px solid {card_border};
        border-radius: 16px;
        padding: 1.5rem;
        margin: 1.5rem 0;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
    }}
    .portfolio-section-header {{
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        border-bottom: 1px solid {card_border};
        margin: -1.5rem -1.5rem 1rem -1.5rem;
        background: {table_header_bg};
        border-radius: 16px 16px 0 0;
    }}
    .portfolio-section-header h3 {{
        margin: 0;
        font-size: 1.25rem;
        color: {text_color};
    }}
    /* DataFrames */
    .stDataFrame {{
        background: {card_bg} !important;
        border: 1px solid {card_border} !important;
        border-radius: 12px;
        overflow: hidden;
    }}
    .stDataFrame table {{
        background: transparent !important;
    }}
    .stDataFrame thead tr {{
        background: {table_header_bg} !important;
        color: {muted_color} !important;
    }}
    .stDataFrame thead th {{
        color: {muted_color} !important;
        font-weight: 600 !important;
        font-size: 0.875rem !important;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 1rem !important;
    }}
    .stDataFrame tbody tr {{
        border-top: 1px solid {card_border} !important;
        transition: background 0.2s ease;
    }}
    .stDataFrame tbody tr:hover {{
        background: rgba(71, 85, 105, 0.1) !important;
    }}
    .stDataFrame tbody td {{
        color: {text_color} !important;
        padding: 1rem !important;
    }}
    /* Buttons */
    .stButton button {{
        background: linear-gradient(135deg, {accent_color} 0%, #2563eb 100%);
        color: white;
        border: none;
        border-radius: 10px;
        font-weight: 600;
        padding: 0.65rem 1.5rem;
        transition: all 0.3s ease;
        box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);
    }}
    .stButton button:hover {{
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        box-shadow: 0 6px 15px rgba(59, 130, 246, 0.4);
        transform: translateY(-2px);
    }}
    .stButton button:active {{
        transform: translateY(0);
    }}
    /* Dividers */
    hr {{
        border: none;
        border-top: 1px solid {card_border};
        margin: 2rem 0;
    }}
    /* Caption text */
    .stCaption {{
        color: {muted_color} !important;
        font-size: 0.85rem;
    }}
    /* Success/Error/Info messages */
    .stSuccess {{
        background: rgba(16, 185, 129, 0.1) !important;
        border-left: 4px solid {success_color} !important;
        border-radius: 8px;
        color: {success_color} !important;
    }}
    .stError {{
        background: rgba(239, 68, 68, 0.1) !important;
        border-left: 4px solid {error_color} !important;
        border-radius: 8px;
        color: {error_color} !important;
    }}
    .stInfo {{
        background: rgba(59, 130, 246, 0.1) !important;
        border-left: 4px solid {accent_color} !important;
        border-radius: 8px;
        color: {accent_color} !important;
    }}
    .stWarning {{
        background: rgba(245, 158, 11, 0.1) !important;
        border-left: 4px solid {warning_color} !important;
        border-radius: 8px;
        color: {warning_color} !important;
    }}
    /* Progress bars */
    .stProgress > div > div {{
        background: linear-gradient(90deg, {accent_color}, #8b5cf6) !important;
    }}
    /* Tabs styling */
    .stTabs [data-baseweb="tab-list"] {{
        gap: 0.5rem;
        background: {card_bg};
        padding: 0.5rem;
        border-radius: 12px;
    }}
    .stTabs [data-baseweb="tab"] {{
        background: transparent;
        border-radius: 8px;
        color: {muted_color};
        font-weight: 500;
        padding: 0.75rem 1.5rem;
        transition: all 0.2s ease;
    }}
    .stTabs [data-baseweb="tab"]:hover {{
        background: rgba(71, 85, 105, 0.3);
        color: {text_color};
    }}
    .stTabs [aria-selected="true"] {{
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: {text_color} !important;
    }}
    /* Expander styling */
    .streamlit-expanderHeader {{
        background: {card_bg};
        border: 1px solid {card_border};
        border-radius: 8px;
        color: {text_color} !important;
        font-weight: 600;
    }}
    .streamlit-expanderHeader:hover {{
        background: rgba(71, 85, 105, 0.3);
    }}
    /* Footer */
    .portfolio-footer {{
        text-align: center;
        padding: 2rem 0;
        border-top: 1px solid {card_border};
        color: {muted_color};
        font-size: 0.875rem;
        margin-top: 3rem;
    }}
    </style>
    """, unsafe_allow_html=True)
    
    # Professional Header with Status
    col1, col2, col3 = st.columns([3, 1, 1])
    
    with col1:
        st.markdown("""
        <div class="app-header">
            <div class="app-title">KuwaitPortfolio.ai</div>
            <div class="app-subtitle">Advanced Portfolio Management System</div>
        </div>
        """, unsafe_allow_html=True)
    
    with col2:
        # datetime is already imported globally
        st.markdown(f"""
        <div class="app-status">
            ⏱ Last update<br>
            <strong>{datetime.now().strftime("%b %d, %H:%M")}</strong>
        </div>
        """, unsafe_allow_html=True)
    
    with col3:
        st.write("")  # Spacing for alignment
        if st.button("🔄 Fetch All Prices", key="fetch_all_portfolio", use_container_width=True):
            user_id = st.session_state.get('user_id')
            if not user_id:
                st.error("Please log in.")
            else:
                try:
                    # 1. Fetch Symbol AND Currency from DB
                    symbols_df = query_df("SELECT symbol, currency FROM stocks WHERE user_id = ?", (user_id,))
                except Exception:
                    symbols_df = pd.DataFrame()
                
                if symbols_df.empty:
                    st.info("No stocks found.")
                else:
                    # Map Yahoo Ticker -> {DB Symbol, DB Currency}
                    ticker_map = {}
                    
                    for _, row in symbols_df.iterrows():
                        db_sym = str(row['symbol']).strip().upper()
                        # Default to KWD if currency is missing/null
                        ccy = str(row.get('currency', 'KWD') or 'KWD').strip().upper()
                        
                        # Convert to yfinance ticker format
                        if db_sym.endswith('.KW'):
                            yf_sym = db_sym
                        elif ccy == 'KWD' and '.' not in db_sym:
                            # FORCE .KW suffix for KWD stocks
                            yf_sym = f"{db_sym}.KW"
                        else:
                            yf_sym = db_sym
                            
                        ticker_map[yf_sym] = {'symbol': db_sym, 'currency': ccy}

                    unique_yf_tickers = list(ticker_map.keys())
                    
                    if not YFINANCE_AVAILABLE:
                        st.error("yfinance not installed.")
                    else:
                        st.info(f"🚀 Batch fetching {len(unique_yf_tickers)} stocks...")
                        progress = st.progress(0)
                        
                        try:
                            import yfinance as yf
                            
                            # 2. Batch Download
                            batch_data = yf.download(
                                unique_yf_tickers, period="5d", group_by='ticker', threads=True, progress=False
                            )
                            
                            conn = get_conn()
                            cur = conn.cursor()
                            success_count = 0
                            success_details = []
                            failed_symbols = []
                            
                            # 3. Process & Update
                            for i, yf_tick in enumerate(unique_yf_tickers):
                                stock_info = ticker_map[yf_tick]
                                db_symbol = stock_info['symbol']
                                db_ccy = stock_info['currency']
                                price = None
                                
                                try:
                                    # Safe Data Access
                                    if len(unique_yf_tickers) == 1:
                                        # Single ticker - batch_data has different structure
                                        if 'Close' in batch_data.columns and not batch_data['Close'].empty:
                                            price = float(batch_data['Close'].dropna().iloc[-1])
                                    else:
                                        # Multiple tickers - access by ticker name
                                        if yf_tick in batch_data.columns.get_level_values(0):
                                            df_tick = batch_data[yf_tick]
                                            if 'Close' in df_tick.columns and not df_tick['Close'].dropna().empty:
                                                price = float(df_tick['Close'].dropna().iloc[-1])
                                    
                                    # Normalize Kuwait prices (Fils to KWD)
                                    if price and db_ccy == 'KWD':
                                        price = normalize_kwd_price(price, db_ccy)
                                            
                                    if price and price > 0:
                                        db_execute(cur, "UPDATE stocks SET current_price = ? WHERE symbol = ? AND user_id = ?", (price, db_symbol, user_id))
                                        success_count += 1
                                        success_details.append(f"{db_symbol} = {price:.3f} {db_ccy}")
                                    else:
                                        failed_symbols.append(db_symbol)
                                except Exception:
                                    failed_symbols.append(db_symbol)
                                progress.progress((i + 1) / len(unique_yf_tickers))

                            conn.commit()
                            conn.close()
                            progress.empty()
                            
                            st.success(f"✅ Updated {success_count} stocks.")
                            
                            if success_details:
                                with st.expander("✓ Successfully fetched prices"):
                                    for detail in success_details:
                                        st.text(detail)
                            
                            if failed_symbols:
                                with st.expander("⚠️ View skipped symbols"):
                                    st.write(", ".join(failed_symbols))
                            
                            time.sleep(1)
                            st.rerun()
                        except Exception as e:
                            progress.empty()
                            st.error(f"Batch fetch failed: {e}")

    st.divider()

    # ----------------------------------------------------
    # CASH MANAGEMENT (Inline Editor)
    # ----------------------------------------------------
    st.subheader("💵 Cash Management")
    st.caption("Manually update your available cash balance per portfolio. 'Total Capital' is calculated from deposits.")

    # 1. Fetch Summary Data
    cash_data = []
    _cash_portfolios = ["KFH", "BBYN", "USA"]
    
    _user_id = st.session_state.get('user_id')
    for p in _cash_portfolios:
        # A. Total Deposited (Read-only Reference)
        _total_dep = query_val("SELECT SUM(amount) FROM cash_deposits WHERE portfolio=? AND user_id=?", (p, _user_id)) 
        if _total_dep is None: _total_dep = 0.0
        
        # B. Manual Cash Balance (Source of Truth for Buying Power)
        _manual_bal_df = query_df("SELECT balance FROM portfolio_cash WHERE portfolio=? AND user_id=?", (p, _user_id))
        _manual_balance = float(_manual_bal_df.iloc[0]['balance']) if not _manual_bal_df.empty else 0.0
        
        _currency = PORTFOLIO_CCY.get(p, "KWD")
        
        cash_data.append({
            "Portfolio": p,
            "Currency": _currency,
            "Total Capital": float(_total_dep),
            "Available Cash": float(_manual_balance)
        })
        
    cash_df_display = pd.DataFrame(cash_data)
    
    # Render Editor
    _c1, _c2 = st.columns([3, 1])
    with _c1:
        edited_cash = st.data_editor(
            cash_df_display,
            column_config={
                "Portfolio": st.column_config.TextColumn("Portfolio", disabled=True),
                "Currency": st.column_config.TextColumn("CCY", disabled=True, width="small"),
                "Total Capital": st.column_config.NumberColumn(
                    "Total Capital (Deposited)",
                    disabled=True, 
                    format="%.3f",
                    help="Sum of all deposits in 'Cash/Deposits' table."
                ),
                "Available Cash": st.column_config.NumberColumn(
                    "Available Cash (Manual)",
                    min_value=0, step=100.0, format="%.3f",
                    help="Enter your actual current cash balance in the portfolio."
                )
            },
            hide_index=True,
            use_container_width=True,
            key="cash_editor_widget"
        )
        
    with _c2:
        # Mini Total
        _total_cash_kwd = 0.0
        _rate = st.session_state.get("usd_to_kwd", 0.307)
        for _, r in cash_df_display.iterrows():
            if r["Currency"] == "USD":
                _total_cash_kwd += r["Available Cash"] * _rate
            else:
                _total_cash_kwd += r["Available Cash"]
        st.metric("Total Free Cash", fmt_money(_total_cash_kwd, "KWD"))
    
    # Handle Edits
    if not cash_df_display.equals(edited_cash):
        _changes = False
        for _i, _row in edited_cash.iterrows():
            _old_val = cash_df_display.loc[_i, "Available Cash"]
            _new_val = _row["Available Cash"]
            
            # If value changed
            if abs(_new_val - _old_val) > 0.001:
                _p_name = _row["Portfolio"]
                _p_ccy = _row["Currency"]
                _ts = int(time.time())
                
                # Upsert into portfolio_cash
                exec_sql("""
                    INSERT INTO portfolio_cash (portfolio, user_id, balance, currency, last_updated)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(portfolio, user_id) DO UPDATE SET
                        balance=excluded.balance,
                        currency=excluded.currency,
                        last_updated=excluded.last_updated
                """, (_p_name, st.session_state.get('user_id'), _new_val, _p_ccy, _ts))
                _changes = True

        if _changes:
            st.toast("✅ Cash Balances Updated")
            time.sleep(1)
            st.rerun()

    st.divider()

    # Fetch USD/KWD rate automatically
    fx_usdkwd = fetch_usd_kwd_rate()

    kfh_df = build_portfolio_table("KFH")
    bbyn_df = build_portfolio_table("BBYN")
    usa_df = build_portfolio_table("USA")
    
    # Calculate Overall Portfolio Summary (All Portfolios Combined)
    st.markdown("## 📊 Overall Portfolio Summary (All Portfolios)")
    
    # Calculate totals in KWD (convert USD portfolios)
    overall_total_cost = 0.0
    overall_total_mv = 0.0
    overall_total_unreal = 0.0
    overall_total_cash_div = 0.0
    overall_total_pnl = 0.0
    
    for portfolio_name, df in [("KFH", kfh_df), ("BBYN", bbyn_df), ("USA", usa_df)]:
        if not df.empty:
            ccy = PORTFOLIO_CCY.get(portfolio_name, "KWD")
            
            # Sum portfolio values
            port_cost = float(df["Total Cost"].sum())
            port_mv = float(df["Market Value"].sum())
            port_unreal = float(df["Unrealized P/L"].sum())
            port_cash_div = float(df["Cash Dividends"].sum())
            port_pnl = float(df["Total PNL"].sum())
            
            # Convert to KWD for overall totals
            overall_total_cost += convert_to_kwd(port_cost, ccy)
            overall_total_mv += convert_to_kwd(port_mv, ccy)
            overall_total_unreal += convert_to_kwd(port_unreal, ccy)
            overall_total_cash_div += convert_to_kwd(port_cash_div, ccy)
            overall_total_pnl += convert_to_kwd(port_pnl, ccy)
    
    # --- Integration of Manual Cash for Totals ---
    _overall_cash_kwd = 0.0
    _user_id = st.session_state.get('user_id')
    _cash_recs = query_df("SELECT balance, currency FROM portfolio_cash WHERE user_id=?", (_user_id,))
    if not _cash_recs.empty:
        for _, _cr in _cash_recs.iterrows():
            _overall_cash_kwd += convert_to_kwd(_cr["balance"], _cr["currency"])
            
    overall_total_value = overall_total_mv + _overall_cash_kwd
    # ---------------------------------------------

    if overall_total_cost > 0:
        overall_total_pnl_pct = overall_total_pnl / overall_total_cost
        overall_dividend_yield = overall_total_cash_div / overall_total_cost
        
        # Calculate performance metrics (Equity Only)
        mv_change_pct = ((overall_total_mv - overall_total_cost) / overall_total_cost * 100)
        unreal_change_pct = (overall_total_unreal / overall_total_cost * 100)
        
        col1, col2, col3, col4, col5, col6 = st.columns(6)
        with col1:
            kpi_card("Total Cost", fmt_money(overall_total_cost, "KWD"))
        with col2:
            # Modified to show Total Value (Equity + Cash)
            kpi_card("Total Value", fmt_money(overall_total_value, "KWD"), f"Cash: {fmt_money(_overall_cash_kwd, 'KWD')}")
        with col3:
            kpi_card("Unrealized P/L", fmt_money(overall_total_unreal, "KWD"), f"▲ {unreal_change_pct:.2f}%")
        with col4:
            kpi_card("Cash Dividends", fmt_money(overall_total_cash_div, "KWD"))
        with col5:
            kpi_card("Total PNL", fmt_money(overall_total_pnl, "KWD"), f"▲ {overall_total_pnl_pct:.2%}")
        with col6:
            kpi_card("PNL %", pct(overall_total_pnl_pct))
        
        st.caption(f"💰 Dividend Yield on Cost (overall) = {pct(overall_dividend_yield)} | All values in KWD. USA portfolio converted at USD→KWD rate: {st.session_state.usd_to_kwd:.6f}")
    else:
        st.info("No portfolio data available yet.")
    
    st.divider()

    def get_theme_colors():
        """Return colors optimized for dark theme."""
        return {
            "bg": "rgba(0, 0, 0, 0)",  # Transparent
            "paper_bg": "rgba(30, 41, 59, 0.5)",
            "text": "#f1f5f9",
            "grid": "rgba(71, 85, 105, 0.3)",
            "accent": "#60a5fa",
        }

    def render_portfolio_section(title: str, df: pd.DataFrame, fx_usdkwd: Optional[float] = None, show_title: bool = True, portfolio_ccy: str = "KWD"):
        # Portfolio Section Container
        st.markdown('<div class="portfolio-section">', unsafe_allow_html=True)
        
        if show_title:
            # Determine emoji based on portfolio name
            emoji = "🏦"
            if "KFH" in title:
                emoji = "🇰🇼"
            elif "BBYN" in title:
                emoji = "💼"
            elif "USA" in title:
                emoji = "🇺🇸"
            
            st.markdown(f'''
            <div class="portfolio-section-header">
                <span style="font-size: 1.5rem;">{emoji}</span>
                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700;">{title}</h3>
            </div>
            ''', unsafe_allow_html=True)

        if df.empty:
            st.markdown('<div style="text-align: center; padding: 2rem; color: #94a3b8;">No stocks in this portfolio yet.</div>', unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
            return
        
        # Display Portfolio KPI Cards (in native currency)
        port_cost = float(df["Total Cost"].sum())
        port_mv = float(df["Market Value"].sum())
        port_unreal = float(df["Unrealized P/L"].sum())
        port_cash_div = float(df["Cash Dividends"].sum())
        port_pnl = float(df["Total PNL"].sum())
        port_pnl_pct = (port_pnl / port_cost) if port_cost > 0 else 0.0
        
        col1, col2, col3, col4, col5 = st.columns(5)
        with col1:
            kpi_card("Total Cost", fmt_money(port_cost, portfolio_ccy))
        with col2:
            kpi_card("Market Value", fmt_money(port_mv, portfolio_ccy))
        with col3:
            kpi_card("Unrealized P/L", fmt_money(port_unreal, portfolio_ccy))
        with col4:
            kpi_card("Cash Dividends", fmt_money(port_cash_div, portfolio_ccy))
        with col5:
            kpi_card("Total PNL", fmt_money(port_pnl, portfolio_ccy), f"{port_pnl_pct:.2%}")
        
        st.markdown("")  # Spacing

        # Ensure numeric columns exist and always show percentages (even if zero)
        view_df = df.copy()
        if "Weight by Cost" not in view_df.columns:
            view_df["Weight by Cost"] = 0.0
        if "PNL %" not in view_df.columns:
            view_df["PNL %"] = 0.0

        # Prepare clean chart dataframe
        chart_df = view_df[["Company", "Weight by Cost", "PNL %"]].copy()
        chart_df = chart_df.rename(columns={"Weight by Cost": "weight", "PNL %": "pnl"})
        chart_df["weight"] = chart_df["weight"].astype(float).fillna(0.0)
        chart_df["pnl"] = chart_df["pnl"].astype(float).fillna(0.0)
        
        # Filter out zero-weight entries
        chart_df = chart_df[chart_df["weight"] > 0]

        # Professional Donut Pie Chart with Callouts
        st.markdown("**Weight by Cost**")
        total_weight = float(chart_df["weight"].sum())
        if total_weight <= 0:
            st.info("No weight data to display (all weights are zero).")
        else:
            if go is not None:
                # Get theme colors from session state
                bg_color = "#ffffff" if st.session_state.theme == "light" else "#0e1117"
                text_color = "#1e293b" if st.session_state.theme == "light" else "#f1f5f9"
                grid_color = "#ddd" if st.session_state.theme == "light" else "#333"

                # Generate custom colors
                colors = px.colors.qualitative.Pastel if px else None
                if colors and len(colors) < len(chart_df):
                    colors = colors * (len(chart_df) // len(colors) + 1)

                # Create donut pie chart
                fig = go.Figure(data=[go.Pie(
                    labels=chart_df["Company"],
                    values=chart_df["weight"],
                    hole=0.4,
                    textinfo='percent',
                    textposition='outside',
                    insidetextorientation='radial',
                    textfont=dict(size=11, color=text_color),
                    marker=dict(
                        colors=colors,
                        line=dict(color=bg_color, width=2)
                    ),
                    pull=[0.05 if w == chart_df["weight"].max() else 0 for w in chart_df["weight"]],
                    rotation=0,
                    direction="clockwise",
                    sort=False,
                    hovertemplate=(
                        "<b>%{label}</b><br>" +
                        "Allocation: %{percent}<br>" +
                        "Weight: %{value:.3f}<extra></extra>"
                    ),
                )])

                fig.update_layout(
                    title=dict(text="Portfolio Allocation by Weight", x=0.5, font=dict(size=18, color=text_color)),
                    font=dict(color=text_color, size=12),
                    paper_bgcolor=bg_color,
                    plot_bgcolor=bg_color,
                    margin=dict(t=50, b=50, l=20, r=20),
                    showlegend=False,
                    height=400,
                    hoverlabel=dict(
                        bgcolor="white" if bg_color == "white" else "#1e293b",
                        font_size=13,
                        font_color=text_color,
                        bordercolor=grid_color,
                    ),
                    transition=dict(duration=300, easing='cubic-in-out'),
                )

                # Display chart and legend
                c_left, c_right = st.columns([2, 1])
                with c_left:
                    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
                with c_right:
                    legend_df = chart_df.copy()
                    legend_df["Weight (%)"] = (legend_df["weight"] * 100).round(1).astype(str) + "%"
                    st.markdown("**Allocation Breakdown**")
                    st.dataframe(
                        legend_df[["Company", "Weight (%)"]],
                        use_container_width=True,
                        hide_index=True,
                        column_config={
                            "Company": st.column_config.TextColumn("Company", width="medium"),
                            "Weight (%)": st.column_config.TextColumn("Weight", width="small"),
                        }
                    )
            else:
                st.warning("Plotly not available. Install with: pip install plotly")
                st.write(chart_df[["Company", "weight"]])

        st.divider()
        # PNL chart removed per user request — render the portfolio table below the pie
        render_portfolio_table(title, df, fx_usdkwd=fx_usdkwd)
        
        # Close portfolio section div
        st.markdown('</div>', unsafe_allow_html=True)

    render_portfolio_section("KFH Portfolio", kfh_df, portfolio_ccy="KWD")
    st.divider()
    render_portfolio_section("BBYN Portfolio", bbyn_df, portfolio_ccy="KWD")
    st.divider()
    
    # USA Portfolio with FX rate display
    st.markdown("### USA Portfolio")
    st.info(f"💱 USD → KWD conversion rate: **{st.session_state.usd_to_kwd:.6f}**")
    render_portfolio_section("USA Portfolio", usa_df, fx_usdkwd=fx_usdkwd, show_title=False, portfolio_ccy="USD")
    
    # Footer
    st.markdown("""
    <div class="portfolio-footer">
        KuwaitPortfolio.ai • Advanced Portfolio Management System • DB: portfolio.db • Last updated: Jan 2, 2026
    </div>
    """, unsafe_allow_html=True)


# =========================
# PLACEHOLDERS
# =========================
def ui_portfolio_tracker():
    st.subheader("Portfolio Tracker")
    
    # Get user_id for all queries
    user_id = st.session_state.get('user_id')
    
    # Debug: Check if Plotly is available
    if go is None:
        st.error("🚨 Critical: Plotly is not loaded! Charts will not display.")
        st.info("Try: `pip install plotly` in your terminal")
    
    # === ACTION BUTTONS ROW ===
    col_save, col_delete = st.columns([3, 1])
    
    with col_save:
        save_snapshot_btn = st.button("💾 Save Today's Snapshot (Live Data)", type="primary", use_container_width=True)
    
    with col_delete:
        if st.button("🗑️ Delete All", use_container_width=True):
            st.session_state.confirm_delete_snapshots = True
    
    # Confirmation dialog
    if st.session_state.get('confirm_delete_snapshots', False):
        st.error("⚠️ **WARNING: This will PERMANENTLY delete ALL your portfolio tracker data!**")
        col_yes, col_no = st.columns(2)
        with col_yes:
            if st.button("✅ Yes, Delete All", type="primary", use_container_width=True):
                try:
                    conn = get_conn()
                    cur = conn.cursor()
                    
                    # Delete ALL snapshots for this user (including user_id=1 default and NULL)
                    db_execute(cur, "DELETE FROM portfolio_snapshots WHERE user_id = ?", (user_id,))
                    deleted_count = cur.rowcount
                    
                    conn.commit()
                    
                    # VACUUM to reclaim space (SQLite only - hard removal from disk)
                    if not is_postgres():
                        cur.execute("VACUUM")
                    conn.close()
                    
                    st.session_state.confirm_delete_snapshots = False
                    st.success(f"✅ Deleted {deleted_count:,} snapshots.")
                    time.sleep(1)
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")
        with col_no:
            if st.button("❌ Cancel", use_container_width=True):
                st.session_state.confirm_delete_snapshots = False
                st.rerun()
    
    # === SAVE TODAY'S SNAPSHOT ===
    if save_snapshot_btn:
        with st.spinner("Calculating live portfolio value..."):
            # 1. Calculate LIVE portfolio value
            live_portfolio_value = 0.0
            for port_name in PORTFOLIO_CCY.keys():
                df_port = build_portfolio_table(port_name)
                if not df_port.empty:
                    for _, row in df_port.iterrows():
                        live_portfolio_value += convert_to_kwd(row['Market Value'], row['Currency'])
            
            # 2. Calculate Accumulated Cash (Total Deposits)
            all_deposits = query_df("SELECT amount, currency, include_in_analysis, deposit_date FROM cash_deposits WHERE user_id = ?", (user_id,))
            today_str = date.today().strftime("%Y-%m-%d")
            
            total_deposits_kwd = 0.0
            today_deposits_kwd = 0.0
            
            if not all_deposits.empty:
                # Convert all to KWD first
                all_deposits["amount_in_kwd"] = all_deposits.apply(
                    lambda row: convert_to_kwd(row["amount"], row.get("currency", "KWD")),
                    axis=1
                )
                # Filter for analysis
                analysis_deposits = all_deposits[all_deposits["include_in_analysis"] == 1]
                
                # Total accumulated up to today (inclusive)
                # Note: We assume all deposits in DB are valid. If we want strictly <= today:
                # analysis_deposits = analysis_deposits[analysis_deposits["deposit_date"] <= today_str]
                total_deposits_kwd = analysis_deposits["amount_in_kwd"].sum()
                
                # Deposits specifically for today
                today_deposits_kwd = analysis_deposits[analysis_deposits["deposit_date"] == today_str]["amount_in_kwd"].sum()
            
            # 3. Get Previous Snapshot for Deltas
            prev_snap = query_df(
                "SELECT * FROM portfolio_snapshots WHERE snapshot_date < ? AND user_id = ? ORDER BY snapshot_date DESC LIMIT 1",
                (today_str, user_id)
            )
            
            prev_value = 0.0
            prev_accumulated = 0.0
            
            if not prev_snap.empty:
                prev_value = float(prev_snap["portfolio_value"].iloc[0])
                prev_accumulated = float(prev_snap["accumulated_cash"].iloc[0]) if pd.notna(prev_snap["accumulated_cash"].iloc[0]) else 0.0
                prev_date = prev_snap["snapshot_date"].iloc[0]
            else:
                prev_date = "1970-01-01" # Start of time
            
            # Calculate accumulated cash incrementally to respect manual edits in history
            # Accumulated = Previous Accumulated + Deposits since previous snapshot (up to today)
            
            new_deposits_kwd = 0.0
            if not all_deposits.empty:
                # Filter deposits strictly > prev_date and <= today
                # Note: We use analysis_deposits which is already filtered by include_in_analysis=1
                new_deposits_df = analysis_deposits[
                    (analysis_deposits["deposit_date"] > prev_date) & 
                    (analysis_deposits["deposit_date"] <= today_str)
                ]
                new_deposits_kwd = new_deposits_df["amount_in_kwd"].sum()
            
            # Robust Logic: Always sum from the cash_deposits table
            # This ensures accuracy even if intermediate snapshots are deleted
            acc_cash_query = query_df(
                "SELECT SUM(amount) as total FROM cash_deposits WHERE user_id = ? AND deposit_date <= ? AND include_in_analysis = 1",
                (user_id, today_str)
            )
            acc_val = acc_cash_query.iloc[0]['total'] if not acc_cash_query.empty else None
            accumulated_cash = float(acc_val) if pd.notna(acc_val) else 0.0
            
            # 4. Calculate Metrics
            daily_movement = live_portfolio_value - prev_value if prev_value > 0 else 0.0
            # If we want daily movement to exclude today's deposit:
            # daily_movement = (live_portfolio_value - today_deposits_kwd) - prev_value
            
            # Calculate Beginning Diff: Current Value - First Value (Baseline)
            # Get the baseline value (value of the earliest snapshot)
            first_snap = query_df("SELECT portfolio_value, snapshot_date FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date ASC LIMIT 1", (user_id,))
            
            if first_snap.empty:
                # This is the first snapshot ever
                beginning_diff = 0.0
            else:
                first_date = first_snap["snapshot_date"].iloc[0]
                # If today is strictly after the first date, use first snapshot as baseline
                if today_str > first_date:
                    baseline_value = float(first_snap["portfolio_value"].iloc[0])
                    beginning_diff = live_portfolio_value - baseline_value
                # If today is the first date (or before), diff is 0
                else:
                    beginning_diff = 0.0
            
            # Net Gain = Beginning Diff - Accumulated Cash (Corrected Formula)
            net_gain = beginning_diff - accumulated_cash
            
            roi_percent = (net_gain / accumulated_cash * 100) if accumulated_cash > 0 else 0.0
            change_percent = ((live_portfolio_value - prev_value) / prev_value * 100) if prev_value > 0 else 0.0
            
            # 5. Insert or Update
            # Check if exists
            existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?", (today_str, user_id))
            
            if not existing.empty:
                exec_sql(
                    """
                    UPDATE portfolio_snapshots
                    SET portfolio_value = ?, daily_movement = ?, beginning_difference = ?,
                        deposit_cash = ?, accumulated_cash = ?, net_gain = ?, 
                        change_percent = ?, roi_percent = ?, created_at = ?
                    WHERE snapshot_date = ? AND user_id = ?
                    """,
                    (live_portfolio_value, daily_movement, beginning_diff,
                     today_deposits_kwd, accumulated_cash, net_gain,
                     change_percent, roi_percent, int(time.time()),
                     today_str, user_id)
                )
                st.success(f"✅ Updated snapshot for {today_str}")
            else:
                exec_sql(
                    """
                    INSERT INTO portfolio_snapshots 
                    (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                     deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, today_str, live_portfolio_value, daily_movement, beginning_diff,
                     today_deposits_kwd, accumulated_cash, net_gain, change_percent, roi_percent, int(time.time()))
                )
                st.success(f"✅ Saved new snapshot for {today_str}")
            
            time.sleep(1)
            st.rerun()

    # Excel upload and download
    col1, col2 = st.columns(2)
    with col1:
        # Download sample template
        if st.button("📥 Download Sample Excel Template"):
            sample_data = {
                "Date": ["2025-01-15", "2025-01-16", "2025-01-17"],
                "Value": [128022.00, 127410.00, 127693.00],
                "Daily Movement": [0, -613, 283],
                "Beginning Difference": [0, -613, -329],
                "Deposit Cash": [0, 0, 0],
            }
            sample_df = pd.DataFrame(sample_data)
            
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                sample_df.to_excel(writer, sheet_name='Portfolio Snapshots', index=False)
            
            st.download_button(
                label="Download Template",
                data=output.getvalue(),
                file_name="portfolio_tracker_template.xlsx",
                mime="application/vnd.openxmlsheet"
            )
    
    with col2:
        # Upload Excel file
        with st.expander("📤 Upload Portfolio Snapshots Excel", expanded=False):
            uploaded_file = st.file_uploader("Select Excel file", type=["xlsx", "xls"], key="upload_snapshots")
            if uploaded_file:
                try:
                    df = pd.read_excel(uploaded_file, sheet_name=0)
                    
                    # Normalize column names
                    df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]
                    
                    # Map columns
                    col_map = {
                        'date': 'snapshot_date',
                        'value': 'portfolio_value',
                        'daily_movement': 'daily_movement',
                        'beginning_difference': 'beginning_difference',
                        'deposit_cash': 'deposit_cash'
                    }
                    
                    df = df.rename(columns=col_map)
                    
                    # Validate required columns
                    required = ['snapshot_date', 'portfolio_value']
                    missing = [c for c in required if c not in df.columns]
                    if missing:
                        st.error(f"Missing required columns: {', '.join(missing)}")
                    else:
                        # Fill optional columns with defaults
                        if 'daily_movement' not in df.columns:
                            df['daily_movement'] = 0
                        if 'beginning_difference' not in df.columns:
                            df['beginning_difference'] = 0
                        if 'deposit_cash' not in df.columns:
                            df['deposit_cash'] = 0
                        
                        # Convert date column
                        df['snapshot_date'] = pd.to_datetime(df['snapshot_date']).dt.strftime('%Y-%m-%d')
                        
                        # Sort by date
                        df = df.sort_values('snapshot_date')
                        
                        # Get accumulated cash from the date BEFORE our import data
                        earliest_import_date = df['snapshot_date'].iloc[0]
                        before_import = query_df(
                            "SELECT accumulated_cash FROM portfolio_snapshots WHERE snapshot_date < ? AND user_id = ? ORDER BY snapshot_date DESC LIMIT 1",
                            (earliest_import_date, user_id)
                        )
                        if not before_import.empty:
                            val = before_import["accumulated_cash"].iloc[0]
                            accumulated_cash = float(val) if pd.notna(val) else None
                        else:
                            accumulated_cash = None
                        
                        prev_value = 0
                        
                        records_to_insert = []
                        duplicates = []
                        
                        for idx, row in df.iterrows():
                            snap_date = row['snapshot_date']
                            portfolio_value = float(row['portfolio_value'])
                            daily_movement = float(row.get('daily_movement', 0))
                            beginning_diff = float(row.get('beginning_difference', 0))
                            deposit_cash = float(row.get('deposit_cash', 0))
                            
                            # Check for duplicates
                            existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?", (snap_date, user_id))
                            if not existing.empty:
                                duplicates.append(snap_date)
                                continue
                            
                            # Calculate values
                            # Accumulated cash: add new deposit to previous (or start fresh if None)
                            if accumulated_cash is None:
                                # No previous accumulated value
                                if deposit_cash > 0:
                                    accumulated_cash = deposit_cash
                                # else: stays None
                            else:
                                # Has previous accumulated value
                                if deposit_cash > 0:
                                    # Add new deposit to previous accumulated
                                    accumulated_cash += deposit_cash
                                # else: carry forward previous value (no change to accumulated_cash)
                            
                            # Net gain from stocks = Beginning Difference - Accumulated Cash (Corrected Formula)
                            net_gain = beginning_diff - accumulated_cash if accumulated_cash else beginning_diff
                            # ROI % = Net Gain / Accumulated Cash
                            roi_percent = (net_gain / accumulated_cash * 100) if accumulated_cash and accumulated_cash > 0 else 0
                            # Change % = change from previous day
                            change_percent = ((portfolio_value - prev_value) / prev_value * 100) if prev_value > 0 else 0
                            
                            records_to_insert.append((
                                user_id, snap_date, portfolio_value, daily_movement, beginning_diff,
                                deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, int(time.time())
                            ))
                            
                            prev_value = portfolio_value
                        
                        # Insert records
                        if records_to_insert:
                            conn = get_conn()
                            cur = conn.cursor()
                            cur.executemany(
                                """
                                INSERT INTO portfolio_snapshots 
                                (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                records_to_insert
                            )
                            conn.commit()
                            conn.close()
                            
                            st.success(f"✅ Imported {len(records_to_insert):,} snapshots successfully!")
                            if duplicates:
                                st.warning(f"⚠️ Skipped {len(duplicates)} duplicate dates: {', '.join(duplicates[:5])}{'...' if len(duplicates) > 5 else ''}")
                            st.rerun()
                        else:
                            st.info("No new records to import (all duplicates).")
                            
                except Exception as e:
                    st.error(f"Error reading Excel file: {e}")
    
    st.divider()
    
    # Add manual snapshot
    with st.expander("➕ Add Manual Snapshot (Transaction)", expanded=False):
        st.caption("Manually add a historical portfolio snapshot. Metrics will be auto-calculated if left as 0.")
        col1, col2 = st.columns(2)
        with col1:
            snap_date = st.date_input("Date", value=date.today(), key="manual_snap_date")
            portfolio_value = st.number_input("Portfolio Value", min_value=0.0, step=0.001, format="%.3f", key="manual_snap_value")
            deposit_cash = st.number_input("Deposit Cash (if any)", min_value=0.0, step=0.001, format="%.3f", key="manual_snap_deposit")
        with col2:
            daily_movement = st.number_input("Daily Movement (Optional)", step=0.001, format="%.3f", key="manual_snap_movement")
            beginning_diff = st.number_input("Beginning Difference (Optional)", step=0.001, format="%.3f", key="manual_snap_diff")
        
        if st.button("Save Manual Snapshot"):
            snap_date_str = snap_date.strftime("%Y-%m-%d")
            
            # Check if snapshot already exists
            existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?", (snap_date_str, user_id))
            if not existing.empty:
                st.error(f"Snapshot for {snap_date_str} already exists. Please edit it in the table below instead.")
            else:
                # Get previous snapshot relative to this date
                prev_snap = query_df(
                    "SELECT * FROM portfolio_snapshots WHERE snapshot_date < ? AND user_id = ? ORDER BY snapshot_date DESC LIMIT 1",
                    (snap_date_str, user_id)
                )
                
                prev_value = 0.0
                prev_accumulated = 0.0
                
                if not prev_snap.empty:
                    prev_value = float(prev_snap["portfolio_value"].iloc[0])
                    prev_accumulated = float(prev_snap["accumulated_cash"].iloc[0]) if pd.notna(prev_snap["accumulated_cash"].iloc[0]) else 0.0
                
                # Calculate Accumulated Cash
                accumulated_cash = prev_accumulated + deposit_cash
                
                # Auto-calculate metrics if 0
                if daily_movement == 0:
                    daily_movement = portfolio_value - prev_value if prev_value > 0 else 0.0
                
                if beginning_diff == 0:
                    # Calculate Beginning Diff: Current Value - First Value (Baseline)
                    first_snap = query_df("SELECT portfolio_value, snapshot_date FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date ASC LIMIT 1", (user_id,))
                    if first_snap.empty:
                        beginning_diff = 0.0
                    else:
                        first_date = first_snap["snapshot_date"].iloc[0]
                        if snap_date_str > first_date:
                            baseline_value = float(first_snap["portfolio_value"].iloc[0])
                            beginning_diff = portfolio_value - baseline_value
                        else:
                            beginning_diff = 0.0
                
                net_gain = beginning_diff - accumulated_cash
                roi_percent = (net_gain / accumulated_cash * 100) if accumulated_cash > 0 else 0.0
                change_percent = ((portfolio_value - prev_value) / prev_value * 100) if prev_value > 0 else 0.0
                
                exec_sql(
                    """
                    INSERT INTO portfolio_snapshots 
                    (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                     deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, snap_date_str, portfolio_value, daily_movement, beginning_diff,
                     deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, int(time.time()))
                )
                st.success(f"✅ Saved snapshot for {snap_date_str}")
                time.sleep(1)
                st.rerun()
    
    st.divider()
    
    # Display snapshots
    snapshots = query_df(
        "SELECT * FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC",
        (user_id,)
    )
    
    if snapshots.empty:
        st.info("No portfolio snapshots yet. Add your first snapshot above.")
        return
    
    # === MODERN DASHBOARD ===
    
    # 1. Prepare Data
    df = snapshots.sort_values("snapshot_date").copy()
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"])
    
    # Calculate metrics for the cards
    if not df.empty:
        latest = df.iloc[-1]
        total_revenue = latest["portfolio_value"]
        
        # User request: Get Net Gain strictly from the "Net Gain" column of the latest snapshot
        # This ensures it matches exactly what is shown in the table below
        # DO NOT RECALCULATE. Source of truth is the database row.
        total_profit = latest["net_gain"] 
        
        profit_margin = latest["roi_percent"] if "roi_percent" in latest else 0.0
    else:
        total_revenue = 0
        total_profit = 0
        profit_margin = 0

    # 2. Define Theme Colors (Synced with Global Theme)
    is_dark = st.session_state.get("theme", "light") == "dark"
    
    theme = {
        "app_bg": "linear-gradient(to bottom right, #111827, #1f2937, #000000)" if is_dark else "linear-gradient(to bottom right, #f9fafb, #ffffff, #f3f4f6)",
        "text_main": "#ffffff" if is_dark else "#111827",
        "text_sub": "#9ca3af" if is_dark else "#4b5563",
        "card_bg": "rgba(31, 41, 55, 0.5)" if is_dark else "rgba(255, 255, 255, 0.8)",
        "card_border": "rgba(55, 65, 81, 0.5)" if is_dark else "rgba(229, 231, 235, 0.5)",
        "shadow": "0 25px 50px -12px rgba(0, 0, 0, 0.25)" if is_dark else "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
        
        # Chart Colors
        "rev_line": "#06b6d4" if is_dark else "#1D4ED8",
        "rev_glow": "rgba(6, 182, 212, 0.3)" if is_dark else "rgba(29, 78, 216, 0.25)",
        "prof_line": "#10b981" if is_dark else "#047857",
        "prof_glow": "rgba(16, 185, 129, 0.3)" if is_dark else "rgba(4, 120, 87, 0.25)",
        
        # Grid/Axes
        "grid": "rgba(125, 211, 252, 0.1)" if is_dark else "rgba(229, 231, 235, 0.5)",
        "tick_text": "rgba(209, 213, 219, 0.6)" if is_dark else "rgba(55, 65, 81, 0.7)",
        
        # Tooltip
        "tooltip_bg": "rgba(17, 24, 39, 0.9)" if is_dark else "rgba(255, 255, 255, 0.9)",
        "tooltip_text": "#22d3ee" if is_dark else "#2563eb",
        "tooltip_border": "rgba(6, 182, 212, 0.3)" if is_dark else "rgba(147, 197, 253, 0.3)",
        
        # Stats Cards Gradients
        "stat_rev_bg": "linear-gradient(to right, rgba(6, 182, 212, 0.1), rgba(8, 145, 178, 0.1))" if is_dark else "linear-gradient(to right, rgba(239, 246, 255, 0.5), rgba(219, 234, 254, 0.5))",
        "stat_rev_border": "rgba(6, 182, 212, 0.2)" if is_dark else "rgba(191, 219, 254, 0.5)",
        "stat_rev_text": "#67e8f9" if is_dark else "#1d4ed8",
        
        "stat_prof_bg": "linear-gradient(to right, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))" if is_dark else "linear-gradient(to right, rgba(240, 253, 244, 0.5), rgba(220, 252, 231, 0.5))",
        "stat_prof_border": "rgba(16, 185, 129, 0.2)" if is_dark else "rgba(187, 247, 208, 0.5)",
        "stat_prof_text": "#6ee7b7" if is_dark else "#15803d",
        
        "stat_marg_bg": "linear-gradient(to right, rgba(168, 85, 247, 0.1), rgba(147, 51, 234, 0.1))" if is_dark else "linear-gradient(to right, rgba(250, 245, 255, 0.5), rgba(243, 232, 255, 0.5))",
        "stat_marg_border": "rgba(168, 85, 247, 0.2)" if is_dark else "rgba(233, 213, 255, 0.5)",
        "stat_marg_text": "#d8b4fe" if is_dark else "#7e22ce",
    }

    # 3. CSS Styling (Dynamic)
    st.markdown(f"""
    <style>
        /* Main Container Background */
        .stApp {{
            background: {theme['app_bg']};
            color: {theme['text_main']};
        }}
        
        /* Header Text Gradient */
        .header-gradient {{
            background: linear-gradient(to right, #22d3ee, #60a5fa, #34d399);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 800;
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }}
        
        /* Card Styles */
        .dashboard-card {{
            background-color: {theme['card_bg']};
            backdrop-filter: blur(8px);
            border: 1px solid {theme['card_border']};
            border-radius: 1rem;
            padding: 2rem;
            box-shadow: {theme['shadow']};
            margin-bottom: 2rem;
        }}
        
        /* Stat Cards */
        .stat-card {{
            border-radius: 0.75rem;
            padding: 1.5rem;
            height: 100%;
            transition: all 0.3s ease;
        }}
        
        .stat-card-cyan {{
            background: {theme['stat_rev_bg']};
            border: 1px solid {theme['stat_rev_border']};
        }}
        .stat-card-cyan h3 {{ color: {theme['stat_rev_text']}; }}
        
        .stat-card-emerald {{
            background: {theme['stat_prof_bg']};
            border: 1px solid {theme['stat_prof_border']};
        }}
        .stat-card-emerald h3 {{ color: {theme['stat_prof_text']}; }}
        
        .stat-card-purple {{
            background: {theme['stat_marg_bg']};
            border: 1px solid {theme['stat_marg_border']};
        }}
        .stat-card-purple h3 {{ color: {theme['stat_marg_text']}; }}
        
        /* Legend Dots */
        .legend-dot {{
            width: 0.75rem;
            height: 0.75rem;
            border-radius: 9999px;
            margin-right: 0.5rem;
            display: inline-block;
        }}
        
        .glow-cyan {{ box-shadow: 0 0 15px {theme['rev_glow']}; background-color: {theme['rev_line']}; }}
        .glow-emerald {{ box-shadow: 0 0 15px {theme['prof_glow']}; background-color: {theme['prof_line']}; }}
        
    </style>
    """, unsafe_allow_html=True)

    # 4. Header Section
    st.markdown('<div style="text-align: center; margin-bottom: 3rem;">', unsafe_allow_html=True)
    st.markdown('<h1 class="header-gradient">Financial Performance Dashboard</h1>', unsafe_allow_html=True)
    st.markdown(f'<p style="color: {theme["text_sub"]}; font-size: 1.125rem;">Real-time insights into your financial metrics</p>', unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)

    # 5. Main Chart Cards (Separated)
    
    if go:
        # === CHART 1: REVENUE (Portfolio Value) ===
        st.markdown('<div class="dashboard-card">', unsafe_allow_html=True)
        
        # Header
        col_rev_title, col_rev_legend = st.columns([3, 1])
        with col_rev_title:
            st.markdown(f'<h2 style="color: {theme["text_main"]}; font-weight: 700; font-size: 1.5rem; margin-bottom: 0.5rem;">Total Portfolio Value Over Time</h2>', unsafe_allow_html=True)
            st.markdown(f'<p style="color: {theme["text_sub"]}; font-size: 0.875rem;">Historical Performance</p>', unsafe_allow_html=True)
        with col_rev_legend:
            st.markdown(f"""
            <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                <div style="display: flex; align-items: center;">
                    <div class="legend-dot glow-cyan"></div>
                    <span style="color: {theme["text_sub"]}; font-size: 0.875rem;">Revenue</span>
                </div>
            </div>
            """, unsafe_allow_html=True)

        # Chart
        fig_rev = go.Figure()
        fig_rev.add_trace(go.Scatter(
            x=df["snapshot_date"],
            y=df["portfolio_value"],
            mode='lines+markers',
            name='Revenue',
            line=dict(color=theme['rev_line'], width=3, shape='spline'),
            marker=dict(size=6, color='#022c22' if is_dark else '#ffffff', line=dict(color=theme['rev_line'], width=2)),
            hovertemplate='<b>Revenue</b>: %{y:,.0f} KWD<extra></extra>'
        ))
        
        fig_rev.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            margin=dict(l=0, r=0, t=20, b=0),
            height=350,
            showlegend=False,
            hovermode="x unified",
            xaxis=dict(showgrid=True, gridcolor=theme['grid'], gridwidth=1, showline=False, tickfont=dict(color=theme['tick_text'], size=12)),
            yaxis=dict(showgrid=True, gridcolor=theme['grid'], gridwidth=1, showline=False, tickfont=dict(color=theme['tick_text'], size=12), tickformat=",.0f"),
            hoverlabel=dict(bgcolor=theme['tooltip_bg'], bordercolor=theme['tooltip_border'], font=dict(color=theme['tooltip_text'], family="Inter, sans-serif"))
        )
        st.plotly_chart(fig_rev, use_container_width=True, config={'displayModeBar': False})
        st.markdown('</div>', unsafe_allow_html=True)


        # === CHART 2: PROFIT (Net Gain) ===
        st.markdown('<div class="dashboard-card">', unsafe_allow_html=True)
        
        # Header
        col_prof_title, col_prof_legend = st.columns([3, 1])
        with col_prof_title:
            st.markdown(f'<h2 style="color: {theme["text_main"]}; font-weight: 700; font-size: 1.5rem; margin-bottom: 0.5rem;">Net Gain from Stocks Over Time</h2>', unsafe_allow_html=True)
            st.markdown(f'<p style="color: {theme["text_sub"]}; font-size: 0.875rem;">Historical Performance</p>', unsafe_allow_html=True)
        with col_prof_legend:
            st.markdown(f"""
            <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                <div style="display: flex; align-items: center;">
                    <div class="legend-dot glow-emerald"></div>
                    <span style="color: {theme["text_sub"]}; font-size: 0.875rem;">Profit</span>
                </div>
            </div>
            """, unsafe_allow_html=True)

        # Chart
        fig_prof = go.Figure()
        fig_prof.add_trace(go.Scatter(
            x=df["snapshot_date"],
            y=df["net_gain"],
            mode='lines+markers',
            name='Profit',
            line=dict(color=theme['prof_line'], width=3, shape='spline'),
            marker=dict(size=6, color='#022c22' if is_dark else '#ffffff', line=dict(color=theme['prof_line'], width=2)),
            hovertemplate='<b>Profit</b>: %{y:,.0f} KWD<extra></extra>'
        ))
        
        fig_prof.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            margin=dict(l=0, r=0, t=20, b=0),
            height=350,
            showlegend=False,
            hovermode="x unified",
            xaxis=dict(showgrid=True, gridcolor=theme['grid'], gridwidth=1, showline=False, tickfont=dict(color=theme['tick_text'], size=12)),
            yaxis=dict(showgrid=True, gridcolor=theme['grid'], gridwidth=1, showline=False, tickfont=dict(color=theme['tick_text'], size=12), tickformat=",.0f"),
            hoverlabel=dict(bgcolor=theme['tooltip_bg'], bordercolor=theme['prof_line'], font=dict(color=theme['prof_line'], family="Inter, sans-serif"))
        )
        st.plotly_chart(fig_prof, use_container_width=True, config={'displayModeBar': False})
        st.markdown('</div>', unsafe_allow_html=True)

        # 6. Stats Summary Cards (New)
        col_stat1, col_stat2, col_stat3 = st.columns(3)
        
        with col_stat1:
            st.markdown(f"""
            <div class="stat-card stat-card-cyan">
                <h3 style="font-weight: 600; margin-bottom: 0.5rem;">Total Portfolio Value</h3>
                <p style="font-size: 1.5rem; font-weight: 700; color: {theme['text_main']};">{total_revenue:,.0f} KWD</p>
                <p style="font-size: 0.875rem; color: {theme['stat_rev_text']}; display: flex; align-items: center;">
                    <span style="margin-right: 0.25rem;">↑</span> Current Value
                </p>
            </div>
            """, unsafe_allow_html=True)
            
        with col_stat2:
            st.markdown(f"""
            <div class="stat-card stat-card-emerald">
                <h3 style="font-weight: 600; margin-bottom: 0.5rem;">Net Gain From Stocks</h3>
                <p style="font-size: 1.5rem; font-weight: 700; color: {theme['text_main']};">{total_profit:,.0f} KWD</p>
                <p style="font-size: 0.875rem; color: {theme['stat_prof_text']}; display: flex; align-items: center;">
                    <span style="margin-right: 0.25rem;">↑</span> Net Gain
                </p>
            </div>
            """, unsafe_allow_html=True)
            
        with col_stat3:
            st.markdown(f"""
            <div class="stat-card stat-card-purple">
                <h3 style="font-weight: 600; margin-bottom: 0.5rem;">Profit Margin</h3>
                <p style="font-size: 1.5rem; font-weight: 700; color: {theme['text_main']};">{profit_margin:.1f}%</p>
                <p style="font-size: 0.875rem; color: {theme['stat_marg_text']}; display: flex; align-items: center;">
                    <span style="margin-right: 0.25rem;">↑</span> ROI
                </p>
            </div>
            """, unsafe_allow_html=True)
        
        st.markdown('<div style="text-align: center; margin-top: 3rem; margin-bottom: 2rem;">', unsafe_allow_html=True)
        st.markdown(f'<p style="color: {theme["text_sub"]}; font-size: 0.875rem;">Data refreshed • Last updated: {pd.Timestamp.now().strftime("%B %d, %Y")}</p>', unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)
    
    # Footer
    st.divider()
    
    # Format and display table
    st.markdown("### 📊 Portfolio Snapshots (Editable)")
    st.caption("Double-click any cell to edit. Click 'Save Changes' to update the database and graphs.")
    
    # Prepare dataframe for editor (raw values)
    edit_df = snapshots.copy()
    # Ensure date is string for consistency or date object
    # st.data_editor handles date columns well if they are datetime objects
    edit_df["snapshot_date"] = pd.to_datetime(edit_df["snapshot_date"]).dt.date
    
    # Columns to edit
    cols_config = {
        "snapshot_date": st.column_config.DateColumn("Date", format="YYYY-MM-DD", required=True),
        "portfolio_value": st.column_config.NumberColumn("Value", format="%.3f", required=True),
        "daily_movement": st.column_config.NumberColumn("Daily Movement", format="%.3f"),
        "beginning_difference": st.column_config.NumberColumn("Beginning Diff", format="%.3f"),
        "deposit_cash": st.column_config.NumberColumn("Deposit Cash", format="%.3f"),
        "accumulated_cash": st.column_config.NumberColumn("Accumulated Cash", format="%.3f"),
        "net_gain": st.column_config.NumberColumn("Net Gain", format="%.3f"),
        "change_percent": st.column_config.NumberColumn("Change %", format="%.2f%%"),
        "roi_percent": st.column_config.NumberColumn("ROI %", format="%.2f%%"),
        "created_at": st.column_config.NumberColumn("Created At", disabled=True)
    }
    
    # Show editor
    edited_data = st.data_editor(
        edit_df,
        column_config=cols_config,
        use_container_width=True,
        num_rows="dynamic", # Allow adding/deleting rows
        key="snapshot_editor",
        hide_index=True,
        column_order=[
            "snapshot_date", "portfolio_value", "daily_movement", "beginning_difference",
            "deposit_cash", "accumulated_cash", "net_gain", "change_percent", "roi_percent"
        ]
    )
    
    if st.button("💾 Save Changes", type="primary"):
        try:
            # 1. Delete all existing snapshots for this user
            conn = get_conn()
            cur = conn.cursor()
            db_execute(cur, "DELETE FROM portfolio_snapshots WHERE user_id = ?", (user_id,))
            
            # 2. Insert all rows from edited_data
            records = []
            for _, row in edited_data.iterrows():
                # Convert date back to string YYYY-MM-DD
                s_date = row["snapshot_date"].strftime("%Y-%m-%d") if isinstance(row["snapshot_date"], date) else str(row["snapshot_date"])
                
                records.append((
                    user_id,
                    s_date,
                    float(row["portfolio_value"]),
                    float(row["daily_movement"]),
                    float(row["beginning_difference"]),
                    float(row["deposit_cash"]),
                    float(row["accumulated_cash"]),
                    float(row["net_gain"]),
                    float(row["change_percent"]),
                    float(row["roi_percent"]),
                    int(time.time()) # Update created_at or keep original? Let's update to show it was modified
                ))
            
            cur.executemany(
                """
                INSERT INTO portfolio_snapshots 
                (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                records
            )
            conn.commit()
            conn.close()
            
            st.success("✅ Changes saved successfully!")
            time.sleep(1)
            st.rerun()
            
        except Exception as e:
            st.error(f"Error saving changes: {e}")

    # Delete snapshot (Legacy - can be removed since editor handles deletes, but keeping for safety)
    with st.expander("🗑️ Delete Snapshot (Alternative Method)"):
        del_date = st.date_input("Select date to delete", value=date.today(), key="del_snap_date")
        if st.button("Delete Snapshot", key="del_snap"):
            del_date_str = del_date.strftime("%Y-%m-%d")
            user_id = st.session_state.get('user_id', 1)
            exec_sql("DELETE FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?", (del_date_str, user_id))
            st.success(f"Deleted snapshot for {del_date_str} (if it existed).")
            st.rerun()


def ui_dividends_tracker():
    st.subheader("💰 Dividends Tracker")
    
    # Query all dividend data - include ALL rows to check what's available
    user_id = st.session_state.get('user_id', 1)
    all_transactions = query_df("""
        SELECT 
            stock_symbol,
            txn_date,
            txn_type,
            COALESCE(cash_dividend, 0) as cash_dividend,
            COALESCE(bonus_shares, 0) as bonus_shares,
            COALESCE(reinvested_dividend, 0) as reinvested_dividend
        FROM transactions
        WHERE user_id = ?
        ORDER BY txn_date DESC
        LIMIT 10
    """, (user_id,))
    
    # Debug: Show sample data
    with st.expander("🔍 Debug: Sample Transaction Data", expanded=False):
        st.write("**Last 10 transactions (all fields):**")
        st.dataframe(all_transactions)
        st.write("**Column names available:**", list(all_transactions.columns) if not all_transactions.empty else "No data")
    
    # Query dividend data
    dividends_df = query_df("""
        SELECT 
            stock_symbol,
            txn_date,
            COALESCE(cash_dividend, 0) as cash_dividend,
            COALESCE(bonus_shares, 0) as bonus_shares,
            COALESCE(reinvested_dividend, 0) as reinvested_dividend
        FROM transactions
        WHERE COALESCE(cash_dividend, 0) > 0 
           OR COALESCE(bonus_shares, 0) > 0
           OR COALESCE(reinvested_dividend, 0) > 0
        ORDER BY stock_symbol, txn_date
    """)
    
    if dividends_df.empty:
        st.info("📊 No dividend data yet. Add transactions with cash dividends or bonus shares.")
        
        # Show count of transactions with reinvested dividends
        reinvested_count = query_df("""
            SELECT COUNT(*) as count 
            FROM transactions 
            WHERE COALESCE(reinvested_dividend, 0) > 0
        """)
        if not reinvested_count.empty:
            count = reinvested_count['count'].iloc[0]
            st.warning(f"⚠️ Found {count} transactions with reinvested_dividend > 0, but query returned empty. Check data.")
        return
    
    # Get cost basis for yield calculation
    cost_df = query_df("""
        SELECT 
            stock_symbol,
            SUM(CASE WHEN txn_type = 'Buy' THEN purchase_cost ELSE 0 END) as total_cost
        FROM transactions
        GROUP BY stock_symbol
    """)
    
    # Summary Cards
    total_cash_div = dividends_df['cash_dividend'].sum()
    total_bonus_shares = dividends_df['bonus_shares'].sum()
    total_reinvested = dividends_df['reinvested_dividend'].sum()
    unique_stocks = dividends_df['stock_symbol'].nunique()
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("💵 Total Cash Dividends", fmt_money(total_cash_div, "KWD"))
    with col2:
        st.metric("🎁 Total Bonus Shares", f"{total_bonus_shares:,.0f}")
    with col3:
        st.metric("🔄 Total Reinvested", fmt_money(total_reinvested, "KWD"))
    with col4:
        st.metric("📊 Dividend-Paying Stocks", f"{unique_stocks:,}")
    
    st.divider()
    
    # Tabs for different views
    tab1, tab2, tab3 = st.tabs(["📋 All Dividends", "📊 Summary by Stock", "🎁 Bonus Shares"])
    
    with tab1:
        st.subheader("All Dividend Transactions")
        
        # Display all dividends with date
        display_df = dividends_df.copy()
        display_df['Date'] = pd.to_datetime(display_df['txn_date']).dt.strftime('%Y-%m-%d')
        display_df = display_df.rename(columns={
            'stock_symbol': 'Stock',
            'cash_dividend': 'Cash Dividend (KWD)',
            'bonus_shares': 'Bonus Shares',
            'reinvested_dividend': 'Reinvested (KWD)'
        })
        
        display_df = display_df[['Stock', 'Date', 'Cash Dividend (KWD)', 'Bonus Shares', 'Reinvested (KWD)']]
        
        # Format numbers
        display_df['Cash Dividend (KWD)'] = display_df['Cash Dividend (KWD)'].apply(lambda x: fmt_money_plain(x, 3))
        display_df['Bonus Shares'] = display_df['Bonus Shares'].apply(lambda x: f"{x:,.0f}" if x > 0 else "-")
        display_df['Reinvested (KWD)'] = display_df['Reinvested (KWD)'].apply(lambda x: fmt_money_plain(x, 3) if x > 0 else "-")
        
        st.dataframe(display_df, use_container_width=True, hide_index=True)
        
        # Download button
        csv = display_df.to_csv(index=False)
        st.download_button(
            label="📥 Download as CSV",
            data=csv,
            file_name=f"all_dividends_{date.today()}.csv",
            mime="text/csv"
        )
    
    with tab2:
        st.subheader("Summary by Stock")
        
        # Group by stock
        summary = dividends_df.groupby('stock_symbol').agg({
            'cash_dividend': 'sum',
            'bonus_shares': 'sum',
            'reinvested_dividend': 'sum',
            'txn_date': 'count'
        }).reset_index()
        
        summary.columns = ['Stock', 'Total Cash Dividend', 'Total Bonus Shares', 'Total Reinvested', 'Dividend Count']
        
        # Merge with cost for yield calculation
        summary = summary.merge(cost_df, left_on='Stock', right_on='stock_symbol', how='left')
        summary['total_cost'] = summary['total_cost'].fillna(0)
        
        # Calculate yield on cost
        summary['Yield on Cost %'] = summary.apply(
            lambda row: (row['Total Cash Dividend'] / row['total_cost'] * 100) if row['total_cost'] > 0 else 0,
            axis=1
        )
        
        # Total dividends (cash + reinvested)
        summary['Total Dividends'] = summary['Total Cash Dividend'] + summary['Total Reinvested']
        
        # Format for display
        summary_display = summary[['Stock', 'Total Cash Dividend', 'Total Bonus Shares', 
                                   'Total Reinvested', 'Total Dividends', 'Dividend Count', 
                                   'Yield on Cost %']].copy()
        
        # Format the display columns
        summary_display['Total Cash Dividend'] = summary_display['Total Cash Dividend'].apply(lambda x: f"{x:,.3f} KWD")
        summary_display['Total Bonus Shares'] = summary_display['Total Bonus Shares'].apply(lambda x: f"{x:,.0f}")
        summary_display['Total Reinvested'] = summary_display['Total Reinvested'].apply(lambda x: f"{x:,.3f} KWD")
        summary_display['Total Dividends'] = summary_display['Total Dividends'].apply(lambda x: f"{x:,.3f} KWD")
        summary_display['Dividend Count'] = summary_display['Dividend Count'].apply(lambda x: f"{x:,.0f}")
        summary_display['Yield on Cost %'] = summary_display['Yield on Cost %'].apply(lambda x: f"{x:.2f}%")
        
        st.dataframe(
            summary_display,
            use_container_width=True,
            hide_index=True
        )
        
        # Download button
        csv = summary_display.to_csv(index=False)
        st.download_button(
            label="📥 Download Summary as CSV",
            data=csv,
            file_name=f"dividend_summary_{date.today()}.csv",
            mime="text/csv"
        )
    
    with tab3:
        st.subheader("Bonus Shares History")
        
        # Filter only bonus shares
        bonus_df = dividends_df[dividends_df['bonus_shares'] > 0].copy()
        
        if bonus_df.empty:
            st.info("📊 No bonus shares received yet.")
        else:
            bonus_df['Date'] = pd.to_datetime(bonus_df['txn_date']).dt.strftime('%Y-%m-%d')
            bonus_display = bonus_df[['stock_symbol', 'Date', 'bonus_shares']].rename(columns={
                'stock_symbol': 'Stock',
                'bonus_shares': 'Bonus Shares Received'
            })
            
            bonus_display['Bonus Shares Received'] = bonus_display['Bonus Shares Received'].apply(lambda x: f"{x:,.0f}")
            
            st.dataframe(bonus_display, use_container_width=True, hide_index=True)
            
            # Summary by stock
            st.subheader("Total Bonus Shares by Stock")
            bonus_summary = bonus_df.groupby('stock_symbol')['bonus_shares'].sum().reset_index()
            bonus_summary.columns = ['Stock', 'Total Bonus Shares']
            bonus_summary['Total Bonus Shares'] = bonus_summary['Total Bonus Shares'].apply(lambda x: f"{x:,.0f}")
            
            st.dataframe(bonus_summary, use_container_width=True, hide_index=True)
            
            # Download button
            csv = bonus_display.to_csv(index=False)
            st.download_button(
                label="📥 Download Bonus Shares as CSV",
                data=csv,
                file_name=f"bonus_shares_{date.today()}.csv",
                mime="text/csv"
            )


def ui_trading_section():
    """Trading Section - Short-term trades with date filtering"""
    st.subheader("📈 Trading Section - Short Term Trades")
    
    # Single Trade Entry
    with st.expander("➕ Add Single Trade", expanded=False):
        is_closed = st.checkbox("This is a closed trade (Buy + Sell)", value=False)
        
        with st.form("add_single_trade_form"):
            col1, col2 = st.columns(2)
            with col1:
                stock_symbol = st.text_input("Stock Symbol").strip().upper()
                quantity = st.number_input("Quantity", min_value=0.0, step=1.0, format="%.0f")
            with col2:
                purchase_date = st.date_input("Purchase Date", value=date.today())
                purchase_price = st.number_input("Purchase Price (per share)", min_value=0.0, step=0.001, format="%.3f")
            
            sale_date = None
            sale_price = 0.0
            cash_div = 0.0
            bonus_shares = 0.0
            
            if is_closed:
                st.divider()
                st.markdown("**Sale Details**")
                col3, col4 = st.columns(2)
                with col3:
                    sale_date = st.date_input("Sale Date", value=date.today())
                    sale_price = st.number_input("Sale Price (per share)", min_value=0.0, step=0.001, format="%.3f")
                with col4:
                    cash_div = st.number_input("Cash Dividend", min_value=0.0, step=0.001, format="%.3f")
                    bonus_shares = st.number_input("Bonus Shares", min_value=0.0, step=1.0, format="%.0f")
            
            submitted = st.form_submit_button("💾 Save Trade")
            
            if submitted:
                if not stock_symbol:
                    st.error("Stock Symbol is required")
                elif quantity <= 0:
                    st.error("Quantity must be greater than 0")
                elif purchase_price <= 0:
                    st.error("Purchase Price must be greater than 0")
                elif is_closed and sale_price <= 0:
                    st.error("Sale Price must be greater than 0 for closed trades")
                else:
                    try:
                        conn = get_conn()
                        cur = conn.cursor()
                        
                        # Check/Add Stock
                        user_id = st.session_state.get('user_id', 1)
                        db_execute(cur, "SELECT id FROM stocks WHERE symbol = ? AND user_id = ?", (stock_symbol, user_id))
                        if not cur.fetchone():
                            db_execute(cur,
                                "INSERT INTO stocks (symbol, name, portfolio, currency, user_id) VALUES (?, ?, ?, ?, ?)",
                                (stock_symbol, stock_symbol, "KFH", "KWD", user_id)
                            )
                        
                        # Calculate totals
                        total_purchase_cost = purchase_price * quantity
                        total_sell_value = sale_price * quantity if is_closed else 0
                        
                        # Insert Buy
                        db_execute(cur, """
                            INSERT INTO trading_history 
                            (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                             cash_dividend, bonus_shares, created_at, user_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (stock_symbol, purchase_date.strftime("%Y-%m-%d"), 'Buy', total_purchase_cost, 0, quantity, 0, 0, int(time.time()), user_id))
                        
                        # Insert Sell if applicable
                        if is_closed:
                            db_execute(cur, """
                                INSERT INTO trading_history 
                                (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                 cash_dividend, bonus_shares, created_at, user_id)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (stock_symbol, sale_date.strftime("%Y-%m-%d"), 'Sell', 0, total_sell_value, quantity, cash_div, bonus_shares, int(time.time()), user_id))
                            st.success(f"✅ Added closed trade for {stock_symbol} (Buy + Sell)")
                        else:
                            st.success(f"✅ Added open position for {stock_symbol} (Buy only)")
                        
                        conn.commit()
                        conn.close()
                        time.sleep(1)
                        st.rerun()
                        
                    except Exception as e:
                        st.error(f"Error saving trade: {e}")
    
    # Excel Upload Section
    with st.expander("📥 Upload Trading Data (Excel)", expanded=False):
        st.markdown("""
        **Upload Format:** Excel file with columns:
        - `Purchase date` (dd-MMM-yy, e.g., 3-Mar-25)
        - `Stock` (stock symbol)
        - `Quantity` (number of shares)
        - `Price cost` (price per share for purchase)
        - `Sale Date` (dd-MMM-yy)
        - `Sale price` (price per share for sale)
        - `cash Div` (optional, dividends)
        - `Bonus shares` (optional)
        
        **Note:** Duplicates are automatically rejected (same stock, date, quantity, and cost).
        """)
        
        # Remove Duplicates Button
        col_dup1, col_dup2 = st.columns([1, 3])
        with col_dup1:
            if st.button("🧹 Remove Existing Duplicates", help="Removes duplicate transactions from Trading History"):
                try:
                    conn = get_conn()
                    cur = conn.cursor()
                    user_id = st.session_state.get('user_id', 1)
                    
                    # Find and remove duplicate Buy transactions for current user
                    db_execute(cur, """
                        DELETE FROM trading_history 
                        WHERE id NOT IN (
                            SELECT MIN(id) 
                            FROM trading_history 
                            WHERE txn_type = 'Buy' AND user_id = ?
                            GROUP BY stock_symbol, txn_date, shares, purchase_cost
                        ) AND txn_type = 'Buy' AND user_id = ?
                    """, (user_id, user_id))
                    buy_dupes = cur.rowcount
                    
                    # Find and remove duplicate Sell transactions for current user
                    db_execute(cur, """
                        DELETE FROM trading_history 
                        WHERE id NOT IN (
                            SELECT MIN(id) 
                            FROM trading_history 
                            WHERE txn_type = 'Sell' AND user_id = ?
                            GROUP BY stock_symbol, txn_date, shares, sell_value
                        ) AND txn_type = 'Sell' AND user_id = ?
                    """, (user_id, user_id))
                    sell_dupes = cur.rowcount
                    
                    conn.commit()
                    conn.close()
                    
                    total_removed = buy_dupes + sell_dupes
                    if total_removed > 0:
                        st.success(f"✅ Removed {total_removed} duplicate transactions ({buy_dupes} buys, {sell_dupes} sells)")
                        time.sleep(2)
                        st.rerun()
                    else:
                        st.info("✨ No duplicates found!")
                except Exception as e:
                    st.error(f"Error removing duplicates: {e}")
        
        st.divider()
        
        # Sample Template Download
        from io import BytesIO
        sample_data = {
            'Purchase date': ['3-Mar-25', '17-Apr-25'],
            'Stock': ['KIB', 'KIB'],
            'Quantity': [31500, 95455],
            'Price cost': [0.120, 0.20974],
            'Cost value': [3787, 20021],
            'Sale Date': ['24-Feb-25', '27-Jul-25'],
            'Current Price': [0, 0.284],
            'Sale price': [0.172, 0.284],
            'Value price': [5418, 27109],
            'trading Profit': [1631, 7089],
            'cash Div': [0, 455],
            'Bonus shares': [0, 4545],
            'Profit%': [-19.62, 37.68],
            'Period in days': [138, 101],
            'Months': [5, 3.4]
        }
        sample_df = pd.DataFrame(sample_data)
        
        output = BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            sample_df.to_excel(writer, sheet_name='Trading Data', index=False)
        
        st.download_button(
            label="📄 Download Sample Template",
            data=output.getvalue(),
            file_name="trading_template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            key="download_trading_template"
        )
        
        st.divider()
        
        # File Upload
        uploaded_file = st.file_uploader("Choose Excel file", type=['xlsx', 'xls'], key="trading_upload")
        
        if uploaded_file is not None:
            try:
                import openpyxl
                from datetime import datetime
                xl = pd.ExcelFile(uploaded_file)
                sheet = "Trading Data" if "Trading Data" in xl.sheet_names else xl.sheet_names[0]
                df = pd.read_excel(uploaded_file, sheet_name=sheet)
                
                # Clean column names (strip spaces, normalize case)
                df.columns = df.columns.str.strip()
                
                # Replace NaN and empty strings with None for better handling
                df = df.replace({pd.NA: None, '': None})
                df = df.where(pd.notna(df), None)
                
                # Remove completely empty rows
                df = df.dropna(how='all')
                
                # VALIDATION: Check each row and create error tracking
                validation_errors = {}
                error_summary = []
                
                # Helper function to parse numeric values
                def parse_number(val, field_name):
                    if val is None or pd.isna(val):
                        return None
                    if isinstance(val, (int, float)):
                        return float(val)
                    val_str = str(val).strip().replace(',', '').replace('$', '').replace('KWD', '').replace('%', '')
                    if val_str == '' or val_str == '-':
                        return None
                    try:
                        return float(val_str)
                    except:
                        return None
                
                # Validate each row
                for idx, row in df.iterrows():
                    row_errors = []
                    
                    # Check Stock
                    stock_val = row.get('Stock')
                    if stock_val is None or (isinstance(stock_val, str) and stock_val.strip() == '') or pd.isna(stock_val):
                        row_errors.append('Stock')
                        error_summary.append(f"Row {idx+2}: Missing Stock name")
                    
                    # Check Purchase date
                    purchase_date_val = row.get('Purchase date')
                    if purchase_date_val is None or pd.isna(purchase_date_val):
                        row_errors.append('Purchase date')
                        error_summary.append(f"Row {idx+2}: Missing Purchase date")
                    else:
                        # Try to parse date
                        try:
                            if isinstance(purchase_date_val, str):
                                parsed = False
                                for fmt in ['%d-%b-%y', '%d-%m-%Y', '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y']:
                                    try:
                                        pd.to_datetime(purchase_date_val, format=fmt)
                                        parsed = True
                                        break
                                    except:
                                        continue
                                if not parsed:
                                    pd.to_datetime(purchase_date_val)
                        except:
                            row_errors.append('Purchase date')
                            error_summary.append(f"Row {idx+2}: Invalid Purchase date format '{purchase_date_val}'")
                    
                    # Check Quantity - Allow zero/None for dividend-only transactions
                    quantity = parse_number(row.get('Quantity'), 'Quantity')
                    cash_div_preview = parse_number(row.get('cash Div'), 'cash Div') or 0
                    bonus_preview = parse_number(row.get('Bonus shares'), 'Bonus shares') or 0
                    reinvested_preview = parse_number(row.get('reinvested_dividend'), 'reinvested_dividend') or 0
                    
                    # Check if this is a dividend-only transaction (has dividends but may have zero shares)
                    has_dividends = cash_div_preview > 0 or bonus_preview > 0 or reinvested_preview > 0
                    
                    # Only validate quantity if there are no dividends
                    if not has_dividends:
                        if quantity is None or quantity <= 0:
                            row_errors.append('Quantity')
                            error_summary.append(f"Row {idx+2}: Quantity is empty or zero (zero allowed only with dividends)")
                    
                    # Check Price cost (or try to calculate from Cost value)
                    price_cost = parse_number(row.get('Price cost'), 'Price cost')
                    cost_value = parse_number(row.get('Cost value'), 'Cost value')
                    
                    # Only validate cost if there are no dividends and quantity > 0
                    if not has_dividends:
                        if (price_cost is None or price_cost <= 0) and (cost_value is None or cost_value <= 0):
                            # Check if at least we have a quantity (could be bonus/free shares)
                            if quantity is None or quantity <= 0:
                                row_errors.append('Price cost')
                                row_errors.append('Cost value')
                            error_summary.append(f"Row {idx+2}: Both Price cost and Cost value are invalid (zero allowed for dividends/bonus shares)")
                    
                    # Check Sale Date if present
                    sale_date_val = row.get('Sale Date')
                    has_sale = False
                    if pd.notna(sale_date_val) and sale_date_val is not None:
                        if isinstance(sale_date_val, str):
                            sale_date_str = sale_date_val.strip()
                            has_sale = sale_date_str != '' and sale_date_str != '-' and sale_date_str != '0'
                            if has_sale:
                                # Validate sale date format
                                try:
                                    if isinstance(sale_date_val, str):
                                        parsed = False
                                        for fmt in ['%d-%b-%y', '%d-%m-%Y', '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y']:
                                            try:
                                                pd.to_datetime(sale_date_val, format=fmt)
                                                parsed = True
                                                break
                                            except:
                                                continue
                                        if not parsed:
                                            pd.to_datetime(sale_date_val)
                                except:
                                    row_errors.append('Sale Date')
                                    error_summary.append(f"Row {idx+2}: Invalid Sale Date format '{sale_date_val}'")
                        elif isinstance(sale_date_val, (int, float)):
                            has_sale = sale_date_val != 0
                        else:
                            has_sale = True
                    
                    # Check Sale price if Sale Date exists
                    if has_sale:
                        sale_price = parse_number(row.get('Sale price'), 'Sale price')
                        value_price = parse_number(row.get('Value price'), 'Value price')
                        
                        if (sale_price is None or sale_price <= 0) and (value_price is None or value_price <= 0):
                            row_errors.append('Sale price')
                            row_errors.append('Value price')
                            error_summary.append(f"Row {idx+2}: Sale Date provided but both Sale price and Value price are invalid")
                    
                    if row_errors:
                        validation_errors[idx] = row_errors
                
                # Display validation results
                if validation_errors:
                    st.error(f"❌ Found {len(validation_errors)} rows with errors out of {len(df)} total rows.")
                    
                    # Show error summary
                    with st.expander("📋 View All Errors", expanded=True):
                        for err in error_summary:
                            st.text(err)
                    
                    st.divider()
                    st.write("**Data Preview with Errors Highlighted:**")
                    
                    # Create styled dataframe with red highlighting
                    def highlight_errors(row):
                        row_idx = row.name
                        if row_idx in validation_errors:
                            error_cols = validation_errors[row_idx]
                            return ['background-color: #ffcccc' if col in error_cols else '' for col in df.columns]
                        return ['' for _ in df.columns]
                    
                    styled_df = df.style.apply(highlight_errors, axis=1)
                    st.dataframe(styled_df, use_container_width=True, height=400)
                    
                    st.divider()
                    
                    # Show options: Proceed or Cancel
                    st.warning(f"⚠️ You have 2 options:")
                    
                    col_opt1, col_opt2, col_opt3 = st.columns([1, 1, 2])
                    
                    with col_opt1:
                        proceed_with_errors = st.button(
                            f"✅ Import {len(df) - len(validation_errors)} Valid Rows", 
                            type="primary",
                            help=f"Skip {len(validation_errors)} problematic rows and import only valid data",
                            key="proceed_with_errors"
                        )
                    
                    with col_opt2:
                        cancel_import = st.button(
                            "❌ Cancel & Fix Excel",
                            help="Fix the highlighted cells in your Excel file and re-upload",
                            key="cancel_import"
                        )
                    
                    if cancel_import:
                        st.info("💡 Fix the red-highlighted cells in your Excel file and upload again.")
                        st.stop()
                    
                    if not proceed_with_errors:
                        st.stop()  # Wait for user to choose an option
                    
                    # User chose to proceed - filter out error rows
                    st.info(f"⏳ Importing {len(df) - len(validation_errors)} valid rows (skipping {len(validation_errors)} error rows)...")
                    valid_indices = [idx for idx in df.index if idx not in validation_errors]
                    df = df.loc[valid_indices].reset_index(drop=True)
                    
                else:
                    st.success(f"✅ Validation passed! All {len(df)} rows are valid.")
                    st.write(f"**Preview** ({len(df):,} rows from sheet '{sheet}'):")
                    st.dataframe(df, use_container_width=True, height=300)
                    proceed_with_errors = False  # Initialize for valid data path
                
                if st.button("✅ Import Trading Data", key="import_trades") or proceed_with_errors:
                    imported = 0
                    errors = []
                    success_rows = []
                    buy_count = 0
                    sell_count = 0
                    
                    # Get count before import
                    conn = get_conn()
                    cur = conn.cursor()
                    user_id = st.session_state.get('user_id', 1)
                    db_execute(cur, "SELECT COUNT(*) FROM trading_history WHERE user_id = ?", (user_id,))
                    transactions_before = cur.fetchone()[0]
                    
                    st.info(f"📊 Current database: {transactions_before} transactions | Starting import...")
                    
                    # Validate required columns first
                    required_cols = ['Purchase date', 'Stock', 'Quantity', 'Price cost']
                    missing_cols = [col for col in required_cols if col not in df.columns]
                    
                    if missing_cols:
                        st.error(f"❌ Missing required columns: {', '.join(missing_cols)}")
                        st.info("Required columns: Purchase date, Stock, Quantity, Price cost (Sale Date and Sale price are optional)")
                    else:
                        st.info(f"🔄 Processing {len(df)} rows from Excel file...")
                        
                        for idx, row in df.iterrows():
                            row_num = idx + 2  # Excel row number (accounting for header)
                            try:
                                # Debug: Show what we're processing
                                row_stock = row.get('Stock', 'N/A')
                                row_purchase_date = row.get('Purchase date', 'N/A')
                                row_sale_date = row.get('Sale Date', 'N/A')
                                # Validate row data - check for empty/null values
                                stock_val = row.get('Stock')
                                if stock_val is None or (isinstance(stock_val, str) and stock_val.strip() == '') or pd.isna(stock_val):
                                    errors.append(f"Row {row_num}: Stock name is missing")
                                    continue
                                
                                purchase_date_val = row.get('Purchase date')
                                if purchase_date_val is None or pd.isna(purchase_date_val):
                                    errors.append(f"Row {row_num}: Purchase date is missing")
                                    continue
                                
                                stock = str(row['Stock']).strip()
                                
                                # Check if this is a closed trade (has Sale Date) or open position
                                # Handle various "empty" values: NaN, None, 0, '-', empty string
                                sale_date_val = row.get('Sale Date')
                                has_sale = False
                                if pd.notna(sale_date_val) and sale_date_val is not None:
                                    if isinstance(sale_date_val, str):
                                        sale_date_str = sale_date_val.strip()
                                        has_sale = sale_date_str != '' and sale_date_str != '-' and sale_date_str != '0'
                                    elif isinstance(sale_date_val, (int, float)):
                                        has_sale = sale_date_val != 0
                                    else:
                                        # It's a datetime object
                                        has_sale = True
                                
                                # Parse dates - handle multiple formats
                                try:
                                    pd_val = row['Purchase date']
                                    if isinstance(pd_val, pd.Timestamp) or isinstance(pd_val, datetime):
                                        # Excel already converted to datetime
                                        purchase_date = pd_val.strftime('%Y-%m-%d')
                                    elif isinstance(pd_val, str):
                                        # Try multiple string formats
                                        for fmt in ['%d-%b-%y', '%d-%m-%Y', '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y']:
                                            try:
                                                purchase_date = pd.to_datetime(pd_val, format=fmt).strftime('%Y-%m-%d')
                                                break
                                            except:
                                                continue
                                        else:
                                            # Last resort - let pandas infer
                                            purchase_date = pd.to_datetime(pd_val).strftime('%Y-%m-%d')
                                    else:
                                        purchase_date = pd.to_datetime(pd_val).strftime('%Y-%m-%d')
                                except Exception as e:
                                    errors.append(f"Row {row_num}: Invalid Purchase date '{row['Purchase date']}' - {str(e)}")
                                    continue
                                
                                sale_date = None
                                if has_sale:
                                    try:
                                        sd_val = row['Sale Date']
                                        if isinstance(sd_val, pd.Timestamp) or isinstance(sd_val, datetime):
                                            sale_date = sd_val.strftime('%Y-%m-%d')
                                        elif isinstance(sd_val, str):
                                            for fmt in ['%d-%b-%y', '%d-%m-%Y', '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y']:
                                                try:
                                                    sale_date = pd.to_datetime(sd_val, format=fmt).strftime('%Y-%m-%d')
                                                    break
                                                except:
                                                    continue
                                            else:
                                                sale_date = pd.to_datetime(sd_val).strftime('%Y-%m-%d')
                                        else:
                                            sale_date = pd.to_datetime(sd_val).strftime('%Y-%m-%d')
                                    except Exception as e:
                                        errors.append(f"Row {row_num}: Invalid Sale Date '{row['Sale Date']}' - {str(e)}")
                                        continue
                                
                                stock = str(row['Stock']).strip()
                                
                                # Helper function to parse numeric values
                                def parse_number(val, field_name):
                                    if val is None or pd.isna(val):
                                        return None  # Return None instead of 0 for missing values
                                    if isinstance(val, (int, float)):
                                        return float(val)
                                    # Handle string numbers with commas, currency symbols
                                    val_str = str(val).strip().replace(',', '').replace('$', '').replace('KWD', '').replace('%', '')
                                    if val_str == '' or val_str == '-':
                                        return None  # Return None instead of 0 for empty strings
                                    try:
                                        return float(val_str)
                                    except:
                                        raise ValueError(f"{field_name} '{val}' is not a valid number")
                                
                                # Validate numeric fields - Allow zero for dividend-only transactions
                                try:
                                    quantity = parse_number(row['Quantity'], 'Quantity')
                                    cash_div = parse_number(row.get('cash Div', 0), 'cash Div') or 0
                                    bonus_shares = parse_number(row.get('Bonus shares', 0), 'Bonus shares') or 0
                                    
                                    # Check if this is a dividend-only transaction
                                    is_dividend_only = cash_div > 0 or bonus_shares > 0
                                    
                                    if (quantity is None or quantity <= 0) and not is_dividend_only:
                                        errors.append(f"Row {row_num}: Quantity is missing or invalid (got '{row['Quantity']}') - zero allowed only for dividend transactions")
                                        continue
                                    
                                    # Default to 0 if this is dividend-only
                                    if quantity is None or quantity <= 0:
                                        quantity = 0.0
                                        
                                except ValueError as e:
                                    errors.append(f"Row {row_num}: {str(e)}")
                                    continue
                                
                                try:
                                    price_cost = parse_number(row.get('Price cost'), 'Price cost')
                                    
                                    # Check if this is bonus shares or dividend-only (zero cost is valid)
                                    if (price_cost is None or price_cost == 0):
                                        cost_value = parse_number(row.get('Cost value'), 'Cost value')
                                        
                                        if cost_value is not None and cost_value > 0 and quantity > 0:
                                            # Calculate from Cost value
                                            price_cost = cost_value / quantity
                                            success_rows.append(f"Row {row_num}: Calculated Price cost = {price_cost:.3f} (Cost value {cost_value} / Quantity {quantity})")
                                        elif is_dividend_only:
                                            # Dividend-only transaction with zero cost
                                            price_cost = 0.0
                                            success_rows.append(f"Row {row_num}: {stock} - Dividend-only transaction (zero shares/cost recorded)")
                                        else:
                                            # Treat as bonus/free shares with zero cost
                                            price_cost = 0.0
                                            success_rows.append(f"Row {row_num}: {stock} - Bonus/Free shares (zero cost recorded)")
                                except ValueError as e:
                                    errors.append(f"Row {row_num}: {str(e)}")
                                    continue
                                
                                # Validate sale price only if sale date exists
                                sale_price = 0
                                if has_sale:
                                    try:
                                        sale_price = parse_number(row.get('Sale price', 0), 'Sale price')
                                        
                                        # If Sale price is missing, try to calculate from Value price / Quantity
                                        if sale_price is None or sale_price <= 0:
                                            value_price = parse_number(row.get('Value price'), 'Value price')
                                            if value_price is not None and value_price > 0 and quantity > 0:
                                                sale_price = value_price / quantity
                                            else:
                                                errors.append(f"Row {row_num}: Sale price is missing/invalid and cannot calculate from Value price (got '{row.get('Sale price')}')")
                                                continue
                                    except ValueError as e:
                                        errors.append(f"Row {row_num}: {str(e)}")
                                        continue
                                else:
                                    sale_price = 0
                                
                                # Calculate totals
                                purchase_cost = price_cost * quantity if quantity > 0 else 0
                                sell_value = sale_price * quantity if has_sale and quantity > 0 else 0
                                
                                # Check for duplicates with STRICT matching (stock, date, quantity, cost)
                                user_id = st.session_state.get('user_id', 1)
                                db_execute(cur, """
                                    SELECT id FROM trading_history 
                                    WHERE stock_symbol = ? AND txn_date = ? AND txn_type = 'Buy' 
                                    AND shares = ? AND purchase_cost = ? AND user_id = ?
                                """, (stock, purchase_date, quantity, purchase_cost, user_id))
                                
                                existing_buy = cur.fetchone()
                                buy_exists = existing_buy is not None
                                
                                # Check for Sell duplicate only if sale date exists
                                sell_exists = False
                                existing_sell = None
                                if has_sale:
                                    db_execute(cur, """
                                        SELECT id FROM trading_history 
                                        WHERE stock_symbol = ? AND txn_date = ? AND txn_type = 'Sell' 
                                        AND shares = ? AND sell_value = ? AND user_id = ?
                                    """, (stock, sale_date, quantity, sell_value, user_id))
                                    
                                    existing_sell = cur.fetchone()
                                    sell_exists = existing_sell is not None
                                
                                # STRICT duplicate handling - reject any duplicate
                                if buy_exists and has_sale and sell_exists:
                                    # Both buy and sell exist - complete duplicate
                                    errors.append(f"Row {row_num}: DUPLICATE REJECTED - {stock} trade already exists (Date: {purchase_date}, Qty: {quantity:,.0f}, Cost: {purchase_cost:,.2f})")
                                    continue
                                elif buy_exists and not has_sale:
                                    # Buy exists and this is also just a buy (no sell) - duplicate
                                    errors.append(f"Row {row_num}: DUPLICATE REJECTED - {stock} purchase already exists (Date: {purchase_date}, Qty: {quantity:,.0f}, Cost: {purchase_cost:,.2f})")
                                    continue
                                elif buy_exists and has_sale and not sell_exists:
                                    # Buy exists but sell doesn't - just add the sell transaction
                                    db_execute(cur, """
                                        INSERT INTO trading_history 
                                        (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                         cash_dividend, bonus_shares, created_at, user_id)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """, (stock, sale_date, 'Sell', 0, sell_value, quantity, cash_div, bonus_shares, int(time.time()), user_id))
                                    
                                    imported += 1
                                    success_rows.append(f"Row {row_num}: {stock} - Added sell transaction only (buy already exists)")
                                    continue
                                
                                # Check if stock exists in stocks table
                                user_id = st.session_state.get('user_id', 1)
                                db_execute(cur, "SELECT id FROM stocks WHERE symbol = ? AND user_id = ?", (stock, user_id))
                                if not cur.fetchone():
                                    # Add stock if missing
                                    db_execute(cur,
                                        "INSERT INTO stocks (symbol, name, portfolio, currency, user_id) VALUES (?, ?, ?, ?, ?)",
                                        (stock, stock, "KFH", "KWD", user_id)
                                    )
                                
                                # Insert Buy transaction (always)
                                db_execute(cur, """
                                    INSERT INTO trading_history 
                                    (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                     cash_dividend, bonus_shares, created_at, user_id)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """, (stock, purchase_date, 'Buy', purchase_cost, 0, quantity, 0, 0, int(time.time()), user_id))
                                buy_count += 1
                                
                                # Insert Sell transaction only if sale date exists
                                if has_sale:
                                    db_execute(cur, """
                                        INSERT INTO trading_history 
                                        (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                         cash_dividend, bonus_shares, created_at, user_id)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """, (stock, sale_date, 'Sell', 0, sell_value, quantity, cash_div, bonus_shares, int(time.time()), user_id))
                                    sell_count += 1
                                
                                imported += 1
                                status = f"closed trade (1 buy + 1 sell = 2 transactions)" if has_sale else "open position (1 buy transaction)"
                                success_rows.append(f"Row {row_num}: {stock} - {quantity:,.0f} shares ({status})")
                                
                            except Exception as e:
                                errors.append(f"Row {row_num}: Unexpected error - {str(e)}")
                        
                        conn.commit()
                        conn.close()
                        
                        # Get count after import
                        conn2 = get_conn()
                        cur2 = conn2.cursor()
                        user_id = st.session_state.get('user_id', 1)
                        db_execute(cur2, "SELECT COUNT(*) FROM trading_history WHERE user_id = ?", (user_id,))
                        transactions_after = cur2.fetchone()[0]
                        conn2.close()
                        
                        transactions_created = transactions_after - transactions_before
                        
                        # Display detailed results summary
                        st.divider()
                        st.subheader("📊 Import Summary")
                        
                        col_summary1, col_summary2, col_summary3, col_summary4 = st.columns(4)
                        with col_summary1:
                            st.metric("📥 Excel Rows Imported", f"{imported:,}")
                        with col_summary2:
                            st.metric("✅ Buy Transactions Created", f"{buy_count:,}", delta="Database records")
                        with col_summary3:
                            st.metric("✅ Sell Transactions Created", f"{sell_count:,}", delta="Database records")
                        with col_summary4:
                            st.metric("📊 Total DB Transactions", f"{transactions_after:,}", delta=f"+{transactions_created:,}")
                        
                        st.info(f"ℹ️ **Explanation:** Each closed trade creates 2 database transactions (1 Buy + 1 Sell). You imported {imported:,} Excel rows which created {transactions_created:,} database transactions.")
                        
                        st.divider()
                        
                        st.divider()
                        
                        # Display results
                        col1, col2 = st.columns(2)
                        with col1:
                            if imported > 0:
                                st.success(f"✅ Successfully imported {imported} out of {len(df)} trades")
                                with st.expander(f"📋 View {imported} successful imports", expanded=False):
                                    for success in success_rows:
                                        st.text(success)
                        
                        with col2:
                            if errors:
                                st.error(f"❌ Failed to import {len(errors)} rows")
                                with st.expander(f"⚠️ View {len(errors)} errors and how to fix", expanded=True):
                                    st.markdown("**Common fixes:**")
                                    st.markdown("- Dates must be in format: `dd-MMM-yy` (e.g., 3-Mar-25)")
                                    st.markdown("- All numeric fields must be numbers (no text)")
                                    st.markdown("- Stock name cannot be empty")
                                    st.markdown("- Quantity, Price cost, Sale price must be > 0")
                                    st.markdown("- **Duplicates:** If a buy already exists, you can't import the same buy again")
                                    st.divider()
                                    for err in errors:
                                        st.text(err)
                        
                        # Show row-by-row breakdown
                        with st.expander("📋 Detailed Row-by-Row Breakdown", expanded=(len(errors) > 0)):
                            st.markdown("**Legend:** ✅ = Success | ❌ = Failed/Skipped")
                            st.divider()
                            
                            for idx in range(len(df)):
                                row_num = idx + 2
                                row = df.iloc[idx]
                                stock_name = row.get('Stock', 'N/A')
                                
                                # Check if this row succeeded or failed
                                success_msg = [msg for msg in success_rows if msg.startswith(f"Row {row_num}:")]
                                error_msg = [msg for msg in errors if msg.startswith(f"Row {row_num}:")]
                                
                                if success_msg:
                                    st.success(f"✅ {success_msg[0]}")
                                elif error_msg:
                                    st.error(f"❌ {error_msg[0]}")
                                else:
                                    st.warning(f"⚠️ Row {row_num}: {stock_name} - Status unknown")
                        
                        st.divider()
                        
                        # Display results
                        col1, col2 = st.columns(2)
                        with col1:
                            if imported > 0:
                                st.success(f"✅ Successfully imported {imported} out of {len(df)} trades")
                                with st.expander(f"📋 View {imported} successful imports", expanded=False):
                                    for success in success_rows:
                                        st.text(success)
                        
                        with col2:
                            if errors:
                                st.error(f"❌ Failed to import {len(errors)} rows")
                                with st.expander(f"⚠️ View {len(errors)} errors and how to fix", expanded=True):
                                    st.markdown("**Common fixes:**")
                                    st.markdown("- Dates must be in format: `dd-MMM-yy` (e.g., 3-Mar-25)")
                                    st.markdown("- All numeric fields must be numbers (no text)")
                                    st.markdown("- Stock name cannot be empty")
                                    st.markdown("- Quantity, Price cost, Sale price must be > 0")
                                    st.markdown("- **Duplicates:** If a buy already exists, you can't import the same buy again")
                                    st.divider()
                                    for err in errors:
                                        st.text(err)
                        
                        # Add close button instead of auto-refresh
                        st.divider()
                        col_close1, col_close2, col_close3 = st.columns([1, 1, 4])
                        with col_close1:
                            if st.button("✅ Done - Refresh Data", type="primary", key="close_import_done"):
                                # Clear the uploaded file from session state
                                if "trading_upload" in st.session_state:
                                    del st.session_state["trading_upload"]
                                st.rerun()
                        
                        with col_close2:
                            if st.button("❌ Close Results", key="close_import_cancel"):
                                # Clear the uploaded file and results without refreshing
                                if "trading_upload" in st.session_state:
                                    del st.session_state["trading_upload"]
                                st.rerun()
                        
                        # Stop here - don't auto-refresh
                        st.stop()
                        
            except Exception as e:
                st.error(f"Error reading Excel file: {e}")
    
    st.divider()
    
    # Date range filter
    col1, col2, col3, col4 = st.columns([2, 2, 1, 1])
    with col1:
        start_date = st.date_input("From Date", value=date(2025, 1, 1), key="trade_start")
    with col2:
        end_date = st.date_input("To Date", value=date.today(), key="trade_end")
    with col3:
        st.write("")
        st.write("")
        if st.button("🔍 Filter", use_container_width=True):
            st.session_state['apply_date_filter'] = True
    with col4:
        st.write("")
        st.write("")
        if st.button("🔄 Show All", use_container_width=True):
            st.session_state['apply_date_filter'] = False
    
    # Check if we should apply date filter
    apply_filter = st.session_state.get('apply_date_filter', False)
    
    # Query completed trades (both buy and sell dates exist)
    conn = get_conn()
    
    # First, check total trading transactions in database for debugging
    cur = conn.cursor()
    user_id = st.session_state.get('user_id', 1)
    db_execute(cur, "SELECT COUNT(*) FROM trading_history WHERE user_id = ?", (user_id,))
    total_txns = cur.fetchone()[0]
    
    if total_txns == 0:
        st.warning(f"⚠️ No transactions found in database. Please upload your trading data using the Excel upload above.")
        conn.close()
        return
    
    # Show debug info with filter status
    if apply_filter:
        st.caption(f"📊 Showing filtered data from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')} | Database has {total_txns} raw transactions (Buy+Sell counted separately)")
    else:
        st.caption(f"📊 Showing all data | Database has {total_txns} raw transactions (Buy+Sell counted separately)")
    
    # Show explanation
    st.info(f"ℹ️ **Note:** The database stores Buy and Sell as separate transactions. A closed trade = 1 Buy + 1 Sell = 2 database records. The table below shows them combined as single trades.")
    
    # Build query based on filter
    if apply_filter:
        query = """
            SELECT 
                t.id,
                t.stock_symbol as Stock,
                t.txn_date,
                t.txn_type,
                t.shares as Quantity,
                t.purchase_cost as "Price cost",
                t.sell_value as "Sale price",
                t.cash_dividend as "cash Div",
                t.bonus_shares as "Bonus shares",
                t.notes
            FROM trading_history t
            WHERE t.user_id = ? AND t.txn_date BETWEEN ? AND ?
            ORDER BY t.txn_date, t.stock_symbol, t.txn_type
        """
        df = pd.read_sql_query(
            convert_sql_placeholders(query),
            conn,
            params=(user_id, start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
        )
    else:
        query = """
            SELECT 
                t.id,
                t.stock_symbol as Stock,
                t.txn_date,
                t.txn_type,
                t.shares as Quantity,
                t.purchase_cost as "Price cost",
                t.sell_value as "Sale price",
                t.cash_dividend as "cash Div",
                t.bonus_shares as "Bonus shares",
                t.notes
            FROM trading_history t
            WHERE t.user_id = ?
            ORDER BY t.txn_date, t.stock_symbol, t.txn_type
        """
        df = pd.read_sql_query(convert_sql_placeholders(query), conn, params=(user_id,))
    
    conn.close()
    
    # --- Normalize Stock column and add safety check ---
    if df is None:
        st.info("📭 No trading data available yet. Please add transactions first.")
        return

    # Try to normalize any variant of 'stock' / 'stock_symbol' to 'Stock'
    lower_map = {c.lower(): c for c in df.columns}

    # If there is a lowercase 'stock' column but not exact 'Stock', rename it
    if "stock" in lower_map and "Stock" not in df.columns:
        df.rename(columns={lower_map["stock"]: "Stock"}, inplace=True)

    # Or if we only have stock_symbol, normalize that
    if "stock_symbol" in lower_map and "Stock" not in df.columns:
        df.rename(columns={lower_map["stock_symbol"]: "Stock"}, inplace=True)

    # Final safety check – if still no 'Stock', show an error instead of crashing
    if "Stock" not in df.columns:
        st.error(f"Internal error: expected a 'Stock' column in trading data, but found columns: {list(df.columns)}")
        return
    
    if df.empty:
        if apply_filter:
            st.warning(f"⚠️ No trades found between {start_date.strftime('%Y-%m-%d')} and {end_date.strftime('%Y-%m-%d')}.")
            st.info("💡 Click '🔄 Show All' to see all transactions or adjust the date range.")
        else:
            st.warning(f"⚠️ No trades found in the database.")
        
        # Show date range of existing trading transactions
        conn2 = get_conn()
        user_id = st.session_state.get('user_id', 1)
        date_range_query = "SELECT MIN(txn_date) as min_date, MAX(txn_date) as max_date FROM trading_history WHERE user_id = ?"
        date_df = pd.read_sql_query(convert_sql_placeholders(date_range_query), conn2, params=(user_id,))
        conn2.close()
        
        if not date_df.empty and date_df['min_date'].iloc[0]:
            st.info(f"📅 Your transactions date range: {date_df['min_date'].iloc[0]} to {date_df['max_date'].iloc[0]}")
        
        return
    
    # --- 1. RECONSTRUCT TRADES (Pair Buys & Sells) ---
    realized_trades = []  # Completed trades with sell
    unrealized_positions = []  # Open positions without sell
    all_tickers_for_fetch = set()
    
    # Process by Stock to pair transactions
    for stock in sorted(df["Stock"].dropna().unique()):
        stock_df = df[df['Stock'] == stock].sort_values('txn_date').reset_index(drop=True)
        
        buys = stock_df[stock_df['txn_type'] == 'Buy'].copy()
        sells = stock_df[stock_df['txn_type'] == 'Sell'].copy()
        
        # Track matches
        matched_buy_ids = set()
        matched_sell_ids = set()
        
        # Match Sells to Buys (FIFO/Best Match)
        for _, sell in sells.iterrows():
            if sell['id'] in matched_sell_ids:
                continue
                
            # Find closest buy with same quantity
            matching_buys = buys[
                (buys['Quantity'] == sell['Quantity']) & 
                (~buys['id'].isin(matched_buy_ids)) &
                (buys['txn_date'] <= sell['txn_date'])
            ]
            
            if not matching_buys.empty:
                buy = matching_buys.iloc[-1] # Use most recent buy before sell
                matched_buy_ids.add(buy['id'])
                matched_sell_ids.add(sell['id'])
                
                # Metric Data
                q = sell['Quantity']
                buy_price = buy['Price cost'] / q if q > 0 else 0
                sell_price = sell['Sale price'] / q if q > 0 else 0
                
                realized_trades.append({
                    '_buy_id': buy['id'],
                    '_sell_id': sell['id'],
                    'Status': 'Realized',
                    'Stock': stock,
                    'Purchase Date': pd.to_datetime(buy['txn_date']).date(),
                    'Quantity': q,
                    'Price Cost': buy_price,
                    # Realized Fields
                    'Sale Date': pd.to_datetime(sell['txn_date']).date(),
                    'Sale Price': sell_price,
                    # Extras
                    'Dividends': sell['cash Div'] or 0,
                    'Bonus': sell['Bonus shares'] or 0,
                    'Notes': sell['notes'],
                    # Placeholders (Calculated later)
                    'Current Price': None, 
                })

        # Process Unmatched Buys (Unrealized)
        for _, buy in buys.iterrows():
            if buy['id'] not in matched_buy_ids:
                q = buy['Quantity']
                buy_price = buy['Price cost'] / q if q > 0 else 0
                
                unrealized_positions.append({
                    '_buy_id': buy['id'],
                    '_sell_id': None,
                    'Status': 'Unrealized',
                    'Stock': stock,
                    'Purchase Date': pd.to_datetime(buy['txn_date']).date(),
                    'Quantity': q,
                    'Price Cost': buy_price,
                    # Realized Fields (Empty)
                    'Sale Date': None,
                    'Sale Price': 0,
                    # Extras
                    'Dividends': buy['cash Div'] or 0,
                    'Bonus': buy['Bonus shares'] or 0,
                    'Notes': buy['notes'],
                    # For Batch Fetch
                    'Current Price': 0
                })
                all_tickers_for_fetch.add(stock)

    # --- 2. BATCH FETCH PRICES (Unrealized Only) ---
    live_prices = {}
    if all_tickers_for_fetch and YFINANCE_AVAILABLE:
        tickers_list = list(all_tickers_for_fetch)
        # Filter for valid tickers only (simple heuristic)
        valid_tickers = [t for t in tickers_list if "." in t or t.isupper()]
        
        if valid_tickers:
            with st.spinner(f"Fetching prices for {len(valid_tickers)} stocks..."):
                try:
                    # Use Tickers for batch
                    # yf.download is efficient for multiple tickers
                    data = yf.download(valid_tickers, period="1d", progress=False)['Close']
                    
                    if not data.empty:
                        # Handle single vs multiple result structure
                        if len(valid_tickers) == 1:
                            # data is Series or DataFrame with 1 col
                            val = data.iloc[-1]
                            if isinstance(val, pd.Series): val = val.iloc[0]
                            # Apply /1000 Logic for Kuwait stocks (assuming .KW suffix)
                            raw_val = float(val)
                            t = valid_tickers[0]
                            # Normalize Kuwait stock prices (Fils to KWD)
                            if t.endswith('.KW'):
                                raw_val = normalize_kwd_price(raw_val, 'KWD')
                            live_prices[t] = raw_val
                        else:
                            # data is DataFrame, columns are tickers
                            last_row = data.iloc[-1]
                            for t in valid_tickers:
                                if t in last_row.index:
                                    val = last_row[t]
                                    if pd.notna(val):
                                        raw_val = float(val)
                                        # Normalize Kuwait stock prices (Fils to KWD)
                                        if t.endswith('.KW'):
                                            raw_val = normalize_kwd_price(raw_val, 'KWD')
                                        live_prices[t] = raw_val
                except Exception as e:
                    # Fallback or silent fail
                    print(f"Batch fetch error: {e}")

    # --- 3. BUILD DATAFRAME & CALCULATE METRICS ---
    combined_data = realized_trades + unrealized_positions
    if not combined_data:
        st.info("No trades to display.")
        return

    trade_df = pd.DataFrame(combined_data)
    
    # Helper: Safe Float
    def _safe_float(x):
        try: return float(x)
        except: return 0.0

    # Enrich with Calculations
    enriched_rows = []
    
    total_realized_profit = 0.0
    total_unrealized_profit = 0.0
    
    for idx, row in trade_df.iterrows():
        status = row['Status'] # Initial status
        
        # Logic: Status is derived from Sale Date existence
        if pd.notna(row['Sale Date']):
            status = 'Realized'
            current_price = 0 # Not relevant for realized
        else:
            status = 'Unrealized'
            current_price = live_prices.get(row['Stock'], 0.0)
            
        qty = _safe_float(row['Quantity'])
        buy_price = _safe_float(row['Price Cost'])
        sale_price = _safe_float(row['Sale Price']) if status == 'Realized' else 0
        
        cost_value = qty * buy_price
        
        # Profit Logic
        profit = 0.0
        profit_pct = 0.0
        
        if status == 'Realized':
            sale_value = qty * sale_price
            profit = sale_value - cost_value
            value_price = sale_value
        else:
            # Unrealized
            value_price = qty * current_price
            profit = value_price - cost_value
            
        if cost_value > 0:
            profit_pct = (profit / cost_value) * 100
            
        # Add to totals
        if status == 'Realized':
            total_realized_profit += profit
        else:
            total_unrealized_profit += profit

        row['Status'] = status
        row['Current Price'] = current_price if status == 'Unrealized' else None
        row['Cost Value'] = cost_value
        row['Value Price'] = value_price
        row['Profit'] = profit
        row['Profit %'] = profit_pct
        
        enriched_rows.append(row)
        
    final_df = pd.DataFrame(enriched_rows)
    # Sort: Realized (by Sale Date desc), then Unrealized (by Buy Date desc)
    final_df.sort_values('Purchase Date', ascending=False, inplace=True)
    
    # Display summary metrics
    st.divider()
    
    # --- 4. KPI CARDS ---
    st.divider()
    k1, k2, k3 = st.columns(3)
    k1.metric("💰 Realized Profit", fmt_money_plain(total_realized_profit), 
              delta=f"{total_realized_profit:,.2f}", delta_color="normal")
    k2.metric("📊 Unrealized Profit", fmt_money_plain(total_unrealized_profit), 
              delta=f"{total_unrealized_profit:,.2f}", delta_color="off")
    k3.metric("📈 Total P&L", fmt_money_plain(total_realized_profit + total_unrealized_profit))
    st.divider()
    
    # --- 5. EDITABLE TABLE (Inline Editing) ---
    col_mode, col_act = st.columns([2, 1])
    with col_mode:
        view_mode = st.radio(" ", ["📊 Read View", "✏️ Edit Mode"], horizontal=True, label_visibility="collapsed")
    with col_act:
        if st.button("🔄 Update Prices"):
             with st.spinner("Fetching..."):
                 time.sleep(1)
                 st.rerun()

    if view_mode == "📊 Read View":
        render_styled_table(final_df, highlight_logic=True)
        st.caption("ℹ️ Switch to **Edit Mode** to add, modify, or delete trades.")
        st.divider()
    else:
        col_info, col_btn = st.columns([5, 1])
        with col_info:
            st.caption("📝 **Editor Mode:** Edit trades directly below. Set 'Sale Date' to mark as Realized. Clear it to revert to Unrealized.")
            st.caption("💡 **Tip:** Kuwait stocks should end with `.KW` (e.g., `KFH.KW`).")
        with col_btn:
            if st.button("🔄 Update Prices", help="Fetch latest prices from Yahoo Finance"):
                st.rerun()
    
        # Reorder DataFrame Columns - Move Current Price after Buy Price
        desired_cols = [
            "Status", "Stock", "Purchase Date", "Quantity", "Price Cost", 
            "Current Price", "Cost Value", 
            "Sale Date", "Sale Price", 
            "Value Price", "Profit", "Profit %", 
            "Dividends", "Bonus", "Notes", 
            "_buy_id", "_sell_id"
        ]
        # Filter to existing columns and reorder
        final_df = final_df[[c for c in desired_cols if c in final_df.columns] + [c for c in final_df.columns if c not in desired_cols]]
    
        # Config for Editor
        # Build Stock List from KUWAIT_STOCKS (Use YFinance Tickers)
        known_tickers = [s.get('yf_ticker', s['symbol']) for s in KUWAIT_STOCKS]
        stock_options = sorted(list(set(known_tickers + list(final_df['Stock'].unique()))))
    
        column_config = {
            "_buy_id": None, 
            "_sell_id": None,
            "Status": st.column_config.TextColumn("Status", disabled=True, width="small"),
            "Stock": st.column_config.SelectboxColumn(
                "Stock", 
                options=stock_options,
                required=True,
                width="medium",
                help="Select valid ticker (e.g. KFH.KW)"
            ),
            "Purchase Date": st.column_config.DateColumn("Purchase Date", format="YYYY-MM-DD", required=True),
            "Quantity": st.column_config.NumberColumn("Quantity", min_value=1, format="%.0f", required=True),
            "Price Cost": st.column_config.NumberColumn("Buy Price", min_value=0, format="%.3f", required=True),
            "Sale Date": st.column_config.DateColumn("Sale Date", format="YYYY-MM-DD", help="Set date to mark as Realized"),
            "Sale Price": st.column_config.NumberColumn("Sale Price", min_value=0, format="%.3f"),
            
            # Calculated / Read-only
            "Current Price": st.column_config.NumberColumn("Current Price", format="%.3f", disabled=True),
            "Cost Value": st.column_config.NumberColumn("Cost Value", format="%.1f", disabled=True),
            "Value Price": st.column_config.NumberColumn("Mkt Value", format="%.1f", disabled=True),
            "Profit": st.column_config.NumberColumn("Profit (KD)", format="%.1f", disabled=True),
            "Profit %": st.column_config.NumberColumn("Profit %", format="%.1f%%", disabled=True),
            "Dividends": st.column_config.NumberColumn("Divs", format="%.1f"),
            "Bonus": st.column_config.NumberColumn("Bonus", format="%.0f"),
            "Notes": st.column_config.TextColumn("Notes")
        }
        
        st.warning("⚠️ **IMPORTANT:** Kuwait stocks must use `.KW` suffix (e.g., NIH → **NIH.KW**, KRE → **KRE.KW**). US stocks use standard tickers (AAPL, TSLA). Double-click Stock cell to edit, then click 💾 Save.")
        
        st.divider()
        
            # Display editable table inside a form to prevent auto-refresh on edit
        with st.form("trading_table_form", clear_on_submit=False):
            edited_df = st.data_editor(
                final_df,
                column_config=column_config,
                use_container_width=True,
                hide_index=True,
                num_rows="dynamic",
                key="trading_editor_v2"
            )
    
            st.caption("ℹ️ **Usage:** Click `+` to add rows. Set 'Sale Date' to mark as Sold. Clear it to set as Holding. Select rows and press Delete to remove.")
            st.write("") # Spacer
            submitted = st.form_submit_button("💾 Save Changes", type="primary", use_container_width=True)
    
        if submitted:
            try:
                conn = get_conn()
                cur = conn.cursor()
                changes_count = 0
    
                # 1. Identify Deletions using DataFrame Index
                # (Robust against hidden columns)
                original_indexes = set(final_df.index)
                current_indexes = set(edited_df.index)
                indexes_to_delete = original_indexes - current_indexes
                
                for idx in indexes_to_delete:
                    row_orig = final_df.loc[idx]
                    b_id = row_orig['_buy_id']
                    if pd.notna(b_id):
                        # Delete Buy
                        db_execute(cur, "DELETE FROM trading_history WHERE id = ?", (int(b_id),))
                        
                        # Delete Sell
                        s_id = row_orig.get('_sell_id')
                        if pd.notna(s_id):
                            db_execute(cur, "DELETE FROM trading_history WHERE id = ?", (int(s_id),))
                        
                        changes_count += 1
    
                # 2. Handle Insertions and Updates
                for index, row in edited_df.iterrows():
                    # Determine Identity
                    buy_id = None
                    sell_id = None
                    
                    if index in final_df.index:
                        # Existing Record: Retrieve IDs reliably from source info
                        # (Even if hidden in editor)
                        buy_id = final_df.loc[index, '_buy_id']
                        sell_id = final_df.loc[index, '_sell_id']
                    
                    # Extract values
                    symbol = str(row['Stock']).strip()
                    # Correction
                    if len(symbol) <= 4 and symbol.isalpha():
                         symbol = f"{symbol}.KW"
                    
                    # Date Parsing
                    try:
                        p_date_raw = row['Purchase Date']
                        if pd.isna(p_date_raw) or str(p_date_raw).strip() == '':
                            p_date = time.strftime('%Y-%m-%d')
                        else:
                            try:
                                p_date = pd.to_datetime(p_date_raw).strftime('%Y-%m-%d')
                                # Handle NaT
                                if p_date == 'NaT': p_date = time.strftime('%Y-%m-%d')
                            except:
                                p_date = str(p_date_raw)
                    except:
                        p_date = time.strftime('%Y-%m-%d')
    
                    qty = float(row['Quantity']) if pd.notna(row['Quantity']) else 0.0
                    # Use 'Price Cost' (internal name) not 'Buy Price' (display label)
                    p_price = float(row['Price Cost']) if pd.notna(row.get('Price Cost')) else 0.0
                    p_cost = p_price * qty
                    
                    # Check for Sale
                    s_date_raw = row['Sale Date']
                    is_realized = False
                    s_date = None
                    s_price = 0.0
                    
                    # Logic: If Sale Date is set, it's Realized
                    if pd.notna(s_date_raw) and str(s_date_raw).strip() != '' and str(s_date_raw).strip().lower() != 'none':
                         try:
                             # Check strict NaT
                             dt = pd.to_datetime(s_date_raw)
                             if pd.notna(dt):
                                 s_date = dt.strftime('%Y-%m-%d')
                                 is_realized = True
                                 s_price = float(row['Sale Price']) if pd.notna(row['Sale Price']) else 0.0
                         except:
                             pass
    
                    
                    # -- EXISTING RECORD (UPDATE) --
                    if pd.notna(buy_id):
                        buy_id = int(buy_id)
                        # Update Buy
                        db_execute(cur, """
                            UPDATE trading_history
                            SET stock_symbol = ?, txn_date = ?, shares = ?, purchase_cost = ?
                            WHERE id = ?
                        """, (symbol, p_date, qty, p_cost, buy_id))
                        
                        if is_realized:
                            sell_val = s_price * qty
                            if pd.notna(sell_id):
                                # Update existing Sell
                                db_execute(cur, """
                                    UPDATE trading_history
                                    SET stock_symbol = ?, txn_date = ?, shares = ?, sell_value = ?
                                    WHERE id = ?
                                """, (symbol, s_date, qty, sell_val, int(sell_id)))
                            else:
                                # Insert NEW Sell (Transition to Realized)
                                user_id = st.session_state.get('user_id', 1)
                                db_execute(cur, """
                                    INSERT INTO trading_history (stock_symbol, txn_date, txn_type, shares, sell_value, created_at, user_id)
                                    VALUES (?, ?, 'Sell', ?, ?, ?, ?)
                                """, (symbol, s_date, qty, sell_val, int(time.time()), user_id))
                        else:
                            # Transferred to Unrealized: Delete potential sell record
                            if pd.notna(sell_id):
                                db_execute(cur, "DELETE FROM trading_history WHERE id = ?", (int(sell_id),))
                        
                        changes_count += 0.5 # Track updates lightly
                    
                    # -- NEW RECORD (INSERT) --
                    else:
                        # Insert Buy
                        user_id = st.session_state.get('user_id', 1)
                        db_execute(cur, """
                            INSERT INTO trading_history (stock_symbol, txn_date, txn_type, shares, purchase_cost, created_at, user_id)
                            VALUES (?, ?, 'Buy', ?, ?, ?, ?)
                        """, (symbol, p_date, qty, p_cost, int(time.time()), user_id))
                        
                        # If Realized, Insert Sell
                        if is_realized:
                            sell_val = s_price * qty
                            db_execute(cur, """
                                INSERT INTO trading_history (stock_symbol, txn_date, txn_type, shares, sell_value, created_at, user_id)
                                VALUES (?, ?, 'Sell', ?, ?, ?, ?)
                            """, (symbol, s_date, qty, sell_val, int(time.time()), user_id))
                        
                        changes_count += 1
                
                conn.commit()
                conn.close()
                st.toast(f"✅ Changes saved!", icon="🎉")
                time.sleep(1)
                st.rerun()
    
            except Exception as e:
                st.error(f"Error saving changes: {e}")
                # st.write(e) # Debug
    
        st.divider()
    
    # Prepare DataFrames for Export
    all_df = final_df
    realized_df = final_df[final_df['Status'] == 'Realized']
    unrealized_df = final_df[final_df['Status'] == 'Unrealized']

    # Download as Excel
    st.divider()
    
    from io import BytesIO
    output = BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        # Export all trades
        all_df.to_excel(writer, sheet_name='All Trades', index=False)
        
        # Export realized trades only
        if not realized_df.empty:
            realized_df.to_excel(writer, sheet_name='Realized', index=False)
        
        # Export unrealized positions only
        if not unrealized_df.empty:
            unrealized_df.to_excel(writer, sheet_name='Unrealized', index=False)
    
    st.download_button(
        label="📥 Download Trading Report (Excel)",
        data=output.getvalue(),
        file_name=f"trading_report_{start_date}_to_{end_date}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


# =========================
# OVERVIEW TAB
# =========================
@st.cache_data(ttl=3600)
def get_risk_free_rate():
    """Return Kuwait Central Bank Discount Rate as risk-free rate."""
    # As of 2024/2025, CBK Discount Rate is approx 4.25%
    # Since there is no direct Yahoo Finance ticker for CBK rate, we use a fixed constant.
    # Users can update this manually if the rate changes.
    cbk_rate = 0.0425 
    return cbk_rate

def calculate_sharpe_ratio(rf_rate):
    """Calculate Sharpe Ratio based on portfolio snapshots."""
    # Load portfolio snapshots
    user_id = st.session_state.get('user_id', 1)
    df = query_df("SELECT snapshot_date, portfolio_value FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date ASC", (user_id,))
    
    if df.empty or len(df) < 2:
        return None
        
    # Calculate daily returns
    df['daily_return'] = df['portfolio_value'].pct_change()
    
    # Drop NaN (first row)
    df = df.dropna()
    
    if df.empty:
        return None
        
    # Convert annual Rf to daily Rf
    # daily_rf = (1 + annual_rf) ^ (1/252) - 1
    daily_rf = (1 + rf_rate) ** (1/252) - 1
    
    # Calculate Excess Returns
    df['excess_return'] = df['daily_return'] - daily_rf
    
    # Calculate Sharpe
    mean_excess = df['excess_return'].mean()
    std_excess = df['excess_return'].std()
    
    if std_excess == 0:
        return 0.0
        
    # Annualize
    sharpe = (mean_excess / std_excess) * np.sqrt(252)
    
    return sharpe

@st.cache_data(ttl=3600)
def get_us_risk_free_rate():
    """Fetch 10-Year Treasury Yield (^TNX) for Sortino Ratio."""
    default_rate = 0.045
    if not YFINANCE_AVAILABLE or yf is None:
        return default_rate
    
    try:
        ticker = yf.Ticker("^TNX")
        hist = ticker.history(period="1d")
        if not hist.empty:
            # TNX is in percentage points (e.g. 4.50), so divide by 100
            return float(hist["Close"].iloc[-1]) / 100.0
    except Exception:
        pass
    return default_rate

def calculate_sortino_ratio(rf_rate):
    """Calculate Sortino Ratio based on portfolio snapshots."""
    # Load portfolio snapshots
    user_id = st.session_state.get('user_id', 1)
    df = query_df("SELECT snapshot_date, portfolio_value FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date ASC", (user_id,))
    
    if df.empty or len(df) < 2:
        return None
        
    # Calculate daily returns
    df['daily_return'] = df['portfolio_value'].pct_change()
    
    # Drop NaN (first row)
    df = df.dropna()
    
    if df.empty:
        return None
        
    # Convert annual Rf to daily Rf
    daily_rf = (1 + rf_rate) ** (1/252) - 1
    
    # Calculate Excess Returns
    df['excess_return'] = df['daily_return'] - daily_rf
    
    # Calculate Downside Deviation
    # Keep only negative excess returns, replace positives with 0
    negative_returns = np.minimum(df['excess_return'], 0)
    
    # Calculate standard deviation of these negative movements
    downside_std = np.std(negative_returns)
    
    if downside_std == 0:
        return 10.0 # Cap if no downside
        
    # Calculate Sortino
    mean_excess = df['excess_return'].mean()
    sortino = (mean_excess / downside_std) * np.sqrt(252)
    
    return sortino

def ui_overview():
    st.header("📊 Portfolio Overview")
    
    # Get total portfolio value from latest snapshot (for reference)
    user_id = st.session_state.get('user_id', 1)
    latest_snapshot = query_df(
        "SELECT portfolio_value, accumulated_cash, net_gain, roi_percent, snapshot_date FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 1",
        (user_id,)
    )
    
    # Get previous day's snapshot for daily movement calculation
    previous_snapshot = query_df(
        "SELECT portfolio_value, snapshot_date FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 1 OFFSET 1",
        (user_id,)
    )
    
    # Calculate LIVE portfolio value from current prices and holdings
    live_stock_value = 0.0
    num_stocks = 0
    
    for port_name in PORTFOLIO_CCY.keys():
        df_port = build_portfolio_table(port_name)
        if not df_port.empty:
            # Count actual holdings (Shares > 0)
            active_holdings = df_port[df_port['Shares Qty'] > 0.001]
            num_stocks += len(active_holdings)
            
            for _, row in df_port.iterrows():
                live_stock_value += convert_to_kwd(row['Market Value'], row['Currency'])

    # --- Integration of Manual Cash for Totals (matching Portfolio Analysis) ---
    user_id = st.session_state.get('user_id')
    manual_cash_kwd = 0.0
    cash_recs = query_df("SELECT balance, currency FROM portfolio_cash WHERE user_id=?", (user_id,))
    if not cash_recs.empty:
        for _, cr in cash_recs.iterrows():
            manual_cash_kwd += convert_to_kwd(cr["balance"], cr["currency"])
    
    # LIVE Portfolio Value = Stock Market Values + Manual Cash
    live_portfolio_value = live_stock_value + manual_cash_kwd
    # ---------------------------------------------------------------------------

    # Get total cash deposits
    user_id = st.session_state.get('user_id', 1)
    all_deposits = query_df("SELECT amount, currency, include_in_analysis FROM cash_deposits WHERE user_id = ?", (user_id,))
    
    if not all_deposits.empty:
        all_deposits["amount_in_kwd"] = all_deposits.apply(
            lambda row: convert_to_kwd(row["amount"], row.get("currency", "KWD")),
            axis=1
        )
        total_deposits_kwd = all_deposits["amount_in_kwd"].sum()
        deposits_in_analysis = all_deposits[all_deposits["include_in_analysis"] == 1]["amount_in_kwd"].sum()
    else:
        total_deposits_kwd = 0
        deposits_in_analysis = 0
    
    # Get total cash dividends (converted to KWD)
    all_dividends = query_df("""
        SELECT t.cash_dividend, COALESCE(s.currency, 'KWD') as currency
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol
        WHERE t.cash_dividend > 0
    """)
    
    total_dividends_kwd = 0.0
    if not all_dividends.empty:
        all_dividends["amount_in_kwd"] = all_dividends.apply(
            lambda row: convert_to_kwd(row["cash_dividend"], row["currency"]),
            axis=1
        )
        total_dividends_kwd = all_dividends["amount_in_kwd"].sum()
    
    # Calculate Realized Profit (from Sell transactions)
    realized_profit_kwd = 0.0
    realized_query = query_df("""
        SELECT 
            t.sell_value, 
            t.purchase_cost,
            t.shares,
            COALESCE(s.currency, 'KWD') as currency
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND s.user_id = t.user_id
        WHERE t.txn_type = 'Sell' AND t.user_id = ? AND COALESCE(t.category, 'portfolio') = 'portfolio'
    """, (user_id,))
    
    if not realized_query.empty:
        for _, row in realized_query.iterrows():
            sell_val = safe_float(row.get('sell_value', 0), 0)
            buy_cost = safe_float(row.get('purchase_cost', 0), 0)
            profit = sell_val - buy_cost
            realized_profit_kwd += convert_to_kwd(profit, row.get('currency', 'KWD'))
    
    # Calculate Unrealized Profit (current holdings)
    unrealized_profit_kwd = 0.0
    for port_name in PORTFOLIO_CCY.keys():
        df_port = build_portfolio_table(port_name)
        if not df_port.empty and 'Unrealized P/L' in df_port.columns:
            for _, row in df_port.iterrows():
                unrealized_profit_kwd += convert_to_kwd(row['Unrealized P/L'], row['Currency'])
    
    # Get total transactions
    user_id = st.session_state.get('user_id', 1)
    total_txns = query_df("SELECT COUNT(*) as count FROM transactions WHERE user_id = ?", (user_id,))
    num_txns = total_txns["count"].iloc[0] if not total_txns.empty else 0
    
    # Calculate Sharpe Ratio
    rf_rate = get_risk_free_rate()
    sharpe_ratio = calculate_sharpe_ratio(rf_rate)
    
    # Calculate Sortino Ratio (Using Kuwait Rate as requested)
    sortino_ratio = calculate_sortino_ratio(rf_rate)
    
    # Determine colors based on user-selected theme (Matching ui_portfolio_analysis)
    if st.session_state.theme == "dark":
        text_color = "#f1f5f9"
        muted_color = "#94a3b8"
        card_bg = "rgba(30, 41, 59, 0.5)"
        card_border = "rgba(71, 85, 105, 0.5)"
        accent_color = "#3b82f6"
    else:  # Light mode
        text_color = "#1e293b"
        muted_color = "#64748b"
        card_bg = "white"
        card_border = "rgba(203, 213, 225, 0.8)"
        accent_color = "#3b82f6"

    # Summary Cards - Styled globally
    
    # CSS for fixed-size cards (Equal Height & Width) - Matching Performance Metrics Style
    st.markdown(f"""
    <style>
    .ov-card {{
        height: 120px;
        padding: 1.25rem;
        border-radius: 12px;
        background: {card_bg};
        border: 1px solid {card_border};
        display: flex;
        flex-direction: column;
        justify-content: center;
        transition: all 0.3s ease;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }}
    .ov-card:hover {{
        transform: translateY(-5px);
        box-shadow: 0 8px 20px rgba(56, 189, 248, 0.2);
        border-color: {accent_color};
    }}
    .ov-title {{
        font-size: 0.75rem;
        color: {muted_color};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 0.5rem;
    }}
    .ov-value {{
        font-size: 1.5rem;
        font-weight: 700;
        line-height: 1.2;
        color: {text_color};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }}
    .ov-sub {{
        font-size: 0.8rem;
        color: {muted_color};
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 0.5rem;
    }}
    .ov-delta-pos {{ 
        color: #10b981; 
        font-weight: 600; 
    }}
    .ov-delta-neg {{ 
        color: #ef4444; 
        font-weight: 600; 
    }}
    .ov-currency {{
        font-size: 0.9rem;
        opacity: 0.7;
        font-weight: 500;
    }}
    </style>
    """, unsafe_allow_html=True)

    # Calculate daily movement
    daily_change_value = 0.0
    daily_change_pct = 0.0
    daily_change_available = False
    
    if not previous_snapshot.empty:
        prev_value = previous_snapshot['portfolio_value'].iloc[0]
        if prev_value and prev_value > 0:
            daily_change_value = live_portfolio_value - prev_value
            daily_change_pct = (daily_change_value / prev_value) * 100
            daily_change_available = True

    col1, col2, col3, col4, col5 = st.columns(5)
    
    with col1:
        # Show breakdown: Stocks + Cash
        cash_text = f"Cash: {fmt_money_plain(manual_cash_kwd, 2)} KWD" if manual_cash_kwd > 0 else "Live prices"
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">💼 Portfolio Value</div>
            <div class="ov-value">{fmt_money_plain(live_portfolio_value, 3)} <span class="ov-currency">KWD</span></div>
            <div class="ov-sub">{cash_text}</div>
        </div>
        """, unsafe_allow_html=True)
    
    with col2:
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">💰 Total Cash Deposits</div>
            <div class="ov-value">{fmt_money_plain(total_deposits_kwd, 3)} <span class="ov-currency">KWD</span></div>
            <div class="ov-sub">In Analysis: {fmt_money_plain(deposits_in_analysis, 3)}</div>
        </div>
        """, unsafe_allow_html=True)
    
    with col3:
        # Net Gain = Live Portfolio Value - Total Cash Deposits
        net_gain = live_portfolio_value - total_deposits_kwd
        roi = (net_gain / total_deposits_kwd * 100) if total_deposits_kwd > 0 else 0
        
        delta_class = "ov-delta-pos" if roi >= 0 else "ov-delta-neg"
        delta_sign = "+" if roi >= 0 else ""
        
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">📈 Net Gain</div>
            <div class="ov-value">{fmt_money_plain(net_gain, 3)} <span class="ov-currency">KWD</span></div>
            <div class="ov-sub">
                <span class="{delta_class}">{delta_sign}{roi:.2f}% ROI</span>
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    with col4:
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">📊 Total Stocks</div>
            <div class="ov-value">{num_stocks}</div>
            <div class="ov-sub">{num_txns} transactions</div>
        </div>
        """, unsafe_allow_html=True)
    
    with col5:
        if daily_change_available:
            delta_class = "ov-delta-pos" if daily_change_value >= 0 else "ov-delta-neg"
            delta_sign = "+" if daily_change_value >= 0 else ""
            arrow = "▲" if daily_change_value >= 0 else "▼"
            
            st.markdown(f"""
            <div class="ov-card">
                <div class="ov-title">📅 Daily Movement</div>
                <div class="ov-value"><span class="{delta_class}">{delta_sign}{fmt_money_plain(abs(daily_change_value), 2)}</span> <span class="ov-currency">KWD</span></div>
                <div class="ov-sub">
                    <span class="{delta_class}">{arrow} {delta_sign}{daily_change_pct:.2f}%</span> vs yesterday
                </div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown(f"""
            <div class="ov-card">
                <div class="ov-title">📅 Daily Movement</div>
                <div class="ov-value">N/A</div>
                <div class="ov-sub">Need 2+ snapshots</div>
            </div>
            """, unsafe_allow_html=True)

    # Second row: Realized & Unrealized Profit
    st.write("")  # Spacer
    col_r1, col_r2, col_r3 = st.columns(3)
    
    with col_r1:
        realized_class = "ov-delta-pos" if realized_profit_kwd >= 0 else "ov-delta-neg"
        realized_sign = "+" if realized_profit_kwd >= 0 else ""
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">💵 Realized Profit</div>
            <div class="ov-value"><span class="{realized_class}">{realized_sign}{fmt_money_plain(realized_profit_kwd, 2)}</span> <span class="ov-currency">KWD</span></div>
            <div class="ov-sub">From closed positions</div>
        </div>
        """, unsafe_allow_html=True)
    
    with col_r2:
        unrealized_class = "ov-delta-pos" if unrealized_profit_kwd >= 0 else "ov-delta-neg"
        unrealized_sign = "+" if unrealized_profit_kwd >= 0 else ""
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">📊 Unrealized Profit</div>
            <div class="ov-value"><span class="{unrealized_class}">{unrealized_sign}{fmt_money_plain(unrealized_profit_kwd, 2)}</span> <span class="ov-currency">KWD</span></div>
            <div class="ov-sub">Current holdings</div>
        </div>
        """, unsafe_allow_html=True)
    
    with col_r3:
        total_profit = realized_profit_kwd + unrealized_profit_kwd + total_dividends_kwd
        total_class = "ov-delta-pos" if total_profit >= 0 else "ov-delta-neg"
        total_sign = "+" if total_profit >= 0 else ""
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">🏆 Total Profit (incl. Dividends)</div>
            <div class="ov-value"><span class="{total_class}">{total_sign}{fmt_money_plain(total_profit, 2)}</span> <span class="ov-currency">KWD</span></div>
            <div class="ov-sub">Dividends: {fmt_money_plain(total_dividends_kwd, 2)} KWD</div>
        </div>
        """, unsafe_allow_html=True)

    st.divider()

    st.subheader("⚡ Risk Adjusted Performance")
    
    r_col1, r_col2, r_col3, r_col4 = st.columns(4)
    
    with r_col1:
        if sharpe_ratio is not None:
            sr_val = sharpe_ratio
            if sr_val > 1.0:
                sr_color = "#10b981" # Green
            elif sr_val >= 0.0:
                sr_color = "#f59e0b" # Orange
            else:
                sr_color = "#ef4444" # Red
            
            st.markdown(f"""
            <div class="ov-card">
                <div class="ov-title">Sharpe Ratio</div>
                <div class="ov-value" style="color: {sr_color};">{sr_val:.2f}</div>
                <div class="ov-sub">Risk-Free (CBK): {rf_rate*100:.2f}%</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown(f"""
            <div class="ov-card">
                <div class="ov-title">Sharpe Ratio</div>
                <div class="ov-value">N/A</div>
                <div class="ov-sub">Need more data</div>
            </div>
            """, unsafe_allow_html=True)
    
    with r_col2:
        if sortino_ratio is not None:
            so_val = sortino_ratio
            if so_val > 2.0:
                so_color = "#10b981" # Green (Excellent)
            elif so_val >= 1.0:
                so_color = "#0ea5e9" # Blue (Good)
            else:
                so_color = "#f97316" # Orange (Risky)
            
            st.markdown(f"""
            <div class="ov-card">
                <div class="ov-title">Sortino Ratio</div>
                <div class="ov-value" style="color: {so_color};">{so_val:.2f}</div>
                <div class="ov-sub">Risk-Free (CBK): {rf_rate*100:.2f}%</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown(f"""
            <div class="ov-card">
                <div class="ov-title">Sortino Ratio</div>
                <div class="ov-value">N/A</div>
                <div class="ov-sub">Need more data</div>
            </div>
            """, unsafe_allow_html=True)


    st.divider()
    
    # Advanced Performance Metrics
    st.subheader("📈 Performance Metrics")
    
    # Prepare data for calculations
    user_id = st.session_state.get('user_id', 1)
    try:
        portfolio_history = query_df(
            "SELECT snapshot_date as date, portfolio_value as balance, accumulated_cash FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date",
            (user_id,)
        )
    except Exception:
        portfolio_history = pd.DataFrame(columns=['date', 'balance', 'accumulated_cash'])
    
    # Collect ALL cash flows (deposits + dividends) with their timing
    # FOR MWRR: Use CORRECT data sources per user specification
    
    # 1. CASH DEPOSITS from cash_deposits table (MY OWN MONEY = NEGATIVE)
    # Exclude 1970 dates and zero amounts
    try:
        cash_deposits_for_mwrr = query_df(
            """
            SELECT deposit_date as date, 
                   amount, 
                   'DEPOSIT' as type 
            FROM cash_deposits 
            WHERE deposit_date IS NOT NULL
            AND amount > 0
            AND deposit_date > '1971-01-01'
            AND user_id = ?
            """,
            (user_id,)
        )
    except Exception:
        cash_deposits_for_mwrr = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # 2. NON-REINVESTED DIVIDENDS ONLY (CASH PAID OUT = POSITIVE)
    # Exclude reinvested dividends from IRR calculation
    try:
        cash_dividends_only = query_df(
            """
            SELECT txn_date as date, 
                   COALESCE(cash_dividend, 0) as amount, 
                   'DIVIDEND' as type 
            FROM transactions 
            WHERE COALESCE(cash_dividend, 0) > 0
            AND txn_date IS NOT NULL
            AND txn_date > '1971-01-01'
            AND user_id = ?
            """,
            (user_id,)
        )
    except Exception:
        cash_dividends_only = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # FOR TWR: Still use cash_deposits with include_in_analysis flag
    user_id = st.session_state.get('user_id', 1)
    try:
        deposits_for_twr = query_df(
            "SELECT deposit_date as date, amount, 'DEPOSIT' as type FROM cash_deposits WHERE include_in_analysis = 1 AND user_id = ?",
            (user_id,)
        )
    except Exception:
        deposits_for_twr = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # For TWR: Include BOTH cash and reinvested dividends (all returns)
    try:
        all_dividends = query_df(
            """
            SELECT txn_date as date, 
                   COALESCE(cash_dividend, 0) + COALESCE(reinvested_dividend, 0) as amount, 
                   'DIVIDEND' as type 
            FROM transactions 
            WHERE (COALESCE(cash_dividend, 0) + COALESCE(reinvested_dividend, 0)) > 0
            AND user_id = ?
            """,
            (user_id,)
        )
    except Exception:
        all_dividends = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # Withdrawals (Explicit Withdrawals Only - NOT Sells)
    # Using the new General Ledger 'Withdrawal' type
    try:
        withdrawals = query_df(
            """
            SELECT txn_date as date,
                   sell_value as amount,
                   'WITHDRAWAL' as type
            FROM transactions
            WHERE (txn_type = 'Withdrawal' OR category = 'FLOW_OUT')
            AND user_id = ?
            """,
            (user_id,)
        )
    except Exception:
        withdrawals = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # NEW: Additional Deposits from General Ledger (Type = Deposit)
    # Merging with legacy cash_deposits
    try:
        ledger_deposits = query_df(
            """
            SELECT txn_date as date,
                   purchase_cost as amount,
                   'DEPOSIT' as type
            FROM transactions
            WHERE (txn_type = 'Deposit' OR category = 'FLOW_IN')
            AND user_id = ?
            """,
            (user_id,)
        )
    except Exception:
        ledger_deposits = pd.DataFrame(columns=['date', 'amount', 'type'])

    # Cash flows for MWRR (Legacy Cash Deposits + New Ledger Deposits + Dividends + Withdrawals)
    # NOTE: Reinvested dividends are EXCLUDED (they stay in portfolio value)
    mwrr_components = []
    if not cash_deposits_for_mwrr.empty:
        mwrr_components.append(cash_deposits_for_mwrr)
    if not ledger_deposits.empty:
        mwrr_components.append(ledger_deposits)
    if not cash_dividends_only.empty:
        mwrr_components.append(cash_dividends_only)
    if not withdrawals.empty:
        mwrr_components.append(withdrawals)
    
    if mwrr_components:
        cash_flows_mwrr = pd.concat(mwrr_components, ignore_index=True).sort_values('date')
    else:
        cash_flows_mwrr = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # Cash flows for TWR
    twr_components = []
    if not deposits_for_twr.empty:
        twr_components.append(deposits_for_twr)
    if not ledger_deposits.empty:
        twr_components.append(ledger_deposits)
    if not all_dividends.empty:
        twr_components.append(all_dividends)
    if not withdrawals.empty:
        twr_components.append(withdrawals)
    
    if twr_components:
        cash_flows_twr = pd.concat(twr_components, ignore_index=True).sort_values('date')
    else:
        cash_flows_twr = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # Calculate metrics
    calc = PortfolioCalculator()
    
    # Get inception date and current value for CAGR
    if not portfolio_history.empty:
        # Start date: First snapshot date
        inception_date = pd.to_datetime(portfolio_history.iloc[0]['date']).date()
        
        # End date: Last snapshot date
        current_date = pd.to_datetime(portfolio_history.iloc[-1]['date']).date()
        
        # Starting value: ONLY the initial investment (first accumulated_cash)
        # This excludes subsequent deposits from the growth calculation
        initial_investment = portfolio_history.iloc[0]['accumulated_cash']
        if pd.isna(initial_investment) or initial_investment <= 0:
            initial_investment = portfolio_history.iloc[0]['balance']
        
        # Ending value: Current portfolio value
        current_portfolio_value = portfolio_history.iloc[-1]['balance']
        
        # Total invested (for reference)
        total_invested = portfolio_history.iloc[-1]['accumulated_cash']
        if pd.isna(total_invested):
            total_invested = initial_investment
            
        # Calculate precise time period
        days_elapsed = (current_date - inception_date).days
        years_elapsed = days_elapsed / 365.25
        
    else:
        inception_date = date.today()
        current_date = date.today()
        current_portfolio_value = 0
        total_invested = 0
        initial_investment = 0
        years_elapsed = 0
    
    # Calculate TWR (uses all dividends - cash + reinvested)
    twr = calc.calculate_twr(portfolio_history, cash_flows_twr)
    
    # Calculate MWRR (uses only cash dividends - reinvested are not cash flows)
    # Debug: log key values
    _mwrr_debug = {
        'cash_flows_mwrr_count': len(cash_flows_mwrr),
        'current_portfolio_value': current_portfolio_value,
        'inception_date': str(inception_date),
        'user_id': user_id
    }
    mwrr = calc.calculate_mwrr(cash_flows_mwrr, current_portfolio_value, inception_date)
    
    # Calculate CAGR using ONLY initial investment (excludes impact of additional deposits)
    # Formula: (V_end / V_start)^(1/years) - 1
    # V_start = initial_investment (first deposit only)
    # V_end = current_portfolio_value
    if initial_investment > 0 and years_elapsed > 0:
        cagr = ((current_portfolio_value / initial_investment) ** (1 / years_elapsed)) - 1
    else:
        cagr = None
    
    # Display metric cards
    col1, col2, col3 = st.columns(3)
    
    with col1:
        if twr is not None:
            twr_pct = twr * 100
            delta_color = "normal" if twr >= 0 else "inverse"
            st.metric(
                "⏱️ Time-Weighted Return (TWR)",
                f"{twr_pct:.2f}%",
                delta=f"{'↑' if twr >= 0 else '↓'} Since Inception",
                delta_color=delta_color
            )
            st.caption("Eliminates impact of cash flows")
        else:
            st.metric("⏱️ Time-Weighted Return (TWR)", "N/A")
            st.caption("Insufficient data")
    
    with col2:
        if mwrr is not None:
            mwrr_pct = mwrr * 100
            delta_color = "normal" if mwrr >= 0 else "inverse"
            st.metric(
                "💵 Money-Weighted Return (IRR)",
                f"{mwrr_pct:.2f}%",
                delta=f"{'↑' if mwrr >= 0 else '↓'} Since Inception",
                delta_color=delta_color,
                help="Accounts for timing and size of your cash contributions"
            )
            st.caption("Based on actual cash deposits & dividends")
        else:
            st.metric("💵 Money-Weighted Return (IRR)", "N/A")
            # Diagnostic message with debug info
            if cash_flows_mwrr.empty:
                st.caption(f"⚠️ No cash deposits found for user_id={user_id}")
            elif current_portfolio_value <= 0:
                st.caption(f"⚠️ No current portfolio value (history rows: {len(portfolio_history)})")
            else:
                st.caption(f"⚠️ Calculation failed (cf:{len(cash_flows_mwrr)}, val:{current_portfolio_value:.0f})")
    
    with col3:
        if cagr is not None:
            cagr_pct = cagr * 100
            delta_color = "normal" if cagr >= 0 else "inverse"
            st.metric(
                "📊 CAGR",
                f"{cagr_pct:.2f}%",
                delta=f"{'↑' if cagr >= 0 else '↓'} Annualized",
                delta_color=delta_color
            )
            days = (current_date - inception_date).days
            years_display = days / 365.25
            st.caption(f"{years_display:.2f} years ({days} days)")
        else:
            st.metric("📊 CAGR", "N/A")
            st.caption("Insufficient data")

    # DEBUG: Show MWRR calculation details (can remove later)
    with st.expander("🔧 MWRR Debug Info", expanded=False):
        st.write(f"**User ID:** {user_id}")
        st.write(f"**Portfolio History Rows:** {len(portfolio_history)}")
        st.write(f"**Cash Flows for MWRR:** {len(cash_flows_mwrr)}")
        st.write(f"**Current Portfolio Value:** {current_portfolio_value:.2f}")
        st.write(f"**Inception Date:** {inception_date}")
        st.write(f"**MWRR Result:** {mwrr}")
        if not cash_flows_mwrr.empty:
            st.write("**Cash Flow Sample (first 5):**")
            st.dataframe(cash_flows_mwrr.head(5))

    st.divider()
    st.subheader("📉 Valuation Drift")

    # --- Calculate Portfolio P/E ---
    # 1. Gather all holdings
    all_holdings = []
    for port_name in PORTFOLIO_CCY.keys():
        df_port = build_portfolio_table(port_name)
        if not df_port.empty and "Symbol" in df_port.columns:
            # We need Symbol, Currency, Market Value (for weighting)
            # Convert Market Value to KWD for consistent weighting
            for _, row in df_port.iterrows():
                mv_kwd = convert_to_kwd(row['Market Value'], row['Currency'])
                all_holdings.append({
                    "Symbol": row['Symbol'],
                    "Currency": row['Currency'],
                    "Market Value KWD": mv_kwd
                })
    
    portfolio_pe_display = "N/A"
    portfolio_earnings_yield_display = "N/A"
    
    if all_holdings:
        holdings_df = pd.DataFrame(all_holdings)
        
        # Fetch P/E Ratios
        # We need unique symbols
        unique_items = list(set(zip(holdings_df["Symbol"], holdings_df["Currency"])))
        pe_map = get_pe_ratios(unique_items)
        
        holdings_df["PE"] = holdings_df["Symbol"].map(pe_map)
        
        # Filter Valid Holdings: Keep only stocks with pe > 0
        # Convert PE to numeric first
        holdings_df["PE"] = pd.to_numeric(holdings_df["PE"], errors='coerce')
        valid_holdings = holdings_df[holdings_df["PE"] > 0].copy()
        
        if not valid_holdings.empty:
            # Re-normalize Weights
            total_valid_weight = valid_holdings["Market Value KWD"].sum()
            
            if total_valid_weight > 0:
                valid_holdings["adjusted_weight"] = valid_holdings["Market Value KWD"] / total_valid_weight
                
                # Compute Earnings Yield for Each Valid Holding
                valid_holdings["earnings_yield"] = 1 / valid_holdings["PE"]
                
                # Calculate Portfolio Earnings Yield
                portfolio_earnings_yield = (valid_holdings["adjusted_weight"] * valid_holdings["earnings_yield"]).sum()
                
                # Derive Portfolio P/E
                if portfolio_earnings_yield > 0:
                    portfolio_pe = 1 / portfolio_earnings_yield
                    portfolio_pe_display = f"{portfolio_pe:.2f}"
                    portfolio_earnings_yield_display = f"{portfolio_earnings_yield:.2%}"

    # Calculate Cash Yield Dividend
    cash_yield_dividend_display = "N/A"
    if total_deposits_kwd > 0:
        cash_yield_val = total_dividends_kwd / total_deposits_kwd
        cash_yield_dividend_display = f"{cash_yield_val:.2%}"

    # Render Card
    col_val1, col_val2, col_val3, col_val4 = st.columns(4)
    with col_val1:
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">Portfolio P/E</div>
            <div class="ov-value">{portfolio_pe_display}</div>
            <div class="ov-sub">Yield: {portfolio_earnings_yield_display}</div>
        </div>
        """, unsafe_allow_html=True)
        
    with col_val2:
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">Cash Yield Dividend</div>
            <div class="ov-value">{cash_yield_dividend_display}</div>
            <div class="ov-sub">Divs / Deposits</div>
        </div>
        """, unsafe_allow_html=True)


# =========================
# PEER ANALYSIS HELPERS
# =========================

@st.cache_data(ttl=3600*12)  # Cache for 12 hours
def fetch_single_peer_data(ticker):
    """Fetch extensive data for a single ticker to optimize performance."""
    if not YFINANCE_AVAILABLE:
        return {"error": "yfinance not loaded"}
        
    try:
        t = yf.Ticker(ticker)
        info = t.info
        
        # Fetch history for total return calcs (10y to be safe)
        # Use 'max' or '10y'
        hist = t.history(period="10y")
        
        data = {
            "info": info,
            "history": hist,
            "financials": t.financials,
            "balance_sheet": t.balance_sheet
        }
        return data
    except Exception as e:
        return {"error": str(e)}

def calculate_peer_metrics(hist, info, financials):
    """
    Calculate advanced metrics:
    - calc_ret_*: Time-period returns (1Mo, 3Mo, 1Y...)
    - calc_cagr_*: Revenue/NetIncome/EPS CAGRs (3Y)
    - calc_net_debt, calc_capex
    """
    metrics = {}
    
    # --- 1. Historical Returns ---
    if not hist.empty:
        current_price = info.get("regularMarketPrice") or info.get("currentPrice")
        if not current_price:
            current_price = hist["Close"].iloc[-1]
            
        def get_ret(days_ago):
            target_date = pd.Timestamp.now(tz=hist.index.tz) - pd.Timedelta(days=days_ago)
            # Find closest date before target
            try:
                idx = hist.index.get_indexer([target_date], method='nearest')[0]
                if idx < 0 or idx >= len(hist):
                    # If target is too far back (beyond start of data), and we asked for < 5 years, invalid.
                    # If > 5 years, maybe use start price. 
                    if days_ago > 365*5 and len(hist) > 0:
                         past_price = hist["Close"].iloc[0] 
                    else:
                        return None
                else:
                    past_price = hist["Close"].iloc[idx]
                
                if past_price and past_price > 0:
                    return (current_price - past_price) / past_price
            except Exception:
                return None
            return None

        # YTD
        try:
            current_year = pd.Timestamp.now().year
            ytd_start = pd.Timestamp(f"{current_year-1}-12-31").tz_localize(hist.index.tz)
            if ytd_start >= hist.index[0]:
                ytd_idx = hist.index.get_indexer([ytd_start], method='bfill')[0]
                if ytd_idx >= 0 and ytd_idx < len(hist):
                     ytd_price = hist["Close"].iloc[ytd_idx]
                     metrics["calc_ret_ytd"] = (current_price - ytd_price) / ytd_price
        except Exception:
            pass

        metrics["calc_ret_1mo"] = get_ret(30)
        metrics["calc_ret_3mo"] = get_ret(90)
        metrics["calc_ret_6mo"] = get_ret(180)
        metrics["calc_ret_9mo"] = get_ret(270)
        metrics["calc_ret_1y"] = get_ret(365)
        metrics["calc_ret_3y"] = get_ret(365*3)
        metrics["calc_ret_5y"] = get_ret(365*5)
        metrics["calc_ret_10y"] = get_ret(365*10)

    # --- 2. Advanced Calcs (CAGR, Debt, Capex) ---
    
    # Net Debt
    try:
        total_debt = info.get("totalDebt")
        total_cash = info.get("totalCash")
        if total_debt is not None and total_cash is not None:
             metrics["calc_net_debt"] = total_debt - total_cash
    except:
        pass

    # CapEx = Operating Cash Flow - Free Cash Flow (Approx)
    try:
        ocf = info.get("operatingCashflow")
        fcf = info.get("freeCashflow")
        if ocf is not None and fcf is not None:
             metrics["calc_capex"] = ocf - fcf
    except:
        pass
        
    # CAGRs (3 Year) from Financials
    # Financials columns are dates. 0 is TTM/CurrentYear, 1 is LastYear, etc.
    # We will try to grab column 0 and column 3 (3 years ago). 
    if financials is not None and not financials.empty and len(financials.columns) >= 4:
         def calc_cagr(row_name):
             try:
                 row_name_key = row_name
                 # Sometimes keys differ slightly in strict strings
                 if row_name_key not in financials.index:
                     # Try lenient matching or predefined keys
                     pass
                     
                 if row_name_key in financials.index:
                     start_val = financials.loc[row_name_key].iloc[3] # 3 years ago
                     end_val = financials.loc[row_name_key].iloc[0]   # Current
                     if start_val and end_val and start_val > 0 and end_val > 0:
                         return (end_val / start_val)**(1/3) - 1
             except:
                 return None
             return None
         
         metrics["calc_cagr_revenue_3y"] = calc_cagr("Total Revenue")
         metrics["calc_cagr_netincome_3y"] = calc_cagr("Net Income")
         metrics["calc_cagr_eps_3y"] = calc_cagr("Basic EPS")

    return metrics

# =========================
# UI - HELPERS
# =========================
def render_styled_table(df: pd.DataFrame, highlight_logic: bool = True) -> None:
    """
    Unified renderer for DataFrames with Tailwind-like CSS.
    Safe against XSS, optimized for speed, and robust column handling.
    
    Args:
        df: DataFrame to render as a styled HTML table.
        highlight_logic: If True, applies smart coloring based on column names and values.
                        Status column: Realized → muted, Unrealized → accent
                        Stock column: accent
                        Profit/Change/Gain/Yield/% columns: positive → green, negative → red
                        Current Price/Sale Price == 0: display "-" with muted color
    
    Returns:
        None. Renders the table directly via st.markdown.
    """
    if df is None or df.empty:
        st.info("No data to display.")
        return

    is_dark = st.session_state.get("theme", "light") == "dark"

    # Theme configuration (compact)
    c_bg_card = "rgba(17, 24, 39, 0.6)" if is_dark else "rgba(255, 255, 255, 0.8)"
    c_border = "#1f2937" if is_dark else "#e5e7eb"
    c_header_bg = "rgba(31, 41, 55, 0.5)" if is_dark else "#f9fafb"
    c_text_p = "#ffffff" if is_dark else "#111827"
    c_hover = "rgba(31, 41, 55, 0.3)" if is_dark else "rgba(243, 244, 246, 0.8)"
    c_pos = "#34d399" if is_dark else "#16a34a"
    c_neg = "#fb7185" if is_dark else "#dc2626"
    c_accent = "#22d3ee" if is_dark else "#2563eb"
    c_muted = "rgba(156, 163, 175, 0.6)"

    css = f"""
    <style>
    .univ-table-wrap {{
        background-color: {c_bg_card};
        border: 1px solid {c_border};
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 1rem;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        font-family: ui-sans-serif, system-ui, sans-serif;
    }}
    .univ-table-scroll {{ overflow-x: auto; }}
    .univ-table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
    .univ-table th {{
        text-align: left; padding: 12px 16px; background: {c_header_bg};
        color: {c_text_p}; font-weight: 600; border-bottom: 1px solid {c_border};
        white-space: nowrap;
    }}
    .univ-table td {{
        padding: 10px 16px; color: {c_text_p}; border-bottom: 1px solid {c_border};
        white-space: nowrap;
    }}
    .univ-table tr:hover td {{ background-color: {c_hover}; }}
    .t-pos {{ color: {c_pos} !important; font-weight: 600; }}
    .t-neg {{ color: {c_neg} !important; font-weight: 600; }}
    .t-accent {{ color: {c_accent} !important; font-weight: 500; }}
    .t-muted {{ color: {c_muted} !important; }}
    </style>
    """

    # Build HTML list
    html_out = [
        '<div class="univ-table-wrap"><div class="univ-table-scroll">',
        '<table class="univ-table"><thead><tr>',
    ]

    for col in df.columns:
        html_out.append(f"<th>{html.escape(str(col))}</th>")
    html_out.append("</tr></thead><tbody>")

    # Use index=False for speed, but access by integer index to avoid attribute naming issues
    for row in df.itertuples(index=False):
        html_out.append("<tr>")
        for col_idx, col_name in enumerate(df.columns):
            # Access tuple by index: Faster and safer than getattr logic
            val = row[col_idx]
            
            cls = ""
            display_val = val

            # Treat NaN/None as empty string
            if pd.isna(display_val):
                display_val = ""

            # Special case for price fields being 0
            if col_name in ("Current Price", "Sale Price") and (display_val == 0 or display_val == 0.0):
                display_val = "-"
                cls = "t-muted"

            if highlight_logic and display_val != "-":
                sval = str(display_val)

                if col_name == "Status":
                    if sval == "Realized":
                        cls = "t-muted"
                    elif sval == "Unrealized":
                        cls = "t-accent"

                elif col_name == "Stock":
                    cls = "t-accent"

                elif any(k in str(col_name) for k in ["Profit", "%", "Change", "Gain", "Yield"]):
                    try:
                        clean_val = float(
                            sval.replace("%", "").replace(",", "").replace("x", "")
                        )
                        if clean_val > 0:
                            cls = "t-pos"
                        elif clean_val < 0:
                            cls = "t-neg"
                        else:
                            cls = "t-muted"
                    except (ValueError, TypeError):
                        pass

            html_out.append(
                f'<td class="{cls}">{html.escape(str(display_val))}</td>'
            )
        html_out.append("</tr>")

    html_out.append("</tbody></table></div></div>")

    st.markdown(css + "".join(html_out), unsafe_allow_html=True)


# =========================
# UI - PEER ANALYSIS
# =========================
def ui_peer_analysis():
    st.subheader("📊 Peer Analysis")
    st.caption("Compare multiple stocks side-by-side using Yahoo Finance data.")

    if 'peer_tickers' not in st.session_state:
        st.session_state.peer_tickers = []

    # Input Section
    with st.expander("➕ Add Stocks to Compare", expanded=True):
        col1, col2 = st.columns([3, 1])
        with col1:
            # Option 1: Kuwait List
            kuwait_options = get_kuwait_stock_options()
            selected_kuwait = st.selectbox(
                "Select from Kuwait Stock List",
                options=kuwait_options,
                key="peer_select_kuwait"
            )
            
            # Option 2: Manual YF Ticker (for non-Kuwait stocks)
            manual_ticker = st.text_input("Or enter generic Yahoo Finance Ticker (e.g. AAPL, TSLA)", key="peer_manual_input")

        with col2:
            st.write("") # Spacing
            st.write("") 
            if st.button("Add to List", type="primary", key="add_peer_btn"):
                ticker_to_add = None
                
                # Prioritize manual input if provided
                if manual_ticker.strip():
                    ticker_to_add = manual_ticker.strip().upper()
                elif selected_kuwait and selected_kuwait != "-- Select from Kuwait Stock List --":
                    _, _, yf_ticker = parse_kuwait_stock_selection(selected_kuwait)
                    if yf_ticker:
                        ticker_to_add = yf_ticker
                    else:
                        ticker_to_add = selected_kuwait.split(" - ")[0] # Fallback
                
                if ticker_to_add:
                    if ticker_to_add not in st.session_state.peer_tickers:
                        st.session_state.peer_tickers.append(ticker_to_add)
                        st.success(f"Added {ticker_to_add}")
                        st.rerun()
                    else:
                        st.warning("Ticker already in list.")
                else:
                    st.error("Please select a stock or enter a ticker.")

    st.divider()

    # Display & Manage List
    if st.session_state.peer_tickers:
        col_list, col_clear = st.columns([4, 1])
        with col_list:
            st.write(f"**Selected Peers ({len(st.session_state.peer_tickers):,})**: " + ", ".join(st.session_state.peer_tickers))
        
        with col_clear:
            if st.button("🗑️ Clear All", key="clear_all_peers", type="secondary"):
                st.session_state.peer_tickers = []
                st.rerun()
        
        with st.expander("Manage List", expanded=False):
             cols = st.columns(5)
             for i, tick in enumerate(st.session_state.peer_tickers):
                 col_idx = i % 5
                 with cols[col_idx]:
                     if st.button(f"🗑️ {tick}", key=f"rm_peer_{tick}_{i}"):
                         st.session_state.peer_tickers.remove(tick)
                         st.rerun()
        
        st.markdown("---")
        
        # ----------------------------------------------------
        # FETCH DATA & RENDER TABLES (New Implementation)
        # ----------------------------------------------------
        if st.button("🚀 Fetch Data & Run Analysis", type="primary", use_container_width=True):
            if not YFINANCE_AVAILABLE:
                st.error("Yahoo Finance library not available.")
                return

            # Main Progress bar for UX
            prog_bar = st.progress(0, text="Initializing...")
            
            # Dictionary to store fetched data: {ticker: {info:..., calc_returns: ...}}
            fetched_data = {}
            
            # 1. Fetch Loop
            for i, ticker in enumerate(st.session_state.peer_tickers):
                prog_bar.progress((i / len(st.session_state.peer_tickers)), text=f"Fetching data for {ticker}...")
                
                # Fetch Raw Data
                raw_data = fetch_single_peer_data(ticker)
                
                if "error" not in raw_data:
                    # Calculate Stats including new CAGRs etc.
                    metrics_calc = calculate_peer_metrics(
                        raw_data["history"], 
                        raw_data["info"], 
                        raw_data["financials"]
                    )
                    
                    fetched_data[ticker] = {
                        "info": raw_data["info"],
                        "calculated": metrics_calc,
                        "financials": raw_data["financials"],
                        "balance_sheet": raw_data["balance_sheet"]
                    }
                else:
                    st.warning(f"Failed to fetch {ticker}: {raw_data['error']}")
            
            prog_bar.empty()
            
            if not fetched_data:
                st.error("No data fetched.")
                return

            # Helper for formatting
            def fmt_val(val, metric_label, key_type):
                if val is None or (isinstance(val, float) and pd.isna(val)):
                    return "-"
                
                # Identify formatting needs based on label Keywords or prefixes
                label_lower = metric_label.lower()
                key_type_lower = key_type.lower()
                
                # 0. Date Conversion (Unix Timestamp -> String)
                # Check if "date" is in label and value is a large number (likely timestamp)
                if "date" in label_lower or "date" in key_type_lower:
                    if isinstance(val, (int, float)) and val > 1_000_000_000:
                         try:
                             return datetime.fromtimestamp(val).strftime('%Y-%m-%d')
                         except:
                             pass
                
                # Force string if not number
                if not isinstance(val, (int, float)):
                    return str(val)

                # 1. Percentages
                # Keywords: Yield, Margin, Growth, CAGR, Ratio (sometimes), Return, ROE, ROA, Perf
                # Also if key_type implies calculation which is likely % like calc_ret_
                if any(x in label_lower for x in ["yield", "margin", "growth", "cagr", "roe", "roa", "return", "perf"]):
                    # SPECIAL CASE: 5 Year Avg Dividend Yield from Yahoo is typically already a percentage (e.g. 1.41 not 0.0141)
                    # We need to detect if the value is > 0.5 (likely a whole number %) or < 0.5 (likely a decimal)
                    # But this is risky. Let's look at specific keys.
                    
                    is_dividend_yield = "yield" in label_lower or "yield" in key_type_lower
                    
                    # If it's a dividend yield and value is > 0.5, assume it's already multiplied by 100.
                    # E.g. Yahoo returns 'fiveYearAvgDividendYield': 1.86 (which means 1.86%)
                    # while 'dividendYield': 0.014 (which means 1.4%)
                    if is_dividend_yield and abs(val) > 0.30: 
                         # Likely already a percentage number (e.g. 1.86)
                         return f"{val:.2f}%"
                    
                    # Use Python's built-in percentage formatting (handles x100 automatically)
                    return f"{val:.2%}"
                    
                # 2. Multiples (x)
                if any(x in label_lower for x in ["p/e", "ev/", "price/", "peg", "beta", "ratio"]):
                    return f"{val:.2f}x"
                
                # 3. Large Numbers (Millions/Billions)
                # Revenue, Income, Cash, Debt, CapEx, Value, Limit
                if any(x in label_lower for x in ["total", "revenue", "profit", "income", "ebitda", "cash", "debt", "capex", "value", "equity"]):
                    if abs(val) >= 1e9: return f"{val/1e9:.2f}B"
                    if abs(val) >= 1e6: return f"{val/1e6:.2f}M"
                    return f"{val:,.0f}"
                
                return f"{val:,.2f}"

            # 2. Render 8 Tables
            for section_name, metrics_map in PEER_METRICS.items():
                st.subheader(section_name)
                
                # Build Data Frame: Index=Metrics, Cols=Tickers
                section_data = {}
                
                for metric_label, metric_key in metrics_map.items():
                    row_values = []
                    for ticker in st.session_state.peer_tickers:
                        if ticker not in fetched_data:
                            row_values.append("-")
                            continue
                            
                        t_data = fetched_data[ticker]
                        val = None
                        
                        # --- DISPATCH LOGIC ---
                        # Type A: info_
                        if metric_key.startswith("info_"):
                            key = metric_key.replace("info_", "")
                            val = t_data["info"].get(key)
                        
                        # Type B: calc_
                        elif metric_key.startswith("calc_"):
                            val = t_data["calculated"].get(metric_key)
                            
                        # Type C: sheet_ (Financials/Balance Sheet typically)
                        elif metric_key.startswith("sheet_"):
                            # Look in both financials and balance_sheet?
                            # Usually explicit but we will try both recent columns
                            key = metric_key.replace("sheet_", "")
                            
                            # Helper to find row
                            found = False
                            for sheet in [t_data["financials"], t_data["balance_sheet"]]:
                                if sheet is not None and not sheet.empty:
                                    # Try exact match
                                    if key in sheet.index:
                                        val = sheet.loc[key].iloc[0] # Most recent
                                        found = True
                                        break
                                    # Try Case Insensitive
                                    else:
                                         matches = [idx for idx in sheet.index if idx.lower() == key.lower()]
                                         if matches:
                                             val = sheet.loc[matches[0]].iloc[0]
                                             found = True
                                             break

                            if not found:
                                val = None

                        # Format
                        row_values.append(fmt_val(val, metric_label, metric_key))
                    
                    section_data[metric_label] = row_values
                
                # Convert to DF
                df_table = pd.DataFrame(section_data).T 
                df_table.columns = st.session_state.peer_tickers
                
                # Render with custom styled UI
                render_styled_table(df_table)
                # st.dataframe(df_table, use_container_width=True) # Replaced

    else:
        st.info("Add stocks above to begin comparison.")


# =========================
# MAIN
# =========================
def send_otp_email(to_email: str, otp: str):
    """
    Send OTP via email using SMTP settings from secrets.toml or environment.
    Falls back to simulated mode (prints to UI) if no SMTP config found.
    """
    # 1. Try to load SMTP config
    smtp_server = st.secrets.get("smtp", {}).get("server")
    smtp_port = st.secrets.get("smtp", {}).get("port", 587)
    smtp_user = st.secrets.get("smtp", {}).get("user")
    smtp_pass = st.secrets.get("smtp", {}).get("password")
    
    email_sent = False
    
    if smtp_server and smtp_user and smtp_pass:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.utils import formataddr
            
            msg = MIMEText(f"Your password reset OTP is: {otp}\n\nThis code expires in 15 minutes.")
            msg['Subject'] = 'Password Reset OTP - KuwaitPortfolio.ai'
            msg['From'] = formataddr(("Portfolio App", smtp_user))
            msg['To'] = to_email
            
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, [to_email], msg.as_string())
            
            email_sent = True
        except Exception as e:
            print(f"SMTP Error: {e}")
            email_sent = False
            
    # 2. Fallback / Simulation
    if not email_sent:
        # In production, do NOT show this. For local dev/demo:
        st.toast(f"🔑 SIMULATION MODE: OTP for {to_email} is {otp}", icon="👀")
        st.info(f"**Dev Mode**: OTP sent to {to_email}: `{otp}` (Configure SMTP in secrets.toml to send real emails)")
    else:
        st.success(f"OTP sent to {to_email}")

def login_page(cookie_manager=None):
    st.markdown("""
    <style>
    .main { align-items: center; justify-content: center; display: flex; }
    .auth-container { max-width: 400px; padding: 2rem; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
    </style>
    """, unsafe_allow_html=True)
    
    st.title("🔐 Portfolio Access")
    
    if "auth_mode" not in st.session_state:
        st.session_state.auth_mode = "login" # login, register, forgot_pass
        
    # --- NAVIGATION TABS/MODES ---
    # We use custom navigation to handle "Forgot Password" cleanly
    if st.session_state.auth_mode == "forgot_pass":
        st.subheader("🔄 Reset Password")
        if st.button("← Back to Login"):
            st.session_state.auth_mode = "login"
            st.rerun()
            
        with st.form("reset_request_form"):
            email_reset = st.text_input("Enter your registered email")
            btn_reset = st.form_submit_button("Send OTP")
            
            if btn_reset:
                conn = get_conn()
                res = conn.execute("SELECT id FROM users WHERE email=? OR username=?", (email_reset, email_reset)).fetchone()
                conn.close()
                if res:
                    # Generate OTP
                    import random
                    otp_code = str(random.randint(100000, 999999))
                    exp_time = int(time.time()) + 900 # 15 mins
                    
                    conn = get_conn()
                    # Clean old OTPs
                    conn.execute("DELETE FROM password_resets WHERE email=?", (email_reset,))
                    conn.execute("INSERT INTO password_resets (email, otp, expires_at, created_at) VALUES (?, ?, ?, ?)",
                                (email_reset, otp_code, exp_time, int(time.time())))
                    conn.commit()
                    conn.close()
                    
                    send_otp_email(email_reset, otp_code)
                    st.session_state.reset_email = email_reset
                    st.session_state.auth_mode = "verify_otp"
                    st.rerun()
                else:
                    st.error("Email not found.")
                    
    elif st.session_state.auth_mode == "verify_otp":
        st.subheader("🔐 Verify OTP")
        st.caption(f"Enter the code sent to {st.session_state.get('reset_email')}")
        
        with st.form("verify_otp_form"):
            otp_input = st.text_input("OTP Code")
            new_pass_1 = st.text_input("New Password", type="password")
            new_pass_2 = st.text_input("Confirm New Password", type="password")
            btn_verify = st.form_submit_button("Reset Password")
            
            if btn_verify:
                if new_pass_1 != new_pass_2:
                    st.error("Passwords do not match")
                elif len(new_pass_1) < 4:
                    st.error("Password too short")
                else:
                    target_email = st.session_state.get("reset_email")
                    now = int(time.time())
                    
                    conn = get_conn()
                    # Verify OTP
                    row = conn.execute("SELECT otp FROM password_resets WHERE email=? AND expires_at > ?", (target_email, now)).fetchone()
                    
                    if row and row[0] == otp_input:
                        # Success - Update Password
                        new_hash = hash_password(new_pass_1)
                        conn.execute("UPDATE users SET password_hash=? WHERE email=? OR username=?", (new_hash, target_email, target_email))
                        conn.execute("DELETE FROM password_resets WHERE email=?", (target_email,))
                        conn.commit()
                        conn.close()
                        st.session_state.auth_mode = "login"
                        st.session_state._password_reset_success = True
                        # Clear temp state
                        del st.session_state.reset_email
                        st.rerun()
                    else:
                        conn.close()
                        st.error("Invalid or expired OTP")
        
        if st.button("Cancel"):
            st.session_state.auth_mode = "login"
            st.rerun()

    elif st.session_state.auth_mode == "register":
        st.subheader("📝 Register")
        if st.button("← Back to Login"):
            st.session_state.auth_mode = "login"
            st.rerun()

        with st.form("register_form"):
            reg_email_input = st.text_input("Email Address")
            reg_pass = st.text_input("Choose Password", type="password")
            confirm_pass = st.text_input("Confirm Password", type="password")
            
            submit_reg = st.form_submit_button("Register", use_container_width=True)
            
            if submit_reg:
                # Normalize email
                reg_email = reg_email_input.strip().lower()

                if reg_pass != confirm_pass:
                    st.error("Passwords do not match")
                elif len(reg_pass) < 4:
                    st.warning("Password too short")
                elif "@" not in reg_email or "." not in reg_email:
                    st.error("Invalid email format")
                else:
                    try:
                        conn = get_conn()
                        cur = conn.cursor()
                        hashed = hash_password(reg_pass)
                        
                        # Check if email exists
                        db_execute(cur, "SELECT id FROM users WHERE email = ? OR username = ?", (reg_email, reg_email))
                        if cur.fetchone():
                            st.error("User with this email already exists.")
                        else:
                            # Insert with username = email
                            db_execute(cur, "INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)", 
                                       (reg_email, reg_email, hashed, int(time.time())))
                            conn.commit()
                            st.session_state.auth_mode = "login"
                            st.session_state._register_success = True
                            st.rerun()
                    except Exception as e:
                        st.error(f"Registration error: {e}")
                    finally:
                        conn.close()

    else:
        # standard login page (default)
        st.subheader("🔑 Login")
        
        # Show success messages from redirects (registration, password reset)
        if st.session_state.pop('_register_success', False):
            st.success("✅ Registered successfully! Please login.")
        if st.session_state.pop('_password_reset_success', False):
            st.success("✅ Password reset successfully! Please login.")

        # Use st.form to ensure variables are captured correctly on submit
        with st.form("login_form"):
            email_login_input = st.text_input("Email")
            password_login = st.text_input("Password", type="password")
            remember_me = st.checkbox("Remember me for 30 days")
            
            submitted = st.form_submit_button("Login", type="primary", use_container_width=True)

        if submitted:
            email_login = email_login_input.strip().lower()

            conn = get_conn()
            cur = conn.cursor()
            try:
                # Check BOTH email and username columns (case-insensitive)
                db_execute(cur, "SELECT password_hash, username, id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?", (email_login, email_login))
                row = cur.fetchone()

                if row:
                    stored_hash = row[0]
                    db_username = row[1]
                    user_id = row[2]

                    # Handle various encoding issues (SQLite returns str, PostgreSQL may return bytes/memoryview)
                    if stored_hash is None:
                        st.error("❌ Account exists but no password set. Please use 'Forgot Password'.")
                    else:
                        # Normalize hash to string for check_password
                        if isinstance(stored_hash, memoryview):
                            stored_hash = bytes(stored_hash).decode('utf-8')
                        elif isinstance(stored_hash, bytes):
                            stored_hash = stored_hash.decode('utf-8')
                        
                        # Use the check_password helper function
                        if check_password(password_login, stored_hash):
                            # SUCCESS CASE
                            st.session_state.logged_in = True
                            st.session_state.user_id = user_id
                            st.session_state.username = db_username
                            st.session_state._auth_checked = True  # Mark as checked

                            # CREATE PERSISTENT SESSION
                            # If "Remember me" is checked: 30 days
                            # If not checked: 7 days (persists through refreshes for a week)
                            session_days = 30 if remember_me else 7
                            
                            if cookie_manager:
                                try:
                                    # Create a secure session token in DB
                                    token, token_expires = create_session_token(user_id, days=session_days)
                                    expires = datetime.now() + timedelta(days=session_days)
                                    # Store token in cookie
                                    cookie_manager.set("portfolio_session", token, expires_at=expires)
                                except Exception as ce:
                                    print(f"Session Token Error: {ce}")

                            st.rerun()
                        else:
                            st.error("❌ Invalid email or password.")
                else:
                    st.error("❌ Invalid email or password. Please check your credentials or register a new account.")

            except Exception as e:
                st.error(f"Login error: {e}")
            finally:
                conn.close()
        
        col_act1, col_act2 = st.columns([1, 1])
        with col_act2:
            if st.button("Forgot Password?", type="secondary", use_container_width=True):
                st.session_state.auth_mode = "forgot_pass"
                st.rerun()

        st.markdown("---")
        if st.button("Create an Account", type="secondary", use_container_width=True):
            st.session_state.auth_mode = "register"
            st.rerun()
    
    # Show database info at bottom of login page
    st.markdown("---")
    st.caption(f"{get_db_info()}")

# ─────────────────────────────────────────────────────────────────────────────
# Personal Financial Management (PFM) - Income, Expenses, Assets, Liabilities
# ─────────────────────────────────────────────────────────────────────────────

def ui_pfm():
    """Personal Financial Management - Track income, expenses, assets, liabilities with P&L and Balance Sheet reporting."""
    # Persist the current tab selection
    st.session_state.active_main_tab = "Personal Finance"
    
    user_id = st.session_state.get("user_id")
    if not user_id:
        st.warning("Please log in to access Personal Financial Management.")
        return

    # ─────────────────────────────────────────────────────────────────
    # CALLBACK FUNCTIONS for seamless add/delete (avoids explicit rerun)
    # ─────────────────────────────────────────────────────────────────
    def add_income():
        if "pfm_income_items" not in st.session_state:
            st.session_state.pfm_income_items = []
        st.session_state.pfm_income_items.append({"category": "", "monthly": 0.0})
    
    def add_expense():
        if "pfm_expense_items" not in st.session_state:
            st.session_state.pfm_expense_items = []
        st.session_state.pfm_expense_items.append({"category": "", "monthly": 0.0, "is_finance_cost": False, "is_gna": False})
    
    def add_real_estate():
        if "pfm_real_estate" not in st.session_state:
            st.session_state.pfm_real_estate = []
        st.session_state.pfm_real_estate.append({"category": "Residential", "name": "", "qty": 1, "price": 0, "currency": "KWD", "value_kwd": 0})
    
    def add_share():
        if "pfm_shares" not in st.session_state:
            st.session_state.pfm_shares = []
        st.session_state.pfm_shares.append({"ticker": "", "name": "", "qty": 0, "price": 0, "currency": "KWD"})
    
    def add_gold():
        if "pfm_gold" not in st.session_state:
            st.session_state.pfm_gold = []
        st.session_state.pfm_gold.append({"category": "Bars", "name": "", "qty": 0, "price": 0, "currency": "KWD", "value_kwd": 0})
    
    def add_cash():
        if "pfm_cash" not in st.session_state:
            st.session_state.pfm_cash = []
        st.session_state.pfm_cash.append({"category": "Bank Account", "name": "", "amount": 0, "currency": "KWD", "value_kwd": 0})
    
    def add_crypto():
        if "pfm_crypto" not in st.session_state:
            st.session_state.pfm_crypto = []
        st.session_state.pfm_crypto.append({"name": "", "qty": 0, "price": 0, "currency": "USD", "value_kwd": 0})
    
    def add_other():
        if "pfm_other_assets" not in st.session_state:
            st.session_state.pfm_other_assets = []
        st.session_state.pfm_other_assets.append({"category": "Other", "name": "", "value_kwd": 0})
    
    def add_liability():
        if "pfm_liabilities" not in st.session_state:
            st.session_state.pfm_liabilities = []
        st.session_state.pfm_liabilities.append({"category": "Other", "amount_kwd": 0, "is_current": False, "is_long_term": True})

    # Delete callbacks - use session state to track which item to delete
    def delete_item(list_key: str, index: int):
        """Generic delete function for any PFM list."""
        if list_key in st.session_state and 0 <= index < len(st.session_state[list_key]):
            st.session_state[list_key].pop(index)
    st.header("💰 Personal Financial Management")
    st.markdown("Track your complete financial picture: income, expenses, assets, and liabilities. Generate P&L statements, balance sheets, and analyze growth over time.")

    # Sub-tabs for PFM sections
    pfm_tabs = st.tabs(["📝 Data Entry", "📊 P&L Statement", "📋 Balance Sheet", "📈 Ratios & Growth"])

    # ═══════════════════════════════════════════════════════════════════════════
    # TAB 1: DATA ENTRY (Form-based to prevent refresh while typing)
    # ═══════════════════════════════════════════════════════════════════════════
    with pfm_tabs[0]:
        st.subheader("📝 Financial Data Entry")
        
        # --- Configuration outside form (for immediate UI updates) ---
        col_config1, col_config2, col_config3 = st.columns([1, 1, 1])
        with col_config1:
            snapshot_date = st.date_input("Snapshot Date", value=datetime.today(), key="pfm_snapshot_date")
        with col_config2:
            snapshot_notes = st.text_input("Notes", key="pfm_snapshot_notes", placeholder="e.g., Year-end snapshot 2024")
        with col_config3:
            shares_mode = st.radio("Shares Mode", ["Manual Entry", "Auto-Import Portfolio"], horizontal=True, key="pfm_shares_mode")

        # Check for existing snapshot
        conn = get_conn()
        existing_snapshot = None
        try:
            cur = conn.cursor()
            db_execute(cur, """
                SELECT id, notes FROM pfm_snapshots 
                WHERE user_id = ? AND snapshot_date = ?
            """, (user_id, str(snapshot_date)))
            row = cur.fetchone()
            if row:
                existing_snapshot = {"id": row[0], "notes": row[1]}
        except:
            pass
        finally:
            conn.close()

        if existing_snapshot:
            col_info, col_del = st.columns([4, 1])
            with col_info:
                st.info(f"📌 Editing existing snapshot for {snapshot_date}")
            with col_del:
                if st.button("🗑️ Delete Snapshot", type="secondary", key="delete_snapshot"):
                    try:
                        conn = get_conn()
                        cur = conn.cursor()
                        db_execute(cur, "DELETE FROM pfm_income_expense_items WHERE snapshot_id = ?", (existing_snapshot["id"],))
                        db_execute(cur, "DELETE FROM pfm_asset_items WHERE snapshot_id = ?", (existing_snapshot["id"],))
                        db_execute(cur, "DELETE FROM pfm_liability_items WHERE snapshot_id = ?", (existing_snapshot["id"],))
                        db_execute(cur, "DELETE FROM pfm_snapshots WHERE id = ?", (existing_snapshot["id"],))
                        conn.commit()
                        conn.close()
                        for key in list(st.session_state.keys()):
                            if key.startswith("pfm_"):
                                del st.session_state[key]
                        st.success(f"✅ Snapshot deleted!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error: {e}")

        # --- Load existing data or set defaults ---
        default_income = [
            {"Category": "Salary", "Monthly (KWD)": 0.0},
            {"Category": "Rental Income", "Monthly (KWD)": 0.0},
            {"Category": "Dividends", "Monthly (KWD)": 0.0},
            {"Category": "Side Business", "Monthly (KWD)": 0.0},
        ]
        default_expense = [
            {"Category": "Housing/Rent", "Monthly (KWD)": 0.0, "Finance Cost": False, "G&A": False},
            {"Category": "Utilities", "Monthly (KWD)": 0.0, "Finance Cost": False, "G&A": False},
            {"Category": "Food & Groceries", "Monthly (KWD)": 0.0, "Finance Cost": False, "G&A": False},
            {"Category": "Transportation", "Monthly (KWD)": 0.0, "Finance Cost": False, "G&A": False},
            {"Category": "Loan Interest", "Monthly (KWD)": 0.0, "Finance Cost": True, "G&A": False},
        ]
        default_real_estate = [{"Name": "", "Value (KWD)": 0.0}]
        default_shares = [{"Ticker": "", "Name": "", "Qty": 0.0, "Price": 0.0, "Currency": "KWD"}]
        default_gold = [{"Type": "Bars", "Grams": 0.0, "Price/Gram (KWD)": 0.0}]
        default_cash = [{"Account": "", "Amount": 0.0, "Currency": "KWD"}]
        default_crypto = [{"Coin": "", "Qty": 0.0, "Price (USD)": 0.0}]
        default_liabilities = [
            {"Category": "Credit Card", "Amount (KWD)": 0.0, "Type": "Current"},
            {"Category": "Bank Loan", "Amount (KWD)": 0.0, "Type": "Long-term"},
        ]

        # Load from database if editing existing snapshot
        if existing_snapshot:
            snap_id = existing_snapshot["id"]
            conn = get_conn()
            cur = conn.cursor()
            
            # Load income
            db_execute(cur, "SELECT category, monthly_amount FROM pfm_income_expense_items WHERE snapshot_id = ? AND kind = 'income' ORDER BY id", (snap_id,))
            income_rows = cur.fetchall()
            if income_rows:
                default_income = [{"Category": r[0], "Monthly (KWD)": float(r[1])} for r in income_rows]
            
            # Load expenses
            db_execute(cur, "SELECT category, monthly_amount, is_finance_cost, is_gna FROM pfm_income_expense_items WHERE snapshot_id = ? AND kind = 'expense' ORDER BY id", (snap_id,))
            expense_rows = cur.fetchall()
            if expense_rows:
                default_expense = [{"Category": r[0], "Monthly (KWD)": float(r[1]), "Finance Cost": bool(r[2]), "G&A": bool(r[3])} for r in expense_rows]
            
            # Load assets
            db_execute(cur, "SELECT asset_type, category, name, quantity, price, currency, value_kwd FROM pfm_asset_items WHERE snapshot_id = ? ORDER BY asset_type, id", (snap_id,))
            asset_rows = cur.fetchall()
            
            re_data, shares_data, gold_data, cash_data, crypto_data = [], [], [], [], []
            for r in asset_rows:
                atype, cat, name, qty, price, curr, val = r
                if atype == "real_estate":
                    re_data.append({"Name": name or cat, "Value (KWD)": float(val or 0)})
                elif atype == "shares":
                    shares_data.append({"Ticker": cat, "Name": name, "Qty": float(qty or 0), "Price": float(price or 0), "Currency": curr or "KWD"})
                elif atype == "gold":
                    gold_data.append({"Type": cat, "Grams": float(qty or 0), "Price/Gram (KWD)": float(price or 0)})
                elif atype == "cash":
                    cash_data.append({"Account": name or cat, "Amount": float(qty or 0), "Currency": curr or "KWD"})
                elif atype == "crypto":
                    crypto_data.append({"Coin": name, "Qty": float(qty or 0), "Price (USD)": float(price or 0)})
            
            if re_data: default_real_estate = re_data
            if shares_data: default_shares = shares_data
            if gold_data: default_gold = gold_data
            if cash_data: default_cash = cash_data
            if crypto_data: default_crypto = crypto_data
            
            # Load liabilities
            db_execute(cur, "SELECT category, amount_kwd, is_current, is_long_term FROM pfm_liability_items WHERE snapshot_id = ? ORDER BY id", (snap_id,))
            liab_rows = cur.fetchall()
            if liab_rows:
                default_liabilities = [{"Category": r[0], "Amount (KWD)": float(r[1]), "Type": "Current" if r[2] else "Long-term"} for r in liab_rows]
            
            conn.close()

        # ═══════════════════════════════════════════════════════════════════
        # FORM: Batch all inputs to prevent refresh while typing
        # ═══════════════════════════════════════════════════════════════════
        with st.form("pfm_data_entry_form"):
            # --- INCOME & EXPENSES ---
            st.markdown("### 💵 Income & Expenses (Monthly)")
            col_inc, col_exp = st.columns(2)
            
            with col_inc:
                st.markdown("#### 📈 Income Sources")
                income_df = st.data_editor(
                    pd.DataFrame(default_income),
                    num_rows="dynamic",
                    use_container_width=True,
                    key=f"pfm_inc_{snapshot_date}",
                    column_config={
                        "Category": st.column_config.TextColumn(width="medium"),
                        "Monthly (KWD)": st.column_config.NumberColumn(format="%.3f", min_value=0)
                    }
                )
            
            with col_exp:
                st.markdown("#### 📉 Expenses")
                expense_df = st.data_editor(
                    pd.DataFrame(default_expense),
                    num_rows="dynamic",
                    use_container_width=True,
                    key=f"pfm_exp_{snapshot_date}",
                    column_config={
                        "Category": st.column_config.TextColumn(width="medium"),
                        "Monthly (KWD)": st.column_config.NumberColumn(format="%.3f", min_value=0),
                        "Finance Cost": st.column_config.CheckboxColumn(width="small"),
                        "G&A": st.column_config.CheckboxColumn(width="small")
                    }
                )

            # Summary metrics
            total_income = income_df["Monthly (KWD)"].sum() if not income_df.empty else 0
            total_expense = expense_df["Monthly (KWD)"].sum() if not expense_df.empty else 0
            net_monthly = total_income - total_expense
            
            col_m1, col_m2, col_m3 = st.columns(3)
            with col_m1:
                st.metric("Monthly Income", f"{total_income:,.2f} KWD")
            with col_m2:
                st.metric("Monthly Expenses", f"{total_expense:,.2f} KWD")
            with col_m3:
                st.metric("Net Monthly", f"{net_monthly:,.2f} KWD", delta=f"{(net_monthly/total_income*100) if total_income else 0:.1f}%")

            st.divider()

            # --- ASSETS & LIABILITIES ---
            st.markdown("### 🏦 Assets & Liabilities")
            
            asset_tabs = st.tabs(["🏡 Real Estate", "📈 Shares", "🪙 Gold", "💵 Cash", "₿ Crypto", "💳 Liabilities"])
            
            # Real Estate
            with asset_tabs[0]:
                re_df = st.data_editor(
                    pd.DataFrame(default_real_estate),
                    num_rows="dynamic",
                    use_container_width=True,
                    key=f"pfm_re_{snapshot_date}",
                    column_config={
                        "Name": st.column_config.TextColumn(width="large"),
                        "Value (KWD)": st.column_config.NumberColumn(format="%.3f", min_value=0)
                    }
                )
                re_total = re_df["Value (KWD)"].sum() if not re_df.empty and "Value (KWD)" in re_df.columns else 0
                st.markdown(f"**Total Real Estate:** {re_total:,.2f} KWD")

            # Shares
            with asset_tabs[1]:
                if shares_mode == "Auto-Import Portfolio":
                    st.info("📊 Shares will be auto-imported from your portfolio holdings at current market values.")
                    # Calculate portfolio value
                    try:
                        conn = get_conn()
                        cur = conn.cursor()
                        db_execute(cur, """
                            SELECT s.symbol, s.name, 
                                   COALESCE(SUM(CASE WHEN t.txn_type='Buy' THEN t.shares ELSE 0 END) - 
                                            SUM(CASE WHEN t.txn_type='Sell' THEN t.shares ELSE 0 END), 0) as shares,
                                   s.current_price, s.currency
                            FROM stocks s
                            LEFT JOIN transactions t ON s.symbol = t.stock_symbol AND t.user_id = ?
                            WHERE s.user_id = ?
                            GROUP BY s.symbol, s.name, s.current_price, s.currency
                            HAVING shares > 0
                        """, (user_id, user_id))
                        portfolio_rows = cur.fetchall()
                        conn.close()
                        
                        if portfolio_rows:
                            port_data = []
                            total_port = 0.0
                            for row in portfolio_rows:
                                ticker, name, qty, price, curr = row
                                qty = float(qty) if qty else 0
                                price = float(price) if price else 0
                                val = qty * price
                                val_kwd = convert_to_kwd(val, curr) if curr != "KWD" else val
                                total_port += val_kwd
                                port_data.append({"Ticker": ticker, "Company": name, "Shares": qty, "Price": price, "Value (KWD)": val_kwd})
                            
                            st.dataframe(pd.DataFrame(port_data), use_container_width=True)
                            st.markdown(f"**Total Portfolio Value:** {total_port:,.2f} KWD")
                            shares_df = pd.DataFrame([{"auto_import": True, "value": total_port}])
                        else:
                            st.warning("No portfolio holdings found.")
                            shares_df = pd.DataFrame()
                    except Exception as e:
                        st.error(f"Error loading portfolio: {e}")
                        shares_df = pd.DataFrame()
                else:
                    shares_df = st.data_editor(
                        pd.DataFrame(default_shares),
                        num_rows="dynamic",
                        use_container_width=True,
                        key=f"pfm_shares_{snapshot_date}",
                        column_config={
                            "Ticker": st.column_config.TextColumn(width="small"),
                            "Name": st.column_config.TextColumn(width="medium"),
                            "Qty": st.column_config.NumberColumn(format="%.0f", min_value=0),
                            "Price": st.column_config.NumberColumn(format="%.3f", min_value=0),
                            "Currency": st.column_config.SelectboxColumn(options=["KWD", "USD", "SAR", "AED", "BHD", "OMR", "QAR"])
                        }
                    )
                    if not shares_df.empty and "Qty" in shares_df.columns and "Price" in shares_df.columns:
                        shares_df["Value"] = shares_df["Qty"] * shares_df["Price"]
                        shares_total = shares_df["Value"].sum()
                        st.markdown(f"**Total Shares Value:** {shares_total:,.2f}")

            # Gold
            with asset_tabs[2]:
                gold_df = st.data_editor(
                    pd.DataFrame(default_gold),
                    num_rows="dynamic",
                    use_container_width=True,
                    key=f"pfm_gold_{snapshot_date}",
                    column_config={
                        "Type": st.column_config.SelectboxColumn(options=["Bars", "Coins", "Jewelry", "Other"]),
                        "Grams": st.column_config.NumberColumn(format="%.2f", min_value=0),
                        "Price/Gram (KWD)": st.column_config.NumberColumn(format="%.3f", min_value=0)
                    }
                )
                if not gold_df.empty and "Grams" in gold_df.columns:
                    gold_df["Value (KWD)"] = gold_df["Grams"] * gold_df["Price/Gram (KWD)"]
                    gold_total = gold_df["Value (KWD)"].sum()
                    st.markdown(f"**Total Gold Value:** {gold_total:,.2f} KWD")

            # Cash
            with asset_tabs[3]:
                cash_df = st.data_editor(
                    pd.DataFrame(default_cash),
                    num_rows="dynamic",
                    use_container_width=True,
                    key=f"pfm_cash_{snapshot_date}",
                    column_config={
                        "Account": st.column_config.TextColumn(width="medium"),
                        "Amount": st.column_config.NumberColumn(format="%.3f", min_value=0),
                        "Currency": st.column_config.SelectboxColumn(options=["KWD", "USD", "SAR", "AED", "BHD", "OMR", "QAR"])
                    }
                )
                cash_total = 0.0
                if not cash_df.empty and "Amount" in cash_df.columns:
                    for _, row in cash_df.iterrows():
                        amt = float(row.get("Amount", 0) or 0)
                        curr = row.get("Currency", "KWD")
                        cash_total += convert_to_kwd(amt, curr) if curr != "KWD" else amt
                    st.markdown(f"**Total Cash:** {cash_total:,.2f} KWD")

            # Crypto
            with asset_tabs[4]:
                usd_rate = 0.307
                st.caption(f"Conversion Rate: 1 USD = {usd_rate} KWD")
                crypto_df = st.data_editor(
                    pd.DataFrame(default_crypto),
                    num_rows="dynamic",
                    use_container_width=True,
                    key=f"pfm_crypto_{snapshot_date}",
                    column_config={
                        "Coin": st.column_config.TextColumn(width="small"),
                        "Qty": st.column_config.NumberColumn(format="%.6f", min_value=0),
                        "Price (USD)": st.column_config.NumberColumn(format="%.2f", min_value=0)
                    }
                )
                if not crypto_df.empty and "Qty" in crypto_df.columns:
                    crypto_df["Value (KWD)"] = crypto_df["Qty"] * crypto_df["Price (USD)"] * usd_rate
                    crypto_total = crypto_df["Value (KWD)"].sum()
                    st.markdown(f"**Total Crypto:** {crypto_total:,.2f} KWD")

            # Liabilities
            with asset_tabs[5]:
                liab_df = st.data_editor(
                    pd.DataFrame(default_liabilities),
                    num_rows="dynamic",
                    use_container_width=True,
                    key=f"pfm_liab_{snapshot_date}",
                    column_config={
                        "Category": st.column_config.TextColumn(width="medium"),
                        "Amount (KWD)": st.column_config.NumberColumn(format="%.3f", min_value=0),
                        "Type": st.column_config.SelectboxColumn(options=["Current", "Long-term"])
                    }
                )
                liab_total = liab_df["Amount (KWD)"].sum() if not liab_df.empty and "Amount (KWD)" in liab_df.columns else 0
                st.markdown(f"**Total Liabilities:** {liab_total:,.2f} KWD")

            st.divider()
            
            # Submit button
            submitted = st.form_submit_button("💾 Save Financial Snapshot", type="primary", use_container_width=True)

        # ═══════════════════════════════════════════════════════════════════
        # HANDLE FORM SUBMISSION (Outside the form)
        # ═══════════════════════════════════════════════════════════════════
        if submitted:
            try:
                conn = get_conn()
                cur = conn.cursor()
                
                # Get or create snapshot
                db_execute(cur, "SELECT id FROM pfm_snapshots WHERE user_id = ? AND snapshot_date = ?", (user_id, str(snapshot_date)))
                row = cur.fetchone()
                
                if row:
                    snapshot_id = row[0]
                    # Clear existing data
                    db_execute(cur, "DELETE FROM pfm_income_expense_items WHERE snapshot_id = ?", (snapshot_id,))
                    db_execute(cur, "DELETE FROM pfm_asset_items WHERE snapshot_id = ?", (snapshot_id,))
                    db_execute(cur, "DELETE FROM pfm_liability_items WHERE snapshot_id = ?", (snapshot_id,))
                else:
                    db_execute(cur, """
                        INSERT INTO pfm_snapshots (user_id, snapshot_date, notes, created_at)
                        VALUES (?, ?, ?, ?)
                    """, (user_id, str(snapshot_date), snapshot_notes, int(time.time())))
                    snapshot_id = cur.lastrowid
                
                # Save income items
                for _, row in income_df.iterrows():
                    cat = str(row.get("Category", "")).strip()
                    amt = float(row.get("Monthly (KWD)", 0) or 0)
                    if cat and amt > 0:
                        db_execute(cur, """
                            INSERT INTO pfm_income_expense_items (snapshot_id, user_id, kind, category, monthly_amount, is_finance_cost, is_gna)
                            VALUES (?, ?, 'income', ?, ?, 0, 0)
                        """, (snapshot_id, user_id, cat, amt))
                
                # Save expense items
                for _, row in expense_df.iterrows():
                    cat = str(row.get("Category", "")).strip()
                    amt = float(row.get("Monthly (KWD)", 0) or 0)
                    fin = 1 if row.get("Finance Cost", False) else 0
                    gna = 1 if row.get("G&A", False) else 0
                    if cat and amt > 0:
                        db_execute(cur, """
                            INSERT INTO pfm_income_expense_items (snapshot_id, user_id, kind, category, monthly_amount, is_finance_cost, is_gna)
                            VALUES (?, ?, 'expense', ?, ?, ?, ?)
                        """, (snapshot_id, user_id, cat, amt, fin, gna))
                
                # Save real estate
                for _, row in re_df.iterrows():
                    name = str(row.get("Name", "")).strip()
                    val = float(row.get("Value (KWD)", 0) or 0)
                    if val > 0:
                        db_execute(cur, """
                            INSERT INTO pfm_asset_items (snapshot_id, user_id, asset_type, category, name, quantity, price, currency, value_kwd)
                            VALUES (?, ?, 'real_estate', 'Real Estate', ?, 1, ?, 'KWD', ?)
                        """, (snapshot_id, user_id, name, val, val))
                
                # Save shares
                if shares_mode == "Auto-Import Portfolio" and not shares_df.empty and "auto_import" in shares_df.columns:
                    val = float(shares_df["value"].iloc[0])
                    if val > 0:
                        db_execute(cur, """
                            INSERT INTO pfm_asset_items (snapshot_id, user_id, asset_type, category, name, quantity, price, currency, value_kwd)
                            VALUES (?, ?, 'shares', 'Portfolio', 'Auto-imported', 1, ?, 'KWD', ?)
                        """, (snapshot_id, user_id, val, val))
                elif not shares_df.empty and "Ticker" in shares_df.columns:
                    for _, row in shares_df.iterrows():
                        ticker = str(row.get("Ticker", "")).strip()
                        name = str(row.get("Name", "")).strip()
                        qty = float(row.get("Qty", 0) or 0)
                        price = float(row.get("Price", 0) or 0)
                        curr = row.get("Currency", "KWD")
                        val = qty * price
                        val_kwd = convert_to_kwd(val, curr) if curr != "KWD" else val
                        if val_kwd > 0:
                            db_execute(cur, """
                                INSERT INTO pfm_asset_items (snapshot_id, user_id, asset_type, category, name, quantity, price, currency, value_kwd)
                                VALUES (?, ?, 'shares', ?, ?, ?, ?, ?, ?)
                            """, (snapshot_id, user_id, ticker, name, qty, price, curr, val_kwd))
                
                # Save gold
                if not gold_df.empty and "Grams" in gold_df.columns:
                    for _, row in gold_df.iterrows():
                        gtype = row.get("Type", "Bars")
                        grams = float(row.get("Grams", 0) or 0)
                        price = float(row.get("Price/Gram (KWD)", 0) or 0)
                        val = grams * price
                        if val > 0:
                            db_execute(cur, """
                                INSERT INTO pfm_asset_items (snapshot_id, user_id, asset_type, category, name, quantity, price, currency, value_kwd)
                                VALUES (?, ?, 'gold', ?, '', ?, ?, 'KWD', ?)
                            """, (snapshot_id, user_id, gtype, grams, price, val))
                
                # Save cash
                if not cash_df.empty and "Amount" in cash_df.columns:
                    for _, row in cash_df.iterrows():
                        acc = str(row.get("Account", "")).strip()
                        amt = float(row.get("Amount", 0) or 0)
                        curr = row.get("Currency", "KWD")
                        val_kwd = convert_to_kwd(amt, curr) if curr != "KWD" else amt
                        if val_kwd > 0:
                            db_execute(cur, """
                                INSERT INTO pfm_asset_items (snapshot_id, user_id, asset_type, category, name, quantity, price, currency, value_kwd)
                                VALUES (?, ?, 'cash', ?, ?, ?, 1, ?, ?)
                            """, (snapshot_id, user_id, acc, acc, amt, curr, val_kwd))
                
                # Save crypto
                if not crypto_df.empty and "Qty" in crypto_df.columns:
                    for _, row in crypto_df.iterrows():
                        coin = str(row.get("Coin", "")).strip()
                        qty = float(row.get("Qty", 0) or 0)
                        price = float(row.get("Price (USD)", 0) or 0)
                        val_kwd = qty * price * 0.307
                        if val_kwd > 0:
                            db_execute(cur, """
                                INSERT INTO pfm_asset_items (snapshot_id, user_id, asset_type, category, name, quantity, price, currency, value_kwd)
                                VALUES (?, ?, 'crypto', '', ?, ?, ?, 'USD', ?)
                            """, (snapshot_id, user_id, coin, qty, price, val_kwd))
                
                # Save liabilities
                if not liab_df.empty and "Amount (KWD)" in liab_df.columns:
                    for _, row in liab_df.iterrows():
                        cat = str(row.get("Category", "")).strip()
                        amt = float(row.get("Amount (KWD)", 0) or 0)
                        ltype = row.get("Type", "Current")
                        is_current = 1 if ltype == "Current" else 0
                        is_long = 1 if ltype == "Long-term" else 0
                        if amt > 0:
                            db_execute(cur, """
                                INSERT INTO pfm_liability_items (snapshot_id, user_id, category, amount_kwd, is_current, is_long_term)
                                VALUES (?, ?, ?, ?, ?, ?)
                            """, (snapshot_id, user_id, cat, amt, is_current, is_long))
                
                conn.commit()
                conn.close()
                
                st.success(f"✅ Financial snapshot saved for {snapshot_date}!")
                st.balloons()
                time.sleep(1)
                st.rerun()
                
            except Exception as e:
                st.error(f"Error saving snapshot: {e}")

    # ═══════════════════════════════════════════════════════════════════════════
    # TAB 2: P&L STATEMENT
    # ═══════════════════════════════════════════════════════════════════════════
    with pfm_tabs[1]:
        st.subheader("📊 Profit & Loss Statement")
        
        # Load all snapshots for user
        conn = get_conn()
        try:
            cur = conn.cursor()
            db_execute(cur, """
                SELECT id, snapshot_date, notes FROM pfm_snapshots
                WHERE user_id = ?
                ORDER BY snapshot_date DESC
            """, (user_id,))
            snapshots = cur.fetchall()
        except:
            snapshots = []
        finally:
            conn.close()

        if not snapshots:
            st.info("No financial snapshots found. Create one in the Data Entry tab.")
        else:
            # Select snapshots to compare
            snapshot_options = {f"{s[1]} - {s[2] if s[2] else 'No notes'}": s[0] for s in snapshots}
            selected_dates = st.multiselect("Select Snapshots to Compare", list(snapshot_options.keys()), 
                default=list(snapshot_options.keys())[:min(3, len(snapshot_options))])

            if selected_dates:
                # Build P&L for each selected snapshot
                pnl_data = {}
                for date_label in selected_dates:
                    snap_id = snapshot_options[date_label]
                    snap_date = date_label.split(" - ")[0]
                    
                    conn = get_conn()
                    cur = conn.cursor()
                    
                    # Get income
                    db_execute(cur, """
                        SELECT category, monthly_amount FROM pfm_income_expense_items
                        WHERE snapshot_id = ? AND kind = 'income'
                    """, (snap_id,))
                    income_rows = cur.fetchall()
                    
                    # Get expenses
                    db_execute(cur, """
                        SELECT category, monthly_amount, is_finance_cost, is_gna FROM pfm_income_expense_items
                        WHERE snapshot_id = ? AND kind = 'expense'
                    """, (snap_id,))
                    expense_rows = cur.fetchall()
                    conn.close()

                    total_income = sum(r[1] for r in income_rows) * 12
                    total_expense = sum(r[1] for r in expense_rows) * 12
                    finance_costs = sum(r[1] for r in expense_rows if r[2]) * 12
                    gna_costs = sum(r[1] for r in expense_rows if r[3]) * 12
                    operating_expense = total_expense - finance_costs
                    gross_profit = total_income - operating_expense + finance_costs
                    operating_profit = total_income - operating_expense
                    net_income = total_income - total_expense

                    pnl_data[snap_date] = {
                        "Total Revenue": total_income,
                        "Operating Expenses": operating_expense,
                        "Gross Profit": gross_profit,
                        "G&A Expenses": gna_costs,
                        "Operating Profit (EBIT)": operating_profit,
                        "Finance Costs": finance_costs,
                        "Net Income": net_income,
                        "Net Margin %": (net_income / total_income * 100) if total_income else 0
                    }

                # Create P&L DataFrame
                pnl_df = pd.DataFrame(pnl_data).T
                pnl_df = pnl_df.T  # Transpose for better display
                
                # Format for display
                display_df = pnl_df.copy()
                for col in display_df.columns:
                    display_df[col] = display_df[col].apply(lambda x: f"{x:,.2f}" if pd.notna(x) else "")
                
                st.markdown("#### Annual P&L Summary (KWD)")
                render_styled_table(display_df.reset_index().rename(columns={"index": "Line Item"}), "P&L Statement")

                # Show chart
                if len(selected_dates) > 1:
                    chart_data = pd.DataFrame({
                        "Date": list(pnl_data.keys()),
                        "Revenue": [pnl_data[d]["Total Revenue"] for d in pnl_data],
                        "Net Income": [pnl_data[d]["Net Income"] for d in pnl_data]
                    })
                    st.line_chart(chart_data.set_index("Date"))

    # ═══════════════════════════════════════════════════════════════════════════
    # TAB 3: BALANCE SHEET
    # ═══════════════════════════════════════════════════════════════════════════
    with pfm_tabs[2]:
        st.subheader("📋 Balance Sheet & Net Worth")

        conn = get_conn()
        try:
            cur = conn.cursor()
            db_execute(cur, """
                SELECT id, snapshot_date, notes FROM pfm_snapshots
                WHERE user_id = ?
                ORDER BY snapshot_date DESC
            """, (user_id,))
            snapshots = cur.fetchall()
        except:
            snapshots = []
        finally:
            conn.close()

        if not snapshots:
            st.info("No financial snapshots found. Create one in the Data Entry tab.")
        else:
            snapshot_options = {f"{s[1]} - {s[2] if s[2] else 'No notes'}": s[0] for s in snapshots}
            selected_dates = st.multiselect("Select Snapshots", list(snapshot_options.keys()), 
                default=list(snapshot_options.keys())[:min(3, len(snapshot_options))], key="bs_snapshots")

            if selected_dates:
                bs_data = {}
                for date_label in selected_dates:
                    snap_id = snapshot_options[date_label]
                    snap_date = date_label.split(" - ")[0]
                    
                    conn = get_conn()
                    cur = conn.cursor()
                    
                    # Get assets by type
                    db_execute(cur, """
                        SELECT asset_type, SUM(value_kwd) FROM pfm_asset_items
                        WHERE snapshot_id = ?
                        GROUP BY asset_type
                    """, (snap_id,))
                    asset_rows = cur.fetchall()
                    assets = {r[0]: float(r[1]) for r in asset_rows}
                    
                    # Get liabilities
                    db_execute(cur, """
                        SELECT SUM(CASE WHEN is_current = 1 THEN amount_kwd ELSE 0 END),
                               SUM(CASE WHEN is_long_term = 1 THEN amount_kwd ELSE 0 END)
                        FROM pfm_liability_items
                        WHERE snapshot_id = ?
                    """, (snap_id,))
                    liab_row = cur.fetchone()
                    current_liab = float(liab_row[0] or 0) if liab_row else 0
                    long_term_liab = float(liab_row[1] or 0) if liab_row else 0
                    conn.close()

                    total_assets = sum(assets.values())
                    total_liab = current_liab + long_term_liab
                    net_worth = total_assets - total_liab

                    # Cash includes cash and crypto as liquid
                    liquid_assets = assets.get("cash", 0) + assets.get("crypto", 0)

                    bs_data[snap_date] = {
                        "Real Estate": assets.get("real_estate", 0),
                        "Shares/Investments": assets.get("shares", 0),
                        "Gold": assets.get("gold", 0),
                        "Cash & Bank": assets.get("cash", 0),
                        "Crypto": assets.get("crypto", 0),
                        "Other Assets": assets.get("other", 0),
                        "TOTAL ASSETS": total_assets,
                        "---": "---",
                        "Current Liabilities": current_liab,
                        "Long-term Liabilities": long_term_liab,
                        "TOTAL LIABILITIES": total_liab,
                        "----": "----",
                        "NET WORTH": net_worth,
                        "Equity Ratio %": (net_worth / total_assets * 100) if total_assets else 0
                    }

                # Create Balance Sheet DataFrame
                bs_df = pd.DataFrame(bs_data).T.T
                display_df = bs_df.copy()
                for col in display_df.columns:
                    display_df[col] = display_df[col].apply(lambda x: f"{x:,.2f}" if isinstance(x, (int, float)) and x not in ["---", "----"] else x)
                
                st.markdown("#### Balance Sheet (KWD)")
                render_styled_table(display_df.reset_index().rename(columns={"index": "Line Item"}), "Balance Sheet")

                # Net Worth Chart
                if len(selected_dates) > 1:
                    nw_chart = pd.DataFrame({
                        "Date": list(bs_data.keys()),
                        "Net Worth": [bs_data[d]["NET WORTH"] for d in bs_data]
                    })
                    st.line_chart(nw_chart.set_index("Date"))

                # Asset Allocation Pie for latest snapshot
                if bs_data:
                    latest = list(bs_data.keys())[0]
                    asset_alloc = {
                        "Real Estate": bs_data[latest]["Real Estate"],
                        "Shares": bs_data[latest]["Shares/Investments"],
                        "Gold": bs_data[latest]["Gold"],
                        "Cash": bs_data[latest]["Cash & Bank"],
                        "Crypto": bs_data[latest]["Crypto"],
                        "Other": bs_data[latest]["Other Assets"]
                    }
                    asset_alloc = {k: v for k, v in asset_alloc.items() if v > 0}
                    if asset_alloc:
                        st.markdown(f"#### Asset Allocation ({latest})")
                        alloc_df = pd.DataFrame(list(asset_alloc.items()), columns=["Asset Type", "Value (KWD)"])
                        alloc_df["Percentage"] = alloc_df["Value (KWD)"] / alloc_df["Value (KWD)"].sum() * 100
                        render_styled_table(alloc_df, "Asset Allocation")

    # ═══════════════════════════════════════════════════════════════════════════
    # TAB 4: RATIOS & GROWTH
    # ═══════════════════════════════════════════════════════════════════════════
    with pfm_tabs[3]:
        st.subheader("📈 Financial Ratios & Growth Analysis")

        conn = get_conn()
        try:
            cur = conn.cursor()
            db_execute(cur, """
                SELECT id, snapshot_date, notes FROM pfm_snapshots
                WHERE user_id = ?
                ORDER BY snapshot_date ASC
            """, (user_id,))
            snapshots = cur.fetchall()
        except:
            snapshots = []
        finally:
            conn.close()

        if len(snapshots) < 1:
            st.info("Create financial snapshots to see ratio analysis and growth trends.")
        else:
            # Calculate ratios for all snapshots
            all_metrics = []
            for snap in snapshots:
                snap_id, snap_date, notes = snap
                conn = get_conn()
                cur = conn.cursor()
                
                # Get income/expenses
                db_execute(cur, """
                    SELECT kind, SUM(monthly_amount) FROM pfm_income_expense_items
                    WHERE snapshot_id = ?
                    GROUP BY kind
                """, (snap_id,))
                ie_rows = {r[0]: float(r[1]) * 12 for r in cur.fetchall()}
                
                # Get assets
                db_execute(cur, """
                    SELECT asset_type, SUM(value_kwd) FROM pfm_asset_items
                    WHERE snapshot_id = ?
                    GROUP BY asset_type
                """, (snap_id,))
                assets = {r[0]: float(r[1]) for r in cur.fetchall()}
                
                # Get liabilities
                db_execute(cur, """
                    SELECT SUM(CASE WHEN is_current = 1 THEN amount_kwd ELSE 0 END),
                           SUM(CASE WHEN is_long_term = 1 THEN amount_kwd ELSE 0 END),
                           SUM(amount_kwd)
                        FROM pfm_liability_items
                    WHERE snapshot_id = ?
                """, (snap_id,))
                liab_row = cur.fetchone()
                current_liab = float(liab_row[0] or 0) if liab_row else 0
                long_term_liab = float(liab_row[1] or 0) if liab_row else 0
                total_liab = float(liab_row[2] or 0) if liab_row else 0
                conn.close()

                total_income = ie_rows.get("income", 0)
                total_expense = ie_rows.get("expense", 0)
                net_income = total_income - total_expense
                total_assets = sum(assets.values())
                net_worth = total_assets - total_liab
                liquid_assets = assets.get("cash", 0) + assets.get("crypto", 0)

                # Calculate ratios
                current_ratio = liquid_assets / current_liab if current_liab > 0 else float('inf')
                debt_to_equity = total_liab / net_worth if net_worth > 0 else float('inf')
                debt_to_assets = total_liab / total_assets if total_assets > 0 else 0
                roe = (net_income / net_worth * 100) if net_worth > 0 else 0
                roa = (net_income / total_assets * 100) if total_assets > 0 else 0
                savings_rate = (net_income / total_income * 100) if total_income > 0 else 0

                all_metrics.append({
                    "Date": str(snap_date),
                    "Total Income": total_income,
                    "Total Expenses": total_expense,
                    "Net Income": net_income,
                    "Total Assets": total_assets,
                    "Total Liabilities": total_liab,
                    "Net Worth": net_worth,
                    "Current Ratio": current_ratio if current_ratio != float('inf') else 999,
                    "Debt/Equity": debt_to_equity if debt_to_equity != float('inf') else 999,
                    "Debt/Assets %": debt_to_assets * 100,
                    "ROE %": roe,
                    "ROA %": roa,
                    "Savings Rate %": savings_rate
                })

            metrics_df = pd.DataFrame(all_metrics)
            
            # Display ratios table
            st.markdown("#### Key Financial Ratios")
            ratio_cols = ["Date", "Current Ratio", "Debt/Equity", "Debt/Assets %", "ROE %", "ROA %", "Savings Rate %"]
            ratio_display = metrics_df[ratio_cols].copy()
            for col in ratio_cols[1:]:
                ratio_display[col] = ratio_display[col].apply(lambda x: f"{x:.2f}" if x < 999 else "∞")
            render_styled_table(ratio_display, "Financial Ratios")

            # Growth Analysis
            if len(all_metrics) >= 2:
                st.markdown("#### Year-over-Year Growth")
                growth_data = []
                for i in range(1, len(all_metrics)):
                    prev = all_metrics[i-1]
                    curr = all_metrics[i]
                    
                    def calc_growth(curr_val, prev_val):
                        if prev_val == 0:
                            return 0 if curr_val == 0 else 100
                        return ((curr_val - prev_val) / abs(prev_val)) * 100
                    
                    growth_data.append({
                        "Period": f"{prev['Date']} → {curr['Date']}",
                        "Income Growth %": calc_growth(curr["Total Income"], prev["Total Income"]),
                        "Expense Growth %": calc_growth(curr["Total Expenses"], prev["Total Expenses"]),
                        "Net Income Growth %": calc_growth(curr["Net Income"], prev["Net Income"]),
                        "Asset Growth %": calc_growth(curr["Total Assets"], prev["Total Assets"]),
                        "Net Worth Growth %": calc_growth(curr["Net Worth"], prev["Net Worth"])
                    })

                growth_df = pd.DataFrame(growth_data)
                display_growth = growth_df.copy()
                for col in display_growth.columns[1:]:
                    display_growth[col] = display_growth[col].apply(lambda x: f"{x:+.1f}%")
                render_styled_table(display_growth, "Growth Analysis")

                # Growth Charts
                st.markdown("#### Trends Over Time")
                col1, col2 = st.columns(2)
                with col1:
                    st.line_chart(metrics_df.set_index("Date")[["Total Income", "Total Expenses", "Net Income"]])
                with col2:
                    st.line_chart(metrics_df.set_index("Date")[["Total Assets", "Total Liabilities", "Net Worth"]])

            # Quick Health Check
            st.markdown("---")
            st.markdown("#### 🏥 Financial Health Check")
            if all_metrics:
                latest = all_metrics[-1]
                
                checks = []
                # Emergency fund check (3-6 months expenses in liquid assets)
                monthly_expense = latest["Total Expenses"] / 12
                emergency_months = liquid_assets / monthly_expense if monthly_expense > 0 else 0
                if emergency_months >= 6:
                    checks.append(("✅", "Emergency Fund", f"{emergency_months:.1f} months of expenses covered"))
                elif emergency_months >= 3:
                    checks.append(("⚠️", "Emergency Fund", f"{emergency_months:.1f} months - aim for 6 months"))
                else:
                    checks.append(("❌", "Emergency Fund", f"Only {emergency_months:.1f} months - build to 3-6 months"))

                # Savings rate
                if latest["Savings Rate %"] >= 20:
                    checks.append(("✅", "Savings Rate", f"{latest['Savings Rate %']:.1f}% - Excellent!"))
                elif latest["Savings Rate %"] >= 10:
                    checks.append(("⚠️", "Savings Rate", f"{latest['Savings Rate %']:.1f}% - Good, aim for 20%+"))
                else:
                    checks.append(("❌", "Savings Rate", f"{latest['Savings Rate %']:.1f}% - Try to increase savings"))

                # Debt ratio
                debt_ratio = latest["Debt/Assets %"]
                if debt_ratio <= 30:
                    checks.append(("✅", "Debt Level", f"{debt_ratio:.1f}% of assets - Healthy"))
                elif debt_ratio <= 50:
                    checks.append(("⚠️", "Debt Level", f"{debt_ratio:.1f}% of assets - Moderate"))
                else:
                    checks.append(("❌", "Debt Level", f"{debt_ratio:.1f}% of assets - High, focus on debt reduction"))

                for icon, label, msg in checks:
                    st.markdown(f"{icon} **{label}:** {msg}")


# Google Analytics Tracking Code
GOOGLE_ANALYTICS_CODE = """
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-B5N8PQ6JXB"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-B5N8PQ6JXB');
</script>
"""


def inject_google_analytics():
    """Inject Google Analytics tracking code into the Streamlit app."""
    import streamlit.components.v1 as components
    components.html(GOOGLE_ANALYTICS_CODE, height=0, width=0)


def main():
    # Inject Google Analytics (runs once per session)
    if 'ga_injected' not in st.session_state:
        inject_google_analytics()
        st.session_state['ga_injected'] = True
    
    # Initialize database schema (handles both SQLite and PostgreSQL)
    try:
        init_db()
    except Exception as e:
        st.error(f"Database Initialization Error: {e}")
        print(f"DB Init Error: {e}")

    # Initialize Cookie Manager (Global)
    cookie_manager = None
    if stx:
        try:
            cookie_manager = stx.CookieManager(key="portfolio_auth_v3")
        except Exception as e:
            print(f"Cookie manager init error: {e}")

    # =============================
    # ROBUST SESSION PERSISTENCE
    # =============================
    # Strategy: Use multiple methods to persist login:
    # 1. session_state (in-memory, lost on refresh)
    # 2. cookies (persistent, but async loading)
    # 3. query_params as backup signaling mechanism
    
    # =============================
    # FAST SESSION CHECK
    # =============================
    # Check if already logged in (fastest path)
    if st.session_state.get('logged_in'):
        pass  # Continue to main app
    else:
        # Try to restore session from cookie
        restored = False
        cookies_loaded = False  # Track if cookies have actually loaded
        
        if cookie_manager:
            try:
                all_cookies = cookie_manager.get_all()
                # all_cookies is None if component hasn't rendered yet
                # all_cookies is {} (empty dict) if rendered but no cookies
                if all_cookies is not None:
                    cookies_loaded = True
                    session_token = all_cookies.get("portfolio_session")
                    if session_token:
                        user_info = get_user_from_token(session_token)
                        if user_info:
                            st.session_state.logged_in = True
                            st.session_state.user_id = user_info["id"]
                            st.session_state.username = user_info["username"]
                            restored = True
                        else:
                            # Token invalid - clean up silently
                            try:
                                cookie_manager.delete("portfolio_session")
                            except:
                                pass
            except Exception as e:
                print(f"Session restore error: {e}")
        
        # If cookies haven't loaded yet, rerun to let them load
        # Only rerun if we haven't checked AND cookies aren't loaded yet
        if not cookies_loaded and not st.session_state.get('_auth_checked'):
            st.session_state._auth_checked = True
            st.rerun()
        
        # Still not logged in? Show login page
        if not st.session_state.get('logged_in'):
            login_page(cookie_manager)
            return

    # =============================
    # COOKIE-BASED USER PREFERENCES
    # =============================
    # Load user preferences from cookies (theme, privacy mode, etc.)
    def load_user_preferences():
        """Load user preferences from cookies into session state."""
        if not cookie_manager:
            return
        try:
            all_cookies = cookie_manager.get_all() or {}
            
            # Theme preference
            saved_theme = all_cookies.get("portfolio_theme")
            if saved_theme and "theme" not in st.session_state:
                st.session_state.theme = saved_theme
                
            # Privacy mode preference
            saved_privacy = all_cookies.get("portfolio_privacy")
            if saved_privacy is not None and "privacy_mode" not in st.session_state:
                st.session_state.privacy_mode = saved_privacy == "true"
                
            # Last selected portfolio tab
            saved_portfolio = all_cookies.get("portfolio_last_tab")
            if saved_portfolio and "last_portfolio_tab" not in st.session_state:
                st.session_state.last_portfolio_tab = saved_portfolio
        except Exception as e:
            print(f"Error loading preferences: {e}")
    
    def save_preference(key: str, value: str):
        """Save a user preference to cookies (30-day expiry)."""
        if not cookie_manager:
            return
        try:
            expires = datetime.now() + timedelta(days=30)
            cookie_manager.set(f"portfolio_{key}", str(value), expires_at=expires)
        except Exception as e:
            print(f"Error saving preference {key}: {e}")
    
    # Load preferences on page load
    load_user_preferences()

    # Sidebar Logout
    with st.sidebar:
        st.write(f"👤 **{st.session_state.get('username', 'User')}**")
        st.divider()

    # --- THEME TOGGLE ---
    if "theme" not in st.session_state:
        st.session_state.theme = "light"  # Default to light
    
    # --- CURRENCY / FX RATE ---
    if "usd_to_kwd" not in st.session_state:
        st.session_state.usd_to_kwd = DEFAULT_USD_TO_KWD

    # --- GLOBAL STYLING FOR METRIC CARDS ---
    st.markdown("""
    <style>
    /* Equal height and width styling for all metric cards across the app */
    div[data-testid="metric-container"] {
        background-color: rgba(28, 131, 225, 0.1);
        border: 1px solid rgba(28, 131, 225, 0.2);
        padding: 15px;
        border-radius: 10px;
        min-height: 120px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    div[data-testid="metric-container"] > div {
        width: 100%;
    }
    </style>
    """, unsafe_allow_html=True)

    def toggle_theme():
        new_theme = "light" if st.session_state.theme == "dark" else "dark"
        st.session_state.theme = new_theme
        save_preference("theme", new_theme)
    
    def toggle_privacy():
        new_privacy = not st.session_state.get("privacy_mode", False)
        st.session_state.privacy_mode = new_privacy
        save_preference("privacy", "true" if new_privacy else "false")

    # Header with theme toggle and logout on the right
    col1, col2, col3, col4 = st.columns([6, 1, 1, 1])
    with col1:
        st.title("📊 Portfolio App")
    with col2:
        st.write("")  # Spacing
        st.toggle(
            "🌙 Dark Mode",
            value=(st.session_state.theme == "dark"),
            on_change=toggle_theme,
            key="theme_toggle"
        )
    with col3:
        st.write("")
        if "privacy_mode" not in st.session_state:
            st.session_state.privacy_mode = False
        st.toggle(
            "👁️ Privacy",
            value=st.session_state.get("privacy_mode", False),
            on_change=toggle_privacy,
            key="privacy_toggle"
        )
    with col4:
        st.write("")  # Spacing
        if st.button("🚪 Logout", key="logout_btn", type="secondary"):
            # First, invalidate the session token in the database
            # This ensures even if the cookie still exists, it won't work
            try:
                user_id = st.session_state.get('user_id')
                if user_id:
                    conn = get_conn()
                    conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
                    conn.commit()
                    conn.close()
            except Exception as e:
                print(f"Error deleting session: {e}")
            
            # Delete cookies
            if cookie_manager:
                try:
                    cookie_manager.delete("portfolio_session")
                    cookie_manager.delete("portfolio_user")
                except Exception:
                    pass
            
            # Clear all session state
            st.session_state.clear()
            st.rerun()

    # Show price fetching status
    if not YFINANCE_AVAILABLE:
        st.error(f"""
        ❌ **Price Fetching Error**: yfinance library failed to load ({YFINANCE_ERROR}).
        
        **To fix (recommended):**
        1. Create a virtual environment:
           ```
           cd C:\\Users\\Sager\\OneDrive\\Desktop\\portfolio_app
           py -3.11 -m venv .venv
           .\\.venv\\Scripts\\activate
           pip install streamlit yfinance pandas openpyxl requests
           streamlit run ui.py
           ```
        
        **Or run the setup script:** `setup_venv.bat`
        
        Currently using TradingView symbol mapping only (manual price entry required).
        """)
    elif not requests:
        st.warning("⚠️ **Price Fetching Disabled**: Please install requests: `pip install requests`")
    else:
        # Show success - yfinance is working
        st.success("""
        ✅ **Price Fetching Enabled**: Live prices from Yahoo Finance.
        
        Click "🔄 Fetch All Prices" in Portfolio Analysis to update stock prices.
        """)

    tab_names = [
        "Overview",
        "Add Cash Deposit",
        "Add Transactions",
        "Portfolio Analysis",
        "Peer Analysis",
        "Trading Section",
        "Portfolio Tracker",
        "Dividends Tracker",
        "Planner",
        "Backup & Restore",
        "Personal Finance"
    ]
    
    # Create tabs (compatible with all Streamlit versions)
    tabs = st.tabs(tab_names)

    with tabs[0]:
        ui_overview()

    with tabs[1]:
        ui_cash_deposits()

    with tabs[2]:
        ui_transactions()

    with tabs[3]:
        ui_portfolio_analysis()

    with tabs[4]:
        ui_peer_analysis()

    with tabs[5]:
        ui_trading_section()

    with tabs[6]:
        ui_portfolio_tracker()

    with tabs[7]:
        ui_dividends_tracker()
    
    with tabs[8]:
        ui_financial_planner()
        
    with tabs[9]:
        ui_backup_restore()

    with tabs[10]:
        ui_pfm()

    st.caption(f"{get_db_info()} | UI: Streamlit")


if __name__ == "__main__":
    main()
