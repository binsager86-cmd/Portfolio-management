"""
Fix user_id mismatch: reassign all portfolio data from user_id=2 to user_id=1.

All portfolio data (transactions, stocks, deposits, etc.) belongs to user_id=2
(binsager.86@gmail.com) but the primary login "sager alsager" is user_id=1.

This script merges them so user_id=1 owns everything.
"""
import sqlite3

DB = "mobile-migration/dev_portfolio.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

# Tables that have user_id column with data belonging to user 2
TABLES = [
    "transactions",
    "stocks",
    "cash_deposits",
    "portfolios",
    "portfolio_transactions",
    "external_accounts",
    "portfolio_cash",
    "portfolio_snapshots",
    "portfolio_summary",
]

print("=== Reassigning user_id 2 → 1 ===\n")
total = 0
for table in TABLES:
    # Check if table exists and has user_id column
    cur.execute(f"PRAGMA table_info({table})")
    cols = [r[1] for r in cur.fetchall()]
    if "user_id" not in cols:
        print(f"  {table}: no user_id column, skip")
        continue

    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = 2")
    count = cur.fetchone()[0]
    if count > 0:
        cur.execute(f"UPDATE {table} SET user_id = 1 WHERE user_id = 2")
        print(f"  {table}: {count} rows updated")
        total += count
    else:
        print(f"  {table}: 0 rows (nothing to update)")

conn.commit()
conn.close()
print(f"\n✅ Done — {total} total rows reassigned to user_id=1")
