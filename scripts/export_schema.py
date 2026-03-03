"""Export SQLite schema from both database files and document FK relationships."""
import sqlite3
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DB_FILES = [
    (os.path.join(BASE, "portfolio.db"), "PRODUCTION (portfolio.db)"),
    (os.path.join(BASE, "mobile-migration", "dev_portfolio.db"), "DEV/BACKEND (dev_portfolio.db)"),
]

output_lines = []

def out(line=""):
    output_lines.append(line)
    print(line)

def export_schema(db_path, label):
    if not os.path.exists(db_path):
        out(f"\n-- {label}: FILE NOT FOUND at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    out("=" * 80)
    out(f"-- {label}")
    out(f"-- Path: {db_path}")
    out(f"-- Size: {os.path.getsize(db_path):,} bytes")
    out("=" * 80)

    # List tables with row counts
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()]

    out(f"\n-- Tables: {len(tables)}")
    for t in tables:
        cnt = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        out(f"--   {t}: {cnt:,} rows")

    # Full CREATE statements
    out(f"\n-- ===== CREATE TABLE statements =====\n")
    for t in tables:
        row = cur.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (t,)
        ).fetchone()
        if row and row[0]:
            out(row[0] + ";\n")

    # Indexes
    indexes = cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
    ).fetchall()
    if indexes:
        out("-- ===== INDEXES =====\n")
        for idx in indexes:
            out(idx[0] + ";\n")

    # Views
    views = cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL ORDER BY name"
    ).fetchall()
    if views:
        out("-- ===== VIEWS =====\n")
        for v in views:
            out(v[0] + ";\n")

    # Triggers
    triggers = cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL ORDER BY name"
    ).fetchall()
    if triggers:
        out("-- ===== TRIGGERS =====\n")
        for tr in triggers:
            out(tr[0] + ";\n")

    conn.close()
    return tables


def analyze_foreign_keys(db_path, label):
    """Analyze implicit and explicit FK relationships."""
    if not os.path.exists(db_path):
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    out("\n" + "=" * 80)
    out(f"-- FOREIGN KEY ANALYSIS: {label}")
    out("=" * 80)

    # 1. Explicit FOREIGN KEY constraints (from PRAGMA)
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()]

    out("\n-- 1. EXPLICIT FOREIGN KEY constraints (PRAGMA foreign_key_list)")
    explicit_fks = []
    for t in tables:
        fks = cur.execute(f'PRAGMA foreign_key_list("{t}")').fetchall()
        for fk in fks:
            # id, seq, table, from, to, on_update, on_delete, match
            explicit_fks.append({
                "from_table": t,
                "from_col": fk[3],
                "to_table": fk[2],
                "to_col": fk[4],
                "on_update": fk[5],
                "on_delete": fk[6],
            })
            out(f"--   {t}.{fk[3]} -> {fk[2]}.{fk[4]}  (ON UPDATE {fk[5]}, ON DELETE {fk[6]})")

    if not explicit_fks:
        out("--   (none found)")

    # 2. Implicit FK relationships (columns named *_id, user_id, stock_id, etc.)
    out("\n-- 2. IMPLICIT FK relationships (inferred from column naming patterns)")
    
    # Build a map of table -> columns
    table_cols = {}
    for t in tables:
        cols = cur.execute(f'PRAGMA table_info("{t}")').fetchall()
        table_cols[t] = [(c[1], c[2], c[5]) for c in cols]  # name, type, pk

    # Common FK patterns
    fk_patterns = {
        "user_id": ("users", "id"),
        "stock_id": ("stocks", "id"),
        "transaction_id": ("transactions", "id"),
        "portfolio_id": ("portfolios", "id"),
        "asset_id": ("assets", "id"),
        "security_id": ("securities_master", "id"),
        "parent_id": None,  # self-reference, context-dependent
        "account_id": ("external_accounts", "id"),
        "snapshot_id": ("daily_snapshots", "id"),
    }

    implicit_fks = []
    for t, cols in table_cols.items():
        for col_name, col_type, is_pk in cols:
            if col_name in fk_patterns and not is_pk:
                target = fk_patterns[col_name]
                if target:
                    target_table, target_col = target
                    exists = target_table in table_cols
                    status = "OK" if exists else "TARGET MISSING"
                    implicit_fks.append({
                        "from_table": t,
                        "from_col": col_name,
                        "to_table": target_table,
                        "to_col": target_col,
                        "status": status,
                    })
                    out(f"--   {t}.{col_name} -> {target_table}.{target_col}  [{status}]")
                else:
                    out(f"--   {t}.{col_name} -> (self-reference or context-dependent)")

    # 3. Column inventory per table
    out("\n-- 3. FULL COLUMN INVENTORY (for PostgreSQL migration planning)")
    for t in tables:
        cols = cur.execute(f'PRAGMA table_info("{t}")').fetchall()
        out(f"\n--   TABLE: {t}")
        out(f"--   {'Column':<30} {'Type':<20} {'NotNull':<8} {'Default':<15} {'PK'}")
        out(f"--   {'-'*30} {'-'*20} {'-'*8} {'-'*15} {'-'*3}")
        for c in cols:
            # cid, name, type, notnull, dflt_value, pk
            out(f"--   {c[1]:<30} {c[2] or 'TEXT':<20} {bool(c[3])!s:<8} {str(c[4] or ''):<15} {'PK' if c[5] else ''}")

    # 4. SQLite-specific patterns that need PostgreSQL migration attention
    out("\n-- 4. POSTGRESQL MIGRATION NOTES")
    out("--   - SQLite has no ENUM type -> use PostgreSQL ENUM or CHECK constraints")
    out("--   - SQLite INTEGER PRIMARY KEY -> PostgreSQL SERIAL or BIGSERIAL")
    out("--   - SQLite has no native BOOLEAN -> map INTEGER 0/1 to BOOLEAN")
    out("--   - SQLite REAL -> PostgreSQL NUMERIC or DOUBLE PRECISION")
    out("--   - SQLite TEXT dates (ISO strings) -> PostgreSQL DATE or TIMESTAMP")
    out("--   - SQLite created_at as int(time.time()) -> PostgreSQL TIMESTAMP WITH TIME ZONE")
    out("--   - SQLite has no schema enforcement on types (type affinity) -> PostgreSQL is strict")
    out("--   - FOREIGN KEY enforcement: SQLite off by default, PostgreSQL always on")

    # 5. Identify columns that need type mapping
    out("\n-- 5. TYPE MIGRATION MAP")
    type_map = {
        "INTEGER": "INTEGER (or SERIAL for PKs, BOOLEAN for flags)",
        "REAL": "NUMERIC(precision, scale) or DOUBLE PRECISION",
        "TEXT": "TEXT or VARCHAR(n) or DATE/TIMESTAMP",
        "BLOB": "BYTEA",
        "": "TEXT (SQLite default)",
    }
    sqlite_types_used = set()
    for t, cols in table_cols.items():
        for col_name, col_type, _ in cols:
            sqlite_types_used.add(col_type.upper() if col_type else "")

    for st in sorted(sqlite_types_used):
        pg = type_map.get(st, f"CHECK: {st}")
        out(f"--   SQLite {st or '(none)':<20} -> PostgreSQL {pg}")

    conn.close()


# Main execution
for db_path, label in DB_FILES:
    export_schema(db_path, label)

out("\n")
for db_path, label in DB_FILES:
    analyze_foreign_keys(db_path, label)

# Write output
schema_file = os.path.join(BASE, "schema_current.sql")
with open(schema_file, "w", encoding="utf-8") as f:
    f.write("\n".join(output_lines))

print(f"\n\nWritten to: {schema_file}")
