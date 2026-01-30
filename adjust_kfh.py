import sqlite3
c = sqlite3.connect('portfolio.db')
cur = c.cursor()

# Adjust KFH reconciliation deposit by -26.21 to account for fees
cur.execute("""
    UPDATE cash_deposits 
    SET amount = amount - 26.21 
    WHERE user_id=2 AND portfolio='KFH' AND description LIKE '%Opening Balance%'
""")
c.commit()

# Verify
cur.execute("""
    SELECT amount FROM cash_deposits 
    WHERE user_id=2 AND portfolio='KFH' AND description LIKE '%Opening Balance%'
""")
print('KFH reconciliation deposit adjusted. New amount:', cur.fetchone()[0])
c.close()
