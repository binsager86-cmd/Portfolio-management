import sqlite3
from datetime import datetime

DB_NAME = "portfolio.db"

def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # 1) Add an asset (example: Apple stock)
    cur.execute("""
        INSERT INTO assets (symbol, asset_type, exchange, currency)
        VALUES (?, ?, ?, ?)
    """, ("AAPL", "US_STOCK", "NASDAQ", "USD"))

    asset_id = cur.lastrowid

    # 2) Add cash injection (money you put in)
    cur.execute("""
        INSERT INTO ledger_entries
        (entry_datetime, entry_type, asset_id, quantity, price, cash_amount, currency, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().isoformat(sep=" ", timespec="seconds"),
        "CASH_INJECTION",
        None,
        None,
        None,
        10000.00,
        "USD",
        "Initial funding"
    ))

    # 3) Buy transaction
    cur.execute("""
        INSERT INTO ledger_entries
        (entry_datetime, entry_type, asset_id, quantity, price, cash_amount, currency, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().isoformat(sep=" ", timespec="seconds"),
        "BUY",
        asset_id,
        10,
        180.00,
        -1800.00,
        "USD",
        "Buy AAPL"
    ))

    conn.commit()
    conn.close()

    print("✅ Demo ledger entries added successfully")

if __name__ == "__main__":
    main()
