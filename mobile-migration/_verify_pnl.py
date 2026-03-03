"""Quick P&L verification across all holdings."""
import requests, json

r = requests.post('http://127.0.0.1:8001/api/auth/login/json',
                   json={'username':'sager alsager','password':'123456'})
t = r.json()['access_token']
H = {'Authorization': f'Bearer {t}'}

h = requests.get('http://127.0.0.1:8001/api/portfolio/holdings', headers=H).json()['data']

print("HOLDINGS P/L VERIFICATION:")
hdr = f"{'Symbol':<12} {'Shares':>8} {'AvgCost':>10} {'MktPrice':>10} {'Unrealized':>12} {'Realized':>10} {'Dividends':>10} {'TotalPNL':>10}"
print(hdr)
print("-" * len(hdr))

for s in h['holdings']:
    # Verify: total_pnl = unrealized + realized + dividends
    expected_pnl = s['unrealized_pnl'] + s['realized_pnl'] + s['cash_dividends']
    match = "OK" if abs(expected_pnl - s['total_pnl']) < 0.01 else "MISMATCH"
    print(f"{s['symbol']:<12} {s['shares_qty']:>8.0f} {s['avg_cost']:>10.3f} {s['market_price']:>10.3f} "
          f"{s['unrealized_pnl']:>12.3f} {s['realized_pnl']:>10.3f} {s['cash_dividends']:>10.3f} {s['total_pnl']:>10.3f}  {match}")

print()
totals = h['totals']
print(f"TOTALS (KWD): mkt_val={totals['total_market_value_kwd']:.2f}  cost={totals['total_cost_kwd']:.2f}  "
      f"unreal={totals['total_unrealized_pnl_kwd']:.2f}  real={totals['total_realized_pnl_kwd']:.2f}  "
      f"pnl={totals['total_pnl_kwd']:.2f}  div={totals['total_dividends_kwd']:.2f}")

# Verify total_pnl = unrealized + realized + dividends at aggregate level
expected_total_pnl = totals['total_unrealized_pnl_kwd'] + totals['total_realized_pnl_kwd'] + totals['total_dividends_kwd']
print(f"\nPNL formula check: {totals['total_unrealized_pnl_kwd']:.2f} + {totals['total_realized_pnl_kwd']:.2f} + {totals['total_dividends_kwd']:.2f} = {expected_total_pnl:.2f}")
print(f"API total_pnl: {totals['total_pnl_kwd']:.2f}")
print(f"PNL formula: {'PASS' if abs(expected_total_pnl - totals['total_pnl_kwd']) < 0.01 else 'FAIL'}")


# Verify overview consistency
o = requests.get('http://127.0.0.1:8001/api/portfolio/overview', headers=H).json()['data']
print(f"\nOVERVIEW CONSISTENCY:")
print(f"  Portfolio Value (overview): {o['portfolio_value']:.2f}")
print(f"  Portfolio Value (holdings): {totals['total_market_value_kwd']:.2f}")
pv_match = abs(o['portfolio_value'] - totals['total_market_value_kwd']) < 0.01
print(f"  Match: {'PASS' if pv_match else 'FAIL'}")

print(f"\n  ROI = (total_value / net_deposits - 1) × 100")
print(f"  = ({o['total_value']:.2f} / {o['net_deposits']:.2f} - 1) × 100")
expected_roi = ((o['total_value'] / o['net_deposits']) - 1) * 100 if o['net_deposits'] > 0 else 0
print(f"  = {expected_roi:.2f}%  (API: {o['roi_percent']:.2f}%)")
print(f"  ROI formula: {'PASS' if abs(expected_roi - o['roi_percent']) < 0.01 else 'FAIL'}")

print(f"\n  Total Gain = total_value - net_deposits")
print(f"  = {o['total_value']:.2f} - {o['net_deposits']:.2f} = {o['total_value'] - o['net_deposits']:.2f}")
print(f"  API total_gain: {o['total_gain']:.2f}")
gain_match = abs((o['total_value'] - o['net_deposits']) - o['total_gain']) < 0.01
print(f"  Gain formula: {'PASS' if gain_match else 'FAIL'}")
