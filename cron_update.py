#!/usr/bin/env python3
"""
Standalone cron script for daily price updates and snapshots.

This script can be run via:
1. DigitalOcean App Platform "Jobs" component
2. GitHub Actions scheduled workflow
3. External cron service that can run scripts
4. Windows Task Scheduler locally

Usage:
    python cron_update.py                    # Run full update (prices + snapshots)
    python cron_update.py --prices-only      # Only update prices
    python cron_update.py --snapshots-only   # Only save snapshots

Environment:
    DATABASE_URL - PostgreSQL connection string (for production)
    CRON_SECRET_KEY - Not required for direct script execution
"""

import os
import sys
import argparse
import logging
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout,
)
logger = logging.getLogger("CronUpdate")


def run_prices_only():
    """Fetch and save prices for all users (no snapshot)."""
    from auto_price_scheduler import (
        get_all_users, get_user_stocks, fetch_price, fetch_usd_kwd_rate,
        normalize_kwd_price, update_stock_price, ensure_schema, KUWAIT_TZ,
    )
    ensure_schema()
    usd_kwd_rate = fetch_usd_kwd_rate()
    logger.info(f"💱 USD/KWD Rate: {usd_kwd_rate:.4f}")

    users = get_all_users()
    if not users:
        logger.warning("No users found")
        return 0

    total = 0
    for user in users:
        uid = user['id']
        stocks = get_user_stocks(uid)
        for stock in stocks:
            price, ticker = fetch_price(stock['symbol'], currency=stock.get('currency', 'KWD'))
            if price is not None:
                ccy = stock.get('currency', 'KWD') or 'KWD'
                if ccy == 'KWD':
                    price = normalize_kwd_price(price, ccy)
                if update_stock_price(stock['id'], price, uid):
                    total += 1
                    logger.info(f"  ✅ {stock['symbol']}: {price:.4f} {ccy} ({ticker})")
            else:
                logger.warning(f"  ❌ {stock['symbol']}: Could not fetch price")
    logger.info(f"📈 Total prices updated: {total}")
    return total


def run_snapshots_only():
    """Save portfolio snapshots using current DB prices (no fetch)."""
    from auto_price_scheduler import (
        get_all_users, get_user_stocks, fetch_usd_kwd_rate,
        save_portfolio_snapshot, ensure_schema,
    )
    ensure_schema()
    usd_kwd_rate = fetch_usd_kwd_rate()
    logger.info(f"💱 USD/KWD Rate: {usd_kwd_rate:.4f}")

    users = get_all_users()
    if not users:
        logger.warning("No users found")
        return 0

    saved = 0
    for user in users:
        uid = user['id']
        stocks = get_user_stocks(uid)
        portfolio_value = 0.0
        for stock in stocks:
            ccy = stock.get('currency', 'KWD') or 'KWD'
            price = float(stock.get('current_price', 0) or 0)
            shares = float(stock.get('shares', 0) or 0)
            if price > 0 and shares > 0:
                if ccy == 'USD':
                    portfolio_value += price * shares * usd_kwd_rate
                else:
                    portfolio_value += price * shares
        if portfolio_value > 0:
            if save_portfolio_snapshot(uid, portfolio_value, usd_kwd_rate):
                saved += 1
                logger.info(f"  📊 Snapshot saved for user {user.get('username', uid)}: {portfolio_value:,.3f} KWD")
    logger.info(f"📊 Total snapshots saved: {saved}")
    return saved


def main():
    parser = argparse.ArgumentParser(description='Portfolio daily update cron job')
    parser.add_argument('--prices-only', action='store_true', help='Only update prices')
    parser.add_argument('--snapshots-only', action='store_true', help='Only save snapshots')
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("🚀 CRON JOB STARTED")
    logger.info(f"📅 Time: {datetime.now().isoformat()}")
    logger.info("=" * 60)
    
    try:
        if args.prices_only:
            logger.info("Mode: prices-only")
            run_prices_only()
        elif args.snapshots_only:
            logger.info("Mode: snapshots-only")
            run_snapshots_only()
        else:
            logger.info("Mode: full update (prices + snapshots)")
            from auto_price_scheduler import run_price_update_job
            run_price_update_job()
        
        logger.info(f"✅ CRON JOB COMPLETED SUCCESSFULLY")
        logger.info(f"📅 Finished: {datetime.now().isoformat()}")
        return 0
        
    except Exception as e:
        logger.error(f"❌ CRON JOB FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
