#!/bin/bash

echo "=========================================="
echo "  Netflix Telegram Bot - Linux Start"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[!] node_modules not found!"
    echo "[*] Installing dependencies..."
    echo ""
    npm install
    echo ""
fi

# Check if Playwright is installed
echo "[*] Checking Playwright installation..."
if ! npx playwright --version &> /dev/null; then
    echo "[!] Playwright not found!"
    echo "[*] Installing Playwright Chromium..."
    echo ""
    npx playwright install chromium
    npx playwright install-deps chromium
    echo ""
fi

echo "[*] Starting Telegram Bot with PM2..."
echo ""
echo "=========================================="
echo "  Bot Commands:"
echo "  /start     - Welcome message"
echo "  /generate  - Generate Netflix email"
echo "  /status    - Check trial status"
echo "  /help      - Help guide"
echo "=========================================="
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "[!] PM2 not found!"
    echo "[?] Install PM2 globally? (y/n)"
    read -r answer
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
        sudo npm install -g pm2
    else
        echo "[*] Running bot without PM2..."
        node telegram-bot.js
        exit 0
    fi
fi

# Stop existing bot if running
pm2 stop netflix-bot 2>/dev/null

# Start bot with PM2
pm2 start telegram-bot.js --name netflix-bot

# Show status
echo ""
pm2 status netflix-bot

echo ""
echo "=========================================="
echo "  PM2 Commands:"
echo "  pm2 logs netflix-bot    - View logs"
echo "  pm2 restart netflix-bot - Restart bot"
echo "  pm2 stop netflix-bot    - Stop bot"
echo "  pm2 status              - Check status"
echo "=========================================="
echo ""
echo "[*] Bot started successfully!"
echo "[*] Check logs: pm2 logs netflix-bot"
