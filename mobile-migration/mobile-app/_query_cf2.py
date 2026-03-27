import sqlite3
db = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")

# Check statement types
print("=== Statement Types ===")
rows = db.execute("SELECT DISTINCT statement_type FROM financial_statements").fetchall()
for r in rows:
    print(r)

# Check tables
print("\n=== Tables ===")
rows = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for r in rows:
    print(r)

# Check all line items with cash flow related names
print("\n=== Cash flow line items (by code) ===")
rows = db.execute(
    "SELECT DISTINCT line_item_code, line_item_name FROM financial_line_items "
    "WHERE LOWER(line_item_code) LIKE '%cash%' OR LOWER(line_item_code) LIKE '%fcf%' "
    "OR LOWER(line_item_code) LIKE '%free%' OR LOWER(line_item_code) LIKE '%levered%' "
    "ORDER BY line_item_code"
).fetchall()
for r in rows:
    print(r)

# Check metrics with category cashflow
print("\n=== Cashflow metrics ===")
rows = db.execute(
    "SELECT DISTINCT metric_name FROM stock_metrics WHERE metric_type = 'cashflow'"
).fetchall()
for r in rows:
    print(r)

db.close()
