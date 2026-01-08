import sqlite3
import requests
from datetime import date

DB_NAME = "portfolio.db"

def upsert_price(conn, asset_id: int, price_date: str, close_price: float, source: str):
    cur = conn.cursor()
    cur.execute("""
        INSERT OR REPLACE INTO prices (asset_id, price_date, close_price, source)
        VALUES (?, ?, ?, ?)
    """, (asset_id, price_date, close_price, source))

def get_base_currency(conn) -> str:
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key='base_currency'")
    row = cur.fetchone()
    return row[0] if row else "KWD"

def fetch_crypto_prices_usd(coin_ids):
    """
    CoinGecko simple price endpoint (USD).
    coin_ids: list like ["bitcoin","ethereum"]
    """
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": ",".join(coin_ids), "vs_currencies": "usd"}
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    data = r.json()
    return {cid: float(data[cid]["usd"]) for cid in coin_ids if cid in data and "usd" in data[cid]}

def ensure_asset(conn, symbol: str, asset_type: str, exchange: str, currency: str) -> int:
    cur = conn.cursor()
    cur.execute("SELECT asset_id FROM assets WHERE symbol=? AND asset_type=?", (symbol, asset_type))
    row = cur.fetchone()
    if row:
        return int(row[0])

    cur.execute("""
        INSERT INTO assets (symbol, asset_type, exchange, currency)
        VALUES (?, ?, ?, ?)
    """, (symbol, asset_type, exchange, currency))
    return int(cur.lastrowid)

def main():
    today = date.today().isoformat()

    conn = sqlite3.connect(DB_NAME)
    base_ccy = get_base_currency(conn)

    print(f"Base currency: {base_ccy}")
    print(f"Updating for date: {today}")

    # --- Crypto prices (USD) via CoinGecko ---
    # We map your symbols to CoinGecko IDs.
    crypto_map = {
        "BTC": "bitcoin",
        "ETH": "ethereum",
    }

    # Ensure assets exist in DB (you can add more later)
    asset_ids = {}
    for sym in crypto_map.keys():
        asset_ids[sym] = ensure_asset(conn, sym, "CRYPTO", "COINGECKO", "USD")

    prices = fetch_crypto_prices_usd(list(crypto_map.values()))

    for sym, cid in crypto_map.items():
        if cid in prices:
            upsert_price(conn, asset_ids[sym], today, prices[cid], "COINGECKO")
            print(f"✅ Saved crypto price: {sym} = {prices[cid]} USD")

    conn.commit()
    conn.close()

    print("✅ Auto update finished (crypto only).")

if __name__ == "__main__":
    main()
