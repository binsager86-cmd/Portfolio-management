import sqlite3
conn = sqlite3.connect('portfolio.db')
cur = conn.cursor()
cur.execute('PRAGMA table_info(cash_deposits)')
print('Column               Type      NotNull  Default')
print('-'*55)
for c in cur.fetchall():
    notnull = "REQUIRED" if c[3] == 1 else "optional"
    print(f"{c[1]:<20} {c[2]:<10} {notnull:<10} {c[4]}")
conn.close()
