<!-- Guidance for AI coding agents working on this repo -->
# Copilot / Agent Instructions — Portfolio App

## Purpose
Help AI agents and contributors quickly understand repo layout, runtime commands, DB conventions, and safe change boundaries.

## Big Picture / Architecture
- **Two overlapping data models:**
  - **Streamlit UI (`ui.py`):** Uses SQLite tables `stocks`, `transactions`, `cash_deposits`. Created via `init_db()` and upgraded additively with `add_column_if_missing()`.
  - **General accounting backend:** Defined in `setup_db.py` and related scripts (`assets`, `ledger_entries`, `prices`, `daily_snapshots`). Used by price/snapshot/report scripts.
- **Shared DB file:** Both models use `portfolio.db` in repo root. Always confirm which schema a script expects before changing DB or data.

## Key Files & Entry Points
- **UI:** `ui.py` (Streamlit app, user flows)
- **Launcher:** `app.py` (calls `streamlit run ui.py`)
- **DB bootstrap:** `setup_db.py` (creates backend tables)
- **Price updaters:** `auto_update_prices.py`, `auto_update_us_prices.py` (API calls, e.g., CoinGecko)
- **Snapshots/Reports:** `daily_snapshot.py`, `portfolio_report.py`, `export_excel_report.py`

## Developer Workflows
- **Run UI:** `streamlit run ui.py` or `python app.py`
- **Init backend DB:** `python setup_db.py`
- **Update prices:** `python auto_update_prices.py`
- **Reset DB:** Stop app, remove `portfolio.db`, rerun initializers

## Project-Specific Conventions
- **DB:**
  - Dates: ISO strings (`YYYY-MM-DD`); timestamps: `int(time.time())` as `created_at`
  - Additive migrations only (use `add_column_if_missing()`)
- **Portfolios:** `KFH`, `BBYN`, `USA` (see `build_portfolio_table()` in `ui.py`)
- **Currency:** Defaults: `KWD`, `USD`

## Data Import / Format
- **Excel upload:** `ui_upload_transactions_excel()` expects sheet `Transactions` (or first sheet), normalizes columns via `_norm_col()`
- **Required columns:** `company`, `txn_date`, `txn_type`, `shares` (flexibly detected)
- **Buy/Sell:** Buys need `purchase_cost`, Sells need `sell_value`. Optional: `bonus_shares`, `cash_dividend`, `reinvested_dividend`, `fees`, `broker`, `reference`, `notes`, `price_override`, `planned_cum_shares`

## Patterns & Editing Conventions
- **UI functions:** Prefixed `ui_` (e.g., `ui_cash_deposits()`)
- **Finance logic:** Pure-Pandas helpers in `ui.py` (e.g., `compute_holdings_avg_cost`)
- **Network calls:** Explicit source, timeouts, error handling (see `auto_update_prices.py`)
- **DB changes:** Use additive migration pattern, document in `ui.py` or a migration script

## Integration Notes
- **Two schemas:** Changing one may not affect scripts using the other
- **SQLite:** `check_same_thread=False` in `ui.py`; Streamlit is single-process, but beware concurrent writes
- **DB file:** `portfolio.db` in repo root; treat as local state, back up before migrations

## Examples & References
- **UI + DB helpers:** `ui.py`
- **Backend schema + updaters:** `setup_db.py`, `auto_update_prices.py`
- **Reporting:** `daily_snapshot.py`, `portfolio_report.py`, `export_excel_report.py`

---
If any section is unclear or missing, request expansion (e.g., Excel import mapping, DB migration plan, Streamlit UI flows).
