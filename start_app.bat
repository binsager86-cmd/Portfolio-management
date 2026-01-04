@echo off
echo ========================================
echo   Portfolio App - Python 3.11 Launcher
echo ========================================
echo.

REM Activate Python 3.11 virtual environment
call venv\Scripts\activate.bat

echo [✓] Python 3.11 virtual environment activated
echo.

REM Show Python version
python --version
echo.

REM Run Streamlit app
echo [*] Starting Streamlit app...
python -m streamlit run ui.py --server.port 8502

pause
