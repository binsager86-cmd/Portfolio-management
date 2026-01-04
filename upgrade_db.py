import sqlite3

DB_NAME = "portfolio.db"

def table_exists(cur, name: str) -> bool:
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (name,))
    return cur.fetchone() is not None

def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # A) Settings table (store base currency = KWD)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);", ("base_currency", "KWD"))

    # B) FX rates table (ex: USD->KWD)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS fx_rates (
        fx_id INTEGER PRIMARY KEY AUTOINCREMENT,
        rate_date TEXT NOT NULL,         -- YYYY-MM-DD
        from_ccy TEXT NOT NULL,          -- USD
        to_ccy TEXT NOT NULL,            -- KWD
        rate REAL NOT NULL,              -- 1 from_ccy = rate to_ccy
        source TEXT,
        UNIQUE(rate_date, from_ccy, to_ccy)
    );
    """)

    conn.commit()
    conn.close()

    print("✅ Database upgraded: settings + fx_rates added, base currency set to KWD")

if __name__ == "__main__":
    main()
