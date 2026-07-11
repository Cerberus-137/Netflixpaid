# ⚡ Quick Reference - Netflix Telegram Bot

## 🚀 Quick Start

### Windows (Testing)
```cmd
start-bot.cmd
```

### Linux VPS (Production)
```bash
chmod +x start-bot.sh
./start-bot.sh
```

---

## 📋 Bot Information

**Bot Token:** `8557661156:AAG49v40J15F140lI4CAba8Ypx0E_uy8_M8`

**Feature:** 1 Trial per Telegram Account

**Process Time:** 2-3 minutes per generation

---

## 💬 Commands Cheat Sheet

### User Commands
| Command | Description |
|---------|-------------|
| `/start` | Welcome & instructions |
| `/generate` | Generate Netflix email (1x only) |
| `/status` | Check trial availability |
| `/help` | Full help guide |

### Admin Commands (set ADMIN_USER_ID first)
| Command | Description |
|---------|-------------|
| `/reset <user_id>` | Reset user trial |
| `/stats` | Bot statistics |

---

## 🔧 Configuration

### Set Admin User ID
Edit `telegram-bot.js` line 10:

```javascript
const ADMIN_USER_ID = 123456789; // Your Telegram User ID
```

Get your User ID: [@userinfobot](https://t.me/userinfobot)

### Update Bot Token
Edit `telegram-bot.js` line 9:

```javascript
const BOT_TOKEN = 'YOUR_NEW_TOKEN_HERE';
```

---

## 📊 Monitoring

### PM2 Commands
```bash
pm2 status                  # Check bot status
pm2 logs netflix-bot        # View live logs
pm2 restart netflix-bot     # Restart bot
pm2 stop netflix-bot        # Stop bot
pm2 delete netflix-bot      # Remove from PM2
```

### Manual Check
```bash
cat telegram_users.json     # View database
cat telegram_bot_log.txt    # View log file
```

---

## 🐛 Troubleshooting

### Bot Not Responding
```bash
pm2 restart netflix-bot
```

### Playwright Error
```bash
npx playwright install chromium
npx playwright install-deps chromium
```

### Database Corrupted
```bash
echo '{"users":{}}' > telegram_users.json
```

### Check Errors
```bash
pm2 logs netflix-bot --lines 50 | grep -i error
```

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `telegram-bot.js` | Main bot code |
| `telegram_users.json` | User database |
| `telegram_bot_log.txt` | Generation log |
| `package.json` | Dependencies |

---

## 🔒 Security Notes

- **1 Trial per User:** Tracked by Telegram User ID
- **Admin Commands:** Protected by ADMIN_USER_ID check
- **Database:** File-based (telegram_users.json)
- **Logs:** Auto-generated, no sensitive data

---

## 📦 Installation (One-liner)

### Ubuntu VPS
```bash
cd ~ && \
mkdir netflix-bot && \
cd netflix-bot && \
npm install axios playwright node-telegram-bot-api && \
npx playwright install chromium && \
npx playwright install-deps chromium
```

Then upload `telegram-bot.js` and run:
```bash
pm2 start telegram-bot.js --name netflix-bot
pm2 save
```

---

## 🎯 Expected Output

### Successful Generation
```
✅ Berhasil! Account Netflix Created

📧 Email: admin123@web-library.net
🔑 Password: Admin123@
🔗 Verification Link: https://netflix.com/epr?code=...

User marked as used in database.
```

### Trial Already Used
```
❌ Trial sudah digunakan!

Maaf, kamu sudah menggunakan 1x trial gratis.
```

---

## 📈 Performance

**Resource Usage per Generation:**
- RAM: ~200-500MB
- Time: 2-3 minutes
- CPU: ~30-50% (during browser automation)

**Recommendations:**
- VPS 2GB RAM: ~3 concurrent users max
- VPS 4GB RAM: ~8 concurrent users max

---

## 🔄 Update Cookies

If 30-day promo not showing:

1. Get new cookies from browser with promo
2. Edit `telegram-bot.js`
3. Update `COOKIES_30_DAYS` array
4. Restart bot: `pm2 restart netflix-bot`

---

## 📞 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Bot offline | `pm2 restart netflix-bot` |
| Email timeout | User can retry, trial not consumed |
| Playwright crash | `npx playwright install chromium` |
| Database error | Reset: `echo '{"users":{}}' > telegram_users.json` |
| Memory leak | `pm2 restart netflix-bot` (PM2 auto-restart on crash) |

---

## 💾 Backup

### Backup Database
```bash
cp telegram_users.json telegram_users_$(date +%Y%m%d).json
```

### Restore Database
```bash
cp telegram_users_20250110.json telegram_users.json
pm2 restart netflix-bot
```

---

## 🎨 Customization

### Remove 1 Trial Limit
Edit `hasUsedTrial()` in `telegram-bot.js`:
```javascript
function hasUsedTrial(userId) {
    return false; // Always allow
}
```

### Change Welcome Message
Edit `/start` handler in `telegram-bot.js`:
```javascript
const welcomeMessage = `Your custom message here`;
```

### Add Payment
Add payment check before generation:
```javascript
if (!hasPaid(userId)) {
    bot.sendMessage(chatId, 'Payment required!');
    return;
}
```

---

## 📝 Admin Tasks

### View All Users
```bash
cat telegram_users.json | jq '.users'
```

### Count Total Users
```bash
cat telegram_users.json | jq '.users | length'
```

### Reset Specific User (via Telegram)
```
/reset 123456789
```

### View Recent Generations
```bash
tail -20 telegram_bot_log.txt
```

---

## 🌐 Multiple Bots

Running multiple bots on same VPS:

```bash
# Bot 1
pm2 start telegram-bot.js --name netflix-bot-1

# Bot 2 (different folder & token)
cd ~/netflix-bot-2
pm2 start telegram-bot.js --name netflix-bot-2
```

Each bot has own database (telegram_users.json).

---

## ✅ Checklist Before Deploy

- [ ] Bot token configured
- [ ] Admin User ID set (optional)
- [ ] Dependencies installed (`npm install`)
- [ ] Playwright installed (`npx playwright install chromium`)
- [ ] PM2 installed (`npm install -g pm2`)
- [ ] Bot tested with `/start` command
- [ ] Database file writable
- [ ] Enough RAM (2GB minimum)

---

**Ready to deploy! 🚀**

For detailed guides:
- `README_TELEGRAM.md` - Bot features & usage
- `INSTALL_VPS.md` - VPS installation guide
