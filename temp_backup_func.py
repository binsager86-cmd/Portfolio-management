
def ui_backup_restore():
    user_id = st.session_state.get('user_id')
    st.title("💾 Backup & Restore (Excel)")
    st.caption("Export your transaction history or restore from a previous backup file.")
    
    tab_exp, tab_imp = st.tabs(["📤 Export Data", "📥 Import / Restore"])
    
    with tab_exp:
        st.markdown("### 📤 Export Transactions")
        st.write("Download your entire transaction history as an Excel file.")
        
        if st.button("Generate Excel Backup"):
            try:
                # Fetch data
                export_sql = "SELECT * FROM transactions WHERE user_id = ? ORDER BY txn_date DESC"
                df_export = query_df(export_sql, (user_id,))
                
                if not df_export.empty:
                    buffer = io.BytesIO()
                    with pd.ExcelWriter(buffer, engine='xlsxwriter') as writer:
                        df_export.to_excel(writer, index=False, sheet_name='Transactions')
                    
                    st.success(f"Generated backup with {len(df_export)} records.")
                    st.download_button(
                        label="Download Excel File", 
                        data=buffer.getvalue(), 
                        file_name=f"portfolio_backup_{date.today()}.xlsx", 
                        mime="application/vnd.ms-excel"
                    )
                else:
                    st.warning("No transactions found to export.")
            except Exception as e:
                st.error(f"Export Error: {e}")

    with tab_imp:
        st.markdown("### 📥 Import / Restore Transactions")
        st.warning("⚠️ This will APPEND transactions to your database. It does not delete existing records.")
        
        uploaded_file = st.file_uploader("Upload Backup File (.xlsx)", type=['xlsx'])
        
        if uploaded_file:
            if st.button("Process Restore", type="primary"):
                try:
                    df = pd.read_excel(uploaded_file)
                    df.columns = [c.lower().strip() for c in df.columns]
                    
                    conn = get_conn()
                    cur = conn.cursor()
                    
                    count_success = 0
                    count_errors = 0
                    progress_bar = st.progress(0)
                    
                    for i, row in df.iterrows():
                        try:
                            # Robust mapping
                            r_date = row.get('txn_date')
                            r_type = row.get('txn_type')
                            r_port = row.get('portfolio')
                            r_sym = row.get('stock_symbol')
                            
                            if pd.isna(r_sym) or pd.isna(r_type): continue
                            
                            # Normalize Date
                            if isinstance(r_date, pd.Timestamp):
                                r_date_str = r_date.strftime('%Y-%m-%d')
                            else:
                                r_date_str = str(r_date).split(' ')[0]

                            # Defaults
                            r_shares = float(row.get('shares', 0) or 0)
                            r_cost = float(row.get('purchase_cost', 0) or 0)
                            r_sell = float(row.get('sell_value', 0) or 0)
                            r_div = float(row.get('cash_dividend', 0) or 0)
                            r_fees = float(row.get('fees', 0) or 0)
                            r_notes = str(row.get('notes', '') or '')
                            r_cat = str(row.get('category', 'portfolio') or 'portfolio')
                            
                            cur.execute("""
                                INSERT INTO transactions 
                                (user_id, portfolio, stock_symbol, txn_date, txn_type, 
                                 shares, purchase_cost, sell_value, cash_dividend, fees, 
                                 notes, category, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (user_id, r_port, r_sym, r_date_str, r_type,
                                  r_shares, r_cost, r_sell, r_div, r_fees,
                                  r_notes, r_cat, int(time.time())))
                            count_success += 1
                        except Exception as inner_e:
                            count_errors += 1
                        
                        if i % 5 == 0:
                            progress_bar.progress(min((i+1)/len(df), 1.0))

                    conn.commit()
                    conn.close()
                    progress_bar.progress(1.0)
                    
                    if count_errors > 0:
                        st.warning(f"Restore Complete: {count_success} imported, {count_errors} failed.")
                    else:
                        st.success(f"✅ Successfully restored {count_success} transactions!")
                    
                except Exception as e:
                    st.error(f"Import Failed: {e}")
