import sqlite3
db = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")
rows = db.execute(
    "SELECT DISTINCT li.line_item_code, li.line_item_name "
    "FROM financial_line_items li "
    "JOIN financial_statements fs ON li.statement_id = fs.id "
    "WHERE fs.statement_type = 'cash_flow' "
    "ORDER BY li.line_item_code"
).fetchall()
for r in rows:
    print(r)
db.close()
