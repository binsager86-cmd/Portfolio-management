#!/usr/bin/env python
# Quick test of yfinance price fetching
import yfinance as yf
import sys

def test_fetch(symbol):
    print(f"\nTesting {symbol}:")
    try:
        ticker = yf.Ticker(symbol)
        
        # Test 1: history
        print("  Method 1: history(period='1d')")
        try:
            hist = ticker.history(period="1d", timeout=5)
            if not hist.empty and 'Close' in hist.columns:
                price = hist['Close'].iloc[-1]
                print(f"    ✓ Price: {price}")
                return price
            else:
                print(f"    ✗ Empty or no Close column")
        except Exception as e:
            print(f"    ✗ Error: {e}")
        
        # Test 2: fast_info
        print("  Method 2: fast_info")
        try:
            price = ticker.fast_info.get('lastPrice')
            if price and price > 0:
                print(f"    ✓ Price: {price}")
                return price
            else:
                print(f"    ✗ No price or zero")
        except Exception as e:
            print(f"    ✗ Error: {e}")
        
        # Test 3: info (slow but thorough)
        print("  Method 3: info")
        try:
            info = ticker.info
            price = info.get('currentPrice') or info.get('regularMarketPrice')
            if price:
                print(f"    ✓ Price: {price}")
                return price
            else:
                print(f"    ✗ No price in info")
        except Exception as e:
            print(f"    ✗ Error: {e}")
        
    except Exception as e:
        print(f"  ✗ Ticker creation failed: {e}")
    
    return None

# Test various stocks
print("=" * 50)
print("yfinance Price Fetch Test")
print("=" * 50)

# Test US stock
test_fetch("AAPL")

# Test Kuwait stock variants
for variant in ["ZAIN", "ZAIN.KW", "ZAIN.KSE"]:
    price = test_fetch(variant)
    if price:
        print(f"  → Found price with {variant}")
        break

print("\n" + "=" * 50)
print("Test complete!")
