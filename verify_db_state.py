"""Verify database state after fixes"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
c = conn.cursor()

# Count stocks
c.execute('SELECT COUNT(*) FROM stocks WHERE user_id=2')
stocks_count = c.fetchone()[0]
print(f"📊 Stocks in database: {stocks_count}")

# Count active transactions
c.execute('SELECT COUNT(*) FROM transactions WHERE user_id=2 AND (is_deleted=0 OR is_deleted IS NULL)')
txns_count = c.fetchone()[0]
print(f"📝 Active Transactions: {txns_count}")

# Show stock entries
print("\n📋 Stock entries:")
c.execute('SELECT symbol, name, portfolio, currency FROM stocks WHERE user_id=2 ORDER BY symbol')
for r in c.fetchall():
    print(f"  • {r[0]}: {r[1]} ({r[2]}, {r[3]})")

# Show symbols in transactions that might be missing from stocks
c.execute('''
    SELECT DISTINCT t.stock_symbol
    FROM transactions t
    WHERE t.user_id = 2
    AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
    AND t.stock_symbol NOT IN (SELECT symbol FROM stocks WHERE user_id = 2)
''')
missing = c.fetchall()
if missing:
    print(f"\n⚠️ Symbols in transactions but MISSING from stocks:")
    for r in missing:
        print(f"  • {r[0]}")
else:
    print("\n✅ All transaction symbols exist in stocks table!")

conn.close()
