"""Debug script to check actual financial data in database."""
import sqlite3
import sys
sys.path.insert(0, '.')

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

print("=" * 60)
print("CORRECTED TRADING PROFIT CALCULATION")
print("=" * 60)

# Get all trading buys and sells per stock
print("\n=== TRADING POSITIONS BY STOCK ===")
cur.execute("""
    SELECT stock_symbol, SUM(shares) as total_shares, SUM(purchase_cost) as total_cost
    FROM trading_history WHERE txn_type = 'Buy' GROUP BY stock_symbol
""")
buys = {r[0]: {'shares': r[1], 'cost': r[2]} for r in cur.fetchall()}

cur.execute("""
    SELECT stock_symbol, SUM(shares) as total_shares, SUM(sell_value) as total_value
    FROM trading_history WHERE txn_type = 'Sell' GROUP BY stock_symbol
""")
sells = {r[0]: {'shares': r[1], 'value': r[2]} for r in cur.fetchall()}

print(f"{'Stock':<15} {'Bought':<10} {'Sold':<10} {'Remaining':<10} {'Status'}")
print("-" * 60)

total_matched_cost = 0
total_matched_value = 0
open_position_cost = 0

for stock, buy_data in buys.items():
    bought = buy_data['shares']
    buy_cost = buy_data['cost']
    sold = sells.get(stock, {}).get('shares', 0)
    sell_value = sells.get(stock, {}).get('value', 0)
    remaining = bought - sold
    
    avg_cost = buy_cost / bought if bought > 0 else 0
    
    if sold > 0:
        # Cost of shares that were sold
        sold_cost = sold * avg_cost
        total_matched_cost += sold_cost
        total_matched_value += sell_value
    
    if remaining > 0:
        open_cost = remaining * avg_cost
        open_position_cost += open_cost
        status = f"OPEN ({remaining:.0f} shares)"
    else:
        status = "CLOSED"
    
    print(f"{stock:<15} {bought:<10.0f} {sold:<10.0f} {remaining:<10.0f} {status}")

print("-" * 60)
print(f"\n=== CORRECTED REALIZED PROFIT CALCULATION ===")
print(f"Cost of SOLD shares only: {total_matched_cost:,.3f} KWD")
print(f"Value received from sells: {total_matched_value:,.3f} KWD")
realized_profit = total_matched_value - total_matched_cost
print(f"REALIZED PROFIT (Closed trades): {realized_profit:,.3f} KWD")

print(f"\n=== OPEN POSITIONS (UNREALIZED) ===")
print(f"Cost basis of open positions: {open_position_cost:,.3f} KWD")
print(f"(These are NOT losses - they haven't been sold yet)")

print(f"\n=== WRONG CALCULATION (What was happening) ===")
total_buy_cost = sum(b['cost'] for b in buys.values())
total_sell_value = sum(s['value'] for s in sells.values())
wrong_calc = total_sell_value - total_buy_cost
print(f"Total ALL buys: {total_buy_cost:,.3f}")
print(f"Total ALL sells: {total_sell_value:,.3f}")
print(f"WRONG result (sells - ALL buys): {wrong_calc:,.3f}")
print(f"Half of wrong result: {wrong_calc/2:,.3f} <-- This was the -58,820 figure!")

# Get dividends
cur.execute("SELECT SUM(cash_dividend) FROM trading_history")
divs = cur.fetchone()[0] or 0
print(f"\n=== DIVIDENDS ===")
print(f"Trading dividends: {divs:,.3f} KWD")

print(f"\n=== FINAL CORRECT NUMBERS ===")
print(f"Trading Realized Profit: {realized_profit:,.3f} KWD")
print(f"Trading Dividends: {divs:,.3f} KWD")
print(f"Open Position Cost (Unrealized): {open_position_cost:,.3f} KWD")

conn.close()
