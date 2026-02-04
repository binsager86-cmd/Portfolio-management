import sqlite3
conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# List all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("Tables:", [row[0] for row in cur.fetchall()])

# Check stocks columns
cur.execute("PRAGMA table_info(stocks)")
print("\nstocks columns:", [row[1] for row in cur.fetchall()])

# Check if there's a holdings or shares table
for table in ['holdings', 'portfolio_holdings', 'stock_holdings']:
    cur.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
    if cur.fetchone():
        print(f"\nFound table: {table}")
        cur.execute(f"PRAGMA table_info({table})")
        print("Columns:", [row[1] for row in cur.fetchall()])

conn.close()
