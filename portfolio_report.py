import sqlite3

DB_NAME = "portfolio.db"

def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # 1) Cash balance by currency (from ledger)
    cur.execute("""
        SELECT currency, ROUND(SUM(cash_amount), 2) AS cash_balance
        FROM ledger_entries
        GROUP BY currency
        ORDER BY currency
    """)
    cash_rows = cur.fetchall()

    # 2) Holdings by asset:
    # BUY adds qty, SELL subtracts qty, BONUS_SHARES adds qty
    cur.execute("""
        SELECT
            a.symbol,
            a.asset_type,
            a.exchange,
            a.currency,
            ROUND(SUM(
                CASE
                    WHEN le.entry_type = 'BUY' THEN le.quantity
                    WHEN le.entry_type = 'BONUS_SHARES' THEN le.quantity
                    WHEN le.entry_type = 'SELL' THEN -le.quantity
                    ELSE 0
                END
            ), 6) AS quantity
        FROM ledger_entries le
        JOIN assets a ON a.asset_id = le.asset_id
        GROUP BY a.symbol, a.asset_type, a.exchange, a.currency
        HAVING ABS(quantity) > 0.0000001
        ORDER BY a.asset_type, a.symbol
    """)
    holding_rows = cur.fetchall()

    # 3) Average cost INCLUDING bonus shares:
    # total buy cost / (buy qty + bonus qty)
    cur.execute("""
        SELECT
            a.symbol,
            ROUND(
                SUM(CASE WHEN le.entry_type='BUY' THEN le.quantity * le.price ELSE 0 END)
                /
                NULLIF(SUM(CASE WHEN le.entry_type IN ('BUY','BONUS_SHARES') THEN le.quantity ELSE 0 END), 0),
            4) AS avg_cost_including_bonus
        FROM ledger_entries le
        JOIN assets a ON a.asset_id = le.asset_id
        GROUP BY a.symbol
        ORDER BY a.symbol
    """)
    avg_cost_rows = {sym: avg for (sym, avg) in cur.fetchall()}

    conn.close()

    print("\n==============================")
    print("📊 PORTFOLIO REPORT (Local DB)")
    print("==============================\n")

    print("💰 Cash Balances:")
    if not cash_rows:
        print("  (no cash entries yet)")
    else:
        for ccy, bal in cash_rows:
            print(f"  - {ccy}: {bal}")

    print("\n📦 Holdings:")
    if not holding_rows:
        print("  (no holdings yet)")
    else:
        for symbol, asset_type, exchange, ccy, qty in holding_rows:
            avg = avg_cost_rows.get(symbol, None)
            avg_txt = f"{avg}" if avg is not None else "N/A"

            print(f"  - {symbol}")
            print(f"      Type/Exchange: {asset_type} / {exchange}")
            print(f"      Quantity     : {qty}")
            print(f"      Avg Cost     : {avg_txt} {ccy}")

    print("\n✅ Report generated successfully.\n")

if __name__ == "__main__":
    main()
