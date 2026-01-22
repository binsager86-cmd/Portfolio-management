@echo off
REM ============================================================
REM Auto Price Scheduler - Windows Task Scheduler Setup
REM ============================================================
REM This script creates a Windows Scheduled Task to run the
REM auto price fetcher at 2 PM Kuwait time daily.
REM
REM IMPORTANT: Kuwait Time is UTC+3. Windows Task Scheduler uses
REM local time, so adjust accordingly based on your timezone.
REM
REM Run this script as Administrator!
REM ============================================================

echo.
echo ============================================================
echo   AUTO PRICE SCHEDULER - WINDOWS TASK SETUP
echo ============================================================
echo.

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
set "VENV_PYTHON=%SCRIPT_DIR%.venv\Scripts\python.exe"
set "SCHEDULER_SCRIPT=%SCRIPT_DIR%auto_price_scheduler.py"

REM Check if running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script requires Administrator privileges.
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Check if venv exists
if not exist "%VENV_PYTHON%" (
    echo [ERROR] Virtual environment not found at: %VENV_PYTHON%
    echo Please set up the virtual environment first.
    pause
    exit /b 1
)

REM Check if scheduler script exists
if not exist "%SCHEDULER_SCRIPT%" (
    echo [ERROR] Scheduler script not found at: %SCHEDULER_SCRIPT%
    pause
    exit /b 1
)

echo [INFO] Script Directory: %SCRIPT_DIR%
echo [INFO] Python: %VENV_PYTHON%
echo [INFO] Scheduler: %SCHEDULER_SCRIPT%
echo.

REM Create a wrapper batch file that Windows Task Scheduler will run
set "WRAPPER_SCRIPT=%SCRIPT_DIR%run_price_scheduler.bat"

echo Creating wrapper script: %WRAPPER_SCRIPT%
(
echo @echo off
echo cd /d "%SCRIPT_DIR%"
echo "%VENV_PYTHON%" "%SCHEDULER_SCRIPT%" --run-now
) > "%WRAPPER_SCRIPT%"

echo.
echo [INFO] Wrapper script created.
echo.

REM Calculate the time to run (Kuwait 2PM = UTC 11AM)
REM Adjust based on your Windows timezone
REM For example, if you're in Kuwait (UTC+3), set to 14:00
REM If you're in UTC, set to 11:00
REM If you're in US Eastern (UTC-5), set to 06:00

echo ============================================================
echo   TIMEZONE CONFIGURATION
echo ============================================================
echo.
echo Kuwait Time is UTC+3. The job should run at 2 PM Kuwait Time.
echo.
echo Your Windows timezone affects the scheduled time.
echo.
echo Common conversions for 2 PM Kuwait (14:00 UTC+3 = 11:00 UTC):
echo   - Kuwait (UTC+3):     14:00 (2:00 PM)
echo   - UTC/GMT:            11:00 (11:00 AM)
echo   - US Eastern (UTC-5): 06:00 (6:00 AM)
echo   - US Pacific (UTC-8): 03:00 (3:00 AM)
echo   - UK (UTC/BST):       11:00/12:00
echo   - India (UTC+5:30):   16:30 (4:30 PM)
echo.

REM Default to 2 PM for Kuwait timezone (assumes Windows is in Kuwait timezone)
set /p TASK_TIME="Enter the local time to run (HH:MM, default 14:00): "
if "%TASK_TIME%"=="" set "TASK_TIME=14:00"

echo.
echo [INFO] Scheduling task for: %TASK_TIME% daily
echo.

REM Delete existing task if it exists
schtasks /delete /tn "PortfolioApp_AutoPriceFetch" /f >nul 2>&1

REM Create the scheduled task
schtasks /create ^
    /tn "PortfolioApp_AutoPriceFetch" ^
    /tr "\"%WRAPPER_SCRIPT%\"" ^
    /sc daily ^
    /st %TASK_TIME% ^
    /ru SYSTEM ^
    /rl HIGHEST ^
    /f

if %errorLevel% equ 0 (
    echo.
    echo ============================================================
    echo   SUCCESS!
    echo ============================================================
    echo.
    echo [OK] Scheduled task "PortfolioApp_AutoPriceFetch" created.
    echo [OK] Will run daily at %TASK_TIME%
    echo.
    echo To view the task:
    echo   - Open Task Scheduler (taskschd.msc)
    echo   - Look for "PortfolioApp_AutoPriceFetch"
    echo.
    echo To test immediately:
    echo   schtasks /run /tn "PortfolioApp_AutoPriceFetch"
    echo.
    echo To delete the task:
    echo   schtasks /delete /tn "PortfolioApp_AutoPriceFetch" /f
    echo.
) else (
    echo.
    echo [ERROR] Failed to create scheduled task.
    echo Please try creating it manually in Task Scheduler.
    echo.
)

pause
