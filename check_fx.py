import sqlite3

con = sqlite3.connect("portfolio.db")
cur = con.cursor()

print("USD -> KWD FX rows:\n")

cur.execute("""
SELECT fx_id, rate_date, from_ccy, to_ccy, rate, source
FROM fx_rates
WHERE upper(from_ccy) = 'USD'
  AND upper(to_ccy) = 'KWD'
ORDER BY rate_date DESC
LIMIT 10;
""")

rows = cur.fetchall()

if not rows:
    print("❌ NO USD→KWD FX RATES FOUND")
else:
    for r in rows:
        print(r)

con.close()
