"""Test Kuwait stock price conversion (divide by 1000)"""
import sys
sys.path.insert(0, r"c:\Users\Sager\OneDrive\Desktop\portfolio_app")

from ui import fetch_price_yfinance

print("Testing Kuwait Stock Price Conversion")
print("=" * 50)
print()

# Test Kuwait stocks
kuwait_stocks = ["HUMANSOFT", "KIB"]
for symbol in kuwait_stocks:
    price, used_ticker = fetch_price_yfinance(symbol)
    if price:
        print(f"✓ {symbol}")
        print(f"  Used ticker: {used_ticker}")
        print(f"  Price in database: {price:.4f} KWD")
        if used_ticker.endswith('.KW') or used_ticker.endswith('.KSE'):
            print(f"  Original price: {price * 1000:.2f} fils")
        print()
    else:
        print(f"✗ {symbol}: No price found\n")

# Test US stock (should not be divided)
print("US Stock (no conversion):")
price, used_ticker = fetch_price_yfinance("AAPL")
if price:
    print(f"✓ AAPL")
    print(f"  Used ticker: {used_ticker}")
    print(f"  Price: ${price:.2f}")
else:
    print(f"✗ AAPL: No price found")
