import sqlite3

def fix_accumulated_cash():
    """Recalculate accumulated_cash for all existing snapshots."""
    conn = sqlite3.connect('portfolio.db')
    cur = conn.cursor()
    
    # Get all snapshots ordered by date
    cur.execute("SELECT snapshot_date, deposit_cash, beginning_difference FROM portfolio_snapshots ORDER BY snapshot_date")
    rows = cur.fetchall()
    
    accumulated_cash = None
    updates = []
    
    for snapshot_date, deposit_cash, beginning_diff in rows:
        deposit_cash = float(deposit_cash) if deposit_cash is not None else 0.0
        beginning_diff = float(beginning_diff) if beginning_diff is not None else 0.0
        
        # Apply the accumulated cash logic
        if accumulated_cash is None:
            # No previous accumulated value
            if deposit_cash > 0:
                accumulated_cash = deposit_cash
            # else: stays None
        else:
            # Has previous accumulated value
            if deposit_cash > 0:
                # Add new deposit to previous accumulated
                accumulated_cash += deposit_cash
            # else: carry forward previous value (no change to accumulated_cash)
        
        # Recalculate net_gain and roi_percent
        net_gain = beginning_diff - accumulated_cash if accumulated_cash else beginning_diff
        roi_percent = (net_gain / accumulated_cash * 100) if accumulated_cash and accumulated_cash > 0 else 0
        
        updates.append((accumulated_cash, net_gain, roi_percent, snapshot_date))
        
        print(f"{snapshot_date}: deposit={deposit_cash:>8.3f}, accumulated={accumulated_cash if accumulated_cash else 'None':>10}, net_gain={net_gain:>10.3f}")
    
    # Update all records
    cur.executemany(
        "UPDATE portfolio_snapshots SET accumulated_cash = ?, net_gain = ?, roi_percent = ? WHERE snapshot_date = ?",
        updates
    )
    
    conn.commit()
    print(f"\n✅ Updated {len(updates)} records")
    conn.close()

if __name__ == "__main__":
    fix_accumulated_cash()
