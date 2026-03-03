"""Check portfolio_snapshots in BOTH databases for all user_ids to find the source of 146,045.579"""
import sqlite3, os

for label, db_path in [
    ("Streamlit (portfolio.db)", "portfolio.db"),
    ("Mobile (dev_portfolio.db)", "mobile-migration/dev_portfolio.db"),
]:
    full = os.path.join(os.path.dirname(__file__), db_path)
    if not os.path.exists(full):
        print(f"\n{'='*60}\n{label}: NOT FOUND\n{'='*60}")
        continue
    conn = sqlite3.connect(full)
    cur = conn.cursor()
    
    # Check what user_ids exist
    cur.execute("SELECT DISTINCT user_id FROM portfolio_snapshots ORDER BY user_id")
    user_ids = [r[0] for r in cur.fetchall()]
    print(f"\n{'='*60}")
    print(f"{label}")
    print(f"User IDs in snapshots: {user_ids}")
    print(f"{'='*60}")
    
    for uid in user_ids:
        cur.execute("""
            SELECT snapshot_date, portfolio_value, accumulated_cash, net_gain
            FROM portfolio_snapshots
            WHERE user_id = ?
            ORDER BY snapshot_date DESC
            LIMIT 5
        """, (uid,))
        rows = cur.fetchall()
        print(f"\n  user_id={uid} — Last 5 snapshots:")
        for r in rows:
            print(f"    {r[0]}  pv={r[1]:,.3f}  acc_cash={r[2]:,.3f}  net_gain={r[3]:,.3f}")
        
        cur.execute("SELECT COUNT(*) FROM portfolio_snapshots WHERE user_id = ?", (uid,))
        cnt = cur.fetchone()[0]
        print(f"    Total snapshots: {cnt}")
    
    conn.close()
