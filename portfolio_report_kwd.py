import sqlite3
from datetime import date

DB_NAME = "portfolio.db"

def get_base_currency(cur):
    cur.execute("SELECT value FROM settings WHERE key='base_currency'")
    row = cur.fetchone()
    return row[0] if row else "KWD"

def get_fx_rate(cur, rate_date, from_ccy, to_ccy):
    if from_ccy == to_ccy:
        return 1.0

    cur.execute("""
        SELECT rate
        FROM fx_rates
        WHERE rate_date = ? AND from_ccy = ? AND to_ccy = ?
    """, (rate_date, from_ccy, to_ccy))
    row = cur.fetchone()
    if row:
        return float(row[0])

    cur.execute("""
        SELECT rate
        FROM fx_rates
        WHERE from_ccy = ? AND to_ccy = ?
        ORDER BY rate_date DESC
        LIMIT 1
    """, (from_ccy, to_ccy))
    row = cur.fetchone()
    if row:
        return float(row[0])

    return None

def main():
    today = date.today().isoformat()

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    base_ccy = get_base_currency(cur)

    # Cash balances
    cur.execute("""
        SELECT currency, SUM(cash_amount)
        FROM ledger_entries
        GROUP BY currency
    """)
    cash_rows = cur.fetchall()

    # Holdings
    cur.execute("""
        SELECT
            a.asset_id,
            a.symbol,
            a.asset_type,
            a.exchange,
            a.currency,
            SUM(
                CASE
                    WHEN le.entry_type = 'BUY' THEN le.quantity
                    WHEN le.entry_type = 'BONUS_SHARES' THEN le.quantity
                    WHEN le.entry_type = 'SELL' THEN -le.quantity
                    ELSE 0
                END
            ) AS qty
        FROM ledger_entries le
        JOIN assets a ON a.asset_id = le.asset_id
        GROUP BY a.asset_id, a.symbol, a.asset_type, a.exchange, a.currency
        HAVING ABS(qty) > 0.000001
    """)
    holdings = cur.fetchall()

    # Average cost
    cur.execute("""
        SELECT
            a.asset_id,
            SUM(CASE WHEN le.entry_type='BUY' THEN le.quantity * le.price ELSE 0 END),
            SUM(CASE WHEN le.entry_type IN ('BUY','BONUS_SHARES') THEN le.quantity ELSE 0 END)
        FROM ledger_entries le
        JOIN assets a ON a.asset_id = le.asset_id
        GROUP BY a.asset_id
    """)
    avg_map = {}
    for asset_id, cost, qty in cur.fetchall():
        if qty and qty != 0:
            avg_map[asset_id] = cost / qty

    def latest_price(asset_id):
        cur.execute("""
            SELECT close_price, currency
            FROM prices p
            JOIN assets a ON a.asset_id = p.asset_id
            WHERE p.asset_id = ?
            ORDER BY price_date DESC
            LIMIT 1
        """, (asset_id,))
        row = cur.fetchone()
        return row if row else None

    print("\n==============================")
    print("📊 PORTFOLIO REPORT (KWD)")
    print("==============================")
    print(f"Date: {today}\n")

    total_cash_kwd = 0
    print("💰 Cash:")
    for ccy, bal in cash_rows:
        fx = get_fx_rate(cur, today, ccy, base_ccy)
        if fx:
            kwd = bal * fx
            total_cash_kwd += kwd
            print(f"  {ccy}: {bal:.2f} → {kwd:.2f} KWD")
        else:
            print(f"  {ccy}: {bal:.2f} (no FX)")

    total_holdings_kwd = 0
    total_unreal = 0

    print("\n📦 Holdings:")
    for asset_id, sym, atype, exch, ccy, qty in holdings:
        price_row = latest_price(asset_id)
        if not price_row:
            print(f"  {sym}: no price")
            continue

        price, _ = price_row
        fx = get_fx_rate(cur, today, ccy, base_ccy)
        if not fx:
            print(f"  {sym}: no FX")
            continue

        value_kwd = qty * price * fx
        total_holdings_kwd += value_kwd

        avg = avg_map.get(asset_id)
        unreal = 0
        if avg is not None:
            unreal = (price - avg) * qty * fx
            total_unreal += unreal

        print(f"""
  {sym}
    Qty        : {qty}
    Price      : {price} {ccy}
    Avg Cost   : {avg if avg else 'N/A'} {ccy}
    Value      : {value_kwd:.2f} KWD
    Unreal P/L : {unreal:.2f} KWD
""")

    print("------------------------------")
    print(f"Total Cash     : {total_cash_kwd:.2f} KWD")
    print(f"Total Holdings : {total_holdings_kwd:.2f} KWD")
    print(f"Total Portfolio: {(total_cash_kwd + total_holdings_kwd):.2f} KWD")
    print(f"Unrealized P/L : {total_unreal:.2f} KWD")
    print("------------------------------\n")

    conn.close()

if __name__ == "__main__":
    main()
