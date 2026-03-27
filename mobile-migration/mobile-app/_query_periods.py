import sqlite3
db = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")
rows = db.execute(
    "SELECT DISTINCT fiscal_year, period_end_date FROM financial_statements WHERE stock_id = 1 ORDER BY fiscal_year"
).fetchall()
for r in rows:
    print(r)
db.close()
