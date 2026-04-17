# Portfolio App - Quick Reference

## ▶️ RUN APP
Double-click: **`run.bat`**

## 📍 APP URL
**http://localhost:8502** (stable port, no conflicts)

## ✅ VERIFY SETUP  
Double-click: **`verify_setup.bat`**

## 🐛 DEBUG MODE
Double-click: **`run_debug.bat`** (shows detailed logs)

## 🔧 UPDATE PACKAGES
```bat
venv\Scripts\python -m pip install --upgrade streamlit yfinance pandas
```

## 🐍 PYTHON VERSION
```bat
venv\Scripts\python --version
```
Should show: **Python 3.11.7**

## 🆘 IF SOMETHING BREAKS
1. Delete `venv` folder
2. Run in Command Prompt:
```cmd
py -3.11 -m venv venv
venv\Scripts\python -m pip install --upgrade pip
venv\Scripts\python -m pip install streamlit yfinance pandas numpy requests openpyxl altair
```
3. Double-click `run.bat`

## ✨ FEATURES
- ✅ Stock price auto-fetch when changing symbols
- ✅ Trading Section with realized/unrealized profits
- ✅ Excel import/export with validation
- ✅ Inline editing (double-click cells)
- ✅ Delete transactions (single or bulk)
- ✅ Row numbering for reference

## 📊 SIDEBAR INFO
Should show:
- Python: 3.11.7
- Executable: ...venv\Scripts\python.exe
- ✓ yfinance loaded

---
**Keep this file for quick reference!**
