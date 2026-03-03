"""Check what drives the Ending Value in both DBs."""
import sqlite3, os

# Check both DBs
for label, db_path, uid in [
    ("Streamlit", os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio.db"), 2),
    ("Mobile", os.path.join(os.path.dirname(os.path.abspath(__file__)), "mobile-migration", "dev_portfolio.db"), 1),
]:
    print(f"\n===== {label} DB (user_id={uid}) =====")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Latest snapshots
    cur.execute("""
        SELECT snapshot_date, portfolio_value, deposit_cash, accumulated_cash, 
               daily_movement, beginning_difference, net_gain, change_percent, roi_percent
        FROM portfolio_snapshots
        WHERE user_id = ?
        ORDER BY snapshot_date DESC
        LIMIT 5
    """, (uid,))
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"\nLatest 5 snapshots:")
    for r in rows:
        d = dict(zip(cols, r))
        print(f"  {d['snapshot_date']}: pv={d['portfolio_value']}, dep_cash={d['deposit_cash']}, "
              f"acc_cash={d['accumulated_cash']}, net_gain={d['net_gain']}")

    # Count total snapshots
    cur.execute("SELECT COUNT(*) FROM portfolio_snapshots WHERE user_id=?", (uid,))
    print(f"\nTotal snapshots: {cur.fetchone()[0]}")

    # First snapshot
    cur.execute("""
        SELECT snapshot_date, portfolio_value, deposit_cash, accumulated_cash
        FROM portfolio_snapshots WHERE user_id=?
        ORDER BY snapshot_date ASC LIMIT 1
    """, (uid,))
    r = cur.fetchone()
    if r:
        print(f"First snapshot: date={r[0]}, pv={r[1]}, dep_cash={r[2]}, acc_cash={r[3]}")

    conn.close()
