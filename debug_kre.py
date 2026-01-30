"""Debug script to check transactions and cash calculation"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

user_id = 2  # The user with KRE

print("=== KRE Stock Info ===")
cur.execute("SELECT symbol, portfolio, currency FROM stocks WHERE symbol='KRE'")
for row in cur.fetchall():
    print(row)

print("\n=== KRE SELL Transaction ===")
cur.execute("""
    SELECT id, stock_symbol, txn_type, shares, sell_value, fees, portfolio, category
    FROM transactions 
    WHERE stock_symbol = 'KRE' AND txn_type = 'Sell'
""")
for row in cur.fetchall():
    print(row)

print("\n=== Transaction types distribution ===")
cur.execute("SELECT txn_type, COUNT(*), SUM(purchase_cost), SUM(sell_value), SUM(fees), SUM(cash_dividend) FROM transactions WHERE user_id=? GROUP BY txn_type", (user_id,))
for row in cur.fetchall():
    print(f"{row[0]}: count={row[1]}, buy={row[2]}, sell={row[3]}, fees={row[4]}, div={row[5]}")

print("\n=== Cash Deposits ===")
cur.execute("SELECT portfolio, SUM(amount) FROM cash_deposits WHERE user_id=? AND include_in_analysis=1 GROUP BY portfolio", (user_id,))
rows = cur.fetchall()
if rows:
    for row in rows:
        print(row)
else:
    print("NO DEPOSITS!")

print("\n=== Manual Cash Calculation ===")
# Deposits
cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cash_deposits WHERE user_id=? AND include_in_analysis=1", (user_id,))
deposits = cur.fetchone()[0]
print(f"Deposits: +{deposits}")

# Buys
cur.execute("SELECT COALESCE(SUM(purchase_cost), 0) FROM transactions WHERE user_id=? AND txn_type='Buy' AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
buys = cur.fetchone()[0]
print(f"Buys: -{buys}")

# Sells
cur.execute("SELECT COALESCE(SUM(sell_value), 0) FROM transactions WHERE user_id=? AND txn_type='Sell' AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
sells = cur.fetchone()[0]
print(f"Sells: +{sells}")

# Dividends
cur.execute("SELECT COALESCE(SUM(cash_dividend), 0) FROM transactions WHERE user_id=? AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
dividends = cur.fetchone()[0]
print(f"Dividends: +{dividends}")

# Fees
cur.execute("SELECT COALESCE(SUM(fees), 0) FROM transactions WHERE user_id=? AND COALESCE(category,'portfolio')='portfolio'", (user_id,))
fees = cur.fetchone()[0]
print(f"Fees: -{fees}")

expected = deposits - buys + sells + dividends - fees
print(f"\n=== EXPECTED CASH: {expected:,.2f} ===")

print("\n=== Current portfolio_cash table ===")
cur.execute("SELECT portfolio, balance FROM portfolio_cash WHERE user_id=?", (user_id,))
total = 0
for row in cur.fetchall():
    print(row)
    total += row[1]
print(f"Total: {total:,.2f}")

conn.close()
