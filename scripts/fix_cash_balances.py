#!/usr/bin/env python3
"""
Fix Cash Balances Migration Script
===================================
One-time migration script to recalculate cash balances for ALL users.

This script:
1. Connects to the database (PostgreSQL or SQLite)
2. Gets all users from the database
3. Runs recalc_portfolio_cash() for each user

Usage:
    python scripts/fix_cash_balances.py

Author: Portfolio App
Date: 2026-01-30
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def main():
    """Main migration function."""
    logger.info("=" * 60)
    logger.info("CASH BALANCE MIGRATION - Starting...")
    logger.info("=" * 60)
    
    try:
        # Import database functions
        from db_layer import get_conn, query_df, is_postgres
        
        db_type = "PostgreSQL" if is_postgres() else "SQLite"
        logger.info(f"Database: {db_type}")
        
        # Get all users
        users_df = query_df("SELECT id, username FROM users WHERE id > 0")
        
        if users_df.empty:
            logger.warning("No users found in database!")
            return
        
        logger.info(f"Found {len(users_df)} users to process")
        
        # Import the recalc function from ui.py
        # We need to do this carefully to avoid Streamlit initialization
        try:
            # Direct implementation to avoid Streamlit dependencies
            conn = get_conn()
            
            for _, user in users_df.iterrows():
                user_id = user['id']
                username = user.get('username', f'User_{user_id}')
                
                logger.info(f"\nProcessing user: {username} (ID: {user_id})")
                
                try:
                    recalc_portfolio_cash_standalone(conn, user_id)
                    logger.info(f"  ✅ Cash ledger recalculated for {username}")
                except Exception as e:
                    logger.error(f"  ❌ Error for user {username}: {e}")
            
            conn.close()
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise
        
        logger.info("\n" + "=" * 60)
        logger.info("✅ MIGRATION COMPLETE")
        logger.info("=" * 60)
        
    except ImportError as e:
        logger.error(f"Failed to import required modules: {e}")
        logger.error("Make sure you're running from the project root directory")
        sys.exit(1)


def recalc_portfolio_cash_standalone(conn, user_id: int):
    """
    Standalone version of recalc_portfolio_cash that doesn't depend on Streamlit.
    
    Recalculates the absolute cash balance for ALL portfolios of a user.
    """
    import time
    from db_layer import is_postgres
    
    cur = conn.cursor()
    
    # Determine placeholder style
    ph = '%s' if is_postgres() else '?'
    
    # Step A: Reset ALL portfolio balances to 0 for this user
    cur.execute(
        f"UPDATE portfolio_cash SET balance = 0, last_updated = {ph} WHERE user_id = {ph}",
        (int(time.time()), user_id)
    )
    
    # Step B: Aggregation Query using UNION ALL
    # NOTE: We JOIN transactions with stocks to get the portfolio, because
    # older transactions may not have the portfolio column populated
    aggregation_sql = f"""
        SELECT portfolio, SUM(net_change) as total_change
        FROM (
            -- 1. Deposits & Withdrawals (amount can be + or -)
            SELECT portfolio, COALESCE(amount, 0) as net_change
            FROM cash_deposits
            WHERE user_id = {ph} AND include_in_analysis = 1

            UNION ALL

            -- 2. Buys (Outflow - negative) - JOIN with stocks to get portfolio
            SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, -1 * COALESCE(t.purchase_cost, 0) as net_change
            FROM transactions t
            LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
            WHERE t.user_id = {ph} AND t.txn_type = 'Buy' AND COALESCE(t.category, 'portfolio') = 'portfolio'

            UNION ALL

            -- 3. Sells (Inflow - positive) - JOIN with stocks to get portfolio
            SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, COALESCE(t.sell_value, 0) as net_change
            FROM transactions t
            LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
            WHERE t.user_id = {ph} AND t.txn_type = 'Sell' AND COALESCE(t.category, 'portfolio') = 'portfolio'

            UNION ALL

            -- 4. Dividends (Inflow - positive) - JOIN with stocks to get portfolio
            SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, COALESCE(t.cash_dividend, 0) as net_change
            FROM transactions t
            LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
            WHERE t.user_id = {ph} AND COALESCE(t.cash_dividend, 0) > 0 AND COALESCE(t.category, 'portfolio') = 'portfolio'

            UNION ALL

            -- 5. Fees (Outflow - negative, applies to all transaction types) - JOIN with stocks to get portfolio
            SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, -1 * COALESCE(t.fees, 0) as net_change
            FROM transactions t
            LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
            WHERE t.user_id = {ph} AND COALESCE(t.fees, 0) > 0 AND COALESCE(t.category, 'portfolio') = 'portfolio'
        ) subquery
        GROUP BY portfolio
    """
    
    cur.execute(aggregation_sql, (user_id, user_id, user_id, user_id, user_id))
    results = cur.fetchall()
    
    # Step C: Upsert balances for each portfolio
    updated_count = 0
    for row in results:
        portfolio = row[0]
        total_balance = float(row[1]) if row[1] else 0.0
        
        if portfolio is None:
            continue  # Skip null portfolios
        
        # Check if record exists
        cur.execute(
            f"SELECT 1 FROM portfolio_cash WHERE user_id = {ph} AND portfolio = {ph}",
            (user_id, portfolio)
        )
        exists = cur.fetchone()
        
        if exists:
            cur.execute(
                f"UPDATE portfolio_cash SET balance = {ph}, last_updated = {ph} WHERE user_id = {ph} AND portfolio = {ph}",
                (total_balance, int(time.time()), user_id, portfolio)
            )
        else:
            cur.execute(
                f"INSERT INTO portfolio_cash (user_id, portfolio, balance, currency, last_updated) VALUES ({ph}, {ph}, {ph}, 'KWD', {ph})",
                (user_id, portfolio, total_balance, int(time.time()))
            )
        
        updated_count += 1
        logger.info(f"    Portfolio '{portfolio}': {total_balance:,.3f} KWD")
    
    conn.commit()
    logger.info(f"  Updated {updated_count} portfolios")


if __name__ == "__main__":
    main()
