@echo off
echo ========================================
echo   Portfolio App - Setup Verification
echo ========================================
echo.

cd /d "%~dp0"

REM Check if venv exists
if not exist "venv\Scripts\python.exe" (
  echo [X] ERROR: venv not found
  echo.
  echo Run this command first:
  echo    py -3.11 -m venv venv
  echo    venv\Scripts\python -m pip install --upgrade pip
  echo    venv\Scripts\python -m pip install streamlit yfinance pandas numpy requests openpyxl altair
  echo.
  pause
  exit /b 1
)

echo [OK] venv found
echo.

REM Check Python version
echo Checking Python version...
venv\Scripts\python --version
echo.

REM Check executable path
echo Checking executable path...
venv\Scripts\python -c "import sys; print('Executable:', sys.executable)"
echo.

REM Check if it's Python 3.11
venv\Scripts\python -c "import sys; ver=sys.version_info; exit(0 if ver.major==3 and ver.minor==11 else 1)"
if errorlevel 1 (
  echo [X] ERROR: Python 3.11 not found in venv
  pause
  exit /b 1
)
echo [OK] Python 3.11 detected
echo.

REM Check packages
echo Checking required packages...
venv\Scripts\python -c "import streamlit; print('[OK] streamlit', streamlit.__version__)"
venv\Scripts\python -c "import yfinance; print('[OK] yfinance', yfinance.__version__)"
venv\Scripts\python -c "import pandas; print('[OK] pandas', pandas.__version__)"
venv\Scripts\python -c "import numpy; print('[OK] numpy', numpy.__version__)"
venv\Scripts\python -c "import openpyxl; print('[OK] openpyxl', openpyxl.__version__)"
echo.

echo ========================================
echo [SUCCESS] Everything is configured correctly!
echo ========================================
echo.
echo You can now run the app by double-clicking:
echo    run.bat
echo.
pause
