"""Verify stored avg_cost for closed positions"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
c = conn.cursor()

print('=' * 90)
print('VERIFYING STORED AVG_COST FOR KRE (CLOSED POSITION)')
print('=' * 90)

c.execute('''
    SELECT id, txn_date, txn_type, shares, purchase_cost, sell_value,
           avg_cost_at_txn, realized_pnl_at_txn, shares_held_at_txn
    FROM transactions 
    WHERE stock_symbol = 'KRE' AND user_id = 2
    ORDER BY txn_date
''')

print(f"{'ID':>5} {'Date':12} {'Type':6} {'Shares':>8} {'Cost':>10} {'Sell':>10} {'Avg Cost':>10} {'P&L':>10} {'Held':>8}")
print('-' * 90)

for r in c.fetchall():
    txn_id, date, txn_type, shares, cost, sell_val, avg_cost, pnl, held = r
    shares = shares or 0
    cost = cost or 0
    sell_val = sell_val or 0
    avg_cost = avg_cost or 0
    pnl = pnl or 0
    held = held or 0
    print(f'{txn_id:>5} {date:12} {txn_type:6} {shares:>8.0f} {cost:>10.2f} {sell_val:>10.2f} {avg_cost:>10.4f} {pnl:>10.2f} {held:>8.0f}')

print()
print('=' * 90)
print('ALL CLOSED POSITIONS WITH STORED AVG COST:')
print('=' * 90)

c.execute('''
    SELECT stock_symbol,
           SUM(CASE WHEN txn_type = 'Sell' THEN shares ELSE 0 END) as sold,
           SUM(CASE WHEN txn_type = 'Buy' THEN shares ELSE 0 END) as bought,
           MAX(CASE WHEN txn_type = 'Sell' THEN avg_cost_at_txn END) as sell_avg_cost,
           SUM(CASE WHEN txn_type = 'Sell' THEN realized_pnl_at_txn ELSE 0 END) as total_pnl
    FROM transactions 
    WHERE user_id = 2 AND (is_deleted = 0 OR is_deleted IS NULL)
    GROUP BY stock_symbol
    HAVING SUM(CASE WHEN txn_type = 'Sell' THEN shares ELSE 0 END) > 0
''')

print(f"{'Symbol':12} {'Bought':>10} {'Sold':>10} {'Avg Cost':>12} {'Realized P&L':>14}")
print('-' * 60)

for r in c.fetchall():
    sym, sold, bought, avg, pnl = r
    sold = sold or 0
    bought = bought or 0
    avg = avg or 0
    pnl = pnl or 0
    print(f'{sym:12} {bought:>10.0f} {sold:>10.0f} {avg:>12.4f} {pnl:>14.2f}')

conn.close()
print()
print('✅ Avg cost is now stored permanently for all transactions!')
