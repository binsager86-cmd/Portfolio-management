"""
Set cash balances to ground truth values and add reconciliation deposits.

GROUND TRUTH:
- KFH / KWD → 32,790.311
- BBYN / KWD → 16,866.072  
- USA / USD → 179.06
"""
import sqlite3
import time

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()
user_id = 2

GROUND_TRUTH = {
    'KFH': (32790.311, 'KWD'),
    'BBYN': (16866.072, 'KWD'),
    'USA': (179.06, 'USD'),
}

# First, compute what we get from historical data
print("=== Computing historical cash ===")

computed = {}
for port in ['KFH', 'BBYN', 'USA']:
    # Deposits
    cur.execute("""
        SELECT COALESCE(SUM(amount), 0) FROM cash_deposits 
        WHERE user_id = ? AND portfolio = ? AND include_in_analysis = 1
    """, (user_id, port))
    deposits = cur.fetchone()[0]
    
    # Buys
    cur.execute("""
        SELECT COALESCE(SUM(t.purchase_cost), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
          AND t.txn_type = 'Buy' AND COALESCE(t.category, 'portfolio') = 'portfolio'
    """, (user_id, port))
    buys = cur.fetchone()[0]
    
    # Sells
    cur.execute("""
        SELECT COALESCE(SUM(t.sell_value), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
          AND t.txn_type = 'Sell' AND COALESCE(t.category, 'portfolio') = 'portfolio'
    """, (user_id, port))
    sells = cur.fetchone()[0]
    
    # Dividends
    cur.execute("""
        SELECT COALESCE(SUM(t.cash_dividend), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
          AND COALESCE(t.cash_dividend, 0) > 0 AND COALESCE(t.category, 'portfolio') = 'portfolio'
    """, (user_id, port))
    dividends = cur.fetchone()[0]
    
    # Fees
    cur.execute("""
        SELECT COALESCE(SUM(t.fees), 0)
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.portfolio, s.portfolio, 'KFH') = ?
          AND COALESCE(t.fees, 0) > 0 AND COALESCE(t.category, 'portfolio') = 'portfolio'
    """, (user_id, port))
    fees = cur.fetchone()[0]
    
    # Cash = Deposits - Buys + Sells + Dividends - Fees
    cash = deposits - buys + sells + dividends - fees
    computed[port] = cash
    
    gt, ccy = GROUND_TRUTH[port]
    diff = gt - cash
    
    print(f"\n{port} ({ccy}):")
    print(f"  Deposits:    +{deposits:>12,.3f}")
    print(f"  Buys:        -{buys:>12,.3f}")
    print(f"  Sells:       +{sells:>12,.3f}")
    print(f"  Dividends:   +{dividends:>12,.3f}")
    print(f"  Fees:        -{fees:>12,.3f}")
    print(f"  Computed:     {cash:>12,.3f}")
    print(f"  Ground Truth: {gt:>12,.3f}")
    print(f"  Adjustment:  {diff:>+12,.3f}")

# Add adjustment deposits for the differences
print("\n=== Adding Reconciliation Deposits ===")

ts = int(time.time())
today = "2026-01-30"

for port in ['KFH', 'BBYN', 'USA']:
    gt, ccy = GROUND_TRUTH[port]
    diff = gt - computed[port]
    
    if abs(diff) > 0.01:  # Only add if difference is significant
        # Check if reconciliation deposit already exists
        cur.execute("""
            SELECT id FROM cash_deposits 
            WHERE user_id = ? AND portfolio = ? AND description LIKE '%Opening Balance%'
        """, (user_id, port))
        existing = cur.fetchone()
        
        if existing:
            # Update existing
            cur.execute("""
                UPDATE cash_deposits 
                SET amount = ?, deposit_date = ?
                WHERE id = ?
            """, (diff, today, existing[0]))
            print(f"  {port}: Updated existing reconciliation deposit to {diff:+,.3f} {ccy}")
        else:
            # Insert new
            cur.execute("""
                INSERT INTO cash_deposits 
                (user_id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (user_id, port, "Adjustment", today, diff, ccy, 
                  "Opening Balance Reconciliation", 
                  "Auto-generated to reconcile computed cash with actual broker balance",
                  ts))
            print(f"  {port}: Added reconciliation deposit of {diff:+,.3f} {ccy}")
    else:
        print(f"  {port}: No adjustment needed (diff = {diff:,.3f})")

conn.commit()

# Now update portfolio_cash with the ground truth values
print("\n=== Setting portfolio_cash to Ground Truth ===")

for port, (balance, ccy) in GROUND_TRUTH.items():
    cur.execute("""
        INSERT INTO portfolio_cash (user_id, portfolio, balance, currency, last_updated)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(portfolio, user_id) DO UPDATE SET
            balance = excluded.balance,
            currency = excluded.currency,
            last_updated = excluded.last_updated
    """, (user_id, port, balance, ccy, ts))
    print(f"  {port}: {balance:,.3f} {ccy}")

conn.commit()

# Verify
print("\n=== Verification ===")
cur.execute("SELECT portfolio, balance, currency FROM portfolio_cash WHERE user_id=? ORDER BY portfolio", (user_id,))
for row in cur.fetchall():
    gt_val, gt_ccy = GROUND_TRUTH.get(row[0], (0, '?'))
    match = "✅" if abs(row[1] - gt_val) < 0.01 else "❌"
    print(f"  {row[0]}: {row[1]:>12,.3f} {row[2]} {match}")

conn.close()
print("\n✅ Done! Cash balances set to ground truth values.")
