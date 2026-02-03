"""
Step 2 Audit: Transactions Table & Upload Logic
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

print('=' * 80)
print('STEP 2 AUDIT: TRANSACTIONS TABLE & UPLOAD LOGIC')
print('=' * 80)

# Check transactions table schema
print()
print('1. TRANSACTIONS TABLE SCHEMA:')
print('-' * 80)
cur.execute('PRAGMA table_info(transactions)')
cols_info = cur.fetchall()
col_names = []
for col in cols_info:
    col_names.append(col[1])
    print(f'  {col[1]:25} | {col[2]:15} | NULL={col[3]} | Default={col[4]}')

# Check if source/is_deleted columns exist
print()
print('2. KEY COLUMNS CHECK:')
print('-' * 80)
print(f'  source column exists:           {"source" in col_names}')
print(f'  source_reference column exists: {"source_reference" in col_names}')
print(f'  is_deleted column exists:       {"is_deleted" in col_names}')
print(f'  deleted_at column exists:       {"deleted_at" in col_names}')

# Check portfolio_transactions schema for comparison
print()
print('3. PORTFOLIO_TRANSACTIONS TABLE SCHEMA (unified):')
print('-' * 80)
cur.execute('PRAGMA table_info(portfolio_transactions)')
for col in cur.fetchall():
    print(f'  {col[1]:25} | {col[2]:15} | NULL={col[3]} | Default={col[4]}')

# Check distinct sources in transactions
print()
print('4. DISTINCT SOURCES IN transactions:')
print('-' * 80)
if 'source' in col_names:
    cur.execute('SELECT DISTINCT source FROM transactions WHERE source IS NOT NULL')
    rows = cur.fetchall()
    if rows:
        for row in rows:
            print(f'  {row[0]}')
    else:
        print('  No source values found (all NULL)')
else:
    print('  source column does not exist')

# Check current upload behavior
print()
print('5. SAMPLE TRANSACTIONS (last 5):')
print('-' * 80)
sample_cols = 'id, stock_symbol, txn_type, shares, txn_date'
if 'source' in col_names:
    sample_cols += ', source'
if 'is_deleted' in col_names:
    sample_cols += ', is_deleted'
cur.execute(f'SELECT {sample_cols} FROM transactions WHERE user_id = 2 ORDER BY id DESC LIMIT 5')
print(f'  Columns: {sample_cols}')
for row in cur.fetchall():
    print(f'  {row}')

conn.close()
print()
print('=' * 80)
print('AUDIT COMPLETE')
print('=' * 80)
