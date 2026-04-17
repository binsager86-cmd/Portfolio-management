-- ============================================
-- STOCK ANALYSIS MODULE - DATABASE SCHEMA
-- Separate from portfolio tracking database
-- ============================================

-- 1. Stock Master (Analysis Profiles)
CREATE TABLE IF NOT EXISTS analysis_stocks (
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
    outstanding_shares REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(user_id, symbol)
);

-- 2. Financial Statement Master (Header)
CREATE TABLE IF NOT EXISTS financial_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    statement_type TEXT NOT NULL,          -- 'income', 'balance', 'cashflow', 'equity'
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

-- 3. Financial Line Items (Detailed Breakdown)
CREATE TABLE IF NOT EXISTS financial_line_items (
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

-- 4. Stock Metrics & Ratios (Calculated)
CREATE TABLE IF NOT EXISTS stock_metrics (
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

-- 5. Valuation Models (Stored Results)
CREATE TABLE IF NOT EXISTS valuation_models (
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

-- 6. Stock Scores (CFA Scoring System)
CREATE TABLE IF NOT EXISTS stock_scores (
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

-- 7. Audit Log (Track Changes)
CREATE TABLE IF NOT EXISTS analysis_audit_log (
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

-- ============================================
-- Performance Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_analysis_stocks_user ON analysis_stocks(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_stocks_symbol ON analysis_stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_financial_statements_stock ON financial_statements(stock_id);
CREATE INDEX IF NOT EXISTS idx_financial_statements_type_date ON financial_statements(statement_type, period_end_date);
CREATE INDEX IF NOT EXISTS idx_line_items_statement ON financial_line_items(statement_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON financial_line_items(line_item_code);
CREATE INDEX IF NOT EXISTS idx_stock_metrics_stock ON stock_metrics(stock_id);
CREATE INDEX IF NOT EXISTS idx_valuation_models_stock ON valuation_models(stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_scores_stock ON stock_scores(stock_id);
