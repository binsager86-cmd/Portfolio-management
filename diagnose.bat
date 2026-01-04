@echo off
echo ========================================
echo   Python Environment Diagnostics
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Checking system Python locations...
echo.
where python 2>nul
echo.

echo [2] Checking py launcher...
echo.
where py 2>nul
echo.

echo [3] Checking Streamlit...
echo.
where streamlit 2>nul
echo.

echo [4] System Python version...
python --version 2>nul
echo.

echo [5] Python 3.11 availability...
py -3.11 --version 2>nul
echo.

echo [6] Checking venv Python...
if exist "venv\Scripts\python.exe" (
  echo venv Python found!
  venv\Scripts\python --version
  echo.
  echo venv Python executable:
  venv\Scripts\python -c "import sys; print(sys.executable)"
  echo.
  echo venv Python full version:
  venv\Scripts\python -c "import sys; print(sys.version)"
) else (
  echo [WARNING] venv not found!
  echo Run: py -3.11 -m venv venv
)
echo.

echo ========================================
echo [DONE] Diagnostics complete
echo ========================================
echo.
echo If you see Python 3.9 anywhere above, that's the issue!
echo The run.bat file will ONLY use venv\Scripts\python.exe
echo.
pause
