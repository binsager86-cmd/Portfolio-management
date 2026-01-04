import sqlite3

DB = "portfolio.db"

con = sqlite3.connect(DB)
cur = con.cursor()

sql = """
SELECT DISTINCT l.asset_id
FROM ledger_entries l
LEFT JOIN assets a ON a.asset_id = l.asset_id
WHERE a.asset_id IS NULL
ORDER BY l.asset_id;
"""

rows = cur.execute(sql).fetchall()
con.close()

print("Missing asset_id values (in ledger_entries but not in assets):")
if not rows:
    print("✅ None. No missing asset_id found.")
else:
    for r in rows:
        print(" -", r[0])
