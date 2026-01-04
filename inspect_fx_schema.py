import sqlite3

con = sqlite3.connect("portfolio.db")
cur = con.cursor()

print("\n=== Tables in DB ===")
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
for (name,) in cur.fetchall():
    print("-", name)

print("\n=== fx_rates schema (PRAGMA table_info) ===")
try:
    cur.execute("PRAGMA table_info(fx_rates);")
    cols = cur.fetchall()
    if not cols:
        print("❌ fx_rates table not found or has no columns")
    else:
        for c in cols:
            # c = (cid, name, type, notnull, dflt_value, pk)
            print(c)
except Exception as e:
    print("❌ Error reading fx_rates schema:", e)

con.close()
