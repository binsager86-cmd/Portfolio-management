@echo off
cd /d "%~dp0"

REM Force venv interpreter (cannot accidentally use Python39)
if not exist "venv\Scripts\python.exe" (
  echo [INFO] Creating venv with Python 3.11...
  py -3.11 -m venv venv
)

echo [INFO] Using:
venv\Scripts\python -c "import sys; print(sys.version); print(sys.executable)"
echo.

echo [INFO] Installing/updating packages...
venv\Scripts\python -m pip install -q --upgrade pip
venv\Scripts\python -m pip install -q streamlit yfinance pandas numpy requests openpyxl altair xlsxwriter
echo.

echo [INFO] Starting Streamlit with DEBUG logging...
echo [INFO] Press Ctrl+C to stop the server
echo.
venv\Scripts\python -m streamlit run ui.py ^
  --server.headless true ^
  --server.address 127.0.0.1 ^
  --server.port 8501 ^
  --logger.level=debug
pause
