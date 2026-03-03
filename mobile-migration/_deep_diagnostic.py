"""Deep diagnostic: check what data exists per table for user_id=1."""
import sqlite3

DB = "mobile-migration/dev_portfolio.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

print("=== PORTFOLIOS table (user_id=1) ===")
cur.execute("SELECT * FROM portfolios WHERE user_id=1")
cols = [d[0] for d in cur.description]
print(f"  Columns: {cols}")
for r in cur.fetchall():
    print(f"  {dict(zip(cols, r))}")

print("\n=== PORTFOLIO_TRANSACTIONS (user_id=1, first 5) ===")
cur.execute("SELECT * FROM portfolio_transactions WHERE user_id=1 LIMIT 5")
cols = [d[0] for d in cur.description]
print(f"  Columns: {cols}")
for r in cur.fetchall():
    print(f"  {dict(zip(cols, r))}")
cur.execute("SELECT COUNT(*) FROM portfolio_transactions WHERE user_id=1")
print(f"  Total rows: {cur.fetchone()[0]}")

print("\n=== TRANSACTIONS (user_id=1, first 3) ===")
cur.execute("SELECT * FROM transactions WHERE user_id=1 LIMIT 3")
cols = [d[0] for d in cur.description]
print(f"  Columns: {cols}")
for r in cur.fetchall():
    d = dict(zip(cols, r))
    print(f"  {d}")
cur.execute("SELECT COUNT(*) FROM transactions WHERE user_id=1")
print(f"  Total rows: {cur.fetchone()[0]}")

print("\n=== CASH_DEPOSITS (user_id=1, first 3) ===")
cur.execute("SELECT * FROM cash_deposits WHERE user_id=1 LIMIT 3")
cols = [d[0] for d in cur.description]
print(f"  Columns: {cols}")
for r in cur.fetchall():
    print(f"  {dict(zip(cols, r))}")
cur.execute("SELECT COUNT(*), SUM(amount) FROM cash_deposits WHERE user_id=1")
row = cur.fetchone()
print(f"  Total rows: {row[0]}, Total amount: {row[1]}")

print("\n=== STOCKS (user_id=1, first 5) ===")
cur.execute("SELECT id, symbol, company, portfolio, currency FROM stocks WHERE user_id=1 LIMIT 5")
for r in cur.fetchall():
    print(f"  {r}")
cur.execute("SELECT COUNT(*) FROM stocks WHERE user_id=1")
print(f"  Total: {cur.fetchone()[0]}")

print("\n=== EXTERNAL_ACCOUNTS (user_id=1) ===")
cur.execute("SELECT * FROM external_accounts WHERE user_id=1")
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    print(f"  {dict(zip(cols, r))}")

conn.close()
