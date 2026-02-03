import sqlite3
conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# Verify MABANEE stored values
print('=== MABANEE Stored Values ===')
cur.execute("""SELECT id, txn_type, shares_held_at_txn, avg_cost_at_txn, realized_pnl_at_txn
               FROM transactions WHERE stock_symbol LIKE '%MABANEE%' ORDER BY txn_date, id""")
for r in cur.fetchall():
    print(f'ID {r[0]}: {r[1]:15} | held={r[2]} | avg_cost={r[3]} | pnl={r[4]}')

# Check all stocks that have DIVIDEND_ONLY with bonus_shares
print()
print('=== DIVIDEND_ONLY transactions with bonus_shares ===')
cur.execute("""SELECT id, stock_symbol, portfolio, bonus_shares, shares_held_at_txn, avg_cost_at_txn
               FROM transactions WHERE txn_type = 'DIVIDEND_ONLY' AND bonus_shares > 0""")
for r in cur.fetchall():
    print(f'ID {r[0]}: {r[1]} / {r[2]} | bonus={r[3]} | held={r[4]} | avg_cost={r[5]}')

conn.close()
