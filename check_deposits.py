import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

user_id = 2

print("=== Deposits with include_in_analysis=1 ===")
cur.execute("SELECT portfolio, SUM(amount) FROM cash_deposits WHERE user_id=? AND include_in_analysis=1 GROUP BY portfolio", (user_id,))
for row in cur.fetchall():
    print(row)

print("\n=== Cash Calculation ===")
# Deposits
cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cash_deposits WHERE user_id=? AND include_in_analysis=1", (user_id,))
deposits = cur.fetchone()[0]
print(f"Deposits: +{deposits:,.2f}")

# Buys
cur.execute("SELECT COALESCE(SUM(purchase_cost), 0) FROM transactions WHERE user_id=? AND txn_type='Buy' AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
buys = cur.fetchone()[0]
print(f"Buys: -{buys:,.2f}")

# Sells
cur.execute("SELECT COALESCE(SUM(sell_value), 0) FROM transactions WHERE user_id=? AND txn_type='Sell' AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
sells = cur.fetchone()[0]
print(f"Sells: +{sells:,.2f}")

# Dividends
cur.execute("SELECT COALESCE(SUM(cash_dividend), 0) FROM transactions WHERE user_id=? AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
dividends = cur.fetchone()[0]
print(f"Dividends: +{dividends:,.2f}")

# Fees
cur.execute("SELECT COALESCE(SUM(fees), 0) FROM transactions WHERE user_id=? AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
fees = cur.fetchone()[0]
print(f"Fees: -{fees:,.2f}")

expected = deposits - buys + sells + dividends - fees
print(f"\n=== EXPECTED CASH: {expected:,.2f} ===")

conn.close()
