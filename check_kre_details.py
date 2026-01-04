import sqlite3

conn = sqlite3.connect('portfolio.db')
cursor = conn.cursor()

# Get KRE stock info
print("=== KRE Stock Info ===")
cursor.execute("SELECT * FROM stocks WHERE symbol = 'KRE'")
columns = [desc[0] for desc in cursor.description]
row = cursor.fetchone()
if row:
    for col, val in zip(columns, row):
        print(f"{col}: {val}")
else:
    print("KRE not found in stocks table")

# Check transactions for KRE to understand expected price range
print("\n=== KRE Transactions ===")
cursor.execute("""
    SELECT txn_date, txn_type, shares, purchase_cost, sell_value 
    FROM transactions 
    WHERE company = 'KRE' OR company LIKE '%Kuwait Real Estate%'
    ORDER BY txn_date DESC
    LIMIT 10
""")
for row in cursor.fetchall():
    print(row)

conn.close()
