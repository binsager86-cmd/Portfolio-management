import sqlite3
db = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")

# Get levered free cash flow values across years
print("=== LEVERED_FREE_CASH_FLOW line items ===")
rows = db.execute(
    "SELECT fs.stock_id, fs.fiscal_year, li.amount, li.line_item_name "
    "FROM financial_line_items li "
    "JOIN financial_statements fs ON li.statement_id = fs.id "
    "WHERE UPPER(li.line_item_code) = 'LEVERED_FREE_CASH_FLOW' "
    "ORDER BY fs.stock_id, fs.fiscal_year"
).fetchall()
for r in rows:
    print(r)

# Also check FREE_CASH_FLOW
print("\n=== FREE_CASH_FLOW line items ===")
rows = db.execute(
    "SELECT fs.stock_id, fs.fiscal_year, li.amount, li.line_item_name "
    "FROM financial_line_items li "
    "JOIN financial_statements fs ON li.statement_id = fs.id "
    "WHERE UPPER(li.line_item_code) = 'FREE_CASH_FLOW' "
    "ORDER BY fs.stock_id, fs.fiscal_year"
).fetchall()
for r in rows:
    print(r)

# Check what cashflow metrics exist
print("\n=== All cashflow category metrics ===")
rows = db.execute(
    "SELECT stock_id, fiscal_year, metric_name, metric_value "
    "FROM stock_metrics "
    "WHERE metric_type = 'cashflow' "
    "ORDER BY stock_id, fiscal_year, metric_name"
).fetchall()
for r in rows:
    print(r)

db.close()
