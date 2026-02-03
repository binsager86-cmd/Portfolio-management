"""Check KRE transactions in detail"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
c = conn.cursor()

print("=" * 70)
print("ALL KRE TRANSACTIONS (user_id=2):")
print("=" * 70)

c.execute("""
    SELECT id, txn_date, txn_type, shares, bonus_shares, purchase_cost, sell_value, is_deleted
    FROM transactions 
    WHERE stock_symbol = 'KRE' AND user_id = 2
    ORDER BY txn_date
""")

total_bought = 0
total_bonus = 0
total_sold = 0
total_cost = 0

for r in c.fetchall():
    tx_id, date, txn_type, shares, bonus, cost, sell_val, deleted = r
    shares = shares or 0
    bonus = bonus or 0
    cost = cost or 0
    sell_val = sell_val or 0
    
    if txn_type == 'Buy':
        total_bought += shares
        total_cost += cost
    elif txn_type == 'Sell':
        total_sold += shares
    
    total_bonus += bonus
    
    status = "[DELETED]" if deleted == 1 else ""
    print(f"id={tx_id:5} date={date} type={txn_type:6} shares={shares:8.0f} bonus={bonus:6.0f} cost={cost:10.2f} sell={sell_val:10.2f} {status}")

print("-" * 70)
print(f"Total Bought: {total_bought}")
print(f"Total Bonus:  {total_bonus}")
print(f"Total Sold:   {total_sold}")
print(f"Net Position: {total_bought + total_bonus - total_sold}")
print(f"Total Cost:   {total_cost}")

net = total_bought + total_bonus - total_sold
if net > 0 and total_cost > 0:
    print(f"Avg Cost:     {total_cost / net:.6f}")
else:
    print(f"Avg Cost:     CANNOT CALCULATE (net={net}, cost={total_cost})")

conn.close()
