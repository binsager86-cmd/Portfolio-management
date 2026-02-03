"""
Audit Current Deposit Storage - Step 1
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

print('=' * 80)
print('STEP 1: AUDIT CURRENT DEPOSIT STORAGE')
print('=' * 80)

# Query 1: Check tables with deposit-related columns
print()
print('QUERY 1: Tables/Columns with deposit-related names')
print('-' * 80)
cur.execute('''
    SELECT m.name as table_name, p.name as column_name
    FROM sqlite_master m
    JOIN pragma_table_info(m.name) p
    WHERE m.type = 'table' 
    AND (p.name LIKE '%deposit%' OR m.name LIKE '%deposit%')
    ORDER BY m.name, p.name
''')
rows = cur.fetchall()
if rows:
    for row in rows:
        print(f'  {row[0]:30} | {row[1]}')
else:
    print('  No columns found with deposit in name')

# Query 2: Check deposits in portfolio_transactions
print()
print('QUERY 2: Deposits in portfolio_transactions (by source)')
print('-' * 80)
cur.execute('''
    SELECT 
        COUNT(*) as total_deposits,
        COALESCE(SUM(amount), 0) as total_amount,
        source
    FROM portfolio_transactions 
    WHERE txn_type = 'DEPOSIT'
    GROUP BY source
''')
rows = cur.fetchall()
if rows:
    print(f'  {"Count":>8} | {"Total Amount":>15} | Source')
    print('  ' + '-' * 45)
    for row in rows:
        print(f'  {row[0]:>8} | {row[1]:>15,.2f} | {row[2]}')
else:
    print('  No DEPOSIT records found in portfolio_transactions')

# Query 3: Check for deleted deposits
print()
print('QUERY 3: Deleted deposits (is_deleted = 1)')
print('-' * 80)
cur.execute('''
    SELECT id, txn_type, amount, source, txn_date, is_deleted
    FROM portfolio_transactions 
    WHERE txn_type = 'DEPOSIT' 
    AND is_deleted = 1
    ORDER BY id DESC
    LIMIT 10
''')
rows = cur.fetchall()
if rows:
    for row in rows:
        print(f'  ID={row[0]} Type={row[1]} Amount={row[2]:,.2f} Source={row[3]} Date={row[4]}')
else:
    print('  No deleted DEPOSIT records found - GOOD!')

# Query 4: Check cash_deposits table (legacy)
print()
print('QUERY 4: Legacy cash_deposits table')
print('-' * 80)
cur.execute('''
    SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total,
        portfolio,
        include_in_analysis
    FROM cash_deposits 
    WHERE user_id = 2
    GROUP BY portfolio, include_in_analysis
''')
rows = cur.fetchall()
if rows:
    for row in rows:
        print(f'  Count={row[0]} Total={row[1]:,.2f} Portfolio={row[2]} InAnalysis={row[3]}')
else:
    print('  No records in cash_deposits for user_id=2')

# Query 5: Deposit Totals Comparison
print()
print('QUERY 5: Deposit Totals Comparison')
print('-' * 80)

# From portfolio_transactions
cur.execute('SELECT COALESCE(SUM(amount), 0) FROM portfolio_transactions WHERE txn_type = "DEPOSIT" AND user_id = 2 AND (is_deleted = 0 OR is_deleted IS NULL)')
pt_total = cur.fetchone()[0]

# From cash_deposits
cur.execute('SELECT COALESCE(SUM(amount), 0) FROM cash_deposits WHERE user_id = 2 AND include_in_analysis = 1')
cd_total = cur.fetchone()[0]

# From portfolio_deposit_summary view
try:
    cur.execute('SELECT COALESCE(SUM(net_deposits), 0) FROM portfolio_deposit_summary WHERE user_id = 2')
    view_total = cur.fetchone()[0]
except Exception as e:
    view_total = None
    print(f'  View error: {e}')

print(f'  portfolio_transactions:    {pt_total:>15,.2f}')
print(f'  cash_deposits (analysis):  {cd_total:>15,.2f}')
if view_total is not None:
    print(f'  portfolio_deposit_summary: {view_total:>15,.2f}')

# Query 6: All deposit records with details
print()
print('QUERY 6: All DEPOSIT records in portfolio_transactions')
print('-' * 80)
cur.execute('''
    SELECT pt.id, p.name as portfolio, pt.amount, pt.source, pt.txn_date, pt.is_deleted, pt.source_reference
    FROM portfolio_transactions pt
    LEFT JOIN portfolios p ON pt.portfolio_id = p.id
    WHERE pt.txn_type = 'DEPOSIT' AND pt.user_id = 2
    ORDER BY pt.txn_date, pt.id
''')
rows = cur.fetchall()
if rows:
    print(f'  {"ID":>4} | Portfolio |       Amount | Source   | Date       | Del | Reference')
    print('  ' + '-' * 75)
    for row in rows:
        ref = (row[6] or '')[:20]
        print(f'  {row[0]:>4} | {row[1]:>9} | {row[2]:>12,.2f} | {row[3]:>8} | {row[4]} | {row[5] or 0:>3} | {ref}')
else:
    print('  No DEPOSIT records found')

# Query 7: Check what the view returns
print()
print('QUERY 7: portfolio_deposit_summary view details')
print('-' * 80)
try:
    cur.execute('SELECT * FROM portfolio_deposit_summary WHERE user_id = 2')
    rows = cur.fetchall()
    if rows:
        for row in rows:
            print(f'  {row}')
    else:
        print('  View returns no data for user_id=2')
except Exception as e:
    print(f'  Error querying view: {e}')

conn.close()
print()
print('=' * 80)
print('AUDIT COMPLETE')
print('=' * 80)
