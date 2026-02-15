"""
Fix foreign key violations in the stock_analysis database.

Run this ONCE if you have orphaned financial statements (statements
whose stock_id references a row that no longer exists in
analysis_stocks).

Usage:
    python -m stock_analysis.database.migration_fix_fk
    # — or —
    python stock_analysis/database/migration_fix_fk.py
"""

import os
import sys
import time

# Resolve repo root and ensure db_layer is importable
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from db_layer import get_conn, convert_sql, convert_params, is_postgres, is_sqlite


def fix_foreign_key_violations() -> None:
    conn = get_conn()
    cursor = conn.cursor()

    # Enable foreign keys (SQLite requires this per-connection; no-op on PG)
    if is_sqlite():
        cursor.execute("PRAGMA foreign_keys = ON;")

    # ── Find orphaned financial_statements ──
    cursor.execute("""
        SELECT fs.id, fs.stock_id, fs.statement_type, fs.fiscal_year
        FROM financial_statements fs
        LEFT JOIN analysis_stocks s ON fs.stock_id = s.id
        WHERE s.id IS NULL
    """)
    orphaned_stmts = cursor.fetchall()

    # ── Find orphaned financial_line_items ──
    cursor.execute("""
        SELECT li.id, li.statement_id
        FROM financial_line_items li
        LEFT JOIN financial_statements fs ON li.statement_id = fs.id
        WHERE fs.id IS NULL
    """)
    orphaned_items = cursor.fetchall()

    if not orphaned_stmts and not orphaned_items:
        print("✅ No orphaned records found — database is clean")
        conn.close()
        return

    # ── Report ──
    if orphaned_stmts:
        print(f"\n⚠️  Found {len(orphaned_stmts)} orphaned financial statement(s):")
        for stmt_id, stock_id, stmt_type, year in orphaned_stmts:
            print(f"   Statement #{stmt_id} → Stock #{stock_id} (missing)"
                  f"  [{stmt_type}, {year}]")

    if orphaned_items:
        print(f"\n⚠️  Found {len(orphaned_items)} orphaned line item(s):")
        for li_id, stmt_id in orphaned_items[:10]:
            print(f"   LineItem #{li_id} → Statement #{stmt_id} (missing)")
        if len(orphaned_items) > 10:
            print(f"   ... and {len(orphaned_items) - 10} more")

    # ── Delete orphaned line items first (child table) ──
    cursor.execute("""
        DELETE FROM financial_line_items
        WHERE statement_id IN (
            SELECT fs.id
            FROM financial_statements fs
            LEFT JOIN analysis_stocks s ON fs.stock_id = s.id
            WHERE s.id IS NULL
        )
    """)
    deleted_items_from_stmts = cursor.rowcount

    # Orphaned line items referencing missing statements
    cursor.execute("""
        DELETE FROM financial_line_items
        WHERE statement_id NOT IN (SELECT id FROM financial_statements)
    """)
    deleted_dangling_items = cursor.rowcount

    # ── Delete orphaned statements ──
    cursor.execute("""
        DELETE FROM financial_statements
        WHERE stock_id NOT IN (SELECT id FROM analysis_stocks)
    """)
    deleted_stmts = cursor.rowcount

    conn.commit()

    print(f"\n🗑️  Cleanup results:")
    print(f"   Statements deleted: {deleted_stmts}")
    print(f"   Line items deleted (from orphan stmts): {deleted_items_from_stmts}")
    print(f"   Line items deleted (dangling refs): {deleted_dangling_items}")
    print("\n✅ Database integrity restored")

    conn.close()


if __name__ == "__main__":
    print("🔍 Checking database for orphaned records ...")
    fix_foreign_key_violations()
