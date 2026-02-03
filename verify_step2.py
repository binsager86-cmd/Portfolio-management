"""
Step 2 Verification Script
Verify that upload logic has been enhanced with:
1. source column for tracking upload source
2. Soft delete instead of hard delete
3. Option to preserve MANUAL entries
"""
import sqlite3

conn = sqlite3.connect('portfolio.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=" * 60)
print("STEP 2 VERIFICATION: Upload Logic Enhancement")
print("=" * 60)

# 1. Check transactions table schema
print("\n1. TRANSACTIONS TABLE SCHEMA CHECK")
print("-" * 40)
cur.execute("PRAGMA table_info(transactions)")
columns = {col['name']: col for col in cur.fetchall()}

required_cols = ['source', 'source_reference', 'is_deleted', 'deleted_at', 'deleted_by']
for col in required_cols:
    if col in columns:
        col_info = columns[col]
        print(f"  ✅ {col}: {col_info['type']} (default: {col_info['dflt_value']})")
    else:
        print(f"  ❌ {col}: MISSING")

# 2. Check for indexes
print("\n2. INDEXES CHECK")
print("-" * 40)
cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='transactions'")
indexes = [row['name'] for row in cur.fetchall()]
for idx in indexes:
    if 'source' in idx or 'deleted' in idx:
        print(f"  ✅ {idx}")

# 3. Check data distribution
print("\n3. DATA DISTRIBUTION")
print("-" * 40)

# By source
cur.execute("""
    SELECT source, COUNT(*) as count 
    FROM transactions 
    WHERE user_id = 2
    GROUP BY source
""")
print("  By Source:")
for row in cur.fetchall():
    print(f"    {row['source'] or 'NULL'}: {row['count']} records")

# By is_deleted
cur.execute("""
    SELECT is_deleted, COUNT(*) as count 
    FROM transactions 
    WHERE user_id = 2
    GROUP BY is_deleted
""")
print("\n  By Deletion Status:")
for row in cur.fetchall():
    status = "DELETED" if row['is_deleted'] == 1 else ("ACTIVE" if row['is_deleted'] == 0 else "NULL/ACTIVE")
    print(f"    {status}: {row['count']} records")

# 4. Check helper functions exist in ui.py
print("\n4. HELPER FUNCTIONS CHECK")
print("-" * 40)
with open('ui.py', 'r', encoding='utf-8') as f:
    content = f.read()

functions = [
    'soft_delete_transactions',
    'restore_deleted_transactions',
    'get_deleted_transactions_count'
]
for func in functions:
    if f'def {func}(' in content:
        print(f"  ✅ {func}() - defined")
    else:
        print(f"  ❌ {func}() - MISSING")

# 5. Verify soft delete is used in restore
print("\n5. SOFT DELETE IN RESTORE")
print("-" * 40)
if 'SET is_deleted = 1' in content and 'restore:' in content:
    print("  ✅ Soft delete logic found in restore")
else:
    print("  ⚠️ Soft delete may not be fully implemented")

if 'preserve_manual' in content:
    print("  ✅ Preserve manual entries option found")
else:
    print("  ⚠️ Preserve manual option not found")

# 6. Check for source_reference in INSERT
print("\n6. SOURCE TRACKING IN INSERT")
print("-" * 40)
if "source_reference = f\"restore:" in content:
    print("  ✅ source_reference generation for restore found")
else:
    print("  ⚠️ source_reference generation not found")

if "'RESTORE', source_reference" in content:
    print("  ✅ Source tracking in INSERT statement")
else:
    print("  ⚠️ Source tracking may not be in INSERT")

conn.close()

print("\n" + "=" * 60)
print("VERIFICATION COMPLETE")
print("=" * 60)
