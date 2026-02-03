# Save as check_pnl.py and run from project folder
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# First check which user_id has data
cur.execute("SELECT DISTINCT user_id FROM transactions")
user_ids = cur.fetchall()
print(f"User IDs in database: {[r[0] for r in user_ids]}")

# Use user_id = 2 since that's where the data is
user_id = 2

print("=" * 80)
print("REALIZED P&L BY STOCK - RUNTIME CALCULATION")
print("=" * 80)

# Get all unique (symbol, portfolio) with sells
cur.execute("""
    SELECT DISTINCT stock_symbol, portfolio 
    FROM transactions 
    WHERE txn_type = 'Sell' AND user_id = ?
    AND (is_deleted = 0 OR is_deleted IS NULL)
""", (user_id,))
positions = cur.fetchall()

grand_total = 0

for symbol, portfolio in positions:
    cur.execute("""
        SELECT id, txn_type, txn_date, shares, purchase_cost, sell_value, fees, bonus_shares
        FROM transactions 
        WHERE stock_symbol = ? AND portfolio = ? AND user_id = ?
        AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY txn_date ASC, id ASC
    """, (symbol, portfolio, user_id))
    
    txns = cur.fetchall()
    
    total_shares = 0
    total_cost = 0
    realized_pnl = 0
    
    for txn in txns:
        txn_id, txn_type, txn_date, shares, purchase_cost, sell_value, fees, bonus_shares = txn
        shares = float(shares or 0)
        purchase_cost = float(purchase_cost or 0)
        sell_value = float(sell_value or 0)
        fees = float(fees or 0)
        bonus_shares = float(bonus_shares or 0)
        
        if txn_type == 'Buy':
            total_cost += purchase_cost + fees
            total_shares += shares
            if bonus_shares > 0:
                total_shares += bonus_shares
        
        elif txn_type in ('DIVIDEND_ONLY', 'Dividend', 'Bonus Shares', 'Bonus'):
            if bonus_shares > 0:
                total_shares += bonus_shares
            elif txn_type in ('Bonus Shares', 'Bonus') and shares > 0:
                total_shares += shares
        
        elif txn_type == 'Sell':
            avg_cost = total_cost / total_shares if total_shares > 0 else 0
            proceeds = sell_value - fees
            cost_of_sold = avg_cost * shares
            pnl = proceeds - cost_of_sold
            realized_pnl += pnl
            
            total_cost -= cost_of_sold
            total_shares -= shares
    
    if realized_pnl != 0:
        print(f"{symbol:15} ({portfolio}): {realized_pnl:>12,.2f}")
        grand_total += realized_pnl

print("=" * 80)
print(f"{'TOTAL':15}           : {grand_total:>12,.2f}")
print("=" * 80)

# Now compare with stored P&L values
print("\n" + "=" * 80)
print("STORED P&L VALUES IN DATABASE")
print("=" * 80)

cur.execute("""
    SELECT stock_symbol, portfolio, SUM(realized_pnl_at_txn) as total_pnl
    FROM transactions
    WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    GROUP BY stock_symbol, portfolio
    HAVING total_pnl != 0
    ORDER BY stock_symbol
""", (user_id,))

stored_total = 0
for row in cur.fetchall():
    symbol, portfolio, pnl = row
    print(f"{symbol:15} ({portfolio}): {pnl:>12,.2f}")
    stored_total += pnl

print("=" * 80)
print(f"{'STORED TOTAL':15}      : {stored_total:>12,.2f}")
print("=" * 80)

print(f"\nRuntime Calculated: {grand_total:,.2f}")
print(f"Stored in DB:       {stored_total:,.2f}")
print(f"Difference:         {grand_total - stored_total:,.2f}")

conn.close()
