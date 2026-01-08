@echo off
echo ========================================
echo   Installing Dependencies (Python 3.11)
echo ========================================
echo.

REM Activate Python 3.11 virtual environment
call venv\Scripts\activate.bat

echo [✓] Python 3.11 virtual environment activated
echo.

REM Upgrade pip
echo [*] Upgrading pip...
python -m pip install --upgrade pip
echo.

REM Install dependencies
echo [*] Installing Streamlit and dependencies...
pip install streamlit yfinance pandas numpy requests openpyxl xlsxwriter altair openai
echo.

echo ========================================
echo [✓] Installation Complete!
echo ========================================
echo.
echo Run 'start_app.bat' to launch the app
echo.

pause
