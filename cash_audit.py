"""
Cash Discrepancy Audit - Find the KD 248.56 difference
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

USER_ID = 2  # Your user_id

print("=" * 80)
print("CASH DISCREPANCY AUDIT")
print("=" * 80)

# 1. Check portfolio_cash balances (what's displayed)
print("\n1. PORTFOLIO_CASH TABLE (Displayed Values)")
print("-" * 80)
cur.execute('''
    SELECT portfolio, balance, currency, manual_override, last_updated
    FROM portfolio_cash 
    WHERE user_id = ?
''', (USER_ID,))
total_displayed = 0.0
for row in cur.fetchall():
    port, bal, ccy, override, updated = row
    print(f"  {port:>8}: {bal:>12,.2f} {ccy}  (Manual Override: {override})")
    total_displayed += bal
print(f"\n  TOTAL DISPLAYED: {total_displayed:,.2f} KWD")

# 2. Calculate what it SHOULD be (from transactions)
print("\n2. CALCULATED CASH (What it should be)")
print("-" * 80)

calculated_totals = {}
for portfolio in ['KFH', 'BBYN', 'USA']:
    print(f"\n  === {portfolio} ===")
    
    # A. Deposits (positive)
    cur.execute('''
        SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as deposits,
               COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) as withdrawals
        FROM cash_deposits 
        WHERE user_id = ? AND portfolio = ? AND include_in_analysis = 1
    ''', (USER_ID, portfolio))
    row = cur.fetchone()
    deposits = row[0]
    withdrawals = row[1]
    print(f"    Deposits:     +{deposits:>12,.2f}")
    print(f"    Withdrawals:  {withdrawals:>12,.2f}")
    
    # B. Buys (negative)
    cur.execute('''
        SELECT COALESCE(SUM(purchase_cost), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Buy' 
        AND COALESCE(category, 'portfolio') = 'portfolio'
    ''', (USER_ID, portfolio))
    buys = cur.fetchone()[0]
    print(f"    Buys:         -{buys:>12,.2f}")
    
    # C. Sells (positive)
    cur.execute('''
        SELECT COALESCE(SUM(sell_value), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Sell'
        AND COALESCE(category, 'portfolio') = 'portfolio'
    ''', (USER_ID, portfolio))
    sells = cur.fetchone()[0]
    print(f"    Sells:        +{sells:>12,.2f}")
    
    # D. Dividends (positive) - THIS IS A KEY AREA TO CHECK
    cur.execute('''
        SELECT COALESCE(SUM(cash_dividend), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND COALESCE(cash_dividend, 0) > 0
        AND COALESCE(category, 'portfolio') = 'portfolio'
    ''', (USER_ID, portfolio))
    dividends = cur.fetchone()[0]
    print(f"    Dividends:    +{dividends:>12,.2f}")
    
    # E. Fees (negative)
    cur.execute('''
        SELECT COALESCE(SUM(fees), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND COALESCE(fees, 0) > 0
        AND COALESCE(category, 'portfolio') = 'portfolio'
    ''', (USER_ID, portfolio))
    fees = cur.fetchone()[0]
    print(f"    Fees:         -{fees:>12,.2f}")
    
    # Net
    net = deposits + withdrawals - buys + sells + dividends - fees
    calculated_totals[portfolio] = net
    print(f"    ---------------------------------")
    print(f"    NET CASH:      {net:>12,.2f}")

print(f"\n  TOTAL CALCULATED: {sum(calculated_totals.values()):,.2f} KWD")

# 3. Check for dividends that might be incorrectly included
print("\n3. DIVIDEND DETAIL (Potential Discrepancy Source)")
print("-" * 80)
cur.execute('''
    SELECT stock_symbol, txn_date, cash_dividend, reinvested_dividend, 
           COALESCE(bonus_shares, 0) as bonus, notes
    FROM transactions 
    WHERE user_id = ? AND COALESCE(cash_dividend, 0) > 0
    ORDER BY txn_date DESC
    LIMIT 20
''', (USER_ID,))
total_div = 0.0
for row in cur.fetchall():
    sym, dt, div, reinv, bonus, notes = row
    total_div += div
    reinv_str = f" (Reinvested: {reinv})" if reinv else ""
    print(f"  {dt} | {sym:>12} | Div: {div:>8,.2f}{reinv_str}")
print(f"\n  TOTAL DIVIDENDS (last 20): {total_div:,.2f}")

# 4. Check if manual override is set
print("\n4. MANUAL OVERRIDE CHECK")
print("-" * 80)
cur.execute('''
    SELECT portfolio, manual_override 
    FROM portfolio_cash 
    WHERE user_id = ? AND manual_override = 1
''', (USER_ID,))
overrides = cur.fetchall()
if overrides:
    print("  ⚠️  MANUAL OVERRIDES FOUND:")
    for row in overrides:
        print(f"     {row[0]} has manual_override=1 (balance is NOT auto-calculated)")
    print("\n  🔧 FIX: Set manual_override=0 and recalculate, or manually update to correct value")
else:
    print("  ✅ No manual overrides - balances are auto-calculated")

# 5. Summary comparison
print("\n5. DISCREPANCY SUMMARY")
print("-" * 80)
cur.execute('''
    SELECT portfolio, balance
    FROM portfolio_cash 
    WHERE user_id = ?
''', (USER_ID,))
displayed = {row[0]: row[1] for row in cur.fetchall()}

total_discrepancy = 0.0
for portfolio in ['KFH', 'BBYN', 'USA']:
    disp = displayed.get(portfolio, 0)
    calc = calculated_totals.get(portfolio, 0)
    diff = disp - calc
    total_discrepancy += diff
    if abs(diff) > 0.01:
        print(f"  {portfolio}: Displayed={disp:,.2f}, Calculated={calc:,.2f}, DIFF={diff:+,.2f}")
    else:
        print(f"  {portfolio}: Displayed={disp:,.2f}, Calculated={calc:,.2f}, OK")

print(f"\n  TOTAL DISCREPANCY: {total_discrepancy:+,.2f} KWD")

conn.close()

print("\n" + "=" * 80)
print("AUDIT COMPLETE")
print("=" * 80)
