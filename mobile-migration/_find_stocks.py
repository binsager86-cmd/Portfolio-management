import sqlite3
conn = sqlite3.connect("dev_portfolio.db")
c = conn.cursor()
c.execute("""
    SELECT s.id, s.symbol, COUNT(DISTINCT fs.fiscal_year) as years
    FROM stocks s
    JOIN financial_statements fs ON fs.stock_id = s.id
    GROUP BY s.id, s.symbol
    HAVING years > 3
    ORDER BY years DESC
    LIMIT 10
""")
for r in c.fetchall():
    print(r)
conn.close()
