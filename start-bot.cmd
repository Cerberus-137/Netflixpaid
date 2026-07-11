@echo off
echo ==========================================
echo   Netflix Telegram Bot - Windows Start
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [!] node_modules not found!
    echo [*] Installing dependencies...
    echo.
    call npm install
    echo.
)

REM Check if Playwright is installed
echo [*] Checking Playwright installation...
npx playwright --version >nul 2>&1
if errorlevel 1 (
    echo [!] Playwright not found!
    echo [*] Installing Playwright Chromium...
    echo.
    call npx playwright install chromium
    echo.
)

echo [*] Starting Telegram Bot...
echo.
echo ==========================================
echo   Bot Commands:
echo   /start     - Welcome message
echo   /generate  - Generate Netflix email
echo   /status    - Check trial status
echo   /help      - Help guide
echo ==========================================
echo.
echo [*] Press Ctrl+C to stop bot
echo.

node telegram-bot.js

pause
