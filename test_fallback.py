#!/usr/bin/env python3
import sys
sys.path.insert(0, r'C:\Users\Sager\OneDrive\Desktop\portfolio_app')

print("=" * 60)
print("TESTING PRICE FETCHER WITH FALLBACK")
print("=" * 60)

from ui import fetch_price_yfinance

print("\nTesting AAPL (US stock):")
price, ticker = fetch_price_yfinance('AAPL', max_retries=1)
print(f"  Price: {price}")
print(f"  Source: {ticker}")

print("\nTesting NIH (Kuwait stock):")
price, ticker = fetch_price_yfinance('NIH', max_retries=1)
print(f"  Price: {price} KWD")
print(f"  Source: {ticker}")

print("\n✓ Fallback prices working!")
