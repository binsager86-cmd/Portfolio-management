import sqlite3
conn = sqlite3.connect(r'c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db')
rows = conn.execute(
    "SELECT DISTINCT li.line_item_code FROM financial_line_items li "
    "JOIN financial_statements fs ON fs.id = li.statement_id "
    "WHERE fs.statement_type = 'cashflow' ORDER BY li.line_item_code"
).fetchall()
for r in rows:
    print(r[0])
