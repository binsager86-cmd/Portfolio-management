import sqlite3

conn = sqlite3.connect('portfolio.db')
cursor = conn.cursor()

# List all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cursor.fetchall()]
print("Tables:", tables)

# Check cash_deposits table
if 'cash_deposits' in tables:
    print("\n--- cash_deposits table schema ---")
    cursor.execute("PRAGMA table_info(cash_deposits)")
    print([r[1] for r in cursor.fetchall()])
    
    print("\n--- cash_deposits data ---")
    cursor.execute("SELECT * FROM cash_deposits")
    rows = cursor.fetchall()
    print(f"Total rows: {len(rows)}")
    for row in rows:
        print(row)
else:
    print("cash_deposits table does not exist!")

# Check if there's a manual_cash or similar table
for t in tables:
    if 'cash' in t.lower() or 'manual' in t.lower():
        print(f"\n--- {t} table ---")
        cursor.execute(f"SELECT * FROM {t}")
        rows = cursor.fetchall()
        print(f"Total rows: {len(rows)}")
        for row in rows[:10]:
            print(row)

conn.close()
