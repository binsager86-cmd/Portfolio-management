"""Test if yfinance can be imported and used"""
import sys
print(f"Python version: {sys.version}")

try:
    import yfinance as yf
    print("✓ yfinance imported successfully")
    
    # Test fetching a simple US stock
    ticker = yf.Ticker("AAPL")
    print(f"✓ Created ticker object for AAPL")
    
    # Try fast_info
    try:
        price = ticker.fast_info.last_price
        print(f"✓ fast_info.last_price: ${price}")
    except Exception as e:
        print(f"✗ fast_info failed: {e}")
    
    # Try history as fallback
    try:
        hist = ticker.history(period="1d")
        if not hist.empty:
            price = hist['Close'].iloc[-1]
            print(f"✓ history Close price: ${price}")
        else:
            print("✗ history returned empty dataframe")
    except Exception as e:
        print(f"✗ history failed: {e}")
        
except ImportError as e:
    print(f"✗ Failed to import yfinance: {e}")
except Exception as e:
    print(f"✗ Unexpected error: {e}")
