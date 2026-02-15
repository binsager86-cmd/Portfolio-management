"""
Production Database Schema — Single Source of Truth for SQLite.

Provides:
  • ``SCHEMA_VERSION``          — current schema revision
  • ``ensure_production_schema()`` — idempotent init: create tables + migrate
  • ``run_integrity_checks()``  — FK + data consistency checks

Design principles:
  ─ All tables use ``INTEGER PRIMARY KEY AUTOINCREMENT`` (never ``SERIAL``)
  ─ Dates stored as ISO TEXT ``YYYY-MM-DD``; timestamps as Unix epoch INTEGER
  ─ Booleans stored as ``INTEGER DEFAULT 0`` (0 = false, 1 = true)
  ─ Money/quantities stored as ``REAL`` (SQLite has no DECIMAL)
  ─ ``JSON`` stored as ``TEXT`` (SQLite treats JSON as TEXT affinity)
  ─ Foreign keys enforced via ``PRAGMA foreign_keys = ON``
  ─ Every migration is additive — no column drops, no PK changes
  ─ Every CREATE TABLE uses ``IF NOT EXISTS``
  ─ Indexes use ``IF NOT EXISTS``
"""

import logging
import sqlite3
import time
from typing import List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

# ═══════════════════════════════════════════════════════════════════════
#  DDL — Canonical table definitions
# ═══════════════════════════════════════════════════════════════════════

_TABLES_SQL = """
-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 1  ·  Identity & Auth
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    email                       TEXT UNIQUE,
    username                    TEXT NOT NULL UNIQUE,
    password_hash               TEXT NOT NULL,
    name                        TEXT,
    gemini_api_key              TEXT,
    gemini_api_key_encrypted    TEXT,
    gemini_api_key_last_validated INTEGER,
    gemini_quota_reset_at       INTEGER,
    gemini_requests_today       INTEGER DEFAULT 0,
    created_at                  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token                       TEXT PRIMARY KEY,
    user_id                     INTEGER NOT NULL,
    expires_at                  INTEGER NOT NULL,
    created_at                  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS password_resets (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    email                       TEXT NOT NULL,
    otp                         TEXT NOT NULL,
    expires_at                  INTEGER NOT NULL,
    created_at                  INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 2  ·  Core Portfolio
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stocks (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER DEFAULT 1,
    symbol                      TEXT NOT NULL,
    name                        TEXT,
    current_price               REAL DEFAULT 0,
    portfolio                   TEXT DEFAULT 'KFH',
    currency                    TEXT DEFAULT 'KWD',
    tradingview_symbol          TEXT,
    tradingview_exchange        TEXT,
    last_updated                INTEGER,
    price_source                TEXT,
    created_at                  INTEGER,
    UNIQUE(symbol, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER,
    portfolio                   TEXT DEFAULT 'KFH',
    stock_symbol                TEXT NOT NULL,
    txn_date                    TEXT NOT NULL,
    txn_type                    TEXT NOT NULL,
    purchase_cost               REAL NOT NULL DEFAULT 0,
    sell_value                  REAL NOT NULL DEFAULT 0,
    shares                      REAL NOT NULL DEFAULT 0,
    bonus_shares                REAL NOT NULL DEFAULT 0,
    cash_dividend               REAL NOT NULL DEFAULT 0,
    reinvested_dividend         REAL NOT NULL DEFAULT 0,
    price_override              REAL,
    planned_cum_shares          REAL,
    fees                        REAL DEFAULT 0,
    broker                      TEXT,
    reference                   TEXT,
    notes                       TEXT,
    category                    TEXT DEFAULT 'portfolio',
    security_id                 TEXT,
    source                      TEXT DEFAULT 'MANUAL',
    source_reference            TEXT,
    fx_rate_at_txn              REAL,
    is_deleted                  INTEGER DEFAULT 0,
    deleted_at                  INTEGER,
    deleted_by                  INTEGER,
    avg_cost_at_txn             REAL,
    realized_pnl_at_txn         REAL,
    cost_basis_at_txn           REAL,
    shares_held_at_txn          REAL,
    stock_master_id             INTEGER,
    portfolio_id                INTEGER,
    account_id                  INTEGER,
    created_at                  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_deposits (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER,
    portfolio                   TEXT DEFAULT 'KFH',
    bank_name                   TEXT DEFAULT 'Cash Deposit',
    deposit_date                TEXT NOT NULL,
    amount                      REAL NOT NULL,
    description                 TEXT,
    comments                    TEXT,
    notes                       TEXT,
    currency                    TEXT DEFAULT 'KWD',
    include_in_analysis         INTEGER DEFAULT 1,
    source                      TEXT DEFAULT 'MANUAL',
    source_reference            TEXT,
    fx_rate_at_deposit          REAL,
    is_deleted                  INTEGER DEFAULT 0,
    deleted_at                  INTEGER,
    deleted_by                  INTEGER,
    created_at                  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_cash (
    portfolio                   TEXT NOT NULL,
    user_id                     INTEGER NOT NULL DEFAULT 1,
    balance                     REAL,
    currency                    TEXT DEFAULT 'KWD',
    last_updated                INTEGER,
    manual_override             INTEGER DEFAULT 0,
    PRIMARY KEY (portfolio, user_id)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER DEFAULT 1,
    snapshot_date               TEXT NOT NULL,
    portfolio_value             REAL NOT NULL,
    daily_movement              REAL DEFAULT 0,
    beginning_difference        REAL DEFAULT 0,
    deposit_cash                REAL DEFAULT 0,
    accumulated_cash            REAL DEFAULT 0,
    net_gain                    REAL DEFAULT 0,
    change_percent              REAL DEFAULT 0,
    roi_percent                 REAL DEFAULT 0,
    twr_percent                 REAL,
    mwrr_percent                REAL,
    created_at                  INTEGER NOT NULL,
    UNIQUE(snapshot_date, user_id)
);

CREATE TABLE IF NOT EXISTS trading_history (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER DEFAULT 1,
    stock_symbol                TEXT NOT NULL,
    txn_date                    TEXT NOT NULL,
    txn_type                    TEXT NOT NULL,
    purchase_cost               REAL NOT NULL DEFAULT 0,
    sell_value                  REAL NOT NULL DEFAULT 0,
    shares                      REAL NOT NULL DEFAULT 0,
    cash_dividend               REAL NOT NULL DEFAULT 0,
    bonus_shares                REAL NOT NULL DEFAULT 0,
    notes                       TEXT,
    created_at                  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_audit_log (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    operation                   TEXT NOT NULL,
    entity_type                 TEXT,
    entity_id                   INTEGER,
    old_value                   REAL,
    new_value                   REAL,
    delta                       REAL,
    portfolio                   TEXT,
    currency                    TEXT,
    reason                      TEXT,
    details                     TEXT,
    created_at                  INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 3  ·  Securities Master & Normalized Schema
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS securities_master (
    security_id                 TEXT PRIMARY KEY,
    user_id                     INTEGER NOT NULL DEFAULT 1,
    exchange                    TEXT NOT NULL,
    canonical_ticker            TEXT NOT NULL,
    display_name                TEXT,
    isin                        TEXT,
    currency                    TEXT NOT NULL DEFAULT 'KWD',
    country                     TEXT NOT NULL DEFAULT 'KW',
    status                      TEXT DEFAULT 'active'
        CHECK(status IN ('active','delisted','suspended')),
    sector                      TEXT,
    created_at                  INTEGER,
    updated_at                  INTEGER,
    UNIQUE(canonical_ticker, exchange, user_id)
);

CREATE TABLE IF NOT EXISTS security_aliases (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL DEFAULT 1,
    security_id                 TEXT NOT NULL,
    alias_name                  TEXT NOT NULL,
    alias_type                  TEXT DEFAULT 'user_input'
        CHECK(alias_type IN ('user_input','broker_format','official','legacy')),
    valid_from                  TEXT,
    valid_until                 TEXT,
    created_at                  INTEGER,
    FOREIGN KEY (security_id) REFERENCES securities_master(security_id),
    UNIQUE(alias_name, security_id, user_id)
);

CREATE TABLE IF NOT EXISTS stocks_master (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker                      TEXT NOT NULL,
    name                        TEXT,
    exchange                    TEXT DEFAULT 'KSE',
    currency                    TEXT DEFAULT 'KWD',
    isin                        TEXT,
    sector                      TEXT,
    country                     TEXT DEFAULT 'KW',
    status                      TEXT DEFAULT 'active',
    created_at                  INTEGER,
    updated_at                  INTEGER,
    UNIQUE(ticker, exchange)
);

CREATE TABLE IF NOT EXISTS portfolios (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    name                        TEXT NOT NULL,
    base_currency               TEXT DEFAULT 'KWD',
    description                 TEXT,
    created_at                  INTEGER,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS external_accounts (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    portfolio_id                INTEGER,
    name                        TEXT NOT NULL,
    account_number              TEXT,
    currency                    TEXT DEFAULT 'KWD',
    account_type                TEXT DEFAULT 'BROKERAGE',
    current_balance             REAL DEFAULT 0,
    last_reconciled_date        TEXT,
    created_at                  INTEGER,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);

CREATE TABLE IF NOT EXISTS symbol_mappings (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_input                  TEXT NOT NULL COLLATE NOCASE,
    canonical_ticker            TEXT NOT NULL,
    stock_id                    INTEGER,
    created_at                  INTEGER,
    UNIQUE(user_input),
    FOREIGN KEY (stock_id) REFERENCES stocks_master(id)
);

CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    portfolio_id                INTEGER NOT NULL,
    txn_type                    TEXT NOT NULL,
    source                      TEXT NOT NULL DEFAULT 'MANUAL',
    source_reference            TEXT,
    stock_id                    INTEGER,
    account_id                  INTEGER,
    shares                      REAL,
    price                       REAL,
    amount                      REAL NOT NULL,
    fees                        REAL DEFAULT 0,
    txn_date                    TEXT NOT NULL,
    notes                       TEXT,
    legacy_txn_id               INTEGER,
    created_at                  INTEGER,
    created_by                  INTEGER,
    is_deleted                  INTEGER DEFAULT 0,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
    FOREIGN KEY (stock_id) REFERENCES stocks_master(id),
    FOREIGN KEY (account_id) REFERENCES external_accounts(id)
);

CREATE TABLE IF NOT EXISTS cash_flows (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    account_id                  INTEGER,
    flow_type                   TEXT NOT NULL,
    amount                      REAL NOT NULL,
    currency                    TEXT DEFAULT 'KWD',
    related_txn_id              INTEGER,
    flow_date                   TEXT NOT NULL,
    description                 TEXT,
    reconciled                  INTEGER DEFAULT 0,
    created_at                  INTEGER,
    FOREIGN KEY (account_id) REFERENCES external_accounts(id)
);

CREATE TABLE IF NOT EXISTS position_snapshots (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    stock_id                    INTEGER,
    portfolio_id                INTEGER,
    stock_symbol                TEXT,
    txn_id                      INTEGER,
    snapshot_date               TEXT NOT NULL,
    total_shares                REAL DEFAULT 0,
    total_cost                  REAL DEFAULT 0,
    avg_cost                    REAL DEFAULT 0,
    realized_pnl                REAL DEFAULT 0,
    cash_dividends_received     REAL DEFAULT 0,
    status                      TEXT DEFAULT 'OPEN',
    created_at                  INTEGER
);

CREATE TABLE IF NOT EXISTS portfolio_summary (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    stock_symbol                TEXT NOT NULL,
    portfolio                   TEXT DEFAULT 'KFH',
    currency                    TEXT DEFAULT 'KWD',
    total_buy_shares            REAL DEFAULT 0,
    total_sell_shares           REAL DEFAULT 0,
    net_shares                  REAL DEFAULT 0,
    total_buy_cost              REAL DEFAULT 0,
    total_sell_value            REAL DEFAULT 0,
    avg_cost_per_share          REAL DEFAULT 0,
    total_cash_dividends        REAL DEFAULT 0,
    total_bonus_shares          REAL DEFAULT 0,
    total_reinvested_dividends  REAL DEFAULT 0,
    realized_pnl                REAL DEFAULT 0,
    first_buy_date              TEXT,
    last_txn_date               TEXT,
    txn_count                   INTEGER DEFAULT 0,
    updated_at                  INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 4  ·  Backend Accounting (setup_db legacy tables)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assets (
    asset_id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol                      TEXT NOT NULL,
    asset_type                  TEXT NOT NULL,
    exchange                    TEXT,
    currency                    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    entry_id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_datetime              TEXT NOT NULL,
    entry_type                  TEXT NOT NULL,
    asset_id                    INTEGER,
    quantity                    REAL,
    price                       REAL,
    cash_amount                 REAL NOT NULL,
    currency                    TEXT NOT NULL,
    notes                       TEXT,
    FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
);

CREATE TABLE IF NOT EXISTS prices (
    price_id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id                    INTEGER NOT NULL,
    price_date                  TEXT NOT NULL,
    close_price                 REAL NOT NULL,
    source                      TEXT,
    UNIQUE(asset_id, price_date),
    FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
    snapshot_date               TEXT NOT NULL,
    asset_id                    INTEGER NOT NULL,
    quantity                    REAL NOT NULL,
    avg_cost                    REAL NOT NULL,
    cost_value                  REAL NOT NULL,
    mkt_price                   REAL NOT NULL,
    mkt_value                   REAL NOT NULL,
    currency                    TEXT NOT NULL,
    fx_to_base                  REAL NOT NULL,
    mkt_value_base              REAL NOT NULL,
    cost_value_base             REAL NOT NULL,
    pnl_base                    REAL NOT NULL,
    PRIMARY KEY (snapshot_date, asset_id)
);

CREATE TABLE IF NOT EXISTS settings (
    key                         TEXT PRIMARY KEY,
    value                       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fx_rates (
    fx_id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_date                   TEXT NOT NULL,
    from_ccy                    TEXT NOT NULL,
    to_ccy                      TEXT NOT NULL,
    rate                        REAL NOT NULL,
    source                      TEXT,
    UNIQUE(rate_date, from_ccy, to_ccy)
);

CREATE TABLE IF NOT EXISTS bank_cashflows (
    bank_txn_id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL DEFAULT 1,
    bank_name                   TEXT NOT NULL,
    txn_date                    TEXT NOT NULL,
    amount                      REAL NOT NULL,
    description                 TEXT,
    comments                    TEXT,
    created_at                  INTEGER
);

CREATE TABLE IF NOT EXISTS cbk_rate_cache (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    rate                        REAL NOT NULL,
    fetched_date                TEXT NOT NULL,
    source                      TEXT NOT NULL,
    created_at                  INTEGER
);

-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 5  ·  PFM (Personal Financial Management)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pfm_snapshots (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    snapshot_date               TEXT NOT NULL,
    notes                       TEXT,
    created_at                  INTEGER NOT NULL,
    UNIQUE(user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS pfm_income_expense_items (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id                 INTEGER NOT NULL,
    user_id                     INTEGER NOT NULL,
    kind                        TEXT NOT NULL CHECK(kind IN ('income','expense')),
    category                    TEXT NOT NULL,
    monthly_amount              REAL NOT NULL DEFAULT 0,
    is_finance_cost             INTEGER DEFAULT 0,
    is_gna                      INTEGER DEFAULT 0,
    sort_order                  INTEGER DEFAULT 0,
    FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pfm_asset_items (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id                 INTEGER NOT NULL,
    user_id                     INTEGER NOT NULL,
    asset_type                  TEXT NOT NULL
        CHECK(asset_type IN ('real_estate','shares','gold','cash','crypto','other')),
    category                    TEXT NOT NULL,
    name                        TEXT NOT NULL,
    quantity                    REAL,
    price                       REAL,
    currency                    TEXT DEFAULT 'KWD',
    value_kwd                   REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pfm_liability_items (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id                 INTEGER NOT NULL,
    user_id                     INTEGER NOT NULL,
    category                    TEXT NOT NULL,
    amount_kwd                  REAL NOT NULL DEFAULT 0,
    is_current                  INTEGER DEFAULT 0,
    is_long_term                INTEGER DEFAULT 0,
    FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
);

-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 6  ·  Stock Analysis Module
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analysis_stocks (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    symbol                      TEXT NOT NULL,
    company_name                TEXT NOT NULL,
    exchange                    TEXT DEFAULT 'NYSE',
    currency                    TEXT DEFAULT 'USD',
    sector                      TEXT,
    industry                    TEXT,
    country                     TEXT,
    isin                        TEXT,
    cik                         TEXT,
    description                 TEXT,
    website                     TEXT,
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL,
    UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS financial_statements (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id                    INTEGER NOT NULL,
    statement_type              TEXT NOT NULL,
    fiscal_year                 INTEGER NOT NULL,
    fiscal_quarter              INTEGER,
    period_end_date             TEXT NOT NULL,
    filing_date                 TEXT,
    source_file                 TEXT,
    extracted_by                TEXT DEFAULT 'gemini',
    confidence_score            REAL,
    verified_by_user            INTEGER DEFAULT 0,
    notes                       TEXT,
    created_at                  INTEGER NOT NULL,
    UNIQUE(stock_id, statement_type, period_end_date),
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE IF NOT EXISTS financial_line_items (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id                INTEGER NOT NULL,
    line_item_code              TEXT NOT NULL,
    line_item_name              TEXT NOT NULL,
    amount                      REAL NOT NULL,
    currency                    TEXT DEFAULT 'USD',
    order_index                 INTEGER,
    parent_item_id              INTEGER,
    is_total                    INTEGER DEFAULT 0,
    manually_edited             INTEGER DEFAULT 0,
    edited_by_user_id           INTEGER,
    edited_at                   INTEGER,
    FOREIGN KEY (statement_id) REFERENCES financial_statements(id)
);

CREATE TABLE IF NOT EXISTS stock_metrics (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id                    INTEGER NOT NULL,
    fiscal_year                 INTEGER NOT NULL,
    fiscal_quarter              INTEGER,
    period_end_date             TEXT NOT NULL,
    metric_type                 TEXT NOT NULL,
    metric_name                 TEXT NOT NULL,
    metric_value                REAL,
    created_at                  INTEGER NOT NULL,
    UNIQUE(stock_id, metric_name, period_end_date),
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE IF NOT EXISTS valuation_models (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id                    INTEGER NOT NULL,
    model_type                  TEXT NOT NULL,
    valuation_date              TEXT NOT NULL,
    intrinsic_value             REAL,
    parameters                  TEXT,
    assumptions                 TEXT,
    created_by_user_id          INTEGER,
    created_at                  INTEGER NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE IF NOT EXISTS stock_scores (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id                    INTEGER NOT NULL,
    scoring_date                TEXT NOT NULL,
    overall_score               REAL,
    fundamental_score           REAL,
    valuation_score             REAL,
    growth_score                REAL,
    quality_score               REAL,
    details                     TEXT,
    analyst_notes               TEXT,
    created_by_user_id          INTEGER,
    created_at                  INTEGER NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE IF NOT EXISTS analysis_audit_log (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    operation                   TEXT NOT NULL,
    entity_type                 TEXT NOT NULL,
    entity_id                   INTEGER,
    old_value                   TEXT,
    new_value                   TEXT,
    reason                      TEXT,
    details                     TEXT,
    created_at                  INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 7  ·  Extraction Pipeline (AI Vision)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financial_uploads (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                     INTEGER NOT NULL,
    stock_id                    INTEGER NOT NULL,
    uploaded_at                 INTEGER NOT NULL,
    pdf_path                    TEXT,
    pdf_type                    TEXT DEFAULT 'text',
    status                      TEXT DEFAULT 'processing',
    error_message               TEXT,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE IF NOT EXISTS financial_raw_extraction (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id                   INTEGER NOT NULL,
    statement_type              TEXT,
    page_num                    INTEGER,
    method                      TEXT,
    table_id                    INTEGER,
    table_json                  TEXT,
    header_context              TEXT,
    confidence_score            REAL DEFAULT 0.0,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE IF NOT EXISTS financial_normalized (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id                   INTEGER NOT NULL,
    statement_type              TEXT NOT NULL,
    period_end_date             TEXT,
    currency                    TEXT DEFAULT 'USD',
    unit_scale                  INTEGER DEFAULT 1,
    line_item_key               TEXT NOT NULL,
    label_raw                   TEXT,
    value                       REAL,
    source_page                 INTEGER,
    source_table_id             INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE IF NOT EXISTS financial_validation (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id                   INTEGER NOT NULL,
    statement_type              TEXT,
    rule_name                   TEXT NOT NULL,
    expected_value              REAL,
    actual_value                REAL,
    diff                        REAL,
    pass_fail                   TEXT DEFAULT 'unknown',
    notes                       TEXT,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE IF NOT EXISTS financial_user_edits (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id                   INTEGER NOT NULL,
    statement_type              TEXT,
    period                      TEXT,
    line_item_key               TEXT NOT NULL,
    old_value                   REAL,
    new_value                   REAL,
    edited_at                   INTEGER NOT NULL,
    edited_by                   INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

-- ──────────────────────────────────────────────────────────────────
-- DOMAIN 8  ·  Schema version tracking
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_version (
    id                          INTEGER PRIMARY KEY CHECK (id = 1),
    version                     INTEGER NOT NULL DEFAULT 1,
    migrated_at                 INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────────
-- VIEWS
-- ──────────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS bank_totals AS
SELECT user_id, bank_name, ROUND(SUM(amount), 3) AS bank_total
FROM bank_cashflows
GROUP BY user_id, bank_name;
"""

# ═══════════════════════════════════════════════════════════════════════
#  Indexes — all in one place
# ═══════════════════════════════════════════════════════════════════════

_INDEXES_SQL = """
-- Auth
CREATE INDEX IF NOT EXISTS idx_users_email              ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_gemini_validated    ON users(gemini_api_key_last_validated);

-- Core Portfolio
CREATE INDEX IF NOT EXISTS idx_stocks_user              ON stocks(user_id);
CREATE INDEX IF NOT EXISTS idx_stocks_user_portfolio     ON stocks(user_id, portfolio);
CREATE INDEX IF NOT EXISTS idx_txn_user                 ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_user_symbol          ON transactions(user_id, stock_symbol);
CREATE INDEX IF NOT EXISTS idx_txn_user_date            ON transactions(user_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_security_id          ON transactions(security_id);
CREATE INDEX IF NOT EXISTS idx_txn_source               ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_txn_deleted              ON transactions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_user       ON cash_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_user_date  ON cash_deposits(user_id, deposit_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_user           ON portfolio_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_date      ON portfolio_snapshots(user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_trading_history_user     ON trading_history(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user               ON financial_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_operation          ON financial_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_created            ON financial_audit_log(created_at);

-- Securities
CREATE INDEX IF NOT EXISTS idx_securities_exchange      ON securities_master(exchange);
CREATE INDEX IF NOT EXISTS idx_securities_ticker        ON securities_master(canonical_ticker);
CREATE INDEX IF NOT EXISTS idx_securities_country       ON securities_master(country);
CREATE INDEX IF NOT EXISTS idx_aliases_name             ON security_aliases(alias_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_aliases_security         ON security_aliases(security_id);
CREATE INDEX IF NOT EXISTS idx_stocks_master_ticker     ON stocks_master(ticker);
CREATE INDEX IF NOT EXISTS idx_portfolios_user          ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_accounts_user        ON external_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_symbol_mappings_input    ON symbol_mappings(user_input);
CREATE INDEX IF NOT EXISTS idx_ptxn_user                ON portfolio_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ptxn_portfolio_type      ON portfolio_transactions(portfolio_id, txn_type);
CREATE INDEX IF NOT EXISTS idx_ptxn_portfolio_source    ON portfolio_transactions(portfolio_id, source);
CREATE INDEX IF NOT EXISTS idx_ptxn_stock               ON portfolio_transactions(stock_id);
CREATE INDEX IF NOT EXISTS idx_ptxn_date                ON portfolio_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_cash_flows_type          ON cash_flows(flow_type);
CREATE INDEX IF NOT EXISTS idx_cash_flows_date          ON cash_flows(flow_date);
CREATE INDEX IF NOT EXISTS idx_cash_flows_account       ON cash_flows(account_id);
CREATE INDEX IF NOT EXISTS idx_pos_snap_user            ON position_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_pos_snap_stock           ON position_snapshots(stock_id);
CREATE INDEX IF NOT EXISTS idx_pos_snap_status          ON position_snapshots(status);
CREATE INDEX IF NOT EXISTS idx_pos_snapshots_date       ON position_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_pos_snapshots_stock      ON position_snapshots(stock_symbol);

-- Backend Accounting
CREATE INDEX IF NOT EXISTS idx_bank_cashflows_user      ON bank_cashflows(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_cashflows_bank_date ON bank_cashflows(bank_name, txn_date);
CREATE INDEX IF NOT EXISTS idx_bank_cashflows_user_bank ON bank_cashflows(user_id, bank_name);

-- PFM
CREATE INDEX IF NOT EXISTS idx_pfm_snapshots_user       ON pfm_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_pfm_income_expense_user  ON pfm_income_expense_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pfm_assets_user          ON pfm_asset_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pfm_liabilities_user     ON pfm_liability_items(user_id);

-- Stock Analysis
CREATE INDEX IF NOT EXISTS idx_analysis_stocks_user     ON analysis_stocks(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_stocks_symbol   ON analysis_stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_financial_statements_stock       ON financial_statements(stock_id);
CREATE INDEX IF NOT EXISTS idx_financial_statements_type_date   ON financial_statements(statement_type, period_end_date);
CREATE INDEX IF NOT EXISTS idx_line_items_statement     ON financial_line_items(statement_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code          ON financial_line_items(line_item_code);
CREATE INDEX IF NOT EXISTS idx_stock_metrics_stock      ON stock_metrics(stock_id);
CREATE INDEX IF NOT EXISTS idx_valuation_models_stock   ON valuation_models(stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_scores_stock       ON stock_scores(stock_id);

-- Extraction Pipeline
CREATE INDEX IF NOT EXISTS idx_fin_uploads_user         ON financial_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_uploads_stock        ON financial_uploads(stock_id);
CREATE INDEX IF NOT EXISTS idx_fin_raw_upload           ON financial_raw_extraction(upload_id);
CREATE INDEX IF NOT EXISTS idx_fin_norm_upload          ON financial_normalized(upload_id);
CREATE INDEX IF NOT EXISTS idx_fin_valid_upload         ON financial_validation(upload_id);
CREATE INDEX IF NOT EXISTS idx_fin_edits_upload         ON financial_user_edits(upload_id);
"""

# ═══════════════════════════════════════════════════════════════════════
#  Additive column migrations
#  Each tuple: (table, column, column_def)
#  These handle existing databases that were created with older schemas.
# ═══════════════════════════════════════════════════════════════════════

_ADDITIVE_COLUMNS: List[Tuple[str, str, str]] = [
    # ── users ──
    ("users", "email",                          "TEXT"),
    ("users", "name",                           "TEXT"),
    ("users", "gemini_api_key",                 "TEXT"),
    ("users", "gemini_api_key_encrypted",       "TEXT"),
    ("users", "gemini_api_key_last_validated",  "INTEGER"),
    ("users", "gemini_quota_reset_at",          "INTEGER"),
    ("users", "gemini_requests_today",          "INTEGER DEFAULT 0"),
    # ── stocks ──
    ("stocks", "user_id",              "INTEGER DEFAULT 1"),
    ("stocks", "current_price",        "REAL DEFAULT 0"),
    ("stocks", "portfolio",            "TEXT DEFAULT 'KFH'"),
    ("stocks", "currency",             "TEXT DEFAULT 'KWD'"),
    ("stocks", "tradingview_symbol",   "TEXT"),
    ("stocks", "tradingview_exchange", "TEXT"),
    ("stocks", "last_updated",         "INTEGER"),
    ("stocks", "price_source",         "TEXT"),
    ("stocks", "created_at",           "INTEGER"),
    # ── transactions ──
    ("transactions", "user_id",             "INTEGER"),
    ("transactions", "portfolio",           "TEXT DEFAULT 'KFH'"),
    ("transactions", "category",            "TEXT DEFAULT 'portfolio'"),
    ("transactions", "price_override",      "REAL"),
    ("transactions", "planned_cum_shares",  "REAL"),
    ("transactions", "fees",                "REAL DEFAULT 0"),
    ("transactions", "broker",              "TEXT"),
    ("transactions", "reference",           "TEXT"),
    ("transactions", "bonus_shares",        "REAL DEFAULT 0"),
    ("transactions", "cash_dividend",       "REAL DEFAULT 0"),
    ("transactions", "reinvested_dividend", "REAL DEFAULT 0"),
    ("transactions", "security_id",         "TEXT"),
    ("transactions", "source",              "TEXT DEFAULT 'MANUAL'"),
    ("transactions", "source_reference",    "TEXT"),
    ("transactions", "fx_rate_at_txn",      "REAL"),
    ("transactions", "is_deleted",          "INTEGER DEFAULT 0"),
    ("transactions", "deleted_at",          "INTEGER"),
    ("transactions", "deleted_by",          "INTEGER"),
    ("transactions", "avg_cost_at_txn",     "REAL"),
    ("transactions", "realized_pnl_at_txn", "REAL"),
    ("transactions", "cost_basis_at_txn",   "REAL"),
    ("transactions", "shares_held_at_txn",  "REAL"),
    ("transactions", "stock_master_id",     "INTEGER"),
    ("transactions", "portfolio_id",        "INTEGER"),
    ("transactions", "account_id",          "INTEGER"),
    # ── cash_deposits ──
    ("cash_deposits", "user_id",            "INTEGER"),
    ("cash_deposits", "portfolio",          "TEXT DEFAULT 'KFH'"),
    ("cash_deposits", "bank_name",          "TEXT DEFAULT 'Cash Deposit'"),
    ("cash_deposits", "description",        "TEXT"),
    ("cash_deposits", "comments",           "TEXT"),
    ("cash_deposits", "notes",              "TEXT"),
    ("cash_deposits", "currency",           "TEXT DEFAULT 'KWD'"),
    ("cash_deposits", "include_in_analysis","INTEGER DEFAULT 1"),
    ("cash_deposits", "source",             "TEXT DEFAULT 'MANUAL'"),
    ("cash_deposits", "source_reference",   "TEXT"),
    ("cash_deposits", "fx_rate_at_deposit", "REAL"),
    ("cash_deposits", "is_deleted",         "INTEGER DEFAULT 0"),
    ("cash_deposits", "deleted_at",         "INTEGER"),
    ("cash_deposits", "deleted_by",         "INTEGER"),
    # ── portfolio_cash ──
    ("portfolio_cash", "user_id",          "INTEGER DEFAULT 1"),
    ("portfolio_cash", "manual_override",  "INTEGER DEFAULT 0"),
    # ── portfolio_snapshots ──
    ("portfolio_snapshots", "user_id",       "INTEGER DEFAULT 1"),
    ("portfolio_snapshots", "twr_percent",   "REAL"),
    ("portfolio_snapshots", "mwrr_percent",  "REAL"),
    # ── trading_history ──
    ("trading_history", "user_id",          "INTEGER DEFAULT 1"),
    # ── securities ──
    ("securities_master",  "user_id",       "INTEGER DEFAULT 1"),
    ("security_aliases",   "user_id",       "INTEGER DEFAULT 1"),
    # ── bank_cashflows ──
    ("bank_cashflows", "user_id",           "INTEGER DEFAULT 1"),
]


# ═══════════════════════════════════════════════════════════════════════
#  Public API
# ═══════════════════════════════════════════════════════════════════════

def ensure_production_schema(db_path: str = "portfolio.db") -> None:
    """Idempotent: create every table, run additive migrations, create indexes.

    Safe to call on every app startup — only touches things that are missing.
    """
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    try:
        # 1) Create all tables (IF NOT EXISTS means no-op for existing ones)
        conn.executescript(_TABLES_SQL)
        logger.info("✅ Tables verified / created")

        # 2) Additive column migrations
        existing_cols_cache: dict = {}
        migrated = 0
        for table, col, coltype in _ADDITIVE_COLUMNS:
            if table not in existing_cols_cache:
                cur = conn.execute(f"PRAGMA table_info({table})")
                existing_cols_cache[table] = {row[1] for row in cur.fetchall()}
            if col not in existing_cols_cache[table]:
                try:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")
                    existing_cols_cache[table].add(col)
                    migrated += 1
                except Exception as e:
                    logger.debug(f"Column migration note ({table}.{col}): {e}")

        if migrated:
            conn.commit()
            logger.info(f"✅ Added {migrated} missing column(s)")

        # 3) Create indexes (IF NOT EXISTS means no-op for existing ones)
        for stmt in _INDEXES_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt and not stmt.startswith("--"):
                try:
                    conn.execute(stmt)
                except Exception as e:
                    logger.debug(f"Index note: {e}")
        conn.commit()
        logger.info("✅ Indexes verified")

        # 4) Fix NULL user_ids in core tables (legacy data)
        _fix_null_user_ids(conn)

        # 5) Record schema version
        conn.execute(
            "INSERT OR REPLACE INTO schema_version (id, version, migrated_at) "
            "VALUES (1, ?, ?)",
            (SCHEMA_VERSION, int(time.time())),
        )
        conn.commit()
        logger.info(f"✅ Schema version {SCHEMA_VERSION} recorded")

    finally:
        conn.close()


def run_integrity_checks(db_path: str = "portfolio.db") -> List[str]:
    """Run data integrity checks. Returns list of issues found."""
    issues: List[str] = []
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        # FK integrity (skip known false positives on cash_flows → transactions,
        # which is a legacy FK that should reference portfolio_transactions)
        cur = conn.execute("PRAGMA foreign_key_check")
        fk_violations = cur.fetchall()
        for v in fk_violations:
            # v = (table, rowid, parent_table, fk_index)
            if v[0] == "cash_flows" and v[2] == "transactions":
                continue  # legacy FK — safe to ignore
            issues.append(
                f"FK violation: {v[0]} row {v[1]} → {v[2]} (parent missing)"
            )

        # Orphaned line items (statement_id not in financial_statements)
        cur = conn.execute(
            """SELECT COUNT(*) FROM financial_line_items li
               WHERE NOT EXISTS (
                   SELECT 1 FROM financial_statements fs WHERE fs.id = li.statement_id
               )"""
        )
        orphans = cur.fetchone()[0]
        if orphans:
            issues.append(f"Orphaned financial_line_items: {orphans} rows")

        # Orphaned extraction rows
        for child in ("financial_raw_extraction", "financial_normalized",
                       "financial_validation", "financial_user_edits"):
            cur = conn.execute(
                f"""SELECT COUNT(*) FROM {child} c
                    WHERE NOT EXISTS (
                        SELECT 1 FROM financial_uploads u WHERE u.id = c.upload_id
                    )"""
            )
            cnt = cur.fetchone()[0]
            if cnt:
                issues.append(f"Orphaned {child}: {cnt} rows")

        # Duplicate financial statements (same stock + type + year)
        cur = conn.execute(
            """SELECT stock_id, statement_type, fiscal_year, COUNT(*) AS cnt
               FROM financial_statements
               GROUP BY stock_id, statement_type, fiscal_year
               HAVING cnt > 1"""
        )
        for row in cur.fetchall():
            issues.append(
                f"Duplicate statement: stock_id={row[0]} "
                f"type={row[1]} year={row[2]} (×{row[3]})"
            )

        # NULL user_ids in core tables
        for tbl, col in [
            ("stocks", "user_id"),
            ("transactions", "user_id"),
            ("cash_deposits", "user_id"),
        ]:
            cur = conn.execute(
                f"SELECT COUNT(*) FROM {tbl} WHERE {col} IS NULL"
            )
            cnt = cur.fetchone()[0]
            if cnt:
                issues.append(f"NULL {col} in {tbl}: {cnt} rows")

        if not issues:
            issues.append("✅ All integrity checks passed")

    finally:
        conn.close()

    return issues


def get_schema_version(db_path: str = "portfolio.db") -> Optional[int]:
    """Return current schema version, or None if not tracked yet."""
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        )
        row = cur.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════════
#  Internal helpers
# ═══════════════════════════════════════════════════════════════════════

def _fix_null_user_ids(conn: sqlite3.Connection) -> None:
    """Set NULL user_id to the primary user (user with most transactions)."""
    try:
        cur = conn.execute(
            "SELECT user_id, COUNT(*) AS cnt FROM transactions "
            "WHERE user_id IS NOT NULL AND user_id > 0 "
            "GROUP BY user_id ORDER BY cnt DESC LIMIT 1"
        )
        row = cur.fetchone()
        default_uid = row[0] if row else 1

        fixed = 0
        for tbl in ("stocks", "transactions", "cash_deposits",
                     "portfolio_snapshots", "trading_history"):
            try:
                cur = conn.execute(
                    f"UPDATE {tbl} SET user_id = ? WHERE user_id IS NULL",
                    (default_uid,),
                )
                fixed += cur.rowcount
            except Exception:
                pass

        if fixed:
            conn.commit()
            logger.info(f"✅ Fixed {fixed} NULL user_id(s) → {default_uid}")
    except Exception as e:
        logger.debug(f"user_id fix note: {e}")


# ── CLI entry point ──────────────────────────────────────────────────

if __name__ == "__main__":
    import sys as _sys
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    path = _sys.argv[1] if len(_sys.argv) > 1 else "portfolio.db"
    print(f"Ensuring production schema on: {path}")
    ensure_production_schema(path)
    print("\nRunning integrity checks…")
    for issue in run_integrity_checks(path):
        print(f"  {issue}")
