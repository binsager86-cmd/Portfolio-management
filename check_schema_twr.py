"""
Schema introspection for TWR validation
"""
import sqlite3
import pandas as pd

conn = sqlite3.connect('portfolio.db')

print('='*70)
print('STEP 1A: Introspect transactions table schema')
print('='*70)

# Get all columns from transactions table
cursor = conn.execute("SELECT name, type FROM pragma_table_info('transactions') ORDER BY cid")
columns = cursor.fetchall()

print('All columns in transactions table:')
for col_name, col_type in columns:
    print(f'  {col_name}: {col_type}')

# Check for TWR-related columns
twr_related = [c for c, t in columns if any(x in c.lower() for x in ['return', 'twr', 'performance', 'gain', 'profit'])]
print(f'')
print(f'TWR/Return related columns found: {twr_related if twr_related else "NONE"}')

print('')
print('='*70)
print('STEP 1B: Check transaction types and date ranges')
print('='*70)

# Get distinct transaction types
types_df = pd.read_sql('SELECT DISTINCT txn_type FROM transactions ORDER BY txn_type', conn)
print('Transaction types in database:')
for t in types_df['txn_type'].tolist():
    print(f'  - {t}')

# Get date range and counts by type
stats_df = pd.read_sql("""
    SELECT 
        txn_type,
        COUNT(*) as count,
        MIN(txn_date) as earliest,
        MAX(txn_date) as latest
    FROM transactions
    WHERE txn_date IS NOT NULL
    GROUP BY txn_type
    ORDER BY count DESC
""", conn)
print('')
print('Transaction stats by type:')
print(stats_df.to_string(index=False))

print('')
print('='*70)
print('STEP 1C: Check cash_deposits table')
print('='*70)

# Check if cash_deposits table exists and its structure
try:
    cd_columns = conn.execute("SELECT name, type FROM pragma_table_info('cash_deposits') ORDER BY cid").fetchall()
    print('cash_deposits table columns:')
    for col_name, col_type in cd_columns:
        print(f'  {col_name}: {col_type}')
    
    cd_stats = pd.read_sql("""
        SELECT 
            COUNT(*) as count,
            MIN(deposit_date) as earliest,
            MAX(deposit_date) as latest,
            SUM(amount) as total_amount
        FROM cash_deposits
        WHERE deposit_date IS NOT NULL
    """, conn)
    print('')
    print('Cash deposits stats:')
    print(cd_stats.to_string(index=False))
except Exception as e:
    print(f'cash_deposits table error: {e}')

print('')
print('='*70)
print('STEP 1D: Check portfolio_snapshots (daily MV source)')
print('='*70)

try:
    snap_columns = conn.execute("SELECT name, type FROM pragma_table_info('portfolio_snapshots') ORDER BY cid").fetchall()
    print('portfolio_snapshots table columns:')
    for col_name, col_type in snap_columns:
        print(f'  {col_name}: {col_type}')
    
    snap_stats = pd.read_sql("""
        SELECT 
            COUNT(*) as count,
            MIN(snapshot_date) as earliest,
            MAX(snapshot_date) as latest,
            AVG(portfolio_value) as avg_value
        FROM portfolio_snapshots
        WHERE snapshot_date IS NOT NULL
    """, conn)
    print('')
    print('Snapshot stats:')
    print(snap_stats.to_string(index=False))
except Exception as e:
    print(f'portfolio_snapshots table error: {e}')

print('')
print('='*70)
print('STEP 2: Check for Deposit/Withdrawal transactions')
print('='*70)

# Check deposit/withdrawal transactions specifically
dep_with_df = pd.read_sql("""
    SELECT 
        txn_type,
        COUNT(*) as count,
        SUM(COALESCE(purchase_cost, 0) + COALESCE(sell_value, 0)) as total_amount
    FROM transactions
    WHERE LOWER(txn_type) IN ('deposit', 'withdrawal')
    GROUP BY txn_type
""", conn)
print('Deposit/Withdrawal in transactions table:')
print(dep_with_df.to_string(index=False) if not dep_with_df.empty else '  NONE FOUND')

print('')
print('='*70)
print('STEP 3: Sample external flows for TWR')
print('='*70)

# Show sample external flows
print('Sample from cash_deposits:')
try:
    sample_cd = pd.read_sql("SELECT deposit_date, amount, currency, portfolio FROM cash_deposits ORDER BY deposit_date DESC LIMIT 5", conn)
    print(sample_cd.to_string(index=False))
except:
    print('  No data')

print('')
print('Sample Deposit/Withdrawal from transactions:')
try:
    sample_txn = pd.read_sql("""
        SELECT txn_date, txn_type, purchase_cost, sell_value, portfolio 
        FROM transactions 
        WHERE LOWER(txn_type) IN ('deposit', 'withdrawal')
        ORDER BY txn_date DESC 
        LIMIT 5
    """, conn)
    print(sample_txn.to_string(index=False) if not sample_txn.empty else '  NONE FOUND')
except Exception as e:
    print(f'  Error: {e}')

conn.close()
print('')
print('='*70)
print('SCHEMA INTROSPECTION COMPLETE')
print('='*70)
