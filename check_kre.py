import sqlite3

conn = sqlite3.connect('portfolio.db')
cursor = conn.cursor()

# Check stocks table schema
cursor.execute("PRAGMA table_info(stocks)")
print("=== Stocks table schema ===")
for row in cursor.fetchall():
    print(row)

# Check all stocks
cursor.execute("SELECT * FROM stocks")
print("\n=== All stocks ===")
for row in cursor.fetchall():
    print(row)

# Check assets table
cursor.execute("SELECT id, symbol, name, asset_type FROM assets WHERE symbol LIKE '%KRE%' OR name LIKE '%KRE%'")
print("\n=== Assets with KRE ===")
assets = cursor.fetchall()
for row in assets:
    print(row)

# Check recent prices for KRE
if assets:
    asset_id = assets[0][0]
    cursor.execute("SELECT date, price FROM prices WHERE asset_id = ? ORDER BY date DESC LIMIT 10", (asset_id,))
    print(f"\n=== Recent prices for asset_id {asset_id} ===")
    for row in cursor.fetchall():
        print(row)

conn.close()
