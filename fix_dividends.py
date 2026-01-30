import sqlite3

c = sqlite3.connect('portfolio.db')
cur = c.cursor()

# Update any record-only dividends to be included in portfolio
cur.execute("UPDATE transactions SET category='portfolio' WHERE txn_type='DIVIDEND_ONLY' AND category='record'")
print(f"Updated {cur.rowcount} dividend records from 'record' to 'portfolio'")

c.commit()
c.close()
