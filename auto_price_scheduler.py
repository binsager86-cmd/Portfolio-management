"""
Auto Price Fetcher & Portfolio Snapshot Scheduler
=================================================
Automatically fetches stock prices and saves portfolio snapshots at 2 PM Kuwait time daily.

Features:
- Runs independently of the Streamlit UI (no login required)
- Timezone-aware scheduling (Kuwait Time = Asia/Kuwait = UTC+3)
- Fetches prices for ALL users' stocks
- Saves portfolio snapshots for each user
- Comprehensive logging for monitoring
- Graceful error handling and retry logic

Usage:
    python auto_price_scheduler.py           # Run scheduler (continuous)
    python auto_price_scheduler.py --run-now # Run immediately once (for testing)
    python auto_price_scheduler.py --status  # Check scheduler status

Author: Portfolio App
Date: 2026-01-22
"""

import sqlite3
import time
import logging
import argparse
import os
import sys
from datetime import datetime, date
from typing import Dict, List, Tuple, Optional
import random

# Timezone handling
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except ImportError:
    from backports.zoneinfo import ZoneInfo  # Fallback

# APScheduler for scheduling
try:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
    SCHEDULER_AVAILABLE = True
except ImportError:
    SCHEDULER_AVAILABLE = False
    print("⚠️ APScheduler not installed. Run: pip install apscheduler")

# yfinance for price fetching
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    pd = None

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except (ImportError, TypeError) as e:
    YFINANCE_AVAILABLE = False
    yf = None
    print(f"⚠️ yfinance import issue: {e}")

# =============================================================================
# CONFIGURATION
# =============================================================================

# Database path (same as ui.py)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio.db")

# Kuwait timezone (UTC+3)
KUWAIT_TZ = ZoneInfo("Asia/Kuwait")

# Scheduled time: 2 PM Kuwait time (14:00)
SCHEDULED_HOUR = 14
SCHEDULED_MINUTE = 0

# Retry settings
MAX_RETRIES = 3
RETRY_DELAY_BASE = 2  # Exponential backoff base

# Logging configuration
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auto_price_scheduler.log")

# Kuwait stock suffix
KUWAIT_SUFFIX = ".KW"

# =============================================================================
# LOGGING SETUP
# =============================================================================

def setup_logging():
    """Configure logging to both file and console."""
    logger = logging.getLogger("AutoPriceScheduler")
    logger.setLevel(logging.INFO)
    
    # File handler
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
    file_handler.setLevel(logging.INFO)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    
    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

logger = setup_logging()

# =============================================================================
# DATABASE HELPERS
# =============================================================================

def get_db_connection() -> sqlite3.Connection:
    """Get database connection with row factory."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def get_all_users() -> List[Dict]:
    """Get all active users from the database."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, username FROM users WHERE id > 0")
        users = [dict(row) for row in cur.fetchall()]
        return users
    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        return []
    finally:
        conn.close()

def get_user_stocks(user_id: int) -> List[Dict]:
    """Get all stocks with holdings for a specific user.
    
    Fetches from BOTH sources:
    1. Main Portfolio: stocks table + transactions table
    2. Trading Section: trading_history table (open positions)
    
    This ensures ALL user stocks are captured regardless of where they were added.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    stocks = []
    seen_symbols = set()
    
    try:
        # =========================================
        # SOURCE 1: Main Portfolio (stocks + transactions)
        # =========================================
        cur.execute("""
            SELECT 
                s.id,
                s.symbol,
                s.name,
                s.portfolio,
                s.currency,
                s.current_price,
                COALESCE(h.total_shares, 0) as shares
            FROM stocks s
            LEFT JOIN (
                SELECT 
                    stock_symbol,
                    user_id,
                    SUM(CASE 
                        WHEN txn_type = 'Buy' THEN shares + COALESCE(bonus_shares, 0)
                        WHEN txn_type = 'Sell' THEN -shares
                        ELSE 0
                    END) as total_shares
                FROM transactions
                WHERE user_id = ?
                GROUP BY stock_symbol, user_id
            ) h ON s.symbol = h.stock_symbol AND s.user_id = h.user_id
            WHERE s.user_id = ? AND COALESCE(h.total_shares, 0) > 0
        """, (user_id, user_id))
        
        for row in cur.fetchall():
            stock = dict(row)
            stocks.append(stock)
            seen_symbols.add(stock['symbol'].upper())
        
        # =========================================
        # SOURCE 2: Trading History (open positions)
        # =========================================
        cur.execute("""
            SELECT 
                stock_symbol as symbol,
                SUM(CASE 
                    WHEN txn_type = 'Buy' THEN shares + COALESCE(bonus_shares, 0)
                    WHEN txn_type = 'Sell' THEN -shares
                    ELSE 0
                END) as total_shares
            FROM trading_history
            WHERE user_id = ?
            GROUP BY stock_symbol
            HAVING total_shares > 0
        """, (user_id,))
        
        for row in cur.fetchall():
            symbol = row['symbol']
            if symbol.upper() not in seen_symbols:
                # This is a trading-only stock, add it
                shares = row['total_shares']
                
                # Determine currency based on suffix
                currency = 'USD' if not symbol.endswith('.KW') else 'KWD'
                
                # Check if we have a price cached in stocks table
                cur.execute("""
                    SELECT id, current_price FROM stocks 
                    WHERE symbol = ? AND user_id = ?
                """, (symbol, user_id))
                stock_row = cur.fetchone()
                
                if stock_row:
                    stock_id = stock_row['id']
                    current_price = stock_row['current_price'] or 0
                else:
                    # Insert new stock entry for future caching
                    cur.execute("""
                        INSERT INTO stocks (symbol, name, portfolio, currency, user_id, current_price)
                        VALUES (?, ?, ?, ?, ?, 0)
                    """, (symbol, symbol, 'TRADING', currency, user_id))
                    conn.commit()
                    stock_id = cur.lastrowid
                    current_price = 0
                
                stocks.append({
                    'id': stock_id,
                    'symbol': symbol,
                    'name': symbol,
                    'portfolio': 'TRADING',
                    'currency': currency,
                    'current_price': current_price,
                    'shares': shares
                })
                seen_symbols.add(symbol.upper())
        
        return stocks
    except Exception as e:
        logger.error(f"Error fetching stocks for user {user_id}: {e}")
        return []
    finally:
        conn.close()

def update_stock_price(stock_id: int, price: float, user_id: int) -> bool:
    """Update stock price in database."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE stocks 
            SET current_price = ? 
            WHERE id = ? AND user_id = ?
        """, (price, stock_id, user_id))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error updating stock {stock_id}: {e}")
        return False
    finally:
        conn.close()

def get_previous_snapshot(user_id: int, exclude_date: str = None) -> Optional[Dict]:
    """Get the most recent portfolio snapshot for a user, optionally excluding a specific date.
    
    Args:
        user_id: User ID
        exclude_date: Date string (YYYY-MM-DD) to exclude (typically today's date)
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if exclude_date:
            cur.execute("""
                SELECT * FROM portfolio_snapshots 
                WHERE user_id = ? AND snapshot_date < ?
                ORDER BY snapshot_date DESC 
                LIMIT 1
            """, (user_id, exclude_date))
        else:
            cur.execute("""
                SELECT * FROM portfolio_snapshots 
                WHERE user_id = ? 
                ORDER BY snapshot_date DESC 
                LIMIT 1
            """, (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error fetching previous snapshot for user {user_id}: {e}")
        return None
    finally:
        conn.close()

def get_first_snapshot(user_id: int) -> Optional[Dict]:
    """Get the earliest (first) portfolio snapshot for a user."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT * FROM portfolio_snapshots 
            WHERE user_id = ? 
            ORDER BY snapshot_date ASC 
            LIMIT 1
        """, (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error fetching first snapshot for user {user_id}: {e}")
        return None
    finally:
        conn.close()

def get_total_deposits_for_date(user_id: int, date_str: str) -> float:
    """Get total cash deposits for a specific date."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT COALESCE(SUM(amount), 0) as total
            FROM cash_deposits 
            WHERE user_id = ? AND deposit_date = ? AND include_in_analysis = 1
        """, (user_id, date_str))
        row = cur.fetchone()
        return float(row['total']) if row else 0.0
    except Exception as e:
        logger.error(f"Error fetching deposits for user {user_id}: {e}")
        return 0.0
    finally:
        conn.close()

def save_portfolio_snapshot(user_id: int, snapshot_data: Dict) -> bool:
    """Save or update portfolio snapshot."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Check if snapshot exists for today
        cur.execute("""
            SELECT id FROM portfolio_snapshots 
            WHERE user_id = ? AND snapshot_date = ?
        """, (user_id, snapshot_data['snapshot_date']))
        existing = cur.fetchone()
        
        if existing:
            # Update existing
            cur.execute("""
                UPDATE portfolio_snapshots
                SET portfolio_value = ?, daily_movement = ?, beginning_difference = ?,
                    deposit_cash = ?, accumulated_cash = ?, net_gain = ?, 
                    change_percent = ?, roi_percent = ?, created_at = ?
                WHERE snapshot_date = ? AND user_id = ?
            """, (
                snapshot_data['portfolio_value'],
                snapshot_data['daily_movement'],
                snapshot_data['beginning_difference'],
                snapshot_data['deposit_cash'],
                snapshot_data['accumulated_cash'],
                snapshot_data['net_gain'],
                snapshot_data['change_percent'],
                snapshot_data['roi_percent'],
                int(time.time()),
                snapshot_data['snapshot_date'],
                user_id
            ))
        else:
            # Insert new
            cur.execute("""
                INSERT INTO portfolio_snapshots 
                (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                snapshot_data['snapshot_date'],
                snapshot_data['portfolio_value'],
                snapshot_data['daily_movement'],
                snapshot_data['beginning_difference'],
                snapshot_data['deposit_cash'],
                snapshot_data['accumulated_cash'],
                snapshot_data['net_gain'],
                snapshot_data['change_percent'],
                snapshot_data['roi_percent'],
                int(time.time())
            ))
        
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error saving snapshot for user {user_id}: {e}")
        return False
    finally:
        conn.close()

# =============================================================================
# PRICE FETCHING
# =============================================================================

def get_yf_ticker(symbol: str) -> str:
    """Convert symbol to Yahoo Finance ticker format."""
    if symbol.endswith('.KW') or symbol.endswith('.KSE'):
        return symbol
    # Assume Kuwait stock if short symbol
    if len(symbol) <= 5 and symbol.isalpha():
        return f"{symbol}.KW"
    return symbol

def normalize_kwd_price(price: float) -> float:
    """Normalize Kuwait stock price (Fils to KWD if needed)."""
    if price > 50:  # Likely in Fils
        return price / 1000.0
    return price

def fetch_price(symbol: str) -> Tuple[Optional[float], Optional[str]]:
    """Fetch stock price using yfinance with retry logic."""
    if not YFINANCE_AVAILABLE:
        return None, None
    
    yf_ticker = get_yf_ticker(symbol)
    variants = [yf_ticker] if yf_ticker != symbol else [symbol, f"{symbol}.KW"]
    
    for variant in variants:
        is_kuwait = variant.endswith('.KW') or variant.endswith('.KSE')
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                hist = yf.download(
                    variant,
                    period="5d",
                    interval="1d",
                    progress=False,
                    auto_adjust=False
                )
                
                if hist is not None and not hist.empty and 'Close' in hist.columns:
                    close_series = hist["Close"].dropna()
                    if not close_series.empty:
                        last_close = close_series.iloc[-1]
                        if isinstance(last_close, pd.Series):
                            price = float(last_close.iloc[0])
                        else:
                            price = float(last_close)
                        
                        if price > 0:
                            if is_kuwait:
                                price = normalize_kwd_price(price)
                            return price, variant
                            
            except Exception as e:
                if attempt < MAX_RETRIES:
                    wait = (RETRY_DELAY_BASE ** attempt) + random.uniform(0.3, 1.0)
                    time.sleep(wait)
                continue
        
        time.sleep(0.5)  # Delay between variants
    
    return None, None

def fetch_usd_kwd_rate() -> float:
    """Fetch USD to KWD exchange rate."""
    if not YFINANCE_AVAILABLE:
        return 0.307  # Fallback
    
    try:
        ticker = yf.Ticker("KWD=X")
        hist = ticker.history(period="5d", interval="1d")
        if hist is not None and not hist.empty and 'Close' in hist.columns:
            rate = float(hist["Close"].dropna().iloc[-1])
            if rate > 0:
                return rate
    except Exception as e:
        logger.warning(f"Failed to fetch USD/KWD rate: {e}")
    
    return 0.307  # Fallback rate

# =============================================================================
# MAIN JOB FUNCTION
# =============================================================================

def run_price_update_job():
    """
    Main job: Fetch prices for all users and save portfolio snapshots.
    This runs at 2 PM Kuwait time daily.
    """
    kuwait_now = datetime.now(KUWAIT_TZ)
    today_str = kuwait_now.strftime("%Y-%m-%d")
    
    logger.info("=" * 60)
    logger.info(f"🚀 AUTO PRICE UPDATE JOB STARTED")
    logger.info(f"📅 Date: {today_str}")
    logger.info(f"🕐 Kuwait Time: {kuwait_now.strftime('%H:%M:%S')}")
    logger.info("=" * 60)
    
    # Check database exists
    if not os.path.exists(DB_PATH):
        logger.error(f"❌ Database not found: {DB_PATH}")
        return
    
    # Get USD/KWD rate
    usd_kwd_rate = fetch_usd_kwd_rate()
    logger.info(f"💱 USD/KWD Rate: {usd_kwd_rate:.4f}")
    
    # Get all users
    users = get_all_users()
    if not users:
        logger.warning("⚠️ No users found in database")
        return
    
    logger.info(f"👥 Found {len(users)} user(s)")
    
    total_stocks_updated = 0
    total_snapshots_saved = 0
    
    for user in users:
        user_id = user['id']
        username = user.get('username', f'User_{user_id}')
        
        logger.info(f"\n--- Processing User: {username} (ID: {user_id}) ---")
        
        # Get user's stocks
        stocks = get_user_stocks(user_id)
        if not stocks:
            logger.info(f"  No stocks found for user {username}")
            continue
        
        logger.info(f"  📊 Found {len(stocks)} stock(s)")
        
        # Fetch and update prices
        portfolio_value = 0.0
        updated_count = 0
        
        for stock in stocks:
            symbol = stock['symbol']
            stock_id = stock['id']
            currency = stock.get('currency', 'KWD')
            shares = stock.get('shares') or 0
            
            # Fetch price
            price, used_ticker = fetch_price(symbol)
            
            if price is not None:
                # Update database
                if update_stock_price(stock_id, price, user_id):
                    updated_count += 1
                    total_stocks_updated += 1
                    
                    # Calculate value in KWD
                    if currency == 'USD':
                        value_kwd = price * shares * usd_kwd_rate
                    else:
                        value_kwd = price * shares
                    
                    portfolio_value += value_kwd
                    logger.info(f"    ✅ {symbol}: {price:.4f} {currency} ({used_ticker})")
                else:
                    logger.warning(f"    ⚠️ {symbol}: Failed to update DB")
            else:
                # Use existing price
                old_price = stock.get('current_price') or 0
                if old_price > 0:
                    if currency == 'USD':
                        value_kwd = old_price * shares * usd_kwd_rate
                    else:
                        value_kwd = old_price * shares
                    portfolio_value += value_kwd
                    logger.warning(f"    ⚠️ {symbol}: Using cached price {old_price:.4f}")
                else:
                    logger.error(f"    ❌ {symbol}: No price available")
        
        logger.info(f"  📈 Updated {updated_count}/{len(stocks)} prices")
        logger.info(f"  💰 Portfolio Value: {portfolio_value:,.2f} KWD")
        
        # Save portfolio snapshot
        if portfolio_value > 0:
            # Get previous snapshot for calculations (EXCLUDE today to avoid self-comparison)
            prev_snapshot = get_previous_snapshot(user_id, exclude_date=today_str)
            
            prev_value = prev_snapshot['portfolio_value'] if prev_snapshot else 0
            prev_accumulated = prev_snapshot['accumulated_cash'] if prev_snapshot else 0
            
            # Get the FIRST snapshot for beginning difference calculation
            first_snapshot = get_first_snapshot(user_id)
            first_value = first_snapshot['portfolio_value'] if first_snapshot else portfolio_value
            
            # Get today's deposits
            today_deposits = get_total_deposits_for_date(user_id, today_str)
            accumulated_cash = prev_accumulated + today_deposits
            
            # Calculate metrics
            daily_movement = portfolio_value - prev_value if prev_value > 0 else 0
            beginning_diff = portfolio_value - first_value
            net_gain = portfolio_value - accumulated_cash if accumulated_cash > 0 else 0
            change_percent = (daily_movement / prev_value * 100) if prev_value > 0 else 0
            roi_percent = (net_gain / accumulated_cash * 100) if accumulated_cash > 0 else 0
            
            snapshot_data = {
                'snapshot_date': today_str,
                'portfolio_value': portfolio_value,
                'daily_movement': daily_movement,
                'beginning_difference': beginning_diff,
                'deposit_cash': today_deposits,
                'accumulated_cash': accumulated_cash,
                'net_gain': net_gain,
                'change_percent': change_percent,
                'roi_percent': roi_percent
            }
            
            if save_portfolio_snapshot(user_id, snapshot_data):
                total_snapshots_saved += 1
                logger.info(f"  💾 Snapshot saved for {today_str}")
            else:
                logger.error(f"  ❌ Failed to save snapshot")
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info(f"✅ JOB COMPLETED")
    logger.info(f"   📊 Stocks Updated: {total_stocks_updated}")
    logger.info(f"   💾 Snapshots Saved: {total_snapshots_saved}")
    logger.info(f"   ⏱️ Finished at: {datetime.now(KUWAIT_TZ).strftime('%H:%M:%S')} Kuwait Time")
    logger.info("=" * 60 + "\n")

# =============================================================================
# SCHEDULER
# =============================================================================

def start_scheduler():
    """Start the APScheduler with Kuwait timezone."""
    if not SCHEDULER_AVAILABLE:
        logger.error("❌ APScheduler not available. Install with: pip install apscheduler")
        return
    
    scheduler = BlockingScheduler(timezone=KUWAIT_TZ)
    
    # Add job: Run at 2 PM Kuwait time every day
    scheduler.add_job(
        run_price_update_job,
        trigger=CronTrigger(
            hour=SCHEDULED_HOUR,
            minute=SCHEDULED_MINUTE,
            timezone=KUWAIT_TZ
        ),
        id='daily_price_update',
        name='Daily Price Update at 2 PM Kuwait Time',
        replace_existing=True
    )
    
    kuwait_now = datetime.now(KUWAIT_TZ)
    logger.info("=" * 60)
    logger.info("🤖 AUTO PRICE SCHEDULER STARTED")
    logger.info(f"📅 Current Kuwait Time: {kuwait_now.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"⏰ Scheduled Time: {SCHEDULED_HOUR:02d}:{SCHEDULED_MINUTE:02d} Kuwait Time (Daily)")
    logger.info(f"📁 Database: {DB_PATH}")
    logger.info(f"📝 Log File: {LOG_FILE}")
    logger.info("=" * 60)
    logger.info("Press Ctrl+C to stop the scheduler\n")
    
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("\n🛑 Scheduler stopped by user")
        scheduler.shutdown()

def check_status():
    """Check and display scheduler status."""
    kuwait_now = datetime.now(KUWAIT_TZ)
    
    print("\n" + "=" * 50)
    print("📊 AUTO PRICE SCHEDULER STATUS")
    print("=" * 50)
    print(f"🕐 Current Kuwait Time: {kuwait_now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"⏰ Scheduled Run Time: {SCHEDULED_HOUR:02d}:{SCHEDULED_MINUTE:02d} Daily")
    print(f"📁 Database Path: {DB_PATH}")
    print(f"📝 Log File: {LOG_FILE}")
    print(f"✅ Database Exists: {os.path.exists(DB_PATH)}")
    print(f"✅ Log File Exists: {os.path.exists(LOG_FILE)}")
    
    # Check dependencies
    print("\n📦 Dependencies:")
    print(f"  - APScheduler: {'✅ Installed' if SCHEDULER_AVAILABLE else '❌ Missing'}")
    print(f"  - yfinance: {'✅ Installed' if YFINANCE_AVAILABLE else '❌ Missing'}")
    
    # Check last log entries
    if os.path.exists(LOG_FILE):
        print("\n📜 Recent Log Entries:")
        try:
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                for line in lines[-10:]:
                    print(f"  {line.strip()}")
        except Exception as e:
            print(f"  Error reading log: {e}")
    
    print("=" * 50 + "\n")

# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Auto Price Fetcher & Portfolio Snapshot Scheduler"
    )
    parser.add_argument(
        '--run-now',
        action='store_true',
        help='Run the price update job immediately (for testing)'
    )
    parser.add_argument(
        '--status',
        action='store_true',
        help='Check scheduler status and configuration'
    )
    
    args = parser.parse_args()
    
    if args.status:
        check_status()
    elif args.run_now:
        logger.info("🔄 Running price update job immediately (--run-now)")
        run_price_update_job()
    else:
        start_scheduler()

if __name__ == "__main__":
    main()
