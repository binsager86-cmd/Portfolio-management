<!-- Guidance for AI coding agents working on this repo -->
# Copilot / Agent Instructions — Portfolio App

- **Purpose:** Help contributors and AI agents quickly understand the repo layout, runtime commands, DB conventions, and where to make safe changes.

- **Big picture / architecture**
  - There are two overlapping data models in this repo:
    - The Streamlit UI (`ui.py`) uses a simple SQLite schema: `stocks`, `transactions`, and `cash_deposits`. `ui.py::init_db()` creates these tables and uses `add_column_if_missing()` to perform additive, safe upgrades.
    - A more general accounting model exists in `setup_db.py` and related scripts (`assets`, `ledger_entries`, `prices`, `daily_snapshots`). Scripts such as `auto_update_prices.py` and `daily_snapshot.py` operate against this schema.
  - Both sets of scripts share the same `portfolio.db` file by default. Before changing schema or data, confirm which schema a script expects.

- **Key files / entry points**
  - UI: `ui.py` — Streamlit application and most user-facing flows (transactions, Excel upload, portfolio views).
  - Launcher: `app.py` — calls `streamlit run ui.py`.
  - DB bootstrap (alternate schema): `setup_db.py` — creates `assets`, `ledger_entries`, `prices`, `daily_snapshots`.
  - Price/updater scripts: `auto_update_prices.py`, `auto_update_us_prices.py` — external API calls (CoinGecko shown as example).
  - Snapshots & reports: `daily_snapshot.py`, `portfolio_report.py`, `export_excel_report.py`.

- **Run / dev workflows (examples)**
  - Run UI locally: `streamlit run ui.py` (or `python app.py`).
  - Initialize the alternate DB schema: `python setup_db.py`.
  - Run price updater: `python auto_update_prices.py`.
  - Reset DB for testing: stop app, remove `portfolio.db` (or back it up) and re-run the initializer(s).

- **Database conventions (project-specific)**
  - Date fields are ISO strings (YYYY-MM-DD) in both UI and backend schemas; timestamps for record creation use `int(time.time())` as `created_at` (epoch seconds).
  - `ui.py` uses additive migrations via `add_column_if_missing(table, col, coltype)` — prefer adding columns rather than altering or dropping existing ones.
  - Currency & portfolio conventions in `ui.py`:
    - Portfolios: `KFH`, `BBYN`, `USA` (see `ui.py` `build_portfolio_table()` and selectbox values).
    - Currency defaults: `KWD` and `USD`.

- **Data import / format expectations**
  - Excel upload (transactions) in `ui_upload_transactions_excel()` expects a sheet named `Transactions` (or the first sheet) and normalizes column names with `_norm_col()`.
  - Required columns (detected flexibly via `_pick_col()`): `company`, `txn_date`, `txn_type`, `shares`.
  - For Buys include `purchase_cost`; for Sells include `sell_value`. Optional columns supported: `bonus_shares`, `cash_dividend`, `reinvested_dividend`, `fees`, `broker`, `reference`, `notes`, `price_override`, `planned_cum_shares`.

- **Patterns & conventions to follow when editing code**
  - UI functions are grouped and prefixed `ui_` (e.g., `ui_cash_deposits()`, `ui_transactions()`). Keep UI-only changes inside `ui.py` unless you intend to change the DB or backend behavior.
  - Finance calculations are pure-Pandas helper functions inside `ui.py` (e.g., `compute_holdings_avg_cost`, `compute_transactions_view`). Unit-change these carefully and add sample inputs when altering logic.
  - When adding DB columns, prefer using `add_column_if_missing()` pattern so existing DB files remain compatible.
  - Network calls include explicit sources (e.g., CoinGecko) and should use timeouts and error handling. See `auto_update_prices.py` for examples.

- **Integration notes & gotchas**
  - There are two active schemas — modifying one may not affect scripts using the other. Confirm which scripts you need to update.
  - `ui.py` opens SQLite connections with `check_same_thread=False`. Streamlit runs in a single process typically, but be cautious with concurrent writes.
  - `portfolio.db` lives in the repo root by default. Treat it as local state (back it up before migrations).

- **Where to look for examples**
  - UI patterns + DB helpers: `ui.py`
  - Alternate DB schema + prices/updaters: `setup_db.py`, `auto_update_prices.py`
  - Snapshot / reporting flows: `daily_snapshot.py`, `portfolio_report.py`, `export_excel_report.py`

- **If you change DB schema or migration logic**
  - Document the migration in `ui.py` (follow the `add_column_if_missing()` pattern) or create a separate migration script.
  - Add a short README note or update this file explaining the migration steps and any required manual actions.

---
If anything here is unclear or you'd like more detail on a specific area (Excel import mapping, DB migration plan, Streamlit UI flows), tell me which part to expand. 😊
