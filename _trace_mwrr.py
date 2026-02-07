"""
Trace EVERY cash-flow component the UI assembles for MWRR
and compare to the test script's simpler pipeline.
"""
import sqlite3, pandas as pd
conn = sqlite3.connect("portfolio.db")
user_id = 1

print("="*70)
print("COMPONENT 1: cash_deposits (deposits + withdrawals)")
print("="*70)
c1 = pd.read_sql("""
    SELECT deposit_date as date, amount,
           COALESCE(currency,'KWD') as currency,
           CASE WHEN amount >= 0 THEN 'DEPOSIT' ELSE 'WITHDRAWAL' END as type,
           'cash_deposits' as source
    FROM cash_deposits
    WHERE deposit_date IS NOT NULL AND amount != 0
    AND deposit_date > '1971-01-01'
    AND (include_in_analysis = 1 OR include_in_analysis IS NULL)
    AND (is_deleted IS NULL OR is_deleted = 0)
    AND user_id = ?
""", conn, params=(user_id,))
# Fix withdrawal amounts
wd = c1['type'] == 'WITHDRAWAL'
c1.loc[wd, 'amount'] = c1.loc[wd, 'amount'].abs()
# Convert USD
usd = c1['currency'].str.upper() == 'USD'
c1.loc[usd, 'amount'] = c1.loc[usd, 'amount'] * 0.307
c1 = c1.drop(columns=['currency'])
print(f"  Rows: {len(c1)}  (deposits={len(c1[c1.type=='DEPOSIT'])}, withdrawals={len(c1[c1.type=='WITHDRAWAL'])})")
dep_sum = c1.loc[c1.type=='DEPOSIT', 'amount'].sum()
wd_sum = c1.loc[c1.type=='WITHDRAWAL', 'amount'].sum()
print(f"  Deposit total: {dep_sum:,.2f}  Withdrawal total: {wd_sum:,.2f}")

print("\n" + "="*70)
print("COMPONENT 2: cash_dividends_only (from transactions)")
print("="*70)
c2 = pd.read_sql("""
    SELECT txn_date as date, COALESCE(cash_dividend,0) as amount,
           'DIVIDEND' as type, 'transactions' as source
    FROM transactions
    WHERE COALESCE(cash_dividend,0) > 0
    AND txn_date IS NOT NULL AND txn_date > '1971-01-01'
    AND (is_deleted IS NULL OR is_deleted = 0)
    AND user_id = ?
""", conn, params=(user_id,))
print(f"  Rows: {len(c2)}  Total: {c2['amount'].sum():,.2f}")
if not c2.empty:
    print(c2.to_string(index=False))

print("\n" + "="*70)
print("COMPONENT 3: withdrawals (from transactions - explicit)")
print("="*70)
try:
    c3 = pd.read_sql("""
        SELECT txn_date as date, sell_value as amount, 'WITHDRAWAL' as type
        FROM transactions
        WHERE (txn_type = 'Withdrawal' OR category = 'FLOW_OUT')
        AND user_id = ?
    """, conn, params=(user_id,))
except:
    c3 = pd.DataFrame()
print(f"  Rows: {len(c3)}  Total: {c3['amount'].sum() if not c3.empty else 0:,.2f}")
if not c3.empty:
    print(c3.to_string(index=False))

print("\n" + "="*70)
print("COMPONENT 4: ledger_deposits (from transactions)")
print("="*70)
try:
    c4 = pd.read_sql("""
        SELECT txn_date as date, purchase_cost as amount, 'DEPOSIT' as type
        FROM transactions
        WHERE (txn_type = 'Deposit' OR category = 'FLOW_IN')
        AND user_id = ?
    """, conn, params=(user_id,))
except:
    c4 = pd.DataFrame()
print(f"  Rows: {len(c4)}  Total: {c4['amount'].sum() if not c4.empty else 0:,.2f}")
if not c4.empty:
    print(c4.to_string(index=False))

print("\n" + "="*70)
print("COMPONENT 5: transfers_in")
print("="*70)
try:
    c5 = pd.read_sql("""
        SELECT txn_date as date, COALESCE(purchase_cost,0) as amount, 'DEPOSIT' as type
        FROM transactions WHERE txn_type = 'Transfer In' AND user_id = ?
    """, conn, params=(user_id,))
except:
    c5 = pd.DataFrame()
print(f"  Rows: {len(c5)}  Total: {c5['amount'].sum() if not c5.empty else 0:,.2f}")
if not c5.empty:
    print(c5.to_string(index=False))

print("\n" + "="*70)
print("COMPONENT 6: transfers_out")
print("="*70)
try:
    c6 = pd.read_sql("""
        SELECT txn_date as date, COALESCE(sell_value,0) as amount, 'WITHDRAWAL' as type
        FROM transactions WHERE txn_type = 'Transfer Out' AND user_id = ?
    """, conn, params=(user_id,))
except:
    c6 = pd.DataFrame()
print(f"  Rows: {len(c6)}  Total: {c6['amount'].sum() if not c6.empty else 0:,.2f}")
if not c6.empty:
    print(c6.to_string(index=False))

# Combine exactly as the UI does
print("\n" + "="*70)
print("COMBINED MWRR CASH FLOWS (all 6 components)")
print("="*70)
parts = [df for df in [c1, c2, c3, c4, c5, c6] if not df.empty]
if parts:
    combined = pd.concat(parts, ignore_index=True).sort_values('date')
else:
    combined = pd.DataFrame(columns=['date','amount','type'])

print(f"Total rows: {len(combined)}")
for t in ['DEPOSIT','WITHDRAWAL','DIVIDEND']:
    sub = combined[combined.type == t]
    print(f"  {t:12s}: {len(sub):3d} rows, total = {sub['amount'].sum():>12,.2f}")

# Portfolio value
snap = pd.read_sql('SELECT portfolio_value FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1', conn)
pv = float(snap.iloc[0]['portfolio_value'])
print(f"\nCurrent portfolio value: {pv:,.2f}")

# Now run XIRR on combined (same as UI's calculate_mwrr)
cf_dates = []
cf_amounts = []
for _, row in combined.iterrows():
    amt = float(row['amount'])
    if amt == 0: continue
    ct = str(row['type']).upper()
    if ct == 'DEPOSIT':
        cf_amounts.append(-abs(amt))
    elif ct in ('DIVIDEND','WITHDRAWAL'):
        cf_amounts.append(abs(amt))
    else: continue
    cf_dates.append(pd.Timestamp(row['date']))

cf_dates.append(pd.Timestamp.now())
cf_amounts.append(abs(pv))

pairs = sorted(zip(cf_dates, cf_amounts), key=lambda x: x[0])

# Combine same-day
combined_d = []
combined_a = []
prev_dt = None; running = 0.0
for dt, a in pairs:
    if prev_dt is None:
        prev_dt, running = dt, a
    elif dt == prev_dt:
        running += a
    else:
        combined_d.append(prev_dt); combined_a.append(running)
        prev_dt, running = dt, a
if prev_dt is not None:
    combined_d.append(prev_dt); combined_a.append(running)

cf_dates, cf_amounts = combined_d, combined_a

t0 = cf_dates[0]
yf = [(d - t0).days / 365.25 for d in cf_dates]

def npv(r):
    if r <= -1.0: return float('inf')
    return sum(a/((1.0+r)**t) for a,t in zip(cf_amounts, yf))

def d_npv(r):
    if r <= -1.0: return float('inf')
    return sum(-t*a/((1.0+r)**(t+1.0)) for a,t in zip(cf_amounts, yf))

r = 0.10; converged = False
for _ in range(200):
    f = npv(r); fp = d_npv(r)
    if abs(fp) < 1e-14: break
    rn = max(-0.9999, min(r - f/fp, 100.0))
    if abs(rn - r) < 1e-10:
        if abs(npv(rn)) < 0.01: converged = True; r = rn
        break
    r = rn

if not converged:
    lo, hi = -0.9999, 10.0
    if npv(lo)*npv(hi) > 0:
        for test_hi in [20.0, 50.0, 100.0]:
            if npv(lo)*npv(test_hi) < 0: hi = test_hi; break
    for _ in range(1000):
        mid = (lo+hi)/2.0
        if abs(npv(mid)) < 1e-8: r = mid; converged = True; break
        if npv(lo)*npv(mid) < 0: hi = mid
        else: lo = mid
    if not converged: r = mid

print(f"\n>>> XIRR with ALL components = {r*100:.4f}% <<<")

# Now test WITHOUT dividends (cash_deposits only)
print("\n--- Without dividends (deposits only) ---")
cf2_dates = []
cf2_amounts = []
for _, row in c1.iterrows():
    amt = float(row['amount'])
    if amt == 0: continue
    ct = str(row['type']).upper()
    if ct == 'DEPOSIT': cf2_amounts.append(-abs(amt))
    elif ct == 'WITHDRAWAL': cf2_amounts.append(abs(amt))
    else: continue
    cf2_dates.append(pd.Timestamp(row['date']))
cf2_dates.append(pd.Timestamp.now())
cf2_amounts.append(abs(pv))
pairs2 = sorted(zip(cf2_dates, cf2_amounts), key=lambda x: x[0])
cf2_dates = [p[0] for p in pairs2]
cf2_amounts = [p[1] for p in pairs2]

t0b = cf2_dates[0]
yf2 = [(d-t0b).days/365.25 for d in cf2_dates]
def npv2(r):
    if r <= -1.0: return float('inf')
    return sum(a/((1.0+r)**t) for a,t in zip(cf2_amounts, yf2))
r2 = 0.10
for _ in range(200):
    f = npv2(r2)
    fp2 = sum(-t*a/((1.0+r2)**(t+1.0)) for a,t in zip(cf2_amounts, yf2))
    if abs(fp2) < 1e-14: break
    rn = max(-0.9999, min(r2 - f/fp2, 100.0))
    if abs(rn - r2) < 1e-10: r2 = rn; break
    r2 = rn

print(f">>> XIRR deposits-only = {r2*100:.4f}% <<<")

conn.close()
