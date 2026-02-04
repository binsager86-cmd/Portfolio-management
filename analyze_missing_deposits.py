"""
Deposit & Transaction Timeline Analysis
Identifies missing deposits by analyzing cash flow
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

USER_ID = 2

print("=" * 80)
print("DEPOSIT & TRANSACTION TIMELINE ANALYSIS")
print("=" * 80)

for portfolio in ['KFH', 'BBYN', 'USA']:
    print(f"\n{'=' * 80}")
    print(f"PORTFOLIO: {portfolio}")
    print("=" * 80)
    
    # Get all deposits
    cur.execute('''
        SELECT deposit_date, amount, bank_name, source_reference, notes
        FROM cash_deposits
        WHERE user_id = ? AND portfolio = ? AND include_in_analysis = 1
        ORDER BY deposit_date
    ''', (USER_ID, portfolio))
    deposits = cur.fetchall()
    
    # Get all buys
    cur.execute('''
        SELECT txn_date, stock_symbol, purchase_cost, shares
        FROM transactions
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Buy'
        AND COALESCE(category, 'portfolio') = 'portfolio'
        ORDER BY txn_date
    ''', (USER_ID, portfolio))
    buys = cur.fetchall()
    
    # Get all sells
    cur.execute('''
        SELECT txn_date, stock_symbol, sell_value, shares
        FROM transactions
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Sell'
        AND COALESCE(category, 'portfolio') = 'portfolio'
        ORDER BY txn_date
    ''', (USER_ID, portfolio))
    sells = cur.fetchall()
    
    print(f"\n--- DEPOSITS ({len(deposits)} records) ---")
    total_deposits = 0
    for d in deposits:
        dt, amt, bank, ref, notes = d
        total_deposits += amt
        bank_str = bank if bank else ""
        ref_str = ref if ref else ""
        notes_str = notes if notes else ""
        print(f"  {dt}: {amt:>12,.2f}  {bank_str} {ref_str} {notes_str}")
    print(f"  TOTAL DEPOSITS: {total_deposits:,.2f}")
    
    print(f"\n--- BUYS ({len(buys)} records) ---")
    total_buys = 0
    for b in buys:
        dt, sym, cost, shares = b
        total_buys += cost or 0
        print(f"  {dt}: {sym:>12} | {shares:>8,.0f} shares | Cost: {cost:>10,.2f}")
    print(f"  TOTAL BUYS: {total_buys:,.2f}")
    
    print(f"\n--- SELLS ({len(sells)} records) ---")
    total_sells = 0
    for s in sells:
        dt, sym, val, shares = s
        total_sells += val or 0
        print(f"  {dt}: {sym:>12} | {shares:>8,.0f} shares | Value: {val:>10,.2f}")
    print(f"  TOTAL SELLS: {total_sells:,.2f}")
    
    # Running balance analysis
    print(f"\n--- RUNNING BALANCE ANALYSIS ---")
    
    # Combine all events
    events = []
    for d in deposits:
        events.append((d[0], 'DEPOSIT', d[1], ''))
    for b in buys:
        events.append((b[0], 'BUY', -(b[2] or 0), b[1]))
    for s in sells:
        events.append((s[0], 'SELL', s[2] or 0, s[1]))
    
    events.sort(key=lambda x: x[0])
    
    balance = 0
    min_balance = 0
    min_balance_date = None
    negative_periods = []
    
    for dt, typ, amt, sym in events:
        old_balance = balance
        balance += amt
        if balance < min_balance:
            min_balance = balance
            min_balance_date = dt
        if balance < -10:  # Threshold to avoid noise
            sym_str = f" ({sym})" if sym else ""
            print(f"  {dt}: {typ:>8}{sym_str:>15} {amt:>+12,.2f} => Balance: {balance:>12,.2f} ⚠️")
            if old_balance >= 0:
                negative_periods.append({'start': dt, 'amount': balance})
    
    print(f"\n  FINAL CALCULATED BALANCE: {balance:,.2f}")
    
    if min_balance < -10:
        print(f"\n  🚨 MINIMUM BALANCE: {min_balance:,.2f} on {min_balance_date}")
        print(f"  => MISSING DEPOSIT OF AT LEAST: {-min_balance:,.2f}")
        
        # Find when balance first went negative
        print(f"\n  📅 PERIODS WITH NEGATIVE BALANCE (need deposits before these dates):")
        for p in negative_periods[:5]:  # Show first 5
            print(f"     Before {p['start']}: needed at least {-p['amount']:,.2f}")

print("\n" + "=" * 80)
print("SUMMARY: MISSING DEPOSITS NEEDED")
print("=" * 80)

# Calculate what's needed per portfolio
for portfolio in ['KFH', 'BBYN', 'USA']:
    cur.execute('''
        SELECT COALESCE(SUM(amount), 0) FROM cash_deposits
        WHERE user_id = ? AND portfolio = ? AND include_in_analysis = 1
    ''', (USER_ID, portfolio))
    deposits = cur.fetchone()[0]
    
    cur.execute('''
        SELECT COALESCE(SUM(purchase_cost), 0) FROM transactions
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Buy'
        AND COALESCE(category, 'portfolio') = 'portfolio'
    ''', (USER_ID, portfolio))
    buys = cur.fetchone()[0]
    
    cur.execute('''
        SELECT COALESCE(SUM(sell_value), 0) FROM transactions
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Sell'
        AND COALESCE(category, 'portfolio') = 'portfolio'
    ''', (USER_ID, portfolio))
    sells = cur.fetchone()[0]
    
    # What's the minimum deposit needed to never go negative?
    # We need: deposits + sells >= buys
    min_needed = buys - sells
    gap = min_needed - deposits
    
    if gap > 0:
        print(f"\n{portfolio}:")
        print(f"  Total Buys: {buys:,.2f}")
        print(f"  Total Sells: {sells:,.2f}")
        print(f"  Net purchases: {buys - sells:,.2f}")
        print(f"  Current Deposits: {deposits:,.2f}")
        print(f"  => MINIMUM MISSING DEPOSIT: {gap:,.2f}")

conn.close()

print("\n" + "=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
