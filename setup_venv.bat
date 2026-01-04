@echo off
REM ===================================================================
REM Portfolio App - Virtual Environment Setup Script
REM ===================================================================
REM This script creates a clean Python 3.11 virtual environment
REM and installs all required packages to avoid version conflicts.
REM ===================================================================

echo.
echo ========================================
echo Portfolio App - Virtual Environment Setup
echo ========================================
echo.

cd /d "%~dp0"

REM Check if Python 3.11 is available
py -3.11 --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3.11 not found!
    echo Please install Python 3.11 from python.org
    pause
    exit /b 1
)

echo [1/5] Python 3.11 detected...
py -3.11 --version

REM Remove old venv if it exists
if exist ".venv" (
    echo [2/5] Removing old virtual environment...
    rmdir /s /q .venv
)

echo [3/5] Creating new virtual environment...
py -3.11 -m venv .venv
if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment
    pause
    exit /b 1
)

echo [4/5] Activating virtual environment...
call .venv\Scripts\activate.bat

echo [5/5] Installing required packages...
python -m pip install --upgrade pip
pip install streamlit yfinance pandas openpyxl requests

if errorlevel 1 (
    echo [ERROR] Package installation failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Virtual environment is ready.
echo ========================================
echo.
echo To verify yfinance installation:
echo   python -c "import yfinance as yf; print('yfinance:', yf.__file__)"
echo.
echo To run the app:
echo   run.bat
echo.
echo Or manually:
echo   .venv\Scripts\activate
echo   streamlit run ui.py
echo.
pause
