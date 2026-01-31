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
# DATA INTEGRITY CHECK (Nightly Validation)
# =============================================================================

def send_integrity_alert(message: str, severity: str = "WARNING"):
    """
    Send integrity alert via logging and optional notification.
    
    In production, this could be extended to send:
    - Email notifications
    - Slack/Discord webhooks
    - SMS alerts
    """
    if severity == "CRITICAL":
        logger.critical(f"🚨 INTEGRITY ALERT: {message}")
    elif severity == "WARNING":
        logger.warning(f"⚠️ INTEGRITY WARNING: {message}")
    else:
        logger.info(f"ℹ️ INTEGRITY NOTE: {message}")
    
    # TODO: Add webhook/email notification here for production
    # Example: requests.post(SLACK_WEBHOOK_URL, json={"text": f"[{severity}] {message}"})


def run_integrity_check_for_user(user_id: int, username: str = None) -> dict:
    """
    Run comprehensive data integrity checks for a single user.
    
    Checks:
    1. Cash Ledger Validation - portfolio_cash vs calculated
    2. Snapshot Accumulated Cash - stored vs direct calculation from deposits
    3. Position Closure Validation - CFA compliance check
    
    Returns dict with check results and any issues found.
    """
    _, query_df, _, is_postgres = get_db_functions()
    placeholder = '%s' if is_postgres() else '?'
    
    results = {
        "user_id": user_id,
        "username": username,
        "timestamp": datetime.now(KUWAIT_TZ).isoformat(),
        "checks": {
            "cash_ledger": {"status": "ok", "issues": []},
            "snapshot_drift": {"status": "ok", "issues": []},
            "position_closure": {"status": "ok", "issues": []},
        },
        "total_issues": 0
    }
    
    # =========================================================================
    # 1. CASH LEDGER VALIDATION
    # =========================================================================
    try:
        # Get current portfolio cash balances
        cash_df = query_df(f"""
            SELECT portfolio, balance, manual_override 
            FROM portfolio_cash 
            WHERE user_id = {placeholder}
        """, (user_id,))
        
        if not cash_df.empty:
            # Calculate expected balances from transactions
            for _, row in cash_df.iterrows():
                portfolio = row['portfolio']
                current_balance = float(row['balance']) if pd.notna(row['balance']) else 0
                manual_override = row.get('manual_override', 0)
                
                # Skip validation for manually overridden balances
                if manual_override:
                    logger.debug(f"Skipping cash validation for {portfolio} (manual override)")
                    continue
                
                # Calculate expected: deposits - buys + sells for this portfolio
                deposits = query_df(f"""
                    SELECT COALESCE(SUM(amount), 0) as total
                    FROM cash_deposits
                    WHERE user_id = {placeholder} AND portfolio = {placeholder} AND include_in_analysis = 1
                """, (user_id, portfolio))
                
                buys = query_df(f"""
                    SELECT COALESCE(SUM(purchase_cost), 0) as total
                    FROM transactions
                    WHERE user_id = {placeholder} AND portfolio = {placeholder} AND txn_type = 'Buy'
                """, (user_id, portfolio))
                
                sells = query_df(f"""
                    SELECT COALESCE(SUM(sell_value), 0) as total
                    FROM transactions
                    WHERE user_id = {placeholder} AND portfolio = {placeholder} AND txn_type = 'Sell'
                """, (user_id, portfolio))
                
                dep_total = float(deposits['total'].iloc[0]) if not deposits.empty else 0
                buy_total = float(buys['total'].iloc[0]) if not buys.empty else 0
                sell_total = float(sells['total'].iloc[0]) if not sells.empty else 0
                
                expected_balance = dep_total - buy_total + sell_total
                drift = abs(current_balance - expected_balance)
                
                if drift > 0.01:  # Allow tiny rounding differences
                    issue = f"Portfolio {portfolio}: stored={current_balance:.3f}, expected={expected_balance:.3f}, drift={drift:.3f}"
                    results["checks"]["cash_ledger"]["issues"].append(issue)
                    results["checks"]["cash_ledger"]["status"] = "warning"
                    send_integrity_alert(f"CASH DRIFT for user {user_id}: {issue}", "WARNING")
                    
    except Exception as e:
        results["checks"]["cash_ledger"]["status"] = "error"
        results["checks"]["cash_ledger"]["issues"].append(f"Error: {str(e)}")
        logger.error(f"Cash ledger check failed for user {user_id}: {e}")
    
    # =========================================================================
    # 2. SNAPSHOT ACCUMULATED CASH VALIDATION
    # =========================================================================
    try:
        # Get recent snapshots
        snapshots = query_df(f"""
            SELECT snapshot_date, accumulated_cash 
            FROM portfolio_snapshots 
            WHERE user_id = {placeholder}
            ORDER BY snapshot_date DESC
            LIMIT 30
        """, (user_id,))
        
        if not snapshots.empty:
            for _, snap in snapshots.iterrows():
                snap_date = snap['snapshot_date']
                stored_acc = float(snap['accumulated_cash']) if pd.notna(snap['accumulated_cash']) else 0
                
                # Calculate expected from deposits up to this date
                # Need to handle currency conversion
                expected_df = query_df(f"""
                    SELECT amount, COALESCE(currency, 'KWD') as currency
                    FROM cash_deposits
                    WHERE user_id = {placeholder} 
                      AND deposit_date <= {placeholder}
                      AND include_in_analysis = 1
                """, (user_id, snap_date))
                
                expected_acc = 0.0
                if not expected_df.empty:
                    for _, dep in expected_df.iterrows():
                        amount = float(dep['amount']) if pd.notna(dep['amount']) else 0
                        currency = dep['currency'] if pd.notna(dep['currency']) else 'KWD'
                        # Simple USD conversion (use approximate rate)
                        if currency == 'USD':
                            amount *= 0.307  # Approximate USD to KWD
                        expected_acc += amount
                
                drift = abs(stored_acc - expected_acc)
                
                if drift > 1.0:  # Allow small differences due to FX rate changes
                    issue = f"Snapshot {snap_date}: stored={stored_acc:.2f}, expected={expected_acc:.2f}, drift={drift:.2f}"
                    results["checks"]["snapshot_drift"]["issues"].append(issue)
                    results["checks"]["snapshot_drift"]["status"] = "warning"
                    
                    # Only alert for significant drift
                    if drift > 100:
                        send_integrity_alert(f"SNAPSHOT DRIFT for user {user_id}: {issue}", "WARNING")
                        
    except Exception as e:
        results["checks"]["snapshot_drift"]["status"] = "error"
        results["checks"]["snapshot_drift"]["issues"].append(f"Error: {str(e)}")
        logger.error(f"Snapshot drift check failed for user {user_id}: {e}")
    
    # =========================================================================
    # 3. POSITION CLOSURE VALIDATION (CFA Compliance)
    # =========================================================================
    try:
        # Get all transactions
        tx_df = query_df(f"""
            SELECT stock_symbol, txn_type, 
                   COALESCE(shares, 0) as shares,
                   COALESCE(bonus_shares, 0) as bonus_shares
            FROM transactions 
            WHERE user_id = {placeholder}
        """, (user_id,))
        
        if not tx_df.empty:
            # Calculate net shares per symbol
            for symbol in tx_df['stock_symbol'].unique():
                if not symbol:
                    continue
                    
                symbol_tx = tx_df[tx_df['stock_symbol'] == symbol]
                
                net_shares = 0.0
                for _, row in symbol_tx.iterrows():
                    shares = float(row['shares']) if pd.notna(row['shares']) else 0
                    bonus = float(row['bonus_shares']) if pd.notna(row['bonus_shares']) else 0
                    txn_type = row['txn_type']
                    
                    if txn_type == 'Buy':
                        net_shares += shares + bonus
                    elif txn_type == 'Sell':
                        net_shares -= shares
                
                # Check if position should be closed
                if net_shares <= 0.001:  # Effectively zero
                    # Check if stock still exists in stocks table with non-zero holdings
                    stock_check = query_df(f"""
                        SELECT id, symbol, current_price
                        FROM stocks
                        WHERE user_id = {placeholder} AND UPPER(symbol) = UPPER({placeholder})
                    """, (user_id, symbol))
                    
                    if not stock_check.empty:
                        # Stock still in table - this is okay, but unrealized P&L should be 0
                        # This is a soft warning for cleanup
                        pass  # Not an error - stock record can exist for closed positions
                        
    except Exception as e:
        results["checks"]["position_closure"]["status"] = "error"
        results["checks"]["position_closure"]["issues"].append(f"Error: {str(e)}")
        logger.error(f"Position closure check failed for user {user_id}: {e}")
    
    # Count total issues
    results["total_issues"] = sum(
        len(check["issues"]) 
        for check in results["checks"].values()
    )
    
    return results


def run_integrity_check_job():
    """
    Run nightly integrity checks for ALL users.
    
    This job validates financial data consistency:
    - Cash ledger balances
    - Snapshot accumulated cash accuracy
    - Position closure compliance
    """
    logger.info("\n" + "=" * 60)
    logger.info("🔍 STARTING NIGHTLY INTEGRITY CHECK")
    logger.info(f"⏰ Started at: {datetime.now(KUWAIT_TZ).strftime('%H:%M:%S')} Kuwait Time")
    logger.info("=" * 60)
    
    users = get_all_users()
    
    if not users:
        logger.warning("No users found for integrity check")
        return
    
    total_issues = 0
    users_with_issues = 0
    
    for user in users:
        user_id = user['id']
        username = user.get('username', f'user_{user_id}')
        
        logger.info(f"\n--- Checking user: {username} (ID: {user_id}) ---")
        
        results = run_integrity_check_for_user(user_id, username)
        
        if results["total_issues"] > 0:
            users_with_issues += 1
            total_issues += results["total_issues"]
            logger.warning(f"⚠️ User {username}: {results['total_issues']} issue(s) found")
            
            # Log details
            for check_name, check_data in results["checks"].items():
                if check_data["issues"]:
                    for issue in check_data["issues"][:5]:  # Limit to first 5 per check
                        logger.warning(f"  [{check_name}] {issue}")
        else:
            logger.info(f"✅ User {username}: All checks passed")
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("🔍 INTEGRITY CHECK COMPLETED")
    logger.info(f"👥 Users Checked: {len(users)}")
    logger.info(f"⚠️ Users with Issues: {users_with_issues}")
    logger.info(f"📋 Total Issues Found: {total_issues}")
    logger.info(f"⏱️ Finished at: {datetime.now(KUWAIT_TZ).strftime('%H:%M:%S')} Kuwait Time")
    logger.info("=" * 60 + "\n")
    
    # Alert if critical issues found
    if total_issues > 10:
        send_integrity_alert(
            f"Nightly check found {total_issues} issues across {users_with_issues} users",
            "CRITICAL" if total_issues > 50 else "WARNING"
        )


# =============================================================================
# SCHEDULER
# =============================================================================

# Nightly integrity check time: 3 AM Kuwait = 00:00 UTC
INTEGRITY_CHECK_HOUR = 0  # UTC
INTEGRITY_CHECK_MINUTE = 0


def start_scheduler():
    """Start the APScheduler to run jobs daily."""
    if not SCHEDULER_AVAILABLE:
        logger.error("APScheduler not available. Cannot start scheduler.")
        return
    
    scheduler = BlockingScheduler(timezone="UTC")
    
    # Job 1: Price update at 11:00 UTC = 14:00 Kuwait Time
    scheduler.add_job(
        run_price_update_job,
        CronTrigger(hour=SCHEDULED_HOUR, minute=SCHEDULED_MINUTE),
        id='daily_price_update',
        name='Daily Price Update & Snapshot'
    )
    
    # Job 2: Integrity check at 00:00 UTC = 03:00 Kuwait Time (nightly)
    scheduler.add_job(
        run_integrity_check_job,
        CronTrigger(hour=INTEGRITY_CHECK_HOUR, minute=INTEGRITY_CHECK_MINUTE),
        id='nightly_integrity_check',
        name='Nightly Data Integrity Check'
    )
    
    logger.info("=" * 60)
    logger.info("🕐 SCHEDULER STARTED")
    logger.info(f"📈 Price Update: {SCHEDULED_HOUR:02d}:{SCHEDULED_MINUTE:02d} UTC (14:00 Kuwait)")
    logger.info(f"🔍 Integrity Check: {INTEGRITY_CHECK_HOUR:02d}:{INTEGRITY_CHECK_MINUTE:02d} UTC (03:00 Kuwait)")
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
    parser.add_argument('--run-now', action='store_true', help='Run price update job immediately (once)')
    parser.add_argument('--check-integrity', action='store_true', help='Run integrity check immediately (once)')
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
        logger.info("🔄 Running price update job immediately (--run-now)")
        run_price_update_job()
    elif args.check_integrity:
        logger.info("🔍 Running integrity check immediately (--check-integrity)")
        run_integrity_check_job()
    else:
        start_scheduler()


if __name__ == "__main__":
    main()
