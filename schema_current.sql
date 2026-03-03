================================================================================
-- PRODUCTION (portfolio.db)
-- Path: C:\Users\Sager\OneDrive\Desktop\portfolio_app\portfolio.db
-- Size: 1,687,552 bytes
================================================================================

-- Tables: 47
--   analysis_audit_log: 169 rows
--   analysis_stocks: 2 rows
--   assets: 5 rows
--   bank_cashflows: 0 rows
--   cash_deposits: 52 rows
--   cash_flows: 73 rows
--   cbk_rate_cache: 173 rows
--   daily_snapshots: 6 rows
--   daily_snapshots_old: 0 rows
--   external_accounts: 3 rows
--   financial_audit_log: 0 rows
--   financial_line_items: 1,671 rows
--   financial_normalized: 3,472 rows
--   financial_raw_extraction: 71 rows
--   financial_statements: 73 rows
--   financial_uploads: 23 rows
--   financial_user_edits: 0 rows
--   financial_validation: 29 rows
--   fx_rates: 1 rows
--   ledger_entries: 3 rows
--   password_resets: 0 rows
--   pfm_asset_items: 9 rows
--   pfm_income_expense_items: 0 rows
--   pfm_liability_items: 2 rows
--   pfm_snapshots: 2 rows
--   portfolio_cash: 3 rows
--   portfolio_snapshots: 110 rows
--   portfolio_summary: 0 rows
--   portfolio_transactions: 79 rows
--   portfolios: 3 rows
--   position_snapshots: 16 rows
--   prices: 3 rows
--   schema_version: 1 rows
--   securities_master: 44 rows
--   security_aliases: 151 rows
--   settings: 1 rows
--   sqlite_sequence: 33 rows
--   stock_metrics: 30 rows
--   stock_scores: 2 rows
--   stocks: 19 rows
--   stocks_master: 14 rows
--   symbol_mappings: 6 rows
--   trading_history: 50 rows
--   transactions: 69 rows
--   user_sessions: 1 rows
--   users: 4 rows
--   valuation_models: 9 rows

-- ===== CREATE TABLE statements =====

CREATE TABLE analysis_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    operation TEXT NOT NULL,               -- 'INSERT', 'UPDATE', 'DELETE'
    entity_type TEXT NOT NULL,             -- 'stock', 'statement', 'line_item', 'metric', 'valuation', 'score'
    entity_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    details TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE analysis_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    company_name TEXT NOT NULL,
    exchange TEXT DEFAULT 'NYSE',
    currency TEXT DEFAULT 'USD',
    sector TEXT,
    industry TEXT,
    country TEXT,
    isin TEXT,
    cik TEXT,
    description TEXT,
    website TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, outstanding_shares REAL,
    UNIQUE(user_id, symbol)
);

CREATE TABLE assets (
        asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        asset_type TEXT NOT NULL,   -- KW_STOCK / US_STOCK / CRYPTO
        exchange TEXT,              -- e.g. BOURSAA / NASDAQ / BINANCE
        currency TEXT NOT NULL      -- KWD / USD / ...
    );

CREATE TABLE bank_cashflows (
            bank_txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_name TEXT NOT NULL,
            txn_date TEXT NOT NULL,              -- YYYY-MM-DD
            amount REAL NOT NULL,                -- + deposit, - withdrawal
            description TEXT,
            comments TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        , user_id INTEGER DEFAULT 1);

CREATE TABLE cash_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_name TEXT,
        deposit_date TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        comments TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        portfolio TEXT DEFAULT 'KFH',
        include_in_analysis INTEGER DEFAULT 1,
        currency TEXT DEFAULT 'KWD',
        user_id INTEGER,
        source TEXT,
        notes TEXT,
        source_reference TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        deleted_by INTEGER,
        fx_rate_at_deposit REAL DEFAULT 1.0
    );

CREATE TABLE cash_flows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER,
        flow_type TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'KWD',
        related_txn_id INTEGER,
        flow_date TEXT NOT NULL,
        description TEXT,
        reconciled INTEGER DEFAULT 0,
        created_at INTEGER,
        FOREIGN KEY (account_id) REFERENCES external_accounts(id),
        FOREIGN KEY (related_txn_id) REFERENCES transactions(id)
    );

CREATE TABLE cbk_rate_cache (
                id INTEGER PRIMARY KEY,
                rate REAL NOT NULL,
                fetched_date TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

CREATE TABLE daily_snapshots (
    snapshot_date TEXT NOT NULL,
    asset_id      INTEGER NOT NULL,
    quantity      REAL NOT NULL,
    avg_cost      REAL NOT NULL,
    cost_value    REAL NOT NULL,
    mkt_price     REAL NOT NULL,
    mkt_value     REAL NOT NULL,
    currency      TEXT NOT NULL,
    fx_to_base     REAL NOT NULL,
    mkt_value_base REAL NOT NULL,
    cost_value_base REAL NOT NULL,
    pnl_base      REAL NOT NULL,
    PRIMARY KEY (snapshot_date, asset_id)
);

CREATE TABLE "daily_snapshots_old" (
        snapshot_date TEXT PRIMARY KEY, -- YYYY-MM-DD
        portfolio_value_base REAL NOT NULL,
        cash_balance_base REAL NOT NULL,
        invested_cost_base REAL NOT NULL,
        unrealized_pl_base REAL NOT NULL,
        realized_pl_base REAL NOT NULL,
        dividends_ytd_base REAL NOT NULL
    );

CREATE TABLE external_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        portfolio_id INTEGER,
        name TEXT NOT NULL,
        account_number TEXT,
        currency TEXT DEFAULT 'KWD',
        account_type TEXT DEFAULT 'BROKERAGE',
        current_balance REAL DEFAULT 0,
        last_reconciled_date TEXT,
        created_at INTEGER,
        UNIQUE(user_id, name),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

CREATE TABLE financial_audit_log (
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

CREATE TABLE financial_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER NOT NULL,
    line_item_code TEXT NOT NULL,
    line_item_name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    order_index INTEGER,
    parent_item_id INTEGER,
    is_total BOOLEAN DEFAULT 0,
    manually_edited BOOLEAN DEFAULT 0,
    edited_by_user_id INTEGER,
    edited_at INTEGER,
    FOREIGN KEY (statement_id) REFERENCES financial_statements(id)
);

CREATE TABLE financial_normalized (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT NOT NULL,
    period_end_date TEXT,
    currency        TEXT DEFAULT 'USD',
    unit_scale      INTEGER DEFAULT 1,
    line_item_key   TEXT NOT NULL,
    label_raw       TEXT,
    value           REAL,
    source_page     INTEGER,
    source_table_id INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE financial_raw_extraction (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    page_num        INTEGER,
    method          TEXT,
    table_id        INTEGER,
    table_json      TEXT,
    header_context  TEXT,
    confidence_score REAL DEFAULT 0.0,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE financial_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    statement_type TEXT NOT NULL,          -- 'income', 'balance', 'cashflow'
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER,               -- NULL = annual
    period_end_date TEXT NOT NULL,         -- ISO 'YYYY-MM-DD'
    filing_date TEXT,
    source_file TEXT,
    extracted_by TEXT DEFAULT 'gemini',
    confidence_score REAL,
    verified_by_user BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(stock_id, statement_type, period_end_date),
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE financial_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    stock_id    INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL,
    pdf_path    TEXT,
    pdf_type    TEXT DEFAULT 'text',
    status      TEXT DEFAULT 'processing',
    error_message TEXT,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE financial_user_edits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    period          TEXT,
    line_item_key   TEXT NOT NULL,
    old_value       REAL,
    new_value       REAL,
    edited_at       INTEGER NOT NULL,
    edited_by       INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE financial_validation (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    rule_name       TEXT NOT NULL,
    expected_value  REAL,
    actual_value    REAL,
    diff            REAL,
    pass_fail       TEXT DEFAULT 'unknown',
    notes           TEXT,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE fx_rates (
        fx_id INTEGER PRIMARY KEY AUTOINCREMENT,
        rate_date TEXT NOT NULL,         -- YYYY-MM-DD
        from_ccy TEXT NOT NULL,          -- USD
        to_ccy TEXT NOT NULL,            -- KWD
        rate REAL NOT NULL,              -- 1 from_ccy = rate to_ccy
        source TEXT,
        UNIQUE(rate_date, from_ccy, to_ccy)
    );

CREATE TABLE ledger_entries (
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

CREATE TABLE password_resets (
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );

CREATE TABLE pfm_asset_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            asset_type TEXT NOT NULL CHECK(asset_type IN ('real_estate', 'shares', 'gold', 'cash', 'crypto', 'other')),
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            quantity REAL,
            price REAL,
            currency TEXT DEFAULT 'KWD',
            value_kwd REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        );

CREATE TABLE pfm_income_expense_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
            category TEXT NOT NULL,
            monthly_amount REAL NOT NULL DEFAULT 0,
            is_finance_cost INTEGER DEFAULT 0,
            is_gna INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        );

CREATE TABLE pfm_liability_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            amount_kwd REAL NOT NULL DEFAULT 0,
            is_current INTEGER DEFAULT 0,
            is_long_term INTEGER DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        );

CREATE TABLE pfm_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            snapshot_date TEXT NOT NULL,
            notes TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(user_id, snapshot_date)
        );

CREATE TABLE portfolio_cash (
                        portfolio TEXT,
                        user_id INTEGER DEFAULT 1,
                        balance REAL,
                        currency TEXT DEFAULT 'KWD',
                        last_updated INTEGER, manual_override INTEGER DEFAULT 0,
                        PRIMARY KEY (portfolio, user_id)
                    );

CREATE TABLE portfolio_snapshots (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER DEFAULT 1,
                        snapshot_date TEXT NOT NULL,
                        portfolio_value REAL NOT NULL,
                        daily_movement REAL DEFAULT 0,
                        beginning_difference REAL DEFAULT 0,
                        deposit_cash REAL DEFAULT 0,
                        accumulated_cash REAL DEFAULT 0,
                        net_gain REAL DEFAULT 0,
                        change_percent REAL DEFAULT 0,
                        roi_percent REAL DEFAULT 0,
                        created_at INTEGER NOT NULL, twr_percent REAL, mwrr_percent REAL,
                        UNIQUE(snapshot_date, user_id)
                    );

CREATE TABLE portfolio_summary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, stock_symbol TEXT NOT NULL, portfolio TEXT DEFAULT KFH, currency TEXT DEFAULT KWD, total_buy_shares REAL DEFAULT 0, total_sell_shares REAL DEFAULT 0, net_shares REAL DEFAULT 0, total_buy_cost REAL DEFAULT 0, total_sell_value REAL DEFAULT 0, avg_cost_per_share REAL DEFAULT 0, total_cash_dividends REAL DEFAULT 0, total_bonus_shares REAL DEFAULT 0, total_reinvested_dividends REAL DEFAULT 0, realized_pnl REAL DEFAULT 0, first_buy_date TEXT, last_txn_date TEXT, txn_count INTEGER DEFAULT 0, updated_at INTEGER NOT NULL, UNIQUE(user_id, stock_symbol));

CREATE TABLE portfolio_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        portfolio_id INTEGER NOT NULL,
        txn_type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'MANUAL',
        source_reference TEXT,
        stock_id INTEGER,
        account_id INTEGER,
        shares REAL,
        price REAL,
        amount REAL NOT NULL,
        fees REAL DEFAULT 0,
        txn_date TEXT NOT NULL,
        notes TEXT,
        legacy_txn_id INTEGER,
        created_at INTEGER,
        created_by INTEGER,
        is_deleted INTEGER DEFAULT 0,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
        FOREIGN KEY (stock_id) REFERENCES stocks_master(id),
        FOREIGN KEY (account_id) REFERENCES external_accounts(id)
    );

CREATE TABLE portfolios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        base_currency TEXT DEFAULT 'KWD',
        description TEXT,
        created_at INTEGER,
        UNIQUE(user_id, name)
    );

CREATE TABLE position_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        stock_id INTEGER,
        portfolio_id INTEGER,
        stock_symbol TEXT,
        txn_id INTEGER,
        snapshot_date TEXT NOT NULL,
        total_shares REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        avg_cost REAL DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        cash_dividends_received REAL DEFAULT 0,
        status TEXT DEFAULT 'OPEN',
        created_at INTEGER,
        FOREIGN KEY (stock_id) REFERENCES stocks_master(id),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

CREATE TABLE prices (
        price_id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        price_date TEXT NOT NULL,       -- YYYY-MM-DD
        close_price REAL NOT NULL,
        source TEXT,
        UNIQUE(asset_id, price_date),
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
    );

CREATE TABLE schema_version (
    id                          INTEGER PRIMARY KEY CHECK (id = 1),
    version                     INTEGER NOT NULL DEFAULT 1,
    migrated_at                 INTEGER NOT NULL
);

CREATE TABLE securities_master (
                security_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL DEFAULT 1,
                exchange TEXT NOT NULL,
                canonical_ticker TEXT NOT NULL,
                display_name TEXT,
                isin TEXT,
                currency TEXT NOT NULL DEFAULT 'KWD',
                country TEXT NOT NULL DEFAULT 'KW',
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'delisted', 'suspended')),
                sector TEXT,
                created_at INTEGER,
                updated_at INTEGER,
                UNIQUE(canonical_ticker, exchange, user_id)
            );

CREATE TABLE security_aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                security_id TEXT NOT NULL,
                alias_name TEXT NOT NULL,
                alias_type TEXT DEFAULT 'user_input' CHECK(alias_type IN ('user_input', 'broker_format', 'official', 'legacy')),
                valid_from TEXT,
                valid_until TEXT,
                created_at INTEGER,
                FOREIGN KEY (security_id) REFERENCES securities_master(security_id),
                UNIQUE(alias_name, security_id, user_id)
            );

CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

CREATE TABLE sqlite_sequence(name,seq);

CREATE TABLE stock_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER,
    period_end_date TEXT NOT NULL,
    metric_type TEXT NOT NULL,             -- 'profitability', 'liquidity', 'leverage', 'efficiency', 'valuation'
    metric_name TEXT NOT NULL,
    metric_value REAL,
    created_at INTEGER NOT NULL,
    UNIQUE(stock_id, metric_name, period_end_date),
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE stock_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    scoring_date TEXT NOT NULL,
    overall_score REAL,
    fundamental_score REAL,
    valuation_score REAL,
    growth_score REAL,
    quality_score REAL,
    details JSON,
    analyst_notes TEXT,
    created_by_user_id INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE stocks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER DEFAULT 1,
                        symbol TEXT NOT NULL,
                        name TEXT,
                        current_price REAL DEFAULT 0,
                        portfolio TEXT DEFAULT 'KFH',
                        currency TEXT DEFAULT 'KWD',
                        tradingview_symbol TEXT,
                        tradingview_exchange TEXT, last_updated INTEGER, price_source TEXT, created_at INTEGER,
                        UNIQUE(symbol, user_id)
                    );

CREATE TABLE stocks_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        name TEXT,
        exchange TEXT DEFAULT 'KSE',
        currency TEXT DEFAULT 'KWD',
        isin TEXT,
        sector TEXT,
        country TEXT DEFAULT 'KW',
        status TEXT DEFAULT 'active',
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(ticker, exchange)
    );

CREATE TABLE symbol_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_input TEXT NOT NULL COLLATE NOCASE,
        canonical_ticker TEXT NOT NULL,
        stock_id INTEGER,
        created_at INTEGER,
        UNIQUE(user_input),
        FOREIGN KEY (stock_id) REFERENCES stocks_master(id)
    );

CREATE TABLE trading_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_symbol TEXT NOT NULL,
            txn_date TEXT NOT NULL,
            txn_type TEXT NOT NULL CHECK(txn_type IN ('Buy','Sell')),
            purchase_cost REAL NOT NULL DEFAULT 0,
            sell_value REAL NOT NULL DEFAULT 0,
            shares REAL NOT NULL DEFAULT 0,
            cash_dividend REAL NOT NULL DEFAULT 0,
            bonus_shares REAL NOT NULL DEFAULT 0,
            notes TEXT,
            created_at INTEGER NOT NULL
        , user_id INTEGER DEFAULT 1);

CREATE TABLE transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                portfolio TEXT DEFAULT 'KFH',
                stock_symbol TEXT NOT NULL,
                txn_date TEXT NOT NULL,
                txn_type TEXT NOT NULL, 
                purchase_cost REAL NOT NULL DEFAULT 0,
                sell_value REAL NOT NULL DEFAULT 0,
                shares REAL NOT NULL DEFAULT 0,
                bonus_shares REAL NOT NULL DEFAULT 0,
                cash_dividend REAL NOT NULL DEFAULT 0,
                reinvested_dividend REAL NOT NULL DEFAULT 0,
                price_override REAL,
                planned_cum_shares REAL,
                fees REAL DEFAULT 0,
                broker TEXT,
                reference TEXT,
                notes TEXT,
                category TEXT,
                created_at INTEGER NOT NULL
            , security_id TEXT, stock_master_id INTEGER, portfolio_id INTEGER, account_id INTEGER, source TEXT DEFAULT 'MANUAL', source_reference TEXT, is_deleted INTEGER DEFAULT 0, deleted_at INTEGER, deleted_by INTEGER, avg_cost_at_txn REAL, realized_pnl_at_txn REAL, cost_basis_at_txn REAL, shares_held_at_txn REAL, fx_rate_at_txn REAL);

CREATE TABLE user_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        , email TEXT, name TEXT, gemini_api_key TEXT, gemini_api_key_encrypted TEXT, gemini_api_key_last_validated INTEGER, gemini_quota_reset_at INTEGER, gemini_requests_today INTEGER DEFAULT 0);

CREATE TABLE valuation_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    model_type TEXT NOT NULL,              -- 'graham', 'dcf', 'ddm', 'multiples'
    valuation_date TEXT NOT NULL,
    intrinsic_value REAL,
    parameters JSON,
    assumptions JSON,
    created_by_user_id INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

-- ===== INDEXES =====

CREATE INDEX idx_aliases_name ON security_aliases(alias_name COLLATE NOCASE);

CREATE INDEX idx_aliases_security ON security_aliases(security_id);

CREATE INDEX idx_analysis_stocks_symbol ON analysis_stocks(symbol);

CREATE INDEX idx_analysis_stocks_user ON analysis_stocks(user_id);

CREATE INDEX idx_audit_created            ON financial_audit_log(created_at);

CREATE INDEX idx_audit_operation          ON financial_audit_log(operation);

CREATE INDEX idx_audit_user               ON financial_audit_log(user_id);

CREATE INDEX idx_bank_cashflows_bank_date ON bank_cashflows(bank_name, txn_date);

CREATE INDEX idx_bank_cashflows_user ON bank_cashflows(user_id);

CREATE INDEX idx_bank_cashflows_user_bank ON bank_cashflows(user_id, bank_name);

CREATE INDEX idx_cash_deposits_user       ON cash_deposits(user_id);

CREATE INDEX idx_cash_deposits_user_date  ON cash_deposits(user_id, deposit_date);

CREATE INDEX idx_cash_flows_account ON cash_flows(account_id);

CREATE INDEX idx_cash_flows_date ON cash_flows(flow_date);

CREATE INDEX idx_cash_flows_type ON cash_flows(flow_type);

CREATE INDEX idx_ext_accounts_user ON external_accounts(user_id);

CREATE INDEX idx_fin_edits_upload ON financial_user_edits(upload_id);

CREATE INDEX idx_fin_norm_upload ON financial_normalized(upload_id);

CREATE INDEX idx_fin_raw_upload ON financial_raw_extraction(upload_id);

CREATE INDEX idx_fin_uploads_stock ON financial_uploads(stock_id);

CREATE INDEX idx_fin_uploads_user ON financial_uploads(user_id);

CREATE INDEX idx_fin_valid_upload ON financial_validation(upload_id);

CREATE INDEX idx_financial_statements_stock ON financial_statements(stock_id);

CREATE INDEX idx_financial_statements_type_date ON financial_statements(statement_type, period_end_date);

CREATE INDEX idx_line_items_code ON financial_line_items(line_item_code);

CREATE INDEX idx_line_items_statement ON financial_line_items(statement_id);

CREATE INDEX idx_pfm_assets_user          ON pfm_asset_items(user_id);

CREATE INDEX idx_pfm_income_expense_user  ON pfm_income_expense_items(user_id);

CREATE INDEX idx_pfm_liabilities_user     ON pfm_liability_items(user_id);

CREATE INDEX idx_portfolios_user ON portfolios(user_id);

CREATE INDEX idx_pos_snap_status ON position_snapshots(status);

CREATE INDEX idx_pos_snap_stock ON position_snapshots(stock_id);

CREATE INDEX idx_pos_snap_user ON position_snapshots(user_id);

CREATE INDEX idx_pos_snapshots_date ON position_snapshots(snapshot_date);

CREATE INDEX idx_pos_snapshots_stock ON position_snapshots(stock_id);

CREATE INDEX idx_ptxn_date ON portfolio_transactions(txn_date);

CREATE INDEX idx_ptxn_portfolio_source ON portfolio_transactions(portfolio_id, source);

CREATE INDEX idx_ptxn_portfolio_type ON portfolio_transactions(portfolio_id, txn_type);

CREATE INDEX idx_ptxn_stock ON portfolio_transactions(stock_id);

CREATE INDEX idx_ptxn_user ON portfolio_transactions(user_id);

CREATE INDEX idx_securities_country ON securities_master(country);

CREATE INDEX idx_securities_exchange ON securities_master(exchange);

CREATE INDEX idx_securities_ticker ON securities_master(canonical_ticker);

CREATE INDEX idx_snapshots_user ON portfolio_snapshots(user_id);

CREATE INDEX idx_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date);

CREATE INDEX idx_stock_metrics_stock ON stock_metrics(stock_id);

CREATE INDEX idx_stock_scores_stock ON stock_scores(stock_id);

CREATE INDEX idx_stocks_master_ticker ON stocks_master(ticker);

CREATE INDEX idx_stocks_user ON stocks(user_id);

CREATE INDEX idx_stocks_user_portfolio     ON stocks(user_id, portfolio);

CREATE INDEX idx_symbol_mappings_input ON symbol_mappings(user_input);

CREATE INDEX idx_trading_history_user ON trading_history(user_id);

CREATE INDEX idx_txn_deleted ON transactions(is_deleted);

CREATE INDEX idx_txn_security_id ON transactions(security_id);

CREATE INDEX idx_txn_source ON transactions(source);

CREATE INDEX idx_txn_source_ref ON transactions(source_reference);

CREATE INDEX idx_txn_user ON transactions(user_id);

CREATE INDEX idx_txn_user_date            ON transactions(user_id, txn_date);

CREATE INDEX idx_txn_user_symbol ON transactions(user_id, stock_symbol);

CREATE INDEX idx_users_gemini_validated    ON users(gemini_api_key_last_validated);

CREATE INDEX idx_valuation_models_stock ON valuation_models(stock_id);

-- ===== VIEWS =====

CREATE VIEW bank_totals AS
        SELECT
            user_id,
            bank_name,
            ROUND(SUM(amount), 3) AS bank_total
        FROM bank_cashflows
        GROUP BY user_id, bank_name
        ORDER BY user_id, bank_name;

CREATE VIEW cash_balances AS
        SELECT
            COALESCE(currency, 'USD') AS currency,
            SUM(COALESCE(cash_amount, 0)) AS cash_amount
        FROM ledger_entries
        GROUP BY COALESCE(currency, 'USD');

CREATE VIEW holdings AS
        SELECT
            a.asset_id,
            a.symbol,
            a.asset_type,
            a.exchange,
            a.currency,
            SUM(
                CASE
                    WHEN le.entry_type = 'BUY' THEN le.quantity
                    WHEN le.entry_type = 'BONUS_SHARES' THEN le.quantity
                    WHEN le.entry_type = 'SELL' THEN -le.quantity
                    ELSE 0
                END
            ) AS qty
        FROM ledger_entries le
        JOIN assets a ON a.asset_id = le.asset_id
        GROUP BY a.asset_id, a.symbol, a.asset_type, a.exchange, a.currency
        HAVING ABS(qty) > 0.0000001;

CREATE VIEW portfolio_cash_summary AS
            SELECT 
                pt.user_id,
                pt.portfolio_id,
                p.name as portfolio_name,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN pt.amount ELSE 0 END) as total_buys,
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.amount ELSE 0 END) as total_sells,
                SUM(CASE WHEN pt.txn_type = 'DIVIDEND' THEN pt.amount ELSE 0 END) as total_dividends,
                SUM(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.amount ELSE 0 END) as total_deposits,
                SUM(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN pt.amount ELSE 0 END) as total_withdrawals,
                SUM(pt.amount) as cash_balance,
                SUM(COALESCE(pt.fees, 0)) as total_fees,
                COUNT(*) as transaction_count
            FROM portfolio_transactions pt
            LEFT JOIN portfolios p ON pt.portfolio_id = p.id
            WHERE (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
            GROUP BY pt.user_id, pt.portfolio_id, p.name;

CREATE VIEW portfolio_deposit_summary AS
            SELECT 
                pt.user_id,
                pt.portfolio_id,
                p.name as portfolio_name,
                SUM(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.amount ELSE 0 END) as total_deposits,
                SUM(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN pt.amount ELSE 0 END) as total_withdrawals,
                SUM(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.amount ELSE 0 END) -
                SUM(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN pt.amount ELSE 0 END) as net_deposits,
                COUNT(CASE WHEN pt.txn_type = 'DEPOSIT' THEN 1 END) as deposit_count,
                COUNT(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN 1 END) as withdrawal_count,
                MIN(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.txn_date END) as first_deposit_date,
                MAX(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.txn_date END) as last_deposit_date
            FROM portfolio_transactions pt
            LEFT JOIN portfolios p ON pt.portfolio_id = p.id
            WHERE (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
            GROUP BY pt.user_id, pt.portfolio_id, p.name;

CREATE VIEW stock_position_summary AS
            SELECT 
                pt.user_id,
                pt.portfolio_id,
                p.name as portfolio_name,
                pt.stock_id,
                sm.ticker as stock_symbol,
                sm.name as stock_name,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN pt.shares ELSE 0 END) as shares_bought,
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.shares ELSE 0 END) as shares_sold,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN pt.shares ELSE 0 END) -
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.shares ELSE 0 END) as current_shares,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN -pt.amount ELSE 0 END) as total_cost,
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.amount ELSE 0 END) as total_proceeds,
                SUM(CASE WHEN pt.txn_type = 'DIVIDEND' THEN pt.amount ELSE 0 END) as total_dividends,
                COUNT(CASE WHEN pt.txn_type = 'BUY' THEN 1 END) as buy_count,
                COUNT(CASE WHEN pt.txn_type = 'SELL' THEN 1 END) as sell_count,
                MIN(pt.txn_date) as first_trade_date,
                MAX(pt.txn_date) as last_trade_date
            FROM portfolio_transactions pt
            LEFT JOIN portfolios p ON pt.portfolio_id = p.id
            LEFT JOIN stocks_master sm ON pt.stock_id = sm.id
            WHERE pt.stock_id IS NOT NULL 
            AND (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
            GROUP BY pt.user_id, pt.portfolio_id, p.name, pt.stock_id, sm.ticker, sm.name;

================================================================================
-- DEV/BACKEND (dev_portfolio.db)
-- Path: C:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\dev_portfolio.db
-- Size: 1,687,552 bytes
================================================================================

-- Tables: 47
--   analysis_audit_log: 169 rows
--   analysis_stocks: 2 rows
--   assets: 5 rows
--   bank_cashflows: 0 rows
--   cash_deposits: 52 rows
--   cash_flows: 73 rows
--   cbk_rate_cache: 173 rows
--   daily_snapshots: 6 rows
--   daily_snapshots_old: 0 rows
--   external_accounts: 3 rows
--   financial_audit_log: 0 rows
--   financial_line_items: 1,671 rows
--   financial_normalized: 3,472 rows
--   financial_raw_extraction: 71 rows
--   financial_statements: 73 rows
--   financial_uploads: 23 rows
--   financial_user_edits: 0 rows
--   financial_validation: 29 rows
--   fx_rates: 1 rows
--   ledger_entries: 3 rows
--   password_resets: 0 rows
--   pfm_asset_items: 9 rows
--   pfm_income_expense_items: 0 rows
--   pfm_liability_items: 2 rows
--   pfm_snapshots: 2 rows
--   portfolio_cash: 3 rows
--   portfolio_snapshots: 110 rows
--   portfolio_summary: 0 rows
--   portfolio_transactions: 79 rows
--   portfolios: 3 rows
--   position_snapshots: 16 rows
--   prices: 3 rows
--   schema_version: 1 rows
--   securities_master: 44 rows
--   security_aliases: 151 rows
--   settings: 1 rows
--   sqlite_sequence: 33 rows
--   stock_metrics: 30 rows
--   stock_scores: 2 rows
--   stocks: 19 rows
--   stocks_master: 14 rows
--   symbol_mappings: 6 rows
--   trading_history: 50 rows
--   transactions: 69 rows
--   user_sessions: 1 rows
--   users: 4 rows
--   valuation_models: 9 rows

-- ===== CREATE TABLE statements =====

CREATE TABLE analysis_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    operation TEXT NOT NULL,               -- 'INSERT', 'UPDATE', 'DELETE'
    entity_type TEXT NOT NULL,             -- 'stock', 'statement', 'line_item', 'metric', 'valuation', 'score'
    entity_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    details TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE analysis_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    company_name TEXT NOT NULL,
    exchange TEXT DEFAULT 'NYSE',
    currency TEXT DEFAULT 'USD',
    sector TEXT,
    industry TEXT,
    country TEXT,
    isin TEXT,
    cik TEXT,
    description TEXT,
    website TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, outstanding_shares REAL,
    UNIQUE(user_id, symbol)
);

CREATE TABLE assets (
        asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        asset_type TEXT NOT NULL,   -- KW_STOCK / US_STOCK / CRYPTO
        exchange TEXT,              -- e.g. BOURSAA / NASDAQ / BINANCE
        currency TEXT NOT NULL      -- KWD / USD / ...
    );

CREATE TABLE bank_cashflows (
            bank_txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_name TEXT NOT NULL,
            txn_date TEXT NOT NULL,              -- YYYY-MM-DD
            amount REAL NOT NULL,                -- + deposit, - withdrawal
            description TEXT,
            comments TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        , user_id INTEGER DEFAULT 1);

CREATE TABLE cash_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_name TEXT,
        deposit_date TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        comments TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        portfolio TEXT DEFAULT 'KFH',
        include_in_analysis INTEGER DEFAULT 1,
        currency TEXT DEFAULT 'KWD',
        user_id INTEGER,
        source TEXT,
        notes TEXT,
        source_reference TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        deleted_by INTEGER,
        fx_rate_at_deposit REAL DEFAULT 1.0
    );

CREATE TABLE cash_flows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER,
        flow_type TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'KWD',
        related_txn_id INTEGER,
        flow_date TEXT NOT NULL,
        description TEXT,
        reconciled INTEGER DEFAULT 0,
        created_at INTEGER,
        FOREIGN KEY (account_id) REFERENCES external_accounts(id),
        FOREIGN KEY (related_txn_id) REFERENCES transactions(id)
    );

CREATE TABLE cbk_rate_cache (
                id INTEGER PRIMARY KEY,
                rate REAL NOT NULL,
                fetched_date TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

CREATE TABLE daily_snapshots (
    snapshot_date TEXT NOT NULL,
    asset_id      INTEGER NOT NULL,
    quantity      REAL NOT NULL,
    avg_cost      REAL NOT NULL,
    cost_value    REAL NOT NULL,
    mkt_price     REAL NOT NULL,
    mkt_value     REAL NOT NULL,
    currency      TEXT NOT NULL,
    fx_to_base     REAL NOT NULL,
    mkt_value_base REAL NOT NULL,
    cost_value_base REAL NOT NULL,
    pnl_base      REAL NOT NULL,
    PRIMARY KEY (snapshot_date, asset_id)
);

CREATE TABLE "daily_snapshots_old" (
        snapshot_date TEXT PRIMARY KEY, -- YYYY-MM-DD
        portfolio_value_base REAL NOT NULL,
        cash_balance_base REAL NOT NULL,
        invested_cost_base REAL NOT NULL,
        unrealized_pl_base REAL NOT NULL,
        realized_pl_base REAL NOT NULL,
        dividends_ytd_base REAL NOT NULL
    );

CREATE TABLE external_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        portfolio_id INTEGER,
        name TEXT NOT NULL,
        account_number TEXT,
        currency TEXT DEFAULT 'KWD',
        account_type TEXT DEFAULT 'BROKERAGE',
        current_balance REAL DEFAULT 0,
        last_reconciled_date TEXT,
        created_at INTEGER,
        UNIQUE(user_id, name),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

CREATE TABLE financial_audit_log (
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

CREATE TABLE financial_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER NOT NULL,
    line_item_code TEXT NOT NULL,
    line_item_name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    order_index INTEGER,
    parent_item_id INTEGER,
    is_total BOOLEAN DEFAULT 0,
    manually_edited BOOLEAN DEFAULT 0,
    edited_by_user_id INTEGER,
    edited_at INTEGER,
    FOREIGN KEY (statement_id) REFERENCES financial_statements(id)
);

CREATE TABLE financial_normalized (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT NOT NULL,
    period_end_date TEXT,
    currency        TEXT DEFAULT 'USD',
    unit_scale      INTEGER DEFAULT 1,
    line_item_key   TEXT NOT NULL,
    label_raw       TEXT,
    value           REAL,
    source_page     INTEGER,
    source_table_id INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE financial_raw_extraction (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    page_num        INTEGER,
    method          TEXT,
    table_id        INTEGER,
    table_json      TEXT,
    header_context  TEXT,
    confidence_score REAL DEFAULT 0.0,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE financial_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    statement_type TEXT NOT NULL,          -- 'income', 'balance', 'cashflow'
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER,               -- NULL = annual
    period_end_date TEXT NOT NULL,         -- ISO 'YYYY-MM-DD'
    filing_date TEXT,
    source_file TEXT,
    extracted_by TEXT DEFAULT 'gemini',
    confidence_score REAL,
    verified_by_user BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(stock_id, statement_type, period_end_date),
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE financial_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    stock_id    INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL,
    pdf_path    TEXT,
    pdf_type    TEXT DEFAULT 'text',
    status      TEXT DEFAULT 'processing',
    error_message TEXT,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE financial_user_edits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    period          TEXT,
    line_item_key   TEXT NOT NULL,
    old_value       REAL,
    new_value       REAL,
    edited_at       INTEGER NOT NULL,
    edited_by       INTEGER,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE financial_validation (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id       INTEGER NOT NULL,
    statement_type  TEXT,
    rule_name       TEXT NOT NULL,
    expected_value  REAL,
    actual_value    REAL,
    diff            REAL,
    pass_fail       TEXT DEFAULT 'unknown',
    notes           TEXT,
    FOREIGN KEY (upload_id) REFERENCES financial_uploads(id)
);

CREATE TABLE fx_rates (
        fx_id INTEGER PRIMARY KEY AUTOINCREMENT,
        rate_date TEXT NOT NULL,         -- YYYY-MM-DD
        from_ccy TEXT NOT NULL,          -- USD
        to_ccy TEXT NOT NULL,            -- KWD
        rate REAL NOT NULL,              -- 1 from_ccy = rate to_ccy
        source TEXT,
        UNIQUE(rate_date, from_ccy, to_ccy)
    );

CREATE TABLE ledger_entries (
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

CREATE TABLE password_resets (
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );

CREATE TABLE pfm_asset_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            asset_type TEXT NOT NULL CHECK(asset_type IN ('real_estate', 'shares', 'gold', 'cash', 'crypto', 'other')),
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            quantity REAL,
            price REAL,
            currency TEXT DEFAULT 'KWD',
            value_kwd REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        );

CREATE TABLE pfm_income_expense_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
            category TEXT NOT NULL,
            monthly_amount REAL NOT NULL DEFAULT 0,
            is_finance_cost INTEGER DEFAULT 0,
            is_gna INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        );

CREATE TABLE pfm_liability_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            amount_kwd REAL NOT NULL DEFAULT 0,
            is_current INTEGER DEFAULT 0,
            is_long_term INTEGER DEFAULT 0,
            FOREIGN KEY (snapshot_id) REFERENCES pfm_snapshots(id) ON DELETE CASCADE
        );

CREATE TABLE pfm_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            snapshot_date TEXT NOT NULL,
            notes TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(user_id, snapshot_date)
        );

CREATE TABLE portfolio_cash (
                        portfolio TEXT,
                        user_id INTEGER DEFAULT 1,
                        balance REAL,
                        currency TEXT DEFAULT 'KWD',
                        last_updated INTEGER, manual_override INTEGER DEFAULT 0,
                        PRIMARY KEY (portfolio, user_id)
                    );

CREATE TABLE portfolio_snapshots (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER DEFAULT 1,
                        snapshot_date TEXT NOT NULL,
                        portfolio_value REAL NOT NULL,
                        daily_movement REAL DEFAULT 0,
                        beginning_difference REAL DEFAULT 0,
                        deposit_cash REAL DEFAULT 0,
                        accumulated_cash REAL DEFAULT 0,
                        net_gain REAL DEFAULT 0,
                        change_percent REAL DEFAULT 0,
                        roi_percent REAL DEFAULT 0,
                        created_at INTEGER NOT NULL, twr_percent REAL, mwrr_percent REAL,
                        UNIQUE(snapshot_date, user_id)
                    );

CREATE TABLE portfolio_summary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, stock_symbol TEXT NOT NULL, portfolio TEXT DEFAULT KFH, currency TEXT DEFAULT KWD, total_buy_shares REAL DEFAULT 0, total_sell_shares REAL DEFAULT 0, net_shares REAL DEFAULT 0, total_buy_cost REAL DEFAULT 0, total_sell_value REAL DEFAULT 0, avg_cost_per_share REAL DEFAULT 0, total_cash_dividends REAL DEFAULT 0, total_bonus_shares REAL DEFAULT 0, total_reinvested_dividends REAL DEFAULT 0, realized_pnl REAL DEFAULT 0, first_buy_date TEXT, last_txn_date TEXT, txn_count INTEGER DEFAULT 0, updated_at INTEGER NOT NULL, UNIQUE(user_id, stock_symbol));

CREATE TABLE portfolio_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        portfolio_id INTEGER NOT NULL,
        txn_type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'MANUAL',
        source_reference TEXT,
        stock_id INTEGER,
        account_id INTEGER,
        shares REAL,
        price REAL,
        amount REAL NOT NULL,
        fees REAL DEFAULT 0,
        txn_date TEXT NOT NULL,
        notes TEXT,
        legacy_txn_id INTEGER,
        created_at INTEGER,
        created_by INTEGER,
        is_deleted INTEGER DEFAULT 0,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
        FOREIGN KEY (stock_id) REFERENCES stocks_master(id),
        FOREIGN KEY (account_id) REFERENCES external_accounts(id)
    );

CREATE TABLE portfolios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        base_currency TEXT DEFAULT 'KWD',
        description TEXT,
        created_at INTEGER,
        UNIQUE(user_id, name)
    );

CREATE TABLE position_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        stock_id INTEGER,
        portfolio_id INTEGER,
        stock_symbol TEXT,
        txn_id INTEGER,
        snapshot_date TEXT NOT NULL,
        total_shares REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        avg_cost REAL DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        cash_dividends_received REAL DEFAULT 0,
        status TEXT DEFAULT 'OPEN',
        created_at INTEGER,
        FOREIGN KEY (stock_id) REFERENCES stocks_master(id),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

CREATE TABLE prices (
        price_id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        price_date TEXT NOT NULL,       -- YYYY-MM-DD
        close_price REAL NOT NULL,
        source TEXT,
        UNIQUE(asset_id, price_date),
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
    );

CREATE TABLE schema_version (
    id                          INTEGER PRIMARY KEY CHECK (id = 1),
    version                     INTEGER NOT NULL DEFAULT 1,
    migrated_at                 INTEGER NOT NULL
);

CREATE TABLE securities_master (
                security_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL DEFAULT 1,
                exchange TEXT NOT NULL,
                canonical_ticker TEXT NOT NULL,
                display_name TEXT,
                isin TEXT,
                currency TEXT NOT NULL DEFAULT 'KWD',
                country TEXT NOT NULL DEFAULT 'KW',
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'delisted', 'suspended')),
                sector TEXT,
                created_at INTEGER,
                updated_at INTEGER,
                UNIQUE(canonical_ticker, exchange, user_id)
            );

CREATE TABLE security_aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                security_id TEXT NOT NULL,
                alias_name TEXT NOT NULL,
                alias_type TEXT DEFAULT 'user_input' CHECK(alias_type IN ('user_input', 'broker_format', 'official', 'legacy')),
                valid_from TEXT,
                valid_until TEXT,
                created_at INTEGER,
                FOREIGN KEY (security_id) REFERENCES securities_master(security_id),
                UNIQUE(alias_name, security_id, user_id)
            );

CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

CREATE TABLE sqlite_sequence(name,seq);

CREATE TABLE stock_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER,
    period_end_date TEXT NOT NULL,
    metric_type TEXT NOT NULL,             -- 'profitability', 'liquidity', 'leverage', 'efficiency', 'valuation'
    metric_name TEXT NOT NULL,
    metric_value REAL,
    created_at INTEGER NOT NULL,
    UNIQUE(stock_id, metric_name, period_end_date),
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE stock_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    scoring_date TEXT NOT NULL,
    overall_score REAL,
    fundamental_score REAL,
    valuation_score REAL,
    growth_score REAL,
    quality_score REAL,
    details JSON,
    analyst_notes TEXT,
    created_by_user_id INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

CREATE TABLE stocks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER DEFAULT 1,
                        symbol TEXT NOT NULL,
                        name TEXT,
                        current_price REAL DEFAULT 0,
                        portfolio TEXT DEFAULT 'KFH',
                        currency TEXT DEFAULT 'KWD',
                        tradingview_symbol TEXT,
                        tradingview_exchange TEXT, last_updated INTEGER, price_source TEXT, created_at INTEGER,
                        UNIQUE(symbol, user_id)
                    );

CREATE TABLE stocks_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        name TEXT,
        exchange TEXT DEFAULT 'KSE',
        currency TEXT DEFAULT 'KWD',
        isin TEXT,
        sector TEXT,
        country TEXT DEFAULT 'KW',
        status TEXT DEFAULT 'active',
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(ticker, exchange)
    );

CREATE TABLE symbol_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_input TEXT NOT NULL COLLATE NOCASE,
        canonical_ticker TEXT NOT NULL,
        stock_id INTEGER,
        created_at INTEGER,
        UNIQUE(user_input),
        FOREIGN KEY (stock_id) REFERENCES stocks_master(id)
    );

CREATE TABLE trading_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_symbol TEXT NOT NULL,
            txn_date TEXT NOT NULL,
            txn_type TEXT NOT NULL CHECK(txn_type IN ('Buy','Sell')),
            purchase_cost REAL NOT NULL DEFAULT 0,
            sell_value REAL NOT NULL DEFAULT 0,
            shares REAL NOT NULL DEFAULT 0,
            cash_dividend REAL NOT NULL DEFAULT 0,
            bonus_shares REAL NOT NULL DEFAULT 0,
            notes TEXT,
            created_at INTEGER NOT NULL
        , user_id INTEGER DEFAULT 1);

CREATE TABLE transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                portfolio TEXT DEFAULT 'KFH',
                stock_symbol TEXT NOT NULL,
                txn_date TEXT NOT NULL,
                txn_type TEXT NOT NULL, 
                purchase_cost REAL NOT NULL DEFAULT 0,
                sell_value REAL NOT NULL DEFAULT 0,
                shares REAL NOT NULL DEFAULT 0,
                bonus_shares REAL NOT NULL DEFAULT 0,
                cash_dividend REAL NOT NULL DEFAULT 0,
                reinvested_dividend REAL NOT NULL DEFAULT 0,
                price_override REAL,
                planned_cum_shares REAL,
                fees REAL DEFAULT 0,
                broker TEXT,
                reference TEXT,
                notes TEXT,
                category TEXT,
                created_at INTEGER NOT NULL
            , security_id TEXT, stock_master_id INTEGER, portfolio_id INTEGER, account_id INTEGER, source TEXT DEFAULT 'MANUAL', source_reference TEXT, is_deleted INTEGER DEFAULT 0, deleted_at INTEGER, deleted_by INTEGER, avg_cost_at_txn REAL, realized_pnl_at_txn REAL, cost_basis_at_txn REAL, shares_held_at_txn REAL, fx_rate_at_txn REAL);

CREATE TABLE user_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        , email TEXT, name TEXT, gemini_api_key TEXT, gemini_api_key_encrypted TEXT, gemini_api_key_last_validated INTEGER, gemini_quota_reset_at INTEGER, gemini_requests_today INTEGER DEFAULT 0);

CREATE TABLE valuation_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    model_type TEXT NOT NULL,              -- 'graham', 'dcf', 'ddm', 'multiples'
    valuation_date TEXT NOT NULL,
    intrinsic_value REAL,
    parameters JSON,
    assumptions JSON,
    created_by_user_id INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES analysis_stocks(id)
);

-- ===== INDEXES =====

CREATE INDEX idx_aliases_name ON security_aliases(alias_name COLLATE NOCASE);

CREATE INDEX idx_aliases_security ON security_aliases(security_id);

CREATE INDEX idx_analysis_stocks_symbol ON analysis_stocks(symbol);

CREATE INDEX idx_analysis_stocks_user ON analysis_stocks(user_id);

CREATE INDEX idx_audit_created            ON financial_audit_log(created_at);

CREATE INDEX idx_audit_operation          ON financial_audit_log(operation);

CREATE INDEX idx_audit_user               ON financial_audit_log(user_id);

CREATE INDEX idx_bank_cashflows_bank_date ON bank_cashflows(bank_name, txn_date);

CREATE INDEX idx_bank_cashflows_user ON bank_cashflows(user_id);

CREATE INDEX idx_bank_cashflows_user_bank ON bank_cashflows(user_id, bank_name);

CREATE INDEX idx_cash_deposits_user       ON cash_deposits(user_id);

CREATE INDEX idx_cash_deposits_user_date  ON cash_deposits(user_id, deposit_date);

CREATE INDEX idx_cash_flows_account ON cash_flows(account_id);

CREATE INDEX idx_cash_flows_date ON cash_flows(flow_date);

CREATE INDEX idx_cash_flows_type ON cash_flows(flow_type);

CREATE INDEX idx_ext_accounts_user ON external_accounts(user_id);

CREATE INDEX idx_fin_edits_upload ON financial_user_edits(upload_id);

CREATE INDEX idx_fin_norm_upload ON financial_normalized(upload_id);

CREATE INDEX idx_fin_raw_upload ON financial_raw_extraction(upload_id);

CREATE INDEX idx_fin_uploads_stock ON financial_uploads(stock_id);

CREATE INDEX idx_fin_uploads_user ON financial_uploads(user_id);

CREATE INDEX idx_fin_valid_upload ON financial_validation(upload_id);

CREATE INDEX idx_financial_statements_stock ON financial_statements(stock_id);

CREATE INDEX idx_financial_statements_type_date ON financial_statements(statement_type, period_end_date);

CREATE INDEX idx_line_items_code ON financial_line_items(line_item_code);

CREATE INDEX idx_line_items_statement ON financial_line_items(statement_id);

CREATE INDEX idx_pfm_assets_user          ON pfm_asset_items(user_id);

CREATE INDEX idx_pfm_income_expense_user  ON pfm_income_expense_items(user_id);

CREATE INDEX idx_pfm_liabilities_user     ON pfm_liability_items(user_id);

CREATE INDEX idx_portfolios_user ON portfolios(user_id);

CREATE INDEX idx_pos_snap_status ON position_snapshots(status);

CREATE INDEX idx_pos_snap_stock ON position_snapshots(stock_id);

CREATE INDEX idx_pos_snap_user ON position_snapshots(user_id);

CREATE INDEX idx_pos_snapshots_date ON position_snapshots(snapshot_date);

CREATE INDEX idx_pos_snapshots_stock ON position_snapshots(stock_id);

CREATE INDEX idx_ptxn_date ON portfolio_transactions(txn_date);

CREATE INDEX idx_ptxn_portfolio_source ON portfolio_transactions(portfolio_id, source);

CREATE INDEX idx_ptxn_portfolio_type ON portfolio_transactions(portfolio_id, txn_type);

CREATE INDEX idx_ptxn_stock ON portfolio_transactions(stock_id);

CREATE INDEX idx_ptxn_user ON portfolio_transactions(user_id);

CREATE INDEX idx_securities_country ON securities_master(country);

CREATE INDEX idx_securities_exchange ON securities_master(exchange);

CREATE INDEX idx_securities_ticker ON securities_master(canonical_ticker);

CREATE INDEX idx_snapshots_user ON portfolio_snapshots(user_id);

CREATE INDEX idx_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date);

CREATE INDEX idx_stock_metrics_stock ON stock_metrics(stock_id);

CREATE INDEX idx_stock_scores_stock ON stock_scores(stock_id);

CREATE INDEX idx_stocks_master_ticker ON stocks_master(ticker);

CREATE INDEX idx_stocks_user ON stocks(user_id);

CREATE INDEX idx_stocks_user_portfolio     ON stocks(user_id, portfolio);

CREATE INDEX idx_symbol_mappings_input ON symbol_mappings(user_input);

CREATE INDEX idx_trading_history_user ON trading_history(user_id);

CREATE INDEX idx_txn_deleted ON transactions(is_deleted);

CREATE INDEX idx_txn_security_id ON transactions(security_id);

CREATE INDEX idx_txn_source ON transactions(source);

CREATE INDEX idx_txn_source_ref ON transactions(source_reference);

CREATE INDEX idx_txn_user ON transactions(user_id);

CREATE INDEX idx_txn_user_date            ON transactions(user_id, txn_date);

CREATE INDEX idx_txn_user_symbol ON transactions(user_id, stock_symbol);

CREATE INDEX idx_users_gemini_validated    ON users(gemini_api_key_last_validated);

CREATE INDEX idx_valuation_models_stock ON valuation_models(stock_id);

-- ===== VIEWS =====

CREATE VIEW bank_totals AS
        SELECT
            user_id,
            bank_name,
            ROUND(SUM(amount), 3) AS bank_total
        FROM bank_cashflows
        GROUP BY user_id, bank_name
        ORDER BY user_id, bank_name;

CREATE VIEW cash_balances AS
        SELECT
            COALESCE(currency, 'USD') AS currency,
            SUM(COALESCE(cash_amount, 0)) AS cash_amount
        FROM ledger_entries
        GROUP BY COALESCE(currency, 'USD');

CREATE VIEW holdings AS
        SELECT
            a.asset_id,
            a.symbol,
            a.asset_type,
            a.exchange,
            a.currency,
            SUM(
                CASE
                    WHEN le.entry_type = 'BUY' THEN le.quantity
                    WHEN le.entry_type = 'BONUS_SHARES' THEN le.quantity
                    WHEN le.entry_type = 'SELL' THEN -le.quantity
                    ELSE 0
                END
            ) AS qty
        FROM ledger_entries le
        JOIN assets a ON a.asset_id = le.asset_id
        GROUP BY a.asset_id, a.symbol, a.asset_type, a.exchange, a.currency
        HAVING ABS(qty) > 0.0000001;

CREATE VIEW portfolio_cash_summary AS
            SELECT 
                pt.user_id,
                pt.portfolio_id,
                p.name as portfolio_name,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN pt.amount ELSE 0 END) as total_buys,
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.amount ELSE 0 END) as total_sells,
                SUM(CASE WHEN pt.txn_type = 'DIVIDEND' THEN pt.amount ELSE 0 END) as total_dividends,
                SUM(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.amount ELSE 0 END) as total_deposits,
                SUM(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN pt.amount ELSE 0 END) as total_withdrawals,
                SUM(pt.amount) as cash_balance,
                SUM(COALESCE(pt.fees, 0)) as total_fees,
                COUNT(*) as transaction_count
            FROM portfolio_transactions pt
            LEFT JOIN portfolios p ON pt.portfolio_id = p.id
            WHERE (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
            GROUP BY pt.user_id, pt.portfolio_id, p.name;

CREATE VIEW portfolio_deposit_summary AS
            SELECT 
                pt.user_id,
                pt.portfolio_id,
                p.name as portfolio_name,
                SUM(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.amount ELSE 0 END) as total_deposits,
                SUM(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN pt.amount ELSE 0 END) as total_withdrawals,
                SUM(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.amount ELSE 0 END) -
                SUM(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN pt.amount ELSE 0 END) as net_deposits,
                COUNT(CASE WHEN pt.txn_type = 'DEPOSIT' THEN 1 END) as deposit_count,
                COUNT(CASE WHEN pt.txn_type = 'WITHDRAWAL' THEN 1 END) as withdrawal_count,
                MIN(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.txn_date END) as first_deposit_date,
                MAX(CASE WHEN pt.txn_type = 'DEPOSIT' THEN pt.txn_date END) as last_deposit_date
            FROM portfolio_transactions pt
            LEFT JOIN portfolios p ON pt.portfolio_id = p.id
            WHERE (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
            GROUP BY pt.user_id, pt.portfolio_id, p.name;

CREATE VIEW stock_position_summary AS
            SELECT 
                pt.user_id,
                pt.portfolio_id,
                p.name as portfolio_name,
                pt.stock_id,
                sm.ticker as stock_symbol,
                sm.name as stock_name,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN pt.shares ELSE 0 END) as shares_bought,
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.shares ELSE 0 END) as shares_sold,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN pt.shares ELSE 0 END) -
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.shares ELSE 0 END) as current_shares,
                SUM(CASE WHEN pt.txn_type = 'BUY' THEN -pt.amount ELSE 0 END) as total_cost,
                SUM(CASE WHEN pt.txn_type = 'SELL' THEN pt.amount ELSE 0 END) as total_proceeds,
                SUM(CASE WHEN pt.txn_type = 'DIVIDEND' THEN pt.amount ELSE 0 END) as total_dividends,
                COUNT(CASE WHEN pt.txn_type = 'BUY' THEN 1 END) as buy_count,
                COUNT(CASE WHEN pt.txn_type = 'SELL' THEN 1 END) as sell_count,
                MIN(pt.txn_date) as first_trade_date,
                MAX(pt.txn_date) as last_trade_date
            FROM portfolio_transactions pt
            LEFT JOIN portfolios p ON pt.portfolio_id = p.id
            LEFT JOIN stocks_master sm ON pt.stock_id = sm.id
            WHERE pt.stock_id IS NOT NULL 
            AND (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
            GROUP BY pt.user_id, pt.portfolio_id, p.name, pt.stock_id, sm.ticker, sm.name;




================================================================================
-- FOREIGN KEY ANALYSIS: PRODUCTION (portfolio.db)
================================================================================

-- 1. EXPLICIT FOREIGN KEY constraints (PRAGMA foreign_key_list)
--   cash_flows.related_txn_id -> transactions.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   cash_flows.account_id -> external_accounts.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   external_accounts.portfolio_id -> portfolios.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_line_items.statement_id -> financial_statements.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_normalized.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_raw_extraction.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_statements.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_uploads.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_user_edits.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_validation.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   ledger_entries.asset_id -> assets.asset_id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   pfm_asset_items.snapshot_id -> pfm_snapshots.id  (ON UPDATE NO ACTION, ON DELETE CASCADE)
--   pfm_income_expense_items.snapshot_id -> pfm_snapshots.id  (ON UPDATE NO ACTION, ON DELETE CASCADE)
--   pfm_liability_items.snapshot_id -> pfm_snapshots.id  (ON UPDATE NO ACTION, ON DELETE CASCADE)
--   portfolio_transactions.account_id -> external_accounts.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   portfolio_transactions.stock_id -> stocks_master.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   portfolio_transactions.portfolio_id -> portfolios.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   position_snapshots.portfolio_id -> portfolios.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   position_snapshots.stock_id -> stocks_master.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   prices.asset_id -> assets.asset_id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   security_aliases.security_id -> securities_master.security_id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   stock_metrics.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   stock_scores.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   symbol_mappings.stock_id -> stocks_master.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   user_sessions.user_id -> users.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   valuation_models.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)

-- 2. IMPLICIT FK relationships (inferred from column naming patterns)
--   analysis_audit_log.user_id -> users.id  [OK]
--   analysis_stocks.user_id -> users.id  [OK]
--   bank_cashflows.user_id -> users.id  [OK]
--   cash_deposits.user_id -> users.id  [OK]
--   cash_flows.user_id -> users.id  [OK]
--   cash_flows.account_id -> external_accounts.id  [OK]
--   external_accounts.user_id -> users.id  [OK]
--   external_accounts.portfolio_id -> portfolios.id  [OK]
--   financial_audit_log.user_id -> users.id  [OK]
--   financial_statements.stock_id -> stocks.id  [OK]
--   financial_uploads.user_id -> users.id  [OK]
--   financial_uploads.stock_id -> stocks.id  [OK]
--   ledger_entries.asset_id -> assets.id  [OK]
--   pfm_asset_items.snapshot_id -> daily_snapshots.id  [OK]
--   pfm_asset_items.user_id -> users.id  [OK]
--   pfm_income_expense_items.snapshot_id -> daily_snapshots.id  [OK]
--   pfm_income_expense_items.user_id -> users.id  [OK]
--   pfm_liability_items.snapshot_id -> daily_snapshots.id  [OK]
--   pfm_liability_items.user_id -> users.id  [OK]
--   pfm_snapshots.user_id -> users.id  [OK]
--   portfolio_snapshots.user_id -> users.id  [OK]
--   portfolio_summary.user_id -> users.id  [OK]
--   portfolio_transactions.user_id -> users.id  [OK]
--   portfolio_transactions.portfolio_id -> portfolios.id  [OK]
--   portfolio_transactions.stock_id -> stocks.id  [OK]
--   portfolio_transactions.account_id -> external_accounts.id  [OK]
--   portfolios.user_id -> users.id  [OK]
--   position_snapshots.user_id -> users.id  [OK]
--   position_snapshots.stock_id -> stocks.id  [OK]
--   position_snapshots.portfolio_id -> portfolios.id  [OK]
--   prices.asset_id -> assets.id  [OK]
--   securities_master.user_id -> users.id  [OK]
--   security_aliases.user_id -> users.id  [OK]
--   security_aliases.security_id -> securities_master.id  [OK]
--   stock_metrics.stock_id -> stocks.id  [OK]
--   stock_scores.stock_id -> stocks.id  [OK]
--   stocks.user_id -> users.id  [OK]
--   symbol_mappings.stock_id -> stocks.id  [OK]
--   trading_history.user_id -> users.id  [OK]
--   transactions.user_id -> users.id  [OK]
--   transactions.security_id -> securities_master.id  [OK]
--   transactions.portfolio_id -> portfolios.id  [OK]
--   transactions.account_id -> external_accounts.id  [OK]
--   user_sessions.user_id -> users.id  [OK]
--   valuation_models.stock_id -> stocks.id  [OK]

-- 3. FULL COLUMN INVENTORY (for PostgreSQL migration planning)

--   TABLE: analysis_audit_log
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   operation                      TEXT                 True                     
--   entity_type                    TEXT                 True                     
--   entity_id                      INTEGER              False                    
--   old_value                      TEXT                 False                    
--   new_value                      TEXT                 False                    
--   reason                         TEXT                 False                    
--   details                        TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: analysis_stocks
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   symbol                         TEXT                 True                     
--   company_name                   TEXT                 True                     
--   exchange                       TEXT                 False    'NYSE'          
--   currency                       TEXT                 False    'USD'           
--   sector                         TEXT                 False                    
--   industry                       TEXT                 False                    
--   country                        TEXT                 False                    
--   isin                           TEXT                 False                    
--   cik                            TEXT                 False                    
--   description                    TEXT                 False                    
--   website                        TEXT                 False                    
--   created_at                     INTEGER              True                     
--   updated_at                     INTEGER              True                     
--   outstanding_shares             REAL                 False                    

--   TABLE: assets
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   asset_id                       INTEGER              False                    PK
--   symbol                         TEXT                 True                     
--   asset_type                     TEXT                 True                     
--   exchange                       TEXT                 False                    
--   currency                       TEXT                 True                     

--   TABLE: bank_cashflows
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   bank_txn_id                    INTEGER              False                    PK
--   bank_name                      TEXT                 True                     
--   txn_date                       TEXT                 True                     
--   amount                         REAL                 True                     
--   description                    TEXT                 False                    
--   comments                       TEXT                 False                    
--   created_at                     TEXT                 False    datetime('now') 
--   user_id                        INTEGER              False    1               

--   TABLE: cash_deposits
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   bank_name                      TEXT                 False                    
--   deposit_date                   TEXT                 True                     
--   amount                         REAL                 True                     
--   description                    TEXT                 False                    
--   comments                       TEXT                 False                    
--   created_at                     INTEGER              True     strftime('%s','now') 
--   portfolio                      TEXT                 False    'KFH'           
--   include_in_analysis            INTEGER              False    1               
--   currency                       TEXT                 False    'KWD'           
--   user_id                        INTEGER              False                    
--   source                         TEXT                 False                    
--   notes                          TEXT                 False                    
--   source_reference               TEXT                 False                    
--   is_deleted                     INTEGER              False    0               
--   deleted_at                     INTEGER              False                    
--   deleted_by                     INTEGER              False                    
--   fx_rate_at_deposit             REAL                 False    1.0             

--   TABLE: cash_flows
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   account_id                     INTEGER              False                    
--   flow_type                      TEXT                 True                     
--   amount                         REAL                 True                     
--   currency                       TEXT                 False    'KWD'           
--   related_txn_id                 INTEGER              False                    
--   flow_date                      TEXT                 True                     
--   description                    TEXT                 False                    
--   reconciled                     INTEGER              False    0               
--   created_at                     INTEGER              False                    

--   TABLE: cbk_rate_cache
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   rate                           REAL                 True                     
--   fetched_date                   TEXT                 True                     
--   source                         TEXT                 True                     
--   created_at                     INTEGER              False    strftime('%s', 'now') 

--   TABLE: daily_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   snapshot_date                  TEXT                 True                     PK
--   asset_id                       INTEGER              True                     PK
--   quantity                       REAL                 True                     
--   avg_cost                       REAL                 True                     
--   cost_value                     REAL                 True                     
--   mkt_price                      REAL                 True                     
--   mkt_value                      REAL                 True                     
--   currency                       TEXT                 True                     
--   fx_to_base                     REAL                 True                     
--   mkt_value_base                 REAL                 True                     
--   cost_value_base                REAL                 True                     
--   pnl_base                       REAL                 True                     

--   TABLE: daily_snapshots_old
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   snapshot_date                  TEXT                 False                    PK
--   portfolio_value_base           REAL                 True                     
--   cash_balance_base              REAL                 True                     
--   invested_cost_base             REAL                 True                     
--   unrealized_pl_base             REAL                 True                     
--   realized_pl_base               REAL                 True                     
--   dividends_ytd_base             REAL                 True                     

--   TABLE: external_accounts
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   portfolio_id                   INTEGER              False                    
--   name                           TEXT                 True                     
--   account_number                 TEXT                 False                    
--   currency                       TEXT                 False    'KWD'           
--   account_type                   TEXT                 False    'BROKERAGE'     
--   current_balance                REAL                 False    0               
--   last_reconciled_date           TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: financial_audit_log
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   operation                      TEXT                 True                     
--   entity_type                    TEXT                 False                    
--   entity_id                      INTEGER              False                    
--   old_value                      REAL                 False                    
--   new_value                      REAL                 False                    
--   delta                          REAL                 False                    
--   portfolio                      TEXT                 False                    
--   currency                       TEXT                 False                    
--   reason                         TEXT                 False                    
--   details                        TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: financial_line_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   statement_id                   INTEGER              True                     
--   line_item_code                 TEXT                 True                     
--   line_item_name                 TEXT                 True                     
--   amount                         REAL                 True                     
--   currency                       TEXT                 False    'USD'           
--   order_index                    INTEGER              False                    
--   parent_item_id                 INTEGER              False                    
--   is_total                       BOOLEAN              False    0               
--   manually_edited                BOOLEAN              False    0               
--   edited_by_user_id              INTEGER              False                    
--   edited_at                      INTEGER              False                    

--   TABLE: financial_normalized
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 True                     
--   period_end_date                TEXT                 False                    
--   currency                       TEXT                 False    'USD'           
--   unit_scale                     INTEGER              False    1               
--   line_item_key                  TEXT                 True                     
--   label_raw                      TEXT                 False                    
--   value                          REAL                 False                    
--   source_page                    INTEGER              False                    
--   source_table_id                INTEGER              False                    

--   TABLE: financial_raw_extraction
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 False                    
--   page_num                       INTEGER              False                    
--   method                         TEXT                 False                    
--   table_id                       INTEGER              False                    
--   table_json                     TEXT                 False                    
--   header_context                 TEXT                 False                    
--   confidence_score               REAL                 False    0.0             

--   TABLE: financial_statements
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   statement_type                 TEXT                 True                     
--   fiscal_year                    INTEGER              True                     
--   fiscal_quarter                 INTEGER              False                    
--   period_end_date                TEXT                 True                     
--   filing_date                    TEXT                 False                    
--   source_file                    TEXT                 False                    
--   extracted_by                   TEXT                 False    'gemini'        
--   confidence_score               REAL                 False                    
--   verified_by_user               BOOLEAN              False    0               
--   notes                          TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: financial_uploads
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   stock_id                       INTEGER              True                     
--   uploaded_at                    INTEGER              True                     
--   pdf_path                       TEXT                 False                    
--   pdf_type                       TEXT                 False    'text'          
--   status                         TEXT                 False    'processing'    
--   error_message                  TEXT                 False                    

--   TABLE: financial_user_edits
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 False                    
--   period                         TEXT                 False                    
--   line_item_key                  TEXT                 True                     
--   old_value                      REAL                 False                    
--   new_value                      REAL                 False                    
--   edited_at                      INTEGER              True                     
--   edited_by                      INTEGER              False                    

--   TABLE: financial_validation
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 False                    
--   rule_name                      TEXT                 True                     
--   expected_value                 REAL                 False                    
--   actual_value                   REAL                 False                    
--   diff                           REAL                 False                    
--   pass_fail                      TEXT                 False    'unknown'       
--   notes                          TEXT                 False                    

--   TABLE: fx_rates
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   fx_id                          INTEGER              False                    PK
--   rate_date                      TEXT                 True                     
--   from_ccy                       TEXT                 True                     
--   to_ccy                         TEXT                 True                     
--   rate                           REAL                 True                     
--   source                         TEXT                 False                    

--   TABLE: ledger_entries
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   entry_id                       INTEGER              False                    PK
--   entry_datetime                 TEXT                 True                     
--   entry_type                     TEXT                 True                     
--   asset_id                       INTEGER              False                    
--   quantity                       REAL                 False                    
--   price                          REAL                 False                    
--   cash_amount                    REAL                 True                     
--   currency                       TEXT                 True                     
--   notes                          TEXT                 False                    

--   TABLE: password_resets
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   email                          TEXT                 True                     
--   otp                            TEXT                 True                     
--   expires_at                     INTEGER              True                     
--   created_at                     INTEGER              True                     

--   TABLE: pfm_asset_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   snapshot_id                    INTEGER              True                     
--   user_id                        INTEGER              True                     
--   asset_type                     TEXT                 True                     
--   category                       TEXT                 True                     
--   name                           TEXT                 True                     
--   quantity                       REAL                 False                    
--   price                          REAL                 False                    
--   currency                       TEXT                 False    'KWD'           
--   value_kwd                      REAL                 True     0               

--   TABLE: pfm_income_expense_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   snapshot_id                    INTEGER              True                     
--   user_id                        INTEGER              True                     
--   kind                           TEXT                 True                     
--   category                       TEXT                 True                     
--   monthly_amount                 REAL                 True     0               
--   is_finance_cost                INTEGER              False    0               
--   is_gna                         INTEGER              False    0               
--   sort_order                     INTEGER              False    0               

--   TABLE: pfm_liability_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   snapshot_id                    INTEGER              True                     
--   user_id                        INTEGER              True                     
--   category                       TEXT                 True                     
--   amount_kwd                     REAL                 True     0               
--   is_current                     INTEGER              False    0               
--   is_long_term                   INTEGER              False    0               

--   TABLE: pfm_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   snapshot_date                  TEXT                 True                     
--   notes                          TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: portfolio_cash
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   portfolio                      TEXT                 False                    PK
--   user_id                        INTEGER              False    1               PK
--   balance                        REAL                 False                    
--   currency                       TEXT                 False    'KWD'           
--   last_updated                   INTEGER              False                    
--   manual_override                INTEGER              False    0               

--   TABLE: portfolio_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              False    1               
--   snapshot_date                  TEXT                 True                     
--   portfolio_value                REAL                 True                     
--   daily_movement                 REAL                 False    0               
--   beginning_difference           REAL                 False    0               
--   deposit_cash                   REAL                 False    0               
--   accumulated_cash               REAL                 False    0               
--   net_gain                       REAL                 False    0               
--   change_percent                 REAL                 False    0               
--   roi_percent                    REAL                 False    0               
--   created_at                     INTEGER              True                     
--   twr_percent                    REAL                 False                    
--   mwrr_percent                   REAL                 False                    

--   TABLE: portfolio_summary
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   stock_symbol                   TEXT                 True                     
--   portfolio                      TEXT                 False    KFH             
--   currency                       TEXT                 False    KWD             
--   total_buy_shares               REAL                 False    0               
--   total_sell_shares              REAL                 False    0               
--   net_shares                     REAL                 False    0               
--   total_buy_cost                 REAL                 False    0               
--   total_sell_value               REAL                 False    0               
--   avg_cost_per_share             REAL                 False    0               
--   total_cash_dividends           REAL                 False    0               
--   total_bonus_shares             REAL                 False    0               
--   total_reinvested_dividends     REAL                 False    0               
--   realized_pnl                   REAL                 False    0               
--   first_buy_date                 TEXT                 False                    
--   last_txn_date                  TEXT                 False                    
--   txn_count                      INTEGER              False    0               
--   updated_at                     INTEGER              True                     

--   TABLE: portfolio_transactions
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   portfolio_id                   INTEGER              True                     
--   txn_type                       TEXT                 True                     
--   source                         TEXT                 True     'MANUAL'        
--   source_reference               TEXT                 False                    
--   stock_id                       INTEGER              False                    
--   account_id                     INTEGER              False                    
--   shares                         REAL                 False                    
--   price                          REAL                 False                    
--   amount                         REAL                 True                     
--   fees                           REAL                 False    0               
--   txn_date                       TEXT                 True                     
--   notes                          TEXT                 False                    
--   legacy_txn_id                  INTEGER              False                    
--   created_at                     INTEGER              False                    
--   created_by                     INTEGER              False                    
--   is_deleted                     INTEGER              False    0               

--   TABLE: portfolios
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   name                           TEXT                 True                     
--   base_currency                  TEXT                 False    'KWD'           
--   description                    TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: position_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   stock_id                       INTEGER              False                    
--   portfolio_id                   INTEGER              False                    
--   stock_symbol                   TEXT                 False                    
--   txn_id                         INTEGER              False                    
--   snapshot_date                  TEXT                 True                     
--   total_shares                   REAL                 False    0               
--   total_cost                     REAL                 False    0               
--   avg_cost                       REAL                 False    0               
--   realized_pnl                   REAL                 False    0               
--   cash_dividends_received        REAL                 False    0               
--   status                         TEXT                 False    'OPEN'          
--   created_at                     INTEGER              False                    

--   TABLE: prices
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   price_id                       INTEGER              False                    PK
--   asset_id                       INTEGER              True                     
--   price_date                     TEXT                 True                     
--   close_price                    REAL                 True                     
--   source                         TEXT                 False                    

--   TABLE: schema_version
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   version                        INTEGER              True     1               
--   migrated_at                    INTEGER              True                     

--   TABLE: securities_master
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   security_id                    TEXT                 False                    PK
--   user_id                        INTEGER              True     1               
--   exchange                       TEXT                 True                     
--   canonical_ticker               TEXT                 True                     
--   display_name                   TEXT                 False                    
--   isin                           TEXT                 False                    
--   currency                       TEXT                 True     'KWD'           
--   country                        TEXT                 True     'KW'            
--   status                         TEXT                 False    'active'        
--   sector                         TEXT                 False                    
--   created_at                     INTEGER              False                    
--   updated_at                     INTEGER              False                    

--   TABLE: security_aliases
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True     1               
--   security_id                    TEXT                 True                     
--   alias_name                     TEXT                 True                     
--   alias_type                     TEXT                 False    'user_input'    
--   valid_from                     TEXT                 False                    
--   valid_until                    TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: settings
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   key                            TEXT                 False                    PK
--   value                          TEXT                 True                     

--   TABLE: sqlite_sequence
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   name                           TEXT                 False                    
--   seq                            TEXT                 False                    

--   TABLE: stock_metrics
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   fiscal_year                    INTEGER              True                     
--   fiscal_quarter                 INTEGER              False                    
--   period_end_date                TEXT                 True                     
--   metric_type                    TEXT                 True                     
--   metric_name                    TEXT                 True                     
--   metric_value                   REAL                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: stock_scores
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   scoring_date                   TEXT                 True                     
--   overall_score                  REAL                 False                    
--   fundamental_score              REAL                 False                    
--   valuation_score                REAL                 False                    
--   growth_score                   REAL                 False                    
--   quality_score                  REAL                 False                    
--   details                        JSON                 False                    
--   analyst_notes                  TEXT                 False                    
--   created_by_user_id             INTEGER              False                    
--   created_at                     INTEGER              True                     

--   TABLE: stocks
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              False    1               
--   symbol                         TEXT                 True                     
--   name                           TEXT                 False                    
--   current_price                  REAL                 False    0               
--   portfolio                      TEXT                 False    'KFH'           
--   currency                       TEXT                 False    'KWD'           
--   tradingview_symbol             TEXT                 False                    
--   tradingview_exchange           TEXT                 False                    
--   last_updated                   INTEGER              False                    
--   price_source                   TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: stocks_master
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   ticker                         TEXT                 True                     
--   name                           TEXT                 False                    
--   exchange                       TEXT                 False    'KSE'           
--   currency                       TEXT                 False    'KWD'           
--   isin                           TEXT                 False                    
--   sector                         TEXT                 False                    
--   country                        TEXT                 False    'KW'            
--   status                         TEXT                 False    'active'        
--   created_at                     INTEGER              False                    
--   updated_at                     INTEGER              False                    

--   TABLE: symbol_mappings
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_input                     TEXT                 True                     
--   canonical_ticker               TEXT                 True                     
--   stock_id                       INTEGER              False                    
--   created_at                     INTEGER              False                    

--   TABLE: trading_history
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_symbol                   TEXT                 True                     
--   txn_date                       TEXT                 True                     
--   txn_type                       TEXT                 True                     
--   purchase_cost                  REAL                 True     0               
--   sell_value                     REAL                 True     0               
--   shares                         REAL                 True     0               
--   cash_dividend                  REAL                 True     0               
--   bonus_shares                   REAL                 True     0               
--   notes                          TEXT                 False                    
--   created_at                     INTEGER              True                     
--   user_id                        INTEGER              False    1               

--   TABLE: transactions
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              False                    
--   portfolio                      TEXT                 False    'KFH'           
--   stock_symbol                   TEXT                 True                     
--   txn_date                       TEXT                 True                     
--   txn_type                       TEXT                 True                     
--   purchase_cost                  REAL                 True     0               
--   sell_value                     REAL                 True     0               
--   shares                         REAL                 True     0               
--   bonus_shares                   REAL                 True     0               
--   cash_dividend                  REAL                 True     0               
--   reinvested_dividend            REAL                 True     0               
--   price_override                 REAL                 False                    
--   planned_cum_shares             REAL                 False                    
--   fees                           REAL                 False    0               
--   broker                         TEXT                 False                    
--   reference                      TEXT                 False                    
--   notes                          TEXT                 False                    
--   category                       TEXT                 False                    
--   created_at                     INTEGER              True                     
--   security_id                    TEXT                 False                    
--   stock_master_id                INTEGER              False                    
--   portfolio_id                   INTEGER              False                    
--   account_id                     INTEGER              False                    
--   source                         TEXT                 False    'MANUAL'        
--   source_reference               TEXT                 False                    
--   is_deleted                     INTEGER              False    0               
--   deleted_at                     INTEGER              False                    
--   deleted_by                     INTEGER              False                    
--   avg_cost_at_txn                REAL                 False                    
--   realized_pnl_at_txn            REAL                 False                    
--   cost_basis_at_txn              REAL                 False                    
--   shares_held_at_txn             REAL                 False                    
--   fx_rate_at_txn                 REAL                 False                    

--   TABLE: user_sessions
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   token                          TEXT                 False                    PK
--   user_id                        INTEGER              True                     
--   expires_at                     INTEGER              True                     
--   created_at                     INTEGER              True                     

--   TABLE: users
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   username                       TEXT                 True                     
--   password_hash                  TEXT                 True                     
--   created_at                     INTEGER              True                     
--   email                          TEXT                 False                    
--   name                           TEXT                 False                    
--   gemini_api_key                 TEXT                 False                    
--   gemini_api_key_encrypted       TEXT                 False                    
--   gemini_api_key_last_validated  INTEGER              False                    
--   gemini_quota_reset_at          INTEGER              False                    
--   gemini_requests_today          INTEGER              False    0               

--   TABLE: valuation_models
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   model_type                     TEXT                 True                     
--   valuation_date                 TEXT                 True                     
--   intrinsic_value                REAL                 False                    
--   parameters                     JSON                 False                    
--   assumptions                    JSON                 False                    
--   created_by_user_id             INTEGER              False                    
--   created_at                     INTEGER              True                     

-- 4. POSTGRESQL MIGRATION NOTES
--   - SQLite has no ENUM type -> use PostgreSQL ENUM or CHECK constraints
--   - SQLite INTEGER PRIMARY KEY -> PostgreSQL SERIAL or BIGSERIAL
--   - SQLite has no native BOOLEAN -> map INTEGER 0/1 to BOOLEAN
--   - SQLite REAL -> PostgreSQL NUMERIC or DOUBLE PRECISION
--   - SQLite TEXT dates (ISO strings) -> PostgreSQL DATE or TIMESTAMP
--   - SQLite created_at as int(time.time()) -> PostgreSQL TIMESTAMP WITH TIME ZONE
--   - SQLite has no schema enforcement on types (type affinity) -> PostgreSQL is strict
--   - FOREIGN KEY enforcement: SQLite off by default, PostgreSQL always on

-- 5. TYPE MIGRATION MAP
--   SQLite (none)               -> PostgreSQL TEXT (SQLite default)
--   SQLite BOOLEAN              -> PostgreSQL CHECK: BOOLEAN
--   SQLite INTEGER              -> PostgreSQL INTEGER (or SERIAL for PKs, BOOLEAN for flags)
--   SQLite JSON                 -> PostgreSQL CHECK: JSON
--   SQLite REAL                 -> PostgreSQL NUMERIC(precision, scale) or DOUBLE PRECISION
--   SQLite TEXT                 -> PostgreSQL TEXT or VARCHAR(n) or DATE/TIMESTAMP

================================================================================
-- FOREIGN KEY ANALYSIS: DEV/BACKEND (dev_portfolio.db)
================================================================================

-- 1. EXPLICIT FOREIGN KEY constraints (PRAGMA foreign_key_list)
--   cash_flows.related_txn_id -> transactions.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   cash_flows.account_id -> external_accounts.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   external_accounts.portfolio_id -> portfolios.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_line_items.statement_id -> financial_statements.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_normalized.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_raw_extraction.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_statements.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_uploads.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_user_edits.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   financial_validation.upload_id -> financial_uploads.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   ledger_entries.asset_id -> assets.asset_id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   pfm_asset_items.snapshot_id -> pfm_snapshots.id  (ON UPDATE NO ACTION, ON DELETE CASCADE)
--   pfm_income_expense_items.snapshot_id -> pfm_snapshots.id  (ON UPDATE NO ACTION, ON DELETE CASCADE)
--   pfm_liability_items.snapshot_id -> pfm_snapshots.id  (ON UPDATE NO ACTION, ON DELETE CASCADE)
--   portfolio_transactions.account_id -> external_accounts.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   portfolio_transactions.stock_id -> stocks_master.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   portfolio_transactions.portfolio_id -> portfolios.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   position_snapshots.portfolio_id -> portfolios.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   position_snapshots.stock_id -> stocks_master.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   prices.asset_id -> assets.asset_id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   security_aliases.security_id -> securities_master.security_id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   stock_metrics.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   stock_scores.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   symbol_mappings.stock_id -> stocks_master.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   user_sessions.user_id -> users.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)
--   valuation_models.stock_id -> analysis_stocks.id  (ON UPDATE NO ACTION, ON DELETE NO ACTION)

-- 2. IMPLICIT FK relationships (inferred from column naming patterns)
--   analysis_audit_log.user_id -> users.id  [OK]
--   analysis_stocks.user_id -> users.id  [OK]
--   bank_cashflows.user_id -> users.id  [OK]
--   cash_deposits.user_id -> users.id  [OK]
--   cash_flows.user_id -> users.id  [OK]
--   cash_flows.account_id -> external_accounts.id  [OK]
--   external_accounts.user_id -> users.id  [OK]
--   external_accounts.portfolio_id -> portfolios.id  [OK]
--   financial_audit_log.user_id -> users.id  [OK]
--   financial_statements.stock_id -> stocks.id  [OK]
--   financial_uploads.user_id -> users.id  [OK]
--   financial_uploads.stock_id -> stocks.id  [OK]
--   ledger_entries.asset_id -> assets.id  [OK]
--   pfm_asset_items.snapshot_id -> daily_snapshots.id  [OK]
--   pfm_asset_items.user_id -> users.id  [OK]
--   pfm_income_expense_items.snapshot_id -> daily_snapshots.id  [OK]
--   pfm_income_expense_items.user_id -> users.id  [OK]
--   pfm_liability_items.snapshot_id -> daily_snapshots.id  [OK]
--   pfm_liability_items.user_id -> users.id  [OK]
--   pfm_snapshots.user_id -> users.id  [OK]
--   portfolio_snapshots.user_id -> users.id  [OK]
--   portfolio_summary.user_id -> users.id  [OK]
--   portfolio_transactions.user_id -> users.id  [OK]
--   portfolio_transactions.portfolio_id -> portfolios.id  [OK]
--   portfolio_transactions.stock_id -> stocks.id  [OK]
--   portfolio_transactions.account_id -> external_accounts.id  [OK]
--   portfolios.user_id -> users.id  [OK]
--   position_snapshots.user_id -> users.id  [OK]
--   position_snapshots.stock_id -> stocks.id  [OK]
--   position_snapshots.portfolio_id -> portfolios.id  [OK]
--   prices.asset_id -> assets.id  [OK]
--   securities_master.user_id -> users.id  [OK]
--   security_aliases.user_id -> users.id  [OK]
--   security_aliases.security_id -> securities_master.id  [OK]
--   stock_metrics.stock_id -> stocks.id  [OK]
--   stock_scores.stock_id -> stocks.id  [OK]
--   stocks.user_id -> users.id  [OK]
--   symbol_mappings.stock_id -> stocks.id  [OK]
--   trading_history.user_id -> users.id  [OK]
--   transactions.user_id -> users.id  [OK]
--   transactions.security_id -> securities_master.id  [OK]
--   transactions.portfolio_id -> portfolios.id  [OK]
--   transactions.account_id -> external_accounts.id  [OK]
--   user_sessions.user_id -> users.id  [OK]
--   valuation_models.stock_id -> stocks.id  [OK]

-- 3. FULL COLUMN INVENTORY (for PostgreSQL migration planning)

--   TABLE: analysis_audit_log
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   operation                      TEXT                 True                     
--   entity_type                    TEXT                 True                     
--   entity_id                      INTEGER              False                    
--   old_value                      TEXT                 False                    
--   new_value                      TEXT                 False                    
--   reason                         TEXT                 False                    
--   details                        TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: analysis_stocks
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   symbol                         TEXT                 True                     
--   company_name                   TEXT                 True                     
--   exchange                       TEXT                 False    'NYSE'          
--   currency                       TEXT                 False    'USD'           
--   sector                         TEXT                 False                    
--   industry                       TEXT                 False                    
--   country                        TEXT                 False                    
--   isin                           TEXT                 False                    
--   cik                            TEXT                 False                    
--   description                    TEXT                 False                    
--   website                        TEXT                 False                    
--   created_at                     INTEGER              True                     
--   updated_at                     INTEGER              True                     
--   outstanding_shares             REAL                 False                    

--   TABLE: assets
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   asset_id                       INTEGER              False                    PK
--   symbol                         TEXT                 True                     
--   asset_type                     TEXT                 True                     
--   exchange                       TEXT                 False                    
--   currency                       TEXT                 True                     

--   TABLE: bank_cashflows
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   bank_txn_id                    INTEGER              False                    PK
--   bank_name                      TEXT                 True                     
--   txn_date                       TEXT                 True                     
--   amount                         REAL                 True                     
--   description                    TEXT                 False                    
--   comments                       TEXT                 False                    
--   created_at                     TEXT                 False    datetime('now') 
--   user_id                        INTEGER              False    1               

--   TABLE: cash_deposits
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   bank_name                      TEXT                 False                    
--   deposit_date                   TEXT                 True                     
--   amount                         REAL                 True                     
--   description                    TEXT                 False                    
--   comments                       TEXT                 False                    
--   created_at                     INTEGER              True     strftime('%s','now') 
--   portfolio                      TEXT                 False    'KFH'           
--   include_in_analysis            INTEGER              False    1               
--   currency                       TEXT                 False    'KWD'           
--   user_id                        INTEGER              False                    
--   source                         TEXT                 False                    
--   notes                          TEXT                 False                    
--   source_reference               TEXT                 False                    
--   is_deleted                     INTEGER              False    0               
--   deleted_at                     INTEGER              False                    
--   deleted_by                     INTEGER              False                    
--   fx_rate_at_deposit             REAL                 False    1.0             

--   TABLE: cash_flows
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   account_id                     INTEGER              False                    
--   flow_type                      TEXT                 True                     
--   amount                         REAL                 True                     
--   currency                       TEXT                 False    'KWD'           
--   related_txn_id                 INTEGER              False                    
--   flow_date                      TEXT                 True                     
--   description                    TEXT                 False                    
--   reconciled                     INTEGER              False    0               
--   created_at                     INTEGER              False                    

--   TABLE: cbk_rate_cache
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   rate                           REAL                 True                     
--   fetched_date                   TEXT                 True                     
--   source                         TEXT                 True                     
--   created_at                     INTEGER              False    strftime('%s', 'now') 

--   TABLE: daily_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   snapshot_date                  TEXT                 True                     PK
--   asset_id                       INTEGER              True                     PK
--   quantity                       REAL                 True                     
--   avg_cost                       REAL                 True                     
--   cost_value                     REAL                 True                     
--   mkt_price                      REAL                 True                     
--   mkt_value                      REAL                 True                     
--   currency                       TEXT                 True                     
--   fx_to_base                     REAL                 True                     
--   mkt_value_base                 REAL                 True                     
--   cost_value_base                REAL                 True                     
--   pnl_base                       REAL                 True                     

--   TABLE: daily_snapshots_old
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   snapshot_date                  TEXT                 False                    PK
--   portfolio_value_base           REAL                 True                     
--   cash_balance_base              REAL                 True                     
--   invested_cost_base             REAL                 True                     
--   unrealized_pl_base             REAL                 True                     
--   realized_pl_base               REAL                 True                     
--   dividends_ytd_base             REAL                 True                     

--   TABLE: external_accounts
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   portfolio_id                   INTEGER              False                    
--   name                           TEXT                 True                     
--   account_number                 TEXT                 False                    
--   currency                       TEXT                 False    'KWD'           
--   account_type                   TEXT                 False    'BROKERAGE'     
--   current_balance                REAL                 False    0               
--   last_reconciled_date           TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: financial_audit_log
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   operation                      TEXT                 True                     
--   entity_type                    TEXT                 False                    
--   entity_id                      INTEGER              False                    
--   old_value                      REAL                 False                    
--   new_value                      REAL                 False                    
--   delta                          REAL                 False                    
--   portfolio                      TEXT                 False                    
--   currency                       TEXT                 False                    
--   reason                         TEXT                 False                    
--   details                        TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: financial_line_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   statement_id                   INTEGER              True                     
--   line_item_code                 TEXT                 True                     
--   line_item_name                 TEXT                 True                     
--   amount                         REAL                 True                     
--   currency                       TEXT                 False    'USD'           
--   order_index                    INTEGER              False                    
--   parent_item_id                 INTEGER              False                    
--   is_total                       BOOLEAN              False    0               
--   manually_edited                BOOLEAN              False    0               
--   edited_by_user_id              INTEGER              False                    
--   edited_at                      INTEGER              False                    

--   TABLE: financial_normalized
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 True                     
--   period_end_date                TEXT                 False                    
--   currency                       TEXT                 False    'USD'           
--   unit_scale                     INTEGER              False    1               
--   line_item_key                  TEXT                 True                     
--   label_raw                      TEXT                 False                    
--   value                          REAL                 False                    
--   source_page                    INTEGER              False                    
--   source_table_id                INTEGER              False                    

--   TABLE: financial_raw_extraction
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 False                    
--   page_num                       INTEGER              False                    
--   method                         TEXT                 False                    
--   table_id                       INTEGER              False                    
--   table_json                     TEXT                 False                    
--   header_context                 TEXT                 False                    
--   confidence_score               REAL                 False    0.0             

--   TABLE: financial_statements
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   statement_type                 TEXT                 True                     
--   fiscal_year                    INTEGER              True                     
--   fiscal_quarter                 INTEGER              False                    
--   period_end_date                TEXT                 True                     
--   filing_date                    TEXT                 False                    
--   source_file                    TEXT                 False                    
--   extracted_by                   TEXT                 False    'gemini'        
--   confidence_score               REAL                 False                    
--   verified_by_user               BOOLEAN              False    0               
--   notes                          TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: financial_uploads
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   stock_id                       INTEGER              True                     
--   uploaded_at                    INTEGER              True                     
--   pdf_path                       TEXT                 False                    
--   pdf_type                       TEXT                 False    'text'          
--   status                         TEXT                 False    'processing'    
--   error_message                  TEXT                 False                    

--   TABLE: financial_user_edits
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 False                    
--   period                         TEXT                 False                    
--   line_item_key                  TEXT                 True                     
--   old_value                      REAL                 False                    
--   new_value                      REAL                 False                    
--   edited_at                      INTEGER              True                     
--   edited_by                      INTEGER              False                    

--   TABLE: financial_validation
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   upload_id                      INTEGER              True                     
--   statement_type                 TEXT                 False                    
--   rule_name                      TEXT                 True                     
--   expected_value                 REAL                 False                    
--   actual_value                   REAL                 False                    
--   diff                           REAL                 False                    
--   pass_fail                      TEXT                 False    'unknown'       
--   notes                          TEXT                 False                    

--   TABLE: fx_rates
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   fx_id                          INTEGER              False                    PK
--   rate_date                      TEXT                 True                     
--   from_ccy                       TEXT                 True                     
--   to_ccy                         TEXT                 True                     
--   rate                           REAL                 True                     
--   source                         TEXT                 False                    

--   TABLE: ledger_entries
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   entry_id                       INTEGER              False                    PK
--   entry_datetime                 TEXT                 True                     
--   entry_type                     TEXT                 True                     
--   asset_id                       INTEGER              False                    
--   quantity                       REAL                 False                    
--   price                          REAL                 False                    
--   cash_amount                    REAL                 True                     
--   currency                       TEXT                 True                     
--   notes                          TEXT                 False                    

--   TABLE: password_resets
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   email                          TEXT                 True                     
--   otp                            TEXT                 True                     
--   expires_at                     INTEGER              True                     
--   created_at                     INTEGER              True                     

--   TABLE: pfm_asset_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   snapshot_id                    INTEGER              True                     
--   user_id                        INTEGER              True                     
--   asset_type                     TEXT                 True                     
--   category                       TEXT                 True                     
--   name                           TEXT                 True                     
--   quantity                       REAL                 False                    
--   price                          REAL                 False                    
--   currency                       TEXT                 False    'KWD'           
--   value_kwd                      REAL                 True     0               

--   TABLE: pfm_income_expense_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   snapshot_id                    INTEGER              True                     
--   user_id                        INTEGER              True                     
--   kind                           TEXT                 True                     
--   category                       TEXT                 True                     
--   monthly_amount                 REAL                 True     0               
--   is_finance_cost                INTEGER              False    0               
--   is_gna                         INTEGER              False    0               
--   sort_order                     INTEGER              False    0               

--   TABLE: pfm_liability_items
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   snapshot_id                    INTEGER              True                     
--   user_id                        INTEGER              True                     
--   category                       TEXT                 True                     
--   amount_kwd                     REAL                 True     0               
--   is_current                     INTEGER              False    0               
--   is_long_term                   INTEGER              False    0               

--   TABLE: pfm_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   snapshot_date                  TEXT                 True                     
--   notes                          TEXT                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: portfolio_cash
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   portfolio                      TEXT                 False                    PK
--   user_id                        INTEGER              False    1               PK
--   balance                        REAL                 False                    
--   currency                       TEXT                 False    'KWD'           
--   last_updated                   INTEGER              False                    
--   manual_override                INTEGER              False    0               

--   TABLE: portfolio_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              False    1               
--   snapshot_date                  TEXT                 True                     
--   portfolio_value                REAL                 True                     
--   daily_movement                 REAL                 False    0               
--   beginning_difference           REAL                 False    0               
--   deposit_cash                   REAL                 False    0               
--   accumulated_cash               REAL                 False    0               
--   net_gain                       REAL                 False    0               
--   change_percent                 REAL                 False    0               
--   roi_percent                    REAL                 False    0               
--   created_at                     INTEGER              True                     
--   twr_percent                    REAL                 False                    
--   mwrr_percent                   REAL                 False                    

--   TABLE: portfolio_summary
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   stock_symbol                   TEXT                 True                     
--   portfolio                      TEXT                 False    KFH             
--   currency                       TEXT                 False    KWD             
--   total_buy_shares               REAL                 False    0               
--   total_sell_shares              REAL                 False    0               
--   net_shares                     REAL                 False    0               
--   total_buy_cost                 REAL                 False    0               
--   total_sell_value               REAL                 False    0               
--   avg_cost_per_share             REAL                 False    0               
--   total_cash_dividends           REAL                 False    0               
--   total_bonus_shares             REAL                 False    0               
--   total_reinvested_dividends     REAL                 False    0               
--   realized_pnl                   REAL                 False    0               
--   first_buy_date                 TEXT                 False                    
--   last_txn_date                  TEXT                 False                    
--   txn_count                      INTEGER              False    0               
--   updated_at                     INTEGER              True                     

--   TABLE: portfolio_transactions
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   portfolio_id                   INTEGER              True                     
--   txn_type                       TEXT                 True                     
--   source                         TEXT                 True     'MANUAL'        
--   source_reference               TEXT                 False                    
--   stock_id                       INTEGER              False                    
--   account_id                     INTEGER              False                    
--   shares                         REAL                 False                    
--   price                          REAL                 False                    
--   amount                         REAL                 True                     
--   fees                           REAL                 False    0               
--   txn_date                       TEXT                 True                     
--   notes                          TEXT                 False                    
--   legacy_txn_id                  INTEGER              False                    
--   created_at                     INTEGER              False                    
--   created_by                     INTEGER              False                    
--   is_deleted                     INTEGER              False    0               

--   TABLE: portfolios
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   name                           TEXT                 True                     
--   base_currency                  TEXT                 False    'KWD'           
--   description                    TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: position_snapshots
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True                     
--   stock_id                       INTEGER              False                    
--   portfolio_id                   INTEGER              False                    
--   stock_symbol                   TEXT                 False                    
--   txn_id                         INTEGER              False                    
--   snapshot_date                  TEXT                 True                     
--   total_shares                   REAL                 False    0               
--   total_cost                     REAL                 False    0               
--   avg_cost                       REAL                 False    0               
--   realized_pnl                   REAL                 False    0               
--   cash_dividends_received        REAL                 False    0               
--   status                         TEXT                 False    'OPEN'          
--   created_at                     INTEGER              False                    

--   TABLE: prices
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   price_id                       INTEGER              False                    PK
--   asset_id                       INTEGER              True                     
--   price_date                     TEXT                 True                     
--   close_price                    REAL                 True                     
--   source                         TEXT                 False                    

--   TABLE: schema_version
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   version                        INTEGER              True     1               
--   migrated_at                    INTEGER              True                     

--   TABLE: securities_master
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   security_id                    TEXT                 False                    PK
--   user_id                        INTEGER              True     1               
--   exchange                       TEXT                 True                     
--   canonical_ticker               TEXT                 True                     
--   display_name                   TEXT                 False                    
--   isin                           TEXT                 False                    
--   currency                       TEXT                 True     'KWD'           
--   country                        TEXT                 True     'KW'            
--   status                         TEXT                 False    'active'        
--   sector                         TEXT                 False                    
--   created_at                     INTEGER              False                    
--   updated_at                     INTEGER              False                    

--   TABLE: security_aliases
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              True     1               
--   security_id                    TEXT                 True                     
--   alias_name                     TEXT                 True                     
--   alias_type                     TEXT                 False    'user_input'    
--   valid_from                     TEXT                 False                    
--   valid_until                    TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: settings
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   key                            TEXT                 False                    PK
--   value                          TEXT                 True                     

--   TABLE: sqlite_sequence
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   name                           TEXT                 False                    
--   seq                            TEXT                 False                    

--   TABLE: stock_metrics
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   fiscal_year                    INTEGER              True                     
--   fiscal_quarter                 INTEGER              False                    
--   period_end_date                TEXT                 True                     
--   metric_type                    TEXT                 True                     
--   metric_name                    TEXT                 True                     
--   metric_value                   REAL                 False                    
--   created_at                     INTEGER              True                     

--   TABLE: stock_scores
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   scoring_date                   TEXT                 True                     
--   overall_score                  REAL                 False                    
--   fundamental_score              REAL                 False                    
--   valuation_score                REAL                 False                    
--   growth_score                   REAL                 False                    
--   quality_score                  REAL                 False                    
--   details                        JSON                 False                    
--   analyst_notes                  TEXT                 False                    
--   created_by_user_id             INTEGER              False                    
--   created_at                     INTEGER              True                     

--   TABLE: stocks
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              False    1               
--   symbol                         TEXT                 True                     
--   name                           TEXT                 False                    
--   current_price                  REAL                 False    0               
--   portfolio                      TEXT                 False    'KFH'           
--   currency                       TEXT                 False    'KWD'           
--   tradingview_symbol             TEXT                 False                    
--   tradingview_exchange           TEXT                 False                    
--   last_updated                   INTEGER              False                    
--   price_source                   TEXT                 False                    
--   created_at                     INTEGER              False                    

--   TABLE: stocks_master
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   ticker                         TEXT                 True                     
--   name                           TEXT                 False                    
--   exchange                       TEXT                 False    'KSE'           
--   currency                       TEXT                 False    'KWD'           
--   isin                           TEXT                 False                    
--   sector                         TEXT                 False                    
--   country                        TEXT                 False    'KW'            
--   status                         TEXT                 False    'active'        
--   created_at                     INTEGER              False                    
--   updated_at                     INTEGER              False                    

--   TABLE: symbol_mappings
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_input                     TEXT                 True                     
--   canonical_ticker               TEXT                 True                     
--   stock_id                       INTEGER              False                    
--   created_at                     INTEGER              False                    

--   TABLE: trading_history
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_symbol                   TEXT                 True                     
--   txn_date                       TEXT                 True                     
--   txn_type                       TEXT                 True                     
--   purchase_cost                  REAL                 True     0               
--   sell_value                     REAL                 True     0               
--   shares                         REAL                 True     0               
--   cash_dividend                  REAL                 True     0               
--   bonus_shares                   REAL                 True     0               
--   notes                          TEXT                 False                    
--   created_at                     INTEGER              True                     
--   user_id                        INTEGER              False    1               

--   TABLE: transactions
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   user_id                        INTEGER              False                    
--   portfolio                      TEXT                 False    'KFH'           
--   stock_symbol                   TEXT                 True                     
--   txn_date                       TEXT                 True                     
--   txn_type                       TEXT                 True                     
--   purchase_cost                  REAL                 True     0               
--   sell_value                     REAL                 True     0               
--   shares                         REAL                 True     0               
--   bonus_shares                   REAL                 True     0               
--   cash_dividend                  REAL                 True     0               
--   reinvested_dividend            REAL                 True     0               
--   price_override                 REAL                 False                    
--   planned_cum_shares             REAL                 False                    
--   fees                           REAL                 False    0               
--   broker                         TEXT                 False                    
--   reference                      TEXT                 False                    
--   notes                          TEXT                 False                    
--   category                       TEXT                 False                    
--   created_at                     INTEGER              True                     
--   security_id                    TEXT                 False                    
--   stock_master_id                INTEGER              False                    
--   portfolio_id                   INTEGER              False                    
--   account_id                     INTEGER              False                    
--   source                         TEXT                 False    'MANUAL'        
--   source_reference               TEXT                 False                    
--   is_deleted                     INTEGER              False    0               
--   deleted_at                     INTEGER              False                    
--   deleted_by                     INTEGER              False                    
--   avg_cost_at_txn                REAL                 False                    
--   realized_pnl_at_txn            REAL                 False                    
--   cost_basis_at_txn              REAL                 False                    
--   shares_held_at_txn             REAL                 False                    
--   fx_rate_at_txn                 REAL                 False                    

--   TABLE: user_sessions
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   token                          TEXT                 False                    PK
--   user_id                        INTEGER              True                     
--   expires_at                     INTEGER              True                     
--   created_at                     INTEGER              True                     

--   TABLE: users
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   username                       TEXT                 True                     
--   password_hash                  TEXT                 True                     
--   created_at                     INTEGER              True                     
--   email                          TEXT                 False                    
--   name                           TEXT                 False                    
--   gemini_api_key                 TEXT                 False                    
--   gemini_api_key_encrypted       TEXT                 False                    
--   gemini_api_key_last_validated  INTEGER              False                    
--   gemini_quota_reset_at          INTEGER              False                    
--   gemini_requests_today          INTEGER              False    0               

--   TABLE: valuation_models
--   Column                         Type                 NotNull  Default         PK
--   ------------------------------ -------------------- -------- --------------- ---
--   id                             INTEGER              False                    PK
--   stock_id                       INTEGER              True                     
--   model_type                     TEXT                 True                     
--   valuation_date                 TEXT                 True                     
--   intrinsic_value                REAL                 False                    
--   parameters                     JSON                 False                    
--   assumptions                    JSON                 False                    
--   created_by_user_id             INTEGER              False                    
--   created_at                     INTEGER              True                     

-- 4. POSTGRESQL MIGRATION NOTES
--   - SQLite has no ENUM type -> use PostgreSQL ENUM or CHECK constraints
--   - SQLite INTEGER PRIMARY KEY -> PostgreSQL SERIAL or BIGSERIAL
--   - SQLite has no native BOOLEAN -> map INTEGER 0/1 to BOOLEAN
--   - SQLite REAL -> PostgreSQL NUMERIC or DOUBLE PRECISION
--   - SQLite TEXT dates (ISO strings) -> PostgreSQL DATE or TIMESTAMP
--   - SQLite created_at as int(time.time()) -> PostgreSQL TIMESTAMP WITH TIME ZONE
--   - SQLite has no schema enforcement on types (type affinity) -> PostgreSQL is strict
--   - FOREIGN KEY enforcement: SQLite off by default, PostgreSQL always on

-- 5. TYPE MIGRATION MAP
--   SQLite (none)               -> PostgreSQL TEXT (SQLite default)
--   SQLite BOOLEAN              -> PostgreSQL CHECK: BOOLEAN
--   SQLite INTEGER              -> PostgreSQL INTEGER (or SERIAL for PKs, BOOLEAN for flags)
--   SQLite JSON                 -> PostgreSQL CHECK: JSON
--   SQLite REAL                 -> PostgreSQL NUMERIC(precision, scale) or DOUBLE PRECISION
--   SQLite TEXT                 -> PostgreSQL TEXT or VARCHAR(n) or DATE/TIMESTAMP