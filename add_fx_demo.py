import sqlite3
from datetime import date

DB_NAME = "portfolio.db"

def main():
    today = date.today().isoformat()

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # Example demo rate (NOT official): 1 USD = 0.305 KWD
    cur.execute("""
        INSERT OR REPLACE INTO fx_rates (rate_date, from_ccy, to_ccy, rate, source)
        VALUES (?, ?, ?, ?, ?)
    """, (today, "USD", "KWD", 0.305, "DEMO"))

    conn.commit()
    conn.close()

    print(f"✅ FX demo saved for {today}: 1 USD = 0.305 KWD")

if __name__ == "__main__":
    main()
