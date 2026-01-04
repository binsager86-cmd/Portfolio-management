import sys
print('Python:', sys.executable)
print()

from ui import fetch_price_yfinance, map_to_tradingview, fetch_price_tradingview_by_tv_symbol

# Test yfinance price fetch
print("=== Test 1: yfinance Price Fetch ===")
test_symbols = ["HUMANSOFT", "KIB", "AAPL"]
for sym in test_symbols:
    price, used = fetch_price_yfinance(sym)
    if price:
        print(f"✓ {sym}: ${price:.4f} (via {used})")
    else:
        print(f"✗ {sym}: No price found via yfinance")

# Test TradingView mapping
print("\n=== Test 2: TradingView Mapping ===")
cands = map_to_tradingview("HUMANSOFT", exchange="KSE")
if cands:
    print(f"Found {len(cands)} TradingView candidates:")
    for c in cands[:3]:
        print(f"  - {c['exchange']}:{c['tv_symbol']} - {c['full_name']}")
else:
    print("No TradingView candidates found")

# Test TradingView price fetch (if mapping worked)
print("\n=== Test 3: TradingView Price Fetch ===")
if cands:
    c = cands[0]
    price, debug = fetch_price_tradingview_by_tv_symbol(c['exchange'], c['tv_symbol'])
    if price:
        print(f"✓ {c['exchange']}:{c['tv_symbol']}: ${price:.4f}")
    else:
        print(f"✗ {c['exchange']}:{c['tv_symbol']}: {debug}")
else:
    print("Skipped (no candidates)")

print("\n=== Summary ===")
print("Price fetching will try yfinance first (with .KW, .KSE suffixes)")
print("If yfinance fails, fallback to TradingView (best-effort)")
