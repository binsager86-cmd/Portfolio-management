"""Check why stocks aren't showing after transaction upload."""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

print('=== TRANSACTIONS ===')
cur.execute('SELECT COUNT(*) FROM transactions WHERE user_id = 2')
print(f'Total transactions: {cur.fetchone()[0]}')

cur.execute('SELECT DISTINCT stock_symbol FROM transactions WHERE user_id = 2 ORDER BY stock_symbol')
txn_symbols = [r[0] for r in cur.fetchall()]
print(f'Symbols in transactions ({len(txn_symbols)}): {txn_symbols}')

print()
print('=== STOCKS TABLE ===')
cur.execute('SELECT COUNT(*) FROM stocks WHERE user_id = 2')
print(f'Total stocks: {cur.fetchone()[0]}')

cur.execute('SELECT symbol, name, portfolio FROM stocks WHERE user_id = 2 ORDER BY symbol')
stocks = cur.fetchall()
stock_symbols = [r[0] for r in stocks]
print(f'Symbols in stocks ({len(stock_symbols)}): {stock_symbols}')

print()
print('=== MISSING STOCKS ===')
missing = [s for s in txn_symbols if s and s not in stock_symbols]
print(f'Symbols in transactions but NOT in stocks: {missing}')

if missing:
    print()
    print('FIX: These stocks need to be added to the stocks table!')
    print('The upload handler should auto-create stocks entries.')

conn.close()
