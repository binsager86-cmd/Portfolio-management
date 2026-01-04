"""Quick test to show the price fetching status"""
import sys
sys.path.insert(0, r"c:\Users\Sager\OneDrive\Desktop\portfolio_app")

from ui import YFINANCE_AVAILABLE, YFINANCE_ERROR

print("=" * 60)
print("PRICE FETCHING STATUS")
print("=" * 60)
print()

if YFINANCE_AVAILABLE:
    print("✓ yfinance is available")
    print("✓ Automatic price fetching is ENABLED")
    print()
    print("You can use 'Fetch Current Price' buttons in the UI")
else:
    print("✗ yfinance is NOT available")
    print(f"  Error: {YFINANCE_ERROR}")
    print()
    print("❌ Automatic price fetching is DISABLED")
    print()
    print("SOLUTION:")
    print("1. Upgrade to Python 3.10 or later")
    print("   Download from: https://www.python.org/downloads/")
    print()
    print("2. Reinstall yfinance:")
    print("   pip install --upgrade yfinance")
    print()
    print("See PRICE_FETCHING_STATUS.md for details")

print()
print("=" * 60)
