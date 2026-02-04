"""
Fix Multi-Portfolio Stocks
Ensure stocks appearing in multiple portfolios have correct:
1. Average cost calculated across all shares
2. Separate share counts per portfolio
3. Dividends assigned to correct portfolio
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()

USER_ID = 2

print("=" * 80)
print("MULTI-PORTFOLIO STOCK FIX")
print("=" * 80)

# 1. Check current stocks table
print("\n1. CURRENT STOCKS TABLE:")
print("-" * 80)
cur.execute('''
    SELECT id, symbol, portfolio, avg_cost, shares, currency
    FROM stocks
    WHERE user_id = ? AND symbol IN ('HUMANSOFT', 'SANAM')
    ORDER BY symbol, portfolio
''', (USER_ID,))

current_stocks = cur.fetchall()
for row in current_stocks:
    sid, sym, port, avg, shares, ccy = row
    print(f"  ID {sid}: {sym} | Portfolio: {port} | Shares: {shares:,.0f} | Avg Cost: {avg:.4f} | {ccy}")

# 2. Calculate expected values per portfolio
print("\n2. EXPECTED VALUES (from transactions):")
print("-" * 80)

expected = {}
for sym in ['HUMANSOFT', 'SANAM']:
    expected[sym] = {}
    for port in ['KFH', 'BBYN']:
        cur.execute('''
            SELECT 
                COALESCE(SUM(CASE WHEN txn_type = 'Buy' THEN shares ELSE 0 END), 0) as bought,
                COALESCE(SUM(CASE WHEN txn_type = 'Sell' THEN shares ELSE 0 END), 0) as sold,
                COALESCE(SUM(CASE WHEN txn_type = 'Buy' THEN purchase_cost ELSE 0 END), 0) as total_cost
            FROM transactions
            WHERE user_id = ? AND stock_symbol = ? AND portfolio = ? AND COALESCE(is_deleted, 0) = 0
        ''', (USER_ID, sym, port))
        bought, sold, cost = cur.fetchone()
        net = bought - sold
        avg = cost / bought if bought > 0 else 0
        if bought > 0 or sold > 0:
            expected[sym][port] = {'bought': bought, 'sold': sold, 'net': net, 'cost': cost, 'avg': avg}
            status = "OPEN" if net > 0 else "CLOSED"
            print(f"  {sym} | {port}: Bought {bought:,.0f}, Sold {sold:,.0f}, Net {net:,.0f} shares, Avg {avg:.4f} [{status}]")

# 3. Calculate GLOBAL average cost for each stock (across all portfolios)
print("\n3. GLOBAL AVERAGE COST (across all portfolios):")
print("-" * 80)

global_avg = {}
for sym in ['HUMANSOFT', 'SANAM']:
    cur.execute('''
        SELECT 
            COALESCE(SUM(CASE WHEN txn_type = 'Buy' THEN shares ELSE 0 END), 0) as total_bought,
            COALESCE(SUM(CASE WHEN txn_type = 'Buy' THEN purchase_cost ELSE 0 END), 0) as total_cost
        FROM transactions
        WHERE user_id = ? AND stock_symbol = ? AND COALESCE(is_deleted, 0) = 0
    ''', (USER_ID, sym))
    total_bought, total_cost = cur.fetchone()
    avg = total_cost / total_bought if total_bought > 0 else 0
    global_avg[sym] = avg
    print(f"  {sym}: Total bought {total_bought:,.0f} shares for {total_cost:,.2f} => Avg: {avg:.4f}")

# 4. Check dividends
print("\n4. DIVIDEND ASSIGNMENTS:")
print("-" * 80)
cur.execute('''
    SELECT stock_symbol, portfolio, txn_date, cash_dividend
    FROM transactions
    WHERE user_id = ? AND stock_symbol IN ('HUMANSOFT', 'SANAM') 
    AND COALESCE(cash_dividend, 0) > 0 AND COALESCE(is_deleted, 0) = 0
    ORDER BY stock_symbol, txn_date
''', (USER_ID,))

for row in cur.fetchall():
    sym, port, dt, div = row
    print(f"  {sym} | {port} | {dt} | Div: {div:,.2f}")

# 5. Create/Update stock entries per portfolio
print("\n5. UPDATING STOCKS TABLE:")
print("-" * 80)

for sym in ['HUMANSOFT', 'SANAM']:
    for port, data in expected[sym].items():
        if data['net'] > 0:  # Only if position is open
            # Check if entry exists
            cur.execute('''
                SELECT id FROM stocks 
                WHERE user_id = ? AND symbol = ? AND portfolio = ?
            ''', (USER_ID, sym, port))
            existing = cur.fetchone()
            
            # Use global average cost
            avg_cost = global_avg[sym]
            shares = data['net']
            
            if existing:
                # Update existing
                cur.execute('''
                    UPDATE stocks SET avg_cost = ?, shares = ?
                    WHERE id = ?
                ''', (avg_cost, shares, existing[0]))
                print(f"  UPDATED: {sym} in {port} - {shares:,.0f} shares @ {avg_cost:.4f}")
            else:
                # Get currency from existing entry
                cur.execute('''
                    SELECT currency FROM stocks WHERE user_id = ? AND symbol = ? LIMIT 1
                ''', (USER_ID, sym))
                ccy_row = cur.fetchone()
                ccy = ccy_row[0] if ccy_row else 'KWD'
                
                # Insert new
                cur.execute('''
                    INSERT INTO stocks (user_id, symbol, portfolio, avg_cost, shares, currency)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (USER_ID, sym, port, avg_cost, shares, ccy))
                print(f"  CREATED: {sym} in {port} - {shares:,.0f} shares @ {avg_cost:.4f}")
        else:
            # Position is closed, remove if exists
            cur.execute('''
                DELETE FROM stocks WHERE user_id = ? AND symbol = ? AND portfolio = ?
            ''', (USER_ID, sym, port))
            if cur.rowcount > 0:
                print(f"  REMOVED: {sym} in {port} (position closed)")

conn.commit()

# 6. Recalculate cash balances
print("\n6. RECALCULATING CASH BALANCES:")
print("-" * 80)

for portfolio in ['KFH', 'BBYN', 'USA']:
    # Deposits (excluding deleted)
    cur.execute('''
        SELECT COALESCE(SUM(amount), 0)
        FROM cash_deposits 
        WHERE user_id = ? AND portfolio = ? AND include_in_analysis = 1 AND COALESCE(is_deleted, 0) = 0
    ''', (USER_ID, portfolio))
    deposits = cur.fetchone()[0]
    
    # Buys - use portfolio from transaction directly
    cur.execute('''
        SELECT COALESCE(SUM(purchase_cost), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Buy' 
        AND COALESCE(category, 'portfolio') = 'portfolio'
        AND COALESCE(is_deleted, 0) = 0
    ''', (USER_ID, portfolio))
    buys = cur.fetchone()[0]
    
    # Sells
    cur.execute('''
        SELECT COALESCE(SUM(sell_value), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND txn_type = 'Sell'
        AND COALESCE(category, 'portfolio') = 'portfolio'
        AND COALESCE(is_deleted, 0) = 0
    ''', (USER_ID, portfolio))
    sells = cur.fetchone()[0]
    
    # Dividends (net: cash - reinvested)
    cur.execute('''
        SELECT COALESCE(SUM(COALESCE(cash_dividend, 0) - COALESCE(reinvested_dividend, 0)), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND COALESCE(cash_dividend, 0) > 0
        AND COALESCE(category, 'portfolio') = 'portfolio'
        AND COALESCE(is_deleted, 0) = 0
    ''', (USER_ID, portfolio))
    dividends = cur.fetchone()[0]
    
    # Fees
    cur.execute('''
        SELECT COALESCE(SUM(fees), 0)
        FROM transactions 
        WHERE user_id = ? AND portfolio = ? AND COALESCE(fees, 0) > 0
        AND COALESCE(category, 'portfolio') = 'portfolio'
        AND COALESCE(is_deleted, 0) = 0
    ''', (USER_ID, portfolio))
    fees = cur.fetchone()[0]
    
    net = deposits - buys + sells + dividends - fees
    
    # Update portfolio_cash
    cur.execute('''
        UPDATE portfolio_cash SET balance = ?, manual_override = 0
        WHERE user_id = ? AND portfolio = ?
    ''', (net, USER_ID, portfolio))
    
    print(f"  {portfolio}: Deposits {deposits:,.2f} - Buys {buys:,.2f} + Sells {sells:,.2f} + Div {dividends:,.2f} - Fees {fees:,.2f} = {net:,.2f}")

conn.commit()
conn.close()

print("\n" + "=" * 80)
print("FIX COMPLETE")
print("=" * 80)
