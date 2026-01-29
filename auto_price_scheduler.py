"""
Auto Price Fetcher & Portfolio Snapshot Scheduler
=================================================
Worker process that runs on DigitalOcean App Platform.
Automatically fetches stock prices and saves portfolio snapshots at 2 PM Kuwait time daily.

Features:
- Uses db_layer.py for PostgreSQL/SQLite compatibility
- Timezone-aware scheduling (Kuwait Time = UTC+3)
- Fetches prices for ALL users' stocks
- Saves portfolio snapshots for each user
- Comprehensive logging for monitoring

Usage:
    python auto_price_scheduler.py           # Run scheduler (continuous)
    python auto_price_scheduler.py --run-now # Run immediately once (for testing)

Author: Portfolio App
"""

import os
import sys
import time
import logging
from datetime import datetime, date
from typing import Dict, List, Optional

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Timezone handling
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

# APScheduler for scheduling
try:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
    SCHEDULER_AVAILABLE = True
except ImportError:
    SCHEDULER_AVAILABLE = False
    print("⚠️ APScheduler not installed. Run: pip install apscheduler")

# pandas for data handling
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    pd = None

# yfinance for price fetching
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

# Kuwait timezone (UTC+3)
KUWAIT_TZ = ZoneInfo("Asia/Kuwait")

# Scheduled time: 2 PM Kuwait time (14:00) = 11:00 UTC
SCHEDULED_HOUR = 11  # UTC hour (14:00 Kuwait = 11:00 UTC)
SCHEDULED_MINUTE = 0

# Kuwait stock suffix
KUWAIT_SUFFIX = ".KW"

# =============================================================================
# LOGGING SETUP
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout
)
logger = logging.getLogger("AutoPriceScheduler")

# =============================================================================
# DATABASE LAYER - Uses db_layer.py for PostgreSQL/SQLite compatibility
# =============================================================================

def get_db_functions():
    """Import database functions from db_layer.py"""
    try:
        from db_layer import get_conn, query_df, exec_sql, is_postgres
        return get_conn, query_df, exec_sql, is_postgres
    except ImportError as e:
        logger.error(f"Failed to import db_layer: {e}")
        raise


def get_all_users() -> List[Dict]:
    """Get all active users from the database."""
    _, query_df, _, _ = get_db_functions()
    try:
        df = query_df("SELECT id, username FROM users WHERE id > 0")
        if df.empty:
            return []
        return df.to_dict('records')
    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        return []


def get_user_stocks(user_id: int) -> List[Dict]:
    """Get all stocks with current holdings for a user."""
    _, query_df, _, is_postgres = get_db_functions()
    try:
        # Use %s for PostgreSQL, ? for SQLite
        placeholder = '%s' if is_postgres() else '?'
        
        df = query_df(f"""
            SELECT 
                s.id,
                s.symbol,
                s.name,
                s.portfolio,
                s.currency,
                s.current_price,
                COALESCE(SUM(CASE WHEN t.txn_type = 'Buy' THEN t.shares + COALESCE(t.bonus_shares, 0) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.txn_type = 'Sell' THEN t.shares ELSE 0 END), 0) as shares
            FROM stocks s
            LEFT JOIN transactions t ON s.symbol = t.stock_symbol AND s.user_id = t.user_id
            WHERE s.user_id = {placeholder}
            GROUP BY s.id, s.symbol, s.name, s.portfolio, s.currency, s.current_price
            HAVING COALESCE(SUM(CASE WHEN t.txn_type = 'Buy' THEN t.shares + COALESCE(t.bonus_shares, 0) ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN t.txn_type = 'Sell' THEN t.shares ELSE 0 END), 0) > 0
        """, (user_id,))
        
        if df.empty:
            return []
        return df.to_dict('records')
    except Exception as e:
        logger.error(f"Error fetching stocks for user {user_id}: {e}")
        return []


def update_stock_price(stock_id: int, price: float, user_id: int) -> bool:
    """Update stock price in database."""
    _, _, exec_sql, is_postgres = get_db_functions()
    try:
        placeholder = '%s' if is_postgres() else '?'
        exec_sql(f"UPDATE stocks SET current_price = {placeholder} WHERE id = {placeholder} AND user_id = {placeholder}", 
                 (price, stock_id, user_id))
        return True
    except Exception as e:
        logger.error(f"Error updating price for stock {stock_id}: {e}")
        return False


# =============================================================================
# PRICE FETCHING
# =============================================================================

def normalize_kwd_price(raw_price: float, currency: str) -> float:
    """Normalize Kuwait stock prices (convert fils to KWD if needed)."""
    if currency != 'KWD':
        return raw_price
    
    # If price > 50, likely in fils - convert to KWD
    if raw_price > 50:
        return raw_price / 1000.0
    return raw_price


def fetch_price(symbol: str) -> tuple:
    """Fetch current price for a stock symbol.
    
    Returns:
        (price, ticker_used) or (None, None) if failed
    """
    if not YFINANCE_AVAILABLE or yf is None:
        logger.warning("yfinance not available")
        return None, None
    
    symbol_upper = symbol.upper().strip()
    
    # Try different ticker formats
    tickers_to_try = []
    
    if symbol_upper.endswith('.KW'):
        tickers_to_try = [symbol_upper]
    elif '.' not in symbol_upper:
        # Try Kuwait suffix first, then plain
        tickers_to_try = [f"{symbol_upper}.KW", symbol_upper]
    else:
        tickers_to_try = [symbol_upper]
    
    for ticker in tickers_to_try:
        try:
            data = yf.download(ticker, period="5d", progress=False, threads=False)
            if not data.empty and 'Close' in data.columns:
                close_series = data['Close'].dropna()
                if not close_series.empty:
                    price = float(close_series.iloc[-1])
                    return price, ticker
        except Exception as e:
            logger.debug(f"Failed to fetch {ticker}: {e}")
            continue
    
    return None, None


def fetch_usd_kwd_rate() -> float:
    """Fetch current USD/KWD exchange rate."""
    if not YFINANCE_AVAILABLE or yf is None:
        return 0.307
    
    try:
        data = yf.download("USDKWD=X", period="5d", progress=False, threads=False)
        if not data.empty and 'Close' in data.columns:
            return float(data['Close'].dropna().iloc[-1])
    except Exception as e:
        logger.warning(f"Failed to fetch USD/KWD rate: {e}")
    
    return 0.307  # Fallback rate


# =============================================================================
# SNAPSHOT SAVING
# =============================================================================

def save_portfolio_snapshot(user_id: int, portfolio_value: float, usd_kwd_rate: float) -> bool:
    """Save daily portfolio snapshot for a user."""
    _, query_df, exec_sql, is_postgres = get_db_functions()
    
    try:
        today_str = date.today().isoformat()
        placeholder = '%s' if is_postgres() else '?'
        
        # Get previous snapshot
        prev_snap = query_df(
            f"SELECT portfolio_value, accumulated_cash FROM portfolio_snapshots WHERE user_id = {placeholder} ORDER BY snapshot_date DESC LIMIT 1",
            (user_id,)
        )
        
        prev_value = float(prev_snap['portfolio_value'].iloc[0]) if not prev_snap.empty else 0.0
        prev_accumulated = 0.0
        if not prev_snap.empty and 'accumulated_cash' in prev_snap.columns:
            val = prev_snap['accumulated_cash'].iloc[0]
            prev_accumulated = float(val) if pd.notna(val) else 0.0
        
        # Calculate metrics
        daily_movement = portfolio_value - prev_value if prev_value > 0 else 0.0
        accumulated_cash = prev_accumulated  # Carry forward (deposits handled separately)
        
        # Get first snapshot for beginning diff
        first_snap = query_df(
            f"SELECT portfolio_value FROM portfolio_snapshots WHERE user_id = {placeholder} ORDER BY snapshot_date ASC LIMIT 1",
            (user_id,)
        )
        
        if first_snap.empty:
            beginning_diff = 0.0
        else:
            baseline = float(first_snap['portfolio_value'].iloc[0])
            beginning_diff = portfolio_value - baseline
        
        net_gain = beginning_diff - accumulated_cash
        
        # Get total deposits for ROI
        total_deps = query_df(
            f"SELECT SUM(amount) as total FROM cash_deposits WHERE user_id = {placeholder} AND include_in_analysis = 1",
            (user_id,)
        )
        total_deposits = 0.0
        if not total_deps.empty and pd.notna(total_deps['total'].iloc[0]):
            total_deposits = float(total_deps['total'].iloc[0])
        
        roi_percent = (net_gain / total_deposits * 100) if total_deposits > 0 else 0.0
        change_percent = ((portfolio_value - prev_value) / prev_value * 100) if prev_value > 0 else 0.0
        
        # Check if snapshot exists for today
        existing = query_df(
            f"SELECT id FROM portfolio_snapshots WHERE snapshot_date = {placeholder} AND user_id = {placeholder}",
            (today_str, user_id)
        )
        
        if not existing.empty:
            # Update existing
            exec_sql(f"""
                UPDATE portfolio_snapshots
                SET portfolio_value = {placeholder}, daily_movement = {placeholder}, beginning_difference = {placeholder},
                    accumulated_cash = {placeholder}, net_gain = {placeholder}, change_percent = {placeholder}, roi_percent = {placeholder}, created_at = {placeholder}
                WHERE snapshot_date = {placeholder} AND user_id = {placeholder}
            """, (float(portfolio_value), float(daily_movement), float(beginning_diff),
                  float(accumulated_cash), float(net_gain), float(change_percent), float(roi_percent),
                  int(time.time()), today_str, user_id))
            logger.info(f"  📊 Updated snapshot for {today_str}")
        else:
            # Insert new
            exec_sql(f"""
                INSERT INTO portfolio_snapshots 
                (user_id, snapshot_date, portfolio_value, daily_movement, beginning_difference, 
                 deposit_cash, accumulated_cash, net_gain, change_percent, roi_percent, created_at)
                VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, 
                        {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """, (user_id, today_str, float(portfolio_value), float(daily_movement), float(beginning_diff),
                  0.0, float(accumulated_cash), float(net_gain), float(change_percent), float(roi_percent),
                  int(time.time())))
            logger.info(f"  📊 Saved new snapshot for {today_str}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error saving snapshot for user {user_id}: {e}")
        return False


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
    logger.info("🚀 AUTO PRICE UPDATE JOB STARTED")
    logger.info(f"📅 Date: {today_str}")
    logger.info(f"🕐 Kuwait Time: {kuwait_now.strftime('%H:%M:%S')}")
    logger.info("=" * 60)
    
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
            currency = stock.get('currency', 'KWD') or 'KWD'
            shares = float(stock.get('shares', 0) or 0)
            
            # Fetch price
            price, used_ticker = fetch_price(symbol)
            
            if price is not None:
                # Normalize Kuwait prices
                if currency == 'KWD':
                    price = normalize_kwd_price(price, currency)
                
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
                old_price = float(stock.get('current_price', 0) or 0)
                if old_price > 0:
                    if currency == 'USD':
                        value_kwd = old_price * shares * usd_kwd_rate
                    else:
                        value_kwd = old_price * shares
                    portfolio_value += value_kwd
                logger.warning(f"    ❌ {symbol}: Could not fetch price (using existing)")
        
        logger.info(f"  Updated {updated_count}/{len(stocks)} prices")
        logger.info(f"  Portfolio Value: {portfolio_value:,.3f} KWD")
        
        # Save snapshot
        if portfolio_value > 0:
            if save_portfolio_snapshot(user_id, portfolio_value, usd_kwd_rate):
                total_snapshots_saved += 1
    
    logger.info("\n" + "=" * 60)
    logger.info("✅ JOB COMPLETED")
    logger.info(f"📈 Stocks Updated: {total_stocks_updated}")
    logger.info(f"📊 Snapshots Saved: {total_snapshots_saved}")
    logger.info(f"⏱️ Finished at: {datetime.now(KUWAIT_TZ).strftime('%H:%M:%S')} Kuwait Time")
    logger.info("=" * 60 + "\n")


# =============================================================================
# SCHEDULER
# =============================================================================

def start_scheduler():
    """Start the APScheduler to run the job daily."""
    if not SCHEDULER_AVAILABLE:
        logger.error("APScheduler not available. Cannot start scheduler.")
        return
    
    scheduler = BlockingScheduler(timezone="UTC")
    
    # Schedule at 11:00 UTC = 14:00 Kuwait Time
    scheduler.add_job(
        run_price_update_job,
        CronTrigger(hour=SCHEDULED_HOUR, minute=SCHEDULED_MINUTE),
        id='daily_price_update',
        name='Daily Price Update & Snapshot'
    )
    
    logger.info("=" * 60)
    logger.info("🕐 SCHEDULER STARTED")
    logger.info(f"⏰ Scheduled for: {SCHEDULED_HOUR:02d}:{SCHEDULED_MINUTE:02d} UTC (14:00 Kuwait)")
    logger.info("📋 Job: Daily Price Update & Portfolio Snapshot")
    logger.info("=" * 60)
    
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")


# =============================================================================
# MAIN
# =============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Auto Price Scheduler for Portfolio App')
    parser.add_argument('--run-now', action='store_true', help='Run the job immediately (once)')
    args = parser.parse_args()
    
    logger.info("🚀 Auto Price Scheduler Starting...")
    
    # Test database connection
    try:
        _, query_df, _, is_postgres = get_db_functions()
        db_type = "PostgreSQL" if is_postgres() else "SQLite"
        logger.info(f"📂 Database: {db_type}")
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        sys.exit(1)
    
    if args.run_now:
        logger.info("🔄 Running job immediately (--run-now)")
        run_price_update_job()
    else:
        start_scheduler()


if __name__ == "__main__":
    main()
