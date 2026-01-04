# Quick Python Upgrade Guide

## The Problem
Your Python 3.9 cannot run `yfinance` due to compatibility issues. Price fetching **will not work** until Python is upgraded.

## The Solution (10 minutes)

### Step 1: Download Python 3.11
1. Go to: https://www.python.org/downloads/
2. Click "Download Python 3.11.7" (or latest 3.11.x)
3. Run the installer

### Step 2: Install Python
- ✅ **Check "Add Python 3.11 to PATH"**
- Choose "Install Now" or customize to: `C:\Python311`
- Complete installation

### Step 3: Verify Installation
Open **new** PowerShell window:
```powershell
python --version
# Should show: Python 3.11.x
```

### Step 4: Install Dependencies
```powershell
python -m pip install --upgrade pip
python -m pip install streamlit pandas yfinance requests altair openpyxl
```

### Step 5: Update App Launch
Edit `app.py` line 2:
```python
# Change from:
subprocess.run([r"C:\Python39\python.exe", "-m", "streamlit", "run", "ui.py"])

# To:
subprocess.run(["python", "-m", "streamlit", "run", "ui.py"])
```

Or run directly:
```powershell
python -m streamlit run ui.py
```

### Step 6: Test Price Fetching
```powershell
python test_final.py
```

Should now show:
```
✓ AAPL: $XXX.XX via yfinance (AAPL)
✓ HUMANSOFT: found TradingView mapping
```

## Alternative: Keep Python 3.9 and Use Manual Prices

If you cannot upgrade Python:
1. The app still works for transaction tracking
2. Use manual price entry when adding transactions
3. Update prices via "Edit Stock Details"
4. Skip the "Fetch Current Price" buttons

## What's Already Done

✅ Code is complete and ready
✅ TradingView symbol mapping works  
✅ Kuwait stock support (.KW, .KSE suffixes)
✅ Warning banner shows when yfinance unavailable
✅ Graceful fallbacks everywhere

⚠️ Only blocked by Python version

## Check Current Status

Run this anytime:
```powershell
python check_price_status.py
```

---

**Bottom line**: Upgrade Python 3.9 → 3.11 to enable automatic price fetching.
