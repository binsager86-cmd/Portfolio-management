"""
ARCHIVE LEGACY
This file contains unused or dead code removed from the main application during cleanup.
It is preserved here for reference.

NOTE: Functions here may depend on imports or helpers from ui.py that were not copied.
"""

import streamlit as st
import pandas as pd
import io
import time
from datetime import date
import sqlite3

# Unused function from ui.py
def ui_upload_transactions_excel():
    st.subheader("📥 Upload Transactions (Excel)")

    st.caption(
        "Upload an .xlsx file with a sheet named 'Transactions' (recommended). "
        "Required columns: company, txn_date, txn_type, shares. "
        "For Buy: purchase_cost. For Sell: sell_value. "
        "Optional: bonus_shares, cash_dividend, reinvested_dividend, fees, broker, reference, notes, price_override, planned_cum_shares."
    )

    # Provide a downloadable sample Excel template to guide users
    try:
        sample_df = pd.DataFrame([
            {
                "company": "KIB",
                "txn_date": date.today().isoformat(),
                "txn_type": "Buy",
                "shares": 100,
                "purchase_cost": 100.0,
                "sell_value": "",
                "bonus_shares": 0,
                "cash_dividend": 0.0,
                "reinvested_dividend": 0.0,
                "fees": 0.0,
                "broker": "KFH",
                "reference": "REF123",
                "notes": "Example row",
                "price_override": "",
                "planned_cum_shares": "",
            }
        ])

        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            sample_df.to_excel(writer, sheet_name="Transactions", index=False)
        buf.seek(0)

        st.download_button(
            label="Download sample Excel template",
            data=buf,
            file_name="transactions_template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        with st.expander("Template & Tips", expanded=False):
            st.markdown("- Required columns: **company**, **txn_date** (YYYY-MM-DD), **txn_type** (Buy/Sell), **shares**")
            st.markdown("- For `Buy` rows: include **purchase_cost**. For `Sell` rows: include **sell_value**.")
            st.markdown("- Optional columns: `bonus_shares`, `cash_dividend`, `reinvested_dividend`, `fees`, `broker`, `reference`, `notes`, `price_override`, `planned_cum_shares`.")
            st.markdown("- Column names are normalized (spaces, dashes converted). The uploader will try common alternatives (e.g. `symbol`, `ticker` for `company`).")
            st.markdown("- Use the `Transactions` sheet name if possible; otherwise the first sheet will be used.")
            st.markdown("- See `.github/copilot-instructions.md` for more repository-specific guidance.")
    except Exception:
        # If writing the template fails (missing dependency), fall back silently and still show uploader
        pass

    file = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"], key="txn_excel_uploader")
    if not file:
        return

    try:
        xl = pd.ExcelFile(file)
        sheet = "Transactions" if "Transactions" in xl.sheet_names else xl.sheet_names[0]
        raw = xl.parse(sheet_name=sheet)
    except Exception as e:
        st.error(f"Could not read the Excel file: {e}")
        return

    if raw.empty:
        st.warning("Excel sheet is empty.")
        return

    # Normalize columns
    df = raw.copy()
    # Note: _norm_col is a helper in ui.py
    # df.columns = [_norm_col(c) for c in df.columns]

    # Note: _pick_col is a helper in ui.py
    # company_col = _pick_col(df, ["company", "symbol", "ticker", "stock", "stock_symbol", "asset"])
    # ... (rest of logic commented out due to missing helpers, or assumed available if imported)

    st.warning("This function was archived because it was unused. It depends on helpers in ui.py.")



# Unused from auto_update_prices.py
def upsert_fx(conn, rate_date: str, from_ccy: str, to_ccy: str, rate: float, source: str):
    cur = conn.cursor()
    cur.execute('''
        INSERT OR REPLACE INTO fx_rates (rate_date, from_ccy, to_ccy, rate, source)
        VALUES (?, ?, ?, ?, ?)
    ''', (rate_date, from_ccy, to_ccy, rate, source))

def fetch_usdkwd_demo():
    '''
    Temporary: a simple FX fetch using a public endpoint.
    We'll replace this with CBK automation next.
    Returns: float rate for 1 USD -> KWD
    '''
    # Frankfurter doesn't include KWD; this is a placeholder.
    # We'll keep the pipeline working and swap to CBK next.
    raise NotImplementedError('CBK FX fetch will be added next step.')
