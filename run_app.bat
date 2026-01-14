@echo off
setlocal enabledelayedexpansion
TITLE Portfolio App Launcher
COLOR 0A

echo ========================================================
echo [1/4] CLEANUP: Free port 8502 only (safe)
echo ========================================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8502 ^| findstr LISTENING') do (
  echo Killing PID %%a on port 8502...
  taskkill /PID %%a /F >nul 2>&1
)

echo.
echo ========================================================
echo [2/4] SETUP: Checking venv exists
echo ========================================================
if not exist "venv\Scripts\python.exe" (
  echo ERROR: venv not found. Run: python -m venv venv
  pause
  exit /b 1
)

echo.
echo ========================================================
echo [3/4] LAUNCH: Starting Streamlit on 127.0.0.1:8502
echo ========================================================
echo Logs will appear below. Do NOT close this window.
echo.

start "Streamlit" /B venv\Scripts\python.exe -m streamlit run ui.py --server.port 8502 --server.address 127.0.0.1 --server.headless true

echo.
echo ========================================================
echo [4/4] WAIT: Waiting for server to start...
echo ========================================================

set tries=0
:waitloop
set /a tries+=1

netstat -aon | findstr :8502 | findstr LISTENING >nul
if %errorlevel%==0 (
  echo Server is up ✅ Opening browser...
  start http://127.0.0.1:8502
  goto done
)

if %tries% GEQ 30 (
  echo ERROR: Streamlit did not start on port 8502.
  echo Check the logs above for the real crash reason.
  pause
  exit /b 1
)

timeout /t 1 >nul
goto waitloop

:done
echo.
echo App is running. Keep this window open.
pause
