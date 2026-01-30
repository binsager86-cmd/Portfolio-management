"""
Diagnose cash calculation vs ground truth.

GROUND TRUTH:
- KFH / KWD → 32,790.311
- BBYN / KWD → 16,866.072
- USA / USD → 179.06

CASH RULES:
- BUY: cash -= purchase_cost (already includes fees if stored that way)
- SELL: cash += sell_value (proceeds)
- DIVIDEND: cash += cash_dividend
- DEPOSIT: cash += amount (from cash_deposits table)
- WITHDRAW: cash -= amount (negative deposits)
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()
user_id = 2

GROUND_TRUTH = {
    'KFH': 32790.311,
    'BBYN': 16866.072,
    'USA': 179.06,
}

print("=" * 60)
print("CASH DIAGNOSIS FOR USER", user_id)
print("=" * 60)

# Get stock portfolio mapping
cur.execute("SELECT symbol, portfolio, currency FROM stocks WHERE user_id=?", (user_id,))
stock_portfolio = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

print("\n=== STOCK PORTFOLIO MAPPING ===")
for sym, (port, ccy) in sorted(stock_portfolio.items()):
    print(f"  {sym} → {port} ({ccy})")

# 1. DEPOSITS (from cash_deposits table)
print("\n=== DEPOSITS (cash_deposits table) ===")
cur.execute("""
    SELECT portfolio, currency, SUM(amount) as total
    FROM cash_deposits 
    WHERE user_id = ? AND include_in_analysis = 1
    GROUP BY portfolio, currency
""", (user_id,))
deposits = {}
for row in cur.fetchall():
    port, ccy, total = row
    deposits[port] = total
    print(f"  {port}: +{total:,.3f} {ccy}")

# 2. BUYS (decrease cash)
print("\n=== BUYS (cash outflow) ===")
cur.execute("""
    SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio,
           SUM(COALESCE(t.purchase_cost, 0)) as total_cost,
           SUM(COALESCE(t.fees, 0)) as total_fees
    FROM transactions t
    LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
    WHERE t.user_id = ? AND t.txn_type = 'Buy' AND COALESCE(t.category, 'portfolio') = 'portfolio'
    GROUP BY COALESCE(t.portfolio, s.portfolio, 'KFH')
""", (user_id,))
buys = {}
for row in cur.fetchall():
    port, cost, fees = row
    # Note: purchase_cost may or may not include fees - need to check
    buys[port] = (cost or 0, fees or 0)
    print(f"  {port}: -{cost or 0:,.3f} (fees: {fees or 0:,.3f})")

# 3. SELLS (increase cash)
print("\n=== SELLS (cash inflow) ===")
cur.execute("""
    SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio,
           SUM(COALESCE(t.sell_value, 0)) as total_value,
           SUM(COALESCE(t.fees, 0)) as total_fees
    FROM transactions t
    LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
    WHERE t.user_id = ? AND t.txn_type = 'Sell' AND COALESCE(t.category, 'portfolio') = 'portfolio'
    GROUP BY COALESCE(t.portfolio, s.portfolio, 'KFH')
""", (user_id,))
sells = {}
for row in cur.fetchall():
    port, value, fees = row
    sells[port] = (value or 0, fees or 0)
    print(f"  {port}: +{value or 0:,.3f} (fees: {fees or 0:,.3f})")

# 4. DIVIDENDS (increase cash)
print("\n=== DIVIDENDS (cash inflow) ===")
cur.execute("""
    SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio,
           SUM(COALESCE(t.cash_dividend, 0)) as total_div
    FROM transactions t
    LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
    WHERE t.user_id = ? AND COALESCE(t.cash_dividend, 0) > 0 AND COALESCE(t.category, 'portfolio') = 'portfolio'
    GROUP BY COALESCE(t.portfolio, s.portfolio, 'KFH')
""", (user_id,))
dividends = {}
for row in cur.fetchall():
    port, div = row
    dividends[port] = div or 0
    print(f"  {port}: +{div or 0:,.3f}")

# CALCULATE CASH PER PORTFOLIO
print("\n" + "=" * 60)
print("CASH CALCULATION")
print("=" * 60)

for port in ['KFH', 'BBYN', 'USA']:
    dep = deposits.get(port, 0)
    buy_cost, buy_fees = buys.get(port, (0, 0))
    sell_val, sell_fees = sells.get(port, (0, 0))
    div = dividends.get(port, 0)
    
    # Cash = Deposits - Buys + Sells + Dividends
    # Question: Are fees already included in purchase_cost/sell_value, or separate?
    # Let's compute both ways:
    
    # Option A: fees are separate (subtract for buys, subtract for sells)
    cash_a = dep - buy_cost - buy_fees + sell_val - sell_fees + div
    
    # Option B: fees are already in purchase_cost, not in sell_value
    cash_b = dep - buy_cost + sell_val + div
    
    # Option C: purchase_cost includes fees, sell_value is net of fees
    cash_c = dep - buy_cost + sell_val + div
    
    gt = GROUND_TRUTH.get(port, 0)
    
    print(f"\n{port}:")
    print(f"  Deposits:   +{dep:>12,.3f}")
    print(f"  Buys:       -{buy_cost:>12,.3f} (fees: {buy_fees:,.3f})")
    print(f"  Sells:      +{sell_val:>12,.3f} (fees: {sell_fees:,.3f})")
    print(f"  Dividends:  +{div:>12,.3f}")
    print(f"  ─────────────────────────")
    print(f"  Computed:    {cash_b:>12,.3f}")
    print(f"  Ground Truth:{gt:>12,.3f}")
    print(f"  Difference:  {cash_b - gt:>+12,.3f}")

# Show current portfolio_cash values
print("\n" + "=" * 60)
print("CURRENT portfolio_cash TABLE")
print("=" * 60)
cur.execute("SELECT portfolio, balance, currency FROM portfolio_cash WHERE user_id=?", (user_id,))
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]:,.3f} {row[2]}")

# Detail breakdown for debugging
print("\n" + "=" * 60)
print("DETAILED TRANSACTIONS BY PORTFOLIO")
print("=" * 60)

for port in ['KFH', 'BBYN', 'USA']:
    print(f"\n--- {port} ---")
    cur.execute("""
        SELECT t.txn_type, t.stock_symbol, COUNT(*) as cnt, 
               SUM(COALESCE(t.purchase_cost,0)) as buy_total,
               SUM(COALESCE(t.sell_value,0)) as sell_total,
               SUM(COALESCE(t.cash_dividend,0)) as div_total,
               SUM(COALESCE(t.fees,0)) as fees_total
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
          AND COALESCE(t.category, 'portfolio') = 'portfolio'
        GROUP BY t.txn_type, t.stock_symbol
        ORDER BY t.txn_type, t.stock_symbol
    """, (user_id, port))
    for row in cur.fetchall():
        print(f"  {row[0]:15} {row[1]:10} cnt={row[2]:3} buy={row[3]:>10,.2f} sell={row[4]:>10,.2f} div={row[5]:>8,.2f} fees={row[6]:>6,.2f}")

conn.close()
