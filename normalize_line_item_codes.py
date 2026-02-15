"""
One-time migration: normalise financial_line_items.line_item_code values
so the same financial concept uses ONE canonical code across all years.

This prevents the multi-year display table from showing separate rows
for the same item when different years use slightly different wording
(e.g. "NET_CASH_USED_IN_INVESTING_ACTIVITIES" vs
       "NET_CASH_USED_IN_FROM_INVESTING_ACTIVITIES").

Safe to re-run — only updates rows whose code is in the alias map.
"""

import sqlite3
import sys
import os

# Ensure the stock_analysis package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from stock_analysis.config import LINE_ITEM_CODE_ALIASES


def migrate(db_path: str = "portfolio.db", dry_run: bool = False) -> None:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Collect all distinct codes currently stored
    cur.execute("SELECT DISTINCT line_item_code FROM financial_line_items")
    all_codes = [r[0] for r in cur.fetchall()]

    updates = []
    for code in all_codes:
        canonical = LINE_ITEM_CODE_ALIASES.get(code)
        if canonical and canonical != code:
            updates.append((canonical, code))

    if not updates:
        print("Nothing to normalise — all codes are already canonical.")
        conn.close()
        return

    print(f"{'DRY RUN — ' if dry_run else ''}Normalising {len(updates)} code(s):\n")

    total_rows = 0
    for new_code, old_code in sorted(updates, key=lambda t: t[1]):
        cur.execute(
            "SELECT COUNT(*) FROM financial_line_items WHERE line_item_code = ?",
            (old_code,),
        )
        count = cur.fetchone()[0]
        total_rows += count
        print(f"  {old_code}")
        print(f"    -> {new_code}  ({count} row(s))")

        if not dry_run:
            cur.execute(
                "UPDATE financial_line_items SET line_item_code = ? WHERE line_item_code = ?",
                (new_code, old_code),
            )

    if not dry_run:
        conn.commit()
        print(f"\n✅ Updated {total_rows} row(s) across {len(updates)} code(s).")
    else:
        print(f"\n(dry run) Would update {total_rows} row(s) across {len(updates)} code(s).")

    conn.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    migrate(dry_run=dry)
