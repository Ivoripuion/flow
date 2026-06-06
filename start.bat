@echo off
setlocal

echo.
echo ==========================================
echo   Flow - Open Source ePub Reader
echo ==========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js found
call node -v

:: Check pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing pnpm...
    call npm install -g pnpm
)
echo [OK] pnpm found
call pnpm -v

:: Change to script directory
cd /d "%~dp0"
echo [OK] Directory: %cd%

:: Create .env.local if not exists
if not exist "apps\reader\.env.local" (
    echo [INFO] Creating config...
    echo # Flow Configuration > "apps\reader\.env.local"
    echo # AI config is set in the app UI >> "apps\reader\.env.local"
    echo [OK] Config created
)

:: Install dependencies
echo [INFO] Installing dependencies...
call pnpm install
echo [OK] Dependencies installed

:: Start application
echo.
echo ==========================================
echo   Starting Flow
echo ==========================================
echo.
echo Browser: http://localhost:7127
echo Press Ctrl+C to stop
echo.
echo ==========================================
echo.

:: Start app and open browser after delay
echo [INFO] Starting app (browser will open in 5 seconds)...
echo.

:: Open browser in background using PowerShell (no extra window)
start /B powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:7127'"

:: Start app
call pnpm dev

echo.
echo Application stopped
pause
