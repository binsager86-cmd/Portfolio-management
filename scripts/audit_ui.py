#!/usr/bin/env python3
"""
audit_ui.py — Static analysis of ui.py to produce a feature inventory.

Analyses:
  1. All top-level functions (def / class)
  2. Navigation pages (sidebar menu items)
  3. Sub-tabs within each page
  4. Streamlit widgets used (metrics, charts, forms, uploads, downloads)
  5. Database tables (CREATE TABLE)
  6. Mobile API endpoints already built
  7. Feature-by-feature migration status

Usage:
    python scripts/audit_ui.py            # prints to stdout
    python scripts/audit_ui.py > feature_inventory.md
"""

import re
import os
import sys
from pathlib import Path
from collections import defaultdict, Counter

# Fix Windows console encoding for emoji/unicode output
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
UI_FILE = ROOT / "ui.py"
API_DIR = ROOT / "mobile-migration" / "backend-api" / "app" / "api"
MOBILE_SCREENS = ROOT / "mobile-migration" / "mobile-app" / "app"

# ── Helpers ──────────────────────────────────────────────────────────

def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines()


def count_pattern(lines: list[str], pattern: str) -> int:
    rx = re.compile(pattern, re.IGNORECASE)
    return sum(1 for l in lines if rx.search(l))


def find_pattern_lines(lines: list[str], pattern: str) -> list[tuple[int, str]]:
    rx = re.compile(pattern, re.IGNORECASE)
    return [(i + 1, l.strip()) for i, l in enumerate(lines) if rx.search(l)]


# ── Parse functions ──────────────────────────────────────────────────

def parse_functions(lines: list[str]) -> list[dict]:
    """Extract all top-level def/class with line number and docstring."""
    results = []
    rx = re.compile(r'^(def|class)\s+(\w+)')
    for i, line in enumerate(lines):
        m = rx.match(line)
        if m:
            kind = m.group(1)
            name = m.group(2)
            # Try to grab first line of docstring
            doc = ""
            for j in range(i + 1, min(i + 5, len(lines))):
                stripped = lines[j].strip()
                if stripped.startswith('"""') or stripped.startswith("'''"):
                    doc = stripped.strip('"').strip("'").strip()
                    if not doc and j + 1 < len(lines):
                        doc = lines[j + 1].strip().strip('"').strip("'").strip()
                    break
                elif stripped and not stripped.startswith('#'):
                    break
            results.append({"line": i + 1, "kind": kind, "name": name, "doc": doc})
    return results


def parse_nav_pages(lines: list[str]) -> list[str]:
    """Extract sidebar navigation page names."""
    pages = []
    # Look for nav_options list
    for i, line in enumerate(lines):
        if "nav_options" in line and "[" in line:
            # Gather lines until ]
            block = line
            j = i
            while "]" not in block and j < len(lines) - 1:
                j += 1
                block += lines[j]
            for m in re.finditer(r"'([^']+)'", block):
                pages.append(m.group(1))
            break
    return pages


def parse_menu_items(lines: list[str]) -> list[str]:
    """Extract sac.MenuItem labels from sidebar menu."""
    items = []
    for line in lines:
        m = re.search(r"sac\.MenuItem\(\s*'([^']+)'", line)
        if m:
            items.append(m.group(1))
    return items


def parse_tabs(lines: list[str]) -> list[dict]:
    """Find st.tabs() calls and the tab labels."""
    results = []
    for i, line in enumerate(lines):
        if "st.tabs(" in line:
            # Extract labels
            block = line
            j = i
            while "]" not in block and j < len(lines) - 1:
                j += 1
                block += lines[j]
            labels = re.findall(r'"([^"]+)"', block)
            if not labels:
                labels = re.findall(r"'([^']+)'", block)
            # Find which function this is inside
            func_name = "unknown"
            for k in range(i - 1, max(i - 200, 0), -1):
                fm = re.match(r'^def\s+(\w+)', lines[k])
                if fm:
                    func_name = fm.group(1)
                    break
            results.append({"line": i + 1, "function": func_name, "labels": labels})
    return results


def parse_db_tables(lines: list[str]) -> list[str]:
    """Extract CREATE TABLE names."""
    tables = set()
    for line in lines:
        m = re.search(r'CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)', line, re.IGNORECASE)
        if m:
            tables.add(m.group(1))
    return sorted(tables)


def parse_api_endpoints(api_dir: Path) -> list[dict]:
    """Parse FastAPI router endpoints."""
    endpoints = []
    if not api_dir.exists():
        return endpoints
    for py_file in api_dir.glob("*.py"):
        lines = read_lines(py_file)
        for i, line in enumerate(lines):
            m = re.search(r'@router\.(get|post|put|delete|patch)\(\s*"([^"]+)"', line)
            if m:
                method = m.group(1).upper()
                path = m.group(2)
                # Find the function name
                for j in range(i + 1, min(i + 5, len(lines))):
                    fm = re.match(r'\s*(?:async\s+)?def\s+(\w+)', lines[j])
                    if fm:
                        endpoints.append({
                            "file": py_file.name,
                            "method": method,
                            "path": path,
                            "function": fm.group(1),
                        })
                        break
    return endpoints


def parse_mobile_screens(screens_dir: Path) -> list[str]:
    """List existing mobile app screens/tabs."""
    screens = []
    if not screens_dir.exists():
        return screens
    for f in sorted(screens_dir.rglob("*.tsx")):
        rel = f.relative_to(screens_dir)
        screens.append(str(rel).replace("\\", "/"))
    return screens


# ── Classify functions by category ───────────────────────────────────

def classify_function(name: str) -> str:
    """Assign a category to a function based on naming conventions."""
    if name.startswith("ui_"):
        return "UI Page / Section"
    if name.startswith("render_"):
        return "UI Renderer"
    if name.startswith("_ui_"):
        return "UI Sub-section"
    if name.startswith("fetch_") or name.startswith("cached_fetch"):
        return "Data Fetcher"
    if name.startswith("get_") or name.startswith("load_"):
        return "Data Query"
    if name.startswith("calculate_") or name.startswith("compute_") or name.startswith("recalc"):
        return "Calculation"
    if name.startswith("create_") or name.startswith("add_") or name.startswith("record_"):
        return "Data Mutation"
    if name.startswith("validate_") or name.startswith("check_") or name.startswith("verify_"):
        return "Validation"
    if name.startswith("fix_") or name.startswith("restore_") or name.startswith("purge_"):
        return "Data Fix / Maintenance"
    if name.startswith("soft_delete") or name.startswith("master_delete"):
        return "Deletion"
    if name.startswith("migrate_") or name.startswith("backfill_") or name.startswith("seed_"):
        return "Migration / Seed"
    if name.startswith("_ensure_") or name.startswith("init_"):
        return "DB Schema / Init"
    if name.startswith("fmt_") or name.startswith("format_") or name.startswith("pct"):
        return "Formatting"
    if name.startswith("_") and not name.startswith("__"):
        return "Internal Helper"
    if name.startswith("hash_") or name.startswith("check_password") or "session" in name.lower() or "login" in name.lower() or "otp" in name.lower():
        return "Authentication"
    if "upload" in name.lower() or "excel" in name.lower():
        return "Import / Upload"
    if "export" in name.lower() or "backup" in name.lower() or "pdf" in name.lower():
        return "Export"
    if "symbol" in name.lower() or "security" in name.lower() or "alias" in name.lower():
        return "Symbol / Security Resolution"
    if "price" in name.lower() or "yf" in name.lower() or "yahoo" in name.lower() or "tradingview" in name.lower():
        return "Price Fetching"
    if "portfolio" in name.lower():
        return "Portfolio Logic"
    if "cash" in name.lower() or "deposit" in name.lower():
        return "Cash / Deposits"
    if "dividend" in name.lower() or "bonus" in name.lower():
        return "Dividends"
    if "transaction" in name.lower() or "txn" in name.lower():
        return "Transaction"
    return "Other"


# ── Migration coverage mapping ───────────────────────────────────────

# Map Streamlit page → what exists in mobile app
MIGRATION_STATUS = {
    "Overview": {
        "api": ["/overview", "/holdings", "/fx-rate"],
        "mobile": ["(tabs)/index.tsx", "(tabs)/two.tsx"],
        "status": "DONE",
        "notes": "Portfolio overview, holdings, accounts — fully wired in Phase 2-6",
    },
    "Add Cash Deposit": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Needs POST /api/deposits + mobile form screen",
    },
    "Add Transactions": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Needs POST /api/transactions + Excel upload + mobile form",
    },
    "Portfolio Analysis": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Charts, monthly breakdown, cumulative deposits — needs charting library",
    },
    "Peer Analysis": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Peer comparison, fundamental data — heavy data fetching",
    },
    "Trading Section": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Trade log, realized profit, position sizing",
    },
    "Portfolio Tracker": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Historical snapshots, Plotly charts",
    },
    "Dividends Tracker": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Dividend history, yield calculator, bonus shares",
    },
    "Planner": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Financial planner with goal tracking",
    },
    "Backup & Restore": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "DB export/import, Excel download — needs admin endpoints",
    },
    "Securities Master": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "CRUD for securities_master, aliases, symbol mapping",
    },
    "Data Integrity": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Cash audit, snapshot drift, dividend reconciliation",
    },
    "Personal Finance": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "PFM: income/expense, assets/liabilities, net worth, balance sheet",
    },
    "Fundamental Analysis": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "External module (stock_analysis) — PE, valuation models",
    },
    "AI Advisor": {
        "api": [],
        "mobile": [],
        "status": "NOT STARTED",
        "notes": "Google Gemini integration, embedded AI chat, PDF report export",
    },
    "Authentication": {
        "api": ["/login", "/login/json", "/me"],
        "mobile": ["(auth)/login.tsx"],
        "status": "DONE",
        "notes": "JWT auth, login screen, token storage — Phase 2+6",
    },
    "Cron / Price Updates": {
        "api": ["/update-prices", "/status"],
        "mobile": [],
        "status": "DONE",
        "notes": "APScheduler + manual trigger — Phase 7",
    },
    "Security Hardening": {
        "api": [],
        "mobile": [],
        "status": "DONE",
        "notes": "Rate limiting, bcrypt upgrade, env vars, .gitignore — Phase 8",
    },
    "Deployment": {
        "api": [],
        "mobile": [],
        "status": "DONE",
        "notes": "Dockerfile, render.yaml, vercel.json, eas.json, DEPLOYMENT.md — Phase 9",
    },
}


# ── Main report ──────────────────────────────────────────────────────

def main():
    lines = read_lines(UI_FILE)
    total_lines = len(lines)
    functions = parse_functions(lines)
    nav_pages = parse_nav_pages(lines)
    menu_items = parse_menu_items(lines)
    tabs = parse_tabs(lines)
    db_tables = parse_db_tables(lines)
    api_endpoints = parse_api_endpoints(API_DIR)
    mobile_screens = parse_mobile_screens(MOBILE_SCREENS)

    # Widget counts
    n_plotly = count_pattern(lines, r'plotly_chart')
    n_metrics = count_pattern(lines, r'st\.metric')
    n_downloads = count_pattern(lines, r'download_button')
    n_uploads = count_pattern(lines, r'file_uploader')
    n_forms = count_pattern(lines, r'st\.form\b')
    n_dataframes = count_pattern(lines, r'st\.dataframe|st\.data_editor')
    n_charts = count_pattern(lines, r'st\.plotly_chart|st\.bar_chart|st\.line_chart|st\.area_chart')
    n_sql = count_pattern(lines, r'SELECT\s|INSERT\s|UPDATE\s|DELETE\s')

    # Classify functions
    categories = defaultdict(list)
    for f in functions:
        cat = classify_function(f["name"])
        categories[cat].append(f)

    # ─── Output ──────────────────────────────────────────────────────

    print("# Feature Inventory — Portfolio App (`ui.py`)")
    print()
    print(f"> Auto-generated by `scripts/audit_ui.py`")
    print(f"> Source: `ui.py` ({total_lines:,} lines, {len(functions)} functions/classes)")
    print()

    # ── Summary Stats ────────────────────────────────────────────────
    print("## Summary Statistics")
    print()
    print(f"| Metric | Count |")
    print(f"|--------|-------|")
    print(f"| Total Lines | {total_lines:,} |")
    print(f"| Functions/Classes | {len(functions)} |")
    print(f"| Navigation Pages | {len(nav_pages)} |")
    print(f"| Sub-tab Groups | {len(tabs)} |")
    print(f"| Database Tables | {len(db_tables)} |")
    print(f"| `st.metric` Cards | {n_metrics} |")
    print(f"| Plotly/Charts | {n_charts} |")
    print(f"| Download Buttons | {n_downloads} |")
    print(f"| File Uploaders | {n_uploads} |")
    print(f"| Forms | {n_forms} |")
    print(f"| DataFrames/Editors | {n_dataframes} |")
    print(f"| SQL Statements | {n_sql} |")
    print()

    # ── Navigation Pages ─────────────────────────────────────────────
    print("## Navigation Pages (Sidebar Menu)")
    print()
    all_pages = menu_items if menu_items else nav_pages
    for p in all_pages:
        print(f"- {p}")
    print()

    # ── Sub-tabs per page ────────────────────────────────────────────
    print("## Sub-Tabs Within Pages")
    print()
    for t in tabs:
        labels_str = " | ".join(t["labels"]) if t["labels"] else "(dynamic)"
        print(f"- **{t['function']}** (line {t['line']}): {labels_str}")
    print()

    # ── Database Tables ──────────────────────────────────────────────
    print("## Database Tables (SQLite)")
    print()
    for i, t in enumerate(db_tables, 1):
        print(f"{i:2d}. `{t}`")
    print()

    # ── Functions by Category ────────────────────────────────────────
    print("## Functions by Category")
    print()
    for cat in sorted(categories.keys()):
        funcs = categories[cat]
        print(f"### {cat} ({len(funcs)})")
        print()
        print(f"| Line | Name | Description |")
        print(f"|------|------|-------------|")
        for f in sorted(funcs, key=lambda x: x["line"]):
            kind_prefix = "🏗️ " if f["kind"] == "class" else ""
            doc_short = (f["doc"][:80] + "…") if len(f["doc"]) > 80 else f["doc"]
            print(f"| {f['line']} | `{kind_prefix}{f['name']}` | {doc_short} |")
        print()

    # ── Mobile API Endpoints ─────────────────────────────────────────
    print("## Mobile API Endpoints (FastAPI Backend)")
    print()
    if api_endpoints:
        print(f"| Method | Path | Function | File |")
        print(f"|--------|------|----------|------|")
        for ep in api_endpoints:
            prefix_map = {"auth.py": "/api/auth", "portfolio.py": "/api/portfolio", "cron.py": "/api/cron"}
            prefix = prefix_map.get(ep["file"], "/api")
            print(f"| {ep['method']} | `{prefix}{ep['path']}` | `{ep['function']}` | {ep['file']} |")
    else:
        print("_No API endpoints found._")
    print()

    # ── Mobile App Screens ───────────────────────────────────────────
    print("## Mobile App Screens (Expo)")
    print()
    if mobile_screens:
        for s in mobile_screens:
            print(f"- `{s}`")
    else:
        print("_No screens found._")
    print()

    # ── Migration Coverage Matrix ────────────────────────────────────
    print("## Migration Coverage Matrix")
    print()
    print("| Feature | Streamlit | API | Mobile | Status |")
    print("|---------|-----------|-----|--------|--------|")

    done_count = 0
    total_features = len(MIGRATION_STATUS)
    for feature, info in MIGRATION_STATUS.items():
        st_col = "✅"  # All features exist in Streamlit
        api_col = "✅ " + ", ".join(info["api"]) if info["api"] else "❌"
        mob_col = "✅ " + ", ".join(info["mobile"]) if info["mobile"] else "❌"
        status = info["status"]
        badge = {"DONE": "✅ DONE", "PARTIAL": "🟡 PARTIAL", "NOT STARTED": "❌ TODO"}.get(status, status)
        if status == "DONE":
            done_count += 1
        print(f"| **{feature}** | {st_col} | {api_col} | {mob_col} | {badge} |")

    print()
    print(f"> **Migration progress: {done_count}/{total_features} features complete "
          f"({done_count/total_features*100:.0f}%)**")
    print()

    # ── Unmigrated Features Detail ───────────────────────────────────
    print("## Unmigrated Features — What's Needed")
    print()
    for feature, info in MIGRATION_STATUS.items():
        if info["status"] != "DONE":
            print(f"### {feature}")
            print()
            print(f"- **Notes:** {info['notes']}")
            # Find the main ui_ function for this page
            page_func_map = {
                "Add Cash Deposit": "ui_cash_deposits",
                "Add Transactions": "ui_transactions",
                "Portfolio Analysis": "ui_portfolio_analysis",
                "Peer Analysis": "ui_peer_analysis",
                "Trading Section": "ui_trading_section",
                "Portfolio Tracker": "ui_portfolio_tracker",
                "Dividends Tracker": "ui_dividends_tracker",
                "Planner": "ui_financial_planner",
                "Backup & Restore": "ui_backup_restore",
                "Securities Master": "ui_securities_master",
                "Data Integrity": "ui_data_integrity",
                "Personal Finance": "ui_pfm",
                "Fundamental Analysis": "ui_fundamental_analysis",
                "AI Advisor": "render_embedded_ai",
            }
            func_name = page_func_map.get(feature)
            if func_name:
                for f in functions:
                    if f["name"] == func_name:
                        print(f"- **Source:** `ui.py` line {f['line']} → `{func_name}()`")
                        break
            # List needed API endpoints
            print(f"- **API needed:** POST/GET endpoints for data CRUD")
            print(f"- **Mobile needed:** New screen + navigation entry")
            print()

    # ── Key Helper Functions for Mobile Backend ──────────────────────
    print("## Key Backend-Portable Functions")
    print()
    print("These functions contain business logic that can be extracted into FastAPI services:")
    print()
    portable_categories = [
        "Calculation", "Data Query", "Data Mutation", "Validation",
        "Portfolio Logic", "Cash / Deposits", "Dividends", "Transaction",
        "Price Fetching", "Symbol / Security Resolution",
    ]
    for cat in portable_categories:
        if cat in categories:
            funcs = categories[cat]
            print(f"### {cat} ({len(funcs)} functions)")
            print()
            for f in sorted(funcs, key=lambda x: x["line"]):
                doc_short = f["doc"][:60] if f["doc"] else ""
                print(f"- `{f['name']}` (line {f['line']}) {doc_short}")
            print()


if __name__ == "__main__":
    main()
