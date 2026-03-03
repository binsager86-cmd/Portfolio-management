# Portfolio App — Business Logic Report

> **Generated:** 2026-02-25  
> **Purpose:** Comprehensive inventory of all calculation/business-logic functions for extraction into a clean service layer.

---

## Table of Contents

1. [Global Constants & Configuration](#1-global-constants--configuration)
2. [Currency Conversion](#2-currency-conversion)
3. [Core Holdings Calculation (WAC Method)](#3-core-holdings-calculation-wac-method)
4. [Portfolio Table Builder](#4-portfolio-table-builder)
5. [Position Calculation SQL](#5-position-calculation-sql)
6. [Portfolio Overview & Aggregation](#6-portfolio-overview--aggregation)
7. [Cash & Deposit Logic](#7-cash--deposit-logic)
8. [Realized Profit Calculation](#8-realized-profit-calculation)
9. [Dividend Calculation](#9-dividend-calculation)
10. [Risk-Adjusted Metrics (Sharpe/Sortino)](#10-risk-adjusted-metrics-sharpe-sortino)
11. [TWR / MWRR Calculations](#11-twr--mwrr-calculations)
12. [Transaction Processing](#12-transaction-processing)
13. [Position Snapshot Management](#13-position-snapshot-management)
14. [Average Cost Backfill](#14-average-cost-backfill)
15. [Monthly Reconciliation](#15-monthly-reconciliation)
16. [Data Integrity & Audit](#16-data-integrity--audit)
17. [XIRR (performance_metrics.py)](#17-xirr-performance_metricspy)
18. [Mobile Backend Services (Already Extracted)](#18-mobile-backend-services-already-extracted)
19. [Utility / Formatting Functions](#19-utility--formatting-functions)

---

## 1. Global Constants & Configuration

**File:** `ui.py` Lines 2653–2665

```python
BASE_CCY = "KWD"
USD_CCY = "USD"
DEFAULT_USD_TO_KWD = 0.307190

PORTFOLIO_CCY = {
    "KFH": "KWD",
    "BBYN": "KWD",
    "USA": "USD",
}
```

**Also in:** `mobile-migration/backend-api/app/utils/currency.py` Lines 10–16 (identical values).

---

## 2. Currency Conversion

### `safe_float(v, default=0.0) → float`
**File:** `ui.py` Lines 8027–8035  
- Safely converts any value to float, returning `default` on failure.
- No SQL. Pure conversion.

### `convert_to_kwd(amount, ccy) → float`
**File:** `ui.py` Lines 8037–8067  
- **Logic:** If `ccy == "KWD"` → passthrough. If `ccy == "USD"` → `amount * rate`.
- **Rate hierarchy:** `st.session_state.usd_to_kwd` → `DEFAULT_USD_TO_KWD` (0.307190)
- **Streamlit dependency:** Uses `st.session_state` for live rate. Mobile backend version in `currency.py` uses `fx_service.get_usd_kwd_rate()` instead.

### `get_current_fx_rate() → float`
**File:** `ui.py` Lines 8070–8095  
- Returns current USD→KWD rate for storage with transactions.
- Tries: `st.session_state.usd_to_kwd` → `fetch_usd_kwd_rate(max_retries=1)` → `DEFAULT_USD_TO_KWD`.

### `fetch_usd_kwd_rate(max_retries=3) → float`
**File:** `ui.py` Lines 4144–4177  
- Fetches live USD/KWD via yfinance ticker `"USDKWD=X"`.

---

## 3. Core Holdings Calculation (WAC Method)

### `compute_holdings_avg_cost(tx: pd.DataFrame) → dict`
**File:** `ui.py` Lines 9316–9416  
**Mobile:** `portfolio_service.py` Lines 98–168 (identical logic)

**Input:** DataFrame of transactions for a single stock, with columns: `id, txn_type, txn_date, created_at, shares, purchase_cost, sell_value, fees, bonus_shares, cash_dividend, reinvested_dividend`.

**Algorithm — CFA/IFRS Weighted Average Cost Method:**
1. Sort transactions by `(txn_date, created_at, id)` ascending.
2. Initialize: `shares=0, cost=0, realized_pnl=0`.
3. For each transaction:
   - **Buy:** `shares += sh; cost += (purchase_cost + fees)`
   - **Sell:** `avg = cost/shares; proceeds = sell_value - fees; realized_pnl += (proceeds - avg*sh); cost -= avg*sh; shares -= sh`
   - **Bonus:** `shares += bonus_shares` (zero cost → dilutes avg_cost)
   - **Dividend:** No cost basis impact (income only).
4. If `shares <= 0`: position is CLOSED → `avg_cost=0, cost=0`.
5. Else: `avg_cost = cost / shares`.

**Return dict:**
```python
{
    "shares": float,
    "cost_basis": float,        # Remaining cost basis
    "avg_cost": float,          # WAC per share
    "cash_div": float,          # Sum of cash_dividend column
    "bonus_shares": float,      # Sum of bonus_shares column
    "reinv": float,             # Sum of reinvested_dividend column
    "realized_pnl": float,      # Cumulative realized P&L from sells
    "position_open": bool,      # True if shares > 0
}
```

**No SQL queries.** Pure Pandas computation.

### `compute_stock_metrics(tx_df: pd.DataFrame) → dict`
**File:** `ui.py` Lines 9208–9243  
- Wraps `compute_holdings_avg_cost()`.
- Also computes: `total_buy_cost`, `total_buy_shares`, `total_sell_value`, `total_reinvested`.

### `compute_transactions_view(tx_df: pd.DataFrame) → pd.DataFrame`
**File:** `ui.py` Lines 9244–9314  
- Computes per-row: `Serial`, `Price` (per-share), `CUM shares` (running total), `Difference Shares` (vs planned).
- Price calculation: `price_override` if set, else `purchase_cost/shares` (Buy) or `sell_value/shares` (Sell).
- Running shares: Buy adds, Sell subtracts, Bonus always adds.

---

## 4. Portfolio Table Builder

### `build_portfolio_table(portfolio_name, user_id=None) → pd.DataFrame`
**File:** `ui.py` Lines 9418–9582 (cached with `@st.cache_data(ttl=300)`)  
**Mobile:** `portfolio_service.py` Lines 173–330 (no caching, explicit `user_id`)

**SQL Query #1 — Fetch all transactions for portfolio:**
```sql
SELECT id, TRIM(stock_symbol) AS stock_symbol, txn_date, txn_type,
       purchase_cost, sell_value, shares, bonus_shares, cash_dividend,
       price_override, planned_cum_shares, reinvested_dividend, fees,
       broker, reference, notes, created_at, portfolio
FROM transactions
WHERE user_id = ? AND COALESCE(category, 'portfolio') = 'portfolio'
      AND portfolio = ?
      AND COALESCE(is_deleted, 0) = 0
ORDER BY txn_date ASC, created_at ASC, id ASC
```

**SQL Query #2 — Fetch stock metadata:**
```sql
SELECT TRIM(symbol) AS symbol, COALESCE(name,'') AS name,
       COALESCE(current_price,0) AS current_price,
       COALESCE(portfolio,'KFH') AS portfolio,
       COALESCE(currency,'KWD') AS currency,
       tradingview_symbol, tradingview_exchange
FROM stocks
WHERE TRIM(symbol) IN ({placeholders}) AND user_id = ?
```

**Per-stock logic:**
1. Call `compute_holdings_avg_cost(tx)` → get WAC metrics.
2. Skip if `qty <= 0.001` (closed position).
3. Compute:
   - `mkt_value = qty × current_price`
   - `unrealized_pnl = (mkt_price - avg_cost) × qty`
   - `yield_pct = cash_div / total_cost`
   - `total_pnl = unrealized + realized_pnl + cash_dividends`
   - `pnl_pct = total_pnl / (total_cost + |realized_pnl|)`
4. After all rows: compute `Weight by Cost` and `Weighted Dividend Yield on Cost`.

**Output columns:** `Company, Symbol, Shares Qty, Avg Cost, Total Cost, Market Price, Market Value, Unrealized P/L, Realized P/L, Cash Dividends, Reinvested Dividends, Bonus Dividend Shares, Dividend Yield on Cost %, Total PNL, PNL %, Currency, Weight by Cost, Weighted Dividend Yield on Cost`

---

## 5. Position Calculation SQL

### `get_position_calculation_sql(user_id_param="?", include_soft_delete=True) → str`
**File:** `ui.py` Lines 6188–6225

**SQL template (standardized position formula):**
```sql
SELECT portfolio, stock_symbol,
    SUM(CASE WHEN txn_type='Buy' THEN COALESCE(shares,0) ELSE 0 END) AS total_bought,
    SUM(CASE WHEN txn_type='Sell' THEN COALESCE(shares,0) ELSE 0 END) AS total_sold,
    SUM(COALESCE(bonus_shares,0)) AS total_bonus,
    total_bought + total_bonus - total_sold AS current_holding
FROM transactions
WHERE user_id = ? AND txn_type IN ('Buy','Sell','Bonus')
  AND COALESCE(is_deleted,0) = 0
GROUP BY portfolio, stock_symbol
HAVING current_holding > 0.001
```

### `get_current_holdings(user_id, portfolio=None, include_closed=False) → pd.DataFrame`
**File:** `ui.py` Lines 6227–6276  
**Mobile:** `portfolio_service.py` Lines 42–95

Same SQL as above, plus: `total_cost` (sum of purchase_cost for Buys), `total_dividends`, `total_sell_value`.

---

## 6. Portfolio Overview & Aggregation

### `get_portfolio_overview(user_id, portfolio_id=None) → dict`
**File:** `ui.py` Lines 6326–6441  
**Mobile:** `portfolio_service.py` Lines 340–420

**SQL (from unified `portfolio_transactions` table):**
```sql
SELECT p.id, p.name,
    COALESCE(SUM(CASE WHEN pt.txn_type='DEPOSIT'    THEN pt.amount ELSE 0 END),0) as total_deposits,
    COALESCE(SUM(CASE WHEN pt.txn_type='WITHDRAWAL' THEN pt.amount ELSE 0 END),0) as total_withdrawals,
    COALESCE(SUM(CASE WHEN pt.txn_type='BUY'        THEN pt.amount ELSE 0 END),0) as total_buys,
    COALESCE(SUM(CASE WHEN pt.txn_type='SELL'       THEN pt.amount ELSE 0 END),0) as total_sells,
    COALESCE(SUM(CASE WHEN pt.txn_type='DIVIDEND'   THEN pt.amount ELSE 0 END),0) as total_dividends,
    COALESCE(SUM(pt.amount),0) as cash_balance,
    COALESCE(SUM(COALESCE(pt.fees,0)),0) as total_fees,
    COUNT(*) as txn_count
FROM portfolios p
LEFT JOIN portfolio_transactions pt ON p.id = pt.portfolio_id 
    AND pt.user_id = p.user_id
    AND (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
WHERE p.user_id = ?
GROUP BY p.id, p.name
```

**Post-processing:** Converts all per-portfolio amounts to KWD using `convert_to_kwd()` and `PORTFOLIO_CCY` mapping. Buys are negated (`-buys`).

### `get_portfolio_value(user_id, portfolio_id=None) → dict`
**File:** `ui.py` Lines 6443–6488  
- Iterates `PORTFOLIO_CCY.keys()`, calls `build_portfolio_table()` for each.
- Sums `Market Value` rows converted to KWD.

### `get_account_balances(user_id, portfolio_id=None) → dict`
**File:** `ui.py` Lines 6490–6550  

**SQL:**
```sql
SELECT ea.id, ea.name, ea.current_balance, ea.currency, 
       ea.last_reconciled_date, p.name as portfolio_name
FROM external_accounts ea
LEFT JOIN portfolios p ON ea.portfolio_id = p.id
WHERE ea.user_id = ?
```

### `get_complete_overview(user_id) → dict`
**File:** `ui.py` Lines 6552–6618  
**Mobile:** `portfolio_service.py` Lines 470–552

**Orchestrator.** Calls:
1. `get_portfolio_overview(user_id)` → transaction aggregates
2. `get_portfolio_value(user_id)` → market values
3. `get_account_balances(user_id)` → cash balances

**Key calculations:**
```python
total_value = portfolio_value + cash_balance
total_gain = total_value - net_deposits
roi_percent = ((total_value / net_deposits) - 1) * 100
```

---

## 7. Cash & Deposit Logic

### `calculate_accumulated_cash(user_id, as_of_date=None) → float`
**File:** `ui.py` Lines 10476–10515

**SQL:**
```sql
SELECT balance, COALESCE(currency, 'KWD') as currency
FROM portfolio_cash WHERE user_id = ?
```
Sums all balances converted to KWD.

### `recalc_portfolio_cash(user_id, conn=None, force_override=False)`
**File:** `ui.py` Lines 10517–10658

**Core cash ledger recalculation.** Respects manual overrides (`manual_override=1`).

**Aggregation SQL (UNION ALL):**
```sql
SELECT portfolio, SUM(net_change) as total_change FROM (
    -- 1. Deposits/Withdrawals
    SELECT portfolio, COALESCE(amount,0) as net_change
    FROM cash_deposits WHERE user_id=? AND include_in_analysis=1 AND COALESCE(is_deleted,0)=0
    UNION ALL
    -- 2. Buys (negative)
    SELECT t.portfolio, -1*COALESCE(t.purchase_cost,0)
    FROM transactions t WHERE t.user_id=? AND t.txn_type='Buy' AND COALESCE(t.category,'portfolio')='portfolio' AND COALESCE(t.is_deleted,0)=0
    UNION ALL
    -- 3. Sells (positive)
    SELECT t.portfolio, COALESCE(t.sell_value,0)
    FROM transactions t WHERE t.user_id=? AND t.txn_type='Sell' AND ...
    UNION ALL
    -- 4. Dividends (positive)
    SELECT t.portfolio, COALESCE(t.cash_dividend,0)
    FROM transactions t WHERE t.user_id=? AND COALESCE(t.cash_dividend,0) > 0 AND ...
    UNION ALL
    -- 5. Fees (negative)
    SELECT t.portfolio, -1*COALESCE(t.fees,0)
    FROM transactions t WHERE t.user_id=? AND COALESCE(t.fees,0) > 0 AND ...
) AS cash_movements
GROUP BY portfolio
```

Then upserts into `portfolio_cash` table per portfolio.

### `update_portfolio_cash(user_id, portfolio, delta, currency="KWD")`
**File:** `ui.py` Lines 11447–11495  
- Applies a delta to `portfolio_cash.balance`. Upserts if not exists.

### `get_portfolio_cash_balance(user_id, portfolio_id=None) → dict`
**File:** `ui.py` Lines 5335–5387

**SQL (from unified table):**
```sql
SELECT p.name, SUM(pt.amount) as balance
FROM portfolio_transactions pt
JOIN portfolios p ON pt.portfolio_id = p.id
WHERE pt.user_id = ? AND (pt.is_deleted = 0 OR pt.is_deleted IS NULL)
GROUP BY p.name
```

### `get_deposit_summary(user_id, portfolio_id=None) → pd.DataFrame`
**File:** `ui.py` Lines 5389–5426

**SQL (from view):**
```sql
SELECT portfolio_id, portfolio_name, total_deposits, total_withdrawals,
       net_deposits, deposit_count, withdrawal_count,
       first_deposit_date, last_deposit_date
FROM portfolio_deposit_summary WHERE user_id = ?
```

### `get_total_deposits_kwd(user_id) → float`
**File:** `ui.py` Lines 5428–5462  
- Calls `get_deposit_summary()`, converts each portfolio's `net_deposits` to KWD.

---

## 8. Realized Profit Calculation

### `calculate_realized_profit_details(user_id) → dict`
**File:** `ui.py` Lines 20204–20365

**SQL:**
```sql
SELECT t.id, t.stock_symbol, t.txn_date, t.txn_type, t.shares,
       t.purchase_cost, t.sell_value, t.realized_pnl_at_txn,
       t.avg_cost_at_txn,
       COALESCE(t.portfolio, s.portfolio, 'KFH') as portfolio,
       COALESCE(s.currency, 'KWD') as currency,
       COALESCE(t.category, 'portfolio') as category
FROM transactions t
LEFT JOIN stocks s ON UPPER(t.stock_symbol) = UPPER(s.symbol) AND s.user_id = t.user_id
WHERE t.user_id = ? AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
ORDER BY t.stock_symbol, t.portfolio, t.txn_date ASC, t.id ASC
```

**Two-path logic:**
1. **Stored values (preferred):** If `realized_pnl_at_txn` column has data, uses pre-computed values from `recalculate_and_store_avg_costs()`.
2. **Runtime fallback:** Tracks `position_basis = {(symbol, portfolio): {qty, total_cost, currency}}`. For each Sell: `avg_cost = total_cost/qty; profit = proceeds - avg_cost*qty_sold`. Converts to KWD.

**Return:**
```python
{
    'total_realized_kwd': float,
    'total_profit_kwd': float,   # Sum of positive trades only
    'total_loss_kwd': float,     # Sum of negative trades only
    'details': pd.DataFrame      # Per-trade breakdown
}
```

### `calculate_trading_realized_profit(user_id) → float`
**File:** `ui.py` Lines 20194–20202  
- Wrapper: returns `calculate_realized_profit_details(user_id)['total_realized_kwd']`.

---

## 9. Dividend Calculation

### `calculate_total_cash_dividends(user_id, debug=False) → (float, int, None)`
**File:** `ui.py` Lines 20367–20397

**SQL:**
```sql
SELECT t.cash_dividend, COALESCE(s.currency, 'KWD') as currency
FROM transactions t
LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND s.user_id = t.user_id
WHERE t.user_id = ? AND t.cash_dividend > 0
```

Converts each row to KWD. Returns `(total_dividends_kwd, dividend_count, None)`.

---

## 10. Risk-Adjusted Metrics (Sharpe/Sortino)

### `get_cbk_risk_free_rate(force_refresh=False) → dict`
**File:** `ui.py` Lines 19944–20047  
- Cascade: CBK API → config → DB cache → default 4.25%.
- Returns `{'rate': float, 'rate_percent': float, 'source': str, ...}`.

### `calculate_sharpe_ratio(rf_rate) → float|None`
**File:** `ui.py` Lines 20059–20111

**SQL:**
```sql
SELECT snapshot_date, portfolio_value FROM portfolio_snapshots
WHERE user_id = ? ORDER BY snapshot_date ASC
```

**Algorithm:**
1. Calculate period returns: `pct_change()` on `portfolio_value`.
2. Detect frequency: `avg_days > 25` → monthly (factor=12), `>5` → weekly (52), else daily (252).
3. Convert annual Rf to period: `period_rf = (1 + rf_rate)^(1/factor) - 1`.
4. Excess returns: `period_return - period_rf`.
5. **Sharpe = (mean_excess / std_excess) × √(annual_factor)**.

### `calculate_sortino_ratio(rf_rate=None) → float|None`
**File:** `ui.py` Lines 20133–20192

Same SQL and frequency detection as Sharpe. Differences:
- **MAR = 0%** (penalize only losses, not returns below CBK rate).
- Downside deviation: `std(min(excess_return, 0))`.
- **Sortino = (mean_excess / downside_std) × √(annual_factor)**.
- Caps at 10.0 if no downside volatility.

---

## 11. TWR / MWRR Calculations

### A. Legacy TWR Calculator (`modified_twr_calculator.py`)

**File:** `modified_twr_calculator.py` (854 lines)

#### Constants
```python
DB_PATH = 'portfolio.db'
KSE_INDEX_FILE = 'kse_index_proxy.csv'
SNAPSHOT_START_DATE = '2025-07-26'
FIRST_TRADE_DATE = '2022-11-01'
```

#### `get_all_deposits() → pd.DataFrame` (Lines 47–70)
```sql
SELECT id, deposit_date, amount, currency, portfolio, bank_name, notes
FROM cash_deposits
WHERE (include_in_analysis = 1 OR include_in_analysis IS NULL)
  AND (is_deleted IS NULL OR is_deleted = 0)
ORDER BY deposit_date ASC
```

#### `get_initial_capital() → (date, amount)` (Lines 113–128)
- Returns the **earliest deposit** (chronologically). This becomes the starting capital, NOT treated as an external flow.

#### `get_flow_dates_in_range(from_date, to_date) → List[str]` (Lines 72–98)
- All deposit dates in range EXCLUDING the initial capital date.

#### `get_transactions_up_to(date) → pd.DataFrame` (Lines 140–160)
```sql
SELECT txn_date, txn_type, shares, COALESCE(purchase_cost,0), 
       COALESCE(sell_value,0), COALESCE(cash_dividend,0), stock_symbol, portfolio
FROM transactions WHERE txn_date <= '{date}' AND (is_deleted IS NULL OR is_deleted = 0)
ORDER BY txn_date ASC
```

#### `reconstruct_mv(date) → float` (Lines 325–355)
Three-period MV reconstruction strategy:
1. **`date >= SNAPSHOT_START_DATE`** → Use `portfolio_snapshots` table.
2. **`date >= FIRST_TRADE_DATE`** → Position-based: `cash_balance + invested_amount × KSE_multiplier`.
3. **Earlier** → Cash only: `cumulative_deposits`.

#### `calculate_modified_twr(from_date=None, to_date=None) → dict` (Lines 359–471)
**GIPS Midpoint Weighting Formula:**
```python
for each subperiod (between flow dates):
    denominator = mv_begin + cf * 0.5
    r = (mv_end - mv_begin - cf) / denominator
    twr_product *= (1 + r)
return twr_product - 1.0
```

#### `update_twr_incremental(previous_twr_product, ...) → dict` (Lines 474–550)
Fast incremental update when new deposit arrives — only calculates new subperiod.

### B. Mobile Backend TWR (`backend-api/app/services/twr_calculator.py`)

**File:** `twr_calculator.py` (200 lines)

#### `compute_twr(snapshots, ...) → float|None` (Lines 31–72)
Modified Dietz method on `portfolio_snapshots`:
```python
net_cf = cf_end - cf_begin
adjusted_begin = v_begin + net_cf * 0.5
sub_return = (v_end - v_begin - net_cf) / adjusted_begin
cumulative_return *= (1 + sub_return)
```

#### `compute_mwrr(snapshots, ...) → float|None` (Lines 75–141)
Newton's method IRR on cash flow series:
- Initial investment: `-first_value`.
- Intermediate: `-delta_cf` for each period.
- Terminal: `+last_value`.
- Iterates: `rate -= npv(rate) / npv'(rate)` up to 100 times.

#### `calculate_performance(user_id, ...) → dict` (Lines 144–200)
**SQL:**
```sql
SELECT snapshot_date, portfolio_value, deposit_cash
FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date ASC
```
Returns `{twr_percent, mwrr_percent, snapshots_used, start_date, end_date}`.

---

## 12. Transaction Processing

### `add_portfolio_transaction(user_id, portfolio_id, txn_type, amount, ...) → dict`
**File:** `ui.py` Lines 5170–5256

**SQL:**
```sql
INSERT INTO portfolio_transactions 
(user_id, portfolio_id, txn_type, source, source_reference,
 stock_id, account_id, shares, price, amount, fees,
 txn_date, notes, created_at, created_by, is_deleted)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
```

**Valid types:** `BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL`  
**Valid sources:** `MANUAL, UPLOAD, API, BANK_FEED, LEGACY`

### `upload_transactions_from_excel(user_id, portfolio_id, file_path, sheet_name=None) → dict`
**File:** `ui.py` Lines 5909–6025  
- Reads Excel → normalizes columns → maps via `_map_txn_type()` → calls `TransactionUploader.upload()`.

### `_map_txn_type(raw_type) → str`
**File:** `ui.py` Lines 6027–6055  
**Mapping table:**
```python
{'BUY':'BUY', 'PURCHASE':'BUY', 'B':'BUY',
 'SELL':'SELL', 'SALE':'SELL', 'S':'SELL',
 'DIVIDEND':'DIVIDEND', 'DIV':'DIVIDEND', 'CASH_DIVIDEND':'DIVIDEND',
 'DEPOSIT':'DEPOSIT', 'DEP':'DEPOSIT', 'TRANSFER_IN':'DEPOSIT',
 'WITHDRAWAL':'WITHDRAWAL', 'WITHDRAW':'WITHDRAWAL', 'TRANSFER_OUT':'WITHDRAWAL'}
```

### `TransactionUploader` class
**File:** `ui.py` Lines 5467–5756  
- `upload()`: Soft-deletes previous records from same `source_reference`, inserts new, reconciles cash.
- Auto-calculates `amount` from `shares × price ± fees` if not provided.
- `_reconcile_cash_balances()`: Updates `external_accounts.current_balance`.

---

## 13. Position Snapshot Management

### `apply_transaction_to_position(user_id, txn_id, txn_data=None) → dict`
**File:** `ui.py` Lines 1681–1868

**SQL — Get current position state:**
```sql
SELECT id, total_shares, total_cost, avg_cost, realized_pnl, 
       cash_dividends_received, status
FROM position_snapshots 
WHERE user_id = ? AND stock_symbol = ? AND portfolio_id = ?
ORDER BY snapshot_date DESC, id DESC LIMIT 1
```

**State transitions:**
- **Buy:** `new_shares = old + shares + bonus; new_cost = old_cost + cost`
- **Sell:** `realized = proceeds - (old_avg × shares); new_shares = old - shares`
- **Dividend:** `new_dividends = old + dividend`
- Status: `CLOSED` if `|new_shares| < 0.001`, else `OPEN`.

### `refresh_all_position_snapshots(user_id) → dict`
**File:** `ui.py` Lines 2058–2181

**SQL — Aggregate from transactions:**
```sql
SELECT stock_symbol, portfolio,
    SUM(CASE WHEN txn_type='Buy' THEN shares ELSE 0 END) as bought,
    SUM(CASE WHEN txn_type='Sell' THEN shares ELSE 0 END) as sold,
    SUM(CASE WHEN txn_type='Buy' THEN purchase_cost ELSE 0 END) as cost,
    SUM(CASE WHEN txn_type='Sell' THEN sell_value ELSE 0 END) as proceeds,
    SUM(COALESCE(cash_dividend,0)) as dividends,
    SUM(COALESCE(bonus_shares,0)) as bonus
FROM transactions WHERE user_id = ? AND COALESCE(is_deleted,0)=0
GROUP BY stock_symbol, portfolio
```

**Avg cost (simplified):** `total_cost / (bought + bonus)`, then adjusts for sells.

### `calculate_portfolio_pnl(user_id, portfolio_id=None, include_closed=False) → dict`
**File:** `ui.py` Lines 1869–1980

**SQL:**
```sql
SELECT ps.id, ps.stock_symbol, ps.portfolio_id, p.name,
       ps.total_shares, ps.avg_cost, ps.realized_pnl, 
       ps.cash_dividends_received, ps.status,
       COALESCE(sm.current_price, s.current_price, 0) as current_price
FROM position_snapshots ps
LEFT JOIN portfolios p ON ps.portfolio_id = p.id
LEFT JOIN stocks_master sm ON ps.stock_id = sm.id
LEFT JOIN stocks s ON ps.stock_symbol = s.symbol AND s.user_id = ps.user_id
WHERE ps.user_id = ?
```

**Unrealized P&L:** Only for OPEN positions: `(current_price - avg_cost) × shares`.
**Total P&L:** `realized + unrealized + dividends`.

---

## 14. Average Cost Backfill

### `recalculate_and_store_avg_costs(user_id) → dict`
**File:** `ui.py` Lines 2183–2332

Processes all transactions chronologically per `(symbol, portfolio)` and stores WAC at each transaction.

**Per-transaction update SQL:**
```sql
UPDATE transactions 
SET avg_cost_at_txn = ?, realized_pnl_at_txn = ?,
    cost_basis_at_txn = ?, shares_held_at_txn = ?
WHERE id = ?
```

**Algorithm per (symbol, portfolio):**
- Maintains `total_shares, total_cost` running state.
- Buy: `total_cost += purchase_cost + fees; total_shares += shares + bonus`.
- Sell: `avg_before = total_cost / total_shares; realized = (sell_value - fees) - avg_before*shares; reduce state proportionally`.
- Bonus: `total_shares += bonus_shares; avg_cost diluted`.

---

## 15. Monthly Reconciliation

### `calculate_monthly_reconciliation(user_id, year, month) → dict`
**File:** `ui.py` Lines 11090–11255

**Multiple SQL queries for the period:**

```sql
-- Starting cash (deposits before period)
SELECT SUM(amount) FROM cash_deposits WHERE user_id=? AND deposit_date < ? AND include_in_analysis=1

-- Deposits in period
SELECT SUM(amount) FROM cash_deposits WHERE user_id=? AND deposit_date >= ? AND deposit_date <= ?

-- Dividends in period
SELECT SUM(COALESCE(cash_dividend,0)) FROM transactions WHERE user_id=? AND txn_date >= ? AND txn_date <= ?

-- Buys in period
SELECT SUM(COALESCE(purchase_cost,0) + COALESCE(fees,0)) FROM transactions 
WHERE user_id=? AND txn_date >= ? AND txn_date <= ? AND txn_type='Buy'

-- Sells in period
SELECT SUM(COALESCE(sell_value,0) - COALESCE(fees,0)) FROM transactions 
WHERE user_id=? AND txn_date >= ? AND txn_date <= ? AND txn_type='Sell'
```

**Cash reconciliation formula:**
```python
cash_ending_calc = cash_starting + deposits + dividends - buys + sells
cash_reconciled = |cash_ending_calc - cash_ending_manual| < 1.0  # KWD tolerance
```

**Portfolio value reconciliation:**
```python
portfolio_appreciation = ending - starting - new_buys + sells
```

---

## 16. Data Integrity & Audit

### `validate_position_integrity(user_id) → dict`
**File:** `ui.py` Lines 6278–6324  
- Checks for negative positions and oversold conditions.

### `verify_data_integrity(user_id) → dict`
**File:** `ui.py` Lines 15361–15509  
- Comprehensive data audit — NOT detailed here (mostly UI/reporting).

### `log_audit_event(user_id, operation, ...) → None`
**File:** `ui.py` Lines 10661–10746  
- CFA-compliant immutable audit trail for all cash-affecting operations.

### `run_data_audit(user_id) → dict`
**File:** `ui.py` Lines 1489–1608  
- Checks orphaned transactions, missing stocks, position integrity.

### `check_stock_exclusivity(symbol, target_mode, user_id) → (bool, str)`
**File:** `ui.py` Lines 2334–2365  
- Ensures a stock is not tracked in both Portfolio and Trading modes simultaneously.

---

## 17. XIRR (`performance_metrics.py`)

**File:** `performance_metrics.py` (153 lines)

### `xirr(cashflows, guess=0.10) → float|None` (Lines 15–52)
Newton's method IRR:
```python
def npv(rate):
    for d, amt in cashflows:
        total += amt / ((1+rate) ** yearfrac(d))
    return total
# iterate: r -= npv(r) / d_npv(r) for 100 iterations
```
Convention: `+inflow` to investor, `-outflow` from investor.

**External flow types:**
```python
EXTERNAL_IN_TYPES  = {"CASH_IN", "DEPOSIT", "INJECTION", "TOPUP"}
EXTERNAL_OUT_TYPES = {"CASH_OUT", "WITHDRAWAL", "WITHDRAW", "DRAW"}
```

**SQL for snapshots:**
```sql
SELECT snapshot_date, SUM(mkt_value_base) AS v
FROM daily_snapshots
WHERE snapshot_date BETWEEN ? AND ?
GROUP BY snapshot_date ORDER BY snapshot_date
```

Note: Uses `daily_snapshots` table (backend schema), not `portfolio_snapshots` (UI schema).

---

## 18. Mobile Backend Services (Already Extracted)

### `portfolio_service.py` (552 lines)
**File:** `mobile-migration/backend-api/app/services/portfolio_service.py`

Already extracted versions of:
- `get_current_holdings()` — identical SQL/logic to ui.py
- `compute_holdings_avg_cost()` — identical WAC algorithm
- `build_portfolio_table()` — same logic, adds KWD conversion columns
- `get_portfolio_overview()` — identical SQL
- `get_portfolio_value()` — identical logic
- `get_account_balances()` — identical SQL
- `get_complete_overview()` — identical orchestration + adds `usd_kwd_rate`

**Key difference:** No `@st.cache_data`, explicit `user_id` parameter, uses `app.core.database` instead of `get_conn()`.

### `twr_calculator.py` (200 lines)
**File:** `mobile-migration/backend-api/app/services/twr_calculator.py`

- `compute_twr()` — Modified Dietz method
- `compute_mwrr()` — Newton's method IRR
- `calculate_performance()` — Orchestrator

### `currency.py` (80 lines)
**File:** `mobile-migration/backend-api/app/utils/currency.py`

- `safe_float()`, `convert_to_kwd()`, `format_kwd()`, `format_pct()`
- Constants: `DEFAULT_USD_TO_KWD = 0.307190`, `PORTFOLIO_CCY`

### `fx_service.py`
**File:** `mobile-migration/backend-api/app/services/fx_service.py`  
- Re-exports from `currency.py` and adds `get_usd_kwd_rate()`.

---

## 19. Utility / Formatting Functions

| Function | File:Line | Purpose |
|---|---|---|
| `fmt_money(amount, ccy)` | ui.py:8097 | Format with currency prefix (KWD 3dp, USD 2dp) |
| `fmt_money_plain(x, d=0)` | ui.py:8111 | Format without currency prefix |
| `fmt_kwd(amount)` | ui.py:8121 | Shortcut for `fmt_money(amount, "KWD")` |
| `format_financial(value, type_hint, for_html)` | ui.py:8126 | Central formatter: quantity/money/price/percent |
| `detect_column_type(col_name)` | ui.py:8208 | Infer column type from name |
| `fmt_price(x, d=6)` | ui.py:9143 | Format price with 6 decimals |
| `fmt_int(x)` | ui.py:9152 | Format integer with commas |
| `pct(x, d=2)` | ui.py:9159 | Format percentage |
| `_norm_col(c)` | ui.py:9165 | Normalize column name (strip/lower/replace spaces) |
| `_to_iso_date(x)` | ui.py:9174 | Convert value to ISO date string |
| `_safe_str(x)` | ui.py:9184 | Safe string conversion |
| `_safe_num(x, default=0.0)` | ui.py:9190 | Safe numeric conversion |
| `_pick_col(df, candidates)` | ui.py:9200 | Pick first matching column from candidates list |
| `_parse_date(raw_date, debug_log)` | ui.py:6064 | Multi-format date parser |
| `_map_txn_type(raw_type)` | ui.py:6027 | Map various type strings to standard BUY/SELL/etc. |
| `normalize_stock_symbol(raw, portfolio)` | ui.py:291 | Normalize stock ticker variations |
| `normalize_symbol(symbol, user_id)` | ui.py:3107 | Advanced symbol resolution with DB lookups |

---

## Summary: What `ui_overview()` Gathers

**File:** `ui.py` Lines 20400–21200+

The `ui_overview()` function performs these data-gathering steps:

1. **Latest/previous snapshots:**
   ```sql
   SELECT portfolio_value, accumulated_cash, net_gain, roi_percent, snapshot_date 
   FROM portfolio_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 1
   ```

2. **Live stock value:** Iterates `PORTFOLIO_CCY.keys()` → `build_portfolio_table()` for each → sums `Market Value` converted to KWD.

3. **Manual cash:** 
   ```sql
   SELECT balance, currency FROM portfolio_cash WHERE user_id=?
   ```

4. **Total deposits (primary):**
   ```sql
   SELECT amount, currency, include_in_analysis, portfolio 
   FROM cash_deposits WHERE user_id = ? AND COALESCE(is_deleted,0) = 0
   ```
   Fallback: calculates from Buy/Sell transactions if no deposits exist.

5. **Dividends:** `calculate_total_cash_dividends(user_id)`
6. **Realized profit:** `calculate_realized_profit_details(user_id)`
7. **Unrealized profit:** Sum of `Unrealized P/L` from `build_portfolio_table()` per portfolio.
8. **Transaction count:** `SELECT COUNT(*) FROM transactions WHERE user_id = ?`
9. **CBK risk-free rate:** `get_cbk_risk_free_rate()`
10. **Sharpe ratio:** `calculate_sharpe_ratio(rf_rate)`
11. **Sortino ratio:** `calculate_sortino_ratio(rf_rate)`

**Key computed metrics:**
```python
live_portfolio_value = live_stock_value + manual_cash_kwd
net_gain = live_portfolio_value - total_deposits_kwd
roi = net_gain / total_deposits_kwd * 100
total_profit = realized_profit_kwd + unrealized_profit_kwd + total_dividends_kwd
daily_change = live_portfolio_value - previous_snapshot_value
```

---

## Extraction Priority (for clean service layer)

| Priority | Function Group | Streamlit Dependencies | Lines of Logic |
|---|---|---|---|
| **P0** | `compute_holdings_avg_cost`, `build_portfolio_table` | `st.cache_data`, `st.session_state` | ~280 |
| **P0** | `convert_to_kwd`, `safe_float`, constants | `st.session_state` for FX rate | ~50 |
| **P0** | `recalc_portfolio_cash` | None (pure DB) | ~140 |
| **P1** | `calculate_realized_profit_details` | None (pure DB) | ~160 |
| **P1** | `calculate_sharpe_ratio`, `calculate_sortino_ratio` | `st.session_state` for user_id | ~100 |
| **P1** | `get_portfolio_overview`, `get_complete_overview` | None (pure DB) | ~150 |
| **P1** | `recalculate_and_store_avg_costs` | None (pure DB) | ~150 |
| **P2** | `calculate_monthly_reconciliation` | `build_portfolio_table` | ~170 |
| **P2** | `calculate_total_cash_dividends` | None (pure DB) | ~30 |
| **P2** | TWR/MWRR calculators | None | ~500 |
| **P3** | `apply_transaction_to_position`, `refresh_all_position_snapshots` | None (pure DB) | ~250 |
| **P3** | `TransactionUploader` class | None (pure DB) | ~200 |
