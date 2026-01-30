"""Force recalculation of cash balances using the UNION ALL aggregation query."""
import sqlite3
import time

conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()
user_id = 2

print("=== BEFORE ===")
cur.execute("SELECT portfolio, balance FROM portfolio_cash WHERE user_id=?", (user_id,))
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]:,.2f}")

# Reset all balances to 0
cur.execute("UPDATE portfolio_cash SET balance = 0, last_updated = ? WHERE user_id = ?",
            (int(time.time()), user_id))

# Run the aggregation query
aggregation_sql = """
    SELECT portfolio, SUM(net_change) as total_change
    FROM (
        SELECT portfolio, COALESCE(amount, 0) as net_change
        FROM cash_deposits
        WHERE user_id = ? AND include_in_analysis = 1

        UNION ALL

        SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, -1 * COALESCE(t.purchase_cost, 0) as net_change
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND t.txn_type = 'Buy' AND COALESCE(t.category, 'portfolio') = 'portfolio'

        UNION ALL

        SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, COALESCE(t.sell_value, 0) as net_change
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND t.txn_type = 'Sell' AND COALESCE(t.category, 'portfolio') = 'portfolio'

        UNION ALL

        SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, COALESCE(t.cash_dividend, 0) as net_change
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.cash_dividend, 0) > 0 AND COALESCE(t.category, 'portfolio') = 'portfolio'

        UNION ALL

        SELECT COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio, -1 * COALESCE(t.fees, 0) as net_change
        FROM transactions t
        LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
        WHERE t.user_id = ? AND COALESCE(t.fees, 0) > 0 AND COALESCE(t.category, 'portfolio') = 'portfolio'
    ) AS cash_movements
    GROUP BY portfolio
"""

cur.execute(aggregation_sql, (user_id, user_id, user_id, user_id, user_id))
results = cur.fetchall()

# Upsert balances
for row in results:
    portfolio = row[0]
    total_balance = float(row[1]) if row[1] else 0.0
    
    if portfolio is None:
        continue
    
    cur.execute("SELECT 1 FROM portfolio_cash WHERE user_id = ? AND portfolio = ?", (user_id, portfolio))
    exists = cur.fetchone()
    
    if exists:
        cur.execute("UPDATE portfolio_cash SET balance = ?, last_updated = ? WHERE user_id = ? AND portfolio = ?",
                    (total_balance, int(time.time()), user_id, portfolio))
    else:
        cur.execute("INSERT INTO portfolio_cash (user_id, portfolio, balance, currency, last_updated) VALUES (?, ?, ?, 'KWD', ?)",
                    (user_id, portfolio, total_balance, int(time.time())))

conn.commit()

print("\n=== AFTER ===")
cur.execute("SELECT portfolio, balance FROM portfolio_cash WHERE user_id=?", (user_id,))
total = 0
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]:,.2f}")
    total += row[1]

print(f"\n=== TOTAL CASH: {total:,.2f} ===")

conn.close()
print("\n✅ Cash balances recalculated successfully!")
