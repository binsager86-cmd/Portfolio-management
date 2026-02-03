#!/usr/bin/env python3
"""
Fix existing symbol variations in the database.
Run this immediately to normalize all symbols.
"""
import sqlite3

def main():
    conn = sqlite3.connect('portfolio.db')
    cur = conn.cursor()
    
    print("=" * 50)
    print("FIXING EXISTING SYMBOL VARIATIONS")
    print("=" * 50)
    print()
    
    # Fix Mabanee variations
    cur.execute("""
        UPDATE transactions 
        SET stock_symbol = 'MABANEE' 
        WHERE UPPER(stock_symbol) IN ('MABANEE', 'MABNEE', 'MABNE', 'MABAN', 'MABNEE')
    """)
    mabanee_fixed = cur.rowcount
    print(f"✓ Mabanee variations fixed: {mabanee_fixed}")
    
    # Fix Ooredoo variations
    cur.execute("""
        UPDATE transactions 
        SET stock_symbol = 'OOREDOO' 
        WHERE UPPER(stock_symbol) IN ('OOREDOO', 'OREDOO', 'OORED', 'OREDOO')
    """)
    ooredoo_fixed = cur.rowcount
    print(f"✓ Ooredoo variations fixed: {ooredoo_fixed}")
    
    # Fix Agility variations
    cur.execute("""
        UPDATE transactions 
        SET stock_symbol = 'AGILITY' 
        WHERE UPPER(stock_symbol) IN ('AGILITY', 'AGLTY', 'AGILITY PLC', 'AGILITY KUWAIT', 'AGILITYPLC')
    """)
    agility_fixed = cur.rowcount
    print(f"✓ Agility variations fixed: {agility_fixed}")
    
    # Fix Humansoft variations
    cur.execute("""
        UPDATE transactions 
        SET stock_symbol = 'HUMANSOFT' 
        WHERE UPPER(stock_symbol) IN ('HUMANSOFT', 'HUMAN SOFT', 'H-SOFT', 'HSOFT')
    """)
    humansoft_fixed = cur.rowcount
    print(f"✓ Humansoft variations fixed: {humansoft_fixed}")
    
    # Fix zero-share bonus transactions
    cur.execute("""
        UPDATE transactions 
        SET shares = bonus_shares, txn_type = 'Buy'
        WHERE shares = 0 AND bonus_shares > 0 AND txn_type IN ('Buy', 'DIVIDEND_ONLY', 'Dividend only')
    """)
    bonus_fixed = cur.rowcount
    print(f"✓ Zero-share bonus transactions fixed: {bonus_fixed}")
    
    conn.commit()
    
    print()
    print("=" * 50)
    print("VERIFICATION")
    print("=" * 50)
    
    # Show all distinct symbols now
    cur.execute('SELECT DISTINCT stock_symbol FROM transactions ORDER BY stock_symbol')
    symbols = [r[0] for r in cur.fetchall()]
    print(f"Distinct symbols ({len(symbols)}): {symbols}")
    
    # Show transaction count
    cur.execute('SELECT COUNT(*) FROM transactions')
    total = cur.fetchone()[0]
    print(f"Total transactions: {total}")
    
    conn.close()
    
    print()
    print("✅ Done! Symbols have been normalized.")
    print("   Run refresh_all_position_snapshots() to recalculate positions.")

if __name__ == "__main__":
    main()
