# 🚀 Panduan Install Bot di Ubuntu VPS

## Persiapan

Bot ini bisa dijalankan bersamaan dengan website Anda di VPS yang sama. Bot akan berjalan di background menggunakan PM2.

### Spesifikasi VPS Minimum:
- Ubuntu 18.04+ atau 20.04+
- RAM: 2GB minimum (4GB recommended)
- Storage: 5GB free space
- Node.js: v16+

---

## 📦 Step 1: Install Dependencies

### 1.1 Update sistem
```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2 Install Node.js (jika belum ada)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Cek versi:
```bash
node -v  # Should be v18.x or higher
npm -v
```

### 1.3 Install Playwright dependencies
```bash
# Install browser dependencies
sudo apt install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0
```

### 1.4 Install PM2 (process manager)
```bash
sudo npm install -g pm2
```

---

## 📁 Step 2: Upload Bot ke VPS

### 2.1 Buat folder untuk bot (pisah dari website)
```bash
# Misalnya website Anda di /var/www/html
# Kita buat folder bot di /home/username/netflix-bot

cd ~
mkdir netflix-bot
cd netflix-bot
```

### 2.2 Upload files
Transfer files dari Windows ke VPS menggunakan SCP atau SFTP:

**Dari Windows (PowerShell):**
```powershell
# Ganti username dan IP VPS Anda
scp -r "a:\Bot\netflix 2\*" username@your-vps-ip:~/netflix-bot/
```

**Atau gunakan FileZilla / WinSCP untuk upload:**
- `telegram-bot.js`
- `package.json`
- `package-lock.json`

### 2.3 Atau clone via Git (jika ada repo)
```bash
cd ~/netflix-bot
git clone <your-repo-url> .
```

---

## ⚙️ Step 3: Install Node Modules

```bash
cd ~/netflix-bot
npm install
```

Install Playwright browser (Chromium):
```bash
npx playwright install chromium
```

---

## 🔧 Step 4: Konfigurasi Bot

### 4.1 Edit token bot (jika belum)
```bash
nano telegram-bot.js
```

Cari baris:
```javascript
const BOT_TOKEN = '8557661156:AAG49v40J15F140lI4CAba8Ypx0E_uy8_M8';
```

Pastikan token sudah benar.

### 4.2 (Optional) Set Admin User ID
Untuk menggunakan command admin `/reset` dan `/stats`, set User ID Telegram Anda:

```javascript
const ADMIN_USER_ID = 123456789; // Ganti dengan User ID Anda
```

**Cara dapat User ID:**
1. Chat ke bot [@userinfobot](https://t.me/userinfobot)
2. Bot akan reply dengan User ID Anda

---

## 🚀 Step 5: Jalankan Bot

### 5.1 Test dulu (manual)
```bash
cd ~/netflix-bot
node telegram-bot.js
```

Jika muncul:
```
🤖 Netflix Email Generator Bot started!
✅ Bot is running...
```

Berarti bot sudah jalan! Tekan `Ctrl+C` untuk stop.

### 5.2 Jalankan dengan PM2 (production)
```bash
cd ~/netflix-bot
pm2 start telegram-bot.js --name netflix-bot
```

### 5.3 Set PM2 auto-restart on reboot
```bash
pm2 startup
pm2 save
```

---

## 📊 Step 6: Monitoring Bot

### Cek status bot:
```bash
pm2 status
```

### Lihat logs:
```bash
pm2 logs netflix-bot
```

### Restart bot:
```bash
pm2 restart netflix-bot
```

### Stop bot:
```bash
pm2 stop netflix-bot
```

### Delete bot dari PM2:
```bash
pm2 delete netflix-bot
```

---

## 🔒 Step 7: Security (Optional)

### 7.1 Buat user khusus untuk bot
```bash
sudo adduser netflixbot
sudo su - netflixbot
cd ~
# Upload bot ke sini
```

### 7.2 Firewall (jika perlu)
Bot hanya butuh koneksi keluar (ke Telegram API & Netflix), tidak butuh port terbuka.

---

## 📝 File Structure di VPS

```
/home/username/netflix-bot/
├── telegram-bot.js          # Main bot file
├── package.json
├── package-lock.json
├── node_modules/            # Dependencies
├── telegram_users.json      # Database (auto-created)
└── telegram_bot_log.txt     # Log file (auto-created)
```

Website Anda tetap di folder terpisah:
```
/var/www/html/               # Website Anda (tidak terpengaruh)
/home/username/netflix-bot/  # Bot Telegram (folder terpisah)
```

---

## 🎯 Cara Pakai Bot

### User Commands:
1. `/start` - Mulai bot
2. `/generate` - Generate email Netflix (1x per akun)
3. `/status` - Cek status trial
4. `/help` - Panduan lengkap

### Admin Commands (jika sudah set ADMIN_USER_ID):
1. `/reset <user_id>` - Reset trial user
2. `/stats` - Lihat statistik bot

---

## 🐛 Troubleshooting

### Problem: Bot tidak jalan
```bash
# Cek logs error
pm2 logs netflix-bot --lines 100
```

### Problem: Playwright error
```bash
# Install ulang browser dependencies
npx playwright install-deps chromium
npx playwright install chromium
```

### Problem: Permission denied
```bash
# Fix permissions
chmod +x telegram-bot.js
```

### Problem: Out of memory
```bash
# Cek RAM usage
free -h

# Jika RAM penuh, upgrade VPS atau kurangi user concurrent
```

### Problem: Bot stuck/hang
```bash
# Restart bot
pm2 restart netflix-bot

# Atau restart PM2 sekalian
pm2 restart all
```

---

## 📈 Monitoring Resources

### Cek CPU & RAM usage:
```bash
pm2 monit
```

### Cek disk space:
```bash
df -h
```

### Cek bot uptime:
```bash
pm2 status netflix-bot
```

---

## 🔄 Update Bot

Jika ada update code:
```bash
cd ~/netflix-bot
pm2 stop netflix-bot
# Upload file baru atau git pull
pm2 restart netflix-bot
```

---

## 🗑️ Uninstall

```bash
pm2 delete netflix-bot
rm -rf ~/netflix-bot
```

---

## 💡 Tips

1. **Website tetap aman**: Bot berjalan di folder terpisah, tidak akan bentrok dengan website
2. **Backup database**: `telegram_users.json` berisi data user, backup berkala
3. **Monitor logs**: Cek `pm2 logs` secara berkala untuk error
4. **Resource usage**: 1 proses bot = ~200-500MB RAM saat generate email
5. **Rate limiting**: Netflix/Mail.TM bisa block jika terlalu banyak request, batasi user concurrent

---

## 📞 Support

Jika ada masalah, cek:
1. PM2 logs: `pm2 logs netflix-bot`
2. Bot log file: `cat telegram_bot_log.txt`
3. Database: `cat telegram_users.json`

---

**Bot siap dipakai! 🎉**

Test bot di Telegram: `@YourBotUsername`
