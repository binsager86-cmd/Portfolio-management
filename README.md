# Portfolio App - Quick Start

## Running the App

**Recommended (Direct):**
```bash
cd C:\Users\Sager\OneDrive\Desktop\portfolio_app
py -3.11 -m streamlit run ui.py
```

**Or use the batch file:**
```bash
run.bat
```

## Price Fetching

The app uses yfinance to fetch stock prices from Yahoo Finance.

### Important Notes:
- **Prices are cached for 1 hour** - First fetch may be slow, subsequent fetches use cached data
- **Rate limiting protection** - Built-in exponential backoff and retry logic
- **Yahoo Finance limits** - If you see 429 errors, wait a few minutes before fetching again
- **Kuwait stocks** - Automatically tries `.KW` and `.KSE` suffixes
- **USD/KWD rate** - Cached for 1 hour, falls back to 0.307 if API fails

### Best Practices:
1. Don't click "Fetch All Prices" repeatedly - use cached data
2. If rate-limited, wait 5-10 minutes before trying again
3. For frequent updates, consider using a different data source

## Features

- **Cash Deposits** - Track deposits by portfolio (KFH, BBYN, USA)
- **Transactions** - Buy/sell stocks with automatic calculations
- **Portfolio Analysis** - View holdings, PNL, and performance by portfolio
- **Portfolio Tracker** - Daily snapshots with charts and Excel import/export
- **Price Fetching** - Automatic price updates with rate limit protection

## Requirements

- Python 3.11+
- yfinance
- streamlit
- pandas
- openpyxl (for Excel)
- altair (for charts)

## Troubleshooting

**"Price Fetching Limited" warning:**
- Make sure yfinance is installed: `pip install yfinance`
- Check Python version: `py --version` (should be 3.11+)

**429 Too Many Requests:**
- Yahoo Finance is rate-limiting you
- Wait 5-10 minutes before fetching again
- Prices are cached for 1 hour, so use cached data when possible

**App won't start:**
- Make sure no other instance is running on port 8501
- Try: `Get-Process streamlit | Stop-Process -Force`
- Then restart with `py -3.11 -m streamlit run ui.py`
