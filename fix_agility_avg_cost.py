import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

# Get distinct (symbol, portfolio) combinations for AGILITY
cur.execute("SELECT DISTINCT stock_symbol, portfolio FROM transactions WHERE stock_symbol LIKE '%AGILITY%'")
positions = cur.fetchall()

print('=== Recalculating AGILITY positions (preserving avg_cost for sells) ===')
for sym, port in positions:
    print(f'\n  {sym} / {port}')
    
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
        
        # Calculate avg_cost BEFORE the transaction modifies it
        avg_cost_before = total_cost / total_shares if total_shares > 0 else 0
        
        if txn_type_upper == 'BUY':
            total_shares += shares
            total_cost += cost + fees
            # After buy, recalculate avg cost
            avg_cost_after = total_cost / total_shares if total_shares > 0 else 0
            avg_cost_to_store = avg_cost_after
            
        elif txn_type_upper in ('BONUS SHARES', 'BONUS', 'STOCK SPLIT'):
            total_shares += (bonus if bonus > 0 else shares)
            # Cost stays the same, so avg cost decreases
            avg_cost_after = total_cost / total_shares if total_shares > 0 else 0
            avg_cost_to_store = avg_cost_after
            
        elif txn_type_upper == 'SELL':
            if total_shares > 0:
                # Use avg_cost_before for the sell calculation
                cost_of_sold = avg_cost_before * shares
                pnl = (sell_val - fees) - cost_of_sold
                realized_pnl += pnl
                total_cost -= cost_of_sold
                total_shares -= shares
                
            # For SELL, store the avg_cost that was used (before the sale)
            avg_cost_to_store = avg_cost_before
            
        else:
            # Other transaction types (dividends, etc.)
            avg_cost_to_store = avg_cost_before
        
        # Update transaction with avg_cost preserved for sells
        cur.execute('''
            UPDATE transactions SET 
                avg_cost_at_txn = ?,
                realized_pnl_at_txn = ?,
                cost_basis_at_txn = ?,
                shares_held_at_txn = ?
            WHERE id = ?
        ''', (avg_cost_to_store, realized_pnl, total_cost, total_shares, txn_id))
        
        print(f'    {txn_id}: {txn_type:15} {txn_date} - avg_cost={avg_cost_to_store:.4f}, shares_held={total_shares:.0f}, pnl={realized_pnl:.2f}')

conn.commit()
print('\n✅ AGILITY positions recalculated with preserved avg_cost for sells')
conn.close()
