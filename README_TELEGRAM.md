# 🤖 Netflix Email Generator - Telegram Bot

Bot Telegram untuk auto-generate email Netflix dengan promo 30 hari gratis.

## ✨ Fitur

✅ **1 Trial per Telegram Account** - Setiap user dapat 1x generate gratis  
✅ **Auto Mail.TM** - Email dibuat otomatis  
✅ **Auto Verify** - Email Netflix auto-verify  
✅ **Database System** - Track user yang sudah pakai trial  
✅ **Admin Commands** - Reset user & statistik  
✅ **VPS Ready** - Bisa jalan di Ubuntu VPS headless  

---

## 🔧 Konfigurasi

### Bot Token
```javascript
const BOT_TOKEN = '8557661156:AAG49v40J15F140lI4CAba8Ypx0E_uy8_M8';
```

Bot sudah dikonfigurasi dengan token Anda.

### Admin User ID (Optional)
Untuk menggunakan command admin, set User ID Telegram Anda:

```javascript
const ADMIN_USER_ID = 123456789; // Ganti dengan User ID Anda
```

**Cara dapat User ID:**
- Chat ke [@userinfobot](https://t.me/userinfobot)
- Bot akan reply dengan User ID Anda

---

## 📦 Install Dependencies

```bash
npm install
```

Atau manual:
```bash
npm install axios playwright node-telegram-bot-api
```

Install Playwright browser:
```bash
npx playwright install chromium
```

---

## 🚀 Jalankan Bot

### Windows (Development)
```cmd
node telegram-bot.js
```

### Ubuntu VPS (Production)
```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start telegram-bot.js --name netflix-bot

# Auto-restart on reboot
pm2 startup
pm2 save
```

Lihat **INSTALL_VPS.md** untuk panduan lengkap install di VPS.

---

## 💬 Commands

### User Commands

| Command | Deskripsi |
|---------|-----------|
| `/start` | Welcome message & instruksi |
| `/generate` | Generate email Netflix (1x per akun) |
| `/status` | Cek status trial user |
| `/help` | Panduan lengkap |

### Admin Commands

| Command | Deskripsi | Requirement |
|---------|-----------|-------------|
| `/reset <user_id>` | Reset trial user | Admin only |
| `/stats` | Statistik bot & recent users | Admin only |

---

## 📊 Database

Bot menggunakan file JSON sederhana untuk menyimpan data user:

**File:** `telegram_users.json`

**Format:**
```json
{
  "users": {
    "123456789": {
      "username": "john_doe",
      "email": "admin123@web-library.net",
      "timestamp": "2025-01-10T12:34:56.789Z",
      "used": true
    }
  }
}
```

**Fungsi:**
- Track user yang sudah pakai trial
- Prevent abuse (1 trial per akun)
- Log history

---

## 🎯 Flow Bot

```
User: /generate
    ↓
Cek database → Sudah pakai? → ❌ Tolak
    ↓ Belum
Generate Mail.TM account
    ↓
Launch Playwright (headless)
    ↓
Open Netflix → Input email → Send Link
    ↓
Wait email verifikasi (Mail.TM API)
    ↓
Open verification link
    ↓
✅ Send result ke user
    ↓
Save to database (mark as used)
```

---

## 📁 File Structure

```
netflix-bot/
├── telegram-bot.js              # Main bot file
├── package.json
├── package-lock.json
├── node_modules/
├── telegram_users.json          # Database (auto-created)
├── telegram_bot_log.txt         # Log file (auto-created)
├── README_TELEGRAM.md           # This file
└── INSTALL_VPS.md               # VPS installation guide
```

---

## 🔒 Security

### 1 Trial per User
Bot menggunakan **Telegram User ID** untuk track trial:
- User ID = unique per akun Telegram
- Tidak bisa di-fake atau bypass
- Database persistent (file JSON)

### Admin Protection
Command admin hanya bisa diakses jika:
```javascript
const ADMIN_USER_ID = 123456789; // Set User ID admin
```

Tanpa set ini, semua admin command tidak bisa dipakai.

---

## 📝 Logging

### Bot Log File
**File:** `telegram_bot_log.txt`

**Format:**
```
[2025-01-10T12:34:56.789Z] User: john_doe (123456789) | Email: admin123@web-library.net
```

### PM2 Logs (VPS)
```bash
pm2 logs netflix-bot          # Live logs
pm2 logs netflix-bot --lines 100  # Last 100 lines
```

---

## 🐛 Error Handling

Bot menangani error otomatis:

### Error Types:
1. **Mail.TM gagal** → Retry otomatis
2. **Netflix timeout** → Inform user, trial tidak hangus
3. **Email tidak terkirim** → Inform user, trial tidak hangus
4. **Browser crash** → Auto-close, trial tidak hangus

### User Experience:
- Jika gagal → Trial **TIDAK** dianggap terpakai
- User bisa `/generate` lagi
- Database hanya update jika **sukses**

---

## ⚙️ Konfigurasi Advanced

### Timeout Settings
Edit di `telegram-bot.js`:

```javascript
// Email verification timeout (default: 3 menit)
await waitForNetflixEmail(mailToken, 180000); // 180000ms = 3 menit

// Page navigation timeout (default: 1 menit)
await page.goto(url, { timeout: 60000 });
```

### Cookies 30 Days
Cookies sudah dikonfigurasi dengan promo 30 hari:
```javascript
const COOKIES_30_DAYS = [ ... ];
```

Jika cookies expired, update dari `netflix-mass-bot.js` atau browser extension.

---

## 🚨 Troubleshooting

### Bot tidak respond
```bash
# Cek bot running
pm2 status netflix-bot

# Restart bot
pm2 restart netflix-bot
```

### Error: Playwright not found
```bash
npx playwright install chromium
```

### Error: Permission denied
```bash
chmod +x telegram-bot.js
```

### Error: Database corrupted
```bash
# Backup dulu
cp telegram_users.json telegram_users.json.bak

# Reset database
echo '{"users":{}}' > telegram_users.json
```

### User spam /generate
Bot sudah handle otomatis:
- Cek database sebelum proses
- Jika sudah pakai → Tolak
- Tidak ada rate limiting needed

---

## 📈 Monitoring

### Resource Usage
1 proses generate email = **~200-500MB RAM**

**Recommendations:**
- VPS 2GB RAM → Handle ~3-5 concurrent requests
- VPS 4GB RAM → Handle ~8-10 concurrent requests

### Database Size
- 1 user = ~150 bytes
- 1000 users = ~150KB
- 10,000 users = ~1.5MB

Database sangat ringan!

---

## 🔄 Update Bot

Jika ada update code:

**Windows:**
```cmd
git pull
node telegram-bot.js
```

**VPS:**
```bash
cd ~/netflix-bot
pm2 stop netflix-bot
git pull
pm2 restart netflix-bot
```

Database tidak akan hilang (persistent di `telegram_users.json`).

---

## 💡 Best Practices

### 1. Backup Database
```bash
# Backup daily
cp telegram_users.json telegram_users_$(date +%Y%m%d).json
```

### 2. Monitor Logs
```bash
# Cek error berkala
pm2 logs netflix-bot --lines 50 | grep "Error"
```

### 3. Clean Old Logs
```bash
# PM2 auto-rotate logs, tapi bisa manual juga
pm2 flush netflix-bot
```

### 4. Update Cookies
Jika promo 30 hari tidak muncul:
- Cookies expired
- Dapatkan cookies baru dari browser dengan promo 30 hari
- Update `COOKIES_30_DAYS` di `telegram-bot.js`

---

## 🎯 Use Cases

### Personal Use
- Share bot ke teman (private)
- 1 trial per orang
- Free Netflix email generator

### Commercial Use
- Jual trial Netflix (paid)
- Modify code untuk remove 1 trial limit
- Add payment gateway

---

## 🛠️ Customization

### Change Trial Limit
Edit fungsi `hasUsedTrial()`:

```javascript
// Allow unlimited trials
function hasUsedTrial(userId) {
    return false; // Always return false
}
```

### Add Payment System
Integrate payment gateway:
```javascript
// Before generate, check payment
if (!hasPaid(userId)) {
    bot.sendMessage(chatId, 'Silakan bayar dulu!');
    return;
}
```

### Custom Email Domain
Edit Mail.TM domain selection:
```javascript
let domain = 'your-custom-domain.com';
```

---

## 📞 Support

### Bot tidak jalan?
1. Cek token bot valid: `BOT_TOKEN`
2. Cek Playwright installed: `npx playwright --version`
3. Cek logs: `pm2 logs netflix-bot`

### Email tidak terkirim?
1. Cek Mail.TM API status: https://mail.tm
2. Cek Netflix tidak block cookies
3. Update cookies baru

### User complain "Trial sudah digunakan"?
Admin bisa reset:
```
/reset <user_id>
```

---

## 📄 License

ISC License

---

## 🎉 Credits

- **Playwright** - Browser automation
- **Mail.TM** - Temporary email API
- **node-telegram-bot-api** - Telegram Bot API
- **Netflix** - Email automation target

---

**Bot siap dipakai! Test di Telegram sekarang! 🚀**

Bot Token: `8557661156:AAG49v40J15F140lI4CAba8Ypx0E_uy8_M8`

Username bot: `@YourBotUsername` (sesuaikan dengan bot Anda)
