"""
Compare API output vs direct DB queries (what Streamlit would compute).
This validates that the FastAPI backend produces the same numbers as the legacy Streamlit app.
"""
import sqlite3, os, sys, json, requests

BASE = "http://127.0.0.1:8001"
DB = os.path.join(os.path.dirname(__file__), "dev_portfolio.db")
USER_ID = 1

# ── Login ────────────────────────────────────────────────────────────
r = requests.post(f"{BASE}/api/auth/login/json", json={"username": "sager alsager", "password": "123456"})
assert r.status_code == 200, f"Login failed: {r.text}"
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

# ── API overview ─────────────────────────────────────────────────────
api = requests.get(f"{BASE}/api/portfolio/overview", headers=H).json()["data"]

# ── Direct DB queries (same logic as ui.py) ──────────────────────────
conn = sqlite3.connect(DB)
cur = conn.cursor()

# 1. Cash deposits (all rows are deposits — no 'type' column)
cur.execute("SELECT COALESCE(SUM(amount),0) FROM cash_deposits WHERE user_id=?", (USER_ID,))
db_deposits = cur.fetchone()[0]
db_withdrawals = 0.0  # No withdrawal rows in this table

# 2. Transaction aggregates from portfolio_transactions (txn_types are UPPERCASE)
cur.execute("""
    SELECT
        COALESCE(SUM(CASE WHEN txn_type='DEPOSIT' THEN amount ELSE 0 END),0) AS deposits,
        COALESCE(SUM(CASE WHEN txn_type='WITHDRAWAL' THEN amount ELSE 0 END),0) AS withdrawals,
        COALESCE(SUM(CASE WHEN txn_type='BUY' THEN amount ELSE 0 END),0) AS invested,
        COALESCE(SUM(CASE WHEN txn_type='SELL' THEN amount ELSE 0 END),0) AS divested,
        COALESCE(SUM(CASE WHEN txn_type='DIVIDEND' THEN amount ELSE 0 END),0) AS dividends,
        COUNT(*) AS cnt
    FROM portfolio_transactions WHERE user_id=?
""", (USER_ID,))
pt_row = cur.fetchone()
pt_deposits, pt_withdrawals, pt_invested, pt_divested, pt_dividends, pt_cnt = pt_row

# 3. External accounts (cash balance)
cur.execute("SELECT name, current_balance, currency FROM external_accounts WHERE user_id=?", (USER_ID,))
accounts = cur.fetchall()

# 4. Portfolios info
cur.execute("SELECT id, name FROM portfolios WHERE user_id=?", (USER_ID,))
portfolios = cur.fetchall()

# 5. Stocks + their prices 
cur.execute("SELECT symbol, current_price, currency, portfolio FROM stocks WHERE user_id=?", (USER_ID,))
stocks = cur.fetchall()

# 6. Transaction details for holdings calc
PORTFOLIO_CCY = {"KFH": "KWD", "BBYN": "KWD", "USA": "USD"}

def compute_wac(txs):
    """Replicate compute_holdings_avg_cost from ui.py"""
    shares = 0.0
    cost = 0.0
    realized = 0.0
    cash_div = 0.0
    bonus_total = 0.0

    for row in txs:
        _id, sym, txn_date, txn_type, purchase_cost, sell_value, sh, bonus, cdiv, fees, created_at = row
        sh = float(sh or 0)
        fees = float(fees or 0)
        buy_cost = float(purchase_cost or 0)
        sell_val = float(sell_value or 0)
        bonus = float(bonus or 0)
        cdiv_val = float(cdiv or 0)

        cash_div += cdiv_val
        bonus_total += bonus

        if txn_type == "Buy":
            shares += sh
            cost += (buy_cost + fees)
        elif txn_type == "Sell":
            if shares > 0 and sh > 0:
                avg = cost / shares
                proceeds = sell_val - fees
                cost_sold = avg * sh
                realized += (proceeds - cost_sold)
                cost -= cost_sold
                shares -= sh
        if bonus > 0:
            shares += bonus

    shares = max(shares, 0.0)
    if shares <= 0:
        return {"shares": 0, "cost_basis": 0, "avg_cost": 0, "realized": 0, "cash_div": cash_div}
    cost = max(cost, 0.0)
    return {"shares": shares, "cost_basis": cost, "avg_cost": cost/shares, "realized": realized, "cash_div": cash_div}


# Build portfolio tables from transactions
print("="*70)
print("DIRECT DB vs API COMPARISON")
print("="*70)

# ── Compare overview numbers ─────────────────────────────────────────
print("\n--- OVERVIEW: portfolio_transactions aggregates ---")
print(f"  {'Metric':<25} {'API':>15} {'DB':>15} {'Match':>8}")
print(f"  {'-'*63}")

def compare(label, api_val, db_val, tol=0.02):
    diff = abs(api_val - db_val)
    match = "OK" if diff < tol else f"DIFF={diff:.2f}"
    print(f"  {label:<25} {api_val:>15.2f} {db_val:>15.2f} {match:>8}")
    return diff < tol

all_ok = True
all_ok &= compare("Total Deposits", api["total_deposits"], pt_deposits)
all_ok &= compare("Total Withdrawals", api["total_withdrawals"], pt_withdrawals)
all_ok &= compare("Total Invested", api["total_invested"], pt_invested)
all_ok &= compare("Total Divested", api["total_divested"], pt_divested)
all_ok &= compare("Total Dividends", api["total_dividends"], pt_dividends)
print(f"  {'Txn Count':<25} {api['transaction_count']:>15} {pt_cnt:>15} {'OK' if api['transaction_count']==pt_cnt else 'DIFF':>8}")

# ── Compare per-stock holdings ───────────────────────────────────────
print("\n--- HOLDINGS: per-stock WAC calculation ---")
print(f"  {'Port/Stock':<16} {'Metric':<12} {'API':>12} {'DB':>12} {'Match':>8}")
print(f"  {'-'*60}")

api_holdings_resp = requests.get(f"{BASE}/api/portfolio/holdings", headers=H).json()["data"]
api_holdings = api_holdings_resp["holdings"]

# Build DB holdings keyed by (portfolio, symbol)
from collections import defaultdict
db_holdings = {}
for port_name, port_ccy in PORTFOLIO_CCY.items():
    cur.execute("""
        SELECT id, TRIM(stock_symbol) as sym, txn_date, txn_type,
               purchase_cost, sell_value, shares, bonus_shares, cash_dividend, fees, created_at
        FROM transactions
        WHERE user_id=? AND portfolio=?
        ORDER BY txn_date ASC, created_at ASC, id ASC
    """, (USER_ID, port_name))
    all_txs = cur.fetchall()
    
    by_sym = defaultdict(list)
    for tx in all_txs:
        by_sym[tx[1].strip()].append(tx)
    
    for sym, txs in by_sym.items():
        wac = compute_wac(txs)
        if wac["shares"] >= 0.001:
            db_holdings[(port_name, sym)] = wac

# Match API holdings to DB holdings by shares count (handles duplicate symbols)
api_used = set()
for key, wac in sorted(db_holdings.items()):
    port_name, sym = key
    db_shares = wac["shares"]
    
    # Find best matching API holding: same symbol, closest shares count, not yet used
    candidates = [(i, h) for i, h in enumerate(api_holdings) 
                  if h["symbol"] == sym and i not in api_used]
    
    if not candidates:
        print(f"  {port_name}/{sym:<10} NOT FOUND IN API!")
        all_ok = False
        continue
    
    # Pick the one with closest shares count
    best_idx, ah = min(candidates, key=lambda x: abs(x[1].get("shares_qty", 0) - db_shares))
    api_used.add(best_idx)
    
    api_shares = ah.get("shares_qty", 0)
    ok1 = abs(db_shares - api_shares) < 1.0  # allow small float diffs
    label = f"{port_name}/{sym}"
    print(f"  {label:<16} {'shares':<12} {api_shares:>12.0f} {db_shares:>12.0f} {'OK' if ok1 else 'DIFF':>8}")
    
    db_avg = wac["avg_cost"]
    api_avg = ah.get("avg_cost", 0)
    ok2 = abs(db_avg - api_avg) < 0.001
    print(f"  {'':<16} {'avg_cost':<12} {api_avg:>12.6f} {db_avg:>12.6f} {'OK' if ok2 else 'DIFF':>8}")
    
    db_cost = wac["cost_basis"]
    api_cost = ah.get("total_cost", 0)
    ok3 = abs(db_cost - api_cost) < 0.5
    print(f"  {'':<16} {'total_cost':<12} {api_cost:>12.2f} {db_cost:>12.2f} {'OK' if ok3 else 'DIFF':>8}")
    
    all_ok &= ok1 and ok2 and ok3

# ── Compare cash balances ────────────────────────────────────────────
print("\n--- CASH BALANCES: external_accounts ---")
for acc in accounts:
    name, balance, ccy = acc
    api_acc = [a for a in api.get("accounts", []) if a.get("name") == name]
    if api_acc:
        api_bal = api_acc[0].get("balance", 0)
        ok = abs(float(balance) - api_bal) < 0.01
        print(f"  {name:<20} API={api_bal:>12.2f} DB={float(balance):>12.2f} {'OK' if ok else 'DIFF':>8}")
        all_ok &= ok
    else:
        print(f"  {name} NOT FOUND IN API!")

# ── FX Rate ──────────────────────────────────────────────────────────
print(f"\n--- FX RATE ---")
print(f"  USD/KWD from API: {api.get('usd_kwd_rate', 'N/A')}")

# ── Overall result ───────────────────────────────────────────────────
print(f"\n{'='*70}")
if all_ok:
    print("RESULT: ALL COMPARISONS MATCH — API matches DB/Streamlit logic")
else:
    print("RESULT: DISCREPANCIES FOUND — see DIFF items above")
print(f"{'='*70}")

conn.close()
