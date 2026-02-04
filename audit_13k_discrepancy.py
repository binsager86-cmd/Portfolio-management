"""
Audit Script: Find the ~13K Cash Discrepancy
Expected: ~49,711 KWD | Calculated: ~36,700 KWD | Gap: ~13,000 KWD
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

USER_ID = 2  # Your user_id

print("=" * 80)
print("CASH DISCREPANCY AUDIT: Finding the Missing ~13,000 KWD")
print("=" * 80)

# Your actual balances
ACTUAL = {
    'KFH': 32790.311,
    'BBYN': 16866.072,
    'USA': 179.06  # USD
}
ACTUAL_TOTAL_KWD = ACTUAL['KFH'] + ACTUAL['BBYN'] + (ACTUAL['USA'] * 0.307)
print(f"\nACTUAL CASH (from brokerage): {ACTUAL_TOTAL_KWD:,.2f} KWD")

# ============================================================================
# STEP 1: Replicate the EXACT calculation from recalc_portfolio_cash()
# ============================================================================
print("\n" + "=" * 80)
print("STEP 1: REPLICATE SYSTEM CALCULATION (recalc_portfolio_cash formula)")
print("=" * 80)

for portfolio in ['KFH', 'BBYN', 'USA']:
    print(f"\n{'='*40}")
    print(f"  PORTFOLIO: {portfolio}")
    print(f"{'='*40}")
    
    # 1. Deposits & Withdrawals
    cur.execute('''
        SELECT COALESCE(SUM(amount), 0)
        FROM cash_deposits
        WHERE user_id = ? AND portfolio = ? AND include_in_analysis = 1
    ''', (USER_ID, portfolio))
    deposits = cur.fetchone()[0] or 0
    print(f"  1. Deposits/Withdrawals:  {deposits:>12,.2f}")
    
    # 2. Buys (negative) - EXACT formula from code
    cur.execute('''
        SELECT COALESCE(SUM(-1 * COALESCE(t.purchase_cost, 0)), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND t.txn_type = 'Buy' 
        AND COALESCE(t.category, 'portfolio') = 'portfolio'
        AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
    ''', (USER_ID, portfolio))
    buys = cur.fetchone()[0] or 0
    print(f"  2. Buys (outflow):        {buys:>12,.2f}")
    
    # 3. Sells (positive)
    cur.execute('''
        SELECT COALESCE(SUM(COALESCE(t.sell_value, 0)), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND t.txn_type = 'Sell' 
        AND COALESCE(t.category, 'portfolio') = 'portfolio'
        AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
    ''', (USER_ID, portfolio))
    sells = cur.fetchone()[0] or 0
    print(f"  3. Sells (inflow):        {sells:>12,.2f}")
    
    # 4. Dividends (positive)
    cur.execute('''
        SELECT COALESCE(SUM(COALESCE(t.cash_dividend, 0)), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.cash_dividend, 0) > 0
        AND COALESCE(t.category, 'portfolio') = 'portfolio'
        AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
    ''', (USER_ID, portfolio))
    dividends = cur.fetchone()[0] or 0
    print(f"  4. Dividends (inflow):    {dividends:>12,.2f}")
    
    # 5. Fees (negative)
    cur.execute('''
        SELECT COALESCE(SUM(-1 * COALESCE(t.fees, 0)), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.fees, 0) > 0
        AND COALESCE(t.category, 'portfolio') = 'portfolio'
        AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
    ''', (USER_ID, portfolio))
    fees = cur.fetchone()[0] or 0
    print(f"  5. Fees (outflow):        {fees:>12,.2f}")
    
    # Calculated total
    calculated = deposits + buys + sells + dividends + fees
    actual = ACTUAL[portfolio]
    diff = actual - calculated
    
    print(f"  {'─'*36}")
    print(f"  CALCULATED:               {calculated:>12,.2f}")
    print(f"  ACTUAL:                   {actual:>12,.2f}")
    print(f"  DIFFERENCE:               {diff:>12,.2f} {'⚠️ MISMATCH' if abs(diff) > 1 else '✅'}")

# ============================================================================
# STEP 2: Check for EXCLUDED data (soft-deleted, include_in_analysis=0)
# ============================================================================
print("\n" + "=" * 80)
print("STEP 2: CHECK FOR EXCLUDED DATA")
print("=" * 80)

# Deposits with include_in_analysis = 0
cur.execute('''
    SELECT portfolio, SUM(amount) as total, COUNT(*) as cnt
    FROM cash_deposits
    WHERE user_id = ? AND include_in_analysis = 0
    GROUP BY portfolio
''', (USER_ID,))
rows = cur.fetchall()
if rows:
    print("\n⚠️  DEPOSITS EXCLUDED FROM ANALYSIS (include_in_analysis=0):")
    for row in rows:
        print(f"    {row[0]}: {row[1]:,.2f} ({row[2]} records)")
else:
    print("\n✅ No deposits excluded from analysis")

# Soft-deleted deposits
cur.execute('''
    SELECT portfolio, SUM(amount) as total, COUNT(*) as cnt
    FROM cash_deposits
    WHERE user_id = ? AND is_deleted = 1
    GROUP BY portfolio
''', (USER_ID,))
rows = cur.fetchall()
if rows:
    print("\n⚠️  SOFT-DELETED DEPOSITS:")
    for row in rows:
        print(f"    {row[0]}: {row[1]:,.2f} ({row[2]} records)")
else:
    print("\n✅ No soft-deleted deposits")

# Soft-deleted transactions
cur.execute('''
    SELECT portfolio, txn_type, SUM(COALESCE(purchase_cost, 0) + COALESCE(sell_value, 0)) as total, COUNT(*) as cnt
    FROM transactions
    WHERE user_id = ? AND is_deleted = 1
    GROUP BY portfolio, txn_type
''', (USER_ID,))
rows = cur.fetchall()
if rows:
    print("\n⚠️  SOFT-DELETED TRANSACTIONS:")
    for row in rows:
        print(f"    {row[0]} - {row[1]}: {row[2]:,.2f} ({row[3]} records)")
else:
    print("\n✅ No soft-deleted transactions")

# ============================================================================
# STEP 3: Check for CATEGORY FILTER issues
# ============================================================================
print("\n" + "=" * 80)
print("STEP 3: CHECK FOR CATEGORY FILTER ISSUES")
print("=" * 80)

# Transactions with category != 'portfolio' (these are EXCLUDED from calculation)
cur.execute('''
    SELECT category, txn_type, COUNT(*) as cnt, 
           SUM(COALESCE(purchase_cost, 0)) as buy_total,
           SUM(COALESCE(sell_value, 0)) as sell_total,
           SUM(COALESCE(cash_dividend, 0)) as div_total
    FROM transactions
    WHERE user_id = ? AND category != 'portfolio' AND category IS NOT NULL
    GROUP BY category, txn_type
''', (USER_ID,))
rows = cur.fetchall()
if rows:
    print("\n⚠️  TRANSACTIONS WITH NON-PORTFOLIO CATEGORY (EXCLUDED FROM CASH CALC):")
    for row in rows:
        cat, ttype, cnt, buy, sell, div = row
        value = buy if ttype == 'Buy' else (sell if ttype == 'Sell' else div)
        print(f"    Category '{cat}' - {ttype}: {value:,.2f} ({cnt} records)")
else:
    print("\n✅ All transactions have category='portfolio' or NULL")

# Transactions with NULL category (these ARE included due to COALESCE)
cur.execute('''
    SELECT txn_type, COUNT(*) as cnt
    FROM transactions
    WHERE user_id = ? AND category IS NULL
    GROUP BY txn_type
''', (USER_ID,))
rows = cur.fetchall()
if rows:
    print("\n📝 Transactions with NULL category (included via COALESCE):")
    for row in rows:
        print(f"    {row[0]}: {row[1]} records")

# ============================================================================
# STEP 4: Check the is_deleted filter issue
# ============================================================================
print("\n" + "=" * 80)
print("STEP 4: CHECK SOFT-DELETE FILTER (BUG CHECK)")
print("=" * 80)

# The recalc_portfolio_cash does NOT filter out is_deleted transactions!
cur.execute('''
    SELECT txn_type, 
           SUM(CASE WHEN is_deleted = 1 THEN COALESCE(purchase_cost, 0) ELSE 0 END) as deleted_buys,
           SUM(CASE WHEN is_deleted = 1 THEN COALESCE(sell_value, 0) ELSE 0 END) as deleted_sells,
           SUM(CASE WHEN is_deleted = 1 THEN COALESCE(cash_dividend, 0) ELSE 0 END) as deleted_divs
    FROM transactions
    WHERE user_id = ?
    GROUP BY txn_type
    HAVING deleted_buys > 0 OR deleted_sells > 0 OR deleted_divs > 0
''', (USER_ID,))
rows = cur.fetchall()
if rows:
    print("\n🚨 BUG: DELETED TRANSACTIONS STILL COUNTED IN CASH CALCULATION:")
    for row in rows:
        print(f"    {row[0]}: Buys={row[1]:,.2f}, Sells={row[2]:,.2f}, Divs={row[3]:,.2f}")
else:
    print("\n✅ No deleted transactions affecting calculation")

# ============================================================================
# STEP 5: DIVIDEND ANALYSIS
# ============================================================================
print("\n" + "=" * 80)
print("STEP 5: DIVIDEND ANALYSIS (Potential ~13K source)")
print("=" * 80)

cur.execute('''
    SELECT portfolio, 
           SUM(COALESCE(cash_dividend, 0)) as cash_divs,
           SUM(COALESCE(reinvested_dividend, 0)) as reinvested,
           COUNT(CASE WHEN cash_dividend > 0 THEN 1 END) as cash_count,
           COUNT(CASE WHEN reinvested_dividend > 0 THEN 1 END) as reinv_count
    FROM transactions
    WHERE user_id = ? AND (cash_dividend > 0 OR reinvested_dividend > 0)
    GROUP BY portfolio
''', (USER_ID,))
rows = cur.fetchall()
print("\nDividend Summary:")
total_cash_div = 0
total_reinv = 0
for row in rows:
    port, cash_div, reinv, cash_cnt, reinv_cnt = row
    total_cash_div += cash_div or 0
    total_reinv += reinv or 0
    print(f"  {port}: Cash Div={cash_div:,.2f} ({cash_cnt} txns), Reinvested={reinv:,.2f} ({reinv_cnt} txns)")
print(f"\n  TOTAL CASH DIVIDENDS: {total_cash_div:,.2f}")
print(f"  TOTAL REINVESTED:     {total_reinv:,.2f}")

# ============================================================================
# STEP 6: SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("STEP 6: SUMMARY & RECOMMENDATIONS")
print("=" * 80)

# Get current portfolio_cash values
cur.execute('''
    SELECT portfolio, balance, manual_override
    FROM portfolio_cash
    WHERE user_id = ?
''', (USER_ID,))
rows = cur.fetchall()
print("\nCurrent portfolio_cash table:")
calc_total = 0
for row in rows:
    port, bal, override = row
    calc_total += bal if port != 'USA' else bal * 0.307
    print(f"  {port}: {bal:,.2f} (override={override})")

print(f"\n  CALCULATED TOTAL:  {calc_total:,.2f} KWD")
print(f"  ACTUAL TOTAL:      {ACTUAL_TOTAL_KWD:,.2f} KWD")
print(f"  DISCREPANCY:       {ACTUAL_TOTAL_KWD - calc_total:,.2f} KWD")

conn.close()

print("\n" + "=" * 80)
print("AUDIT COMPLETE")
print("=" * 80)
