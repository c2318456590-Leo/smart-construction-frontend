@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

REM ============================================================
REM  run.bat - start backend and frontend with one click.
REM    1. Start FastAPI backend on port 8000.
REM    2. Start frontend static server on port 8080.
REM    3. Open http://127.0.0.1:8080 after backend health check.
REM  Stop services by closing the two opened command windows.
REM ============================================================

REM ---- Paths and ports ----
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "BACKEND_DIR=%PROJECT_ROOT%\backend"
set "FRONTEND_PORT=8080"
set "BACKEND_PORT=8000"
set "BACKEND_URL=http://127.0.0.1:%BACKEND_PORT%/api/health"
set "FRONTEND_URL=http://127.0.0.1:%FRONTEND_PORT%/"

REM ---- Python environment mode ----
REM PYTHON_MODE options:
REM   python : use python from PATH
REM   conda  : activate CONDA_ENV first
REM   uv     : run through uv
set "PYTHON_MODE=python"
set "PYTHON_EXE=python"
set "CONDA_ENV="
set "CONDA_ACTIVATE_BAT="

REM ---- Environment checks ----
if not exist "%BACKEND_DIR%\app.py" (
    echo [ERROR] backend app was not found: %BACKEND_DIR%\app.py
    pause
    exit /b 1
)

set "BACKEND_RUN_CMD="
set "FRONTEND_RUN_CMD="

if /i "%PYTHON_MODE%"=="python" (
    where "%PYTHON_EXE%" >nul 2>nul
    if errorlevel 1 (
        if not exist "%PYTHON_EXE%" (
            echo [ERROR] Python executable was not found: %PYTHON_EXE%
            echo [ERROR] Set PYTHON_EXE near the top of run.bat.
            pause
            exit /b 1
        )
    )
    "%PYTHON_EXE%" --version >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Python executable cannot run: %PYTHON_EXE%
        pause
        exit /b 1
    )
    set "BACKEND_RUN_CMD=""%PYTHON_EXE%"" app.py"
    set "FRONTEND_RUN_CMD=""%PYTHON_EXE%"" -m http.server %FRONTEND_PORT%"
)

if /i "%PYTHON_MODE%"=="conda" (
    if "%CONDA_ENV%"=="" (
        echo [ERROR] CONDA_ENV is empty. Set CONDA_ENV near the top of run.bat.
        pause
        exit /b 1
    )
    if not "%CONDA_ACTIVATE_BAT%"=="" (
        if not exist "%CONDA_ACTIVATE_BAT%" (
            echo [ERROR] CONDA_ACTIVATE_BAT was not found: %CONDA_ACTIVATE_BAT%
            pause
            exit /b 1
        )
        set "BACKEND_RUN_CMD=call ""%CONDA_ACTIVATE_BAT%"" ""%CONDA_ENV%"" && python app.py"
        set "FRONTEND_RUN_CMD=call ""%CONDA_ACTIVATE_BAT%"" ""%CONDA_ENV%"" && python -m http.server %FRONTEND_PORT%"
    ) else (
        where conda >nul 2>nul
        if errorlevel 1 (
            echo [ERROR] conda was not found. Set CONDA_ACTIVATE_BAT or add conda to PATH.
            pause
            exit /b 1
        )
        set "BACKEND_RUN_CMD=call conda activate ""%CONDA_ENV%"" && python app.py"
        set "FRONTEND_RUN_CMD=call conda activate ""%CONDA_ENV%"" && python -m http.server %FRONTEND_PORT%"
    )
)

if /i "%PYTHON_MODE%"=="uv" (
    where uv >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] uv was not found. Install uv or change PYTHON_MODE.
        pause
        exit /b 1
    )
    set "BACKEND_RUN_CMD=uv run python app.py"
    set "FRONTEND_RUN_CMD=uv run python -m http.server %FRONTEND_PORT%"
)

if "%BACKEND_RUN_CMD%"=="" (
    echo [ERROR] Unknown PYTHON_MODE: %PYTHON_MODE%
    echo [ERROR] Use python, conda, or uv.
    pause
    exit /b 1
)

if /i "%~1"=="--check" (
    echo [CHECK] Python is available and backend entry exists.
    echo [CHECK] Python mode: %PYTHON_MODE%
    echo [CHECK] Backend port: %BACKEND_PORT%
    echo [CHECK] Frontend port: %FRONTEND_PORT%
    echo [CHECK] run.bat check passed.
    endlocal
    exit /b 0
)

REM ---- Start backend ----
echo [1/4] Starting FastAPI backend ...
start "SmartSite Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && %BACKEND_RUN_CMD%"

REM ---- Start frontend static server ----
echo [2/4] Starting frontend static server ...
start "SmartSite Frontend" cmd /k "cd /d ""%PROJECT_ROOT%"" && %FRONTEND_RUN_CMD%"

REM ---- Wait for backend health check ----
echo [3/4] Waiting for backend readiness ...
set /a WAIT_SEC=0

:WAIT_BACKEND
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%BACKEND_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
    set /a WAIT_SEC+=1
    if !WAIT_SEC! geq 30 (
        echo [WARN] Backend was not ready in 30 seconds. Opening frontend anyway; refresh later if needed.
        goto OPEN_BROWSER
    )
    timeout /t 1 >nul
    goto WAIT_BACKEND
)

echo       Backend is ready.

REM ---- Open browser ----
:OPEN_BROWSER
echo [4/4] Opening browser ...
start "" "%FRONTEND_URL%"

echo.
echo ============================================================
echo  Started.
echo   Backend:  http://127.0.0.1:%BACKEND_PORT%/api/health
echo   Frontend: %FRONTEND_URL%
echo  Close "SmartSite Backend" and "SmartSite Frontend" windows to stop services.
echo ============================================================

endlocal
