#!/usr/bin/env python3
"""
Deduplicate transactions table.

This script handles two types of duplicates:
1. Same ID appearing multiple times (shouldn't happen with PRIMARY KEY)
2. Same content (stock, date, type, shares, cost) appearing multiple times

Run with --preview first to see what will be deleted.
Run with --delete to actually remove duplicates.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db_layer import query_df, get_connection

def find_content_duplicates(user_id=None):
    """Find transactions with identical content (likely upload duplicates)."""
    
    user_filter = f"WHERE user_id = {user_id}" if user_id else ""
    
    # SQLite-compatible version (works for both SQLite and PostgreSQL)
    sql = f"""
        SELECT 
            stock_symbol, txn_date, txn_type, shares, purchase_cost, sell_value,
            COUNT(*) as cnt,
            MIN(id) as keep_id
        FROM transactions
        {user_filter}
        GROUP BY stock_symbol, txn_date, txn_type, shares, purchase_cost, sell_value, user_id, portfolio
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
    """
    
    df = query_df(sql)
    return df


def delete_content_duplicates(user_id=None, dry_run=True):
    """Delete duplicate transactions, keeping the one with the lowest ID."""
    
    user_filter = f"AND user_id = {user_id}" if user_id else ""
    
    # This deletes all but the MIN(id) for each duplicate group
    delete_sql = f"""
        DELETE FROM transactions
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM transactions
            GROUP BY stock_symbol, txn_date, txn_type, shares, purchase_cost, sell_value, user_id, portfolio
        )
        {user_filter}
    """
    
    # Count how many will be deleted
    count_sql = f"""
        SELECT COUNT(*) as to_delete
        FROM transactions
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM transactions
            GROUP BY stock_symbol, txn_date, txn_type, shares, purchase_cost, sell_value, user_id, portfolio
        )
        {user_filter.replace('AND', 'WHERE') if user_filter else ''}
    """
    
    count_df = query_df(count_sql)
    to_delete = count_df['to_delete'].iloc[0] if not count_df.empty else 0
    
    if dry_run:
        print(f"🔍 DRY RUN: Would delete {to_delete} duplicate transactions")
        return to_delete
    
    if to_delete == 0:
        print("✅ No duplicates to delete")
        return 0
    
    # Actually delete
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(delete_sql)
        deleted = cur.rowcount
        conn.commit()
        print(f"✅ Deleted {deleted} duplicate transactions")
        return deleted


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Deduplicate transactions')
    parser.add_argument('--preview', action='store_true', help='Preview duplicates without deleting')
    parser.add_argument('--delete', action='store_true', help='Actually delete duplicates')
    parser.add_argument('--user', type=int, help='Filter by user_id')
    args = parser.parse_args()
    
    if not args.preview and not args.delete:
        args.preview = True  # Default to preview
    
    print("=" * 60)
    print("TRANSACTION DEDUPLICATION")
    print("=" * 60)
    
    # Show duplicates
    print("\n📋 Finding content duplicates...")
    dupes = find_content_duplicates(args.user)
    
    if dupes.empty:
        print("✅ No duplicate transactions found!")
        return
    
    print(f"\n⚠️  Found {len(dupes)} groups of duplicates:\n")
    print(dupes.to_string())
    
    total_extras = dupes['cnt'].sum() - len(dupes)
    print(f"\n📊 Total extra records to remove: {total_extras}")
    
    if args.delete:
        print("\n🗑️  Deleting duplicates...")
        delete_content_duplicates(args.user, dry_run=False)
    else:
        print("\n💡 Run with --delete to remove duplicates")
        delete_content_duplicates(args.user, dry_run=True)


if __name__ == "__main__":
    main()
