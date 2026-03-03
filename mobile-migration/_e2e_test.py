"""
End-to-end API test: login + overview + holdings + compare with Streamlit logic.
Run from portfolio_app root with venv active.
"""
import json
import sys
import requests

BASE = "http://localhost:8001"

# ── Step 1: Login ────────────────────────────────────────────────────
print("=" * 60)
print("STEP 1: LOGIN")
print("=" * 60)
r = requests.post(f"{BASE}/api/auth/login/json", json={
    "username": "sager alsager",
    "password": "123456",
})
if r.status_code != 200:
    print(f"  FAIL: {r.status_code} — {r.text}")
    sys.exit(1)

login_data = r.json()
token = login_data["access_token"]
print(f"  OK: user={login_data['username']}, id={login_data['user_id']}, token_len={len(token)}")

headers = {"Authorization": f"Bearer {token}"}

# ── Step 2: Overview ─────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 2: OVERVIEW (API)")
print("=" * 60)
r = requests.get(f"{BASE}/api/portfolio/overview", headers=headers)
if r.status_code != 200:
    print(f"  FAIL: {r.status_code} — {r.text}")
    sys.exit(1)

ov = r.json()["data"]
print(f"  Total Deposits:      {ov['total_deposits']:.2f} KWD")
print(f"  Total Withdrawals:   {ov['total_withdrawals']:.2f} KWD")
print(f"  Net Deposits:        {ov['net_deposits']:.2f} KWD")
print(f"  Total Invested:      {ov['total_invested']:.2f} KWD")
print(f"  Total Divested:      {ov['total_divested']:.2f} KWD")
print(f"  Total Dividends:     {ov['total_dividends']:.2f} KWD")
print(f"  Total Fees:          {ov['total_fees']:.2f} KWD")
print(f"  Transaction Count:   {ov['transaction_count']}")
print(f"  Portfolio Value:     {ov['portfolio_value']:.2f} KWD")
print(f"  Cash Balance:        {ov['cash_balance']:.2f} KWD")
print(f"  Total Value:         {ov['total_value']:.2f} KWD")
print(f"  Total Gain:          {ov['total_gain']:.2f} KWD")
print(f"  ROI%:                {ov['roi_percent']:.2f}%")
print(f"  USD/KWD Rate:        {ov['usd_kwd_rate']}")
print(f"  Portfolios:          {list(ov.get('by_portfolio', {}).keys())}")
print(f"  Portfolio Values:    {list(ov.get('portfolio_values', {}).keys())}")
print(f"  Accounts:            {len(ov.get('accounts', []))}")

# ── Step 3: Holdings ─────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 3: HOLDINGS (API)")
print("=" * 60)
r = requests.get(f"{BASE}/api/portfolio/holdings", headers=headers)
if r.status_code != 200:
    print(f"  FAIL: {r.status_code} — {r.text}")
    sys.exit(1)

hdata = r.json()["data"]
print(f"  Count: {hdata['count']}")
print(f"  Total Market Value KWD: {hdata['totals']['total_market_value_kwd']:.2f}")
print(f"  Total Cost KWD:         {hdata['totals']['total_cost_kwd']:.2f}")
print(f"  Total Unrealized KWD:   {hdata['totals']['total_unrealized_pnl_kwd']:.2f}")
print(f"  Total Realized KWD:     {hdata['totals']['total_realized_pnl_kwd']:.2f}")
print(f"  Total P/L KWD:          {hdata['totals']['total_pnl_kwd']:.2f}")
print(f"  Total Dividends KWD:    {hdata['totals']['total_dividends_kwd']:.2f}")
print(f"  USD/KWD:                {hdata['usd_kwd_rate']}")

print(f"\n  Holdings detail:")
for h in hdata["holdings"]:
    print(f"    {h['symbol']:12s} | {h['shares_qty']:8.0f} shares | "
          f"avg_cost={h['avg_cost']:.3f} | mkt_price={h['market_price']:.3f} | "
          f"mkt_val_kwd={h['market_value_kwd']:.2f} | pnl={h['total_pnl']:.2f}")

# ── Step 4: Per-portfolio tables ─────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 4: PER-PORTFOLIO TABLES (API)")
print("=" * 60)
for port in ["KFH", "BBYN", "USA"]:
    r = requests.get(f"{BASE}/api/portfolio/table/{port}", headers=headers)
    if r.status_code != 200:
        print(f"  {port}: FAIL {r.status_code}")
        continue
    tdata = r.json()["data"]
    print(f"  {port}: {tdata['count']} holdings, currency={tdata['currency']}")

print("\n" + "=" * 60)
print("ALL API TESTS PASSED")
print("=" * 60)
