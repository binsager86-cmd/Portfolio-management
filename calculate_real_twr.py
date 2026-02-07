"""
Calculate actual TWR from real portfolio data
Date range: First transaction → Today
"""
import sqlite3
import pandas as pd
from datetime import datetime

conn = sqlite3.connect('portfolio.db')

print('='*70)
print('CALCULATING ACTUAL TWR FROM YOUR PORTFOLIO DATA')
print('='*70)

# Get the earliest transaction date
first_txn = pd.read_sql("""
    SELECT MIN(txn_date) as first_date FROM transactions
""", conn).iloc[0]['first_date']

# Get earliest cash deposit date
first_deposit = pd.read_sql("""
    SELECT MIN(deposit_date) as first_date FROM cash_deposits
    WHERE (include_in_analysis = 1 OR include_in_analysis IS NULL)
      AND (is_deleted IS NULL OR is_deleted = 0)
""", conn).iloc[0]['first_date']

# Use the earlier of the two as the start date
if first_txn and first_deposit:
    inception_date = min(first_txn, first_deposit)
elif first_txn:
    inception_date = first_txn
else:
    inception_date = first_deposit

today_date = datetime.now().strftime('%Y-%m-%d')

print(f'First transaction: {first_txn}')
print(f'First cash deposit: {first_deposit}')
print(f'Inception date: {inception_date}')
print(f'End date (today): {today_date}')
print('')

# Load portfolio snapshots (daily market values)
daily_mv_df = pd.read_sql("""
    SELECT snapshot_date as date, portfolio_value as balance, accumulated_cash
    FROM portfolio_snapshots
    WHERE snapshot_date IS NOT NULL
    ORDER BY snapshot_date
""", conn)

print(f'Portfolio snapshots: {len(daily_mv_df)} records')
print(f'Snapshot date range: {daily_mv_df["date"].min()} to {daily_mv_df["date"].max()}')
if not daily_mv_df.empty:
    print(f'Starting value: {daily_mv_df["balance"].iloc[0]:,.2f}')
    print(f'Ending value: {daily_mv_df["balance"].iloc[-1]:,.2f}')
print('')

# Load cash deposits (external flows)
cash_deposits_df = pd.read_sql("""
    SELECT deposit_date, amount, currency, portfolio
    FROM cash_deposits
    WHERE (include_in_analysis = 1 OR include_in_analysis IS NULL)
      AND (is_deleted IS NULL OR is_deleted = 0)
    ORDER BY deposit_date
""", conn)

print(f'Cash deposits: {len(cash_deposits_df)} records')
print(f'Total deposited: {cash_deposits_df["amount"].sum():,.2f}')
print(f'Deposit date range: {cash_deposits_df["deposit_date"].min()} to {cash_deposits_df["deposit_date"].max()}')
print('')

conn.close()

# ============================================================
# CALCULATE TWR USING GIPS-COMPLIANT METHOD
# Date Range: Inception → Today
# ============================================================
print('='*70)
print('TWR CALCULATION (GIPS Compliant)')
print('='*70)

# Prepare data
daily_mv = daily_mv_df.copy()
daily_mv['date'] = pd.to_datetime(daily_mv['date'])
daily_mv = daily_mv.sort_values('date').reset_index(drop=True)

# Use inception date and today as period boundaries
start_date = pd.Timestamp(inception_date)
end_date = pd.Timestamp(today_date)

# Check if we have snapshot data covering this range
snapshot_start = daily_mv['date'].min()
snapshot_end = daily_mv['date'].max()

print(f'Requested period: {start_date.date()} to {end_date.date()}')
print(f'Snapshot coverage: {snapshot_start.date()} to {snapshot_end.date()}')

# Adjust start date if snapshots don't go back far enough
if start_date < snapshot_start:
    print(f'⚠️ Snapshots start later than first transaction.')
    print(f'   TWR will be calculated from {snapshot_start.date()} (first available snapshot)')
    start_date = snapshot_start

# Adjust end date to latest available snapshot
if end_date > snapshot_end:
    print(f'⚠️ Today is after last snapshot. Using {snapshot_end.date()} as end date.')
    end_date = snapshot_end

print(f'Actual calculation period: {start_date.date()} to {end_date.date()}')
print('')

# Consolidate external flows from cash_deposits
external_flows = []
if not cash_deposits_df.empty:
    cd_df = cash_deposits_df.copy()
    cd_df['_ts'] = pd.to_datetime(cd_df['deposit_date'])
    
    for _, row in cd_df.iterrows():
        flow_ts = row['_ts']
        if flow_ts < start_date or flow_ts > end_date:
            continue
        flow_amount = float(row.get('amount', 0) or 0)
        if abs(flow_amount) < 0.01:
            continue
        # All cash deposits are positive inflows
        external_flows.append({
            'timestamp': flow_ts,
            'amount': abs(flow_amount),
            'source': 'cash_deposits'
        })

print(f'External flows in period: {len(external_flows)}')

# Build subperiod boundaries
external_flows.sort(key=lambda x: x['timestamp'])

boundaries = [start_date]
for flow in external_flows:
    flow_date = pd.Timestamp(flow['timestamp'].date())
    if start_date < flow_date < end_date:
        boundaries.append(flow_date)
boundaries.append(end_date)
boundaries = sorted(set(boundaries))

print(f'Subperiods: {len(boundaries) - 1}')
print('')

# Calculate subperiod returns
subperiod_returns = []
subperiod_details = []

for i in range(len(boundaries) - 1):
    t_begin = boundaries[i]
    t_end = boundaries[i + 1]
    
    # Get MV at beginning
    mv_begin_rows = daily_mv[daily_mv['date'] <= t_begin]
    mv_begin_val = float(mv_begin_rows.iloc[-1]['balance']) if not mv_begin_rows.empty else float(daily_mv.iloc[0]['balance'])
    
    # Get MV at end
    mv_end_rows = daily_mv[daily_mv['date'] <= t_end]
    if mv_end_rows.empty:
        continue
    mv_end_val = float(mv_end_rows.iloc[-1]['balance'])
    
    # Sum flows during this subperiod
    cf_net = 0.0
    for flow in external_flows:
        flow_date = pd.Timestamp(flow['timestamp'].date())
        if t_begin < flow_date <= t_end:
            cf_net += flow['amount']
    
    # GIPS midpoint weighting
    weighted_cf = cf_net * 0.5
    denominator = mv_begin_val + weighted_cf
    
    if abs(denominator) < 0.01:
        subperiod_return = 0.0
    else:
        subperiod_return = (mv_end_val - mv_begin_val - cf_net) / denominator
    
    subperiod_returns.append(subperiod_return)
    subperiod_details.append({
        'start': str(t_begin.date()),
        'end': str(t_end.date()),
        'mv_begin': mv_begin_val,
        'mv_end': mv_end_val,
        'net_flow': cf_net,
        'return_pct': subperiod_return * 100
    })

# Geometric linking
twr_factor = 1.0
for r in subperiod_returns:
    twr_factor *= (1.0 + r)
twr_decimal = twr_factor - 1.0

print('='*70)
print('SUBPERIOD BREAKDOWN')
print('='*70)
for i, sp in enumerate(subperiod_details[:10]):  # Show first 10
    print(f'Period {i+1}: {sp["start"]} → {sp["end"]}')
    print(f'  MV Begin: {sp["mv_begin"]:,.2f}')
    print(f'  MV End: {sp["mv_end"]:,.2f}')
    print(f'  Net Flow: {sp["net_flow"]:,.2f}')
    print(f'  Return: {sp["return_pct"]:.2f}%')
    print('')

if len(subperiod_details) > 10:
    print(f'... and {len(subperiod_details) - 10} more subperiods')
    print('')

print('='*70)
print('FINAL TWR RESULT')
print('='*70)
print(f'Time-Weighted Return (TWR): {twr_decimal * 100:.2f}%')
print(f'Total subperiods: {len(subperiod_returns)}')
print(f'External flows detected: {len(external_flows)}')
print(f'Methodology: GIPS daily rebalanced with midpoint weighting')
print('')

# Also calculate simple return for comparison
simple_return = (daily_mv['balance'].iloc[-1] - daily_mv['balance'].iloc[0]) / daily_mv['balance'].iloc[0]
print(f'Simple Return (for reference): {simple_return * 100:.2f}%')
print(f'  (Simple return is distorted by cash flows - TWR is the accurate manager performance)')
