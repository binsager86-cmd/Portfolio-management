import sqlite3
conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# Check transactions without portfolio
cur.execute("SELECT COUNT(*) FROM transactions WHERE user_id = 2 AND (portfolio IS NULL OR portfolio = '')")
print("Transactions without portfolio:", cur.fetchone()[0])

# Show which ones
cur.execute("SELECT id, stock_symbol, txn_type, txn_date, portfolio FROM transactions WHERE user_id = 2 AND (portfolio IS NULL OR portfolio = '')")
rows = cur.fetchall()
if rows:
    print("\nTransactions missing portfolio:")
    for r in rows:
        print(f"  ID {r[0]}: {r[1]} {r[2]} on {r[3]}, portfolio={r[4]}")

conn.close()
