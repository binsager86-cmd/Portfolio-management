import sqlite3

conn = sqlite3.connect(r'c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db')
cur = conn.cursor()

# Simulate the exact backend query for total_cash (stock_id=1)
cur.execute("""SELECT li.amount FROM financial_line_items li
           JOIN financial_statements fs ON fs.id = li.statement_id
           WHERE fs.stock_id = 1 AND fs.statement_type = 'balance'
             AND fs.fiscal_quarter IS NULL
             AND UPPER(li.line_item_code) IN (
               'CASH_AND_EQUIVALENTS','CASH_AND_CASH_EQUIVALENTS',
               'CASH_EQUIVALENTS','CASH_SHORT_TERM_INVESTMENTS',
               'CASH','CASH_BALANCES')
             AND li.amount IS NOT NULL
           ORDER BY fs.fiscal_year DESC,
                    CASE UPPER(li.line_item_code)
                      WHEN 'CASH_SHORT_TERM_INVESTMENTS' THEN 1
                      WHEN 'CASH_EQUIVALENTS' THEN 2
                      WHEN 'CASH_AND_CASH_EQUIVALENTS' THEN 3
                      WHEN 'CASH_AND_EQUIVALENTS' THEN 4
                      WHEN 'CASH_BALANCES' THEN 5
                      WHEN 'CASH' THEN 6
                      ELSE 7 END
           LIMIT 1""")
row = cur.fetchone()
print("Backend cash query result (row):", row)
print("total_cash would be:", row[0] if row else None)
print("type:", type(row[0]) if row else None)

# Also check what query_one returns format
print()
print("Is it tuple?", isinstance(row, tuple))
print("Row[0]:", row[0])

conn.close()
