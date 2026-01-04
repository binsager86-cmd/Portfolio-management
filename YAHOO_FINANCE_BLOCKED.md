# ⚠️  CRITICAL: Yahoo Finance is Blocking Your IP

## Symptoms
- `Expecting value: line 1 column 1 (char 0)` errors
- Prices not loading or very slow (30+ seconds)
- Both `AAPL` and Kuwait stocks (NIH, BBYN) fail
- Happens even with valid stock symbols

## Root Cause
Your IP/network is **completely blocked** from Yahoo Finance servers. This is likely due to:
- ISP/router blocking (some networks block financial APIs)
- Too many rapid API requests (rate limit)
- Geographic restrictions
- Datacenter detection (Yahoo blocks known VPN/datacenter IPs)

## Current Solution
The app now uses **hardcoded fallback prices** for common stocks:
```
AAPL: $233.45
MSFT: $416.88
GOOGL: $140.73
NIH: 1.250 KWD
BBYN: 0.885 KWD
KNPC: 0.628 KWD
NBK: 0.950 KWD
KFH: 0.750 KWD
GIL: 0.850 KWD
```

**Update these manually or via a paid API.**

## Long-Term Solutions

### Option 1: Use a Paid API (Recommended)
Install and use a reliable paid API with better coverage:

#### TwelveData (Free tier available)
```bash
pip install twelvedata
```

```python
from twelvedata import TDClient

client = TDClient(apikey="YOUR_API_KEY")

def get_price_twelvedata(symbol):
    ts = client.time_series(symbol=symbol, interval="1day", outputsize=10)
    return float(ts.as_pandas()["close"].iloc[-1])
```

#### AlphaVantage (Free tier available)
```bash
pip install alpha-vantage
```

```python
from alpha_vantage.data import FundamentalData
from alpha_vantage.timeseries import TimeSeries

ts = TimeSeries(key="YOUR_API_KEY")
data, meta = ts.get_daily(symbol="AAPL")
latest = list(data.values())[0]
price = float(latest["4. close"])
```

#### EODHD (Paid, but covers 200+ exchanges)
```bash
pip install eodhd
```

### Option 2: Manual CSV Upload
Replace dynamic price fetching with manual updates:

1. Create `prices.csv`:
   ```
   symbol,price,date
   AAPL,233.45,2025-12-30
   NIH,1.250,2025-12-30
   BBYN,0.885,2025-12-30
   ```

2. Upload weekly via Streamlit file uploader

3. Update `fetch_price_yfinance()` to read from CSV instead

### Option 3: Use Your Broker's API
If you have a brokerage account (Interactive Brokers, etc.), use their official API:
- **Interactive Brokers**: `ibapi`
- **OANDA**: `oandapyV20`
- **Kraken**: `krakenex`

### Option 4: Try a VPN/Proxy
If your network is geographically blocked:
```bash
pip install pysocks
```

Test with a VPN to see if that's the issue.

## Recommendations for This Project
1. **Switch to TwelveData** - Free tier covers 800+ stocks, includes Kuwait exchange
2. **Add manual price upload** - Allow users to upload prices via CSV
3. **Use a combination** - Try API, fall back to CSV, then hardcoded

## To Implement Any Solution
Edit these functions in `ui.py`:
- `fetch_price_yfinance()` - Replace with your API call
- `cached_fetch_price()` - Keep the caching decorator
- UI section "Fetch All Prices" button - Update progress messages

---

**Need help?** Let me know which API you'd prefer and I'll implement it.
