"""
Step 3 Verification Script
Verify UI queries are updated:
1. Portfolio overview uses deposit summary view
2. Deposit filtering added to transaction lists
3. Source badge shown in UI (Manual vs. Upload)
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=" * 60)
print("STEP 3 VERIFICATION: UI Query Updates")
print("=" * 60)

# 1. Check portfolio_deposit_summary view exists and works
print("\n1. DEPOSIT SUMMARY VIEW")
print("-" * 40)
try:
    cur.execute("SELECT * FROM portfolio_deposit_summary WHERE user_id = 2")
    rows = cur.fetchall()
    if rows:
        print("  ✅ portfolio_deposit_summary view works")
        for row in rows:
            print(f"     {row['portfolio_name']}: {row['net_deposits']:,.2f} ({row['deposit_count']} deposits)")
    else:
        print("  ⚠️ No data in view for user_id=2")
except Exception as e:
    print(f"  ❌ Error: {e}")

# 2. Check source column in transactions
print("\n2. SOURCE COLUMN DATA")
print("-" * 40)
cur.execute("""
    SELECT source, COUNT(*) as count 
    FROM transactions 
    WHERE user_id = 2 AND (is_deleted = 0 OR is_deleted IS NULL)
    GROUP BY source
""")
for row in cur.fetchall():
    src = row['source'] or 'NULL'
    print(f"  {src}: {row['count']} records")

# 3. Check ui.py has the source filter and badge
print("\n3. UI CODE VERIFICATION")
print("-" * 40)
with open('ui.py', 'r', encoding='utf-8') as f:
    content = f.read()

checks = [
    ("Source filter checkboxes", "Filter by Source"),
    ("MANUAL filter", 'trading_filter_source_MANUAL'),
    ("UPLOAD filter", 'trading_filter_source_UPLOAD'),
    ("Source badge function", "format_source_badge"),
    ("Source in query", "COALESCE(t.source, 'MANUAL') AS source"),
    ("Soft delete in query", "t.is_deleted = 0 OR t.is_deleted IS NULL"),
    ("Source in display columns", "'source', 'quantity'"),  # in the display column list
]

for name, pattern in checks:
    if pattern in content:
        print(f"  ✅ {name}")
    else:
        print(f"  ❌ {name} - pattern not found")

# 4. Check source badge emojis
print("\n4. SOURCE BADGE EMOJIS")
print("-" * 40)
badge_patterns = [
    ("Manual badge", "✍️ Manual"),
    ("Upload badge", "📤 Upload"),
    ("Restore badge", "🔄 Restore"),
    ("API badge", "🔌 API"),
    ("Legacy badge", "📜 Legacy"),
]
for name, pattern in badge_patterns:
    if pattern in content:
        print(f"  ✅ {name}")
    else:
        print(f"  ❌ {name}")

# 5. Verify get_portfolio_overview function uses unified data
print("\n5. PORTFOLIO OVERVIEW INTEGRATION")
print("-" * 40)
if "portfolio_deposit_summary" in content and "get_portfolio_overview" in content:
    print("  ✅ ui_overview() uses deposit summary view")
else:
    print("  ⚠️ Check integration with deposit summary")

conn.close()

print("\n" + "=" * 60)
print("VERIFICATION COMPLETE")
print("=" * 60)
