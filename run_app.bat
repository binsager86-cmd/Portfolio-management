@echo off
TITLE Portfolio App Launcher
COLOR 0A

echo ========================================================
echo [1/3] CLEANUP: Killing old Python processes...
echo ========================================================
:: This forces any stuck Streamlit background tasks to die
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM streamlit.exe /T >nul 2>&1

echo.
echo [2/3] SETUP: Activating Virtual Environment...
echo ========================================================
:: Check if venv exists, if so activate it
if exist venv\Scripts\activate (
    call venv\Scripts\activate
) else (
    echo WARNING: Virtual environment 'venv' not found. Trying global python...
)

echo.
echo [3/3] LAUNCH: Starting Streamlit on Port 8502...
echo ========================================================
echo Access your app here: http://localhost:8502
echo.
echo --------------------------------------------------------
echo LOGS (If the app crashes, errors will appear below):
echo --------------------------------------------------------

:: Force IPv4 (127.0.0.1) to prevent localhost resolution errors
streamlit run ui.py --server.port 8502 --server.address 127.0.0.1 --server.headless true

:: The PAUSE command keeps the window open if the app crashes
echo.
echo !!! APP CRASHED OR STOPPED !!!
pause
