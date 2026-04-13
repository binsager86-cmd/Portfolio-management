import sqlite3
conn = sqlite3.connect(r'c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db')

print("=== SHARES/OUTSTANDING codes across all statement types ===")
rows = conn.execute(
    "SELECT DISTINCT li.line_item_code, fs.statement_type FROM financial_line_items li "
    "JOIN financial_statements fs ON fs.id = li.statement_id "
    "WHERE LOWER(li.line_item_code) LIKE '%share%' OR LOWER(li.line_item_code) LIKE '%outstanding%' "
    "ORDER BY li.line_item_code"
).fetchall()
for r in rows:
    print(f"{r[0]:60s} [{r[1]}]")

print("\n=== Sample UNLEVERED_FREE_CASH_FLOW values ===")
rows = conn.execute(
    "SELECT fs.stock_id, fs.fiscal_year, li.line_item_code, li.amount "
    "FROM financial_line_items li "
    "JOIN financial_statements fs ON fs.id = li.statement_id "
    "WHERE UPPER(li.line_item_code) IN ('UNLEVERED_FREE_CASH_FLOW','UNLEVERED_FCF') "
    "ORDER BY fs.stock_id, fs.fiscal_year LIMIT 20"
).fetchall()
for r in rows:
    print(r)

print("\n=== Sample FREE_CASH_FLOW values ===")
rows = conn.execute(
    "SELECT fs.stock_id, fs.fiscal_year, li.line_item_code, li.amount "
    "FROM financial_line_items li "
    "JOIN financial_statements fs ON fs.id = li.statement_id "
    "WHERE UPPER(li.line_item_code) IN ('FREE_CASH_FLOW') "
    "ORDER BY fs.stock_id, fs.fiscal_year LIMIT 20"
).fetchall()
for r in rows:
    print(r)

conn.close()
