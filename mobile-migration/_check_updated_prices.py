"""Quick check that holdings reflect updated prices."""
import requests, json

BASE = "http://127.0.0.1:8002"
r = requests.post(f"{BASE}/api/auth/login/json",
                   json={"username": "sager alsager", "password": "123456"})
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

h = requests.get(f"{BASE}/api/portfolio/holdings", headers=H).json()["data"]

print("Updated Holdings:")
for s in h["holdings"]:
    print(f"  {s['symbol']:<12} price={s['market_price']:>10.3f} {s['currency']}")

print(f"\nTotal Market Value KWD: {h['totals']['total_market_value_kwd']:.2f}")
print(f"Total Cost KWD:         {h['totals']['total_cost_kwd']:.2f}")
print(f"Total PNL KWD:          {h['totals']['total_pnl_kwd']:.2f}")
