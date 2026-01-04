import sqlite3

DB = "portfolio.db"

con = sqlite3.connect(DB)
cur = con.cursor()

missing = cur.execute("""
SELECT DISTINCT l.asset_id
FROM ledger_entries l
LEFT JOIN assets a ON a.asset_id = l.asset_id
WHERE a.asset_id IS NULL
ORDER BY l.asset_id;
""").fetchall()

if not missing:
    print("✅ No missing assets. Nothing to fix.")
    con.close()
    raise SystemExit

print("Adding missing assets with placeholders...")

for (asset_id,) in missing:
    # Try to infer symbol/currency from other tables (best effort)
    sym = None
    ccy = None

    # If you have prices, sometimes symbol isn't there; so we keep it generic.
    # Currency might exist in ledger_entries currency column.
    row = cur.execute(
        "SELECT currency FROM ledger_entries WHERE asset_id=? AND currency IS NOT NULL LIMIT 1;",
        (asset_id,),
    ).fetchone()
    if row and row[0]:
        ccy = row[0].upper()

    # Default placeholders
    sym = f"ASSET_{asset_id}"
    if not ccy:
        ccy = "KWD"

    cur.execute(
        """
        INSERT INTO assets (asset_id, symbol, asset_type, exchange, currency)
        VALUES (?, ?, ?, ?, ?)
        """,
        (asset_id, sym, "UNKNOWN", "UNKNOWN", ccy),
    )
    print(f"✅ Inserted assets.asset_id={asset_id} symbol={sym} currency={ccy}")

con.commit()
con.close()

print("✅ Done. Now update these placeholder symbols/exchanges later if needed.")
