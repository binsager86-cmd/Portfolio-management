import sqlite3, pandas as pd
conn = sqlite3.connect("portfolio.db")
df = pd.read_sql("SELECT id, deposit_date, amount, currency, portfolio FROM cash_deposits WHERE UPPER(currency) = 'USD'", conn)
print(df.to_string())
conn.close()
