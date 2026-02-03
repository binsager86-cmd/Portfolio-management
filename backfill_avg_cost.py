"""Backfill avg_cost per (symbol, portfolio) - updated version"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

user_id = 2

print('=' * 80)
print('BACKFILLING AVG_COST PER (SYMBOL, PORTFOLIO)')
print('=' * 80)

# Get all distinct (symbol, portfolio) combinations
cur.execute('''
    SELECT DISTINCT stock_symbol, portfolio 
    FROM transactions 
    WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    AND stock_symbol IS NOT NULL AND stock_symbol != ''
''', (user_id,))
positions = cur.fetchall()

print(f'Processing {len(positions)} positions (symbol + portfolio combinations)...')
print()

updated = 0
for symbol, portfolio in positions:
    # Get all transactions for this (symbol, portfolio), sorted chronologically
    cur.execute('''
        SELECT id, txn_type, txn_date, shares, purchase_cost, sell_value, 
               fees, bonus_shares, cash_dividend
        FROM transactions
        WHERE user_id = ? AND stock_symbol = ? AND portfolio = ?
        AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY txn_date ASC, id ASC
    ''', (user_id, symbol, portfolio))
    
    txns = cur.fetchall()
    
    # Track running state for this (symbol, portfolio)
    total_shares = 0.0
    total_cost = 0.0
    
    for txn in txns:
        txn_id, txn_type, txn_date, shares, purchase_cost, sell_value, fees, bonus_shares, cash_dividend = txn
        
        shares = float(shares or 0)
        purchase_cost = float(purchase_cost or 0)
        sell_value = float(sell_value or 0)
        fees = float(fees or 0)
        bonus_shares = float(bonus_shares or 0)
        
        realized_pnl = 0.0
        avg_cost = 0.0
        
        if txn_type == 'Buy':
            buy_cost = purchase_cost + fees
            total_cost += buy_cost
            total_shares += shares
            if bonus_shares > 0:
                total_shares += bonus_shares
            avg_cost = total_cost / total_shares if total_shares > 0 else 0
        
        elif txn_type == 'Sell':
            if total_shares > 0 and shares > 0:
                avg_cost_before = total_cost / total_shares
                proceeds = sell_value - fees
                cost_sold = avg_cost_before * shares
                realized_pnl = proceeds - cost_sold
                total_cost -= cost_sold
                total_shares -= shares
                avg_cost = avg_cost_before
            else:
                avg_cost = 0
        
        elif txn_type in ('Bonus Shares', 'Bonus', 'DIVIDEND_ONLY', 'Dividend'):
            if txn_type in ('Bonus Shares', 'Bonus'):
                bonus_qty = bonus_shares if bonus_shares > 0 else shares
                total_shares += bonus_qty
            avg_cost = total_cost / total_shares if total_shares > 0 else 0
        else:
            avg_cost = total_cost / total_shares if total_shares > 0 else 0
        
        total_cost = max(total_cost, 0)
        total_shares = max(total_shares, 0)
        
        # Update
        cur.execute('''
            UPDATE transactions 
            SET avg_cost_at_txn = ?,
                realized_pnl_at_txn = ?,
                cost_basis_at_txn = ?,
                shares_held_at_txn = ?
            WHERE id = ?
        ''', (round(avg_cost, 6), round(realized_pnl, 3), 
              round(total_cost, 3), round(total_shares, 3), txn_id))
        updated += 1
    
    status = 'OPEN' if total_shares > 0 else 'CLOSED'
    print(f'  {symbol:12} | {portfolio:6} | {len(txns):3} txns | shares={total_shares:>10.0f} | avg={avg_cost:>10.4f} | {status}')

conn.commit()
conn.close()

print()
print('=' * 80)
print(f'✅ Backfill complete! Updated {updated} transactions across {len(positions)} positions')
print('=' * 80)
