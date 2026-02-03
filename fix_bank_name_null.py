"""Make bank_name nullable in cash_deposits table."""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

print('Recreating cash_deposits table with bank_name as NULL...')

# Check if backup exists and drop it
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cash_deposits_backup'")
if cur.fetchone():
    cur.execute('DROP TABLE cash_deposits_backup')

# 1. Rename existing table to backup
cur.execute('ALTER TABLE cash_deposits RENAME TO cash_deposits_backup')

# 2. Create new table with bank_name as NULL (not NOT NULL)
cur.execute('''
    CREATE TABLE cash_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_name TEXT,
        deposit_date TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        comments TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        portfolio TEXT DEFAULT 'KFH',
        include_in_analysis INTEGER DEFAULT 1,
        currency TEXT DEFAULT 'KWD',
        user_id INTEGER,
        source TEXT,
        notes TEXT,
        source_reference TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        deleted_by INTEGER,
        fx_rate_at_deposit REAL DEFAULT 1.0
    )
''')

# 3. Copy existing data
cur.execute('INSERT INTO cash_deposits SELECT * FROM cash_deposits_backup')
copied = cur.rowcount
print(f'Copied {copied} rows')

# 4. Drop backup
cur.execute('DROP TABLE cash_deposits_backup')

conn.commit()
print('Done! bank_name is now nullable')

# Verify
cur.execute('PRAGMA table_info(cash_deposits)')
print('\nNew schema:')
print(f"{'Column':<20} {'Type':<10} {'NotNull':<8} Default")
print('-'*55)
for c in cur.fetchall():
    notnull = "REQUIRED" if c[3] == 1 else "optional"
    print(f"{c[1]:<20} {c[2]:<10} {notnull:<10} {c[4]}")

conn.close()
