import sqlite3
from datetime import date
import yfinance as yf

DB_NAME = "portfolio.db"

def get_base_currency(cur) -> str:
    cur.execute("SELECT value FROM settings WHERE key='base_currency'")
    row = cur.fetchone()
    return row[0] if row else "KWD"

def ensure_asset(conn, symbol: str, asset_type: str, exchange: str, currency: str) -> int:
    cur = conn.cursor()
    cur.execute(
        "SELECT asset_id FROM assets WHERE symbol=? AND asset_type=?",
        (symbol, asset_type),
    )
    row = cur.fetchone()
    if row:
        return int(row[0])

    cur.execute(
        """
        INSERT INTO assets (symbol, asset_type, exchange, currency)
        VALUES (?, ?, ?, ?)
        """,
        (symbol, asset_type, exchange, currency),
    )
    return int(cur.lastrowid)

def upsert_price(conn, asset_id: int, price_date: str, close_price: float, source: str):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO prices (asset_id, price_date, close_price, source)
        VALUES (?, ?, ?, ?)
        """,
        (asset_id, price_date, close_price, source),
    )

def fetch_yahoo_close(symbol: str) -> float:
    """
    Fetch latest close price for a US stock from Yahoo via yfinance.
    We use 5d to reliably get the last close (handles weekends/holidays).
    """
    t = yf.Ticker(symbol)
    hist = t.history(period="5d", interval="1d")
    if hist is None or hist.empty:
        return None
    last_close = float(hist["Close"].dropna().iloc[-1])
    return last_close

def main():
    today = date.today().isoformat()

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    base_ccy = get_base_currency(cur)
    print(f"Base currency: {base_ccy}")
    print(f"Updating US stock prices for date: {today}")

    # Start with AAPL (you can add more later)
    us_symbols = ["AAPL"]

    for sym in us_symbols:
        asset_id = ensure_asset(conn, sym, "US_STOCK", "YAHOO", "USD")
        px = fetch_yahoo_close(sym)
        if px is None:
            print(f"⚠️ Could not fetch price for {sym}")
            continue

        upsert_price(conn, asset_id, today, px, "YAHOO")
        print(f"✅ Saved US price: {sym} = {px:.4f} USD")

    conn.commit()
    conn.close()
    print("✅ US prices update finished.")

if __name__ == "__main__":
    main()
