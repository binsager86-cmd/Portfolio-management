import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# Get distinct (symbol, portfolio) combinations for AGILITY
cur.execute("SELECT DISTINCT stock_symbol, portfolio FROM transactions WHERE stock_symbol LIKE '%AGILITY%'")
positions = cur.fetchall()

print('=== AGILITY positions to recalculate ===')
for sym, port in positions:
    print(f'  {sym} / {port}')
    
    # Get all transactions for this position, ordered by date
    cur.execute('''
        SELECT id, txn_type, txn_date, shares, purchase_cost, sell_value, bonus_shares, fees
        FROM transactions 
        WHERE stock_symbol = ? AND portfolio = ?
        ORDER BY txn_date, id
    ''', (sym, port))
    
    txns = cur.fetchall()
    
    total_shares = 0.0
    total_cost = 0.0
    realized_pnl = 0.0
    
    for txn_id, txn_type, txn_date, shares, cost, sell_val, bonus, fees in txns:
        shares = shares or 0.0
        cost = cost or 0.0
        sell_val = sell_val or 0.0
        bonus = bonus or 0.0
        fees = fees or 0.0
        
        txn_type_upper = (txn_type or '').upper()
        
        if txn_type_upper == 'BUY':
            total_shares += shares
            total_cost += cost + fees
        elif txn_type_upper in ('BONUS SHARES', 'BONUS', 'STOCK SPLIT'):
            total_shares += (bonus if bonus > 0 else shares)
            # Cost = 0 for bonus shares
        elif txn_type_upper == 'SELL':
            if total_shares > 0:
                avg_cost = total_cost / total_shares
                cost_of_sold = avg_cost * shares
                pnl = (sell_val - fees) - cost_of_sold
                realized_pnl += pnl
                total_cost -= cost_of_sold
                total_shares -= shares
                
        # Calculate current avg cost
        avg_cost = total_cost / total_shares if total_shares > 0 else 0
        
        # Update transaction
        cur.execute('''
            UPDATE transactions SET 
                avg_cost_at_txn = ?,
                realized_pnl_at_txn = ?,
                cost_basis_at_txn = ?,
                shares_held_at_txn = ?
            WHERE id = ?
        ''', (avg_cost, realized_pnl, total_cost, total_shares, txn_id))
        
        print(f'    {txn_id}: {txn_type} {txn_date} - shares_held={total_shares:.0f}, avg_cost={avg_cost:.4f}, realized_pnl={realized_pnl:.2f}')

conn.commit()
print('\nAGILITY positions recalculated')
conn.close()
