import sqlite3
c = sqlite3.connect('dev_portfolio.db')
tables = [t[0] for t in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pfm%'").fetchall()]
print('PFM tables:', tables)
for t in tables:
    cnt = c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'  {t}: {cnt} rows')
c.close()
