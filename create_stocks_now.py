"""Create missing stock entries for user_id=2"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
c = conn.cursor()

# Get all unique symbols from transactions that don't have stock entries
c.execute('''
    SELECT DISTINCT t.stock_symbol
    FROM transactions t
    WHERE t.user_id = 2
    AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
    AND t.stock_symbol IS NOT NULL
    AND t.stock_symbol != ''
    AND t.stock_symbol NOT IN (SELECT symbol FROM stocks WHERE user_id = 2)
''')
missing_symbols = [r[0] for r in c.fetchall()]

if not missing_symbols:
    print("✅ No missing stocks - all symbols exist!")
else:
    print(f"📝 Found {len(missing_symbols)} missing symbols. Creating stock entries...")
    
    # Determine portfolio and currency for each symbol
    for symbol in missing_symbols:
        # Get portfolio from transactions
        c.execute('''
            SELECT portfolio FROM transactions 
            WHERE stock_symbol = ? AND user_id = 2 
            AND (is_deleted = 0 OR is_deleted IS NULL)
            LIMIT 1
        ''', (symbol,))
        row = c.fetchone()
        portfolio = row[0] if row else 'KFH'
        
        # Currency based on portfolio
        currency = 'USD' if portfolio == 'USA' else 'KWD'
        
        # Insert stock
        c.execute('''
            INSERT INTO stocks (symbol, name, current_price, portfolio, currency, user_id)
            VALUES (?, ?, 0, ?, ?, 2)
        ''', (symbol, symbol, portfolio, currency))
        
        print(f"  ✅ Created: {symbol} ({portfolio}, {currency})")
    
    conn.commit()
    print(f"\n✅ Successfully created {len(missing_symbols)} stock entries!")

# Verify final count
c.execute('SELECT COUNT(*) FROM stocks WHERE user_id=2')
final_count = c.fetchone()[0]
print(f"\n📊 Total stocks in database: {final_count}")

conn.close()
