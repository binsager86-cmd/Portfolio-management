import sqlite3
import pandas as pd
from datetime import date

conn = sqlite3.connect('portfolio.db')
user_id = 2

print('=== Simulating UI MWRR Code Path ===')

# 0. Portfolio History (critical for MWRR)
portfolio_history = pd.read_sql_query('''
    SELECT snapshot_date as date, portfolio_value as balance, accumulated_cash 
    FROM portfolio_snapshots 
    WHERE user_id = ? 
    ORDER BY snapshot_date
''', conn, params=(user_id,))
print(f'Portfolio History: {len(portfolio_history)} rows')
if not portfolio_history.empty:
    print(f'  First: date={portfolio_history.iloc[0]["date"]}, balance={portfolio_history.iloc[0]["balance"]}, acc_cash={portfolio_history.iloc[0]["accumulated_cash"]}')
    print(f'  Last: date={portfolio_history.iloc[-1]["date"]}, balance={portfolio_history.iloc[-1]["balance"]}, acc_cash={portfolio_history.iloc[-1]["accumulated_cash"]}')

# 1. Cash Deposits for MWRR
cash_deposits_for_mwrr = pd.read_sql_query('''
    SELECT deposit_date as date, 
           amount, 
           'DEPOSIT' as type 
    FROM cash_deposits 
    WHERE deposit_date IS NOT NULL
    AND amount > 0
    AND deposit_date > '1971-01-01'
    AND user_id = ?
''', conn, params=(user_id,))
print(f'Cash Deposits for MWRR: {len(cash_deposits_for_mwrr)} rows')

# 2. Cash Dividends Only
cash_dividends_only = pd.read_sql_query('''
    SELECT txn_date as date, 
           COALESCE(cash_dividend, 0) as amount, 
           'DIVIDEND' as type 
    FROM transactions 
    WHERE COALESCE(cash_dividend, 0) > 0
    AND txn_date IS NOT NULL
    AND txn_date > '1971-01-01'
    AND user_id = ?
''', conn, params=(user_id,))
print(f'Cash Dividends Only: {len(cash_dividends_only)} rows')

# Combine for MWRR
mwrr_components = []
if not cash_deposits_for_mwrr.empty:
    mwrr_components.append(cash_deposits_for_mwrr)
if not cash_dividends_only.empty:
    mwrr_components.append(cash_dividends_only)

if mwrr_components:
    cash_flows_mwrr = pd.concat(mwrr_components, ignore_index=True).sort_values('date')
else:
    cash_flows_mwrr = pd.DataFrame(columns=['date', 'amount', 'type'])

print(f'Combined cash_flows_mwrr: {len(cash_flows_mwrr)} rows')
print(f'cash_flows_mwrr.empty = {cash_flows_mwrr.empty}')

# Get values like UI does
if not portfolio_history.empty:
    inception_date = pd.to_datetime(portfolio_history.iloc[0]['date']).date()
    current_portfolio_value = portfolio_history.iloc[-1]['balance']
else:
    inception_date = date.today()
    current_portfolio_value = 0

print(f'\ninception_date = {inception_date}')
print(f'current_portfolio_value = {current_portfolio_value}')

# Call calculate_mwrr like the UI does
print('\n=== Calling calculate_mwrr ===')

# Import the actual function from ui.py
import sys
sys.path.insert(0, '.')

# Simplified version of calculate_mwrr to debug
def calculate_mwrr_debug(cash_flows, current_value, start_date):
    print(f'  cash_flows.empty = {cash_flows.empty}')
    print(f'  current_value = {current_value}')
    print(f'  current_value > 0: {current_value > 0}')
    
    if current_value is None or current_value <= 0:
        print('  FAIL: current_value <= 0')
        return None
    
    cf_dates = []
    cf_amounts = []
    
    if not cash_flows.empty:
        cash_flows = cash_flows.copy()
        cash_flows['date'] = pd.to_datetime(cash_flows['date'])
        
        for _, row in cash_flows.iterrows():
            cf_date = pd.to_datetime(row['date'])
            amount = float(row['amount'])
            cf_type = str(row['type']).upper()
            
            if amount == 0:
                continue
            
            if cf_type == 'DEPOSIT':
                cf_value = -abs(amount)
            elif cf_type in ['DIVIDEND', 'WITHDRAWAL']:
                cf_value = abs(amount)
            else:
                continue
            
            cf_dates.append(cf_date)
            cf_amounts.append(cf_value)
    
    # Add final portfolio value
    today = pd.Timestamp.now()
    cf_dates.append(today)
    cf_amounts.append(abs(current_value))
    
    print(f'  Total cf after adding final value: {len(cf_dates)}')
    
    if len(cf_dates) < 2:
        print('  FAIL: len(cf_dates) < 2')
        return None
    
    has_negative = any(cf < 0 for cf in cf_amounts)
    has_positive = any(cf > 0 for cf in cf_amounts)
    
    print(f'  has_negative = {has_negative}')
    print(f'  has_positive = {has_positive}')
    
    if not (has_negative and has_positive):
        print('  FAIL: not (has_negative and has_positive)')
        return None
    
    # Sort
    sorted_pairs = sorted(zip(cf_dates, cf_amounts), key=lambda x: x[0])
    cf_dates = [x[0] for x in sorted_pairs]
    cf_amounts = [x[1] for x in sorted_pairs]
    
    # Combine same-day
    combined_dates = []
    combined_amounts = []
    current_date = None
    current_sum = 0.0
    
    for dt, amt in zip(cf_dates, cf_amounts):
        if current_date is None:
            current_date = dt
            current_sum = amt
        elif dt == current_date:
            current_sum += amt
        else:
            combined_dates.append(current_date)
            combined_amounts.append(current_sum)
            current_date = dt
            current_sum = amt
    
    if current_date is not None:
        combined_dates.append(current_date)
        combined_amounts.append(current_sum)
    
    cf_dates = combined_dates
    cf_amounts = combined_amounts
    
    print(f'  After combining same-day: {len(cf_dates)} flows')
    
    t0 = cf_dates[0]
    
    def year_frac(dt):
        days = (dt - t0).days
        return days / 365.25
    
    def npv(rate):
        if rate <= -1.0:
            return float('inf')
        total = 0.0
        for cf, dt in zip(cf_amounts, cf_dates):
            tau = year_frac(dt)
            total += cf / ((1 + rate) ** tau)
        return total
    
    def d_npv(rate):
        if rate <= -1.0:
            return float('inf')
        total = 0.0
        for cf, dt in zip(cf_amounts, cf_dates):
            tau = year_frac(dt)
            total += -tau * cf / ((1 + rate) ** (tau + 1))
        return total
    
    # Newton-Raphson
    r = 0.10
    max_iterations = 100
    tolerance = 1e-8
    
    for iteration in range(max_iterations):
        f = npv(r)
        fp = d_npv(r)
        
        if abs(fp) < 1e-12:
            print(f'  FAIL: derivative too small at iteration {iteration}')
            break
        
        r_next = r - f / fp
        
        if r_next < -0.999:
            r_next = -0.95
        if r_next > 20:
            r_next = 10.0
        
        if abs(r_next - r) < tolerance:
            final_npv = abs(npv(r_next))
            print(f'  Converged at iteration {iteration}, r={r_next:.4f}, final_npv={final_npv}')
            if final_npv < 0.1:
                print(f'  SUCCESS: MWRR = {r_next * 100:.2f}%')
                return r_next
            else:
                print(f'  FAIL: final_npv too large ({final_npv})')
            break
        
        r = r_next
    
    # Try scipy
    try:
        from scipy.optimize import newton
        r_scipy = newton(npv, x0=0.1, maxiter=200, tol=1e-8)
        if abs(npv(r_scipy)) < 0.1 and -0.999 < r_scipy < 20:
            print(f'  SUCCESS via scipy: MWRR = {r_scipy * 100:.2f}%')
            return r_scipy
    except Exception as e:
        print(f'  scipy failed: {e}')
    
    # Last resort
    final_npv = abs(npv(r))
    if final_npv < 1.0 and -0.99 < r < 20:
        print(f'  SUCCESS (relaxed): MWRR = {r * 100:.2f}%')
        return r
    
    print('  FAIL: Did not converge')
    return None

result = calculate_mwrr_debug(cash_flows_mwrr, current_portfolio_value, inception_date)
print(f'\nFinal Result: {result}')
if result:
    print(f'MWRR = {result * 100:.2f}%')
else:
    print('MWRR = N/A')

conn.close()

# 2. Cash Dividends
df2 = pd.read_sql_query('''
    SELECT txn_date as date, cash_dividend as amount, 'DIVIDEND' as type 
    FROM transactions 
    WHERE cash_dividend > 0
    AND txn_date IS NOT NULL
    AND txn_date > '1971-01-01'
    AND user_id = 2
''', conn)
print(f'Cash Dividends: {len(df2)} rows, Sum: {df2["amount"].sum() if not df2.empty else 0}')

# 3. Portfolio snapshots
df3 = pd.read_sql_query('''
    SELECT snapshot_date, portfolio_value, accumulated_cash 
    FROM portfolio_snapshots 
    WHERE user_id = 2 
    ORDER BY snapshot_date DESC 
    LIMIT 1
''', conn)
if not df3.empty:
    print(f'Latest Snapshot: Date={df3.iloc[0]["snapshot_date"]}, Value={df3.iloc[0]["portfolio_value"]}, AccCash={df3.iloc[0]["accumulated_cash"]}')
else:
    print('No snapshots!')

print()
print('=== Cash Flow Signs Check ===')
total_deposits = df['amount'].sum() if not df.empty else 0
total_dividends = df2['amount'].sum() if not df2.empty else 0
current_value = df3.iloc[0]['portfolio_value'] if not df3.empty else 0

print(f'Total Deposits (should be negative in IRR): -{total_deposits}')
print(f'Total Cash Dividends (positive in IRR): +{total_dividends}')
print(f'Current Portfolio Value (positive in IRR): +{current_value}')

# Check for xirr calculation
print()
print('=== Simulating MWRR Calculation ===')

try:
    from scipy import optimize
    
    # Combine cash flows
    all_flows = []
    
    # Deposits are negative (money invested)
    for _, row in df.iterrows():
        all_flows.append({'date': row['date'], 'amount': -row['amount']})
    
    # Dividends are positive (money received)
    for _, row in df2.iterrows():
        all_flows.append({'date': row['date'], 'amount': row['amount']})
    
    # Add current portfolio value as final positive cash flow
    if not df3.empty:
        all_flows.append({'date': df3.iloc[0]['snapshot_date'], 'amount': df3.iloc[0]['portfolio_value']})
    
    flows_df = pd.DataFrame(all_flows)
    if not flows_df.empty:
        flows_df['date'] = pd.to_datetime(flows_df['date'])
        flows_df = flows_df.sort_values('date')
        
        print(f'Total cash flows: {len(flows_df)}')
        print(f'Date range: {flows_df["date"].min()} to {flows_df["date"].max()}')
        print(f'Negative flows (deposits): {(flows_df["amount"] < 0).sum()}')
        print(f'Positive flows (div+value): {(flows_df["amount"] > 0).sum()}')
        print()
        print('First 10 flows:')
        print(flows_df.head(10).to_string())
        print()
        print('Last 5 flows:')
        print(flows_df.tail(5).to_string())
        
        # Try to compute XIRR
        def xnpv(rate, dates, amounts):
            d0 = dates.iloc[0]
            return sum(a / (1 + rate) ** ((d - d0).days / 365.0) for d, a in zip(dates, amounts))
        
        try:
            result = optimize.brentq(lambda r: xnpv(r, flows_df['date'], flows_df['amount']), -0.999, 10)
            print(f'\nMWRR Result: {result * 100:.2f}%')
        except Exception as e:
            print(f'\nMWRR Calculation failed: {e}')
            
            # Check signs
            neg_sum = flows_df[flows_df['amount'] < 0]['amount'].sum()
            pos_sum = flows_df[flows_df['amount'] > 0]['amount'].sum()
            print(f'Total negative: {neg_sum}')
            print(f'Total positive: {pos_sum}')
            if pos_sum + neg_sum > 0:
                print('Net positive (profit) - should have valid IRR')
            else:
                print('Net negative (loss) - may cause IRR calculation issues')
    else:
        print('No cash flows found!')
        
except ImportError:
    print('scipy not installed')

conn.close()
