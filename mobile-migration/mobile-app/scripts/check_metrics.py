import sqlite3

conn = sqlite3.connect(r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db")
conn.row_factory = sqlite3.Row

# List tables first
tables = [t["name"] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"Tables: {tables}")

# Find the analysis stocks table
stock_table = [t for t in tables if "stock" in t.lower() and "metric" not in t.lower()]
print(f"Stock tables: {stock_table}")

stocks = conn.execute("SELECT * FROM analysis_stocks WHERE symbol LIKE '%HUMANSOFT%'").fetchall()
print(f"Stocks found: {len(stocks)}")
for s in stocks:
    print(f"  id={s['id']} symbol={s['symbol']}")

if not stocks:
    print("No HUMANSOFT stock found")
    conn.close()
    exit()

stock_id = stocks[0]["id"]
metrics = conn.execute(
    "SELECT metric_type, metric_name, metric_value, fiscal_year, fiscal_quarter "
    "FROM stock_metrics WHERE stock_id = ? ORDER BY metric_type, fiscal_year",
    (stock_id,),
).fetchall()

print(f"\nTotal metrics: {len(metrics)}")
for m in metrics[:20]:
    print(f"  type={m['metric_type']:<15} year={m['fiscal_year']} q={m['fiscal_quarter']}  name={m['metric_name']:<30} value={m['metric_value']}")

if len(metrics) > 20:
    print(f"  ... and {len(metrics) - 20} more")

types = sorted(set(m["metric_type"] for m in metrics))
years = sorted(set(m["fiscal_year"] for m in metrics))
print(f"\nUnique metric_types: {types}")
print(f"Unique fiscal_years: {years}")
print(f"Any null values: {any(m['metric_value'] is None for m in metrics)}")

conn.close()
