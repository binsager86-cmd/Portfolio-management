# Database Schema Documentation

> **Generated:** 2026-02-24  
> **Source:** `portfolio.db` (1.69 MB, 47 tables)  
> **Engine:** SQLite 3 (WAL mode)  
> **Raw SQL dump:** [`schema_current.sql`](schema_current.sql)

---

## Table of Contents

1. [Schema Overview](#1-schema-overview)
2. [Table Groups](#2-table-groups)
3. [Foreign Key Relationship Map](#3-foreign-key-relationship-map)
4. [Explicit FK Constraints (26)](#4-explicit-fk-constraints)
5. [Implicit FK Relationships (45)](#5-implicit-fk-relationships)
6. [Core Tables — Detailed](#6-core-tables--detailed)
7. [PostgreSQL Migration Notes](#7-postgresql-migration-notes)

---

## 1. Schema Overview

| Metric | Value |
|--------|-------|
| Total Tables | 47 |
| Explicit FKs | 26 |
| Implicit FKs (user_id etc.) | 45 |
| Indexes | 42 |
| Views | 5 |
| Triggers | 0 |

### Row Counts (Non-Empty Tables)

| Table | Rows | Group |
|-------|------|-------|
| `financial_normalized` | 3,472 | Peer Analysis |
| `financial_line_items` | 1,671 | Peer Analysis |
| `analysis_audit_log` | 169 | Peer Analysis |
| `cbk_rate_cache` | 173 | FX |
| `security_aliases` | 151 | Securities |
| `portfolio_snapshots` | 110 | Snapshots |
| `portfolio_transactions` | 79 | Transactions |
| `cash_flows` | 73 | Cash |
| `financial_statements` | 73 | Peer Analysis |
| `financial_raw_extraction` | 71 | Peer Analysis |
| `transactions` | 69 | Transactions (legacy) |
| `cash_deposits` | 52 | Cash |
| `trading_history` | 50 | Transactions (legacy) |
| `securities_master` | 44 | Securities |
| `stock_metrics` | 30 | Peer Analysis |
| `financial_validation` | 29 | Peer Analysis |
| `financial_uploads` | 23 | Peer Analysis |
| `stocks` | 19 | Portfolio |
| `position_snapshots` | 16 | Snapshots |
| `stocks_master` | 14 | Securities |
| `pfm_asset_items` | 9 | PFM |
| `valuation_models` | 9 | Peer Analysis |
| `daily_snapshots` | 6 | Snapshots |
| `assets` | 5 | Legacy |
| `users` | 4 | Auth |
| `portfolios` | 3 | Portfolio |
| `external_accounts` | 3 | Portfolio |
| `portfolio_cash` | 3 | Cash |
| `ledger_entries` | 3 | Legacy |
| `prices` | 3 | Legacy |
| `pfm_snapshots` | 2 | PFM |
| `pfm_liability_items` | 2 | PFM |
| `analysis_stocks` | 2 | Peer Analysis |
| `stock_scores` | 2 | Peer Analysis |
| `fx_rates` | 1 | FX |
| `schema_version` | 1 | System |
| `settings` | 1 | System |
| `user_sessions` | 1 | Auth |

---

## 2. Table Groups

### 🔐 Auth & Users (3 tables)
| Table | Purpose |
|-------|---------|
| `users` | User accounts (username, password_hash, email, Gemini API key) |
| `user_sessions` | Session tokens (FK → users) |
| `password_resets` | OTP-based password reset tokens |

### 📊 Portfolio Core (4 tables)
| Table | Purpose |
|-------|---------|
| `portfolios` | Portfolio entities: KFH, BBYN, USA (user_id, name, base_currency) |
| `stocks` | User's stock watchlist with live prices (per portfolio) |
| `external_accounts` | Brokerage accounts linked to portfolios (FK → portfolios) |
| `portfolio_cash` | Cash balance per portfolio (manual override support) |

### 💰 Transactions (3 tables — current + 2 legacy)
| Table | Purpose |
|-------|---------|
| `portfolio_transactions` | **Current:** Normalized transactions (FK → portfolios, stocks_master, external_accounts) |
| `transactions` | **Legacy (v1):** Original transaction format (stock_symbol as TEXT, many added columns) |
| `trading_history` | **Legacy (v0):** Earliest transaction format (stock_symbol, Buy/Sell only) |

### 💵 Cash Management (3 tables)
| Table | Purpose |
|-------|---------|
| `cash_deposits` | Cash deposits with `include_in_analysis` flag, soft-delete |
| `cash_flows` | Double-entry cash flow records (FK → external_accounts, transactions) |
| `bank_cashflows` | Bank-level cash inflows/outflows |

### 📈 Snapshots & Performance (3 tables)
| Table | Purpose |
|-------|---------|
| `portfolio_snapshots` | Daily portfolio value + TWR/MWRR metrics |
| `position_snapshots` | Per-stock position state at a point in time |
| `daily_snapshots` | Asset-level daily valuations (composite PK: date + asset_id) |

### 🏛️ Securities Master (3-layer architecture)
| Table | Purpose |
|-------|---------|
| `securities_master` | Canonical security records (security_id PK, exchange, ticker, ISIN) |
| `security_aliases` | Many-to-one aliases (broker formats, legacy names → security_id) |
| `symbol_mappings` | User input → canonical ticker resolution |
| `stocks_master` | Normalized stock reference data (used by portfolio_transactions) |

### 🤖 Peer Analysis / Financials (10 tables)
| Table | Purpose |
|-------|---------|
| `analysis_stocks` | Stocks being analyzed (separate from portfolio stocks) |
| `analysis_audit_log` | Audit trail for analysis operations |
| `financial_uploads` | PDF uploads for extraction |
| `financial_raw_extraction` | Raw table data extracted from PDFs |
| `financial_normalized` | Standardized financial data |
| `financial_statements` | Income/Balance/Cashflow statements |
| `financial_line_items` | Individual line items within statements |
| `financial_user_edits` | User corrections to extracted data |
| `financial_validation` | Validation rules and results |
| `stock_metrics` | Calculated ratios (profitability, liquidity, etc.) |
| `stock_scores` | Composite scores (fundamental, valuation, growth, quality) |
| `valuation_models` | DCF, Graham, DDM models with parameters |

### 💰 PFM — Personal Financial Management (4 tables)
| Table | Purpose |
|-------|---------|
| `pfm_snapshots` | Point-in-time PFM snapshots |
| `pfm_asset_items` | Assets: real_estate, shares, gold, cash, crypto (FK → pfm_snapshots CASCADE) |
| `pfm_liability_items` | Liabilities: current/long-term (FK → pfm_snapshots CASCADE) |
| `pfm_income_expense_items` | Income/expense line items (FK → pfm_snapshots CASCADE) |

### 💱 FX & Pricing (3 tables)
| Table | Purpose |
|-------|---------|
| `fx_rates` | Historical FX rates (from/to currency pairs) |
| `cbk_rate_cache` | Central Bank of Kuwait rate cache |
| `prices` | Historical asset prices (FK → assets) |

### 🗄️ Legacy / Backend (3 tables)
| Table | Purpose |
|-------|---------|
| `assets` | Legacy asset registry (setup_db.py schema) |
| `ledger_entries` | Legacy double-entry ledger (FK → assets) |
| `daily_snapshots_old` | Deprecated single-row daily snapshots |

### ⚙️ System (3 tables)
| Table | Purpose |
|-------|---------|
| `schema_version` | Migration version tracking |
| `settings` | Key-value app settings |
| `portfolio_summary` | Materialized summary (auto-computed, currently empty) |

---

## 3. Foreign Key Relationship Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USERS (root)                                │
│  id ─┬──────────────────────────────────────────────────────────    │
│      │                                                              │
│      ├─→ user_sessions.user_id                                      │
│      ├─→ portfolios.user_id                                         │
│      ├─→ stocks.user_id                                             │
│      ├─→ transactions.user_id                                       │
│      ├─→ portfolio_transactions.user_id                             │
│      ├─→ cash_deposits.user_id                                      │
│      ├─→ cash_flows.user_id                                         │
│      ├─→ bank_cashflows.user_id                                     │
│      ├─→ portfolio_snapshots.user_id                                │
│      ├─→ position_snapshots.user_id                                 │
│      ├─→ external_accounts.user_id                                  │
│      ├─→ securities_master.user_id                                  │
│      ├─→ security_aliases.user_id                                   │
│      ├─→ pfm_snapshots.user_id                                      │
│      ├─→ pfm_asset_items.user_id                                    │
│      ├─→ pfm_liability_items.user_id                                │
│      ├─→ pfm_income_expense_items.user_id                           │
│      ├─→ analysis_stocks.user_id                                    │
│      ├─→ analysis_audit_log.user_id                                 │
│      ├─→ financial_audit_log.user_id                                │
│      ├─→ financial_uploads.user_id                                  │
│      ├─→ portfolio_summary.user_id                                  │
│      └─→ trading_history.user_id                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     PORTFOLIOS                                      │
│  id ─┬──→ external_accounts.portfolio_id                            │
│      ├──→ portfolio_transactions.portfolio_id                       │
│      ├──→ position_snapshots.portfolio_id                           │
│      ├──→ transactions.portfolio_id                                 │
│      └──→ portfolio_cash.portfolio (by name, not FK)                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     STOCKS_MASTER                                   │
│  id ─┬──→ portfolio_transactions.stock_id                           │
│      ├──→ position_snapshots.stock_id                               │
│      └──→ symbol_mappings.stock_id                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     SECURITIES_MASTER                               │
│  security_id ─┬──→ security_aliases.security_id                     │
│               └──→ transactions.security_id                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL_ACCOUNTS                               │
│  id ─┬──→ portfolio_transactions.account_id                         │
│      ├──→ cash_flows.account_id                                     │
│      └──→ transactions.account_id                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     ANALYSIS_STOCKS                                 │
│  id ─┬──→ financial_statements.stock_id                             │
│      ├──→ financial_uploads.stock_id                                │
│      ├──→ stock_metrics.stock_id                                    │
│      ├──→ stock_scores.stock_id                                     │
│      └──→ valuation_models.stock_id                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     FINANCIAL_UPLOADS                               │
│  id ─┬──→ financial_raw_extraction.upload_id                        │
│      ├──→ financial_normalized.upload_id                            │
│      ├──→ financial_user_edits.upload_id                            │
│      └──→ financial_validation.upload_id                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     FINANCIAL_STATEMENTS                            │
│  id ──→ financial_line_items.statement_id                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     PFM_SNAPSHOTS                                   │
│  id ─┬──→ pfm_asset_items.snapshot_id          (ON DELETE CASCADE)  │
│      ├──→ pfm_liability_items.snapshot_id      (ON DELETE CASCADE)  │
│      └──→ pfm_income_expense_items.snapshot_id (ON DELETE CASCADE)  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     ASSETS (legacy)                                 │
│  asset_id ─┬──→ ledger_entries.asset_id                             │
│            ├──→ prices.asset_id                                     │
│            └──→ daily_snapshots.asset_id                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     TRANSACTIONS (legacy v1)                        │
│  id ──→ cash_flows.related_txn_id                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Explicit FK Constraints

These are enforced at the SQL level (though SQLite has FK enforcement OFF by default):

| # | From Table | From Column | → To Table | To Column | ON DELETE |
|---|-----------|-------------|-----------|-----------|-----------|
| 1 | `cash_flows` | `account_id` | `external_accounts` | `id` | NO ACTION |
| 2 | `cash_flows` | `related_txn_id` | `transactions` | `id` | NO ACTION |
| 3 | `external_accounts` | `portfolio_id` | `portfolios` | `id` | NO ACTION |
| 4 | `financial_line_items` | `statement_id` | `financial_statements` | `id` | NO ACTION |
| 5 | `financial_normalized` | `upload_id` | `financial_uploads` | `id` | NO ACTION |
| 6 | `financial_raw_extraction` | `upload_id` | `financial_uploads` | `id` | NO ACTION |
| 7 | `financial_statements` | `stock_id` | `analysis_stocks` | `id` | NO ACTION |
| 8 | `financial_uploads` | `stock_id` | `analysis_stocks` | `id` | NO ACTION |
| 9 | `financial_user_edits` | `upload_id` | `financial_uploads` | `id` | NO ACTION |
| 10 | `financial_validation` | `upload_id` | `financial_uploads` | `id` | NO ACTION |
| 11 | `ledger_entries` | `asset_id` | `assets` | `asset_id` | NO ACTION |
| 12 | `pfm_asset_items` | `snapshot_id` | `pfm_snapshots` | `id` | **CASCADE** |
| 13 | `pfm_income_expense_items` | `snapshot_id` | `pfm_snapshots` | `id` | **CASCADE** |
| 14 | `pfm_liability_items` | `snapshot_id` | `pfm_snapshots` | `id` | **CASCADE** |
| 15 | `portfolio_transactions` | `portfolio_id` | `portfolios` | `id` | NO ACTION |
| 16 | `portfolio_transactions` | `stock_id` | `stocks_master` | `id` | NO ACTION |
| 17 | `portfolio_transactions` | `account_id` | `external_accounts` | `id` | NO ACTION |
| 18 | `position_snapshots` | `stock_id` | `stocks_master` | `id` | NO ACTION |
| 19 | `position_snapshots` | `portfolio_id` | `portfolios` | `id` | NO ACTION |
| 20 | `prices` | `asset_id` | `assets` | `asset_id` | NO ACTION |
| 21 | `security_aliases` | `security_id` | `securities_master` | `security_id` | NO ACTION |
| 22 | `stock_metrics` | `stock_id` | `analysis_stocks` | `id` | NO ACTION |
| 23 | `stock_scores` | `stock_id` | `analysis_stocks` | `id` | NO ACTION |
| 24 | `symbol_mappings` | `stock_id` | `stocks_master` | `id` | NO ACTION |
| 25 | `user_sessions` | `user_id` | `users` | `id` | NO ACTION |
| 26 | `valuation_models` | `stock_id` | `analysis_stocks` | `id` | NO ACTION |

### ⚠️ Critical for PostgreSQL Migration

- All 26 FKs use **ON DELETE NO ACTION** except the 3 PFM tables which use **CASCADE**
- PostgreSQL enforces FKs always — insert order matters!
- Consider adding `ON DELETE CASCADE` to child tables like `financial_*` → `financial_uploads`
- The `transactions` table has FK columns (`security_id`, `portfolio_id`, `account_id`) **without** explicit FOREIGN KEY constraints — add them in PG

---

## 5. Implicit FK Relationships

These columns follow FK naming conventions but lack explicit FOREIGN KEY constraints. **Must be formalized in PostgreSQL:**

| From Table | Column | → Implied Target | Status |
|-----------|--------|------------------|--------|
| `analysis_audit_log` | `user_id` | `users.id` | Add FK |
| `analysis_stocks` | `user_id` | `users.id` | Add FK |
| `bank_cashflows` | `user_id` | `users.id` | Add FK |
| `cash_deposits` | `user_id` | `users.id` | Add FK |
| `financial_audit_log` | `user_id` | `users.id` | Add FK |
| `pfm_asset_items` | `user_id` | `users.id` | Add FK |
| `pfm_income_expense_items` | `user_id` | `users.id` | Add FK |
| `pfm_liability_items` | `user_id` | `users.id` | Add FK |
| `pfm_snapshots` | `user_id` | `users.id` | Add FK |
| `portfolio_cash` | `user_id` | `users.id` | Add FK |
| `portfolio_snapshots` | `user_id` | `users.id` | Add FK |
| `portfolio_summary` | `user_id` | `users.id` | Add FK |
| `portfolios` | `user_id` | `users.id` | Add FK |
| `position_snapshots` | `user_id` | `users.id` | Add FK |
| `securities_master` | `user_id` | `users.id` | Add FK |
| `security_aliases` | `user_id` | `users.id` | Add FK |
| `stocks` | `user_id` | `users.id` | Add FK |
| `trading_history` | `user_id` | `users.id` | Add FK |
| `transactions` | `user_id` | `users.id` | Add FK |
| `transactions` | `security_id` | `securities_master.security_id` | Add FK |
| `transactions` | `portfolio_id` | `portfolios.id` | Add FK |
| `transactions` | `account_id` | `external_accounts.id` | Add FK |

---

## 6. Core Tables — Detailed

### `users`
```sql
CREATE TABLE users (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    username                    TEXT NOT NULL UNIQUE,
    password_hash               TEXT NOT NULL,
    created_at                  INTEGER NOT NULL,  -- epoch seconds
    email                       TEXT,
    name                        TEXT,
    gemini_api_key              TEXT,              -- plaintext (deprecated)
    gemini_api_key_encrypted    TEXT,              -- encrypted version
    gemini_api_key_last_validated INTEGER,
    gemini_quota_reset_at       INTEGER,
    gemini_requests_today       INTEGER DEFAULT 0
);
```

### `portfolios`
```sql
CREATE TABLE portfolios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,  -- → users.id
    name          TEXT NOT NULL,      -- 'KFH', 'BBYN', 'USA'
    base_currency TEXT DEFAULT 'KWD',
    description   TEXT,
    created_at    INTEGER,
    UNIQUE(user_id, name)
);
```

### `portfolio_transactions` (current transaction system)
```sql
CREATE TABLE portfolio_transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,       -- → users.id
    portfolio_id     INTEGER NOT NULL,       -- → portfolios.id
    txn_type         TEXT NOT NULL,          -- BUY/SELL/DIVIDEND/DEPOSIT/WITHDRAWAL
    source           TEXT NOT NULL DEFAULT 'MANUAL',
    source_reference TEXT,
    stock_id         INTEGER,               -- → stocks_master.id (NULL for cash txns)
    account_id       INTEGER,               -- → external_accounts.id
    shares           REAL,
    price            REAL,
    amount           REAL NOT NULL,          -- signed: negative for buys, positive for sells/dividends
    fees             REAL DEFAULT 0,
    txn_date         TEXT NOT NULL,          -- ISO date
    notes            TEXT,
    legacy_txn_id    INTEGER,               -- link to old transactions.id
    created_at       INTEGER,
    created_by       INTEGER,
    is_deleted       INTEGER DEFAULT 0,     -- soft-delete flag
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
    FOREIGN KEY (stock_id) REFERENCES stocks_master(id),
    FOREIGN KEY (account_id) REFERENCES external_accounts(id)
);
```

### `transactions` (legacy — still used by ui.py Streamlit)
```sql
CREATE TABLE transactions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER,
    portfolio           TEXT DEFAULT 'KFH',      -- portfolio name (not FK)
    stock_symbol        TEXT NOT NULL,            -- raw user input
    txn_date            TEXT NOT NULL,
    txn_type            TEXT NOT NULL,            -- Buy/Sell/Dividend/Bonus
    purchase_cost       REAL DEFAULT 0,
    sell_value          REAL DEFAULT 0,
    shares              REAL DEFAULT 0,
    bonus_shares        REAL DEFAULT 0,
    cash_dividend       REAL DEFAULT 0,
    reinvested_dividend REAL DEFAULT 0,
    price_override      REAL,
    planned_cum_shares  REAL,
    fees                REAL DEFAULT 0,
    broker              TEXT,
    reference           TEXT,
    notes               TEXT,
    category            TEXT,
    created_at          INTEGER NOT NULL,
    -- V2 migration columns:
    security_id         TEXT,                    -- → securities_master.security_id
    stock_master_id     INTEGER,                 -- → stocks_master.id
    portfolio_id        INTEGER,                 -- → portfolios.id
    account_id          INTEGER,                 -- → external_accounts.id
    source              TEXT DEFAULT 'MANUAL',
    source_reference    TEXT,
    is_deleted          INTEGER DEFAULT 0,
    deleted_at          INTEGER,
    deleted_by          INTEGER,
    -- Position tracking at time of txn:
    avg_cost_at_txn     REAL,
    realized_pnl_at_txn REAL,
    cost_basis_at_txn   REAL,
    shares_held_at_txn  REAL,
    fx_rate_at_txn      REAL
);
```

### `cash_deposits`
```sql
CREATE TABLE cash_deposits (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name          TEXT,
    deposit_date       TEXT NOT NULL,
    amount             REAL NOT NULL,
    description        TEXT,
    comments           TEXT,
    created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    portfolio          TEXT DEFAULT 'KFH',
    include_in_analysis INTEGER DEFAULT 1,     -- analysis toggle
    currency           TEXT DEFAULT 'KWD',
    user_id            INTEGER,
    source             TEXT,
    notes              TEXT,
    source_reference   TEXT,
    is_deleted         INTEGER DEFAULT 0,      -- soft-delete
    deleted_at         INTEGER,
    deleted_by         INTEGER,
    fx_rate_at_deposit REAL DEFAULT 1.0
);
```

### `portfolio_snapshots`
```sql
CREATE TABLE portfolio_snapshots (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              INTEGER DEFAULT 1,
    snapshot_date        TEXT NOT NULL,
    portfolio_value      REAL NOT NULL,
    daily_movement       REAL DEFAULT 0,
    beginning_difference REAL DEFAULT 0,
    deposit_cash         REAL DEFAULT 0,
    accumulated_cash     REAL DEFAULT 0,
    net_gain             REAL DEFAULT 0,
    change_percent       REAL DEFAULT 0,
    roi_percent          REAL DEFAULT 0,
    created_at           INTEGER NOT NULL,
    twr_percent          REAL,              -- Time-Weighted Return
    mwrr_percent         REAL,              -- Money-Weighted Rate of Return
    UNIQUE(snapshot_date, user_id)
);
```

### `securities_master` (3-layer root)
```sql
CREATE TABLE securities_master (
    security_id      TEXT PRIMARY KEY,        -- e.g. 'KW_MABANEE'
    user_id          INTEGER NOT NULL DEFAULT 1,
    exchange         TEXT NOT NULL,
    canonical_ticker TEXT NOT NULL,
    display_name     TEXT,
    isin             TEXT,
    currency         TEXT NOT NULL DEFAULT 'KWD',
    country          TEXT NOT NULL DEFAULT 'KW',
    status           TEXT DEFAULT 'active' CHECK(status IN ('active','delisted','suspended')),
    sector           TEXT,
    created_at       INTEGER,
    updated_at       INTEGER,
    UNIQUE(canonical_ticker, exchange, user_id)
);
```

---

## 7. PostgreSQL Migration Notes

### Type Mapping

| SQLite Type | PostgreSQL Type | Notes |
|-------------|----------------|-------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL` or `BIGSERIAL` | Use `BIGSERIAL` for high-volume tables |
| `INTEGER` (flags: is_deleted, include_in_analysis) | `BOOLEAN` | Map 0/1 → false/true |
| `INTEGER` (created_at, epoch seconds) | `TIMESTAMPTZ` | Convert `int(time.time())` → `NOW()` |
| `REAL` | `NUMERIC(18,6)` | For financial amounts (precision matters) |
| `REAL` (percentages) | `DOUBLE PRECISION` | For TWR/MWRR/ROI |
| `TEXT` (dates: YYYY-MM-DD) | `DATE` | Direct cast |
| `TEXT` (timestamps) | `TIMESTAMPTZ` | Parse ISO strings |
| `TEXT` (general) | `TEXT` or `VARCHAR(255)` | Per column semantics |
| `JSON` | `JSONB` | Use JSONB for indexing |
| `BOOLEAN` | `BOOLEAN` | SQLite stores as 0/1 |

### Insert Order (Respecting FKs)

```
1. users
2. portfolios, analysis_stocks, assets, pfm_snapshots
3. external_accounts, stocks, stocks_master, securities_master
4. security_aliases, symbol_mappings
5. transactions, portfolio_transactions, cash_deposits
6. cash_flows, portfolio_snapshots, position_snapshots
7. financial_uploads
8. financial_statements, financial_raw_extraction, financial_normalized
9. financial_line_items, financial_user_edits, financial_validation
10. stock_metrics, stock_scores, valuation_models
11. pfm_asset_items, pfm_liability_items, pfm_income_expense_items
12. ledger_entries, prices, daily_snapshots
13. bank_cashflows, cbk_rate_cache, fx_rates
14. user_sessions, password_resets, settings, schema_version
```

### Tables Safe to Drop (Legacy/Deprecated)

| Table | Reason |
|-------|--------|
| `daily_snapshots_old` | Replaced by `daily_snapshots` + `portfolio_snapshots` |
| `trading_history` | Superseded by `transactions` → `portfolio_transactions` |
| `portfolio_summary` | Empty materialized view, can be computed |
| `assets` | Legacy backend schema (setup_db.py), not used by UI |
| `ledger_entries` | Legacy double-entry ledger, 3 rows only |
| `prices` | Legacy price storage, 3 rows only |

### CHECK Constraints to Add in PostgreSQL

```sql
-- portfolio_transactions
CHECK (txn_type IN ('BUY','SELL','DIVIDEND','DEPOSIT','WITHDRAWAL','BONUS','FEE'))

-- transactions (legacy)  
CHECK (txn_type IN ('Buy','Sell','Dividend','Bonus'))

-- securities_master
CHECK (status IN ('active','delisted','suspended'))

-- pfm_asset_items
CHECK (asset_type IN ('real_estate','shares','gold','cash','crypto','other'))

-- pfm_income_expense_items
CHECK (kind IN ('income','expense'))

-- security_aliases
CHECK (alias_type IN ('user_input','broker_format','official','legacy'))
```

### Views to Recreate

| View | Purpose |
|------|---------|
| `bank_totals` | SUM of bank_cashflows grouped by user/bank |
| `cash_balances` | Cash balance from ledger_entries by currency |
| `holdings` | Active holdings from ledger_entries + assets |
| `portfolio_cash_summary` | Cash position summary from portfolio_transactions |
| `portfolio_deposit_summary` | Deposit/withdrawal summary per portfolio |
| `stock_position_summary` | Per-stock position summary with buy/sell totals |

---

## Files

| File | Purpose |
|------|---------|
| [`schema_current.sql`](schema_current.sql) | Raw SQL dump (3,254 lines — both DBs) |
| [`scripts/export_schema.py`](scripts/export_schema.py) | Script to regenerate schema dump |
| `SCHEMA_DOCUMENTATION.md` | This file |
