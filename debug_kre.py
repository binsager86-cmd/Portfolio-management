import pandas as pd

# Simulating yfinance.download behavior
try:
    import yfinance as yf
    
    # Test different ticker formats
    tickers = ["KRE", "KRE.KW", "KRE.KSE"]
    
    for ticker in tickers:
        print(f"\n=== Testing ticker: {ticker} ===")
        try:
            hist = yf.download(
                ticker,
                period="5d",
                interval="1d",
                progress=False,
                auto_adjust=False,
            )
            
            if hist is not None and not hist.empty and 'Close' in hist.columns:
                price = float(hist["Close"].dropna().iloc[-1])
                print(f"Raw price from yfinance: {price}")
                
                is_kuwait_stock = ticker.endswith('.KW') or ticker.endswith('.KSE')
                if is_kuwait_stock:
                    converted_price = price / 1000.0
                    print(f"After /1000 conversion: {converted_price}")
                else:
                    print(f"No conversion applied (not Kuwait stock)")
                    
                print(f"Recent data:")
                print(hist[['Close']].tail())
            else:
                print("No data returned")
                
        except Exception as e:
            print(f"Error: {e}")
            
except ImportError as e:
    print(f"Cannot import yfinance: {e}")
