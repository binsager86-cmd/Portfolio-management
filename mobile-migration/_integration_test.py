"""Quick integration test script — run from portfolio_app root with venv active."""
import sqlite3, json

DB = "mobile-migration/dev_portfolio.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

# 1. List all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print("=== TABLES ===")
print(tables)

# 2. Check for users table
if "users" in tables:
    cur.execute("SELECT id, username, name FROM users")
    rows = cur.fetchall()
    print("\n=== USERS ===")
    for r in rows:
        print(f"  id={r[0]}, username={r[1]}, name={r[2]}")
else:
    print("\n!!! NO 'users' TABLE FOUND — need to create it")

# 3. Quick overview data for comparison
cur.execute("SELECT DISTINCT portfolio FROM stocks WHERE portfolio IS NOT NULL")
portfolios = [r[0] for r in cur.fetchall()]
print(f"\n=== PORTFOLIOS === {portfolios}")

cur.execute("SELECT COUNT(*) FROM transactions")
txn_count = cur.fetchone()[0]
print(f"Transaction count: {txn_count}")

cur.execute("SELECT SUM(amount) FROM cash_deposits")
row = cur.fetchone()
total_deposits = row[0] if row and row[0] else 0
print(f"Total deposits (cash_deposits): {total_deposits}")

conn.close()
print("\nDone.")
