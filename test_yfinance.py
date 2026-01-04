#!/usr/bin/env python3
"""Test production-safe yfinance fetcher with browser headers."""

import yfinance as yf
import pandas as pd
import requests
import time
import random

def fetch_price_yfinance(symbol: str, max_retries: int = 6):
    """Fetch price using yfinance with production-grade reliability."""
    
    # Create session with browser-like headers
    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
    except Exception:
        session = None
    
    # Try common Kuwait stock suffixes
    variants = [symbol, f"{symbol}.KW", f"{symbol}.KSE"]
    
    for variant in variants:
        is_kuwait_stock = variant.endswith('.KW') or variant.endswith('.KSE')
        
        for attempt in range(1, max_retries + 1):
            try:
                print(f"  Attempt {attempt}/{max_retries} with {variant}...", end='', flush=True)
                
                # Use .download() with session
                hist = yf.download(
                    variant,
                    period="5d",
                    interval="1d",
                    progress=False,
                    auto_adjust=False,
                    threads=False,
                    session=session,
                )
                
                if hist is not None and isinstance(hist, pd.DataFrame) and not hist.empty:
                    if 'Close' in hist.columns:
                        price = float(hist["Close"].dropna().iloc[-1])
                        if price > 0:
                            if is_kuwait_stock:
                                price = price / 1000.0
                            print(f" ✓ Got {price}")
                            return float(price), variant
                        
                print(" (empty/invalid)")
            except Exception as e:
                print(f" (error: {type(e).__name__})")
                if attempt < max_retries:
                    wait = (2 ** attempt) + random.uniform(0.5, 2.0)
                    print(f"    Waiting {wait:.1f}s...")
                    time.sleep(wait)
                continue
        
        time.sleep(0.5)
    
    return None, None

# Test AAPL
print("\nTesting AAPL (US stock):")
price, ticker = fetch_price_yfinance("AAPL")
if price:
    print(f"✓ AAPL = ${price}")
else:
    print("✗ AAPL failed")

# Test NIH (Kuwait stock)
print("\nTesting NIH (Kuwait stock):")
price, ticker = fetch_price_yfinance("NIH")
if price:
    print(f"✓ NIH = {price} KWD")
else:
    print("✗ NIH failed")
