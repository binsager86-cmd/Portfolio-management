import yfinance as yf

print("Testing yfinance price fetching...")

# Test a US stock
print("\n1. Testing US stock (AAPL):")
ticker = yf.Ticker("AAPL")
try:
    price = ticker.fast_info.get('lastPrice')
    print(f"   fast_info price: {price}")
except Exception as e:
    print(f"   fast_info error: {e}")

try:
    hist = ticker.history(period="1d")
    if not hist.empty:
        price = hist['Close'].iloc[-1]
        print(f"   history price: {price}")
except Exception as e:
    print(f"   history error: {e}")

# Test a Kuwait stock
print("\n2. Testing Kuwait stock (ZAIN.KW):")
for variant in ["ZAIN", "ZAIN.KW", "ZAIN.KSE"]:
    print(f"   Trying {variant}:")
    ticker = yf.Ticker(variant)
    try:
        price = ticker.fast_info.get('lastPrice')
        if price:
            print(f"     fast_info price: {price}")
    except Exception as e:
        print(f"     fast_info error: {e}")
    
    try:
        hist = ticker.history(period="1d")
        if not hist.empty:
            price = hist['Close'].iloc[-1]
            print(f"     history price: {price}")
    except Exception as e:
        print(f"     history error: {e}")

print("\nTest complete!")
