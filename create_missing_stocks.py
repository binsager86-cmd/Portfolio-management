"""Auto-create stocks entries from transactions."""
import sqlite3
import time

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

user_id = 2

# Get all unique symbols from transactions that don't exist in stocks
cur.execute('''
    SELECT DISTINCT t.stock_symbol, t.portfolio
    FROM transactions t
    LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
    WHERE t.user_id = ? AND t.stock_symbol IS NOT NULL AND t.stock_symbol != ''
    AND s.symbol IS NULL
''', (user_id,))

missing = cur.fetchall()
print(f'Found {len(missing)} stocks to create')

# Currency mapping
portfolio_currency = {
    'KFH': 'KWD',
    'BBYN': 'KWD', 
    'USA': 'USD'
}

created = 0
for symbol, portfolio in missing:
    if not symbol:
        continue
    
    portfolio = portfolio or 'KFH'
    currency = portfolio_currency.get(portfolio, 'KWD')
    
    try:
        cur.execute('''
            INSERT INTO stocks (symbol, name, current_price, portfolio, currency, user_id)
            VALUES (?, ?, 0, ?, ?, ?)
        ''', (symbol, symbol, portfolio, currency, user_id))
        created += 1
        print(f'  Created: {symbol} ({portfolio}, {currency})')
    except sqlite3.IntegrityError:
        print(f'  Skipped (exists): {symbol}')

conn.commit()
print(f'\nCreated {created} stock entries')

# Verify
cur.execute('SELECT symbol, portfolio, currency FROM stocks WHERE user_id = ? ORDER BY symbol', (user_id,))
stocks = cur.fetchall()
print(f'\nStocks table now has {len(stocks)} entries:')
for s in stocks:
    print(f'  {s[0]}: {s[1]} ({s[2]})')

conn.close()
