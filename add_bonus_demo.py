import sqlite3
from datetime import datetime

DB_NAME = "portfolio.db"

def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # Change this symbol when you want (example: AAPL)
    symbol = "AAPL"

    cur.execute("SELECT asset_id, currency FROM assets WHERE symbol = ?", (symbol,))
    row = cur.fetchone()
    if not row:
        print("❌ Asset not found. Add the asset first (in assets table).")
        return

    asset_id, currency = row

    bonus_qty = 1.0  # example: received 1 bonus share

    cur.execute("""
        INSERT INTO ledger_entries
        (entry_datetime, entry_type, asset_id, quantity, price, cash_amount, currency, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().isoformat(sep=" ", timespec="seconds"),
        "BONUS_SHARES",
        asset_id,
        bonus_qty,
        None,
        0.0,
        currency,
        "Bonus shares received"
    ))

    conn.commit()
    conn.close()

    print(f"✅ Bonus shares added for {symbol}: +{bonus_qty}")

if __name__ == "__main__":
    main()
