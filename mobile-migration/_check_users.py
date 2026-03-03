import sqlite3
conn = sqlite3.connect('mobile-migration/dev_portfolio.db')
cur = conn.cursor()
for t in ['transactions', 'cash_deposits', 'portfolios', 'stocks', 'portfolio_transactions', 'external_accounts']:
    cur.execute(f'SELECT user_id, COUNT(*) FROM {t} GROUP BY user_id')
    rows = cur.fetchall()
    total_q = cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'{t}: total={total_q}, by_user={rows}')
conn.close()
