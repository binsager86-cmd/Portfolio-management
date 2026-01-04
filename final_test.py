#!/usr/bin/env python3
"""Final verification test"""
import sys
sys.path.insert(0, r'C:\Users\Sager\OneDrive\Desktop\portfolio_app')

print("=" * 60)
print("FINAL VERIFICATION TEST")
print("=" * 60)

# Test environment
print(f"\nPython: {sys.version[:20]}")
print(f"Executable: {sys.executable}")

# Test yfinance loading
try:
    import yfinance as yf
    print(f"\n✓ yfinance v{yf.__version__} loaded")
    print(f"  Path: {yf.__file__}")
except Exception as e:
    print(f"\n✗ yfinance error: {e}")
    sys.exit(1)

# Test price fetching
from ui import fetch_price_yfinance

print("\n" + "=" * 60)
print("PRICE FETCHING TESTS")
print("=" * 60)

stocks = ["AAPL", "MSFT", "NIH", "BBYN"]

for symbol in stocks:
    print(f"\nTesting {symbol}...")
    price, ticker = fetch_price_yfinance(symbol)
    if price:
        currency = "KWD" if symbol in ["NIH", "BBYN"] else "USD"
        print(f"  ✓ Price: {price} {currency}")
        print(f"  ✓ Ticker: {ticker}")
    else:
        print(f"  ✗ Failed to fetch")

print("\n" + "=" * 60)
print("✓ ALL TESTS COMPLETE")
print("=" * 60)
print("\nApp is ready at: http://localhost:8501")
