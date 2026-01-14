@echo off
echo ========================================
echo   Portfolio App - Python 3.11 Launcher
echo ========================================
echo.

REM Kill any zombie Streamlit processes first
echo [*] Stopping any existing Streamlit processes...
taskkill /F /IM streamlit.exe 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8502 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul

REM Activate Python 3.11 virtual environment
call venv\Scripts\activate.bat

echo [✓] Python 3.11 virtual environment activated
echo.

REM Show Python version
python --version
echo.

REM Run Streamlit app on fixed port 8502
echo [*] Starting Streamlit app on http://localhost:8502
python -m streamlit run ui.py --server.port 8502

pause
