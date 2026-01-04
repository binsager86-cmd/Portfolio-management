import sqlite3

DB = "portfolio.db"
d = "2025-12-27"

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

cnt = cur.execute(
    "SELECT COUNT(*) AS n FROM daily_snapshots WHERE snapshot_date=?",
    (d,)
).fetchone()["n"]

print(f"Rows in daily_snapshots for {d}: {cnt}")

rows = cur.execute(
    """
    SELECT snapshot_date, asset_id, quantity, avg_cost, mkt_price, mkt_value, currency, fx_to_base, mkt_value_base, pnl_base
    FROM daily_snapshots
    WHERE snapshot_date=?
    ORDER BY mkt_value_base DESC
    LIMIT 10
    """,
    (d,)
).fetchall()

print("\nTop 10 by market value (base):")
for r in rows:
    print(dict(r))

con.close()
