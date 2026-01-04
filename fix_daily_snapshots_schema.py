import sqlite3

DB = "portfolio.db"

con = sqlite3.connect(DB)
cur = con.cursor()

# See existing schema
cols = cur.execute("PRAGMA table_info(daily_snapshots);").fetchall()
print("Existing daily_snapshots columns:")
for c in cols:
    # (cid, name, type, notnull, dflt_value, pk)
    print(" -", c[1], c[2])

existing_names = [c[1] for c in cols]

# If the correct schema already exists, do nothing
if "asset_id" in existing_names and "snapshot_date" in existing_names:
    print("✅ daily_snapshots already has asset_id. No schema fix needed.")
    con.close()
    raise SystemExit

print("\n⚠️ daily_snapshots schema is not compatible. Rebuilding clean table...")

# Backup old table
cur.execute("ALTER TABLE daily_snapshots RENAME TO daily_snapshots_old;")

# Create new correct table
cur.execute("""
CREATE TABLE daily_snapshots (
    snapshot_date TEXT NOT NULL,
    asset_id      INTEGER NOT NULL,
    quantity      REAL NOT NULL,
    avg_cost      REAL NOT NULL,
    cost_value    REAL NOT NULL,
    mkt_price     REAL NOT NULL,
    mkt_value     REAL NOT NULL,
    currency      TEXT NOT NULL,
    fx_to_base     REAL NOT NULL,
    mkt_value_base REAL NOT NULL,
    cost_value_base REAL NOT NULL,
    pnl_base      REAL NOT NULL,
    PRIMARY KEY (snapshot_date, asset_id)
);
""")

con.commit()
con.close()

print("✅ Done. Old table saved as: daily_snapshots_old")
print("✅ New table created: daily_snapshots (with asset_id)")
