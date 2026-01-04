from typing import Optional
import sqlite3
import time
from datetime import date
import pandas as pd
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

# ✅ Show success status when version is correct
st.sidebar.success(f"✅ Python OK: {sys.version.split()[0]}")
st.sidebar.caption(f"📍 {sys.executable}")

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

# Check yfinance availability WITH DIAGNOSTICS
YFINANCE_AVAILABLE = False
YFINANCE_ERROR = None

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
    st.sidebar.success("✓ yfinance loaded")
    st.sidebar.code(f"Path:\n{YFINANCE_PATH}")
except Exception as e:
    YFINANCE_ERROR = str(e)
    yf = None
    st.sidebar.error("✗ yfinance import failed")
    st.sidebar.code(YFINANCE_ERROR)


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


# Kuwait Stock Exchange - COMPLETE listing with Yahoo Finance tickers
# All publicly traded companies on Boursa Kuwait (150+ stocks)
KUWAIT_STOCKS = [
    # BANKS (Banking Sector)
    {"symbol": "ABK", "name": "Al Ahli Bank of Kuwait", "yf_ticker": "ABK.KW"},
    {"symbol": "BOUBYAN", "name": "Boubyan Bank", "yf_ticker": "BOUBYAN.KW"},
    {"symbol": "BURGAN", "name": "Burgan Bank", "yf_ticker": "BURGAN.KW"},
    {"symbol": "CBK", "name": "Commercial Bank of Kuwait", "yf_ticker": "CBK.KW"},
    {"symbol": "GULF", "name": "Gulf Bank", "yf_ticker": "GULF.KW"},
    {"symbol": "KFH", "name": "Kuwait Finance House", "yf_ticker": "KFH.KW"},
    {"symbol": "KIB", "name": "Kuwait International Bank", "yf_ticker": "KIB.KW"},
    {"symbol": "NBK", "name": "National Bank of Kuwait", "yf_ticker": "NBK.KW"},
    {"symbol": "WARBAH", "name": "Warba Bank", "yf_ticker": "WARBAH.KW"},
    
    # INVESTMENT COMPANIES
    {"symbol": "AAYAN", "name": "Aayan Leasing and Investment", "yf_ticker": "AAYAN.KW"},
    {"symbol": "ADEEM", "name": "Adeem Investment Company", "yf_ticker": "ADEEM.KW"},
    {"symbol": "AJIAL", "name": "Ajial Real Estate Entertainment", "yf_ticker": "AJIAL.KW"},
    {"symbol": "ALABRAR", "name": "Al Abrar Holding Company", "yf_ticker": "ALABRAR.KW"},
    {"symbol": "ALAMAN", "name": "Al-Aman Investment", "yf_ticker": "ALAMAN.KW"},
    {"symbol": "ALEQTISAD", "name": "Al-Eqtisad Al-Islami Holding", "yf_ticker": "ALEQTISAD.KW"},
    {"symbol": "ALIMTIAZ", "name": "Al Imtiaz Investment Group", "yf_ticker": "ALIMTIAZ.KW"},
    {"symbol": "ALSAFAT", "name": "Alsafat Investment Company", "yf_ticker": "ALSAFAT.KW"},
    {"symbol": "AMAR", "name": "Amar Finance and Leasing", "yf_ticker": "AMAR.KW"},
    {"symbol": "BAYAN", "name": "Bayan Investment Company", "yf_ticker": "BAYAN.KW"},
    {"symbol": "BUKHAMSEEN", "name": "Noor Financial Investment", "yf_ticker": "BUKHAMSEEN.KW"},
    {"symbol": "CAPM", "name": "Capital Management House", "yf_ticker": "CAPM.KW"},
    {"symbol": "COAST", "name": "Coast Investment & Development", "yf_ticker": "COAST.KW"},
    {"symbol": "DIKKAN", "name": "Al Dikkan Trading Company", "yf_ticker": "DIKKAN.KW"},
    {"symbol": "GFH", "name": "GFH Financial Group", "yf_ticker": "GFH.KW"},
    {"symbol": "INOVEST", "name": "Inovest", "yf_ticker": "INOVEST.KW"},
    {"symbol": "ITHMAAR", "name": "Ithmaar Holding", "yf_ticker": "ITHMAAR.KW"},
    {"symbol": "KAMCO", "name": "KAMCO Investment Company", "yf_ticker": "KAMCO.KW"},
    {"symbol": "KIPCO", "name": "Kuwait Projects Company (Holding)", "yf_ticker": "KIPCO.KW"},
    {"symbol": "KMEFIC", "name": "Kuwait and Middle East Financial Investment", "yf_ticker": "KMEFIC.KW"},
    {"symbol": "MARKAZ", "name": "Kuwait Financial Centre (Markaz)", "yf_ticker": "MARKAZ.KW"},
    {"symbol": "MASHAER", "name": "Mashaer Holding Company", "yf_ticker": "MASHAER.KW"},
    {"symbol": "MUNTAZAH", "name": "Al-Muntazah United Company", "yf_ticker": "MUNTAZAH.KW"},
    {"symbol": "NIH", "name": "National International Holding", "yf_ticker": "NIH.KW"},
    {"symbol": "ORIENT", "name": "Orient Insurance Company", "yf_ticker": "ORIENT.KW"},
    {"symbol": "QURAIN", "name": "Qurain Petrochemical Industries", "yf_ticker": "QURAIN.KW"},
    {"symbol": "SECURITIES", "name": "Kuwait Securities House", "yf_ticker": "SECURITIES.KW"},
    {"symbol": "SUNDOS", "name": "Al-Sundos Holding Company", "yf_ticker": "SUNDOS.KW"},
    {"symbol": "TIJARA", "name": "Tijara & Real Estate Investment", "yf_ticker": "TIJARA.KW"},
    
    # REAL ESTATE
    {"symbol": "ALARGAN", "name": "Al Argan International Real Estate", "yf_ticker": "ALARGAN.KW"},
    {"symbol": "ALDEERA", "name": "Al Deera Holding", "yf_ticker": "ALDEERA.KW"},
    {"symbol": "ALMUDON", "name": "Almudon International Group", "yf_ticker": "ALMUDON.KW"},
    {"symbol": "ALRAYA", "name": "Al-Raya Holding Company", "yf_ticker": "ALRAYA.KW"},
    {"symbol": "ARKAN", "name": "Arkan Al-Kuwait Real Estate", "yf_ticker": "ARKAN.KW"},
    {"symbol": "AQAR", "name": "Aqar Real Estate Investments", "yf_ticker": "AQAR.KW"},
    {"symbol": "BURG", "name": "Al Burg Real Estate Company", "yf_ticker": "BURG.KW"},
    {"symbol": "DAR", "name": "Dar Al-Thuraya Real Estate", "yf_ticker": "DAR.KW"},
    {"symbol": "ENMAA", "name": "Enmaa Real Estate Company", "yf_ticker": "ENMAA.KW"},
    {"symbol": "FIRSTDUBAI", "name": "First Dubai Real Estate Development", "yf_ticker": "FIRSTDUBAI.KW"},
    {"symbol": "IFA", "name": "IFA Hotels & Resorts", "yf_ticker": "IFA.KW"},
    {"symbol": "KRE", "name": "Kuwait Real Estate Company", "yf_ticker": "KRE.KW"},
    {"symbol": "MABANEE", "name": "Mabanee Company", "yf_ticker": "MABANEE.KW"},
    {"symbol": "MANAZEL", "name": "Manazel Holding Company", "yf_ticker": "MANAZEL.KW"},
    {"symbol": "MASAKEN", "name": "Masaken Real Estate Company", "yf_ticker": "MASAKEN.KW"},
    {"symbol": "MAZAYA", "name": "Mazaya Holding Company", "yf_ticker": "MAZAYA.KW"},
    {"symbol": "MUNSHAAT", "name": "Munshaat Real Estate Projects", "yf_ticker": "MUNSHAAT.KW"},
    {"symbol": "RAWASI", "name": "Rawasi Holding Company", "yf_ticker": "RAWASI.KW"},
    {"symbol": "REAL", "name": "Al-Enma'a Real Estate Company", "yf_ticker": "REAL.KW"},
    {"symbol": "SANAM", "name": "Sanam Real Estate Company", "yf_ticker": "SANAM.KW"},
    {"symbol": "SOKOUK", "name": "Al-Soor Fuel Marketing Company", "yf_ticker": "SOKOUK.KW"},
    {"symbol": "TAMDEEN", "name": "Tamdeen Real Estate Company", "yf_ticker": "TAMDEEN.KW"},
    {"symbol": "URC", "name": "United Real Estate Company", "yf_ticker": "URC.KW"},
    {"symbol": "VIVA", "name": "National Real Estate Company", "yf_ticker": "VIVA.KW"},
    
    # INDUSTRIAL
    {"symbol": "ACICO", "name": "ACICO Industries", "yf_ticker": "ACICO.KW"},
    {"symbol": "AGLTY", "name": "Agility Public Warehousing", "yf_ticker": "AGLTY.KW"},
    {"symbol": "ALAFCO", "name": "Aviation Lease and Finance Company", "yf_ticker": "ALAFCO.KW"},
    {"symbol": "ANWAR", "name": "Anwar Al-Qurain Holding Company", "yf_ticker": "ANWAR.KW"},
    {"symbol": "CEMENT", "name": "Hilal Cement Company", "yf_ticker": "CEMENT.KW"},
    {"symbol": "EQUIPMENT", "name": "Al-Ahleia Contracting & Equipment", "yf_ticker": "EQUIPMENT.KW"},
    {"symbol": "GIC", "name": "Gulf Investment Corporation", "yf_ticker": "GIC.KW"},
    {"symbol": "GULFCABLES", "name": "Gulf Cables & Electrical Industries", "yf_ticker": "GULFCABLES.KW"},
    {"symbol": "HEAVY", "name": "Heavy Engineering Industries", "yf_ticker": "HEAVY.KW"},
    {"symbol": "KCC", "name": "Kuwait Cement Company", "yf_ticker": "KCC.KW"},
    {"symbol": "KGL", "name": "Kuwait & Gulf Link Transport", "yf_ticker": "KGL.KW"},
    {"symbol": "KSCC", "name": "Kuwait Supply Company", "yf_ticker": "KSCC.KW"},
    {"symbol": "NIC", "name": "National Industries Company", "yf_ticker": "NIC.KW"},
    {"symbol": "NPCC", "name": "National Petroleum Construction", "yf_ticker": "NPCC.KW"},
    {"symbol": "PIC", "name": "Petrochemical Industries Company", "yf_ticker": "PIC.KW"},
    {"symbol": "SAFWAN", "name": "Safwan Trading & Contracting", "yf_ticker": "SAFWAN.KW"},
    {"symbol": "SALBOOKH", "name": "Salbookh Trading Company", "yf_ticker": "SALBOOKH.KW"},
    {"symbol": "UNICAP", "name": "United Fisheries of Kuwait", "yf_ticker": "UNICAP.KW"},
    
    # SERVICES (Consumer & Technology)
    {"symbol": "ABYAR", "name": "Abyar Real Estate Development", "yf_ticker": "ABYAR.KW"},
    {"symbol": "ALGHANIM", "name": "Alghanim Industries", "yf_ticker": "ALGHANIM.KW"},
    {"symbol": "ALMAHA", "name": "Al Maha Petroleum Marketing", "yf_ticker": "ALMAHA.KW"},
    {"symbol": "ALRAI", "name": "Al Rai Media Group", "yf_ticker": "ALRAI.KW"},
    {"symbol": "AUTOMATED", "name": "Automated Systems Company", "yf_ticker": "AUTOMATED.KW"},
    {"symbol": "BMTC", "name": "Bee'ah Tanmiah", "yf_ticker": "BMTC.KW"},
    {"symbol": "BOURSA", "name": "Boursa Kuwait Securities", "yf_ticker": "BOURSA.KW"},
    {"symbol": "CLEANUP", "name": "Cleanup Kuwait Holding", "yf_ticker": "CLEANUP.KW"},
    {"symbol": "HUMANSOFT", "name": "Humansoft Holding", "yf_ticker": "HUMANSOFT.KW"},
    {"symbol": "HUM", "name": "Humansoft Holding (Alternative)", "yf_ticker": "HUM.KW"},
    {"symbol": "LOGISTICS", "name": "Kuwait Logistics Company", "yf_ticker": "LOGISTICS.KW"},
    {"symbol": "METAHOLDING", "name": "Meta Holding Company", "yf_ticker": "METAHOLDING.KW"},
    {"symbol": "OOREDOO", "name": "Ooredoo Kuwait (NMTC)", "yf_ticker": "OOREDOO.KW"},
    {"symbol": "SAMAHIJ", "name": "Al-Samahij United Company", "yf_ticker": "SAMAHIJ.KW"},
    {"symbol": "SEMAA", "name": "Shuwaikh Educational Holding", "yf_ticker": "SEMAA.KW"},
    {"symbol": "STC", "name": "Kuwait Telecommunications Company (stc)", "yf_ticker": "STC.KW"},
    {"symbol": "TAALEEM", "name": "Taaleem Holdings", "yf_ticker": "TAALEEM.KW"},
    {"symbol": "WETHAQ", "name": "Wethaq Takaful Insurance", "yf_ticker": "WETHAQ.KW"},
    {"symbol": "ZAIN", "name": "Mobile Telecommunications Company (Zain)", "yf_ticker": "ZAIN.KW"},
    
    # INSURANCE
    {"symbol": "ALAHLEIA", "name": "Al Ahleia Insurance", "yf_ticker": "ALAHLEIA.KW"},
    {"symbol": "ALKHALEEJ", "name": "Alkhaleej Takaful Insurance", "yf_ticker": "ALKHALEEJ.KW"},
    {"symbol": "AMAN", "name": "Aman Insurance Company", "yf_ticker": "AMAN.KW"},
    {"symbol": "ARIG", "name": "Al Ahlia Insurance Company", "yf_ticker": "ARIG.KW"},
    {"symbol": "GIG", "name": "Gulf Insurance Group", "yf_ticker": "GIG.KW"},
    {"symbol": "GULFINS", "name": "Gulf Insurance Group", "yf_ticker": "GULFINS.KW"},
    {"symbol": "KIC", "name": "Kuwait Insurance Company", "yf_ticker": "KIC.KW"},
    {"symbol": "KIRE", "name": "Kuwait Reinsurance Company", "yf_ticker": "KIRE.KW"},
    {"symbol": "WARBAAINS", "name": "Warba Insurance Company", "yf_ticker": "WARBAAINS.KW"},
    
    # FOOD & CONSUMER GOODS
    {"symbol": "AMERICANA", "name": "Americana Kuwait (KFIC)", "yf_ticker": "AMERICANA.KW"},
    {"symbol": "ANFAL", "name": "Al Anfal International Catering", "yf_ticker": "ANFAL.KW"},
    {"symbol": "DANAH", "name": "Al-Danah Catering Services", "yf_ticker": "DANAH.KW"},
    {"symbol": "FOODCO", "name": "Kuwait Food Company", "yf_ticker": "FOODCO.KW"},
    {"symbol": "KFIC", "name": "Kuwait Food Company (Americana)", "yf_ticker": "KFIC.KW"},
    {"symbol": "KPP", "name": "Kuwait Portland Cement", "yf_ticker": "KPP.KW"},
    {"symbol": "LIVESTOCK", "name": "Livestock Transport & Trading", "yf_ticker": "LIVESTOCK.KW"},
    {"symbol": "MEZZAN", "name": "Mezzan Holding", "yf_ticker": "MEZZAN.KW"},
    {"symbol": "PALMS", "name": "Palms Agro Production", "yf_ticker": "PALMS.KW"},
    {"symbol": "SHUAIBA", "name": "Shuaiba Industrial Company", "yf_ticker": "SHUAIBA.KW"},
    {"symbol": "WIDAM", "name": "Widam Food Company", "yf_ticker": "WIDAM.KW"},
    
    # HEALTHCARE & PHARMA
    {"symbol": "ALANWAR", "name": "Alanwar Holding Company", "yf_ticker": "ALANWAR.KW"},
    {"symbol": "HEALTH", "name": "Kuwait Health Assurance Hospital", "yf_ticker": "HEALTH.KW"},
    {"symbol": "MEDIC", "name": "International Medical Group", "yf_ticker": "MEDIC.KW"},
    {"symbol": "YIACO", "name": "YIACO Medical Company", "yf_ticker": "YIACO.KW"},
    
    # OTHERS & HOLDING COMPANIES
    {"symbol": "ALEID", "name": "Al-Eid Holding Company", "yf_ticker": "ALEID.KW"},
    {"symbol": "ALMANAR", "name": "Al Manar Financing & Leasing", "yf_ticker": "ALMANAR.KW"},
    {"symbol": "ARABI", "name": "Al-Arabi Holding Group", "yf_ticker": "ARABI.KW"},
    {"symbol": "CREDIT", "name": "Credit Rating & Collection", "yf_ticker": "CREDIT.KW"},
    {"symbol": "DULAIMI", "name": "Al-Dulaimi Trading & Contracting", "yf_ticker": "DULAIMI.KW"},
    {"symbol": "ENERGY", "name": "Energy House Holding", "yf_ticker": "ENERGY.KW"},
    {"symbol": "ESTITMAR", "name": "International Financial Advisors (Estitmar)", "yf_ticker": "ESTITMAR.KW"},
    {"symbol": "FAWAZ", "name": "Fawaz Abdulaziz Al-Hokair & Co", "yf_ticker": "FAWAZ.KW"},
    {"symbol": "INJAZZAT", "name": "Injazzat Real Estate Development", "yf_ticker": "INJAZZAT.KW"},
    {"symbol": "SHARE", "name": "Shareholding Company", "yf_ticker": "SHARE.KW"},
    {"symbol": "TAMKEEN", "name": "Tamkeen Leasing Company", "yf_ticker": "TAMKEEN.KW"},
    {"symbol": "TASLEEM", "name": "Al Tasleem Holding Company", "yf_ticker": "TASLEEM.KW"},
]

def get_kuwait_stock_options():
    """Return formatted list of Kuwait stocks for selectbox."""
    options = ["-- Select from Kuwait Stock List --"] + [
        f"{stock['symbol']} - {stock['name']}" for stock in KUWAIT_STOCKS
    ]
    return options

def parse_kuwait_stock_selection(selection: str):
    """Parse selected stock to extract symbol, name, and Yahoo Finance ticker."""
    if selection == "-- Select from Kuwait Stock List --" or not selection:
        return None, None, None
    
    parts = selection.split(" - ", 1)
    if len(parts) == 2:
        symbol = parts[0].strip()
        name = parts[1].strip()
        # Find the stock in KUWAIT_STOCKS to get yf_ticker
        for stock in KUWAIT_STOCKS:
            if stock["symbol"] == symbol:
                return symbol, name, stock["yf_ticker"]
    return None, None, None

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
DB_PATH = "portfolio.db"


# =========================
# DB HELPERS
# =========================
def get_conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


def query_df(sql, params=()):
    conn = get_conn()
    df = pd.read_sql_query(sql, conn, params=params)
    conn.close()
    return df


def exec_sql(sql, params=()):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    conn.close()


def table_columns(table_name: str) -> set:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table_name})")
    cols = {row[1] for row in cur.fetchall()}
    conn.close()
    return cols


def add_column_if_missing(table: str, col: str, coltype: str):
    cols = table_columns(table)
    if col not in cols:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")
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
                            # Kuwait stocks: divide by 1000 (fils to KWD)
                            if is_kuwait_stock:
                                price = price / 1000.0
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
    conn = get_conn()
    cur = conn.cursor()

    # Cash deposits
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS cash_deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    
    # Add portfolio column if it doesn't exist
    add_column_if_missing("cash_deposits", "portfolio", "TEXT DEFAULT 'KFH'")
    # Add include_in_analysis column if it doesn't exist
    add_column_if_missing("cash_deposits", "include_in_analysis", "INTEGER DEFAULT 1")
    # Add currency column if it doesn't exist
    add_column_if_missing("cash_deposits", "currency", "TEXT DEFAULT 'KWD'")

    # Stocks
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL UNIQUE,
            name TEXT
        )
        """
    )

    # Transactions
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_symbol TEXT NOT NULL,
            txn_date TEXT NOT NULL,
            txn_type TEXT NOT NULL CHECK(txn_type IN ('Buy','Sell','DIVIDEND_ONLY')),
            purchase_cost REAL NOT NULL DEFAULT 0,
            sell_value REAL NOT NULL DEFAULT 0,
            shares REAL NOT NULL DEFAULT 0,
            reinvested_dividend REAL NOT NULL DEFAULT 0,
            notes TEXT,
            created_at INTEGER NOT NULL
        )
        """
    )

    conn.commit()
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
    
    migrate_transaction_type_constraint()
    
    # Portfolio tracker snapshots
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_date TEXT NOT NULL UNIQUE,
            portfolio_value REAL NOT NULL,
            daily_movement REAL DEFAULT 0,
            beginning_difference REAL DEFAULT 0,
            deposit_cash REAL DEFAULT 0,
            accumulated_cash REAL DEFAULT 0,
            net_gain REAL DEFAULT 0,
            change_percent REAL DEFAULT 0,
            roi_percent REAL DEFAULT 0,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()
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
            # Don't show error in UI unless debugging
            # st.error(f"MWRR calculation error: {e}")
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
    stocks = query_df(
        """
        SELECT
            symbol,
            COALESCE(name,'') AS name,
            COALESCE(current_price,0) AS current_price,
            COALESCE(portfolio,'KFH') AS portfolio,
            COALESCE(currency,'KWD') AS currency
        FROM stocks
        WHERE COALESCE(portfolio,'KFH') = ?
        ORDER BY symbol ASC
        """,
        (portfolio_name,),
    )

    if stocks.empty:
        return pd.DataFrame()

    rows = []
    for _, srow in stocks.iterrows():
        sym = srow["symbol"]
        cp = safe_float(srow["current_price"], 0.0)

        tx = query_df(
            """
            SELECT
                id, stock_symbol, txn_date, txn_type,
                purchase_cost, sell_value, shares,
                bonus_shares, cash_dividend,
                price_override, planned_cum_shares,
                reinvested_dividend, fees,
                broker, reference, notes, created_at
            FROM transactions
            WHERE stock_symbol = ? AND COALESCE(category, 'portfolio') = 'portfolio'
            ORDER BY txn_date ASC, created_at ASC, id ASC
            """,
            (sym,),
        )

        h = compute_holdings_avg_cost(tx)

        qty = h["shares"]
        total_cost = h["cost_basis"]
        avg_cost = (total_cost / qty) if qty > 0 else 0.0

        mkt_price = cp
        mkt_value = qty * mkt_price
        unreal = mkt_value - total_cost

        cash_div = h["cash_div"]
        bonus_sh = h["bonus_shares"]  # keep for disclosure, but DO NOT value it

        # Dividend yield on cost (historical)
        yield_pct = (cash_div / total_cost) if total_cost > 0 else 0.0

        # CFA total return (KD) for open position: (Market Value + Cash Dividends) - Total Cost
        total_pnl = (mkt_value + cash_div) - total_cost
        
        # Total return % on cost
        pnl_pct = (total_pnl / total_cost) if total_cost > 0 else 0.0
        
        reinv_div = h["reinv"]

        # Show the stock `name` first (if present) then the `symbol` so edits to the name
        # fully replace the visible company label in the UI.
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
    
    # Filter out stocks with zero cost AND zero shares
    # Use epsilon (0.001) to handle floating point residuals and effectively zero positions
    if not df.empty:
        df = df[
            (df["Total Cost"].abs() > 0.001) | 
            (df["Shares Qty"].abs() > 0.001)
        ]

    # weights + weighted yield
    total_cost_sum = float(df["Total Cost"].sum()) if not df.empty else 0.0
    df["Weight by Cost"] = df["Total Cost"].apply(lambda x: (x / total_cost_sum) if total_cost_sum > 0 else 0.0)
    df["Weighted Dividend Yield on Cost"] = df["Dividend Yield on Cost %"] * df["Weight by Cost"]

    # sort like your excel (largest weight first)
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
    format_dict = {
        "Quantity": "{:,.0f}",
        "Avg. Cost Per Share": "{:,.3f}",
        "Total cost": "{:,.3f}",
        "Market price": "{:,.3f}",
        "P/E Ratio": "{:.2f}",
        "Market value": "{:,.3f}",
        "Appreciation income": "{:,.3f}",
        "Cash dividends": "{:,.3f}",
        "amount reinvested from dividends": "{:,.3f}",
        "Bonus dividend shares": "{:,.0f}",
        "Bonus share value": "{:,.3f}",
        "weight by Cost": "{:.2%}",
        "Yield": "{:.2%}",
        "Yield Amount": "{:,.3f}",
        "Weighted yield": "{:.2%}",
        "Current Profit / Loss": "{:,.3f}",
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
    st.subheader("💰 Cash Deposits")
    
    # Clean up any deposits from year 1970 (likely corrupt data)
    try:
        corrupt_deposits = query_df(
            "SELECT COUNT(*) as count FROM cash_deposits WHERE deposit_date LIKE '1970%'"
        )
        if not corrupt_deposits.empty and corrupt_deposits["count"].iloc[0] > 0:
            count = corrupt_deposits["count"].iloc[0]
            exec_sql("DELETE FROM cash_deposits WHERE deposit_date LIKE '1970%'")
            st.success(f"🧹 Cleaned up {count} corrupt deposit(s) from year 1970")
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
                        INSERT INTO cash_deposits (portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
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
                        existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ?", (deposit_date_str,))
                        
                        if not existing.empty:
                            # Update existing snapshot with the deposit
                            exec_sql(
                                "UPDATE portfolio_snapshots SET deposit_cash = deposit_cash + ? WHERE snapshot_date = ?",
                                (float(amount), deposit_date_str)
                            )
                        else:
                            # Create new snapshot with just the deposit
                            # Get accumulated cash from previous date
                            prev_snap = query_df(
                                "SELECT accumulated_cash FROM portfolio_snapshots WHERE snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1",
                                (deposit_date_str,)
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
                                (snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (deposit_date_str, 0, 0, 0, float(amount), accumulated_cash, net_gain, 0, roi_percent, int(time.time()))
                            )
                    
                    success_msg = "Deposit saved!"
                    if include_in_analysis:
                        success_msg += " ✅ Added to Portfolio Analysis."
                    else:
                        success_msg += " 📝 Saved as record only (not in analysis)."
                    st.success(success_msg)
                    st.rerun()
    
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
        
        if uploaded_file:
            if st.button("Upload Deposits", type="primary"):
                try:
                    df = pd.read_excel(uploaded_file, sheet_name=0)
                    
                    # Normalize column names
                    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
                    
                    # Validate required columns
                    required_cols = ["deposit_date", "amount", "currency", "portfolio", "include_in_analysis"]
                    missing = [c for c in required_cols if c not in df.columns]
                    if missing:
                        st.error(f"Missing required columns: {', '.join(missing)}")
                    else:
                        # Add default values for optional columns
                        if "bank_name" not in df.columns:
                            df["bank_name"] = "N/A"
                        if "description" not in df.columns:
                            df["description"] = ""
                        if "comments" not in df.columns:
                            df["comments"] = ""
                        
                        success_count = 0
                        error_count = 0
                        in_analysis_count = 0
                        record_only_count = 0
                        
                        for idx, row in df.iterrows():
                            try:
                                deposit_date_val = row["deposit_date"]
                                if isinstance(deposit_date_val, str):
                                    deposit_date_str = deposit_date_val
                                else:
                                    deposit_date_str = pd.to_datetime(deposit_date_val).strftime("%Y-%m-%d")
                                
                                amount_val = float(row["amount"])
                                currency_val = str(row["currency"]).strip().upper()
                                portfolio_val = str(row["portfolio"]).strip()
                                bank_name_val = str(row.get("bank_name", "N/A")).strip()
                                description_val = str(row.get("description", "")).strip()
                                comments_val = str(row.get("comments", "")).strip()
                                
                                # Parse include_in_analysis column
                                include_val = str(row["include_in_analysis"]).strip().lower()
                                include_in_analysis = include_val in ["yes", "y", "true", "1", "portfolio"]
                                
                                if include_in_analysis:
                                    in_analysis_count += 1
                                else:
                                    record_only_count += 1
                                
                                # Insert into database
                                exec_sql(
                                    """
                                    INSERT INTO cash_deposits (portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """,
                                    (
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
                                    existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ?", (deposit_date_str,))
                                    
                                    if not existing.empty:
                                        exec_sql(
                                            "UPDATE portfolio_snapshots SET deposit_cash = deposit_cash + ? WHERE snapshot_date = ?",
                                            (amount_val, deposit_date_str)
                                        )
                                    else:
                                        prev_snap = query_df(
                                            "SELECT accumulated_cash FROM portfolio_snapshots WHERE snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1",
                                            (deposit_date_str,)
                                        )
                                        
                                        if not prev_snap.empty:
                                            prev_acc = prev_snap["accumulated_cash"].iloc[0]
                                            accumulated_cash = (float(prev_acc) if pd.notna(prev_acc) else 0) + amount_val
                                        else:
                                            accumulated_cash = amount_val
                                        
                                        net_gain = 0 - accumulated_cash
                                        roi_percent = 0
                                        
                                        exec_sql(
                                            """
                                            INSERT INTO portfolio_snapshots 
                                            (snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                                             deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                            """,
                                            (deposit_date_str, 0, 0, 0, amount_val, accumulated_cash, net_gain, 0, roi_percent, int(time.time()))
                                        )
                                
                                success_count += 1
                            except Exception as e:
                                error_count += 1
                                st.warning(f"Row {idx + 1} failed: {e}")
                        
                        if success_count > 0:
                            status_msg = f"✅ Successfully imported {success_count} deposits!"
                            if in_analysis_count > 0:
                                status_msg += f" ({in_analysis_count} added to portfolio analysis"
                                if record_only_count > 0:
                                    status_msg += f", {record_only_count} as records only)"
                                else:
                                    status_msg += ")"
                            elif record_only_count > 0:
                                status_msg += f" ({record_only_count} saved as records only)"
                            st.success(status_msg)
                        if error_count > 0:
                            st.error(f"❌ {error_count} deposits failed to import.")
                        
                        st.rerun()
                        
                except Exception as e:
                    st.error(f"Error reading Excel file: {e}")


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
            WHERE include_in_analysis = 1
            ORDER BY deposit_date {sort_order}, id {sort_order}
            """
        )
    elif filter_option == "Records Only":
        deposits = query_df(
            f"""
            SELECT id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis
            FROM cash_deposits
            WHERE include_in_analysis = 0
            ORDER BY deposit_date {sort_order}, id {sort_order}
            """
        )
    else:
        deposits = query_df(
            f"""
            SELECT id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis
            FROM cash_deposits
            ORDER BY deposit_date {sort_order}, id {sort_order}
            """
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
                # Hard delete all deposits
                conn = get_conn()
                cur = conn.cursor()
                cur.execute("DELETE FROM cash_deposits")
                cur.execute("DELETE FROM sqlite_sequence WHERE name='cash_deposits'")
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
                            cur.execute("DELETE FROM cash_deposits WHERE id = ?", (deposit_id,))
                            conn.commit()
                            conn.close()
                            st.rerun()
                
                st.divider()

def ui_upload_transactions_excel():
    st.subheader("📥 Upload Transactions (Excel)")

    st.caption(
        "Upload an .xlsx file with a sheet named 'Transactions' (recommended). "
        "Required columns: company, txn_date, txn_type, shares. "
        "For Buy: purchase_cost. For Sell: sell_value. "
        "Optional: bonus_shares, cash_dividend, reinvested_dividend, fees, broker, reference, notes, price_override, planned_cum_shares."
    )

    # Provide a downloadable sample Excel template to guide users
    try:
        sample_df = pd.DataFrame([
            {
                "company": "KIB",
                "txn_date": date.today().isoformat(),
                "txn_type": "Buy",
                "shares": 100,
                "purchase_cost": 100.0,
                "sell_value": "",
                "bonus_shares": 0,
                "cash_dividend": 0.0,
                "reinvested_dividend": 0.0,
                "fees": 0.0,
                "broker": "KFH",
                "reference": "REF123",
                "notes": "Example row",
                "price_override": "",
                "planned_cum_shares": "",
            }
        ])

        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            sample_df.to_excel(writer, sheet_name="Transactions", index=False)
        buf.seek(0)

        st.download_button(
            label="Download sample Excel template",
            data=buf,
            file_name="transactions_template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        with st.expander("Template & Tips", expanded=False):
            st.markdown("- Required columns: **company**, **txn_date** (YYYY-MM-DD), **txn_type** (Buy/Sell), **shares**")
            st.markdown("- For `Buy` rows: include **purchase_cost**. For `Sell` rows: include **sell_value**.")
            st.markdown("- Optional columns: `bonus_shares`, `cash_dividend`, `reinvested_dividend`, `fees`, `broker`, `reference`, `notes`, `price_override`, `planned_cum_shares`.")
            st.markdown("- Column names are normalized (spaces, dashes converted). The uploader will try common alternatives (e.g. `symbol`, `ticker` for `company`).")
            st.markdown("- Use the `Transactions` sheet name if possible; otherwise the first sheet will be used.")
            st.markdown("- See `.github/copilot-instructions.md` for more repository-specific guidance.")
    except Exception:
        # If writing the template fails (missing dependency), fall back silently and still show uploader
        pass

    file = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"], key="txn_excel_uploader")
    if not file:
        return

    try:
        xl = pd.ExcelFile(file)
        sheet = "Transactions" if "Transactions" in xl.sheet_names else xl.sheet_names[0]
        raw = xl.parse(sheet_name=sheet)
    except Exception as e:
        st.error(f"Could not read the Excel file: {e}")
        return

    if raw.empty:
        st.warning("Excel sheet is empty.")
        return

    # Normalize columns
    df = raw.copy()
    df.columns = [_norm_col(c) for c in df.columns]

    company_col = _pick_col(df, ["company", "symbol", "ticker", "stock", "stock_symbol", "asset"])
    date_col = _pick_col(df, ["txn_date", "date", "trade_date"])
    type_col = _pick_col(df, ["txn_type", "type", "side"])
    shares_col = _pick_col(df, ["shares", "quantity", "qty"])

    buy_cost_col = _pick_col(df, ["purchase_cost", "buy_cost", "total_cost", "cost"])
    sell_val_col = _pick_col(df, ["sell_value", "sell_val", "proceeds", "value"])

    bonus_col = _pick_col(df, ["bonus_shares", "bonus_dividend_shares", "stock_dividend", "stock_dividend_shares"])
    cash_div_col = _pick_col(df, ["cash_dividend", "cash_dividends", "dividend_cash", "cash_div"])
    reinv_col = _pick_col(df, ["reinvested_dividend", "reinvested_dividends", "reinv", "reinvested"])
    fees_col = _pick_col(df, ["fees", "fee", "commission"])
    broker_col = _pick_col(df, ["broker", "platform"])
    ref_col = _pick_col(df, ["reference", "order_id", "ref"])
    notes_col = _pick_col(df, ["notes", "comment", "comments", "description"])

    override_col = _pick_col(df, ["price_override", "override_price", "override"])
    planned_col = _pick_col(df, ["planned_cum_shares", "planned_cum", "planned", "planned_cum_qty"])

    required_missing = []
    if not company_col:
        required_missing.append("company")
    if not date_col:
        required_missing.append("txn_date")
    if not type_col:
        required_missing.append("txn_type")
    if not shares_col:
        required_missing.append("shares")

    if required_missing:
        st.error(f"Missing required columns: {', '.join(required_missing)}")
        st.info("Expected columns (minimum): company, txn_date, txn_type, shares")
        st.write("Detected columns:", list(df.columns))
        return

    preview_cols = [company_col, date_col, type_col, shares_col]
    for c in [buy_cost_col, sell_val_col, bonus_col, cash_div_col, reinv_col, fees_col, broker_col, ref_col, notes_col]:
        if c and c not in preview_cols:
            preview_cols.append(c)

    st.markdown("### Preview (first 50 rows)")
    st.dataframe(df[preview_cols].head(50), use_container_width=True)

    errors = []
    warnings_list = []
    inserts = []

    tx_cols = table_columns("transactions")

    for col, coltype in [
        ("bonus_shares", "REAL DEFAULT 0"),
        ("cash_dividend", "REAL DEFAULT 0"),
        ("price_override", "REAL DEFAULT NULL"),
        ("planned_cum_shares", "REAL DEFAULT NULL"),
        ("fees", "REAL DEFAULT 0"),
        ("broker", "TEXT"),
        ("reference", "TEXT"),
    ]:
        if col not in tx_cols:
            add_column_if_missing("transactions", col, coltype)

    for idx, r in df.iterrows():
        company = _safe_str(r.get(company_col)).upper()
        iso_date = _to_iso_date(r.get(date_col))
        ttype = _safe_str(r.get(type_col)).title()
        shares = _safe_num(r.get(shares_col), 0)

        if company == "":
            errors.append(f"Row {idx+2}: company is empty")
            continue
        if iso_date == "":
            errors.append(f"Row {idx+2}: invalid txn_date")
            continue
        if ttype not in ("Buy", "Sell"):
            errors.append(f"Row {idx+2}: txn_type must be Buy or Sell")
            continue

        # Accept empty/zero shares and costs. Record as 0.0 but surface warnings.
        purchase_cost = _safe_num(r.get(buy_cost_col), 0.0) if buy_cost_col else 0.0
        sell_value = _safe_num(r.get(sell_val_col), 0.0) if sell_val_col else 0.0

        if shares <= 0:
            warnings_list.append(f"Row {idx+2}: shares empty or <= 0 — recorded as 0.0")

        if ttype == "Buy" and purchase_cost <= 0:
            warnings_list.append(f"Row {idx+2}: purchase_cost empty or <= 0 for Buy — recorded as 0.0")

        if ttype == "Sell" and sell_value <= 0:
            warnings_list.append(f"Row {idx+2}: sell_value empty or <= 0 for Sell — recorded as 0.0")

        bonus_shares = _safe_num(r.get(bonus_col), 0.0) if bonus_col else 0.0
        cash_dividend = _safe_num(r.get(cash_div_col), 0.0) if cash_div_col else 0.0
        reinvested_dividend = _safe_num(r.get(reinv_col), 0.0) if reinv_col else 0.0
        fees = _safe_num(r.get(fees_col), 0.0) if fees_col else 0.0

        broker = _safe_str(r.get(broker_col)) if broker_col else ""
        reference = _safe_str(r.get(ref_col)) if ref_col else ""
        notes = _safe_str(r.get(notes_col)) if notes_col else ""

        price_override = None
        if override_col:
            ov = r.get(override_col)
            if not (ov is None or (isinstance(ov, float) and pd.isna(ov)) or (isinstance(ov, str) and str(ov).strip() == "")):
                price_override = _safe_num(ov, 0.0)

        planned_cum_shares = None
        if planned_col:
            pv = r.get(planned_col)
            if not (pv is None or (isinstance(pv, float) and pd.isna(pv)) or (isinstance(pv, str) and str(pv).strip() == "")):
                planned_cum_shares = _safe_num(pv, 0.0)

        existing = query_df("SELECT symbol FROM stocks WHERE symbol = ?", (company,))
        if existing.empty:
            try:
                exec_sql("INSERT INTO stocks (symbol, name, current_price) VALUES (?, ?, ?)", (company, "", 0.0))
            except Exception:
                exec_sql("INSERT INTO stocks (symbol, name) VALUES (?, ?)", (company, ""))

        inserts.append(
            (
                company,
                iso_date,
                ttype,
                float(purchase_cost),
                float(sell_value),
                float(shares),
                float(bonus_shares),
                float(cash_dividend),
                price_override,
                planned_cum_shares,
                float(reinvested_dividend),
                float(fees),
                broker.strip(),
                reference.strip(),
                notes.strip(),
                int(time.time()),
            )
        )

    if errors:
        st.error("Validation failed. Fix these rows in Excel and re-upload:")
        st.write(errors[:50])
        return

    # Show non-blocking warnings (if any) but allow import
    if warnings_list:
        st.warning("Warnings detected in file (non-blocking). See first 50:")
        st.write(warnings_list[:50])

    st.success(f"✅ File validated. Rows ready to import: {len(inserts):,}")

    if st.button("Import to Database", type="primary"):
        conn = get_conn()
        cur = conn.cursor()

        inserted = 0
        skipped = 0
        skipped_rows = []

        for row in inserts:
            (
                company,
                iso_date,
                ttype,
                purchase_cost,
                sell_value,
                shares_val,
                bonus_shares,
                cash_dividend,
                price_override_val,
                planned_cum_shares_val,
                reinvested_dividend_val,
                fees_val,
                broker_val,
                reference_val,
                notes_val,
                created_at_val,
            ) = row

            # Duplicate detection: same stock_symbol, txn_date, txn_type, shares,
            # same cost field (purchase_cost for Buy, sell_value for Sell), and same category.
            # Also check dividends to distinguish dividend-only transactions with zero shares.
            if ttype == "Buy":
                cur.execute(
                    """
                    SELECT id FROM transactions
                    WHERE stock_symbol = ? AND txn_date = ? AND txn_type = ? AND category = ?
                      AND shares = ? AND purchase_cost = ?
                      AND COALESCE(cash_dividend, 0) = ? AND COALESCE(bonus_shares, 0) = ?
                    """,
                    (company, iso_date, ttype, 'portfolio', float(shares_val), float(purchase_cost),
                     float(cash_dividend), float(bonus_shares)),
                )
            else:
                cur.execute(
                    """
                    SELECT id FROM transactions
                    WHERE stock_symbol = ? AND txn_date = ? AND txn_type = ? AND category = ?
                      AND shares = ? AND sell_value = ?
                      AND COALESCE(cash_dividend, 0) = ? AND COALESCE(bonus_shares, 0) = ?
                    """,
                    (company, iso_date, ttype, 'portfolio', float(shares_val), float(sell_value),
                     float(cash_dividend), float(bonus_shares)),
                )

            if cur.fetchone():
                skipped += 1
                skipped_rows.append(f"{company} {iso_date} {ttype} shares={shares_val} cost={purchase_cost if ttype=='Buy' else sell_value}")
                continue

            # Insert if not duplicate
            cur.execute(
                """
                INSERT INTO transactions
                (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares,
                 bonus_shares, cash_dividend,
                 price_override, planned_cum_shares, reinvested_dividend, fees,
                 broker, reference, notes, category, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                row + ('portfolio',),
            )
            inserted += 1

        conn.commit()
        conn.close()

        # Show confirmation modal (fall back to inline messages if modal not available)
        # Show confirmation modal with icon. Fall back to inline messages if modal unavailable.
        try:
            with st.modal("Import Result"):
                st.markdown("# ✅ Upload Successful")
                st.write(f"Imported: **{inserted}**")
                st.write(f"Skipped duplicates: **{skipped}**")
                
                # Show which stocks were imported
                if inserted > 0:
                    imported_stocks = list(set([row[0] for row in inserts]))
                    st.write(f"**Stocks imported:** {', '.join(imported_stocks)}")
                    st.info("💡 Go to 'Add Transactions' tab and select the stock from the dropdown to view the transactions.")
                
                if skipped > 0:
                    with st.expander("View skipped rows (first 50)"):
                        st.write(skipped_rows[:50])
                st.write("")
                st.button("Close")
        except Exception:
            st.success(f"✅ Imported: {inserted}")
            if skipped > 0:
                st.warning(f"Skipped duplicates: {skipped}")
                st.write(skipped_rows[:50])
            
            # Show which stocks were imported
            if inserted > 0:
                imported_stocks = list(set([row[0] for row in inserts]))
                st.info(f"**Stocks imported:** {', '.join(imported_stocks)}")
                st.info("💡 Go to 'Add Transactions' tab and select the stock from the dropdown to view the transactions.")

        st.rerun()

# =========================
# UI - TRANSACTIONS
# =========================
def ui_transactions():
    st.subheader("Add Transactions (per stock)")
    
    # --- Export All Transactions Option ---
    with st.expander("📥 Export All Transactions (Excel)"):
        st.caption("Download a complete list of all transactions for all stocks.")
        
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
                label="📄 Download Excel File",
                data=buffer.getvalue(),
                file_name=f"all_transactions_{date.today().strftime('%Y-%m-%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        else:
            st.info("No transactions found.")
    
    # Add stock section first
    with st.expander("➕ Add Stock", expanded=False):
        # Option to choose between Kuwait stocks list or manual entry
        add_mode = st.radio(
            "Add Stock Mode",
            ["📋 Select from Kuwait Stock List", "✍️ Manual Entry (Any Stock)"],
            horizontal=True,
            key="add_stock_mode"
        )
        
        if add_mode == "📋 Select from Kuwait Stock List":
            # Kuwait stocks dropdown with search
            kuwait_options = get_kuwait_stock_options()
            selected_kuwait = st.selectbox(
                "Search and select Kuwait stock",
                options=kuwait_options,
                key="kuwait_stock_selector"
            )
            
            symbol_parsed, name_parsed, yf_ticker = parse_kuwait_stock_selection(selected_kuwait)
            
            col1, col2, col3 = st.columns([1.5, 1.5, 1.5])
            with col1:
                portfolio = st.selectbox("Portfolio", ["KFH", "BBYN", "USA"], key="kw_portfolio")
            with col2:
                currency = st.selectbox("Currency", ["KWD", "USD"], key="kw_currency")
            with col3:
                st.write("")  # spacing
                st.write("")  # spacing
                if st.button("Add Stock", type="primary", key="add_kw_stock"):
                    if symbol_parsed:
                        try:
                            # Use the base symbol (without .KW) for storage
                            exec_sql(
                                "INSERT INTO stocks (symbol, name, current_price, portfolio, currency) VALUES (?, ?, ?, ?, ?)",
                                (symbol_parsed, name_parsed, 0.0, portfolio, currency),
                            )
                            st.success(f"Stock {symbol_parsed} ({name_parsed}) added. Yahoo Finance ticker: {yf_ticker}")
                            st.rerun()
                        except sqlite3.IntegrityError:
                            st.warning("This symbol already exists.")
                    else:
                        st.error("Please select a stock from the list.")
            
            if symbol_parsed:
                st.info(f"📊 Symbol: **{symbol_parsed}** | Yahoo Finance: **{yf_ticker}**")
        
        else:
            # Manual entry mode (original functionality)
            c1, c2, c3, c4, c5 = st.columns([1.3, 3.5, 1.2, 1.2, 1.2])
            symbol = c1.text_input("Symbol", placeholder="e.g. AAPL, TSLA")
            name = c2.text_input("Name (optional)", placeholder="Stock full name (optional)")
            portfolio = c3.selectbox("Portfolio", ["KFH", "BBYN", "USA"], key="manual_portfolio")
            currency = c4.selectbox("Currency", ["KWD", "USD"], key="manual_currency")
            if c5.button("Add Stock", type="primary", key="add_manual_stock"):
                sym = symbol.strip()
                if sym == "":
                    st.error("Symbol is required.")
                else:
                    try:
                        exec_sql(
                            "INSERT INTO stocks (symbol, name, current_price, portfolio, currency) VALUES (?, ?, ?, ?, ?)",
                            (sym, name.strip(), 0.0, portfolio, currency),
                        )
                        st.success(f"Stock {sym} added.")
                        st.rerun()
                    except sqlite3.IntegrityError:
                        st.warning("This symbol already exists.")

    st.divider()

    stocks = query_df(
        """
        SELECT
            symbol,
            COALESCE(name,'') AS name,
            COALESCE(current_price,0) AS current_price,
            COALESCE(portfolio,'KFH') AS portfolio,
            COALESCE(currency,'KWD') AS currency
        FROM stocks
        ORDER BY symbol ASC
        """
    )
    if stocks.empty:
        st.info("Add a stock first, then you can add transactions.")
        return

    # Show the stock `name` first (if present) then the `symbol` so edits to the name
    # appear as the primary label in the selectbox.
    stock_options = [
        (f"{r['name']} - {r['symbol']}".strip()) if (r.get('name') and str(r.get('name')).strip() != '') else r['symbol']
        for _, r in stocks.iterrows()
    ]
    selected_opt = st.selectbox("Select stock", stock_options)
    # selected_opt may be either "Name - SYMBOL" or just "SYMBOL"; extract the symbol
    selected_symbol = selected_opt.rsplit(" - ", 1)[-1].strip()

    stock_row = stocks[stocks["symbol"] == selected_symbol].iloc[0]
    current_price_db = safe_float(stock_row["current_price"], 0)

    # Save current price per stock
    cpx1, cpx2, cpx3 = st.columns([1, 3, 1])
    with cpx1:
        new_cp = st.number_input("Current Price", min_value=0.0, step=0.001, format="%.6f", value=float(current_price_db))
    with cpx2:
        col_save, col_fetch = st.columns([1, 1])
        with col_save:
            if st.button("Save Current Price"):
                exec_sql("UPDATE stocks SET current_price = ? WHERE symbol = ?", (float(new_cp), selected_symbol))
                st.success("Current price saved.")
                st.rerun()

        with col_fetch:
            if st.button("Fetch Current Price"):
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
                                            exec_sql("UPDATE stocks SET tradingview_symbol = ?, tradingview_exchange = ? WHERE symbol = ?", (cand_sym, cand_exch, selected_symbol))
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
                        exec_sql("UPDATE stocks SET current_price = ? WHERE symbol = ?", (float(p), selected_symbol))
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
                    conn = get_conn()
                    cur = conn.cursor()
                    
                    # Delete all PORTFOLIO transactions for this stock (not trading)
                    cur.execute("DELETE FROM transactions WHERE stock_symbol = ? AND COALESCE(category, 'portfolio') = 'portfolio'", (selected_symbol,))
                    txn_deleted = cur.rowcount
                    
                    # Delete the stock itself
                    cur.execute("DELETE FROM stocks WHERE symbol = ?", (selected_symbol,))
                    
                    conn.commit()
                    conn.close()
                    
                    # Clear confirmation state
                    del st.session_state['confirm_delete_stock']
                    
                    st.success(f"✅ Deleted {selected_symbol} and {txn_deleted} transactions")
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
                    exec_sql("UPDATE stocks SET name = ? WHERE symbol = ?", (edited_name, selected_symbol))
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
                    dup = query_df("SELECT COUNT(1) AS c FROM stocks WHERE symbol = ?", (ns,))
                    if int(dup.iloc[0]["c"]) > 0:
                        st.error(f"Cannot rename: symbol '{ns}' already exists.")
                    else:
                        try:
                            conn = get_conn()
                            cur = conn.cursor()
                            # perform updates inside a transaction
                            cur.execute("BEGIN")
                            cur.execute("UPDATE transactions SET stock_symbol = ? WHERE stock_symbol = ?", (ns, current_symbol))
                            cur.execute("UPDATE stocks SET symbol = ? WHERE symbol = ?", (ns, current_symbol))
                            conn.commit()
                            conn.close()
                            st.success(f"Ticker renamed {current_symbol} → {ns} and transactions updated.")
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
                    options = [f"{c['tv_symbol']} — {c.get('full_name','')} ({c.get('exchange','')})" for c in tv_cands]
                    choice = st.radio("Select TradingView symbol", options, key=f"tv_map_{selected_symbol}")
                    idx = options.index(choice)
                    chosen = tv_cands[idx]
                    if st.button("Apply TradingView Symbol"):
                        try:
                            exec_sql("UPDATE stocks SET tradingview_symbol = ?, tradingview_exchange = ? WHERE symbol = ?", (chosen['tv_symbol'], chosen.get('exchange'), selected_symbol))
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
            created_at
        FROM transactions
        WHERE stock_symbol = ? AND COALESCE(category, 'portfolio') = 'portfolio'
        ORDER BY txn_date ASC, created_at ASC, id ASC
        """,
        (selected_symbol,),
    )

    metrics = compute_stock_metrics(tx)
    current_price = float(new_cp)
    market_value = metrics["current_shares"] * current_price

    st.markdown(f"### Transactions for: **{selected_symbol}**")
    
    # Excel Upload for this stock
    with st.expander("📥 Upload Transactions for this Stock (Excel)", expanded=False):
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
                    
                    st.write(f"Preview ({len(df)} rows):")
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
                            st.success(f"✅ Imported {imported} transactions for {selected_symbol}")
                            time.sleep(1)
                            st.rerun()
                        
            except Exception as e:
                st.error(f"Error reading Excel: {e}")

    s1, s2, s3, s4, s5, s6 = st.columns(6)
    s1.metric("Total Purchase", fmt_money_plain(metrics["total_buy_cost"]))
    s2.metric("Total Shares Purchased", fmt_int(metrics["total_buy_shares"]))
    s3.metric("Total Shares (Current)", fmt_int(metrics["current_shares"]))
    s4.metric("Average Cost", f"{metrics['avg_cost']:.6f}")
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
            st.info("📊 Recording dividends only (no trade/shares impact)")
            
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
                c6.caption("Price will be calculated automatically from cost/value ÷ shares.")

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
                        st.warning("Shares is empty or zero — transaction will be recorded with 0 shares.")
                    if txn_type == "Buy" and purchase_cost <= 0:
                        st.warning("Purchase cost is empty or zero — recorded as 0.0.")
                    if txn_type == "Sell" and sell_value <= 0:
                        st.warning("Sell value is empty or zero — recorded as 0.0.")

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

    view = compute_transactions_view(tx)
    
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
                    st.info("📊 Editing dividend-only transaction")
                    
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
                cols[12].write(str(row.get('notes', ''))[:20] + "..." if len(str(row.get('notes', ''))) > 20 else str(row.get('notes', '')))
                
                if cols[13].button("✏️", key=f"edit_btn_{tx_id}"):
                    st.session_state.editing_tx_id = tx_id
                    st.rerun()
                
                st.divider()

    with st.expander("⚠️ Remove Stock (deletes all transactions)"):
        st.warning("This deletes the stock AND all related PORTFOLIO transactions (trading transactions are preserved).")
        if st.button(f"Remove {selected_symbol}", type="secondary"):
            exec_sql("DELETE FROM transactions WHERE stock_symbol = ? AND COALESCE(category, 'portfolio') = 'portfolio'", (selected_symbol,))
            exec_sql("DELETE FROM stocks WHERE symbol = ?", (selected_symbol,))
            st.success("Stock removed.")
            st.rerun()


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
        from datetime import datetime
        st.markdown(f"""
        <div class="app-status">
            ⏱ Last update<br>
            <strong>{datetime.now().strftime("%b %d, %H:%M")}</strong>
        </div>
        """, unsafe_allow_html=True)
    
    with col3:
        st.write("")  # Spacing for alignment
        if st.button("🔄 Fetch All Prices", key="fetch_all_portfolio", use_container_width=True):
            stocks_df = query_df("SELECT DISTINCT symbol FROM stocks ORDER BY symbol ASC")
            if stocks_df.empty:
                st.info("No stocks in portfolio to update.")
            else:
                symbols = stocks_df["symbol"].tolist()
                
                # Check if yfinance is available
                if not YFINANCE_AVAILABLE:
                    st.error(f"⚠️ yfinance not available: {YFINANCE_ERROR}")
                    st.info("Please install yfinance: pip install yfinance")
                else:
                    st.info(f"Fetching prices for {len(symbols)} stocks...")
                    st.caption("⏱️ Using cached prices when available (1 hour TTL). First fetch may be slow due to rate limiting.")
                    
                    conn = get_conn()
                    cur = conn.cursor()
                    updated = 0
                    skipped = 0
                    failed_symbols = []
                    success_details = []
                    
                    progress_bar = st.progress(0)
                    status_text = st.empty()
                    
                    import time
                    start_time = time.time()
                    
                    for idx, sym in enumerate(symbols):
                        elapsed = time.time() - start_time
                        status_text.text(f"Fetching {sym}... ({idx + 1}/{len(symbols)}) - {elapsed:.1f}s elapsed")
                        progress_bar.progress((idx + 1) / len(symbols))
                        
                        price, used_ticker = fetch_price_yfinance(sym)
                        if price and price > 0:
                            try:
                                cur.execute("UPDATE stocks SET current_price = ? WHERE symbol = ?", (float(price), sym))
                                updated += 1
                                success_details.append(f"{sym} = {price:.3f} (using {used_ticker})")
                            except Exception as e:
                                skipped += 1
                                failed_symbols.append(f"{sym} (DB error)")
                        else:
                            skipped += 1
                            failed_symbols.append(sym)
                    
                    conn.commit()
                    conn.close()
                    
                    progress_bar.empty()
                    status_text.empty()
                    
                    st.success(f"✅ Prices updated: {updated} | ⚠️ Skipped: {skipped}")
                    
                    if success_details:
                        with st.expander("✓ Successfully fetched prices"):
                            for detail in success_details:
                                st.text(detail)
                    
                    if failed_symbols:
                        with st.expander("⚠️ View skipped symbols"):
                            st.write(", ".join(failed_symbols))
                    
                    try:
                        st.rerun()
                    except Exception:
                        pass

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
    
    if overall_total_cost > 0:
        overall_total_pnl_pct = overall_total_pnl / overall_total_cost
        overall_dividend_yield = overall_total_cash_div / overall_total_cost
        
        # Calculate performance metrics
        mv_change_pct = ((overall_total_mv - overall_total_cost) / overall_total_cost * 100)
        unreal_change_pct = (overall_total_unreal / overall_total_cost * 100)
        
        col1, col2, col3, col4, col5, col6 = st.columns(6)
        with col1:
            kpi_card("Total Cost", fmt_money(overall_total_cost, "KWD"))
        with col2:
            kpi_card("Market Value", fmt_money(overall_total_mv, "KWD"), f"▲ {mv_change_pct:.2f}%")
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
    
    # Debug: Check if Plotly is available
    if go is None:
        st.error("🚨 Critical: Plotly is not loaded! Charts will not display.")
        st.info("Try: `pip install plotly` in your terminal")
    
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
                            "SELECT accumulated_cash FROM portfolio_snapshots WHERE snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1",
                            (earliest_import_date,)
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
                            existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ?", (snap_date,))
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
                            
                            # Net gain from stocks = Beginning Difference - Accumulated Cash
                            net_gain = beginning_diff - accumulated_cash if accumulated_cash else beginning_diff
                            # ROI % = Net Gain / Accumulated Cash
                            roi_percent = (net_gain / accumulated_cash * 100) if accumulated_cash and accumulated_cash > 0 else 0
                            # Change % = change from previous day
                            change_percent = ((portfolio_value - prev_value) / prev_value * 100) if prev_value > 0 else 0
                            
                            records_to_insert.append((
                                snap_date, portfolio_value, daily_movement, beginning_diff,
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
                                (snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                records_to_insert
                            )
                            conn.commit()
                            conn.close()
                            
                            st.success(f"✅ Imported {len(records_to_insert)} snapshots successfully!")
                            if duplicates:
                                st.warning(f"⚠️ Skipped {len(duplicates)} duplicate dates: {', '.join(duplicates[:5])}{'...' if len(duplicates) > 5 else ''}")
                            st.rerun()
                        else:
                            st.info("No new records to import (all duplicates).")
                            
                except Exception as e:
                    st.error(f"Error reading Excel file: {e}")
    
    st.divider()
    
    # Add new snapshot
    with st.expander("➕ Add Daily Snapshot", expanded=False):
        col1, col2 = st.columns(2)
        with col1:
            snap_date = st.date_input("Date", value=date.today(), key="snap_date")
            portfolio_value = st.number_input("Portfolio Value", min_value=0.0, step=0.001, format="%.3f", key="snap_value")
            deposit_cash = st.number_input("Deposit Cash (if any)", min_value=0.0, step=0.001, format="%.3f", key="snap_deposit")
        with col2:
            daily_movement = st.number_input("Daily Movement", step=0.001, format="%.3f", key="snap_movement")
            beginning_diff = st.number_input("Beginning Difference", step=0.001, format="%.3f", key="snap_diff")
        
        if st.button("Save Snapshot"):
            snap_date_str = snap_date.strftime("%Y-%m-%d")
            
            # Check if snapshot already exists
            existing = query_df("SELECT * FROM portfolio_snapshots WHERE snapshot_date = ?", (snap_date_str,))
            if not existing.empty:
                st.error(f"Snapshot for {snap_date_str} already exists. Delete it first to update.")
            else:
                # Get previous snapshot for calculations
                prev_snap = query_df(
                    "SELECT * FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1"
                )
                
                # Calculate accumulated cash using correct logic
                if prev_snap.empty:
                    # First snapshot ever
                    if deposit_cash > 0:
                        accumulated_cash = deposit_cash
                    else:
                        accumulated_cash = None
                    prev_value = 0
                else:
                    prev_acc = prev_snap["accumulated_cash"].iloc[0]
                    prev_value = float(prev_snap["portfolio_value"].iloc[0])
                    
                    # If no previous accumulated value (None/NULL)
                    if pd.isna(prev_acc):
                        if deposit_cash > 0:
                            accumulated_cash = deposit_cash
                        else:
                            accumulated_cash = None
                    else:
                        # Has previous accumulated value
                        prev_acc = float(prev_acc)
                        if deposit_cash > 0:
                            # Add new deposit to previous accumulated
                            accumulated_cash = prev_acc + deposit_cash
                        else:
                            # No new deposit, carry forward previous value
                            accumulated_cash = prev_acc
                
                # Net gain from stocks = Beginning Difference - Accumulated Cash
                net_gain = beginning_diff - accumulated_cash if accumulated_cash else beginning_diff
                # ROI % = Net Gain / Accumulated Cash
                roi_percent = (net_gain / accumulated_cash * 100) if accumulated_cash and accumulated_cash > 0 else 0
                # Change % = change from previous day
                change_percent = ((portfolio_value - prev_value) / prev_value * 100) if prev_value > 0 else 0
                
                exec_sql(
                    """
                    INSERT INTO portfolio_snapshots 
                    (snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                     deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (snap_date_str, portfolio_value, daily_movement, beginning_diff,
                     deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, int(time.time()))
                )
                st.success("Snapshot saved!")
                st.rerun()
    
    st.divider()
    
    # Display snapshots
    snapshots = query_df(
        "SELECT * FROM portfolio_snapshots ORDER BY snapshot_date DESC"
    )
    
    if snapshots.empty:
        st.info("No portfolio snapshots yet. Add your first snapshot above.")
        return
    
    # === MODERN INTERACTIVE LINE CHART (FULL-WIDTH) ===
    st.markdown("### 📈 Portfolio Value Over Time")
    
    chart_data = snapshots[["snapshot_date", "portfolio_value"]].copy()
    chart_data = chart_data.sort_values("snapshot_date")
    chart_data["snapshot_date"] = pd.to_datetime(chart_data["snapshot_date"])

    if go is not None:
        # Get theme colors from session state
        if st.session_state.theme == "dark":
            bg_color = '#0F172A'
            card_color = '#1E293B'
            text_color = '#F3F4F6'
            line_color = '#34D399'  # Neon Mint
            fill_color = 'rgba(52, 211, 153, 0.1)'
            grid_color = '#334155'
            hover_bg = '#F8FAFC'
            hover_text = '#0F172A'
        else:
            bg_color = '#FFFFFF'
            card_color = '#FFFFFF'
            text_color = '#111827'
            line_color = '#10B981'  # Emerald
            fill_color = 'rgba(16, 185, 129, 0.1)'
            grid_color = '#E5E7EB'
            hover_bg = '#111827'
            hover_text = '#FFFFFF'

        # Calculate data range for better y-axis scaling
        min_value = chart_data["portfolio_value"].min()
        max_value = chart_data["portfolio_value"].max()
        value_range = max_value - min_value
        # Add 5% padding to top and bottom for better visualization
        y_min = min_value - (value_range * 0.05)
        y_max = max_value + (value_range * 0.05)

        fig = go.Figure()

        # Add the Line (Spline with smooth curve)
        fig.add_trace(go.Scatter(
            x=chart_data["snapshot_date"],
            y=chart_data["portfolio_value"],
            mode='lines',
            line=dict(
                color=line_color,
                width=3,
                shape='spline',  # Smooth/curvy line
                smoothing=1.3
            ),
            fill='tonexty',  # Fill to next y (instead of zero)
            fillcolor=fill_color,
            hoverinfo='x+y',
            hovertemplate='<b>%{y:,.3f} KWD</b><extra></extra>'  # Custom tooltip format
        ))

        # Customizing Layout for Modern Design
        fig.update_layout(
            paper_bgcolor=bg_color,
            plot_bgcolor=bg_color,
            margin=dict(l=0, r=60, t=30, b=0),
            height=350,
            hovermode="x unified",  # The scrubbing line effect
            font=dict(family="Inter, system-ui, sans-serif"),
            xaxis=dict(
                showgrid=False,
                showline=False,
                showticklabels=False,  # Minimalist: hide dates on X
                zeroline=False
            ),
            yaxis=dict(
                showgrid=True,
                gridcolor=grid_color,
                gridwidth=1,
                griddash='dash',  # Dashed grid lines
                showline=False,
                showticklabels=True,
                tickfont=dict(color=text_color, size=10),
                tickformat=",.0f",
                zeroline=False,
                side='right',  # Put labels on right side
                range=[y_min, y_max]  # Auto-scale based on data with padding
            )
        )

        # Customizing the Hover Label (Tooltip)
        fig.update_layout(
            hoverlabel=dict(
                bgcolor=hover_bg,
                bordercolor=line_color,
                font=dict(color=hover_text, family="Inter", size=14)
            )
        )

        st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

        # === NEW CHART: Net Gain from Stocks ===
        st.markdown("### 📉 Net Gain from Stocks")
        
        # Get historical net gain directly
        net_gain_data = snapshots[["snapshot_date", "net_gain"]].copy()
        net_gain_data = net_gain_data.sort_values("snapshot_date")
        net_gain_data["snapshot_date"] = pd.to_datetime(net_gain_data["snapshot_date"])
        
        # Use different color for Net Gain (Blue)
        if st.session_state.theme == "dark":
            ng_line_color = '#60A5FA'  # Blue
            ng_fill_color = 'rgba(96, 165, 250, 0.1)'
        else:
            ng_line_color = '#3B82F6'  # Blue
            ng_fill_color = 'rgba(59, 130, 246, 0.1)'

        # Calculate range
        min_ng = net_gain_data["net_gain"].min()
        max_ng = net_gain_data["net_gain"].max()
        ng_range = max_ng - min_ng
        # Add 5% padding
        ng_y_min = min_ng - (ng_range * 0.05) if ng_range != 0 else min_ng * 0.95
        ng_y_max = max_ng + (ng_range * 0.05) if ng_range != 0 else max_ng * 1.05

        fig_ng = go.Figure()

        fig_ng.add_trace(go.Scatter(
            x=net_gain_data["snapshot_date"],
            y=net_gain_data["net_gain"],
            mode='lines',
            line=dict(
                color=ng_line_color,
                width=3,
                shape='spline',
                smoothing=1.3
            ),
            fill='tonexty',
            fillcolor=ng_fill_color,
            hoverinfo='x+y',
            hovertemplate='<b>%{y:,.3f} KWD</b><extra></extra>'
        ))

        fig_ng.update_layout(
            paper_bgcolor=bg_color,
            plot_bgcolor=bg_color,
            margin=dict(l=0, r=60, t=30, b=0),
            height=350,
            hovermode="x unified",
            font=dict(family="Inter, system-ui, sans-serif"),
            xaxis=dict(
                showgrid=False, showline=False, showticklabels=False, zeroline=False
            ),
            yaxis=dict(
                showgrid=True,
                gridcolor=grid_color,
                gridwidth=1,
                griddash='dash',
                showline=False,
                showticklabels=True,
                tickfont=dict(color=text_color, size=10),
                tickformat=",.0f",
                zeroline=True,
                zerolinecolor=grid_color,
                side='right',
                range=[ng_y_min, ng_y_max]
            )
        )
        
        fig_ng.update_layout(
            hoverlabel=dict(
                bgcolor=hover_bg,
                bordercolor=ng_line_color,
                font=dict(color=hover_text, family="Inter", size=14)
            )
        )

        st.plotly_chart(fig_ng, use_container_width=True, config={'displayModeBar': False})

    else:
        st.error("⚠️ Plotly not available. Install with: `pip install plotly`")
        st.info("Plotly is required for the modern interactive charts.")
    
    st.divider()
    
    # Format and display table
    st.markdown("### 📊 Portfolio Snapshots")
    
    display_df = snapshots.copy()
    
    # Format with colors
    def fmt_with_color_brackets(val):
        if pd.isna(val):
            return ""
        val = float(val)
        if val < 0:
            return f"({abs(val):,.3f})"
        else:
            return f"{val:,.3f}"
    
    def fmt_pct_with_brackets(val):
        if pd.isna(val):
            return ""
        val = float(val)
        if val < 0:
            return f"({abs(val):.2f}%)"
        else:
            return f"{val:.2f}%"
    
    # Store raw values for coloring
    raw_daily = display_df["daily_movement"].copy()
    raw_net = display_df["net_gain"].copy()
    raw_change = display_df["change_percent"].copy()
    raw_roi = display_df["roi_percent"].copy()
    
    display_df["snapshot_date"] = pd.to_datetime(display_df["snapshot_date"]).dt.strftime("%d-%b-%y")
    display_df["portfolio_value"] = display_df["portfolio_value"].apply(lambda x: f"{x:,.3f}" if pd.notna(x) else "")
    display_df["daily_movement"] = display_df["daily_movement"].apply(fmt_with_color_brackets)
    display_df["beginning_difference"] = display_df["beginning_difference"].apply(fmt_with_color_brackets)
    display_df["deposit_cash"] = display_df["deposit_cash"].apply(lambda x: f"{x:,.3f}" if pd.notna(x) and x > 0 else "")
    display_df["accumulated_cash"] = display_df["accumulated_cash"].apply(lambda x: f"{x:,.3f}" if pd.notna(x) else "")
    display_df["net_gain"] = display_df["net_gain"].apply(fmt_with_color_brackets)
    display_df["change_percent"] = display_df["change_percent"].apply(fmt_pct_with_brackets)
    display_df["roi_percent"] = display_df["roi_percent"].apply(fmt_pct_with_brackets)
    
    # Apply color styling
    def color_value(val):
        if isinstance(val, str):
            if val.startswith('(') and val.endswith(')'):
                return 'color: red'
            elif any(char.isdigit() for char in val) and '%' in val:
                try:
                    clean_val = val.replace('%', '').replace(',', '')
                    if float(clean_val) > 0:
                        return 'color: green'
                except:
                    pass
            elif any(char.isdigit() for char in val) and not val.startswith('('):
                try:
                    clean_val = val.replace(',', '')
                    if float(clean_val) > 0:
                        return 'color: green'
                except:
                    pass
        return ''
    
    cols_to_show = [
        "snapshot_date", "portfolio_value", "daily_movement", "beginning_difference",
        "deposit_cash", "accumulated_cash", "net_gain", "change_percent", "roi_percent"
    ]
    
    styled_df = display_df[cols_to_show].style.map(
        color_value,
        subset=["daily_movement", "beginning_difference", "net_gain", "change_percent", "roi_percent"]
    )
    
    # Rename columns for display
    styled_df = styled_df.set_table_styles([
        {'selector': 'th', 'props': [('text-align', 'center')]},
        {'selector': 'td', 'props': [('text-align', 'right')]}
    ])
    
    display_df_renamed = display_df[cols_to_show].rename(columns={
        "snapshot_date": "Date",
        "portfolio_value": "Value",
        "daily_movement": "Daily Movement",
        "beginning_difference": "Beginning Diff",
        "deposit_cash": "Deposit Cash",
        "accumulated_cash": "Accumulated Cash Deposit",
        "net_gain": "Net Gain from Stock",
        "change_percent": "Change %",
        "roi_percent": "ROI %"
    })
    
    styled_df = display_df_renamed.style.map(
        color_value,
        subset=["Daily Movement", "Beginning Diff", "Net Gain from Stock", "Change %", "ROI %"]
    )
    
    st.dataframe(styled_df, use_container_width=True, hide_index=True)
    
    # Delete snapshot
    with st.expander("🗑️ Delete Snapshot"):
        del_date = st.date_input("Select date to delete", value=date.today(), key="del_snap_date")
        if st.button("Delete Snapshot", key="del_snap"):
            del_date_str = del_date.strftime("%Y-%m-%d")
            exec_sql("DELETE FROM portfolio_snapshots WHERE snapshot_date = ?", (del_date_str,))
            st.success(f"Deleted snapshot for {del_date_str} (if it existed).")
            st.rerun()


def ui_dividends_tracker():
    st.subheader("💰 Dividends Tracker")
    
    # Query all dividend data - include ALL rows to check what's available
    all_transactions = query_df("""
        SELECT 
            stock_symbol,
            txn_date,
            txn_type,
            COALESCE(cash_dividend, 0) as cash_dividend,
            COALESCE(bonus_shares, 0) as bonus_shares,
            COALESCE(reinvested_dividend, 0) as reinvested_dividend
        FROM transactions
        ORDER BY txn_date DESC
        LIMIT 10
    """)
    
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
        st.metric("💵 Total Cash Dividends", f"{total_cash_div:,.3f} KWD")
    with col2:
        st.metric("🎁 Total Bonus Shares", f"{total_bonus_shares:,.0f}")
    with col3:
        st.metric("🔄 Total Reinvested", f"{total_reinvested:,.3f} KWD")
    with col4:
        st.metric("📊 Dividend-Paying Stocks", f"{unique_stocks}")
    
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
        display_df['Cash Dividend (KWD)'] = display_df['Cash Dividend (KWD)'].apply(lambda x: f"{x:,.3f}")
        display_df['Bonus Shares'] = display_df['Bonus Shares'].apply(lambda x: f"{x:,.0f}" if x > 0 else "-")
        display_df['Reinvested (KWD)'] = display_df['Reinvested (KWD)'].apply(lambda x: f"{x:,.3f}" if x > 0 else "-")
        
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
        summary_display['Dividend Count'] = summary_display['Dividend Count'].apply(lambda x: f"{x:.0f}")
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
                        cur.execute("SELECT id FROM stocks WHERE symbol = ?", (stock_symbol,))
                        if not cur.fetchone():
                            cur.execute(
                                "INSERT INTO stocks (symbol, name, portfolio, currency) VALUES (?, ?, ?, ?)",
                                (stock_symbol, stock_symbol, "KFH", "KWD")
                            )
                        
                        # Calculate totals
                        total_purchase_cost = purchase_price * quantity
                        total_sell_value = sale_price * quantity if is_closed else 0
                        
                        # Insert Buy
                        cur.execute("""
                            INSERT INTO transactions 
                            (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                             cash_dividend, bonus_shares, category, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (stock_symbol, purchase_date.strftime("%Y-%m-%d"), 'Buy', total_purchase_cost, 0, quantity, 0, 0, 'trading', int(time.time())))
                        
                        # Insert Sell if applicable
                        if is_closed:
                            cur.execute("""
                                INSERT INTO transactions 
                                (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                 cash_dividend, bonus_shares, category, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (stock_symbol, sale_date.strftime("%Y-%m-%d"), 'Sell', 0, total_sell_value, quantity, cash_div, bonus_shares, 'trading', int(time.time())))
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
            if st.button("🧹 Remove Existing Duplicates", help="Removes duplicate transactions from database"):
                try:
                    conn = get_conn()
                    cur = conn.cursor()
                    
                    # Find and remove duplicate Buy transactions (trading category only)
                    cur.execute("""
                        DELETE FROM transactions 
                        WHERE category = 'trading' AND id NOT IN (
                            SELECT MIN(id) 
                            FROM transactions 
                            WHERE txn_type = 'Buy' AND category = 'trading'
                            GROUP BY stock_symbol, txn_date, shares, purchase_cost
                        ) AND txn_type = 'Buy'
                    """)
                    buy_dupes = cur.rowcount
                    
                    # Find and remove duplicate Sell transactions (trading category only)
                    cur.execute("""
                        DELETE FROM transactions 
                        WHERE category = 'trading' AND id NOT IN (
                            SELECT MIN(id) 
                            FROM transactions 
                            WHERE txn_type = 'Sell' AND category = 'trading'
                            GROUP BY stock_symbol, txn_date, shares, sell_value
                        ) AND txn_type = 'Sell'
                    """)
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
            'Months': [5, 3.4],
            'Target sale': [0, 0.310],
            'Profit': [1631, 7318.19],
            'Profit %': [-19.62, 50.07]
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
                    st.write(f"**Preview** ({len(df)} rows from sheet '{sheet}'):")
                    st.dataframe(df, use_container_width=True, height=300)
                
                if st.button("✅ Import Trading Data", key="import_trades") or proceed_with_errors:
                    imported = 0
                    errors = []
                    success_rows = []
                    buy_count = 0
                    sell_count = 0
                    
                    # Get count before import
                    conn = get_conn()
                    cur = conn.cursor()
                    cur.execute("SELECT COUNT(*) FROM transactions")
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
                                cur.execute("""
                                    SELECT id FROM transactions 
                                    WHERE stock_symbol = ? AND txn_date = ? AND txn_type = 'Buy' 
                                    AND shares = ? AND purchase_cost = ?
                                """, (stock, purchase_date, quantity, purchase_cost))
                                
                                existing_buy = cur.fetchone()
                                buy_exists = existing_buy is not None
                                
                                # Check for Sell duplicate only if sale date exists
                                sell_exists = False
                                existing_sell = None
                                if has_sale:
                                    cur.execute("""
                                        SELECT id FROM transactions 
                                        WHERE stock_symbol = ? AND txn_date = ? AND txn_type = 'Sell' 
                                        AND shares = ? AND sell_value = ?
                                    """, (stock, sale_date, quantity, sell_value))
                                    
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
                                    cur.execute("""
                                        INSERT INTO transactions 
                                        (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                         cash_dividend, bonus_shares, category, created_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """, (stock, sale_date, 'Sell', 0, sell_value, quantity, cash_div, bonus_shares, 'trading', int(time.time())))
                                    
                                    imported += 1
                                    success_rows.append(f"Row {row_num}: {stock} - Added sell transaction only (buy already exists)")
                                    continue
                                
                                # Check if stock exists in stocks table
                                cur.execute("SELECT id FROM stocks WHERE symbol = ?", (stock,))
                                if not cur.fetchone():
                                    # Add stock if missing
                                    cur.execute(
                                        "INSERT INTO stocks (symbol, name, portfolio, currency) VALUES (?, ?, ?, ?)",
                                        (stock, stock, "KFH", "KWD")
                                    )
                                
                                # Insert Buy transaction (always) with category='trading'
                                cur.execute("""
                                    INSERT INTO transactions 
                                    (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                     cash_dividend, bonus_shares, category, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """, (stock, purchase_date, 'Buy', purchase_cost, 0, quantity, 0, 0, 'trading', int(time.time())))
                                buy_count += 1
                                
                                # Insert Sell transaction only if sale date exists
                                if has_sale:
                                    cur.execute("""
                                        INSERT INTO transactions 
                                        (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                         cash_dividend, bonus_shares, category, created_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """, (stock, sale_date, 'Sell', 0, sell_value, quantity, cash_div, bonus_shares, 'trading', int(time.time())))
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
                        cur2.execute("SELECT COUNT(*) FROM transactions")
                        transactions_after = cur2.fetchone()[0]
                        conn2.close()
                        
                        transactions_created = transactions_after - transactions_before
                        
                        # Display detailed results summary
                        st.divider()
                        st.subheader("📊 Import Summary")
                        
                        col_summary1, col_summary2, col_summary3, col_summary4 = st.columns(4)
                        with col_summary1:
                            st.metric("📥 Excel Rows Imported", imported)
                        with col_summary2:
                            st.metric("✅ Buy Transactions Created", buy_count, delta="Database records")
                        with col_summary3:
                            st.metric("✅ Sell Transactions Created", sell_count, delta="Database records")
                        with col_summary4:
                            st.metric("📊 Total DB Transactions", transactions_after, delta=f"+{transactions_created}")
                        
                        st.info(f"ℹ️ **Explanation:** Each closed trade creates 2 database transactions (1 Buy + 1 Sell). You imported {imported} Excel rows which created {transactions_created} database transactions.")
                        
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
    cur.execute("SELECT COUNT(*) FROM transactions WHERE category = 'trading'")
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
                t.fees,
                t.notes
            FROM transactions t
            WHERE t.category = 'trading' AND t.txn_date BETWEEN ? AND ?
            ORDER BY t.txn_date, t.stock_symbol, t.txn_type
        """
        df = pd.read_sql_query(
            query,
            conn,
            params=(start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
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
                t.fees,
                t.notes
            FROM transactions t
            WHERE t.category = 'trading'
            ORDER BY t.txn_date, t.stock_symbol, t.txn_type
        """
        df = pd.read_sql_query(query, conn)
    
    conn.close()
    
    if df.empty:
        if apply_filter:
            st.warning(f"⚠️ No trades found between {start_date.strftime('%Y-%m-%d')} and {end_date.strftime('%Y-%m-%d')}.")
            st.info("💡 Click '🔄 Show All' to see all transactions or adjust the date range.")
        else:
            st.warning(f"⚠️ No trades found in the database.")
        
        # Show date range of existing trading transactions
        conn2 = get_conn()
        date_range_query = "SELECT MIN(txn_date) as min_date, MAX(txn_date) as max_date FROM transactions WHERE category = 'trading'"
        date_df = pd.read_sql_query(date_range_query, conn2)
        conn2.close()
        
        if not date_df.empty and date_df['min_date'].iloc[0]:
            st.info(f"📅 Your transactions date range: {date_df['min_date'].iloc[0]} to {date_df['max_date'].iloc[0]}")
        
        return
    
    # Group by stock and match Buy/Sell pairs and identify open positions
    realized_trades = []  # Completed trades with sell
    unrealized_positions = []  # Open positions without sell
    
    for stock in df['Stock'].unique():
        stock_df = df[df['Stock'] == stock].sort_values('txn_date').reset_index(drop=True)
        
        buys = stock_df[stock_df['txn_type'] == 'Buy'].copy()
        sells = stock_df[stock_df['txn_type'] == 'Sell'].copy()
        
        # Track which buys have been matched
        matched_buy_ids = set()
        matched_sell_ids = set()
        
        # Match each sell with corresponding buy - REALIZED TRADES
        # Strategy: Match by quantity and closest dates
        for _, sell in sells.iterrows():
            if sell['id'] in matched_sell_ids:
                continue
                
            # Find buy with same quantity that hasn't been matched yet
            matching_buys = buys[
                (buys['Quantity'] == sell['Quantity']) & 
                (~buys['id'].isin(matched_buy_ids)) &
                (buys['txn_date'] <= sell['txn_date'])
            ]
            
            if not matching_buys.empty:
                # Get the most recent buy with matching quantity
                buy = matching_buys.iloc[-1]
                matched_buy_ids.add(buy['id'])
                matched_sell_ids.add(sell['id'])
                
                # Calculate metrics
                purchase_date = pd.to_datetime(buy['txn_date'])
                sale_date = pd.to_datetime(sell['txn_date'])
                quantity = sell['Quantity']
                
                # Price calculations
                price_cost = buy['Price cost'] / buy['Quantity'] if buy['Quantity'] > 0 else 0
                cost_value = price_cost * quantity
                
                sale_price = sell['Sale price'] / sell['Quantity'] if sell['Quantity'] > 0 else 0
                value_price = sale_price * quantity
                
                # Profit calculations
                trading_profit = value_price - cost_value
                cash_div = sell['cash Div'] if pd.notna(sell['cash Div']) else 0
                bonus_shares = sell['Bonus shares'] if pd.notna(sell['Bonus shares']) else 0
                
                profit_percent = (trading_profit / cost_value * 100) if cost_value > 0 else 0
                
                # Period calculation
                period_days = (sale_date - purchase_date).days
                months = period_days / 30.0
                
                # Total profit including dividends
                total_profit = trading_profit + cash_div
                total_profit_percent = (total_profit / cost_value * 100) if cost_value > 0 else 0
                
                realized_trades.append({
                    'Status': 'Realized',
                    'Purchase date': purchase_date.strftime('%d-%b-%y'),
                    'Stock': stock,
                    'Quantity': quantity,
                    'Price cost': price_cost,
                    'Cost value': cost_value,
                    'Sale Date': sale_date.strftime('%d-%b-%y'),
                    'Sale price': sale_price,
                    'Value price': value_price,
                    'trading Profit': trading_profit,
                    'cash Div': cash_div,
                    'Bonus shares': bonus_shares,
                    'Profit%': profit_percent,
                    'Period in days': period_days,
                    'Months': months,
                    'Profit': total_profit,
                    'Profit %': total_profit_percent,
                    '_buy_id': buy['id'],
                    '_sell_id': sell['id'],
                    '_editable': True
                })
        
        # Find unmatched buys - UNREALIZED POSITIONS
        for _, buy in buys.iterrows():
            if buy['id'] not in matched_buy_ids:
                purchase_date = pd.to_datetime(buy['txn_date'])
                quantity = buy['Quantity']
                price_cost = buy['Price cost'] / buy['Quantity'] if buy['Quantity'] > 0 else 0
                cost_value = buy['Price cost']
                
                # Get current price from stocks table
                conn_temp = get_conn()
                cur_temp = conn_temp.cursor()
                cur_temp.execute("SELECT current_price FROM stocks WHERE symbol = ?", (stock,))
                result = cur_temp.fetchone()
                conn_temp.close()
                
                current_price = result[0] if result and result[0] else 0
                current_value = current_price * quantity
                
                # Unrealized profit
                unrealized_profit = current_value - cost_value
                unrealized_profit_percent = (unrealized_profit / cost_value * 100) if cost_value > 0 else 0
                
                # Period calculation
                period_days = (date.today() - purchase_date.date()).days
                months = period_days / 30.0
                
                unrealized_positions.append({
                    'Status': 'Unrealized',
                    'Purchase date': purchase_date.strftime('%d-%b-%y'),
                    'Stock': stock,
                    'Quantity': quantity,
                    'Price cost': price_cost,
                    'Cost value': cost_value,
                    'Sale Date': '-',
                    'Current price': current_price,
                    'Current value': current_value,
                    'Unrealized Profit': unrealized_profit,
                    'cash Div': 0,
                    'Bonus shares': 0,
                    'Profit%': unrealized_profit_percent,
                    'Period in days': period_days,
                    'Months': months,
                    'Profit': unrealized_profit,
                    'Profit %': unrealized_profit_percent,
                    '_buy_id': buy['id'],
                    '_sell_id': None,
                    '_editable': True
                })
    
    # Combine both lists
    all_trades = realized_trades + unrealized_positions
    
    if not all_trades:
        st.info("No trades found in the selected date range.")
        return
    
    # Create DataFrames
    all_df = pd.DataFrame(all_trades)
    realized_df = pd.DataFrame(realized_trades) if realized_trades else pd.DataFrame()
    unrealized_df = pd.DataFrame(unrealized_positions) if unrealized_positions else pd.DataFrame()
    
    # Display summary metrics
    st.divider()
    
    # Calculate totals - CORRECT FINANCIAL CALCULATIONS
    realized_cost = realized_df['Cost value'].sum() if not realized_df.empty else 0
    realized_value = realized_df['Value price'].sum() if not realized_df.empty else 0
    
    # Realized profit = Sale Value - Cost (pure capital gain from trading)
    realized_trading_profit = realized_value - realized_cost
    
    # Total cash dividends and bonus value
    realized_cash_div = realized_df['cash Div'].sum() if not realized_df.empty else 0
    
    # Total realized profit including dividends
    realized_profit_total = realized_trading_profit + realized_cash_div
    
    unrealized_cost = unrealized_df['Cost value'].sum() if not unrealized_df.empty else 0
    unrealized_value = unrealized_df['Current value'].sum() if not unrealized_df.empty else 0
    
    # Unrealized profit = Current Value - Cost (unrealized capital gain/loss)
    unrealized_profit = unrealized_value - unrealized_cost
    
    total_investment = realized_cost + unrealized_cost
    total_current_value = realized_value + unrealized_value
    total_profit = realized_trading_profit + unrealized_profit + realized_cash_div
    
    # First row: Realized vs Unrealized
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("💰 Realized Profit", f"{realized_trading_profit:,.2f} KWD", 
                 delta=f"{(realized_trading_profit/realized_cost*100) if realized_cost > 0 else 0:.2f}%",
                 delta_color="normal")
        if realized_cash_div > 0:
            st.caption(f"+ {realized_cash_div:,.2f} KWD in dividends")
    with col2:
        st.metric("📊 Unrealized Profit", f"{unrealized_profit:,.2f} KWD", 
                 delta=f"{(unrealized_profit/unrealized_cost*100) if unrealized_cost > 0 else 0:.2f}%",
                 delta_color="off")
    with col3:
        st.metric("🎯 Total Profit", f"{total_profit:,.2f} KWD",
                 delta=f"{(total_profit/total_investment*100) if total_investment > 0 else 0:.2f}%")
    
    # Second row: Investment details
    st.divider()
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Realized Investment", f"{realized_cost:,.2f} KWD")
    with col2:
        st.metric("Realized Sale Value", f"{realized_value:,.2f} KWD")
    with col3:
        st.metric("Unrealized Investment", f"{unrealized_cost:,.2f} KWD")
    with col4:
        st.metric("Unrealized Current Value", f"{unrealized_value:,.2f} KWD")
    
    st.divider()
    
    # Prepare editable DataFrame - Keep raw numeric values for editing
    edit_df = all_df.copy()
    
    # Ensure numeric columns are proper dtypes
    numeric_columns = ['Quantity', 'Price cost', 'Cost value', 'Sale price', 'Value price', 
                      'Current price', 'Current value', 'trading Profit', 'Unrealized Profit',
                      'cash Div', 'Bonus shares', 'Profit%', 'Months']
    
    for col in numeric_columns:
        if col in edit_df.columns:
            edit_df[col] = pd.to_numeric(edit_df[col], errors='coerce')
    
    # Store original values for comparison
    if 'original_trades_df' not in st.session_state:
        st.session_state['original_trades_df'] = edit_df.copy()
    
    # Add Delete checkbox column at the beginning
    edit_df.insert(0, 'Delete', False)
    
    # Add row numbers as the first column (after Delete)
    edit_df.insert(1, '#', range(1, len(edit_df) + 1))
    
    # Hide specified columns from display
    columns_to_hide = ['Period in days', 'Profit', 'Profit %', '_buy_id', '_sell_id', '_editable']
    display_columns = [col for col in edit_df.columns if col not in columns_to_hide]
    
    # Configure column editing - ALL columns editable with proper types
    column_config = {
        'Delete': st.column_config.CheckboxColumn('Delete', help='Check to delete this transaction', width='small'),
        '#': st.column_config.NumberColumn('#', help='Transaction number', width='small', disabled=True),
        'Status': st.column_config.TextColumn('Status', width='small'),
        'Purchase date': st.column_config.TextColumn('Purchase date', width='small'),
        'Stock': st.column_config.TextColumn(
            'Stock', 
            help='Enter any Yahoo Finance ticker (e.g., KRE, AAPL, TSLA)',
            width='medium',
            required=True
        ),
        'Quantity': st.column_config.NumberColumn('Quantity', format='%.0f'),
        'Price cost': st.column_config.NumberColumn('Price cost', format='%.3f', step=0.001),
        'Cost value': st.column_config.NumberColumn('Cost value', format='%.2f'),
        'Sale Date': st.column_config.TextColumn('Sale Date', width='small'),
        'Sale price': st.column_config.NumberColumn('Sale price', format='%.3f', step=0.001),
        'Value price': st.column_config.NumberColumn('Value price', format='%.2f'),
        'Current price': st.column_config.NumberColumn('Current price', format='%.3f', step=0.001),
        'Current value': st.column_config.NumberColumn('Current value', format='%.2f'),
        'trading Profit': st.column_config.NumberColumn('trading Profit', format='%.2f'),
        'Unrealized Profit': st.column_config.NumberColumn('Unrealized Profit', format='%.2f'),
        'cash Div': st.column_config.NumberColumn('cash Div', format='%.2f'),
        'Bonus shares': st.column_config.NumberColumn('Bonus shares', format='%.0f'),
        'Profit%': st.column_config.NumberColumn('Profit%', format='%.2f'),
        'Months': st.column_config.NumberColumn('Months', format='%.1f'),
    }
    
    st.warning("⚠️ **IMPORTANT:** Kuwait stocks must use `.KW` suffix (e.g., NIH → **NIH.KW**, KRE → **KRE.KW**). US stocks use standard tickers (AAPL, TSLA). Double-click Stock cell to edit, then click 💾 Save.")
    
    st.divider()
    
    # Kuwait Stock Selector for updating ticker names
    st.subheader("🔍 Update Stock Ticker from Kuwait Stock List")
    
    col_sel1, col_sel2, col_sel3 = st.columns([1, 2, 1])
    
    with col_sel1:
        # Select row number to update
        row_to_update = st.number_input(
            "Select Row # to Update",
            min_value=1,
            max_value=len(edit_df),
            value=1,
            step=1,
            key="trading_row_selector",
            help="Enter the row number from the table below"
        )
    
    with col_sel2:
        # Kuwait stock selector dropdown
        kuwait_stock_options = ["-- Select from Kuwait Stock List --"] + [
            f"{stock['symbol']} - {stock['name']}" for stock in KUWAIT_STOCKS
        ]
        
        selected_kuwait = st.selectbox(
            "Search and select Kuwait stock",
            options=kuwait_stock_options,
            key="trading_kuwait_stock_selector",
            help="Select the correct Kuwait stock ticker"
        )
    
    with col_sel3:
        # Apply button
        if st.button("✅ Apply to Row", type="primary", use_container_width=True, disabled=(selected_kuwait == kuwait_stock_options[0])):
            if selected_kuwait != kuwait_stock_options[0]:
                try:
                    # Extract ticker from selection
                    new_ticker = selected_kuwait.split(" - ")[0].strip()
                    
                    # Find the correct Yahoo Finance ticker
                    yf_ticker = None
                    for stock in KUWAIT_STOCKS:
                        if stock['symbol'] == new_ticker:
                            yf_ticker = stock.get('yf_ticker', f"{new_ticker}.KW")
                            break
                    
                    if not yf_ticker:
                        yf_ticker = f"{new_ticker}.KW"
                    
                    # Get the row data
                    row_idx = row_to_update - 1
                    if 0 <= row_idx < len(edit_df):
                        row = edit_df.iloc[row_idx]
                        buy_id = row.get('_buy_id')
                        sell_id = row.get('_sell_id')
                        old_ticker = row.get('Stock')
                        
                        if pd.notna(buy_id):
                            conn = get_conn()
                            cur = conn.cursor()
                            
                            # Update buy transaction
                            cur.execute("""
                                UPDATE transactions 
                                SET stock_symbol = ?
                                WHERE id = ?
                            """, (yf_ticker, int(buy_id)))
                            
                            # Update sell transaction if exists
                            if pd.notna(sell_id):
                                cur.execute("""
                                    UPDATE transactions 
                                    SET stock_symbol = ?
                                    WHERE id = ?
                                """, (yf_ticker, int(sell_id)))
                            
                            # Update or create stock in stocks table
                            cur.execute("SELECT id FROM stocks WHERE symbol = ?", (yf_ticker,))
                            if not cur.fetchone():
                                cur.execute("""
                                    INSERT INTO stocks (symbol, name, portfolio, currency)
                                    VALUES (?, ?, ?, ?)
                                """, (yf_ticker, new_ticker, "KFH", "KWD"))
                            
                            # Fetch price for unrealized positions
                            if row.get('Status') == 'Unrealized':
                                price_result = fetch_price_yfinance(yf_ticker)
                                new_price = price_result[0] if isinstance(price_result, tuple) else price_result
                                
                                if new_price and new_price > 0:
                                    cur.execute("""
                                        UPDATE stocks 
                                        SET current_price = ?, last_updated = ?
                                        WHERE symbol = ?
                                    """, (new_price, int(time.time()), yf_ticker))
                                    st.success(f"✅ Row {row_to_update}: Updated '{old_ticker}' → '{yf_ticker}' | Price: {new_price:.3f} KWD")
                                else:
                                    st.warning(f"⚠️ Row {row_to_update}: Updated ticker to '{yf_ticker}' but couldn't fetch price")
                            else:
                                st.success(f"✅ Row {row_to_update}: Updated '{old_ticker}' → '{yf_ticker}'")
                            
                            conn.commit()
                            conn.close()
                            
                            # Clear session and rerun
                            if 'original_trades_df' in st.session_state:
                                del st.session_state['original_trades_df']
                            time.sleep(1)
                            st.rerun()
                        else:
                            st.error("Invalid row selected")
                    else:
                        st.error(f"Row {row_to_update} does not exist")
                        
                except Exception as e:
                    st.error(f"Error updating ticker: {e}")
    
    st.divider()
    
    # Display editable table
    edited_df = st.data_editor(
        edit_df[display_columns],
        column_config=column_config,
        use_container_width=True,
        height=500,
        hide_index=True,
        num_rows="dynamic",
        key="trades_editor"
    )
    
    # Action Buttons
    col1, col2, col3, col4 = st.columns([1, 1, 1, 3])
    with col1:
        if st.button("💾 Save Changes", type="primary", use_container_width=True):
            try:
                changes_made = 0
                warnings = []
                conn = get_conn()
                cur = conn.cursor()
                
                # Compare edited_df with original
                for idx in range(len(edited_df)):
                    original_row = st.session_state['original_trades_df'].iloc[idx]
                    edited_row = edited_df.iloc[idx]
                    
                    # Check if Stock symbol changed (for unrealized positions, auto-update price)
                    stock_changed = str(edited_row.get('Stock', '')) != str(original_row.get('Stock', ''))
                    
                    if stock_changed:
                        buy_id = original_row['_buy_id']
                        new_stock_symbol = str(edited_row.get('Stock', '')).strip().upper()
                        
                        # Auto-suggest correct format for Kuwait stocks
                        if new_stock_symbol and not '.' in new_stock_symbol and len(new_stock_symbol) <= 4:
                            # Likely a Kuwait stock without .KW suffix
                            suggested = f"{new_stock_symbol}.KW"
                            warnings.append(f"⚠️ '{new_stock_symbol}' → Suggested: '{suggested}' for Kuwait stocks")
                        
                        if new_stock_symbol and pd.notna(buy_id):
                            # Update stock symbol in buy transaction
                            cur.execute("""
                                UPDATE transactions 
                                SET stock_symbol = ?
                                WHERE id = ?
                            """, (new_stock_symbol, int(buy_id)))
                            
                            # If this is an unrealized position, fetch and update price
                            if edited_row.get('Status') == 'Unrealized':
                                try:
                                    # First check if price exists in stocks table
                                    cur.execute("SELECT current_price FROM stocks WHERE symbol = ?", (new_stock_symbol,))
                                    result = cur.fetchone()
                                    
                                    if result and result[0] and result[0] > 0:
                                        new_price = result[0]
                                        st.info(f"✅ Used existing price for {new_stock_symbol}: {new_price:.3f} KWD")
                                    else:
                                        # Fetch new price from Yahoo Finance
                                        price_result = fetch_price_yfinance(new_stock_symbol)
                                        new_price = price_result[0] if isinstance(price_result, tuple) else price_result
                                        
                                        if new_price and new_price > 0:
                                            # Update stocks table
                                            cur.execute("""
                                                UPDATE stocks 
                                                SET current_price = ?, last_updated = ?
                                                WHERE symbol = ?
                                            """, (new_price, int(time.time()), new_stock_symbol))
                                            st.success(f"✅ Fetched new price for {new_stock_symbol}: {new_price:.3f} KWD")
                                        else:
                                            st.warning(f"⚠️ Could not fetch price for {new_stock_symbol}")
                                except Exception as e:
                                    st.warning(f"⚠️ Error fetching price for {new_stock_symbol}: {e}")
                            
                            changes_made += 1
                    
                    # Check if Sale Date or Sale price changed
                    sale_date_changed = str(edited_row.get('Sale Date', '')) != str(original_row.get('Sale Date', ''))
                    sale_price_changed = edited_row.get('Sale price') != original_row.get('Sale price')
                    
                    if sale_date_changed or sale_price_changed:
                        buy_id = original_row['_buy_id']
                        sell_id = original_row['_sell_id']
                        quantity = original_row['Quantity']
                        stock = edited_row.get('Stock')  # Use the (possibly updated) stock symbol
                        
                        # Parse new sale date
                        new_sale_date_str = str(edited_row.get('Sale Date', '')).strip()
                        if new_sale_date_str and new_sale_date_str != '-':
                            try:
                                new_sale_date = pd.to_datetime(new_sale_date_str, format='%d-%b-%y').strftime('%Y-%m-%d')
                            except:
                                new_sale_date = pd.to_datetime(new_sale_date_str).strftime('%Y-%m-%d')
                            
                            new_sale_price = float(edited_row.get('Sale price', 0))
                            new_sell_value = new_sale_price * quantity
                            
                            if pd.notna(sell_id) and sell_id is not None:
                                # Update existing sell transaction
                                cur.execute("""
                                    UPDATE transactions 
                                    SET txn_date = ?, sell_value = ?, stock_symbol = ?
                                    WHERE id = ?
                                """, (new_sale_date, new_sell_value, stock, int(sell_id)))
                            else:
                                # Create new sell transaction with category='trading'
                                cur.execute("""
                                    INSERT INTO transactions 
                                    (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares, 
                                     cash_dividend, bonus_shares, category, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """, (stock, new_sale_date, 'Sell', 0, new_sell_value, quantity, 0, 0, 'trading', int(time.time())))
                            
                            changes_made += 1
                
                conn.commit()
                conn.close()
                
                # Show warnings about ticker format
                if warnings:
                    for warning in warnings:
                        st.warning(warning)
                
                if changes_made > 0:
                    st.success(f"✅ {changes_made} transaction(s) updated successfully!")
                    # Clear session state
                    if 'original_trades_df' in st.session_state:
                        del st.session_state['original_trades_df']
                    time.sleep(1)
                    st.rerun()
                else:
                    st.info("No changes detected.")
                    
            except Exception as e:
                st.error(f"Error saving changes: {e}")
    
    with col2:
        if st.button("�️ Delete Selected", type="secondary", use_container_width=True):
            # Get rows marked for deletion
            rows_to_delete = edited_df[edited_df['Delete'] == True]
            
            if len(rows_to_delete) == 0:
                st.warning("⚠️ No transactions selected for deletion.")
            else:
                try:
                    conn = get_conn()
                    cur = conn.cursor()
                    deleted_count = 0
                    
                    for idx in rows_to_delete.index:
                        row = edited_df.iloc[idx]
                        buy_id = row.get('_buy_id')
                        sell_id = row.get('_sell_id')
                        
                        # Delete buy transaction
                        if pd.notna(buy_id) and buy_id is not None:
                            cur.execute("DELETE FROM transactions WHERE id = ?", (int(buy_id),))
                            deleted_count += 1
                        
                        # Delete sell transaction if exists
                        if pd.notna(sell_id) and sell_id is not None:
                            cur.execute("DELETE FROM transactions WHERE id = ?", (int(sell_id),))
                            deleted_count += 1
                    
                    conn.commit()
                    conn.close()
                    
                    st.success(f"✅ {deleted_count} transaction(s) deleted successfully!")
                    if 'original_trades_df' in st.session_state:
                        del st.session_state['original_trades_df']
                    time.sleep(1)
                    st.rerun()
                    
                except Exception as e:
                    st.error(f"Error deleting transactions: {e}")
    
    with col3:
        if st.button("🔄 Refresh", use_container_width=True):
            if 'original_trades_df' in st.session_state:
                del st.session_state['original_trades_df']
            st.rerun()
    
    with col4:
        # Delete All Transactions button with confirmation
        if st.button("⚠️ Delete All Transactions", type="secondary", use_container_width=True):
            st.session_state['confirm_delete_all'] = True
    
    # Confirmation dialog for Delete All
    if st.session_state.get('confirm_delete_all', False):
        st.warning("⚠️ **WARNING:** This will permanently delete ALL buy and sell transactions in the selected date range!")
        col_conf1, col_conf2, col_conf3 = st.columns([1, 1, 4])
        with col_conf1:
            if st.button("✅ Yes, Delete All", type="primary"):
                try:
                    conn = get_conn()
                    cur = conn.cursor()
                    deleted_count = 0
                    all_ids = []
                    
                    # Get all transaction IDs from the current view (use original edit_df, not edited_df)
                    for idx in range(len(edit_df)):
                        row = edit_df.iloc[idx]
                        buy_id = row.get('_buy_id')
                        sell_id = row.get('_sell_id')
                        
                        # Delete buy transaction
                        if pd.notna(buy_id) and buy_id is not None:
                            buy_id_int = int(buy_id)
                            cur.execute("DELETE FROM transactions WHERE id = ?", (buy_id_int,))
                            if cur.rowcount > 0:
                                deleted_count += 1
                                all_ids.append(buy_id_int)
                        
                        # Delete sell transaction if exists
                        if pd.notna(sell_id) and sell_id is not None:
                            sell_id_int = int(sell_id)
                            cur.execute("DELETE FROM transactions WHERE id = ?", (sell_id_int,))
                            if cur.rowcount > 0:
                                deleted_count += 1
                                all_ids.append(sell_id_int)
                    
                    conn.commit()
                    conn.close()
                    
                    if deleted_count > 0:
                        st.success(f"✅ Successfully deleted ALL {deleted_count} transactions (IDs: {len(all_ids)})")
                    else:
                        st.warning("⚠️ No transactions found to delete.")
                    
                    # Clear state and refresh
                    st.session_state['confirm_delete_all'] = False
                    if 'original_trades_df' in st.session_state:
                        del st.session_state['original_trades_df']
                    st.rerun()
                    
                except Exception as e:
                    st.error(f"Error deleting all transactions: {e}")
                    import traceback
                    st.code(traceback.format_exc())
                    st.session_state['confirm_delete_all'] = False
        
        with col_conf2:
            if st.button("❌ Cancel"):
                st.session_state['confirm_delete_all'] = False
                st.rerun()
    
    st.divider()
    
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
    df = query_df("SELECT snapshot_date, portfolio_value FROM portfolio_snapshots ORDER BY snapshot_date ASC")
    
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
    df = query_df("SELECT snapshot_date, portfolio_value FROM portfolio_snapshots ORDER BY snapshot_date ASC")
    
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
    latest_snapshot = query_df(
        "SELECT portfolio_value, accumulated_cash, net_gain, roi_percent, snapshot_date FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1"
    )
    
    # Calculate LIVE portfolio value from current prices and holdings
    live_portfolio_value = 0.0
    for port_name in PORTFOLIO_CCY.keys():
        df_port = build_portfolio_table(port_name)
        if not df_port.empty:
            for _, row in df_port.iterrows():
                live_portfolio_value += convert_to_kwd(row['Market Value'], row['Currency'])

    # Get total cash deposits
    all_deposits = query_df("SELECT amount, currency, include_in_analysis FROM cash_deposits")
    
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
    
    # Get total number of stocks
    total_stocks = query_df("SELECT COUNT(DISTINCT stock_symbol) as count FROM transactions")
    num_stocks = total_stocks["count"].iloc[0] if not total_stocks.empty else 0
    
    # Get total transactions
    total_txns = query_df("SELECT COUNT(*) as count FROM transactions")
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

    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        sub_text = f"Last snap: {latest_snapshot['snapshot_date'].iloc[0]}" if not latest_snapshot.empty else "Live based on current prices"
        st.markdown(f"""
        <div class="ov-card">
            <div class="ov-title">💼 Portfolio Value</div>
            <div class="ov-value">{fmt_money_plain(live_portfolio_value, 3)} <span class="ov-currency">KWD</span></div>
            <div class="ov-sub">{sub_text}</div>
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
    portfolio_history = query_df(
        "SELECT snapshot_date as date, portfolio_value as balance, accumulated_cash FROM portfolio_snapshots ORDER BY snapshot_date"
    )
    
    # Collect ALL cash flows (deposits + dividends) with their timing
    # FOR MWRR: Use CORRECT data sources per user specification
    
    # 1. CASH DEPOSITS from cash_deposits table (MY OWN MONEY = NEGATIVE)
    # Exclude 1970 dates and zero amounts
    cash_deposits_for_mwrr = query_df(
        """
        SELECT deposit_date as date, 
               amount, 
               'DEPOSIT' as type 
        FROM cash_deposits 
        WHERE deposit_date NOT LIKE '1970%'
        AND deposit_date IS NOT NULL
        AND amount > 0
        """
    )
    
    # 2. NON-REINVESTED DIVIDENDS ONLY (CASH PAID OUT = POSITIVE)
    # Exclude reinvested dividends from IRR calculation
    cash_dividends_only = query_df(
        """
        SELECT txn_date as date, 
               COALESCE(cash_dividend, 0) as amount, 
               'DIVIDEND' as type 
        FROM transactions 
        WHERE COALESCE(cash_dividend, 0) > 0
        AND txn_date NOT LIKE '1970%'
        AND txn_date IS NOT NULL
        """
    )
    
    # FOR TWR: Still use cash_deposits with include_in_analysis flag
    deposits_for_twr = query_df(
        "SELECT deposit_date as date, amount, 'DEPOSIT' as type FROM cash_deposits WHERE include_in_analysis = 1"
    )
    
    # For TWR: Include BOTH cash and reinvested dividends (all returns)
    all_dividends = query_df(
        """
        SELECT txn_date as date, 
               COALESCE(cash_dividend, 0) + COALESCE(reinvested_dividend, 0) as amount, 
               'DIVIDEND' as type 
        FROM transactions 
        WHERE (COALESCE(cash_dividend, 0) + COALESCE(reinvested_dividend, 0)) > 0
        """
    )
    
    # Withdrawals (if any - for both TWR and MWRR)
    withdrawals = query_df(
        """
        SELECT txn_date as date,
               COALESCE(sell_value, 0) as amount,
               'WITHDRAWAL' as type
        FROM transactions
        WHERE txn_type = 'Sell' AND sell_value > 0
        """
    )
    
    # Cash flows for MWRR (cash deposits from Cash Deposits tab + cash dividends only)
    # NOTE: Reinvested dividends are EXCLUDED (they stay in portfolio value)
    # NOTE: Buy/Sell transactions are EXCLUDED (use actual cash deposits instead)
    mwrr_components = []
    if not cash_deposits_for_mwrr.empty:
        mwrr_components.append(cash_deposits_for_mwrr)
    if not cash_dividends_only.empty:
        mwrr_components.append(cash_dividends_only)
    if not withdrawals.empty:
        mwrr_components.append(withdrawals)
    
    if mwrr_components:
        cash_flows_mwrr = pd.concat(mwrr_components, ignore_index=True).sort_values('date')
    else:
        cash_flows_mwrr = pd.DataFrame(columns=['date', 'amount', 'type'])
    
    # Cash flows for TWR (OLD WORKING FORMULA - use cash_deposits + all dividends)
    twr_components = []
    if not deposits_for_twr.empty:
        twr_components.append(deposits_for_twr)
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
            # Diagnostic message
            if cash_flows_mwrr.empty:
                st.caption("⚠️ No cash deposits found - add deposits in 'Cash Deposits' tab")
            elif current_portfolio_value <= 0:
                st.caption("⚠️ No current portfolio value available")
            else:
                st.caption("⚠️ Need valid cash deposits and current portfolio value")
    
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
# MAIN
# =========================
def main():
    init_db()

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
        st.session_state.theme = "light" if st.session_state.theme == "dark" else "dark"

    # Header with theme toggle on the right
    col1, col2 = st.columns([4, 1])
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

    tabs = st.tabs(
        [
            "Overview",
            "Add Cash Deposit",
            "Add Transactions",
            "Portfolio Analysis",
            "Trading Section",
            "Portfolio Tracker",
            "Dividends Tracker",
        ]
    )

    with tabs[0]:
        ui_overview()

    with tabs[1]:
        ui_cash_deposits()

    with tabs[2]:
        ui_transactions()

    with tabs[3]:
        ui_portfolio_analysis()

    with tabs[4]:
        ui_trading_section()

    with tabs[5]:
        ui_portfolio_tracker()

    with tabs[6]:
        ui_dividends_tracker()

    st.caption("DB: portfolio.db | UI: Streamlit")


if __name__ == "__main__":
    main()
