import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# Check all HUMANSOFT stocks entries
cur.execute("SELECT id, symbol, name, portfolio, current_price, currency, tradingview_symbol FROM stocks WHERE symbol='HUMANSOFT'")
rows = cur.fetchall()
print("=== HUMANSOFT stocks entries ===")
for r in rows:
    print(f"  id={r[0]}, symbol={r[1]}, name={r[2]}, portfolio={r[3]}, price={r[4]}, currency={r[5]}, tv={r[6]}")

# Get user_id
cur.execute("SELECT DISTINCT user_id FROM stocks WHERE symbol='HUMANSOFT'")
uids = cur.fetchall()
print(f"\nUser IDs with HUMANSOFT: {uids}")

# Check BBYN net shares
cur.execute("""
    SELECT portfolio, 
           SUM(CASE WHEN txn_type='Buy' THEN shares ELSE 0 END) - SUM(CASE WHEN txn_type='Sell' THEN shares ELSE 0 END) as net
    FROM transactions 
    WHERE stock_symbol='HUMANSOFT' AND is_deleted=0
    GROUP BY portfolio
""")
net = cur.fetchall()
print("\n=== Net shares by portfolio ===")
for r in net:
    print(f"  portfolio={r[0]}, net_shares={r[1]}")

# Fix: Insert HUMANSOFT for BBYN if missing
user_id = uids[0][0] if uids else 1
cur.execute("SELECT id FROM stocks WHERE symbol='HUMANSOFT' AND portfolio='BBYN' AND user_id=?", (user_id,))
existing = cur.fetchone()
if not existing:
    print("\n>>> HUMANSOFT missing for BBYN! Inserting...")
    cur.execute("""
        INSERT INTO stocks (user_id, symbol, name, current_price, portfolio, currency)
        VALUES (?, 'HUMANSOFT', 'HumanSoft Holding', 2.731, 'BBYN', 'KWD')
    """, (user_id,))
    conn.commit()
    print(">>> DONE! HUMANSOFT added to BBYN with price 2.731 KWD")
else:
    print(f"\nHUMANSOFT already exists for BBYN (id={existing[0]})")

conn.close()
