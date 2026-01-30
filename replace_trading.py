"""Script to replace ui_trading_section in ui.py with the new version."""

# Read the current ui.py
with open('ui.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start and end of ui_trading_section
start_marker = '\ndef ui_trading_section():'
end_marker = '\n# ========================='  # The "OVERVIEW TAB" section comment

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx == -1:
    print("ERROR: Could not find ui_trading_section start")
    exit(1)
if end_idx == -1:
    print("ERROR: Could not find ui_trading_section end")
    exit(1)

print(f"Found ui_trading_section from char {start_idx} to {end_idx}")
print(f"Function length: {end_idx - start_idx} characters")

# New function content
new_function = '''
def ui_trading_section():
    """Trading Section - Filtered view of Buy/Sell transactions from main transactions table.
    
    Key changes from old version:
    - NO data entry - all new trades must use "Add Transactions" tab
    - Queries from 'transactions' table (not separate trading_history)
    - Edits UPDATE the 'transactions' table directly
    - Admin section to clean up legacy trading_history records
    """
    st.subheader("📈 Trading Section - Buy/Sell History")
    
    st.info("""
    **📋 This is a filtered view of your Buy/Sell transactions.**
    
    • To add new trades, use the **"Add Transactions"** tab.
    • All trades shown here are from the main `transactions` table.
    • You can **edit** existing trades here, which updates the main transaction record.
    • Portfolio positions and cash are calculated from the same data.
    """)
    
    user_id = st.session_state.get('user_id', 1)
    
    # Date range filter
    st.divider()
    col1, col2, col3, col4 = st.columns([2, 2, 1, 1])
    with col1:
        start_date = st.date_input("From Date", value=date(2024, 1, 1), key="trading_start")
    with col2:
        end_date = st.date_input("To Date", value=date.today(), key="trading_end")
    with col3:
        st.write("")
        st.write("")
        apply_filter = st.button("🔍 Filter", key="trading_filter_btn")
    with col4:
        st.write("")
        st.write("")
        show_all = st.button("🔄 Show All", key="trading_show_all_btn")
    
    # Track filter state
    if apply_filter:
        st.session_state['trading_date_filter'] = True
    if show_all:
        st.session_state['trading_date_filter'] = False
    
    use_filter = st.session_state.get('trading_date_filter', False)
    
    # Query Buy/Sell transactions from the main transactions table
    conn = get_conn()
    
    if use_filter:
        query = """
            SELECT 
                t.id,
                t.stock_symbol AS symbol,
                t.txn_date AS date,
                COALESCE(t.portfolio, s.portfolio, 'KFH') AS portfolio,
                t.txn_type AS type,
                t.shares AS quantity,
                t.purchase_cost,
                t.sell_value,
                t.fees,
                t.cash_dividend AS dividend,
                t.notes
            FROM transactions t
            LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
            WHERE t.user_id = ? 
              AND t.txn_type IN ('Buy', 'Sell')
              AND COALESCE(t.category, 'portfolio') = 'portfolio'
              AND t.txn_date BETWEEN ? AND ?
            ORDER BY t.txn_date DESC, t.id DESC
        """
        df = pd.read_sql_query(
            convert_sql_placeholders(query),
            conn,
            params=(user_id, start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
        )
        st.caption(f"📊 Showing transactions from {start_date} to {end_date}")
    else:
        query = """
            SELECT 
                t.id,
                t.stock_symbol AS symbol,
                t.txn_date AS date,
                COALESCE(t.portfolio, s.portfolio, 'KFH') AS portfolio,
                t.txn_type AS type,
                t.shares AS quantity,
                t.purchase_cost,
                t.sell_value,
                t.fees,
                t.cash_dividend AS dividend,
                t.notes
            FROM transactions t
            LEFT JOIN stocks s ON t.stock_symbol = s.symbol AND t.user_id = s.user_id
            WHERE t.user_id = ? 
              AND t.txn_type IN ('Buy', 'Sell')
              AND COALESCE(t.category, 'portfolio') = 'portfolio'
            ORDER BY t.txn_date DESC, t.id DESC
        """
        df = pd.read_sql_query(convert_sql_placeholders(query), conn, params=(user_id,))
        st.caption(f"📊 Showing all Buy/Sell transactions")
    
    conn.close()
    
    if df.empty:
        st.warning("No Buy/Sell transactions found. Use **Add Transactions** tab to record trades.")
        _show_trading_admin_cleanup(user_id)
        return
    
    # Calculate derived columns
    df['price'] = df.apply(lambda r: 
        r['purchase_cost'] / r['quantity'] if r['type'] == 'Buy' and r['quantity'] > 0 else
        r['sell_value'] / r['quantity'] if r['type'] == 'Sell' and r['quantity'] > 0 else 0, 
        axis=1
    )
    df['value'] = df.apply(lambda r: 
        r['purchase_cost'] if r['type'] == 'Buy' else r['sell_value'], 
        axis=1
    )
    
    # Summary metrics
    st.divider()
    buy_df = df[df['type'] == 'Buy']
    sell_df = df[df['type'] == 'Sell']
    
    total_buys = buy_df['purchase_cost'].sum() if not buy_df.empty else 0
    total_sells = sell_df['sell_value'].sum() if not sell_df.empty else 0
    total_fees = df['fees'].sum() if 'fees' in df.columns else 0
    net_cash_flow = total_sells - total_buys - total_fees
    
    k1, k2, k3, k4 = st.columns(4)
    k1.metric("🛒 Total Buys", f"{total_buys:,.0f}", f"{len(buy_df)} txns")
    k2.metric("💰 Total Sells", f"{total_sells:,.0f}", f"{len(sell_df)} txns")
    k3.metric("📊 Fees", f"{total_fees:,.2f}")
    k4.metric("💵 Net Cash Flow", f"{net_cash_flow:+,.0f}", 
              delta_color="normal" if net_cash_flow >= 0 else "inverse")
    
    st.divider()
    
    # View/Edit mode toggle
    col_mode, col_refresh = st.columns([3, 1])
    with col_mode:
        view_mode = st.radio("", ["📊 View", "✏️ Edit"], horizontal=True, label_visibility="collapsed", key="trading_view_mode")
    with col_refresh:
        if st.button("🔄 Refresh", key="trading_refresh"):
            build_portfolio_table.clear()
            st.rerun()
    
    if view_mode == "📊 View":
        # Display table (read-only)
        display_df = df[['id', 'date', 'symbol', 'portfolio', 'type', 'quantity', 'price', 'value', 'fees', 'dividend', 'notes']].copy()
        
        # Format for display
        display_df['quantity'] = display_df['quantity'].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "")
        display_df['price'] = display_df['price'].apply(lambda x: f"{x:.3f}" if pd.notna(x) and x > 0 else "")
        display_df['value'] = display_df['value'].apply(lambda x: f"{x:,.2f}" if pd.notna(x) else "")
        display_df['fees'] = display_df['fees'].apply(lambda x: f"{x:.2f}" if pd.notna(x) and x > 0 else "")
        display_df['dividend'] = display_df['dividend'].apply(lambda x: f"{x:.2f}" if pd.notna(x) and x > 0 else "")
        
        st.dataframe(display_df, hide_index=True, use_container_width=True)
        st.caption("Switch to **Edit** mode to modify transactions.")
        
    else:
        # Editable table
        st.warning("⚠️ Editing here updates the main transactions table. Changes affect portfolio positions and cash.")
        
        edit_df = df[['id', 'date', 'symbol', 'portfolio', 'type', 'quantity', 'price', 'fees', 'notes']].copy()
        
        column_config = {
            "id": st.column_config.NumberColumn("ID", disabled=True, width="small"),
            "date": st.column_config.DateColumn("Date", format="YYYY-MM-DD"),
            "symbol": st.column_config.TextColumn("Symbol"),
            "portfolio": st.column_config.SelectboxColumn("Portfolio", options=["KFH", "BBYN", "USA"]),
            "type": st.column_config.SelectboxColumn("Type", options=["Buy", "Sell"], disabled=True),
            "quantity": st.column_config.NumberColumn("Qty", min_value=0, format="%.0f"),
            "price": st.column_config.NumberColumn("Price", min_value=0, format="%.3f"),
            "fees": st.column_config.NumberColumn("Fees", min_value=0, format="%.3f"),
            "notes": st.column_config.TextColumn("Notes"),
        }
        
        with st.form("trading_edit_form"):
            edited_df = st.data_editor(
                edit_df,
                column_config=column_config,
                hide_index=True,
                use_container_width=True,
                num_rows="fixed",  # No adding/deleting rows here
                key="trading_editor"
            )
            
            save_btn = st.form_submit_button("💾 Save Changes", type="primary")
        
        if save_btn:
            try:
                conn = get_conn()
                cur = conn.cursor()
                changes = 0
                
                for idx in range(len(edited_df)):
                    row = edited_df.iloc[idx]
                    orig_row = edit_df.iloc[idx]
                    
                    # Check if anything changed
                    changed = False
                    for col in ['date', 'symbol', 'portfolio', 'quantity', 'price', 'fees', 'notes']:
                        if str(row.get(col, '')) != str(orig_row.get(col, '')):
                            changed = True
                            break
                    
                    if changed:
                        txn_id = int(row['id'])
                        txn_type = row['type']
                        qty = float(row['quantity']) if pd.notna(row['quantity']) else 0
                        price = float(row['price']) if pd.notna(row['price']) else 0
                        fees = float(row['fees']) if pd.notna(row['fees']) else 0
                        
                        # Calculate purchase_cost or sell_value
                        if txn_type == 'Buy':
                            purchase_cost = qty * price
                            sell_value = 0
                        else:  # Sell
                            purchase_cost = 0
                            sell_value = qty * price
                        
                        # Update the transaction
                        db_execute(cur, """
                            UPDATE transactions 
                            SET txn_date = ?, 
                                stock_symbol = ?,
                                portfolio = ?,
                                shares = ?,
                                purchase_cost = ?,
                                sell_value = ?,
                                fees = ?,
                                notes = ?
                            WHERE id = ? AND user_id = ?
                        """, (
                            pd.to_datetime(row['date']).strftime('%Y-%m-%d') if pd.notna(row['date']) else None,
                            row['symbol'],
                            row['portfolio'],
                            qty,
                            purchase_cost,
                            sell_value,
                            fees,
                            row['notes'] if pd.notna(row['notes']) else '',
                            txn_id,
                            user_id
                        ))
                        changes += 1
                
                conn.commit()
                conn.close()
                
                if changes > 0:
                    st.success(f"✅ Updated {changes} transaction(s)")
                    # Recalculate cash after edits
                    recalc_portfolio_cash(user_id)
                    build_portfolio_table.clear()
                    time.sleep(1)
                    st.rerun()
                else:
                    st.info("No changes detected")
                    
            except Exception as e:
                st.error(f"Error saving: {e}")
    
    # Admin cleanup section
    _show_trading_admin_cleanup(user_id)
    
    # Download section
    st.divider()
    from io import BytesIO
    output = BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='Trading History', index=False)
    
    st.download_button(
        label="📥 Download Trading History (Excel)",
        data=output.getvalue(),
        file_name=f"trading_history_{date.today()}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        key="trading_download"
    )


def _show_trading_admin_cleanup(user_id):
    """Admin section to review and delete legacy trading_history records."""
    st.divider()
    with st.expander("🔧 Admin: Legacy Trading Data Cleanup", expanded=False):
        st.warning("""
        **Legacy Data Notice**
        
        The old Trading tab used a separate `trading_history` table that is NOT connected to 
        portfolio calculations. Any records there do NOT affect your cash or positions.
        
        If you have test/sandbox trades from the old system, review and delete them below.
        """)
        
        try:
            conn = get_conn()
            legacy_query = """
                SELECT id, stock_symbol, txn_date, txn_type, shares, purchase_cost, sell_value
                FROM trading_history 
                WHERE user_id = ?
                ORDER BY txn_date DESC
            """
            legacy_df = pd.read_sql_query(convert_sql_placeholders(legacy_query), conn, params=(user_id,))
            conn.close()
            
            if legacy_df.empty:
                st.success("✅ No legacy trading_history records found. You're all clean!")
            else:
                st.warning(f"⚠️ Found {len(legacy_df)} records in legacy trading_history table")
                st.dataframe(legacy_df, hide_index=True, use_container_width=True)
                
                col1, col2 = st.columns(2)
                with col1:
                    if st.button("🗑️ Delete ALL Legacy Records", type="secondary", key="delete_legacy"):
                        try:
                            conn = get_conn()
                            cur = conn.cursor()
                            db_execute(cur, "DELETE FROM trading_history WHERE user_id = ?", (user_id,))
                            deleted = cur.rowcount
                            conn.commit()
                            conn.close()
                            st.success(f"✅ Deleted {deleted} legacy records")
                            time.sleep(1)
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error: {e}")
                            
                with col2:
                    st.caption("This will permanently delete all trading_history records. This data is NOT used in portfolio calculations.")
                    
        except Exception as e:
            st.info(f"No legacy trading_history table found: {e}")


'''

# Replace the function
new_content = content[:start_idx] + new_function + content[end_idx:]

# Write back
with open('ui.py', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ Successfully replaced ui_trading_section!")
print(f"Old function: {end_idx - start_idx} chars")
print(f"New function: {len(new_function)} chars")
print(f"File size change: {len(new_content) - len(content)} chars")
