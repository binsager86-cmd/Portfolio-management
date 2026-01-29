-- ============================================================================
-- SQLITE SCHEMA: Portfolio App (CI Testing)
-- ============================================================================
-- File: 000_create_schema_sqlite.sql
-- Created: January 29, 2026
-- Purpose: SQLite-compatible schema for CI baseline testing
-- ============================================================================

-- ============================================================================
-- 1. IDENTITY & AUTH
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    email TEXT,
    name TEXT,
    gemini_api_key TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- ============================================================================
-- 2. GLOBAL REFERENCE DATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets (
    asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    exchange TEXT,
    currency TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
    price_id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    price_date TEXT NOT NULL,
    close_price REAL NOT NULL,
    source TEXT,
    UNIQUE(asset_id, price_date)
);

CREATE TABLE IF NOT EXISTS fx_rates (
    fx_id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_date TEXT NOT NULL,
    from_ccy TEXT NOT NULL,
    to_ccy TEXT NOT NULL,
    rate REAL NOT NULL,
    source TEXT,
    UNIQUE(rate_date, from_ccy, to_ccy)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cbk_rate_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate REAL NOT NULL,
    fetched_date TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER
);

-- ============================================================================
-- 3. USER-SCOPED PORTFOLIO DATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    name TEXT,
    current_price REAL DEFAULT 0,
    portfolio TEXT,
    currency TEXT DEFAULT 'KWD',
    yf_ticker TEXT,
    created_at INTEGER,
    UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio TEXT,
    stock_symbol TEXT NOT NULL,
    txn_date TEXT NOT NULL,
    txn_type TEXT NOT NULL DEFAULT 'Buy',
    shares REAL DEFAULT 0,
    purchase_cost REAL DEFAULT 0,
    sell_value REAL DEFAULT 0,
    cash_dividend REAL DEFAULT 0,
    bonus_shares REAL DEFAULT 0,
    reinvested_dividend REAL DEFAULT 0,
    fees REAL DEFAULT 0,
    broker TEXT,
    reference TEXT,
    notes TEXT,
    price_override REAL,
    planned_cum_shares REAL,
    category TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio TEXT,
    bank_name TEXT,
    deposit_date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'KWD',
    description TEXT,
    comments TEXT,
    include_in_analysis INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trading_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_symbol TEXT NOT NULL,
    txn_date TEXT NOT NULL,
    txn_type TEXT DEFAULT 'Buy',
    shares REAL DEFAULT 0,
    purchase_cost REAL DEFAULT 0,
    sell_value REAL DEFAULT 0,
    cash_dividend REAL DEFAULT 0,
    bonus_shares REAL DEFAULT 0,
    notes TEXT,
    created_at INTEGER
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date TEXT NOT NULL,
    portfolio_value REAL DEFAULT 0,
    daily_movement REAL DEFAULT 0,
    beginning_difference REAL DEFAULT 0,
    deposit_cash REAL DEFAULT 0,
    accumulated_cash REAL DEFAULT 0,
    net_gain REAL DEFAULT 0,
    change_percent REAL DEFAULT 0,
    roi_percent REAL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS portfolio_cash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio TEXT NOT NULL,
    balance REAL DEFAULT 0,
    currency TEXT DEFAULT 'KWD',
    last_updated INTEGER,
    UNIQUE(user_id, portfolio)
);

-- ============================================================================
-- 4. PFM (Personal Financial Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pfm_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS pfm_income_expense_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES pfm_snapshots(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
    category TEXT NOT NULL,
    monthly_amount REAL NOT NULL DEFAULT 0,
    is_finance_cost INTEGER DEFAULT 0,
    is_gna INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pfm_asset_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES pfm_snapshots(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK(asset_type IN ('real_estate', 'shares', 'gold', 'cash', 'crypto', 'other')),
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL,
    price REAL,
    currency TEXT DEFAULT 'KWD',
    value_kwd REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pfm_liability_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES pfm_snapshots(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount_kwd REAL NOT NULL DEFAULT 0,
    is_current INTEGER DEFAULT 0,
    is_long_term INTEGER DEFAULT 0
);

-- ============================================================================
-- 5. LEDGER & SNAPSHOTS (Backend Schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger_entries (
    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER REFERENCES assets(asset_id),
    entry_datetime TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    quantity REAL,
    price REAL,
    cash_amount REAL,
    currency TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
    snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    asset_id INTEGER REFERENCES assets(asset_id),
    quantity REAL,
    avg_cost REAL,
    mkt_price REAL,
    mkt_value REAL,
    currency TEXT,
    fx_to_base REAL DEFAULT 1.0,
    cost_value_base REAL,
    mkt_value_base REAL,
    pnl_base REAL
);

-- ============================================================================
-- 6. BANK CASHFLOWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_cashflows (
    bank_txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    txn_date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    comments TEXT
);

CREATE VIEW IF NOT EXISTS bank_totals AS
SELECT user_id, bank_name, SUM(amount) AS bank_total
FROM bank_cashflows
GROUP BY user_id, bank_name;

-- ============================================================================
-- 7. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_txn_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_user_symbol ON transactions(user_id, stock_symbol);
CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions(user_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_stocks_user ON stocks(user_id);
CREATE INDEX IF NOT EXISTS idx_stocks_user_portfolio ON stocks(user_id, portfolio);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_user ON cash_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_user_date ON cash_deposits(user_id, deposit_date);
CREATE INDEX IF NOT EXISTS idx_trading_history_user ON trading_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_history_user_symbol ON trading_history(user_id, stock_symbol);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON portfolio_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_pfm_snapshots_user ON pfm_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_pfm_income_expense_user ON pfm_income_expense_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pfm_assets_user ON pfm_asset_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pfm_liabilities_user ON pfm_liability_items(user_id);
