import sqlite3
import time
from datetime import date
import pandas as pd
import streamlit as st

# =========================
# CONFIG
# =========================
st.set_page_config(page_title="Portfolio App", layout="wide")
DB_PATH = "portfolio.db"


# =========================
# DB HELPERS
# =========================
def get_conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


def query_df(sql, params=()):
    conn = get_conn()
    df = pd.read_sql_query(sql, conn, params=params)
    conn.close()
    return df


def exec_sql(sql, params=()):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    conn.close()


def table_columns(table_name: str) -> set:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table_name})")
    cols = {row[1] for row in cur.fetchall()}
    conn.close()
    return cols


def add_column_if_missing(table: str, col: str, coltype: str):
    cols = table_columns(table)
    if col not in cols:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")
        conn.commit()
        conn.close()


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # Cash deposits
    cur.execute("""
    CREATE TABLE IF NOT EXISTS cash_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_name TEXT NOT NULL,
        deposit_date TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        comments TEXT,
        created_at INTEGER NOT NULL
    )
    """)

    # Stocks
    cur.execute("""
    CREATE TABLE IF NOT EXISTS stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        name TEXT,
        current_price REAL DEFAULT 0
    )
    """)

    # Transactions (base)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_symbol TEXT NOT NULL,
        txn_date TEXT NOT NULL,
        txn_type TEXT NOT NULL CHECK(txn_type IN ('Buy','Sell')),
        purchase_cost REAL NOT NULL DEFAULT 0,
        sell_value REAL NOT NULL DEFAULT 0,
        shares REAL NOT NULL DEFAULT 0,
        reinvested_dividend REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at INTEGER NOT NULL
    )
    """)

    conn.commit()
    conn.close()

    # ---- Auto-upgrade: add new columns if missing ----
    add_column_if_missing("transactions", "price_override", "REAL DEFAULT NULL")
    add_column_if_missing("transactions", "planned_cum_shares", "REAL DEFAULT NULL")
    add_column_if_missing("transactions", "fees", "REAL DEFAULT 0")
    add_column_if_missing("transactions", "broker", "TEXT")
    add_column_if_missing("transactions", "reference", "TEXT")


# =========================
# UTIL
# =========================
def safe_float(v, default=0.0):
    try:
        if v is None or v == "":
            return default
        return float(v)
    except:
        return default


def fmt(x, d=3):
    try:
        return f"{float(x):,.{d}f}"
    except:
        return "0.000"


def fmt0(x):
    try:
        return f"{float(x):,.0f}"
    except:
        return "0"


def compute_stock_metrics(tx_df: pd.DataFrame):
    """
    Weighted average cost using net shares from Buys (ignores sells for avg cost calculation of remaining position).
    - total_buy_cost: sum of purchase_cost on buys
    - total_buy_shares: sum shares on buys
    - current_shares: buy_shares - sell_shares
    - avg_cost: total_buy_cost / total_buy_shares (simple weighted on buys)
      (Professional note: this is weighted-average on buys. FIFO realized PnL comes later.)
    """
    if tx_df.empty:
        return {
            "total_buy_cost": 0.0,
            "total_buy_shares": 0.0,
            "current_shares": 0.0,
            "avg_cost": 0.0,
            "total_sell_value": 0.0,
            "total_reinvested": 0.0,
        }

    buy = tx_df[tx_df["txn_type"] == "Buy"]
    sell = tx_df[tx_df["txn_type"] == "Sell"]

    total_buy_cost = buy["purchase_cost"].sum()
    total_buy_shares = buy["shares"].sum()
    total_sell_value = sell["sell_value"].sum()
    total_reinvested = tx_df["reinvested_dividend"].sum()

    current_shares = buy["shares"].sum() - sell["shares"].sum()
    avg_cost = (total_buy_cost / total_buy_shares) if total_buy_shares > 0 else 0.0

    return {
        "total_buy_cost": float(total_buy_cost),
        "total_buy_shares": float(total_buy_shares),
        "current_shares": float(current_shares),
        "avg_cost": float(avg_cost),
        "total_sell_value": float(total_sell_value),
        "total_reinvested": float(total_reinvested),
    }

def compute_transactions_view(tx_df: pd.DataFrame) -> pd.DataFrame:
    """
    Creates Excel-like computed columns:
    - Serial
    - Price (auto or override)
    - CUM Shares
    - Difference Shares = Planned CUM Shares - Actual CUM Shares (if planned provided)
    """
    if tx_df.empty:
        return tx_df

    df = tx_df.copy()
    df["txn_date"] = df["txn_date"].fillna("")
    df["created_at"] = df["created_at"].fillna(0)

    df = df.sort_values(["txn_date", "created_at", "id"], ascending=[True, True, True]).reset_index(drop=True)

    serial = []
    price_list = []
    cum_list = []
    diff_list = []

    running = 0.0

    for i, r in df.iterrows():
        serial.append(i + 1)

        shares = safe_float(r.get("shares", 0), 0)
        ttype = r.get("txn_type", "")
        pcost = safe_float(r.get("purchase_cost", 0), 0)
        svalue = safe_float(r.get("sell_value", 0), 0)
        override = r.get("price_override", None)
        planned = r.get("planned_cum_shares", None)

        # Price auto from cost/value unless override exists
        if override is not None and str(override) != "" and pd.notna(override):
            p = safe_float(override, 0)
        else:
            if shares > 0 and ttype == "Buy":
                p = pcost / shares
            elif shares > 0 and ttype == "Sell":
                p = svalue / shares
            else:
                p = 0.0

        price_list.append(p)

        # Running shares
        if ttype == "Buy":
            running += shares
        elif ttype == "Sell":
            running -= shares

        cum_list.append(running)

        # Difference Shares
        if planned is None or str(planned) == "" or pd.isna(planned):
            diff_list.append(None)
        else:
            diff_list.append(safe_float(planned, 0) - running)

    df["Serial"] = serial
    df["Price"] = price_list
    df["CUM Shares"] = cum_list
    df["Difference Shares"] = diff_list

    return df


# =========================
# UI - CASH DEPOSITS
# =========================
def ui_cash_deposits():
    st.subheader("Add Cash Deposit")

    with st.expander("➕ Add Deposit", expanded=True):
        c1, c2, c3 = st.columns([2, 1, 1])
        bank_name = c1.text_input("Bank name", placeholder="e.g. KFH, NBK, KIB")
        deposit_date = c2.date_input("Date", value=date.today())
        amount = c3.number_input("Amount", min_value=0.0, step=10.0, format="%.3f")
        description = st.text_input("Description", placeholder="e.g. Salary, Transfer, Top-up")
        comments = st.text_area("Comments (optional)")

        if st.button("Save Deposit", type="primary"):
            if bank_name.strip() == "":
                st.error("Bank name is required.")
            elif amount <= 0:
                st.error("Amount must be > 0.")
            else:
                exec_sql(
                    """INSERT INTO cash_deposits (bank_name, deposit_date, amount, description, comments, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        bank_name.strip(),
                        deposit_date.isoformat(),
                        float(amount),
                        description.strip(),
                        comments.strip(),
                        int(time.time()),
                    ),
                )
                st.success("Deposit saved.")

    st.divider()

    deposits = query_df("""
        SELECT id, bank_name, deposit_date, amount, description, comments
        FROM cash_deposits
        ORDER BY deposit_date DESC, id DESC
    """)

    if deposits.empty:
        st.info("No deposits yet.")
        return

    bank_summary = deposits.groupby("bank_name", as_index=False)["amount"].sum().sort_values("amount", ascending=False)
    grand_total = deposits["amount"].sum()

    a, b = st.columns([2, 1])
    with a:
        st.markdown("### Bank Summary")
        st.dataframe(bank_summary.rename(columns={"amount": "sum_deposits"}), use_container_width=True)
    with b:
        st.markdown("### Grand Total")
        st.metric("Total cash deposits", fmt(grand_total))

    st.markdown("### All Deposits")
    st.dataframe(deposits, use_container_width=True)


# =========================
# UI - TRANSACTIONS (ENHANCED)
# =========================
def ui_transactions():
    st.subheader("Add Transactions (per stock)")

    # Add Stock
    with st.expander("➕ Add Stock", expanded=True):
        c1, c2, c3 = st.columns([2, 5, 1.2])
        symbol = c1.text_input("Symbol", placeholder="e.g. KIB, AAPL")
        name = c2.text_input("Name (optional)", placeholder="Stock full name (optional)")
        if c3.button("Add Stock", type="primary"):
            sym = symbol.strip().upper()
            if sym == "":
                st.error("Symbol is required.")
            else:
                try:
                    exec_sql("INSERT INTO stocks (symbol, name, current_price) VALUES (?, ?, ?)", (sym, name.strip(), 0))
                    st.success(f"Stock {sym} added.")
                except sqlite3.IntegrityError:
                    st.warning("This symbol already exists.")

    st.divider()

    stocks = query_df("SELECT symbol, COALESCE(name,'') AS name, COALESCE(current_price,0) AS current_price FROM stocks ORDER BY symbol ASC")
    if stocks.empty:
        st.info("Add a stock first, then you can add transactions.")
        return

    stock_options = [f"{r['symbol']} - {r['name']}".strip(" -") for _, r in stocks.iterrows()]
    selected_opt = st.selectbox("Select stock", stock_options)
    selected_symbol = selected_opt.split(" - ")[0].strip()

    stock_row = stocks[stocks["symbol"] == selected_symbol].iloc[0]
    current_price_db = safe_float(stock_row["current_price"], 0)

    # Current price (stored per stock)
    cpx1, cpx2 = st.columns([1, 4])
    with cpx1:
        new_cp = st.number_input("Current Price", min_value=0.0, step=0.001, format="%.6f", value=float(current_price_db))
    with cpx2:
        if st.button("Save Current Price"):
            exec_sql("UPDATE stocks SET current_price = ? WHERE symbol = ?", (float(new_cp), selected_symbol))
            st.success("Current price saved.")

    st.markdown(f"### Transactions for: **{selected_symbol}**")

    tx = query_df("""
        SELECT
            id,
            stock_symbol,
            txn_date,
            txn_type,
            purchase_cost,
            sell_value,
            shares,
            price_override,
            planned_cum_shares,
            reinvested_dividend,
            fees,
            broker,
            reference,
            notes,
            created_at
        FROM transactions
        WHERE stock_symbol = ?
        ORDER BY txn_date ASC, created_at ASC, id ASC
    """, (selected_symbol,))

    metrics = compute_stock_metrics(tx)
    current_price = float(new_cp)
    market_value = metrics["current_shares"] * current_price

    # Top summary like your Excel header
    s1, s2, s3, s4, s5, s6 = st.columns(6)
    s1.metric("Total Purchase", fmt(metrics["total_buy_cost"]))
    s2.metric("Total Shares Purchased", fmt0(metrics["total_buy_shares"]))
    s3.metric("Total Shares (Current)", fmt0(metrics["current_shares"]))
    s4.metric("Average Cost", f"{metrics['avg_cost']:.6f}")
    s5.metric("Current Price", f"{current_price:.6f}")
    s6.metric("Market Value", fmt(market_value))

    st.divider()

    # Add Transaction form (more fields)
  with st.expander("➕ Add Transaction (more fields)", expanded=True):
    c1, c2, c3, c4 = st.columns([1.1, 1, 1, 1])

    txn_date = c1.date_input("Date", value=date.today(), key="txn_date")
    txn_type = c2.selectbox("Type", ["Buy", "Sell"], key="txn_type")
    shares = c3.number_input("# of shares", min_value=0.0, step=1.0, format="%.0f", key="txn_shares")
    reinv = c4.number_input("Reinvested dividends (KD)", min_value=0.0, step=1.0, format="%.3f", key="txn_reinv")

    c5, c6, c7 = st.columns([1.2, 1.2, 1.6])

    # Cost/Value depending on type
    purchase_cost = 0.0
    sell_value = 0.0
    if txn_type == "Buy":
        purchase_cost = c5.number_input("Actual purchase cost", min_value=0.0, step=10.0, format="%.3f", key="txn_buy_cost")
    else:
        sell_value = c5.number_input("Actual sell value", min_value=0.0, step=10.0, format="%.3f", key="txn_sell_value")

    # Price override logic
    use_override = c6.checkbox("Override price?", value=False, key="use_override_price")
    price_override = None
    if use_override:
        price_override = c6.number_input("Override Price", min_value=0.0, step=0.001, format="%.6f", key="txn_price_override")
    else:
        c6.caption("Price will be calculated automatically from cost/value ÷ shares.")

    # Planned cum shares (optional)
    planned_cum = c7.number_input("Planned CUM shares (optional)", min_value=0.0, step=1.0, format="%.0f", key="txn_planned_cum")

    # Live calculated price preview
    calc_price = 0.0
    if shares > 0:
        if txn_type == "Buy":
            calc_price = (float(purchase_cost) / float(shares)) if purchase_cost > 0 else 0.0
        else:
            calc_price = (float(sell_value) / float(shares)) if sell_value > 0 else 0.0
    st.info(f"Auto Price Preview = {calc_price:.6f}")

    c8, c9, c10 = st.columns([1, 1, 2])
    fees = c8.number_input("Fees (optional)", min_value=0.0, step=0.100, format="%.3f", key="txn_fees")
    broker = c9.text_input("Broker/Platform (optional)", key="txn_broker")
    reference = c10.text_input("Reference / Order ID (optional)", key="txn_reference")

    notes = st.text_area("Notes (optional)", key="txn_notes")

    # Professional control: prevent oversell
    available_before = float(metrics["current_shares"])
    if txn_type == "Sell" and shares > available_before:
        st.error(f"You are trying to SELL {shares:,.0f} shares but available is {available_before:,.0f}.")

    if st.button("Save Transaction", type="primary"):
        if shares <= 0:
            st.error("Shares must be > 0.")
        elif txn_type == "Buy" and purchase_cost <= 0:
            st.error("Purchase cost must be > 0 for Buy.")
        elif txn_type == "Sell" and sell_value <= 0:
            st.error("Sell value must be > 0 for Sell.")
        elif txn_type == "Sell" and shares > available_before:
            st.error("Cannot sell more than available quantity.")
        else:
            # store override or NULL
            po = None if (price_override is None) else float(price_override)
            # planned cum: store NULL if 0
            pc = None if planned_cum == 0 else float(planned_cum)

            exec_sql(
                """INSERT INTO transactions
                   (stock_symbol, txn_date, txn_type, purchase_cost, sell_value, shares,
                    price_override, planned_cum_shares, reinvested_dividend, fees, broker, reference, notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    selected_symbol,
                    txn_date.isoformat(),
                    txn_type,
                    float(purchase_cost),
                    float(sell_value),
                    float(shares),
                    po,
                    pc,
                    float(reinv),
                    float(fees),
                    broker.strip(),
                    reference.strip(),
                    notes.strip(),
                    int(time.time()),
                ),
            )

            st.success("Transaction saved.")
            st.rerun()

    # Show computed table (Excel-like)
    st.markdown("### Transactions Table (Excel-like)")
  
       

    view = compute_transactions_view(tx)

    # Display fields similar to your sheet
    display = view.copy()
    display["Purchase cost"] = display["purchase_cost"].map(fmt)
    display["Sell value"] = display["sell_value"].map(fmt)
    display["# of shares"] = display["shares"].map(fmt0)
    display["Price"] = display["Price"].map(lambda x: f"{x:.6f}")
    display["CUM shares"] = display["CUM Shares"].map(fmt0)
    display["Planned CUM"] = display["planned_cum_shares"].map(lambda x: "" if pd.isna(x) else fmt0(x))
    display["Difference Shares"] = display["Difference Shares"].map(lambda x: "" if x is None or pd.isna(x) else fmt0(x))
    display["Reinvested dividends KD"] = display["reinvested_dividend"].map(fmt)
    display["Fees"] = display["fees"].map(fmt)
    display["Date"] = display["txn_date"]
    display["Type"] = display["txn_type"]
    display["Txn ID"] = display["id"]

    st.dataframe(
        display[[
            "Serial",
            "Txn ID",
            "Date",
            "Type",
            "Purchase cost",
            "Sell value",
            "# of shares",
            "Price",
            "CUM shares",
            "Planned CUM",
            "Difference Shares",
            "Reinvested dividends KD",
            "Fees",
            "broker",
            "reference",
            "notes",
        ]],
        use_container_width=True,
        hide_index=True
    )

    # Delete transaction
    with st.expander("🗑️ Delete a transaction"):
        del_txn_id = st.number_input("Transaction ID to delete", min_value=0, step=1)
        if st.button("Delete Transaction"):
            exec_sql("DELETE FROM transactions WHERE id = ? AND stock_symbol = ?", (int(del_txn_id), selected_symbol))
            st.success("Deleted (if ID existed). Refresh the page.")

    # Remove stock + all transactions
    with st.expander("⚠️ Remove Stock (deletes all transactions)"):
        st.warning("This deletes the stock AND all related transactions.")
        if st.button(f"Remove {selected_symbol}", type="secondary"):
            exec_sql("DELETE FROM transactions WHERE stock_symbol = ?", (selected_symbol,))
            exec_sql("DELETE FROM stocks WHERE symbol = ?", (selected_symbol,))
            st.success("Stock removed. Refresh the page.")


# =========================
# PLACEHOLDER TABS (NEXT)
# =========================
def ui_portfolio_analysis():
    st.subheader("Portfolio Analysis")
    st.info("Next: realized/unrealized PnL, charts, and performance metrics.")


def ui_portfolio_tracker():
    st.subheader("Portfolio Tracker")
    st.info("Next: holdings table across all stocks (linked to transactions) + portfolio totals.")


def ui_dividends_tracker():
    st.subheader("Dividends Tracker")
    st.info("Next: cash dividends + stock dividends + reinvestment + charts.")


# =========================
# MAIN
# =========================
def main():
    init_db()

    st.title("📊 Portfolio App")

    tabs = st.tabs([
        "Add Cash Deposit",
        "Add Transactions",
        "Portfolio Analysis",
        "Portfolio Tracker",
        "Dividends Tracker"
    ])

    with tabs[0]:
        ui_cash_deposits()

    with tabs[1]:
        ui_transactions()

    with tabs[2]:
        ui_portfolio_analysis()

    with tabs[3]:
        ui_portfolio_tracker()

    with tabs[4]:
        ui_dividends_tracker()

    st.caption("DB: portfolio.db | UI: Streamlit")


if __name__ == "__main__":
    main()
