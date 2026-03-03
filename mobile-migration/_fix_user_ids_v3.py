"""
Fix user_id mismatch v3: UPDATE user_id=2 to user_id=1.
Only UPDATE. Never DELETE. Commits per table. Handles constraint errors gracefully.
"""
import sqlite3

DB = "mobile-migration/dev_portfolio.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

TABLES = [
    "transactions",
    "cash_deposits",
    "portfolios",
    "portfolio_transactions",
    "external_accounts",
    "portfolio_cash",
    "portfolio_summary",
    "stocks",
]

print("=== Reassigning user_id 2 -> 1 (UPDATE only) ===\n")
total = 0
for table in TABLES:
    try:
        cur.execute(f"PRAGMA table_info({table})")
        cols = [r[1] for r in cur.fetchall()]
        if "user_id" not in cols:
            print(f"  {table}: no user_id column, skip")
            continue

        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = 2")
        count = cur.fetchone()[0]
        if count == 0:
            print(f"  {table}: 0 rows (skip)")
            continue

        cur.execute(f"UPDATE {table} SET user_id = 1 WHERE user_id = 2")
        updated = cur.rowcount
        conn.commit()
        print(f"  {table}: {updated}/{count} rows updated OK")
        total += updated

    except sqlite3.IntegrityError as ie:
        conn.rollback()
        print(f"  {table}: UNIQUE constraint - {count} rows left as user_id=2 ({ie})")
    except Exception as e:
        conn.rollback()
        print(f"  {table}: ERROR - {e}")

# Handle tables with unique constraints separately
for table in ["portfolio_snapshots", "position_snapshots"]:
    try:
        cur.execute(f"PRAGMA table_info({table})")
        cols = [r[1] for r in cur.fetchall()]
        if "user_id" not in cols:
            print(f"  {table}: no user_id column, skip")
            continue
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = 2")
        count = cur.fetchone()[0]
        if count == 0:
            print(f"  {table}: 0 rows (skip)")
            continue
        # Try update; if constraint fails, just leave them — snapshots are secondary
        try:
            cur.execute(f"UPDATE {table} SET user_id = 1 WHERE user_id = 2")
            conn.commit()
            print(f"  {table}: {cur.rowcount} rows updated OK")
            total += cur.rowcount
        except sqlite3.IntegrityError:
            conn.rollback()
            # Just skip — snapshot data is regenerated
            print(f"  {table}: constraint conflict, leaving as user_id=2 (non-critical)")
    except Exception as e:
        conn.rollback()
        print(f"  {table}: ERROR - {e}")

conn.close()
print(f"\nDone. {total} total rows reassigned to user_id=1.")
