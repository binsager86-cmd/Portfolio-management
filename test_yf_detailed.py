import yfinance as yf
import time

print("Testing yfinance price fetching...\n")

# Test 1: US Stock
print("=" * 50)
print("Test 1: US Stock (AAPL)")
print("=" * 50)
try:
    ticker = yf.Ticker("AAPL")
    
    # Method 1: info
    print("\nMethod 1: ticker.info")
    try:
        info = ticker.info
        price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose')
        print(f"  Result: ${price}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # Method 2: history
    print("\nMethod 2: ticker.history(period='5d')")
    try:
        hist = ticker.history(period="5d")
        if not hist.empty:
            price = hist['Close'].iloc[-1]
            print(f"  Result: ${price}")
            print(f"  Dates available: {len(hist)} days")
        else:
            print("  Result: Empty dataframe")
    except Exception as e:
        print(f"  Error: {e}")
    
except Exception as e:
    print(f"Failed to create ticker: {e}")

# Test 2: Kuwait Stock
print("\n" + "=" * 50)
print("Test 2: Kuwait Stock (ZAIN)")
print("=" * 50)

for variant in ["ZAIN", "ZAIN.KW", "ZAIN.KSE"]:
    print(f"\nTrying {variant}...")
    try:
        ticker = yf.Ticker(variant)
        
        # Try info
        try:
            info = ticker.info
            price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose')
            if price:
                print(f"  ✓ info: {price} fils → {price/1000:.3f} KWD")
        except:
            pass
        
        # Try history
        try:
            hist = ticker.history(period="5d")
            if not hist.empty:
                price = hist['Close'].iloc[-1]
                print(f"  ✓ history: {price} fils → {price/1000:.3f} KWD")
        except:
            pass
        
    except Exception as e:
        print(f"  Error: {e}")
    
    time.sleep(0.5)

# Test 3: FX Rate
print("\n" + "=" * 50)
print("Test 3: USD/KWD Exchange Rate")
print("=" * 50)
try:
    ticker = yf.Ticker("KWD=X")
    
    print("\nMethod 1: ticker.info")
    try:
        info = ticker.info
        rate = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose')
        if rate:
            print(f"  Result: {rate}")
    except Exception as e:
        print(f"  Error: {e}")
    
    print("\nMethod 2: ticker.history(period='5d')")
    try:
        hist = ticker.history(period="5d")
        if not hist.empty:
            rate = hist['Close'].iloc[-1]
            print(f"  Result: {rate}")
            print(f"  Dates: {hist.index.tolist()}")
        else:
            print("  Result: Empty")
    except Exception as e:
        print(f"  Error: {e}")
        
except Exception as e:
    print(f"Failed: {e}")

print("\n" + "=" * 50)
print("Test Complete")
print("=" * 50)
