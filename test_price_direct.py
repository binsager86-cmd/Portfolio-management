import requests
import json
import urllib.parse

# Test direct TradingView endpoints for price
symbol = "KSE:HUMANSOFT"

print(f"Testing price fetch for {symbol}\n")

# Method 1: Try the quotes widget endpoint
print("=== Method 1: Quotes widget endpoint ===")
try:
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0"})
    s.get("https://www.tradingview.com/", timeout=10)
    
    q = urllib.parse.quote_plus(symbol)
    url1 = f"https://tvc4.forexpros.com/quotes/?symbols={q}"
    r1 = s.get(url1, timeout=15)
    print(f"Status: {r1.status_code}")
    if r1.status_code == 200:
        data = r1.json()
        print(f"Response: {json.dumps(data, indent=2)[:500]}")
except Exception as e:
    print(f"Error: {e}")

# Method 2: Try scanner endpoint (more reliable)
print("\n=== Method 2: Scanner endpoint ===")
try:
    url2 = "https://scanner.tradingview.com/symbol"
    payload = {
        "symbols": {"tickers": [symbol]},
        "columns": ["close", "open", "high", "low", "volume"]
    }
    r2 = s.post(url2, json=payload, timeout=15)
    print(f"Status: {r2.status_code}")
    if r2.status_code == 200:
        data2 = r2.json()
        print(f"Response: {json.dumps(data2, indent=2)[:500]}")
except Exception as e:
    print(f"Error: {e}")

# Method 3: Try get-symbol endpoint
print("\n=== Method 3: Get-symbol endpoint ===")
try:
    url3 = f"https://symbol-search.tradingview.com/symbol_info/?symbol={urllib.parse.quote(symbol)}"
    r3 = s.get(url3, timeout=15)
    print(f"Status: {r3.status_code}")
    if r3.status_code == 200:
        data3 = r3.json()
        print(f"Response: {json.dumps(data3, indent=2)[:500]}")
except Exception as e:
    print(f"Error: {e}")
