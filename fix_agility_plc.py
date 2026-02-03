import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# Check AGILITY stocks
cur.execute("SELECT id, user_id, symbol, name, portfolio, currency, current_price FROM stocks WHERE symbol LIKE '%AGILITY%'")
rows = cur.fetchall()
print("=== Current AGILITY stocks ===")
for row in rows:
    print(row)

# Check if AGILITY PLC exists
cur.execute("SELECT COUNT(*) FROM stocks WHERE symbol = 'AGILITY PLC'")
count = cur.fetchone()[0]
print(f"\nAGILITY PLC count: {count}")

if count == 0:
    # Get user_id from an existing AGILITY stock
    cur.execute("SELECT user_id FROM stocks WHERE symbol = 'AGILITY' LIMIT 1")
    result = cur.fetchone()
    if result:
        user_id = result[0]
        # Create AGILITY PLC stock entry
        cur.execute("""
            INSERT INTO stocks (user_id, symbol, name, portfolio, currency, current_price)
            VALUES (?, 'AGILITY PLC', 'Agility Public Warehousing PLC', 'BBYN', 'KWD', 0.099)
        """, (user_id,))
        conn.commit()
        print(f"\n✅ Created AGILITY PLC stock entry for user_id {user_id}")
    else:
        print("\n⚠️ Could not find existing AGILITY stock to get user_id")
else:
    print("\n✓ AGILITY PLC already exists")

conn.close()
