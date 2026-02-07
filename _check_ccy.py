"""Check cash_deposits currency breakdown"""
import sqlite3, pandas as pd
conn = sqlite3.connect('portfolio.db')

df = pd.read_sql("""
    SELECT deposit_date, amount, currency, portfolio 
    FROM cash_deposits 
    WHERE (include_in_analysis=1 OR include_in_analysis IS NULL) 
    AND (is_deleted IS NULL OR is_deleted=0)
    ORDER BY deposit_date
""", conn)

print("ALL DEPOSITS:")
print(df[['deposit_date','amount','currency','portfolio']].to_string())
print()
print("Currency counts:")
print(df['currency'].value_counts())
print()
print(f"USD deposits total: {df[df['currency']=='USD']['amount'].sum():,.2f}")
print(f"KWD deposits total: {df[df['currency']=='KWD']['amount'].sum():,.2f}")
print(f"NULL currency total: {df[df['currency'].isna()]['amount'].sum():,.2f}")

conn.close()
