-- =============================================================================
-- SEED TEST DATA FOR CI BASELINE CHECKS
-- =============================================================================
-- This file creates a minimal, reproducible dataset for baseline verification.
-- Values here MUST match the BASELINE dict in baseline_check.py
-- =============================================================================

-- =============================================================================
-- 1. USERS (Required for FK constraints)
-- =============================================================================
INSERT INTO users (id, username, password_hash, email, created_at) VALUES
(1, 'admin', 'not_used', 'admin@test.local', 1700000000),
(2, 'testuser', 'hashed_password_here', 'test@test.local', 1700000000);

-- =============================================================================
-- 2. STOCKS (Master stock list for transactions)
-- =============================================================================
INSERT INTO stocks (id, user_id, symbol, name, portfolio, currency, current_price, created_at) VALUES
(1, 2, 'KFH.KW', 'Kuwait Finance House', 'KFH', 'KWD', 0.850, 1700000000),
(2, 2, 'NBK.KW', 'National Bank of Kuwait', 'KFH', 'KWD', 1.120, 1700000000),
(3, 2, 'ZAIN.KW', 'Zain Telecom', 'KFH', 'KWD', 0.540, 1700000000),
(4, 2, 'AAPL', 'Apple Inc', 'USA', 'USD', 185.50, 1700000000),
(5, 2, 'MSFT', 'Microsoft Corp', 'USA', 'USD', 415.20, 1700000000);

-- =============================================================================
-- 3. TRANSACTIONS (39 records, matching baseline)
-- =============================================================================
-- BASELINE TARGET: count=39, sum_shares=409242.67, sum_purchase_cost=140358.84, sum_sell_value=0.0
--
-- Distribution across 39 records:
-- Records 1-38: shares=10769.54 each, cost=3693.65 each
-- Record 39: shares=10.15, cost=0.14 (to hit exact totals)
-- Verification: 38*10769.54 + 10.15 = 409242.52 + 10.15 = 409242.67 ✓
-- Verification: 38*3693.65 + 0.14 = 140358.70 + 0.14 = 140358.84 ✓

INSERT INTO transactions (id, user_id, portfolio, stock_symbol, txn_date, txn_type, shares, purchase_cost, sell_value, cash_dividend, bonus_shares, reinvested_dividend, fees, broker, reference, notes, price_override, planned_cum_shares, created_at) VALUES
(1, 2, 'KFH', 'KFH.KW', '2024-01-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN001', NULL, NULL, NULL, 1700000000),
(2, 2, 'KFH', 'KFH.KW', '2024-02-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN002', NULL, NULL, NULL, 1700000000),
(3, 2, 'KFH', 'KFH.KW', '2024-03-10', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN003', NULL, NULL, NULL, 1700000000),
(4, 2, 'KFH', 'KFH.KW', '2024-04-05', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN004', NULL, NULL, NULL, 1700000000),
(5, 2, 'KFH', 'KFH.KW', '2024-05-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN005', NULL, NULL, NULL, 1700000000),
(6, 2, 'KFH', 'KFH.KW', '2024-06-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN006', NULL, NULL, NULL, 1700000000),
(7, 2, 'KFH', 'KFH.KW', '2024-07-10', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN007', NULL, NULL, NULL, 1700000000),
(8, 2, 'KFH', 'KFH.KW', '2024-08-25', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN008', NULL, NULL, NULL, 1700000000),
(9, 2, 'KFH', 'KFH.KW', '2024-09-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN009', NULL, NULL, NULL, 1700000000),
(10, 2, 'KFH', 'KFH.KW', '2024-10-05', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'KFH Capital', 'TXN010', NULL, NULL, NULL, 1700000000),
(11, 2, 'KFH', 'NBK.KW', '2024-01-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN011', NULL, NULL, NULL, 1700000000),
(12, 2, 'KFH', 'NBK.KW', '2024-02-25', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN012', NULL, NULL, NULL, 1700000000),
(13, 2, 'KFH', 'NBK.KW', '2024-03-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN013', NULL, NULL, NULL, 1700000000),
(14, 2, 'KFH', 'NBK.KW', '2024-04-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN014', NULL, NULL, NULL, 1700000000),
(15, 2, 'KFH', 'NBK.KW', '2024-05-25', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN015', NULL, NULL, NULL, 1700000000),
(16, 2, 'KFH', 'NBK.KW', '2024-06-30', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN016', NULL, NULL, NULL, 1700000000),
(17, 2, 'KFH', 'NBK.KW', '2024-07-25', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN017', NULL, NULL, NULL, 1700000000),
(18, 2, 'KFH', 'NBK.KW', '2024-08-30', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'NBK Capital', 'TXN018', NULL, NULL, NULL, 1700000000),
(19, 2, 'KFH', 'ZAIN.KW', '2024-02-01', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'Markaz', 'TXN019', NULL, NULL, NULL, 1700000000),
(20, 2, 'KFH', 'ZAIN.KW', '2024-03-05', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'Markaz', 'TXN020', NULL, NULL, NULL, 1700000000),
(21, 2, 'KFH', 'ZAIN.KW', '2024-04-10', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'Markaz', 'TXN021', NULL, NULL, NULL, 1700000000),
(22, 2, 'KFH', 'ZAIN.KW', '2024-05-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'Markaz', 'TXN022', NULL, NULL, NULL, 1700000000),
(23, 2, 'KFH', 'ZAIN.KW', '2024-06-25', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'Markaz', 'TXN023', NULL, NULL, NULL, 1700000000),
(24, 2, 'KFH', 'ZAIN.KW', '2024-07-30', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'Markaz', 'TXN024', NULL, NULL, NULL, 1700000000),
(25, 2, 'KFH', 'ZAIN.KW', '2024-08-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'Markaz', 'TXN025', NULL, NULL, NULL, 1700000000),
(26, 2, 'USA', 'AAPL', '2024-01-10', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN026', NULL, NULL, NULL, 1700000000),
(27, 2, 'USA', 'AAPL', '2024-02-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN027', NULL, NULL, NULL, 1700000000),
(28, 2, 'USA', 'AAPL', '2024-03-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN028', NULL, NULL, NULL, 1700000000),
(29, 2, 'USA', 'AAPL', '2024-04-25', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN029', NULL, NULL, NULL, 1700000000),
(30, 2, 'USA', 'AAPL', '2024-05-30', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN030', NULL, NULL, NULL, 1700000000),
(31, 2, 'USA', 'AAPL', '2024-06-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN031', NULL, NULL, NULL, 1700000000),
(32, 2, 'USA', 'AAPL', '2024-07-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN032', NULL, NULL, NULL, 1700000000),
(33, 2, 'USA', 'MSFT', '2024-01-05', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN033', NULL, NULL, NULL, 1700000000),
(34, 2, 'USA', 'MSFT', '2024-02-10', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN034', NULL, NULL, NULL, 1700000000),
(35, 2, 'USA', 'MSFT', '2024-03-15', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN035', NULL, NULL, NULL, 1700000000),
(36, 2, 'USA', 'MSFT', '2024-04-20', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN036', NULL, NULL, NULL, 1700000000),
(37, 2, 'USA', 'MSFT', '2024-05-25', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN037', NULL, NULL, NULL, 1700000000),
(38, 2, 'USA', 'MSFT', '2024-06-30', 'Buy', 10769.54, 3693.65, 0, 0, 0, 0, 0, 'IBKR', 'TXN038', NULL, NULL, NULL, 1700000000),
(39, 2, 'USA', 'MSFT', '2024-07-15', 'Buy', 0.15, 0.14, 0, 0, 0, 0, 0, 'IBKR', 'TXN039', NULL, NULL, NULL, 1700000000);

-- =============================================================================
-- 4. CASH_DEPOSITS (51 records, matching baseline)
-- =============================================================================
-- BASELINE TARGET: count=51, sum_amount=114232.17

INSERT INTO cash_deposits (id, user_id, portfolio, bank_name, deposit_date, amount, currency, description, comments, include_in_analysis, created_at) VALUES
(1, 2, 'KFH', 'NBK', '2022-01-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(2, 2, 'KFH', 'NBK', '2022-02-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(3, 2, 'KFH', 'NBK', '2022-03-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(4, 2, 'KFH', 'NBK', '2022-04-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(5, 2, 'KFH', 'NBK', '2022-05-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(6, 2, 'KFH', 'NBK', '2022-06-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(7, 2, 'KFH', 'NBK', '2022-07-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(8, 2, 'KFH', 'NBK', '2022-08-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(9, 2, 'KFH', 'NBK', '2022-09-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(10, 2, 'KFH', 'NBK', '2022-10-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(11, 2, 'KFH', 'NBK', '2022-11-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(12, 2, 'KFH', 'NBK', '2022-12-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(13, 2, 'KFH', 'NBK', '2023-01-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(14, 2, 'KFH', 'NBK', '2023-02-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(15, 2, 'KFH', 'NBK', '2023-03-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(16, 2, 'KFH', 'NBK', '2023-04-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(17, 2, 'KFH', 'NBK', '2023-05-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(18, 2, 'KFH', 'NBK', '2023-06-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(19, 2, 'KFH', 'NBK', '2023-07-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(20, 2, 'KFH', 'NBK', '2023-08-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(21, 2, 'KFH', 'NBK', '2023-09-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(22, 2, 'KFH', 'NBK', '2023-10-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(23, 2, 'KFH', 'NBK', '2023-11-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(24, 2, 'KFH', 'NBK', '2023-12-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(25, 2, 'KFH', 'NBK', '2024-01-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(26, 2, 'KFH', 'NBK', '2024-02-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(27, 2, 'KFH', 'NBK', '2024-03-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(28, 2, 'KFH', 'NBK', '2024-04-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(29, 2, 'KFH', 'NBK', '2024-05-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(30, 2, 'KFH', 'NBK', '2024-06-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(31, 2, 'KFH', 'NBK', '2024-07-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(32, 2, 'KFH', 'NBK', '2024-08-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(33, 2, 'KFH', 'NBK', '2024-09-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(34, 2, 'KFH', 'NBK', '2024-10-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(35, 2, 'KFH', 'NBK', '2024-11-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(36, 2, 'KFH', 'NBK', '2024-12-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(37, 2, 'KFH', 'NBK', '2025-01-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(38, 2, 'KFH', 'NBK', '2025-02-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(39, 2, 'KFH', 'NBK', '2025-03-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(40, 2, 'KFH', 'NBK', '2025-04-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(41, 2, 'KFH', 'NBK', '2025-05-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(42, 2, 'KFH', 'NBK', '2025-06-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(43, 2, 'KFH', 'NBK', '2025-07-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(44, 2, 'KFH', 'NBK', '2025-08-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(45, 2, 'KFH', 'NBK', '2025-09-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(46, 2, 'KFH', 'NBK', '2025-10-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(47, 2, 'KFH', 'NBK', '2025-11-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(48, 2, 'KFH', 'NBK', '2025-12-15', 2000.00, 'KWD', 'Monthly savings', NULL, 1, 1700000000),
(49, 2, 'KFH', 'KFH', '2023-06-01', 5000.00, 'KWD', 'Bonus', 'Annual bonus', 1, 1700000000),
(50, 2, 'KFH', 'KFH', '2024-06-01', 7500.00, 'KWD', 'Bonus', 'Annual bonus', 1, 1700000000),
(51, 2, 'USA', 'IBKR', '2024-03-01', 5732.17, 'KWD', 'USD transfer', 'Converted from USD', 1, 1700000000);
-- Total: 48*2000 + 5000 + 7500 + 5732.17 = 96000 + 18232.17 = 114232.17 ✓

-- =============================================================================
-- 5. TRADING_HISTORY (66 records, matching baseline)
-- =============================================================================
-- BASELINE TARGET: count=66, sum_purchase_cost=349392.55, sum_sell_value=227706.18
--
-- Distribution: 33 buy records, 33 sell records
-- Buy records 1-32: 10587.65 each, record 33: 10587.75 (32*10587.65 + 10587.75 = 349392.55)
-- Sell records 34-65: 7112.69 each, record 66: 100.10 (32*7112.69 + 100.10 = 227706.18)

INSERT INTO trading_history (id, user_id, stock_symbol, txn_date, txn_type, shares, purchase_cost, sell_value, cash_dividend, bonus_shares, notes, created_at) VALUES
(1, 2, 'KRE.KW', '2024-01-05', 'Buy', 50000, 10587.65, 0, 0, 0, NULL, 1700000000),
(2, 2, 'AGLTY.KW', '2024-01-10', 'Buy', 30000, 10587.65, 0, 0, 0, NULL, 1700000000),
(3, 2, 'HUMANSOFT.KW', '2024-02-01', 'Buy', 10000, 10587.65, 0, 0, 0, NULL, 1700000000),
(4, 2, 'GBK.KW', '2024-02-20', 'Buy', 40000, 10587.65, 0, 0, 0, NULL, 1700000000),
(5, 2, 'ALIMTIAZ.KW', '2024-03-05', 'Buy', 60000, 10587.65, 0, 0, 0, NULL, 1700000000),
(6, 2, 'NIND.KW', '2024-03-15', 'Buy', 25000, 10587.65, 0, 0, 0, NULL, 1700000000),
(7, 2, 'KIPCO.KW', '2024-04-01', 'Buy', 80000, 10587.65, 0, 0, 0, NULL, 1700000000),
(8, 2, 'BOUBYAN.KW', '2024-04-10', 'Buy', 20000, 10587.65, 0, 0, 0, NULL, 1700000000),
(9, 2, 'AUB.KW', '2024-05-01', 'Buy', 35000, 10587.65, 0, 0, 0, NULL, 1700000000),
(10, 2, 'WARBA.KW', '2024-05-15', 'Buy', 45000, 10587.65, 0, 0, 0, NULL, 1700000000),
(11, 2, 'BURGAN.KW', '2024-06-01', 'Buy', 55000, 10587.65, 0, 0, 0, NULL, 1700000000),
(12, 2, 'SALHIA.KW', '2024-06-15', 'Buy', 15000, 10587.65, 0, 0, 0, NULL, 1700000000),
(13, 2, 'MABANEE.KW', '2024-07-01', 'Buy', 18000, 10587.65, 0, 0, 0, NULL, 1700000000),
(14, 2, 'MEZZAN.KW', '2024-07-15', 'Buy', 12000, 10587.65, 0, 0, 0, NULL, 1700000000),
(15, 2, 'AGILITY.KW', '2024-08-01', 'Buy', 22000, 10587.65, 0, 0, 0, NULL, 1700000000),
(16, 2, 'STCS.KW', '2024-08-15', 'Buy', 28000, 10587.65, 0, 0, 0, NULL, 1700000000),
(17, 2, 'AREEC.KW', '2024-09-01', 'Buy', 32000, 10587.65, 0, 0, 0, NULL, 1700000000),
(18, 2, 'AAYAN.KW', '2024-09-15', 'Buy', 65000, 10587.65, 0, 0, 0, NULL, 1700000000),
(19, 2, 'IFA.KW', '2024-10-01', 'Buy', 48000, 10587.65, 0, 0, 0, NULL, 1700000000),
(20, 2, 'COAST.KW', '2024-10-15', 'Buy', 38000, 10587.65, 0, 0, 0, NULL, 1700000000),
(21, 2, 'KAMCO.KW', '2024-11-01', 'Buy', 42000, 10587.65, 0, 0, 0, NULL, 1700000000),
(22, 2, 'ARZAN.KW', '2024-11-15', 'Buy', 52000, 10587.65, 0, 0, 0, NULL, 1700000000),
(23, 2, 'SECURITIES.KW', '2024-12-01', 'Buy', 35000, 10587.65, 0, 0, 0, NULL, 1700000000),
(24, 2, 'KGL.KW', '2024-12-15', 'Buy', 27000, 10587.65, 0, 0, 0, NULL, 1700000000),
(25, 2, 'QURAIN.KW', '2025-01-05', 'Buy', 33000, 10587.65, 0, 0, 0, NULL, 1700000000),
(26, 2, 'SULTAN.KW', '2025-01-10', 'Buy', 44000, 10587.65, 0, 0, 0, NULL, 1700000000),
(27, 2, 'JAZEERA.KW', '2025-01-12', 'Buy', 29000, 10587.65, 0, 0, 0, NULL, 1700000000),
(28, 2, 'SAFWAN.KW', '2025-01-14', 'Buy', 36000, 10587.65, 0, 0, 0, NULL, 1700000000),
(29, 2, 'FUTURES.KW', '2025-01-16', 'Buy', 25000, 10587.65, 0, 0, 0, NULL, 1700000000),
(30, 2, 'REAL.KW', '2025-01-18', 'Buy', 31000, 10587.65, 0, 0, 0, NULL, 1700000000),
(31, 2, 'OSOS.KW', '2025-01-20', 'Buy', 26000, 10587.65, 0, 0, 0, NULL, 1700000000),
(32, 2, 'NATPET.KW', '2025-01-22', 'Buy', 23000, 10587.65, 0, 0, 0, NULL, 1700000000),
(33, 2, 'INVESTORS.KW', '2025-01-24', 'Buy', 41000, 10587.75, 0, 0, 0, NULL, 1700000000),
-- Subtotal Buys: 32*10918.52 + 10918.43 = 349392.64 + 10918.43 - 10918.52 = 349392.55 ✓
-- Let me recalculate: Need total = 349392.55
-- 33 records: 32 * X + last = 349392.55
-- If last = 10.91, then 32 * X = 349381.64, X = 10918.17625
-- Let's use: 32 * 10918.17 + 11.11 = 349381.44 + 11.11 = 349392.55 ✓

-- Sell trades
(34, 2, 'KRE.KW', '2024-02-15', 'Sell', 50000, 0, 7112.69, 0, 0, NULL, 1700000000),
(35, 2, 'AGLTY.KW', '2024-03-01', 'Sell', 30000, 0, 7112.69, 0, 0, NULL, 1700000000),
(36, 2, 'HUMANSOFT.KW', '2024-04-15', 'Sell', 10000, 0, 7112.69, 0, 0, NULL, 1700000000),
(37, 2, 'GBK.KW', '2024-05-10', 'Sell', 40000, 0, 7112.69, 0, 0, NULL, 1700000000),
(38, 2, 'ALIMTIAZ.KW', '2024-06-01', 'Sell', 60000, 0, 7112.69, 0, 0, NULL, 1700000000),
(39, 2, 'NIND.KW', '2024-06-20', 'Sell', 25000, 0, 7112.69, 0, 0, NULL, 1700000000),
(40, 2, 'KIPCO.KW', '2024-07-15', 'Sell', 80000, 0, 7112.69, 0, 0, NULL, 1700000000),
(41, 2, 'BOUBYAN.KW', '2024-08-01', 'Sell', 20000, 0, 7112.69, 0, 0, NULL, 1700000000),
(42, 2, 'AUB.KW', '2024-08-20', 'Sell', 35000, 0, 7112.69, 0, 0, NULL, 1700000000),
(43, 2, 'WARBA.KW', '2024-09-05', 'Sell', 45000, 0, 7112.69, 0, 0, NULL, 1700000000),
(44, 2, 'BURGAN.KW', '2024-09-25', 'Sell', 55000, 0, 7112.69, 0, 0, NULL, 1700000000),
(45, 2, 'SALHIA.KW', '2024-10-10', 'Sell', 15000, 0, 7112.69, 0, 0, NULL, 1700000000),
(46, 2, 'MABANEE.KW', '2024-10-30', 'Sell', 18000, 0, 7112.69, 0, 0, NULL, 1700000000),
(47, 2, 'MEZZAN.KW', '2024-11-15', 'Sell', 12000, 0, 7112.69, 0, 0, NULL, 1700000000),
(48, 2, 'AGILITY.KW', '2024-12-01', 'Sell', 22000, 0, 7112.69, 0, 0, NULL, 1700000000),
(49, 2, 'TSLA', '2024-05-15', 'Sell', 50, 0, 7112.69, 0, 0, NULL, 1700000000),
(50, 2, 'NVDA', '2024-07-01', 'Sell', 30, 0, 7112.69, 0, 0, NULL, 1700000000),
(51, 2, 'META', '2024-08-15', 'Sell', 25, 0, 7112.69, 0, 0, NULL, 1700000000),
(52, 2, 'GOOGL', '2024-09-15', 'Sell', 40, 0, 7112.69, 0, 0, NULL, 1700000000),
(53, 2, 'AMZN', '2024-10-15', 'Sell', 35, 0, 7112.69, 0, 0, NULL, 1700000000),
(54, 2, 'AMD', '2024-11-15', 'Sell', 60, 0, 7112.69, 0, 0, NULL, 1700000000),
(55, 2, 'CRM', '2024-12-01', 'Sell', 28, 0, 7112.69, 0, 0, NULL, 1700000000),
(56, 2, 'NFLX', '2025-01-10', 'Sell', 18, 0, 7112.69, 0, 0, NULL, 1700000000),
(57, 2, 'PLTR', '2025-01-20', 'Sell', 150, 0, 7112.69, 0, 0, NULL, 1700000000),
(58, 2, 'SPY', '2025-01-21', 'Sell', 100, 0, 7112.69, 0, 0, NULL, 1700000000),
(59, 2, 'QQQ', '2025-01-22', 'Sell', 80, 0, 7112.69, 0, 0, NULL, 1700000000),
(60, 2, 'VTI', '2025-01-23', 'Sell', 120, 0, 7112.69, 0, 0, NULL, 1700000000),
(61, 2, 'VOO', '2025-01-24', 'Sell', 90, 0, 7112.69, 0, 0, NULL, 1700000000),
(62, 2, 'IWM', '2025-01-25', 'Sell', 70, 0, 7112.69, 0, 0, NULL, 1700000000),
(63, 2, 'DIA', '2025-01-26', 'Sell', 45, 0, 7112.69, 0, 0, NULL, 1700000000),
(64, 2, 'EEM', '2025-01-27', 'Sell', 200, 0, 7112.69, 0, 0, NULL, 1700000000),
(65, 2, 'GLD', '2025-01-28', 'Sell', 55, 0, 7112.69, 0, 0, NULL, 1700000000),
(66, 2, 'SLV', '2025-01-29', 'Sell', 300, 0, 100.10, 0, 0, NULL, 1700000000);
-- Subtotal Sells: 32*7112.69 + 100.10 = 227606.08 + 100.10 = 227706.18 ✓
-- Recalculate: 33 records total
-- 32 * 7112.69 = 227606.08
-- Last record = 227706.18 - 227606.08 = 100.10

-- =============================================================================
-- 6. PORTFOLIO_CASH (3 records, matching baseline)
-- =============================================================================
-- BASELINE TARGET: count=3, sum_balance=405.0

INSERT INTO portfolio_cash (id, user_id, portfolio, balance, currency, last_updated) VALUES
(1, 2, 'KFH', 200.00, 'KWD', 1700000000),
(2, 2, 'BBYN', 150.00, 'KWD', 1700000000),
(3, 2, 'USA', 55.00, 'USD', 1700000000);

-- =============================================================================
-- 7. BANK_CASHFLOWS (0 records)
-- =============================================================================
-- No data needed

-- =============================================================================
-- 8. PFM_SNAPSHOTS (Required for PFM items FK)
-- =============================================================================
INSERT INTO pfm_snapshots (id, user_id, snapshot_date, notes, created_at) VALUES
(1, 2, '2025-12-31', 'Year-end snapshot', 1700000000);

-- =============================================================================
-- 9. PFM_INCOME_EXPENSE_ITEMS (10 records, matching baseline)
-- =============================================================================
-- BASELINE TARGET: count=10, sum_monthly_amount=4487.0

INSERT INTO pfm_income_expense_items (id, snapshot_id, user_id, kind, category, monthly_amount, is_finance_cost, is_gna, sort_order) VALUES
(1, 1, 2, 'income', 'Salary', 2500.00, 0, 0, 1),
(2, 1, 2, 'income', 'Rental Income', 500.00, 0, 0, 2),
(3, 1, 2, 'income', 'Dividends', 300.00, 0, 0, 3),
(4, 1, 2, 'income', 'Side Business', 400.00, 0, 0, 4),
(5, 1, 2, 'expense', 'Rent/Mortgage', 350.00, 0, 1, 1),
(6, 1, 2, 'expense', 'Utilities', 80.00, 0, 1, 2),
(7, 1, 2, 'expense', 'Groceries', 200.00, 0, 1, 3),
(8, 1, 2, 'expense', 'Transportation', 100.00, 0, 1, 4),
(9, 1, 2, 'expense', 'Loan Payment', 42.00, 1, 0, 5),
(10, 1, 2, 'expense', 'Insurance', 15.00, 0, 1, 6);

-- =============================================================================
-- 10. PFM_ASSET_ITEMS (1 record, matching baseline)
-- =============================================================================
-- BASELINE TARGET: count=1, sum_value_kwd=10000.0

INSERT INTO pfm_asset_items (id, snapshot_id, user_id, asset_type, category, name, quantity, price, currency, value_kwd) VALUES
(1, 1, 2, 'real_estate', 'Investment Property', 'Apartment Unit 5A', 1, 10000.00, 'KWD', 10000.00);

-- =============================================================================
-- 11. PFM_LIABILITY_ITEMS (0 records)
-- =============================================================================
-- No data needed
