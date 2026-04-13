import sqlite3
conn = sqlite3.connect(r'c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db')

print("=== DEBT / INTEREST / EBIT / OPERATING codes ===")
rows = conn.execute(
    "SELECT DISTINCT li.line_item_code, fs.statement_type FROM financial_line_items li "
    "JOIN financial_statements fs ON fs.id = li.statement_id "
    "WHERE LOWER(li.line_item_code) LIKE '%debt%' OR LOWER(li.line_item_code) LIKE '%interest%' "
    "OR LOWER(li.line_item_code) LIKE '%ebit%' OR LOWER(li.line_item_code) LIKE '%operating_income%' "
    "OR LOWER(li.line_item_code) LIKE '%operating_profit%' OR LOWER(li.line_item_code) LIKE '%equity%' "
    "OR LOWER(li.line_item_code) LIKE '%total_debt%' OR LOWER(li.line_item_code) LIKE '%long_term%' "
    "OR LOWER(li.line_item_code) LIKE '%short_term%' OR LOWER(li.line_item_code) LIKE '%borrowing%' "
    "ORDER BY fs.statement_type, li.line_item_code"
).fetchall()
for r in rows:
    print(f"{r[0]:60s} [{r[1]}]")

print("\n=== Sample Debt-to-Equity / Interest Coverage metric values ===")
rows = conn.execute(
    "SELECT stock_id, fiscal_year, metric_name, metric_value FROM stock_metrics "
    "WHERE metric_name IN ('Debt-to-Equity', 'Interest Coverage') "
    "ORDER BY stock_id, fiscal_year LIMIT 30"
).fetchall()
for r in rows:
    print(r)

conn.close()
