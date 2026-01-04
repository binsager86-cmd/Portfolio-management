import sqlite3

DB_NAME = "portfolio.db"

def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # 1) Assets table (stocks/crypto)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS assets (
        asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        asset_type TEXT NOT NULL,   -- KW_STOCK / US_STOCK / CRYPTO
        exchange TEXT,              -- e.g. BOURSAA / NASDAQ / BINANCE
        currency TEXT NOT NULL      -- KWD / USD / ...
    );
    """)

    # 2) Ledger entries (buy/sell/dividend/cash injection)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS ledger_entries (
        entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_datetime TEXT NOT NULL,   -- ISO string (YYYY-MM-DD HH:MM:SS)
        entry_type TEXT NOT NULL,       -- BUY/SELL/DIVIDEND_CASH/CASH_INJECTION
        asset_id INTEGER,               -- NULL for pure cash injections
        quantity REAL,
        price REAL,
        cash_amount REAL NOT NULL,      -- positive for incoming cash, negative for outgoing
        currency TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
    );
    """)

    # 3) Prices table (daily close prices)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS prices (
        price_id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        price_date TEXT NOT NULL,       -- YYYY-MM-DD
        close_price REAL NOT NULL,
        source TEXT,
        UNIQUE(asset_id, price_date),
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
    );
    """)

    # 4) Daily snapshots (auto-saved portfolio status)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS daily_snapshots (
        snapshot_date TEXT PRIMARY KEY, -- YYYY-MM-DD
        portfolio_value_base REAL NOT NULL,
        cash_balance_base REAL NOT NULL,
        invested_cost_base REAL NOT NULL,
        unrealized_pl_base REAL NOT NULL,
        realized_pl_base REAL NOT NULL,
        dividends_ytd_base REAL NOT NULL
    );
    """)

    conn.commit()
    conn.close()

    print(f"✅ Database created/updated successfully: {DB_NAME}")

if __name__ == "__main__":
    main()
