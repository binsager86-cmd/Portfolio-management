import sqlite3, time
db = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")
now = int(time.time())

rows = db.execute(
    "SELECT fs.stock_id, fs.fiscal_year, fs.period_end_date, li.amount "
    "FROM financial_line_items li "
    "JOIN financial_statements fs ON li.statement_id = fs.id "
    "WHERE UPPER(li.line_item_code) = 'FREE_CASH_FLOW' "
    "GROUP BY fs.stock_id, fs.fiscal_year "
    "ORDER BY fs.stock_id, fs.fiscal_year"
).fetchall()

for stock_id, fiscal_year, period_end_date, amount in rows:
    existing = db.execute(
        "SELECT id FROM stock_metrics WHERE stock_id = ? AND metric_name = ? AND period_end_date = ?",
        (stock_id, "Free Cash Flow", period_end_date),
    ).fetchone()
    if existing:
        db.execute("UPDATE stock_metrics SET metric_value = ?, created_at = ? WHERE id = ?", (amount, now, existing[0]))
        print(f"  Updated: stock={stock_id} FY{fiscal_year} = {amount}")
    else:
        db.execute(
            "INSERT INTO stock_metrics (stock_id, fiscal_year, fiscal_quarter, period_end_date, metric_type, metric_name, metric_value, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (stock_id, fiscal_year, None, period_end_date, "cashflow", "Free Cash Flow", amount, now),
        )
        print(f"  Inserted: stock={stock_id} FY{fiscal_year} = {amount}")

db.commit()
print(f"\nDone. Processed {len(rows)} records.")
db.close()
