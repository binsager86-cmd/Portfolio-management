#!/usr/bin/env python3
"""Test price fetching system"""
import sys
sys.path.insert(0, r'C:\Users\Sager\OneDrive\Desktop\portfolio_app')

print('Testing price fetching system...')
print('=' * 60)

# Test the fetch function directly
from ui import fetch_price_yfinance, YFINANCE_AVAILABLE

print(f'Python version: {sys.version}')
print(f'yfinance available: {YFINANCE_AVAILABLE}')
print()

# Test AAPL
print('Testing AAPL (US stock):')
price, ticker = fetch_price_yfinance('AAPL')
if price:
    print(f'  ✓ Price: ${price}')
    print(f'  ✓ Source: {ticker}')
else:
    print('  ✗ Failed to fetch price')

print()

# Test NIH
print('Testing NIH (Kuwait stock):')
price, ticker = fetch_price_yfinance('NIH')
if price:
    print(f'  ✓ Price: {price} KWD')
    print(f'  ✓ Source: {ticker}')
else:
    print('  ✗ Failed to fetch price')

print()

# Test BBYN
print('Testing BBYN (Kuwait stock):')
price, ticker = fetch_price_yfinance('BBYN')
if price:
    print(f'  ✓ Price: {price} KWD')
    print(f'  ✓ Source: {ticker}')
else:
    print('  ✗ Failed to fetch price')

print()

# Test MSFT
print('Testing MSFT (US stock):')
price, ticker = fetch_price_yfinance('MSFT')
if price:
    print(f'  ✓ Price: ${price}')
    print(f'  ✓ Source: {ticker}')
else:
    print('  ✗ Failed to fetch price')

print()
print('=' * 60)
print('✓ Price fetching test complete')
