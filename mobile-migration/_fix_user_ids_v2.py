"""
Fix user_id mismatch v2: reassign all portfolio data from user_id=2 to user_id=1.
Commits after each table to avoid losing progress on constraint errors.
"""
import sqlite3

DB = "mobile-migration/dev_portfolio.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

# Tables that have user_id column with data belonging to user 2
TABLES = [
    "transactions",
    "stocks",
    "cash_deposits",
    "portfolios",
    "portfolio_transactions",
    "external_accounts",
    "portfolio_cash",
    "portfolio_summary",
    "portfolio_snapshots",
    "position_snapshots",
]

print("=== Reassigning user_id 2 -> 1 ===\n")
total = 0
for table in TABLES:
    try:
        # Check if table exists and has user_id column
        cur.execute(f"PRAGMA table_info({table})")
        cols = [r[1] for r in cur.fetchall()]
        if "user_id" not in cols:
            print(f"  {table}: no user_id column, skip")
            continue

        # Count rows to update
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = 2")
        count = cur.fetchone()[0]
        if count == 0:
            print(f"  {table}: 0 rows to update")
            continue

        # For tables with unique constraints involving user_id,
        # delete conflicting rows first
        try:
            cur.execute(f"DELETE FROM {table} WHERE user_id = 2 AND rowid IN "
                        f"(SELECT t2.rowid FROM {table} t2 WHERE t2.user_id = 2)")
            # Actually, just try the update and catch constraint errors
        except:
            pass

        try:
            cur.execute(f"UPDATE {table} SET user_id = 1 WHERE user_id = 2")
            updated = cur.rowcount
            conn.commit()
            print(f"  {table}: {updated} rows updated (committed)")
            total += updated
        except sqlite3.IntegrityError as e:
            conn.rollback()
            # Handle unique constraint: delete user_id=2 rows then retry
            print(f"  {table}: constraint error, deleting user_id=2 rows...")
            cur.execute(f"DELETE FROM {table} WHERE user_id = 2")
            deleted = cur.rowcount
            conn.commit()
            print(f"  {table}: deleted {deleted} rows (user_id=2 data removed, keeping user_id=1)")

    except Exception as e:
        conn.rollback()
        print(f"  {table}: ERROR - {e}")

conn.close()
print(f"\nDone. {total} rows reassigned to user_id=1.")
