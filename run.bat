@echo off
cd /d "%~dp0"

echo ========================================
echo   Portfolio App - Production Launcher
echo ========================================
echo.

REM Kill old Streamlit on port 8501 if any
echo [*] Checking for old Streamlit processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8501 ^| findstr LISTENING') do (
  echo [*] Killing process on port 8501 (PID: %%a)
  taskkill /PID %%a /F >nul 2>&1
)

REM Force venv interpreter (cannot accidentally use Python39)
if not exist "venv\Scripts\python.exe" (
  echo [ERROR] venv not found! Creating with Python 3.11...
  py -3.11 -m venv venv
  echo [*] Installing packages...
  venv\Scripts\python -m pip install --upgrade pip
  venv\Scripts\python -m pip install streamlit yfinance pandas numpy requests openpyxl altair xlsxwriter
)

echo [*] Using Python:
venv\Scripts\python -c "import sys; print(sys.version); print(sys.executable)"
echo.

echo [*] Starting Streamlit on port 8502...
echo [*] Open browser to: http://localhost:8502
echo [*] Press Ctrl+C to stop
echo.

REM Always run using venv python (never system python)
venv\Scripts\python -m streamlit run ui.py --server.port 8502
pause

