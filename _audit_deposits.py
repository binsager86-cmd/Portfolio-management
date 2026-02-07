"""Quick audit: sum deposits, find the KD 120,728 vs KD 116,078 gap."""
import sqlite3, pandas as pd
conn = sqlite3.connect("portfolio.db")

df = pd.read_sql("""
    SELECT id, deposit_date, amount, COALESCE(currency,'KWD') as currency,
           portfolio, include_in_analysis, is_deleted
    FROM cash_deposits
    WHERE deposit_date IS NOT NULL
    AND deposit_date > '1971-01-01'
    AND amount > 0
    AND (include_in_analysis = 1 OR include_in_analysis IS NULL)
    AND (is_deleted IS NULL OR is_deleted = 0)
    ORDER BY deposit_date
""", conn)

print("ALL QUALIFYING DEPOSITS:")
pd.set_option('display.max_rows', 100)
pd.set_option('display.width', 140)
print(df.to_string(index=False))
print()

kwd = df[df['currency'].str.upper() == 'KWD']
usd = df[df['currency'].str.upper() == 'USD']
print(f"KWD deposits : {len(kwd)} rows, total = {kwd['amount'].sum():,.2f} KWD")
print(f"USD deposits : {len(usd)} rows, total = ${usd['amount'].sum():,.2f}")
print(f"USD→KWD @0.307: {usd['amount'].sum() * 0.307:,.2f} KWD")
print(f"Grand total KWD: {kwd['amount'].sum() + usd['amount'].sum() * 0.307:,.2f}")
print()

# Negative amounts (withdrawals stored in cash_deposits)
neg = pd.read_sql("""
    SELECT id, deposit_date, amount, COALESCE(currency,'KWD') as currency, portfolio
    FROM cash_deposits
    WHERE amount < 0
    AND (include_in_analysis = 1 OR include_in_analysis IS NULL)
    AND (is_deleted IS NULL OR is_deleted = 0)
""", conn)
print(f"Negative (withdrawal) rows: {len(neg)}")
if len(neg) > 0:
    print(neg.to_string(index=False))
    print(f"  Withdrawal total: {neg['amount'].sum():,.2f}")

print()
print("--- USD rows (ALL, including deleted/excluded) ---")
all_usd = pd.read_sql("""
    SELECT id, deposit_date, amount, currency, portfolio, include_in_analysis, is_deleted
    FROM cash_deposits WHERE UPPER(currency) = 'USD'
""", conn)
print(all_usd.to_string(index=False))

print()
# Net deposits (positive + negative)
net = pd.read_sql("""
    SELECT COALESCE(currency,'KWD') as currency, SUM(amount) as net
    FROM cash_deposits
    WHERE deposit_date IS NOT NULL AND deposit_date > '1971-01-01'
    AND (include_in_analysis = 1 OR include_in_analysis IS NULL)
    AND (is_deleted IS NULL OR is_deleted = 0)
    GROUP BY currency
""", conn)
print("NET deposits (incl. withdrawals) by currency:")
print(net.to_string(index=False))
kwd_net = net.loc[net['currency']=='KWD', 'net'].sum()
usd_net = net.loc[net['currency']=='USD', 'net'].sum()
print(f"Net total KWD: {kwd_net + usd_net * 0.307:,.2f}")

conn.close()
