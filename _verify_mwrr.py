"""Simulate the exact MWRR pipeline the UI uses to verify it produces a valid result."""
import sqlite3, pandas as pd, sys, os
from datetime import date

# Add the project to path so we can import the calculator class
sys.path.insert(0, os.path.dirname(__file__))

conn = sqlite3.connect("portfolio.db")

# 1. Cash deposits (with USD conversion + withdrawals)
deposits = pd.read_sql("""
    SELECT deposit_date as date, amount,
           COALESCE(currency, 'KWD') as currency,
           CASE WHEN amount >= 0 THEN 'DEPOSIT' ELSE 'WITHDRAWAL' END as type,
           'cash_deposits' as source
    FROM cash_deposits
    WHERE deposit_date IS NOT NULL AND amount != 0
    AND deposit_date > '1971-01-01'
    AND (include_in_analysis = 1 OR include_in_analysis IS NULL)
    AND (is_deleted IS NULL OR is_deleted = 0)
    AND user_id = 1
""", conn)

# Convert withdrawals to positive
wd_mask = deposits['type'] == 'WITHDRAWAL'
deposits.loc[wd_mask, 'amount'] = deposits.loc[wd_mask, 'amount'].abs()

# Convert USD
usd_mask = deposits['currency'].str.upper() == 'USD'
deposits.loc[usd_mask, 'amount'] = deposits.loc[usd_mask, 'amount'] * 0.307
deposits = deposits.drop(columns=['currency'])

# 2. Dividends
divs = pd.read_sql("""
    SELECT txn_date as date, COALESCE(cash_dividend, 0) as amount,
           'DIVIDEND' as type, 'transactions' as source
    FROM transactions
    WHERE COALESCE(cash_dividend, 0) > 0
    AND txn_date IS NOT NULL AND txn_date > '1971-01-01'
    AND (is_deleted IS NULL OR is_deleted = 0)
    AND user_id = 1
""", conn)

# 3. Current portfolio value
snap = pd.read_sql('SELECT portfolio_value FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1', conn)
current_val = float(snap.iloc[0]['portfolio_value'])

# 4. Inception date (earliest across both tables)
earliest_dep = pd.read_sql("""
    SELECT MIN(deposit_date) as d FROM cash_deposits
    WHERE deposit_date IS NOT NULL AND deposit_date > '1971-01-01'
    AND amount > 0
    AND (include_in_analysis = 1 OR include_in_analysis IS NULL)
    AND (is_deleted IS NULL OR is_deleted = 0) AND user_id = 1
""", conn).iloc[0]['d']

earliest_txn = pd.read_sql("""
    SELECT MIN(txn_date) as d FROM transactions
    WHERE txn_date IS NOT NULL AND txn_date > '1971-01-01' AND user_id = 1
""", conn).iloc[0]['d']

inception = min(earliest_dep, earliest_txn)

# Combine flows
flows = pd.concat([deposits, divs], ignore_index=True).sort_values('date')

print(f"Cash flow rows  : {len(flows)}")
print(f"  Deposits      : {len(flows[flows.type=='DEPOSIT'])}")
print(f"  Withdrawals   : {len(flows[flows.type=='WITHDRAWAL'])}")
print(f"  Dividends     : {len(flows[flows.type=='DIVIDEND'])}")
print(f"Portfolio value : {current_val:,.2f}")
print(f"Inception date  : {inception}")
print()

# Now call the same XIRR solver the UI uses
# Build signed cash flows
cf_dates = []
cf_amounts = []
for _, row in flows.iterrows():
    amt = float(row['amount'])
    if amt == 0:
        continue
    cf_type = str(row['type']).upper()
    if cf_type == 'DEPOSIT':
        cf_amounts.append(-abs(amt))
    elif cf_type in ('DIVIDEND', 'WITHDRAWAL'):
        cf_amounts.append(abs(amt))
    else:
        continue
    cf_dates.append(pd.Timestamp(row['date']))

# Terminal value
cf_dates.append(pd.Timestamp.now())
cf_amounts.append(abs(current_val))

# Sort
pairs = sorted(zip(cf_dates, cf_amounts), key=lambda x: x[0])
cf_dates = [p[0] for p in pairs]
cf_amounts = [p[1] for p in pairs]

neg_total = sum(c for c in cf_amounts if c < 0)
pos_total = sum(c for c in cf_amounts if c > 0)
print(f"Total outflows (deposits)  : {neg_total:,.2f}")
print(f"Total inflows (divs+wd+MV) : {pos_total:,.2f}")
print(f"Net deposited (KWD)        : {abs(neg_total) - (pos_total - current_val):,.2f}")
print()

# XIRR solver (same as in ui.py)
t0 = cf_dates[0]
year_fracs = [(d - t0).days / 365.25 for d in cf_dates]

def npv(r):
    if r <= -1.0: return float('inf')
    return sum(a / ((1.0 + r) ** t) for a, t in zip(cf_amounts, year_fracs))

def d_npv(r):
    if r <= -1.0: return float('inf')
    return sum(-t * a / ((1.0 + r) ** (t + 1.0)) for a, t in zip(cf_amounts, year_fracs))

r = 0.10
converged = False
for _ in range(200):
    f = npv(r)
    fp = d_npv(r)
    if abs(fp) < 1e-14: break
    r_next = max(-0.9999, min(r - f / fp, 100.0))
    if abs(r_next - r) < 1e-10:
        if abs(npv(r_next)) < 0.01:
            converged = True
            r = r_next
        break
    r = r_next

if not converged:
    lo, hi = -0.9999, 10.0
    if npv(lo) * npv(hi) > 0:
        for test_hi in [20.0, 50.0, 100.0]:
            if npv(lo) * npv(test_hi) < 0:
                hi = test_hi; break
    for _ in range(1000):
        mid = (lo + hi) / 2.0
        if abs(npv(mid)) < 1e-8:
            r = mid; converged = True; break
        if npv(lo) * npv(mid) < 0: hi = mid
        else: lo = mid
    if not converged: r = mid

print(f"MWRR/IRR result: {r*100:.2f}%")
print(f"This should appear in the Overview tab under 'Money-Weighted Return (IRR)'")

conn.close()
