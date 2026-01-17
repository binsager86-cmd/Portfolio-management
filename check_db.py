#!/usr/bin/env python3
"""Quick script to check database contents."""

import sqlite3

conn = sqlite3.connect('portfolio.db')

# Get all tables
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables:", tables)

# Count records in each table
for table in ['transactions', 'stocks', 'cash_deposits', 'portfolio_cash', 'portfolio_snapshots', 'users']:
    try:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} rows")
    except Exception as e:
        print(f"  {table}: ERROR - {e}")

# Show sample transactions
print("\nSample Transactions:")
try:
    rows = conn.execute("SELECT id, stock_symbol, txn_date, txn_type, shares, purchase_cost FROM transactions LIMIT 5").fetchall()
    for row in rows:
        print(f"  {row}")
except Exception as e:
    print(f"  ERROR: {e}")

# Show sample cash deposits
print("\nSample Cash Deposits:")
try:
    rows = conn.execute("SELECT id, portfolio, amount, deposit_date, source FROM cash_deposits LIMIT 5").fetchall()
    for row in rows:
        print(f"  {row}")
except Exception as e:
    print(f"  ERROR: {e}")

# Show portfolio cash
print("\nPortfolio Cash:")
try:
    rows = conn.execute("SELECT * FROM portfolio_cash").fetchall()
    for row in rows:
        print(f"  {row}")
except Exception as e:
    print(f"  ERROR: {e}")

conn.close()
