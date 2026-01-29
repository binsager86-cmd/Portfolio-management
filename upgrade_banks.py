import sqlite3

DB_NAME = "portfolio.db"

def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # Table to store bank deposits/withdrawals (positive=deposit, negative=withdrawal)
    # Multi-user support: user_id column required
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bank_cashflows (
            bank_txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            bank_name TEXT NOT NULL,
            txn_date TEXT NOT NULL,              -- YYYY-MM-DD
            amount REAL NOT NULL,                -- + deposit, - withdrawal
            description TEXT,
            comments TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    
    # Migration: Add user_id column if table exists without it
    cur.execute("PRAGMA table_info(bank_cashflows)")
    cols = [r[1] for r in cur.fetchall()]
    if "user_id" not in cols:
        print("📦 Migrating bank_cashflows: adding user_id column...")
        cur.execute("ALTER TABLE bank_cashflows ADD COLUMN user_id INTEGER DEFAULT 1")
        # Update existing rows to belong to default user
        cur.execute("UPDATE bank_cashflows SET user_id = 1 WHERE user_id IS NULL")
        print("✅ Migration complete. Existing rows assigned to user_id=1")
        print("⚠️  Run cleanup to reassign rows to correct users if needed:")
        print("   UPDATE bank_cashflows SET user_id = <correct_user_id> WHERE <condition>;")

    # Helpful indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bank_cashflows_bank_date ON bank_cashflows(bank_name, txn_date)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bank_cashflows_user ON bank_cashflows(user_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bank_cashflows_user_bank ON bank_cashflows(user_id, bank_name)")

    # View: totals per bank + grand total (per user)
    cur.execute("DROP VIEW IF EXISTS bank_totals")
    cur.execute("""
        CREATE VIEW bank_totals AS
        SELECT
            user_id,
            bank_name,
            ROUND(SUM(amount), 3) AS bank_total
        FROM bank_cashflows
        GROUP BY user_id, bank_name
        ORDER BY user_id, bank_name
    """)

    conn.commit()
    conn.close()

    print("✅ Bank deposits schema ready: bank_cashflows table + bank_totals view created.")
    print("📌 Table now supports multi-user with user_id column.")

if __name__ == "__main__":
    main()
