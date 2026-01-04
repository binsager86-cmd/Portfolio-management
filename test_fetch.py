import sys
print('Python:', sys.executable)
from ui import tradingview_search, map_to_tradingview, fetch_price_tradingview_by_tv_symbol
import re

# Test 1: Search TradingView with exchange
print("\\n=== Test 1: TradingView Search (with exchange=KSE) ===")
results, err = tradingview_search("HUMANSOFT", exchange="KSE", limit=5)
if err:
    print(f"Error: {err}")
else:
    print(f"Found {len(results)} results:")
    for r in results[:2]:
        sym = re.sub(r'<[^>]+>', '', r.get('symbol', ''))  # strip HTML
        print(f"  - {r.get('exchange')}:{sym} - {r.get('full_name') or r.get('description')}")

# Test 2: Map to TradingView
print("\\n=== Test 2: Map to TradingView ===")
cands = map_to_tradingview("HUMANSOFT", exchange="KSE")
print(f"Found {len(cands)} candidates:")
for c in cands[:2]:
    print(f"  - {c['exchange']}:{c['tv_symbol']} - {c.get('full_name')}")

# Test 3: Fetch price
print("\\n=== Test 3: Fetch Price ===")
if cands:
    tv_exch = cands[0]['exchange']
    tv_sym = cands[0]['tv_symbol']
    price, debug = fetch_price_tradingview_by_tv_symbol(tv_exch, tv_sym)
    if price:
        print(f"Price for {tv_exch}:{tv_sym} = {price}")
    else:
        print(f"No price found. Debug: {debug[:200]}")

