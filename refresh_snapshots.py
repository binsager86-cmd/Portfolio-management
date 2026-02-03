"""Refresh all position snapshots with correct WAC calculation"""
import sqlite3
import time

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()
user_id = 2
ts = int(time.time())
today = time.strftime('%Y-%m-%d')

print("Refreshing position snapshots with correct WAC method...")
print("=" * 70)

# Get portfolio mapping
cur.execute("SELECT id, name FROM portfolios WHERE user_id = ?", (user_id,))
portfolio_map = {row[1]: row[0] for row in cur.fetchall()}

# Get stock mapping
cur.execute("SELECT id, ticker FROM stocks_master")
stock_map = {row[1]: row[0] for row in cur.fetchall()}

# Calculate from transactions
cur.execute("""
    SELECT 
        stock_symbol, portfolio,
        SUM(CASE WHEN txn_type = 'Buy' THEN shares ELSE 0 END) as bought,
        SUM(CASE WHEN txn_type = 'Sell' THEN shares ELSE 0 END) as sold,
        SUM(CASE WHEN txn_type = 'Buy' THEN purchase_cost ELSE 0 END) as cost,
        SUM(CASE WHEN txn_type = 'Sell' THEN sell_value ELSE 0 END) as proceeds,
        SUM(COALESCE(cash_dividend, 0)) as dividends,
        SUM(COALESCE(bonus_shares, 0)) as bonus
    FROM transactions
    WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    GROUP BY stock_symbol, portfolio
""", (user_id,))

positions = cur.fetchall()
updated = 0
created = 0

for pos in positions:
    symbol, portfolio, bought, sold, cost, proceeds, dividends, bonus = pos
    
    bought = float(bought or 0)
    sold = float(sold or 0)
    cost = float(cost or 0)
    proceeds = float(proceeds or 0)
    dividends = float(dividends or 0)
    bonus = float(bonus or 0)
    
    # Calculate net shares including bonus
    net_shares = bought - sold + bonus
    stock_id = stock_map.get(symbol)
    portfolio_id = portfolio_map.get(portfolio)
    
    # WAC method: avg_cost = total_cost / total_shares_acquired
    total_shares_acquired = bought + bonus
    if total_shares_acquired > 0:
        avg_cost_at_acquisition = cost / total_shares_acquired
    else:
        avg_cost_at_acquisition = 0.0
    
    # Realized P&L = proceeds - (avg_cost × shares_sold)
    realized_pnl = proceeds - (avg_cost_at_acquisition * sold) if sold > 0 else 0.0
    
    # Remaining cost basis
    remaining_cost = cost - (avg_cost_at_acquisition * sold) if sold > 0 else cost
    remaining_cost = max(remaining_cost, 0.0)
    
    # Current avg cost
    avg_cost = remaining_cost / net_shares if net_shares > 0.001 else 0.0
    
    status = 'CLOSED' if abs(net_shares) < 0.001 else 'OPEN'
    
    print(f"{symbol:12} shares={net_shares:10.0f} bonus={bonus:6.0f} avg_cost={avg_cost:.4f} realized={realized_pnl:10.2f} {status}")
    
    # Check if exists
    cur.execute("""
        SELECT id FROM position_snapshots 
        WHERE user_id = ? AND stock_symbol = ?
    """, (user_id, symbol))
    existing = cur.fetchone()
    
    if existing:
        cur.execute("""
            UPDATE position_snapshots 
            SET total_shares = ?, total_cost = ?, avg_cost = ?,
                realized_pnl = ?, cash_dividends_received = ?,
                status = ?, snapshot_date = ?
            WHERE id = ?
        """, (net_shares, remaining_cost, avg_cost, realized_pnl, dividends, status, today, existing[0]))
        updated += 1
    else:
        cur.execute("""
            INSERT INTO position_snapshots 
            (user_id, stock_id, portfolio_id, stock_symbol, snapshot_date,
             total_shares, total_cost, avg_cost, realized_pnl,
             cash_dividends_received, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, stock_id, portfolio_id, symbol, today,
              net_shares, remaining_cost, avg_cost, realized_pnl, dividends, status, ts))
        created += 1

conn.commit()
conn.close()

print("=" * 70)
print(f"Updated: {updated}, Created: {created}")
print("✅ Position snapshots refreshed with correct bonus share handling!")
