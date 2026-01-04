"""Simple direct yfinance test with Python 3.12"""
import yfinance as yf

print("Testing yfinance with Python 3.12...")
print()

# Test 1: US stock
print("Test 1: AAPL (US stock)")
ticker = yf.Ticker("AAPL")
try:
    price = ticker.fast_info.last_price
    print(f"  ✓ Price: ${price:.2f}")
except Exception as e:
    print(f"  ✗ Error: {e}")

print()

# Test 2: Kuwait stock variants
print("Test 2: Kuwait stock (HUMANSOFT)")
for symbol in ["HUMANSOFT", "HUMANSOFT.KW", "HUMANSOFT.KSE"]:
    print(f"  Trying {symbol}...")
    ticker = yf.Ticker(symbol)
    try:
        price = ticker.fast_info.last_price
        if price:
            print(f"    ✓ Price: ${price:.2f}")
        else:
            print(f"    ✗ No price")
    except Exception as e:
        print(f"    ✗ Error: {type(e).__name__}")
