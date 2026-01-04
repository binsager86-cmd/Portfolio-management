import yfinance as yf

# Check KRE ticker
print("=== Checking KRE (Kuwait Real Estate) ===")
# Try different ticker formats for Kuwait
tickers_to_try = ['KRE.KW', 'KRE', '6090.KW']

for ticker in tickers_to_try:
    print(f"\nTrying ticker: {ticker}")
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        hist = stock.history(period="5d")
        
        print(f"Info keys available: {list(info.keys())[:10]}")
        if 'currentPrice' in info:
            print(f"Current Price: {info.get('currentPrice')}")
        if 'regularMarketPrice' in info:
            print(f"Regular Market Price: {info.get('regularMarketPrice')}")
        
        print(f"Recent history:")
        if not hist.empty:
            print(hist[['Close']].tail())
        else:
            print("No history data")
    except Exception as e:
        print(f"Error: {e}")
