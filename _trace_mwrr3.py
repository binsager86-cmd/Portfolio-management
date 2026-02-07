"""Trace MWRR: no user_id filter to match what actually works."""
import sqlite3, pandas as pd, os
_dir = os.path.dirname(os.path.abspath(__file__))
conn = sqlite3.connect(os.path.join(_dir, "portfolio.db"))
out = []

# Check user_id values
out.append("USER_ID VALUES IN TABLES:")
for tbl in ['cash_deposits', 'transactions', 'portfolio_snapshots']:
    try:
        r = pd.read_sql(f"SELECT DISTINCT user_id FROM {tbl}", conn)
        out.append(f"  {tbl}: {list(r['user_id'])}")
    except Exception as e:
        out.append(f"  {tbl}: ERROR - {e}")

out.append("\n" + "="*70)
out.append("COMPONENT 1: cash_deposits (deposits + withdrawals)")
out.append("="*70)
c1 = pd.read_sql("""
    SELECT deposit_date as date, amount,
           COALESCE(currency,'KWD') as currency,
           CASE WHEN amount >= 0 THEN 'DEPOSIT' ELSE 'WITHDRAWAL' END as type
    FROM cash_deposits
    WHERE deposit_date IS NOT NULL AND amount != 0
    AND deposit_date > '1971-01-01'
    AND (include_in_analysis = 1 OR include_in_analysis IS NULL)
    AND (is_deleted IS NULL OR is_deleted = 0)
""", conn)
wd = c1['type'] == 'WITHDRAWAL'
c1.loc[wd, 'amount'] = c1.loc[wd, 'amount'].abs()
usd = c1['currency'].str.upper() == 'USD'
c1.loc[usd, 'amount'] = c1.loc[usd, 'amount'] * 0.307
c1 = c1.drop(columns=['currency'])
out.append(f"  Rows: {len(c1)}  (dep={len(c1[c1.type=='DEPOSIT'])}, wd={len(c1[c1.type=='WITHDRAWAL'])})")
out.append(f"  Deposit total: {c1.loc[c1.type=='DEPOSIT','amount'].sum():,.2f}")
out.append(f"  Withdrawal total: {c1.loc[c1.type=='WITHDRAWAL','amount'].sum():,.2f}")

out.append("\n" + "="*70)
out.append("COMPONENT 2: cash_dividends_only")
out.append("="*70)
c2 = pd.read_sql("""
    SELECT txn_date as date, COALESCE(cash_dividend,0) as amount, 'DIVIDEND' as type
    FROM transactions
    WHERE COALESCE(cash_dividend,0) > 0
    AND txn_date IS NOT NULL AND txn_date > '1971-01-01'
    AND (is_deleted IS NULL OR is_deleted = 0)
""", conn)
out.append(f"  Rows: {len(c2)}  Total: {c2['amount'].sum():,.2f}")
if not c2.empty:
    out.append(c2.to_string(index=False))

out.append("\n" + "="*70)
out.append("COMPONENT 3: withdrawals (Withdrawal/FLOW_OUT from transactions)")
out.append("="*70)
try:
    c3 = pd.read_sql("""
        SELECT txn_date as date, sell_value as amount, 'WITHDRAWAL' as type
        FROM transactions WHERE (txn_type = 'Withdrawal' OR category = 'FLOW_OUT')
    """, conn)
except: c3 = pd.DataFrame()
out.append(f"  Rows: {len(c3)}")
if not c3.empty: out.append(c3.to_string(index=False))

out.append("\n" + "="*70)
out.append("COMPONENT 4: ledger_deposits (Deposit/FLOW_IN from transactions)")
out.append("="*70)
try:
    c4 = pd.read_sql("""
        SELECT txn_date as date, purchase_cost as amount, 'DEPOSIT' as type
        FROM transactions WHERE (txn_type = 'Deposit' OR category = 'FLOW_IN')
    """, conn)
except: c4 = pd.DataFrame()
out.append(f"  Rows: {len(c4)}")
if not c4.empty: out.append(c4.to_string(index=False))

out.append("\n" + "="*70)
out.append("COMPONENT 5+6: transfers_in / transfers_out")
out.append("="*70)
try:
    c5 = pd.read_sql("SELECT txn_type, txn_date, purchase_cost, sell_value FROM transactions WHERE txn_type IN ('Transfer In','Transfer Out')", conn)
except: c5 = pd.DataFrame()
out.append(f"  Rows: {len(c5)}")
if not c5.empty: out.append(c5.to_string(index=False))

# Combine
parts = [df for df in [c1, c2, c3, c4] if not df.empty]
combined = pd.concat(parts, ignore_index=True).sort_values('date') if parts else pd.DataFrame(columns=['date','amount','type'])

out.append("\n" + "="*70)
out.append("COMBINED CASH FLOWS")
out.append("="*70)
out.append(f"Total rows: {len(combined)}")
for t in ['DEPOSIT','WITHDRAWAL','DIVIDEND']:
    sub = combined[combined.type == t]
    out.append(f"  {t:12s}: {len(sub):3d} rows, total = {sub['amount'].sum():>12,.2f}")

snap = pd.read_sql('SELECT portfolio_value FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1', conn)
pv = float(snap.iloc[0]['portfolio_value'])
out.append(f"\nPortfolio value: {pv:,.2f}")

# XIRR with all components
cf_dates = []; cf_amounts = []
for _, row in combined.iterrows():
    amt = float(row['amount'])
    if amt == 0: continue
    ct = str(row['type']).upper()
    if ct == 'DEPOSIT': cf_amounts.append(-abs(amt))
    elif ct in ('DIVIDEND','WITHDRAWAL'): cf_amounts.append(abs(amt))
    else: continue
    cf_dates.append(pd.Timestamp(row['date']))
cf_dates.append(pd.Timestamp.now()); cf_amounts.append(abs(pv))
pairs = sorted(zip(cf_dates, cf_amounts), key=lambda x: x[0])
# same-day combine
cd2=[]; ca2=[]; prev=None; run=0.0
for dt,a in pairs:
    if prev is None: prev,run=dt,a
    elif dt==prev: run+=a
    else: cd2.append(prev);ca2.append(run);prev,run=dt,a
if prev: cd2.append(prev);ca2.append(run)
cf_dates,cf_amounts=cd2,ca2
t0=cf_dates[0]; yf=[(d-t0).days/365.25 for d in cf_dates]

def npv(r):
    if r<=-1.0: return float('inf')
    return sum(a/((1.0+r)**t) for a,t in zip(cf_amounts,yf))
def dnpv(r):
    if r<=-1.0: return float('inf')
    return sum(-t*a/((1.0+r)**(t+1.0)) for a,t in zip(cf_amounts,yf))

r=0.10;conv=False
for _ in range(200):
    f=npv(r);fp=dnpv(r)
    if abs(fp)<1e-14:break
    rn=max(-0.9999,min(r-f/fp,100.0))
    if abs(rn-r)<1e-10:
        if abs(npv(rn))<0.01:conv=True;r=rn
        break
    r=rn
if not conv:
    lo,hi=-0.9999,10.0
    if npv(lo)*npv(hi)>0:
        for th in [20,50,100]:
            if npv(lo)*npv(th)<0:hi=th;break
    for _ in range(1000):
        mid=(lo+hi)/2.0
        if abs(npv(mid))<1e-8:r=mid;conv=True;break
        if npv(lo)*npv(mid)<0:hi=mid
        else:lo=mid
    if not conv:r=mid

out.append(f"\n>>> XIRR ALL components (deposits+divs+wd) = {r*100:.4f}% <<<")

# Without dividends
cf3d=[]; cf3a=[]
for _, row in c1.iterrows():
    amt=float(row['amount']);ct=str(row['type']).upper()
    if amt==0:continue
    if ct=='DEPOSIT':cf3a.append(-abs(amt))
    elif ct=='WITHDRAWAL':cf3a.append(abs(amt))
    else:continue
    cf3d.append(pd.Timestamp(row['date']))
cf3d.append(pd.Timestamp.now());cf3a.append(abs(pv))
p3=sorted(zip(cf3d,cf3a),key=lambda x:x[0])
cf3d=[p[0] for p in p3];cf3a=[p[1] for p in p3]
t0b=cf3d[0];yf3=[(d-t0b).days/365.25 for d in cf3d]
def npv3(r):
    if r<=-1.0:return float('inf')
    return sum(a/((1.0+r)**t) for a,t in zip(cf3a,yf3))
r3=0.10
for _ in range(200):
    f=npv3(r3);fp=sum(-t*a/((1.0+r3)**(t+1.0)) for a,t in zip(cf3a,yf3))
    if abs(fp)<1e-14:break
    rn=max(-0.9999,min(r3-f/fp,100.0))
    if abs(rn-r3)<1e-10:r3=rn;break
    r3=rn
out.append(f">>> XIRR deposits-only (no dividends) = {r3*100:.4f}% <<<")

result = "\n".join(out)
with open(os.path.join(_dir, "_mwrr_trace_output.txt"), "w") as f:
    f.write(result)
print(result)
conn.close()
