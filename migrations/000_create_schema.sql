-- ============================================================================
-- POSTGRESQL SCHEMA: Portfolio App (Production-Ready)
-- ============================================================================
-- File: 000_create_schema.sql
-- Created: January 29, 2026
-- Purpose: Complete PostgreSQL schema for multi-user portfolio management
-- 
-- USAGE:
--   psql -U your_user -d your_database -f 000_create_schema.sql
--
-- NOTES:
--   - All user-scoped tables have FK to users(id) with ON DELETE CASCADE
--   - NUMERIC(18,4) for financial precision (4 decimal places)
--   - NUMERIC(18,6) for FX rates (6 decimal places)
--   - Indexes optimized for common query patterns
-- ============================================================================

-- ============================================================================
-- 1. IDENTITY & AUTH
-- ============================================================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    email TEXT,
    name TEXT,
    gemini_api_key TEXT
);

CREATE TABLE user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE password_resets (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL
);

-- ============================================================================
-- 2. GLOBAL REFERENCE DATA (No user_id - shared across all users)
-- ============================================================================

CREATE TABLE assets (
    asset_id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    asset_type TEXT NOT NULL,        -- KW_STOCK / US_STOCK / CRYPTO
    exchange TEXT,                   -- e.g. BOURSA / NASDAQ / BINANCE
    currency TEXT NOT NULL           -- KWD / USD / ...
);

CREATE TABLE prices (
    price_id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    price_date DATE NOT NULL,
    close_price NUMERIC(18,4) NOT NULL,
    source TEXT,
    UNIQUE(asset_id, price_date)
);

CREATE TABLE fx_rates (
    fx_id SERIAL PRIMARY KEY,
    rate_date DATE NOT NULL,
    from_ccy TEXT NOT NULL,          -- USD
    to_ccy TEXT NOT NULL,            -- KWD
    rate NUMERIC(18,6) NOT NULL,     -- 1 from_ccy = rate to_ccy
    source TEXT,
    UNIQUE(rate_date, from_ccy, to_ccy)
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE cbk_rate_cache (
    id SERIAL PRIMARY KEY,
    rate NUMERIC(18,6) NOT NULL,
    fetched_date DATE NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. USER-SCOPED PORTFOLIO DATA
-- ============================================================================

CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    name TEXT,
    current_price NUMERIC(18,4) DEFAULT 0,
    portfolio TEXT DEFAULT 'KFH',
    currency TEXT DEFAULT 'KWD',
    tradingview_symbol TEXT,
    tradingview_exchange TEXT,
    UNIQUE(symbol, user_id)
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio TEXT DEFAULT 'KFH',
    stock_symbol TEXT NOT NULL,
    txn_date DATE NOT NULL,
    txn_type TEXT NOT NULL,
    purchase_cost NUMERIC(18,4) DEFAULT 0,
    sell_value NUMERIC(18,4) DEFAULT 0,
    shares NUMERIC(18,4) DEFAULT 0,
    bonus_shares NUMERIC(18,4) DEFAULT 0,
    cash_dividend NUMERIC(18,4) DEFAULT 0,
    reinvested_dividend NUMERIC(18,4) DEFAULT 0,
    price_override NUMERIC(18,4),
    planned_cum_shares NUMERIC(18,4),
    fees NUMERIC(18,4) DEFAULT 0,
    broker TEXT,
    reference TEXT,
    notes TEXT,
    category TEXT,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE trading_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_symbol TEXT NOT NULL,
    txn_date DATE NOT NULL,
    txn_type TEXT NOT NULL CHECK (txn_type IN ('Buy', 'Sell')),
    purchase_cost NUMERIC(18,4) DEFAULT 0,
    sell_value NUMERIC(18,4) DEFAULT 0,
    shares NUMERIC(18,4) DEFAULT 0,
    cash_dividend NUMERIC(18,4) DEFAULT 0,
    bonus_shares NUMERIC(18,4) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE cash_deposits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    deposit_date DATE NOT NULL,
    amount NUMERIC(18,4) NOT NULL,
    description TEXT,
    comments TEXT,
    include_in_analysis BOOLEAN DEFAULT TRUE,
    currency TEXT DEFAULT 'KWD',
    portfolio TEXT DEFAULT 'KFH',
    source TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE bank_cashflows (
    bank_txn_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    txn_date DATE NOT NULL,
    amount NUMERIC(18,4) NOT NULL,
    description TEXT,
    comments TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE portfolio_cash (
    portfolio TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC(18,4),
    currency TEXT DEFAULT 'KWD',
    last_updated TIMESTAMP,
    PRIMARY KEY (portfolio, user_id)
);

CREATE TABLE portfolio_snapshots (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    portfolio_value NUMERIC(18,4) NOT NULL,
    daily_movement NUMERIC(18,4) DEFAULT 0,
    beginning_difference NUMERIC(18,4) DEFAULT 0,
    deposit_cash NUMERIC(18,4) DEFAULT 0,
    accumulated_cash NUMERIC(18,4) DEFAULT 0,
    net_gain NUMERIC(18,4) DEFAULT 0,
    change_percent NUMERIC(18,4) DEFAULT 0,
    roi_percent NUMERIC(18,4) DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    UNIQUE(snapshot_date, user_id)
);

-- ============================================================================
-- 4. PERSONAL FINANCIAL MANAGEMENT (PFM)
-- ============================================================================

CREATE TABLE pfm_snapshots (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL,
    UNIQUE(user_id, snapshot_date)
);

CREATE TABLE pfm_income_expense_items (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES pfm_snapshots(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    category TEXT NOT NULL,
    monthly_amount NUMERIC(18,4) DEFAULT 0,
    is_finance_cost BOOLEAN DEFAULT FALSE,
    is_gna BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE pfm_asset_items (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES pfm_snapshots(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity NUMERIC(18,4),
    price NUMERIC(18,4),
    currency TEXT DEFAULT 'KWD',
    value_kwd NUMERIC(18,4) DEFAULT 0
);

CREATE TABLE pfm_liability_items (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES pfm_snapshots(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount_kwd NUMERIC(18,4) DEFAULT 0,
    is_current BOOLEAN DEFAULT FALSE,
    is_long_term BOOLEAN DEFAULT FALSE
);

-- ============================================================================
-- 5. BACKEND ACCOUNTING (Optional - for advanced features)
-- ============================================================================

CREATE TABLE ledger_entries (
    entry_id SERIAL PRIMARY KEY,
    entry_datetime TIMESTAMP NOT NULL,
    entry_type TEXT NOT NULL,        -- BUY/SELL/DIVIDEND_CASH/CASH_INJECTION
    asset_id INTEGER REFERENCES assets(asset_id),
    quantity NUMERIC(18,4),
    price NUMERIC(18,4),
    cash_amount NUMERIC(18,4) NOT NULL,
    currency TEXT NOT NULL,
    notes TEXT
);

CREATE TABLE daily_snapshots (
    snapshot_date DATE NOT NULL,
    asset_id INTEGER NOT NULL REFERENCES assets(asset_id),
    quantity NUMERIC(18,4) NOT NULL,
    avg_cost NUMERIC(18,4) NOT NULL,
    cost_value NUMERIC(18,4) NOT NULL,
    mkt_price NUMERIC(18,4) NOT NULL,
    mkt_value NUMERIC(18,4) NOT NULL,
    currency TEXT NOT NULL,
    fx_to_base NUMERIC(18,6) NOT NULL,
    mkt_value_base NUMERIC(18,4) NOT NULL,
    cost_value_base NUMERIC(18,4) NOT NULL,
    pnl_base NUMERIC(18,4) NOT NULL,
    PRIMARY KEY (snapshot_date, asset_id)
);

-- ============================================================================
-- 6. INDEXES (Performance Optimization)
-- ============================================================================

-- User-scoped query patterns
CREATE INDEX idx_txn_user_date ON transactions(user_id, txn_date);
CREATE INDEX idx_txn_user_symbol ON transactions(user_id, stock_symbol);
CREATE INDEX idx_cash_user_date ON cash_deposits(user_id, deposit_date);
CREATE INDEX idx_trade_user_symbol ON trading_history(user_id, stock_symbol);
CREATE INDEX idx_stocks_user_portfolio ON stocks(user_id, portfolio);
CREATE INDEX idx_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date);
CREATE INDEX idx_bank_cashflows_user ON bank_cashflows(user_id);
CREATE INDEX idx_bank_cashflows_user_bank ON bank_cashflows(user_id, bank_name);

-- PFM indexes
CREATE INDEX idx_pfm_snapshots_user ON pfm_snapshots(user_id);
CREATE INDEX idx_pfm_income_user ON pfm_income_expense_items(user_id);
CREATE INDEX idx_pfm_assets_user ON pfm_asset_items(user_id);
CREATE INDEX idx_pfm_liability_user ON pfm_liability_items(user_id);

-- Global data indexes
CREATE INDEX idx_prices_asset_date ON prices(asset_id, price_date);
CREATE INDEX idx_fx_rates_date ON fx_rates(rate_date, from_ccy, to_ccy);

-- Session cleanup
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================
-- Total Tables: 20
-- User-Scoped Tables: 12 (with FK to users ON DELETE CASCADE)
-- Global Tables: 8 (shared reference data)
-- ============================================================================
