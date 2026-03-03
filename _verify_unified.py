"""Verify all 3 endpoints return the same total portfolio value."""
import requests, json

login = requests.post(
    "http://localhost:8004/api/v1/auth/login",
    json={"username": "sager alsager", "password": "Admin123!"},
)
token = login.json()["access_token"]
h = {"Authorization": f"Bearer {token}"}

# 1. Overview endpoint
ov = requests.get("http://localhost:8004/api/v1/portfolio/overview", headers=h).json()["data"]
print("=== OVERVIEW ===")
print(f"  stocks:   {ov['portfolio_value']:,.3f} KWD")
print(f"  cash:     {ov['cash_balance']:,.3f} KWD")
print(f"  TOTAL:    {ov['total_value']:,.3f} KWD")

# 2. Holdings endpoint
hd = requests.get("http://localhost:8004/api/v1/portfolio/holdings", headers=h).json()["data"]
print("\n=== HOLDINGS ===")
print(f"  stocks:   {hd['totals']['total_market_value_kwd']:,.3f} KWD")
print(f"  cash:     {hd['cash_balance_kwd']:,.3f} KWD")
print(f"  TOTAL:    {hd['total_portfolio_value_kwd']:,.3f} KWD")

# 3. Snapshot (re-save to get the live value)
snap = requests.post("http://localhost:8004/api/v1/tracker/save-snapshot", headers=h).json()["data"]
print("\n=== SNAPSHOT (re-saved) ===")
print(f"  TOTAL:    {snap['portfolio_value']:,.3f} KWD")

# 4. Compare
print("\n=== MATCH CHECK ===")
vals = [ov["total_value"], hd["total_portfolio_value_kwd"], snap["portfolio_value"]]
print(f"  Overview:  {vals[0]:,.3f}")
print(f"  Holdings:  {vals[1]:,.3f}")
print(f"  Snapshot:  {vals[2]:,.3f}")
match_ok = max(vals) - min(vals) < 0.01
print(f"  ALL MATCH: {match_ok}")
