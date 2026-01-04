import sqlite3

DB_NAME = "portfolio.db"

def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # Table to store bank deposits/withdrawals (positive=deposit, negative=withdrawal)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bank_cashflows (
            bank_txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_name TEXT NOT NULL,
            txn_date TEXT NOT NULL,              -- YYYY-MM-DD
            amount REAL NOT NULL,                -- + deposit, - withdrawal
            description TEXT,
            comments TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # Helpful index
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bank_cashflows_bank_date ON bank_cashflows(bank_name, txn_date)")

    # View: totals per bank + grand total
    cur.execute("DROP VIEW IF EXISTS bank_totals")
    cur.execute("""
        CREATE VIEW bank_totals AS
        SELECT
            bank_name,
            ROUND(SUM(amount), 3) AS bank_total
        FROM bank_cashflows
        GROUP BY bank_name
        ORDER BY bank_name
    """)

    conn.commit()
    conn.close()

    print("✅ Bank deposits schema ready: bank_cashflows table + bank_totals view created.")

if __name__ == "__main__":
    main()
