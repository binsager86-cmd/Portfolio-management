#!/usr/bin/env python3
"""
daily_snapshot.py - Standalone Daily Portfolio Snapshot Script

This script runs OUTSIDE of Streamlit to capture daily portfolio snapshots.
It can be scheduled via cron (Linux) or Task Scheduler (Windows).

Usage:
    python daily_snapshot.py                    # Snapshot all users
    python daily_snapshot.py --user-id 1        # Snapshot specific user
    python daily_snapshot.py --dry-run          # Preview without saving

Cron Examples (Kuwait Time = UTC+3):
    # 2 PM Kuwait Time (11:00 UTC)
    0 11 * * * /usr/bin/python3 /path/to/daily_snapshot.py >> /var/log/snapshot.log 2>&1
    
    # 3 PM Kuwait Time (12:00 UTC) 
    0 12 * * * /usr/bin/python3 /path/to/daily_snapshot.py >> /var/log/snapshot.log 2>&1
"""

from __future__ import annotations

import os
import sys
import argparse
import datetime
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

# Add project root to path so imports work when run standalone
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Import database layer
try:
    from db_layer import get_conn, query_df
except ImportError:
    logger.error("Could not import db_layer. Make sure db_layer.py exists in project root.")
    sys.exit(1)

# Import required functions from ui.py
# These are imported carefully to avoid Streamlit initialization
UI_IMPORTS_AVAILABLE = False

try:
    import pandas as pd
    
    # We need to mock streamlit before importing ui functions
    # This prevents Streamlit from initializing when we just need the helper functions
    class MockSessionState(dict):
        def get(self, key, default=None):
            return super().get(key, default)
        def __getattr__(self, name):
            return self.get(name, None)
        def __setattr__(self, name, value):
            self[name] = value
    
    class MockQueryParams(dict):
        def get(self, key, default=None):
            return super().get(key, default)
    
    # Initialize with required session state values
    _mock_session_state = MockSessionState({
        'user_id': None, 
        'theme': 'light',
        'usd_to_kwd': 0.307190,  # Default USD→KWD rate
        'privacy_mode': False,
    })
    
    class MockStreamlit:
        session_state = _mock_session_state  # Use pre-initialized session state
        query_params = MockQueryParams()
        
        @staticmethod
        def set_page_config(*args, **kwargs): pass
        
        @staticmethod
        def cache_data(*args, **kwargs):
            def decorator(func):
                return func
            return decorator
        
        @staticmethod
        def cache_resource(*args, **kwargs):
            def decorator(func):
                return func
            return decorator
        
        # UI Methods
        @staticmethod
        def error(*args, **kwargs): pass
        @staticmethod
        def warning(*args, **kwargs): pass
        @staticmethod
        def info(*args, **kwargs): pass
        @staticmethod
        def success(*args, **kwargs): pass
        @staticmethod
        def write(*args, **kwargs): pass
        @staticmethod
        def markdown(*args, **kwargs): pass
        @staticmethod
        def columns(*args, **kwargs): 
            # Return list of mock column contexts
            n = args[0] if args else kwargs.get('spec', 1)
            if isinstance(n, int):
                return [type('MockCol', (), {'__enter__': lambda s: s, '__exit__': lambda s,*a: None})() for _ in range(n)]
            return [type('MockCol', (), {'__enter__': lambda s: s, '__exit__': lambda s,*a: None})() for _ in range(len(n))]
        @staticmethod
        def header(*args, **kwargs): pass
        @staticmethod
        def subheader(*args, **kwargs): pass
        @staticmethod  
        def divider(*args, **kwargs): pass
        @staticmethod
        def rerun(*args, **kwargs): pass
        @staticmethod
        def stop(*args, **kwargs): pass
        @staticmethod
        def caption(*args, **kwargs): pass
        @staticmethod
        def metric(*args, **kwargs): pass
        @staticmethod
        def title(*args, **kwargs): pass
        @staticmethod
        def sidebar(*args, **kwargs): 
            return type('MockSidebar', (), {
                '__enter__': lambda s: s, '__exit__': lambda s,*a: None,
                'markdown': lambda *a, **k: None,
                'selectbox': lambda *a, **k: None,
                'button': lambda *a, **k: False,
                'radio': lambda *a, **k: None,
                'write': lambda *a, **k: None,
                'header': lambda *a, **k: None,
                'subheader': lambda *a, **k: None,
                'image': lambda *a, **k: None,
                'divider': lambda *a, **k: None,
                'caption': lambda *a, **k: None,
            })()
        @staticmethod
        def expander(*args, **kwargs): 
            class FakeExpander:
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def write(self, *a, **k): pass
                def markdown(self, *a, **k): pass
            return FakeExpander()
        @staticmethod
        def spinner(*args, **kwargs):
            class FakeSpinner:
                def __enter__(self): return self
                def __exit__(self, *args): pass
            return FakeSpinner()
        @staticmethod
        def button(*args, **kwargs): return False
        @staticmethod
        def text_input(*args, **kwargs): return ""
        @staticmethod
        def selectbox(*args, **kwargs): return None
        @staticmethod
        def radio(*args, **kwargs): return None
        @staticmethod
        def text_area(*args, **kwargs): return ""
        @staticmethod
        def number_input(*args, **kwargs): return 0
        @staticmethod
        def date_input(*args, **kwargs): return None
        @staticmethod
        def checkbox(*args, **kwargs): return False
        @staticmethod
        def slider(*args, **kwargs): return 0
        @staticmethod
        def form(*args, **kwargs):
            class FakeForm:
                def __enter__(self): return self
                def __exit__(self, *args): pass
            return FakeForm()
        @staticmethod
        def form_submit_button(*args, **kwargs): return False
        @staticmethod
        def file_uploader(*args, **kwargs): return None
        @staticmethod
        def download_button(*args, **kwargs): return False
        @staticmethod
        def tabs(*args, **kwargs): return [type('MockTab', (), {'__enter__': lambda s: s, '__exit__': lambda s,*a: None})() for _ in range(len(args[0]) if args else 1)]
        @staticmethod
        def dataframe(*args, **kwargs): pass
        @staticmethod
        def table(*args, **kwargs): pass
        @staticmethod
        def plotly_chart(*args, **kwargs): pass
        @staticmethod
        def image(*args, **kwargs): pass
        @staticmethod
        def toast(*args, **kwargs): pass
        @staticmethod
        def html(*args, **kwargs): pass
        @staticmethod
        def container(*args, **kwargs):
            class FakeContainer:
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def markdown(self, *a, **k): pass
                def write(self, *a, **k): pass
            return FakeContainer()
        @staticmethod
        def empty(*args, **kwargs):
            class FakeEmpty:
                def write(self, *a, **k): pass
                def markdown(self, *a, **k): pass
            return FakeEmpty()
        @staticmethod
        def progress(*args, **kwargs):
            class FakeProgress:
                def progress(self, *a, **k): pass
            return FakeProgress()
        @staticmethod
        def status(*args, **kwargs):
            class FakeStatus:
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def update(self, *a, **k): pass
            return FakeStatus()
        @staticmethod
        def data_editor(*args, **kwargs): return args[0] if args else pd.DataFrame()
        @staticmethod
        def multiselect(*args, **kwargs): return []
        @staticmethod
        def toggle(*args, **kwargs): return False
        @staticmethod
        def color_picker(*args, **kwargs): return "#000000"
        @staticmethod
        def popover(*args, **kwargs):
            class FakePopover:
                def __enter__(self): return self
                def __exit__(self, *args): pass
            return FakePopover()
        @staticmethod
        def dialog(*args, **kwargs):
            def decorator(func):
                return func
            return decorator
        @staticmethod
        def secrets(*args, **kwargs): return {}
        @staticmethod
        def experimental_rerun(*args, **kwargs): pass
        @staticmethod
        def experimental_fragment(*args, **kwargs):
            def decorator(func):
                return func
            return decorator
        @staticmethod
        def fragment(*args, **kwargs):
            def decorator(func):
                return func
            return decorator
        
    # Inject mock before importing ui
    sys.modules['streamlit'] = MockStreamlit()
    
    from ui import (
        build_portfolio_table,
        convert_to_kwd,
        calculate_total_cash_dividends,
        calculate_trading_realized_profit,
        safe_float,
        PORTFOLIO_CCY
    )
    UI_IMPORTS_AVAILABLE = True
    logger.info("Successfully imported UI functions.")
    
except ImportError as e:
    logger.warning(f"Could not import from ui.py: {e}")
    logger.warning("Running in standalone mode with limited functionality.")
    
    # Define fallback values
    PORTFOLIO_CCY = {'KFH': 'KWD', 'BBYN': 'KWD', 'USA': 'USD'}
    
    def safe_float(val, default=0.0):
        try:
            return float(val) if val is not None else default
        except (ValueError, TypeError):
            return default
    
    def convert_to_kwd(amount, currency):
        """Fallback currency conversion."""
        amount = safe_float(amount, 0.0)
        if currency == 'KWD':
            return amount
        # Use approximate rates if not available
        rates = {'USD': 0.31, 'EUR': 0.28, 'GBP': 0.24}
        return amount * rates.get(currency, 0.31)


def get_all_user_ids() -> List[int]:
    """Fetch all user IDs from the database."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE id > 0")
    user_ids = [row[0] for row in cur.fetchall()]
    conn.close()
    return user_ids


def calculate_portfolio_value(user_id: int) -> Dict[str, Any]:
    """
    Calculate the total portfolio value for a user.
    
    Returns:
        Dict with portfolio_value, stock_value, cash_value, num_stocks
    """
    total_stock_value = 0.0
    total_cash_value = 0.0
    num_stocks = 0
    
    if UI_IMPORTS_AVAILABLE:
        # Use the full UI logic with user_id parameter
        for port_name in PORTFOLIO_CCY.keys():
            try:
                df_port = build_portfolio_table(port_name, user_id=user_id)
                if df_port is not None and not df_port.empty:
                    # Count active holdings
                    if 'Shares Qty' in df_port.columns:
                        active = df_port[df_port['Shares Qty'] > 0.001]
                        num_stocks += len(active)
                        
                        for _, row in active.iterrows():
                            mv = safe_float(row.get('Market Value', 0), 0)
                            ccy = row.get('Currency', 'KWD')
                            total_stock_value += convert_to_kwd(mv, ccy)
            except Exception as e:
                logger.warning(f"Error building portfolio {port_name} for user {user_id}: {e}")
    else:
        # Fallback: Direct DB query
        logger.info("Using fallback DB query for portfolio value")
        stocks_df = query_df("""
            SELECT 
                s.symbol,
                s.current_price,
                s.currency,
                COALESCE(SUM(CASE WHEN t.txn_type='Buy' THEN t.shares ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.txn_type='Sell' THEN t.shares ELSE 0 END), 0) +
                COALESCE(SUM(t.bonus_shares), 0) as total_shares
            FROM stocks s
            LEFT JOIN transactions t ON s.symbol = t.stock_symbol AND t.user_id = s.user_id
            WHERE s.user_id = ?
            GROUP BY s.symbol
            HAVING total_shares > 0.001
        """, (user_id,))
        
        if not stocks_df.empty:
            num_stocks = len(stocks_df)
            for _, row in stocks_df.iterrows():
                price = safe_float(row.get('current_price', 0), 0)
                shares = safe_float(row.get('total_shares', 0), 0)
                ccy = row.get('currency', 'KWD')
                mv = price * shares
                total_stock_value += convert_to_kwd(mv, ccy)
    
    # Add manual cash balances
    try:
        cash_recs = query_df(
            "SELECT balance, currency FROM portfolio_cash WHERE user_id = ?",
            (user_id,)
        )
        if not cash_recs.empty:
            for _, cr in cash_recs.iterrows():
                bal = safe_float(cr.get('balance', 0), 0)
                ccy = cr.get('currency', 'KWD')
                total_cash_value += convert_to_kwd(bal, ccy)
    except Exception as e:
        logger.warning(f"Could not fetch cash balances: {e}")
    
    total_value = total_stock_value + total_cash_value
    
    return {
        'portfolio_value': total_value,
        'stock_value': total_stock_value,
        'cash_value': total_cash_value,
        'num_stocks': num_stocks
    }


def get_accumulated_cash(user_id: int, include_all: bool = False) -> float:
    """Get total cash deposits for a user (in KWD).
    
    Args:
        user_id: The user ID
        include_all: If True, include all deposits. 
                     If False (default), only include deposits with include_in_analysis=1
    
    Returns:
        Total deposits in KWD
    """
    try:
        if include_all:
            # All deposits regardless of flag
            deposits = query_df(
                "SELECT amount, currency FROM cash_deposits WHERE user_id = ?",
                (user_id,)
            )
        else:
            # Only deposits marked for analysis
            deposits = query_df(
                "SELECT amount, currency FROM cash_deposits WHERE user_id = ? AND include_in_analysis = 1",
                (user_id,)
            )
        
        if deposits.empty:
            return 0.0
        
        total = 0.0
        for _, row in deposits.iterrows():
            amt = safe_float(row.get('amount', 0), 0)
            ccy = row.get('currency', 'KWD')
            total += convert_to_kwd(amt, ccy)
        return total
    except Exception as e:
        logger.warning(f"Could not fetch deposits for user {user_id}: {e}")
        return 0.0


def get_total_cash_deposits(user_id: int) -> float:
    """Get the actual total cash deposits for a user (in KWD).
    
    This fetches ALL deposits from the cash_deposits table (regardless of include_in_analysis flag)
    and is used for ROI calculation: ROI = net_gain / total_cash_deposits
    
    Args:
        user_id: The user ID
    
    Returns:
        Total deposits in KWD
    """
    try:
        deposits = query_df(
            "SELECT amount, currency FROM cash_deposits WHERE user_id = ?",
            (user_id,)
        )
        
        if deposits.empty:
            return 0.0
        
        total = 0.0
        for _, row in deposits.iterrows():
            amt = safe_float(row.get('amount', 0), 0)
            ccy = row.get('currency', 'KWD')
            total += convert_to_kwd(amt, ccy)
        return total
    except Exception as e:
        logger.warning(f"Could not fetch total deposits for user {user_id}: {e}")
        return 0.0


def get_first_snapshot_value(user_id: int) -> Optional[float]:
    """Get the first (baseline) portfolio value for calculating beginning_difference.
    
    This is used to calculate: beginning_difference = current_portfolio_value - first_snapshot_value
    Which matches the UI formula: net_gain = beginning_difference - accumulated_cash
    
    Args:
        user_id: The user ID
    
    Returns:
        First snapshot portfolio value, or None if no snapshots exist
    """
    try:
        first = query_df(
            """SELECT portfolio_value FROM portfolio_snapshots 
               WHERE user_id = ? 
               ORDER BY snapshot_date ASC LIMIT 1""",
            (user_id,)
        )
        if not first.empty:
            val = first['portfolio_value'].iloc[0]
            if val is not None and not (isinstance(val, float) and val != val):  # Check for NaN
                return float(val)
        return None
    except Exception as e:
        logger.warning(f"Could not fetch first snapshot for user {user_id}: {e}")
        return None


def get_previous_accumulated_cash(user_id: int, before_date: datetime.date) -> Optional[float]:
    """Get accumulated_cash from the most recent snapshot before the given date.
    
    This implements the 'carry forward' pattern used by the UI - 
    accumulated_cash only changes when deposits are added/removed.
    
    Args:
        user_id: The user ID
        before_date: Get snapshot before this date
    
    Returns:
        Previous accumulated_cash value, or None if no previous snapshot
    """
    try:
        prev = query_df(
            """SELECT accumulated_cash FROM portfolio_snapshots 
               WHERE user_id = ? AND snapshot_date < ? 
               ORDER BY snapshot_date DESC LIMIT 1""",
            (user_id, before_date.isoformat())
        )
        if not prev.empty:
            val = prev['accumulated_cash'].iloc[0]
            if val is not None and not (isinstance(val, float) and val != val):  # Check for NaN
                return float(val)
        return None
    except Exception as e:
        logger.warning(f"Could not fetch previous accumulated_cash for user {user_id}: {e}")
        return None


def save_snapshot(
    user_id: int,
    snapshot_date: datetime.date,
    portfolio_value: float,
    accumulated_cash: float,
    beginning_difference: float,
    total_cash_deposits: float,
    dry_run: bool = False
) -> bool:
    """
    Save a portfolio snapshot to the database.
    Uses UPSERT to handle existing records.
    
    The correct formulas (matching UI):
        beginning_difference = portfolio_value - first_snapshot_value
        net_gain = beginning_difference - accumulated_cash
        roi_percent = net_gain / total_cash_deposits * 100
    
    Note: ROI uses total_cash_deposits (from cash_deposits table), 
          not accumulated_cash (which is carried forward in snapshots)
    """
    import time
    
    # Correct formula matching UI (line 7356 of ui.py):
    # net_gain = beginning_diff - accumulated_cash
    net_gain = beginning_difference - accumulated_cash
    
    # ROI = net_gain / total_cash_deposits (from cash_deposits table, not accumulated_cash)
    roi_percent = (net_gain / total_cash_deposits * 100) if total_cash_deposits > 0 else 0.0
    created_at = int(time.time())  # Unix timestamp
    
    if dry_run:
        logger.info(f"  [DRY RUN] Would save: value={portfolio_value:.2f}, "
                   f"begin_diff={beginning_difference:.2f}, "
                   f"cash={accumulated_cash:.2f}, gain={net_gain:.2f}, roi={roi_percent:.2f}%")
        return True
        return True
    
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Check if table has all required columns
        cur.execute("PRAGMA table_info(portfolio_snapshots)")
        columns = [row[1] for row in cur.fetchall()]
        
        if 'accumulated_cash' in columns and 'net_gain' in columns and 'roi_percent' in columns:
            # Full insert with all columns including created_at and beginning_difference
            if 'beginning_difference' in columns:
                cur.execute("""
                    INSERT INTO portfolio_snapshots 
                        (user_id, snapshot_date, portfolio_value, beginning_difference, accumulated_cash, net_gain, roi_percent, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, snapshot_date) 
                    DO UPDATE SET 
                        portfolio_value = excluded.portfolio_value,
                        beginning_difference = excluded.beginning_difference,
                        accumulated_cash = excluded.accumulated_cash,
                        net_gain = excluded.net_gain,
                        roi_percent = excluded.roi_percent
                """, (user_id, snapshot_date.isoformat(), portfolio_value, beginning_difference, accumulated_cash, net_gain, roi_percent, created_at))
            else:
                cur.execute("""
                    INSERT INTO portfolio_snapshots 
                        (user_id, snapshot_date, portfolio_value, accumulated_cash, net_gain, roi_percent, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, snapshot_date) 
                    DO UPDATE SET 
                        portfolio_value = excluded.portfolio_value,
                        accumulated_cash = excluded.accumulated_cash,
                        net_gain = excluded.net_gain,
                        roi_percent = excluded.roi_percent
                """, (user_id, snapshot_date.isoformat(), portfolio_value, accumulated_cash, net_gain, roi_percent, created_at))
        else:
            # Basic insert (older schema)
            cur.execute("""
                INSERT INTO portfolio_snapshots (user_id, snapshot_date, portfolio_value, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, snapshot_date) 
                DO UPDATE SET portfolio_value = excluded.portfolio_value
            """, (user_id, snapshot_date.isoformat(), portfolio_value, created_at))
        
        conn.commit()
        conn.close()
        return True
        
    except Exception as e:
        logger.error(f"Failed to save snapshot for user {user_id}: {e}")
        return False


def take_daily_snapshot(
    user_ids: Optional[List[int]] = None,
    dry_run: bool = False,
    snapshot_date: Optional[datetime.date] = None
) -> Dict[str, Any]:
    """
    Take daily portfolio snapshots for specified users.
    
    Args:
        user_ids: List of user IDs to process. If None, processes all users.
        dry_run: If True, calculate but don't save to database.
        snapshot_date: Date for the snapshot. Defaults to today.
    
    Returns:
        Summary dict with success/failure counts and details.
    """
    start_time = datetime.datetime.now()
    logger.info(f"Starting daily portfolio snapshot...")
    
    if snapshot_date is None:
        snapshot_date = datetime.date.today()
    
    logger.info(f"Snapshot date: {snapshot_date.isoformat()}")
    
    # Get user IDs
    if user_ids is None:
        user_ids = get_all_user_ids()
    
    if not user_ids:
        logger.warning("No users found to process.")
        return {'success': 0, 'failed': 0, 'users': []}
    
    logger.info(f"Processing {len(user_ids)} user(s)...")
    
    results = {
        'success': 0,
        'failed': 0,
        'users': [],
        'snapshot_date': snapshot_date.isoformat(),
        'dry_run': dry_run
    }
    
    for user_id in user_ids:
        try:
            logger.info(f"  → Processing user {user_id}")
            
            # Calculate portfolio value
            pv_data = calculate_portfolio_value(user_id)
            portfolio_value = pv_data['portfolio_value']
            
            # Get accumulated cash - carry forward from previous snapshot
            # This matches the UI behavior: accumulated_cash only changes when deposits are added/removed
            accumulated_cash = get_previous_accumulated_cash(user_id, snapshot_date)
            
            if accumulated_cash is None:
                # No previous snapshot - calculate from deposits (initial snapshot)
                accumulated_cash = get_accumulated_cash(user_id, include_all=True)
                logger.debug(f"  No previous snapshot, calculated from deposits: {accumulated_cash:.2f}")
            else:
                logger.debug(f"  Carried forward from previous snapshot: {accumulated_cash:.2f}")
            
            # Calculate beginning_difference using correct UI formula:
            # beginning_difference = current_portfolio_value - first_snapshot_value (baseline)
            first_snapshot_value = get_first_snapshot_value(user_id)
            if first_snapshot_value is not None:
                beginning_difference = portfolio_value - first_snapshot_value
                logger.debug(f"  beginning_difference = {portfolio_value:.2f} - {first_snapshot_value:.2f} = {beginning_difference:.2f}")
            else:
                # First snapshot for this user - beginning_difference is 0
                beginning_difference = 0.0
                logger.debug(f"  First snapshot for user, beginning_difference = 0.0")
            
            # Get total cash deposits for ROI calculation (from cash_deposits table)
            total_cash_deposits = get_total_cash_deposits(user_id)
            logger.debug(f"  total_cash_deposits (for ROI): {total_cash_deposits:.2f}")
            
            # Save snapshot with correct formulas:
            #   net_gain = beginning_difference - accumulated_cash
            #   roi_percent = net_gain / total_cash_deposits * 100
            success = save_snapshot(
                user_id=user_id,
                snapshot_date=snapshot_date,
                portfolio_value=portfolio_value,
                accumulated_cash=accumulated_cash,
                beginning_difference=beginning_difference,
                total_cash_deposits=total_cash_deposits,
                dry_run=dry_run
            )
            
            if success:
                # Use correct formula for logging too
                net_gain = beginning_difference - accumulated_cash
                roi_percent = (net_gain / total_cash_deposits * 100) if total_cash_deposits > 0 else 0.0
                logger.info(f"  ✅ User {user_id}: {portfolio_value:.2f} KWD "
                           f"({pv_data['num_stocks']} stocks, {pv_data['cash_value']:.2f} cash) "
                           f"| Net: {net_gain:+.2f} | ROI: {roi_percent:.2f}%")
                results['success'] += 1
            else:
                logger.error(f"  ❌ User {user_id}: Failed to save snapshot")
                results['failed'] += 1
            
            results['users'].append({
                'user_id': user_id,
                'success': success,
                'portfolio_value': portfolio_value,
                'accumulated_cash': accumulated_cash,
                'num_stocks': pv_data['num_stocks']
            })
            
        except Exception as e:
            logger.error(f"  ❌ Error for user {user_id}: {e}")
            results['failed'] += 1
            results['users'].append({
                'user_id': user_id,
                'success': False,
                'error': str(e)
            })
    
    elapsed = (datetime.datetime.now() - start_time).total_seconds()
    logger.info(f"✅ Daily snapshot completed in {elapsed:.2f}s. "
               f"Success: {results['success']}, Failed: {results['failed']}")
    
    return results


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description='Take daily portfolio snapshots for all or specific users.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python daily_snapshot.py                    # Snapshot all users
    python daily_snapshot.py --user-id 1        # Snapshot user 1 only
    python daily_snapshot.py --user-id 1 2 3    # Snapshot users 1, 2, 3
    python daily_snapshot.py --dry-run          # Preview without saving
    python daily_snapshot.py --date 2026-01-20  # Snapshot for specific date
        """
    )
    
    parser.add_argument(
        '--user-id', '-u',
        type=int,
        nargs='+',
        help='User ID(s) to process. If not specified, processes all users.'
    )
    
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Calculate values but do not save to database.'
    )
    
    parser.add_argument(
        '--date', '-d',
        type=str,
        help='Snapshot date in YYYY-MM-DD format. Defaults to today.'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose/debug logging.'
    )
    
    args = parser.parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Parse date if provided
    snapshot_date = None
    if args.date:
        try:
            snapshot_date = datetime.datetime.strptime(args.date, '%Y-%m-%d').date()
        except ValueError:
            logger.error(f"Invalid date format: {args.date}. Use YYYY-MM-DD.")
            sys.exit(1)
    
    # Run snapshot
    results = take_daily_snapshot(
        user_ids=args.user_id,
        dry_run=args.dry_run,
        snapshot_date=snapshot_date
    )
    
    # Exit with error code if any failures
    if results['failed'] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
