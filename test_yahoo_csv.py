"""Test Yahoo Finance CSV endpoint (no library needed)"""
import requests

def fetch_price_yahoo_csv(symbol):
    """Fetch price using Yahoo Finance CSV download endpoint"""
    # Try different suffix variants for Kuwait stocks
    variants = [symbol, f"{symbol}.KW", f"{symbol}.KSE"]
    
    for variant in variants:
        try:
            # Yahoo Finance CSV endpoint
            url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={variant}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                results = data.get('quoteResponse', {}).get('result', [])
                if results:
                    price = results[0].get('regularMarketPrice')
                    if price:
                        print(f"✓ {variant}: ${price}")
                        return price
                    
        except Exception as e:
            print(f"✗ {variant}: {e}")
            
    print(f"✗ No price found for {symbol}")
    return None

# Test various symbols
print("=== Testing Yahoo Finance CSV Endpoint ===")
fetch_price_yahoo_csv("AAPL")
fetch_price_yahoo_csv("HUMANSOFT")
fetch_price_yahoo_csv("KIB")
