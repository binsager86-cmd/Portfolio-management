import requests

# Try to fetch KRE data from Yahoo Finance using simple CSV endpoint
tickers = ["KRE", "KRE.KW"]

for ticker in tickers:
    print(f"\n=== Testing {ticker} ===")
    
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {
        "interval": "1d",
        "range": "5d"
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if 'chart' in data and 'result' in data['chart'] and data['chart']['result']:
            result = data['chart']['result'][0]
            meta = result.get('meta', {})
            
            print(f"Currency: {meta.get('currency')}")
            print(f"Exchange: {meta.get('exchangeName')}")
            print(f"Market: {meta.get('fullExchangeName')}")
            print(f"Regular Market Price: {meta.get('regularMarketPrice')}")
            
            # Get the latest close price
            quotes = result.get('indicators', {}).get('quote', [{}])[0]
            closes = quotes.get('close', [])
            if closes:
                # Filter out None values
                valid_closes = [c for c in closes if c is not None]
                if valid_closes:
                    latest_close = valid_closes[-1]
                    print(f"Latest Close: {latest_close}")
        else:
            print(f"No data or error: {data}")
            
    except Exception as e:
        print(f"Error: {e}")
