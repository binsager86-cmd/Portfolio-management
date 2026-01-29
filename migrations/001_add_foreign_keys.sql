-- ============================================================================
-- POSTGRESQL MIGRATION SCRIPT: Foreign Key Constraints
-- ============================================================================
-- File: 001_add_foreign_keys.sql
-- Created: January 29, 2026
-- Purpose: Add foreign key constraints for multi-user data isolation
-- 
-- IMPORTANT: 
--   - This script is for PostgreSQL ONLY
--   - Do NOT run on SQLite (SQLite has limited ALTER TABLE support)
--   - Run AFTER migrating data from SQLite to PostgreSQL
--   - All orphan checks passed on 2026-01-29 (0 orphans in all tables)
-- ============================================================================

-- Pre-flight check: Verify no orphan records exist
-- (Run these SELECT queries first to confirm before adding constraints)
/*
SELECT COUNT(*) FROM transactions t LEFT JOIN users u ON t.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM stocks s LEFT JOIN users u ON s.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM cash_deposits c LEFT JOIN users u ON c.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM trading_history th LEFT JOIN users u ON th.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM portfolio_snapshots ps LEFT JOIN users u ON ps.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM portfolio_cash pc LEFT JOIN users u ON pc.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM pfm_income_expense_items i LEFT JOIN users u ON i.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM pfm_asset_items a LEFT JOIN users u ON a.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM pfm_liability_items l LEFT JOIN users u ON l.user_id = u.id WHERE u.id IS NULL;
SELECT COUNT(*) FROM bank_cashflows b LEFT JOIN users u ON b.user_id = u.id WHERE u.id IS NULL;
*/

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- 1. Transactions
ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 2. Stocks
ALTER TABLE stocks
    ADD CONSTRAINT fk_stocks_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 3. Cash Deposits
ALTER TABLE cash_deposits
    ADD CONSTRAINT fk_cash_deposits_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 4. Trading History
ALTER TABLE trading_history
    ADD CONSTRAINT fk_trading_history_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 5. Portfolio Snapshots
ALTER TABLE portfolio_snapshots
    ADD CONSTRAINT fk_portfolio_snapshots_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 6. Portfolio Cash
ALTER TABLE portfolio_cash
    ADD CONSTRAINT fk_portfolio_cash_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 7. PFM Income/Expense Items
ALTER TABLE pfm_income_expense_items
    ADD CONSTRAINT fk_pfm_income_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 8. PFM Asset Items
ALTER TABLE pfm_asset_items
    ADD CONSTRAINT fk_pfm_asset_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 9. PFM Liability Items
ALTER TABLE pfm_liability_items
    ADD CONSTRAINT fk_pfm_liability_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- 10. Bank Cashflows
ALTER TABLE bank_cashflows
    ADD CONSTRAINT fk_bank_cashflows_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

-- ============================================================================
-- OPTIONAL: Make user_id NOT NULL (run after confirming no NULL values)
-- ============================================================================
/*
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE stocks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cash_deposits ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE trading_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE portfolio_snapshots ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE portfolio_cash ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE bank_cashflows ALTER COLUMN user_id SET NOT NULL;
-- PFM tables already have NOT NULL constraint
*/

-- ============================================================================
-- OPTIONAL: Drop DEFAULT on bank_cashflows.user_id (after migration complete)
-- ============================================================================
/*
ALTER TABLE bank_cashflows ALTER COLUMN user_id DROP DEFAULT;
*/

-- ============================================================================
-- VERIFICATION: List all foreign keys after migration
-- ============================================================================
/*
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'users'
ORDER BY tc.table_name;
*/
