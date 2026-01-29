# Financial Calculation Queries - Complete Extraction

**Purpose:** Complete audit of all SQL SELECT queries performing financial calculations.  
**Date Generated:** 2025-01-08  
**Source Files:** ui.py, portfolio_report.py, portfolio_report_kwd.py, performance_metrics.py, daily_snapshot.py, export_excel_report.py, debug_irr.py, debug_data.py, check_snapshots.py, auto_price_scheduler.py, bank_deposits.py

---

## 1. Net Shares Calculations (CFA Violation Check)

### 1.1 Portfolio Net Shares Check
**File:** [ui.py](../ui.py#L81-L84)  
**Purpose:** Check if stock has holdings in portfolio section (CFA compliance)
```sql
SELECT COALESCE(SUM(CASE WHEN txn_type = 'Buy' THEN shares ELSE 0 END) - 
                SUM(CASE WHEN txn_type = 'Sell' THEN shares ELSE 0 END), 0) as net_shares
FROM transactions WHERE stock_symbol = ? AND user_id = ?
```

### 1.2 Trading Net Shares Check
**File:** [ui.py](../ui.py#L88-L91)  
**Purpose:** Check if stock has open positions in trading section
```sql
SELECT COALESCE(SUM(CASE WHEN txn_type = 'Buy' THEN shares ELSE 0 END) - 
                SUM(CASE WHEN txn_type = 'Sell' THEN shares ELSE 0 END), 0) as net_shares
FROM trading_history WHERE stock_symbol = ? AND user_id = ?
```

---

## 2. Cash Deposit Aggregations

### 2.1 Total Deposits for Portfolio Analysis
**File:** [ui.py](../ui.py#L2912-L2913)  
**Purpose:** Get total deposits (include_in_analysis flag respected)
```sql
SELECT SUM(amount) as total FROM cash_deposits WHERE user_id = ? AND include_in_analysis = 1
```

### 2.2 Total Deposits by Portfolio
**File:** [ui.py](../ui.py#L7041-L7042)  
**Purpose:** Total deposited per portfolio for cash management
```sql
SELECT SUM(amount) FROM cash_deposits WHERE portfolio=? AND user_id=?
```

### 2.3 Deposits for Specific Date
**File:** [auto_price_scheduler.py](../auto_price_scheduler.py#L332-L336)  
**Purpose:** Get total deposits for snapshot date
```sql
SELECT COALESCE(SUM(amount), 0) as total
FROM cash_deposits 
WHERE user_id = ? AND deposit_date = ? AND include_in_analysis = 1
```

### 2.4 Cash Deposits for MWRR (IRR)
**File:** [ui.py](../ui.py#L11232-L11241), [debug_irr.py](../debug_irr.py#L23-L31)  
**Purpose:** Deposits for MWRR calculation (excludes 1970 placeholder dates)
```sql
SELECT deposit_date as date, 
       amount, 
       'DEPOSIT' as type 
FROM cash_deposits 
WHERE deposit_date IS NOT NULL
AND amount > 0
AND deposit_date > '1971-01-01'
AND user_id = ?
```

---

## 3. Snapshot Queries

### 3.1 Latest Portfolio Snapshot
**File:** [ui.py](../ui.py#L10741-L10743)  
**Purpose:** Get most recent portfolio valuation
```sql
SELECT portfolio_value, accumulated_cash, net_gain, roi_percent, snapshot_date 
FROM portfolio_snapshots 
WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 1
```

### 3.2 Previous Day Snapshot
**File:** [ui.py](../ui.py#L10747-L10749)  
**Purpose:** Daily movement calculation
```sql
SELECT portfolio_value, snapshot_date 
FROM portfolio_snapshots 
WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 1 OFFSET 1
```

### 3.3 First Snapshot (Baseline)
**File:** [ui.py](../ui.py#L7605-L7607), [daily_snapshot.py](../daily_snapshot.py#L478-L481)  
**Purpose:** Baseline value for beginning_difference calculation
```sql
SELECT portfolio_value FROM portfolio_snapshots 
WHERE user_id = ? ORDER BY snapshot_date ASC LIMIT 1
```

### 3.4 Previous Accumulated Cash
**File:** [ui.py](../ui.py#L2945-L2948), [daily_snapshot.py](../daily_snapshot.py#L507-L510)  
**Purpose:** Carry-forward accumulated cash from previous snapshot
```sql
SELECT accumulated_cash FROM portfolio_snapshots 
WHERE snapshot_date < ? AND user_id = ? 
ORDER BY snapshot_date DESC LIMIT 1
```

### 3.5 Previous Snapshot Value
**File:** [ui.py](../ui.py#L2945-L2948)  
**Purpose:** Get previous portfolio value for daily movement
```sql
SELECT portfolio_value, accumulated_cash 
FROM portfolio_snapshots 
WHERE snapshot_date < ? AND user_id = ? 
ORDER BY snapshot_date DESC LIMIT 1
```

### 3.6 Existing Snapshot Check
**File:** [ui.py](../ui.py#L2900-L2901)  
**Purpose:** Check if snapshot exists for upsert logic
```sql
SELECT * FROM portfolio_snapshots WHERE snapshot_date = ? AND user_id = ?
```

### 3.7 Snapshot History for Sharpe/Sortino
**File:** [ui.py](../ui.py#L10486-L10487)  
**Purpose:** Historical values for risk-adjusted return calculations
```sql
SELECT snapshot_date, portfolio_value 
FROM portfolio_snapshots 
WHERE user_id = ? ORDER BY snapshot_date ASC
```

### 3.8 Snapshot History for MWRR
**File:** [ui.py](../ui.py#L11215-L11218), [debug_irr.py](../debug_irr.py#L11-L16)  
**Purpose:** Portfolio history with accumulated cash
```sql
SELECT snapshot_date as date, portfolio_value as balance, accumulated_cash 
FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date
```

---

## 4. Dividend Calculations

### 4.1 Total Cash Dividends (Portfolio)
**File:** [ui.py](../ui.py#L10710-L10720)  
**Purpose:** Total cash dividends from portfolio transactions
```sql
SELECT 
    t.cash_dividend,
    COALESCE(s.currency, 'KWD') as currency
FROM transactions t
LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND s.user_id = t.user_id
WHERE t.user_id = ? 
  AND t.cash_dividend > 0
```

### 4.2 Cash Dividends Only for MWRR
**File:** [ui.py](../ui.py#L11245-L11255), [debug_irr.py](../debug_irr.py#L34-L42)  
**Purpose:** Non-reinvested dividends for IRR (excludes reinvested)
```sql
SELECT txn_date as date, 
       COALESCE(cash_dividend, 0) as amount, 
       'DIVIDEND' as type 
FROM transactions 
WHERE COALESCE(cash_dividend, 0) > 0
AND txn_date IS NOT NULL
AND txn_date > '1971-01-01'
AND user_id = ?
```

### 4.3 Trading Dividends Total
**File:** [ui.py](../ui.py#L14548-L14550)  
**Purpose:** Sum of dividends from trading section
```sql
SELECT SUM(cash_dividend) as div_total FROM trading_history WHERE user_id = ?
```

---

## 5. Withdrawal Queries

### 5.1 All Withdrawals for MWRR
**File:** [ui.py](../ui.py#L7641-L7645), [ui.py](../ui.py#L11290-L11299)  
**Purpose:** Withdrawals for cash flow calculations
```sql
SELECT sell_value, COALESCE(s.currency, 'KWD') as currency 
FROM transactions t 
LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND s.user_id = t.user_id 
WHERE t.user_id = ? AND (t.txn_type = 'Withdrawal' OR t.category = 'FLOW_OUT')
```

### 5.2 Withdrawals for TWR (with txn_date)
**File:** [ui.py](../ui.py#L11290-L11299)  
**Purpose:** Withdrawals with dates for time-weighted return
```sql
SELECT txn_date, sell_value, 'WITHDRAWAL' as type
FROM transactions
WHERE (txn_type = 'Withdrawal' OR category = 'FLOW_OUT')
AND user_id = ?
```

---

## 6. Ledger Deposit/Withdrawal Detection

### 6.1 Additional Deposits from Transactions
**File:** [ui.py](../ui.py#L11309-L11318)  
**Purpose:** Deposits recorded in transactions table
```sql
SELECT txn_date, purchase_cost, 'DEPOSIT' as type
FROM transactions
WHERE (txn_type = 'Deposit' OR category = 'FLOW_IN')
AND user_id = ?
```

---

## 7. Portfolio Cash Balance

### 7.1 Manual Cash Balance
**File:** [ui.py](../ui.py#L7050-L7051), [ui.py](../ui.py#L10766-L10767)  
**Purpose:** Get manual cash balance for total portfolio value
```sql
SELECT balance, currency FROM portfolio_cash WHERE user_id=?
```

### 7.2 Manual Cash by Portfolio
**File:** [ui.py](../ui.py#L7047-L7048)  
**Purpose:** Get manual cash balance for specific portfolio
```sql
SELECT balance FROM portfolio_cash WHERE portfolio=? AND user_id=?
```

---

## 8. Transaction Counts

### 8.1 Total Transaction Count
**File:** [ui.py](../ui.py#L10868-L10869)  
**Purpose:** Total transactions for user overview
```sql
SELECT COUNT(*) as count FROM transactions WHERE user_id = ?
```

---

## 9. Realized Profit Calculations

### 9.1 Portfolio Sell Transactions
**File:** [ui.py](../ui.py#L14518-L14527)  
**Purpose:** Realized profit from portfolio sells
```sql
SELECT stock_symbol, txn_date, shares, purchase_cost, sell_value,
       (sell_value - purchase_cost) as profit
FROM transactions 
WHERE user_id = ? AND txn_type = 'Sell' AND sell_value > 0
ORDER BY txn_date DESC
```

### 9.2 Trading History Full Query
**File:** [ui.py](../ui.py#L10625-L10637)  
**Purpose:** FIFO profit calculation from trading section
```sql
SELECT 
    t.id,
    t.stock_symbol,
    t.txn_date,
    t.txn_type,
    t.shares,
    t.purchase_cost,
    t.sell_value
FROM trading_history t
WHERE t.user_id = ?
ORDER BY t.txn_date, t.stock_symbol, t.txn_type
```

### 9.3 Trading Buys by Stock (debug)
**File:** [debug_data.py](../debug_data.py#L16-L18)  
**Purpose:** Debug trading position buys
```sql
SELECT stock_symbol, SUM(shares) as total_shares, SUM(purchase_cost) as total_cost
FROM trading_history WHERE txn_type = 'Buy' GROUP BY stock_symbol
```

### 9.4 Trading Sells by Stock (debug)
**File:** [debug_data.py](../debug_data.py#L22-L24)  
**Purpose:** Debug trading position sells
```sql
SELECT stock_symbol, SUM(shares) as total_shares, SUM(sell_value) as total_value
FROM trading_history WHERE txn_type = 'Sell' GROUP BY stock_symbol
```

### 9.5 Open Trading Positions
**File:** [ui.py](../ui.py#L14564-L14579)  
**Purpose:** Identify open (not yet sold) positions
```sql
SELECT stock_symbol, SUM(shares) as total_shares, SUM(purchase_cost) as total_cost
FROM trading_history 
WHERE user_id = ? AND txn_type = 'Buy'
GROUP BY stock_symbol
```

```sql
SELECT stock_symbol, SUM(shares) as total_shares
FROM trading_history 
WHERE user_id = ? AND txn_type = 'Sell'
GROUP BY stock_symbol
```

---

## 10. Ledger-Based Reports (Backend Schema)

### 10.1 Cash Balances by Currency
**File:** [portfolio_report.py](../portfolio_report.py#L11-L14), [portfolio_report_kwd.py](../portfolio_report_kwd.py#L46-L49)  
**Purpose:** Cash balances from ledger entries
```sql
SELECT currency, ROUND(SUM(cash_amount), 2) AS cash_balance
FROM ledger_entries
GROUP BY currency
ORDER BY currency
```

### 10.2 Holdings Quantity (Ledger)
**File:** [portfolio_report.py](../portfolio_report.py#L18-L38), [portfolio_report_kwd.py](../portfolio_report_kwd.py#L52-L69)  
**Purpose:** Net holdings from buy/sell/bonus ledger entries
```sql
SELECT
    a.symbol,
    a.asset_type,
    a.exchange,
    a.currency,
    ROUND(SUM(
        CASE
            WHEN le.entry_type = 'BUY' THEN le.quantity
            WHEN le.entry_type = 'BONUS_SHARES' THEN le.quantity
            WHEN le.entry_type = 'SELL' THEN -le.quantity
            ELSE 0
        END
    ), 6) AS quantity
FROM ledger_entries le
JOIN assets a ON a.asset_id = le.asset_id
GROUP BY a.symbol, a.asset_type, a.exchange, a.currency
HAVING ABS(quantity) > 0.0000001
ORDER BY a.asset_type, a.symbol
```

### 10.3 Average Cost Including Bonus (Ledger)
**File:** [portfolio_report.py](../portfolio_report.py#L41-L52), [portfolio_report_kwd.py](../portfolio_report_kwd.py#L72-L81)  
**Purpose:** Average cost per share including bonus shares
```sql
SELECT
    a.symbol,
    ROUND(
        SUM(CASE WHEN le.entry_type='BUY' THEN le.quantity * le.price ELSE 0 END)
        /
        NULLIF(SUM(CASE WHEN le.entry_type IN ('BUY','BONUS_SHARES') THEN le.quantity ELSE 0 END), 0),
    4) AS avg_cost_including_bonus
FROM ledger_entries le
JOIN assets a ON a.asset_id = le.asset_id
GROUP BY a.symbol
ORDER BY a.symbol
```

---

## 11. Performance Metrics (Backend Schema)

### 11.1 Portfolio Value Series
**File:** [performance_metrics.py](../performance_metrics.py#L69-L74)  
**Purpose:** Daily portfolio values for TWR calculation
```sql
SELECT snapshot_date, SUM(mkt_value_base) AS v
FROM daily_snapshots
WHERE snapshot_date BETWEEN ? AND ?
GROUP BY snapshot_date
ORDER BY snapshot_date;
```

### 11.2 External Cash Flows
**File:** [performance_metrics.py](../performance_metrics.py#L88-L95)  
**Purpose:** Cash flows for XIRR calculation
```sql
SELECT DATE(entry_datetime) AS d, UPPER(TRIM(entry_type)) AS t, cash_amount AS amt
FROM ledger_entries
WHERE DATE(entry_datetime) BETWEEN ? AND ?
  AND cash_amount IS NOT NULL
ORDER BY DATE(entry_datetime);
```

---

## 12. Daily Snapshot Backend Queries

### 12.1 Snapshot Row Count
**File:** [check_snapshots.py](../check_snapshots.py#L11-L14)  
**Purpose:** Verify snapshot exists for date
```sql
SELECT COUNT(*) AS n FROM daily_snapshots WHERE snapshot_date=?
```

### 12.2 Top Holdings by Value
**File:** [check_snapshots.py](../check_snapshots.py#L16-L23)  
**Purpose:** Review top holdings in snapshot
```sql
SELECT snapshot_date, asset_id, quantity, avg_cost, mkt_price, mkt_value, currency, fx_to_base, mkt_value_base, pnl_base
FROM daily_snapshots
WHERE snapshot_date=?
ORDER BY mkt_value_base DESC
LIMIT 10
```

---

## 13. Export Report Queries

### 13.1 Holdings from Snapshots
**File:** [export_excel_report.py](../export_excel_report.py#L380-L395)  
**Purpose:** Holdings for Excel export
```sql
SELECT 
  ds.asset_id,
  a.symbol,
  a.asset_type,
  a.exchange,
  ds.quantity,
  ds.avg_cost,
  ds.mkt_price,
  ds.currency,
  ds.fx_to_base,
  ds.cost_value_base,
  ds.mkt_value_base,
  ds.pnl_base
FROM daily_snapshots ds
LEFT JOIN assets a ON a.asset_id = ds.asset_id
WHERE ds.snapshot_date = ?
ORDER BY ds.mkt_value_base DESC;
```

### 13.2 Portfolio Value Series for Chart
**File:** [export_excel_report.py](../export_excel_report.py#L399-L405)  
**Purpose:** Portfolio value time series
```sql
SELECT snapshot_date, SUM(mkt_value_base) AS portfolio_value_base
FROM daily_snapshots
WHERE snapshot_date BETWEEN ? AND ?
GROUP BY snapshot_date
ORDER BY snapshot_date;
```

---

## 14. PFM (Personal Financial Management) Queries

### 14.1 Asset Summary by Type
**File:** [ui.py](../ui.py#L13666-L13671)  
**Purpose:** PFM balance sheet assets
```sql
SELECT asset_type, SUM(value_kwd) FROM pfm_asset_items
WHERE snapshot_id = ?
GROUP BY asset_type
```

### 14.2 Liability Summary (Current vs Long-term)
**File:** [ui.py](../ui.py#L13675-L13680)  
**Purpose:** PFM balance sheet liabilities
```sql
SELECT SUM(CASE WHEN is_current = 1 THEN amount_kwd ELSE 0 END),
       SUM(CASE WHEN is_long_term = 1 THEN amount_kwd ELSE 0 END)
FROM pfm_liability_items
WHERE snapshot_id = ?
```

### 14.3 Income/Expense by Kind
**File:** [ui.py](../ui.py#L13776-L13782)  
**Purpose:** PFM profit & loss summary
```sql
SELECT kind, SUM(monthly_amount) FROM pfm_income_expense_items
WHERE snapshot_id = ?
GROUP BY kind
```

### 14.4 PFM Assets Detail
**File:** [ui.py](../ui.py#L13784-L13789)  
**Purpose:** Asset breakdown for PFM reports
```sql
SELECT asset_type, SUM(value_kwd) FROM pfm_asset_items
WHERE snapshot_id = ?
GROUP BY asset_type
```

### 14.5 PFM Liabilities Detail
**File:** [ui.py](../ui.py#L13792-L13799)  
**Purpose:** Liability breakdown for PFM reports
```sql
SELECT SUM(CASE WHEN is_current = 1 THEN amount_kwd ELSE 0 END),
       SUM(CASE WHEN is_long_term = 1 THEN amount_kwd ELSE 0 END),
       SUM(amount_kwd)
FROM pfm_liability_items
WHERE snapshot_id = ?
```

---

## 15. FX Rate Queries

### 15.1 FX Rate Lookup
**File:** [portfolio_report_kwd.py](../portfolio_report_kwd.py#L15-L30)  
**Purpose:** Get exchange rate for currency conversion
```sql
SELECT rate
FROM fx_rates
WHERE rate_date = ? AND from_ccy = ? AND to_ccy = ?
```

```sql
SELECT rate
FROM fx_rates
WHERE from_ccy = ? AND to_ccy = ?
ORDER BY rate_date DESC
LIMIT 1
```

---

## 16. Bank Deposits Queries

### 16.1 Bank Totals by User
**File:** [bank_deposits.py](../bank_deposits.py#L58-L59)  
**Purpose:** Bank balance totals
```sql
SELECT bank_name, bank_total FROM bank_totals WHERE user_id = ?
```

```sql
SELECT ROUND(SUM(amount), 3) FROM bank_cashflows WHERE user_id = ?
```

### 16.2 Bank Transaction List
**File:** [bank_deposits.py](../bank_deposits.py#L74-L80)  
**Purpose:** List bank deposits with filter
```sql
SELECT txn_date, bank_name, amount, COALESCE(description,''), COALESCE(comments,'')
FROM bank_cashflows
WHERE user_id = ?
ORDER BY txn_date DESC, bank_txn_id DESC
LIMIT ?
```

---

## 17. User ID Assignment (Data Fix)

### 17.1 Find Main User by Transaction Count
**File:** [ui.py](../ui.py#L1676-L1682)  
**Purpose:** Identify main user for legacy data migration
```sql
SELECT user_id, COUNT(*) as cnt 
FROM transactions 
WHERE user_id > 1 
GROUP BY user_id 
ORDER BY cnt DESC 
LIMIT 1
```

---

## Formula Reference

### Key Calculation Formulas (from code)

1. **Net Gain:** `net_gain = beginning_difference - accumulated_cash`
2. **ROI %:** `roi_percent = (net_gain / net_invested_capital) * 100`
3. **Net Invested Capital:** `total_deposits_kwd - total_withdrawals_kwd`
4. **Beginning Difference:** `current_portfolio_value - first_snapshot_value`
5. **Daily Movement:** `current_portfolio_value - previous_portfolio_value`
6. **Change %:** `((current_value - previous_value) / previous_value) * 100`
7. **Average Cost:** `total_buy_cost / current_shares` (includes bonus shares in denominator)
8. **Trading Realized Profit:** FIFO matching of Buy→Sell pairs

---

## Notes

- All queries extracted EXACTLY as they appear in source code
- No modifications, optimizations, or corrections applied
- Placeholder `?` indicates parameterized queries for security
- Some queries use `convert_sql_placeholders()` for PostgreSQL compatibility
- Currency conversion uses `convert_to_kwd()` function after query execution
