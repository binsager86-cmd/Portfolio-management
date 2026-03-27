"""Simulate the FIXED _calculate_growth logic against all stocks."""
import sqlite3

conn = sqlite3.connect("dev_portfolio.db")
c = conn.cursor()

growth_items = [
    ("REVENUE", "Revenue Growth", "income"),
    ("NET_INCOME", "Net Income Growth", "income"),
    ("EPS_DILUTED", "EPS Growth", "income"),
    ("TOTAL_ASSETS", "Total Assets Growth", "balance"),
    ("CASH_FROM_OPERATIONS", "CFO Growth", "cashflow"),
]

for stock_id in [1, 2, 4]:
    print(f"\n{'='*60}")
    print(f"STOCK_ID = {stock_id}")
    print(f"{'='*60}")
    
    for code, label, stmt_type in growth_items:
        # Case-insensitive match (UPPER)
        c.execute("""
            SELECT fs.period_end_date AS period, fs.fiscal_year, li.amount
            FROM financial_line_items li
            JOIN financial_statements fs ON fs.id = li.statement_id
            WHERE fs.stock_id = ? AND fs.statement_type = ?
              AND UPPER(li.line_item_code) = UPPER(?)
            ORDER BY fs.fiscal_year, fs.period_end_date
        """, (stock_id, stmt_type, code))
        rows = c.fetchall()
        
        if len(rows) < 2:
            continue
        
        # Deduplicate by fiscal_year
        by_year = {}
        for r in rows:
            period, fy, amt = r
            if fy is not None:
                by_year[fy] = {"period": period, "fiscal_year": fy, "amount": amt}
        
        sorted_years = sorted(by_year.keys())
        if len(sorted_years) < 2:
            continue
        
        print(f"\n  {label} ({code}):")
        print(f"    Fiscal years: {sorted_years}")
        
        # Only compare consecutive fiscal years
        for i in range(1, len(sorted_years)):
            prev_fy = sorted_years[i-1]
            curr_fy = sorted_years[i]
            if curr_fy - prev_fy != 1:
                print(f"    FY{prev_fy} -> FY{curr_fy}: SKIPPED (gap={curr_fy - prev_fy})")
                continue
            prev = by_year[prev_fy]
            curr = by_year[curr_fy]
            if prev["amount"] and prev["amount"] != 0:
                g = (curr["amount"] - prev["amount"]) / abs(prev["amount"])
                print(f"    FY{prev_fy}({prev['period']}) -> FY{curr_fy}({curr['period']}): {g*100:+.1f}%")
            else:
                print(f"    FY{prev_fy} -> FY{curr_fy}: SKIP (prev_amount=0 or None)")

conn.close()
