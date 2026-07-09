# Netflix Auto Register Bot v2.0

Bot otomatis untuk register akun Netflix menggunakan Mail.TM dengan fitur deteksi promo free trial.

## Fitur

✅ **Auto Register Only** - Register otomatis sampai tahap choose plan
🔜 **Auto Register + Paid Gopay** - Coming soon (payment automation)

### Fitur Utama:
- ✅ Deteksi promo free trial **30 HARI ONLY**
- ✅ Loop otomatis sampai dapat promo 30 hari (skip 7/14 hari)
- ✅ **Multi-threading support (1-10 thread)**
- ✅ **Fast retry** (optimized delays untuk speed)
- ✅ Generate email Mail.TM format: admin{3digit}@web-library.net
- ✅ Password Mail.TM: Admin123@
- ✅ Tunggu email verifikasi "You're almost there!"
- ✅ Extract link: https://www.netflix.com/epr?code=XXXXX#no_ul
- ✅ Auto klik "Create Your Account"
- ✅ Simpan hasil ke result.txt
- ✅ Screenshot & HTML saat error

## Cara Install

### 1. Install Dependencies

```cmd
npm install
```

### 2. Install Playwright Browsers

```cmd
npx playwright install chromium
```

## Cara Pakai

### Jalankan Bot:

```cmd
node bot.js
```

### Menu:

```
╔═══════════════════════════════════════╗
║     NETFLIX AUTO REGISTER BOT        ║
╚═══════════════════════════════════════╝

Pilih mode:
1. Auto Register Only
2. Auto Register + Paid Gopay (Coming Soon)
0. Exit

Pilihan Anda (1/2/0): 1

Berapa thread yang ingin dijalankan? (1-10): 3

[*] Menjalankan 3 thread...
```

### Multi-Threading

Bot mendukung **1-10 thread** berjalan bersamaan untuk mempercepat proses register.

**Contoh:**
- **1 thread** = 1 akun per proses
- **3 thread** = 3 akun dibuat bersamaan
- **5 thread** = 5 akun dibuat bersamaan

⚠️ **Rekomendasi:**
- PC Low-end: 1-2 thread
- PC Medium: 3-5 thread
- PC High-end: 5-10 thread

### Mode 1: Auto Register Only

Bot akan:
1. Generate email Mail.TM
2. Loop cek promo Netflix sampai dapat **30 hari** (maksimal 20x)
   - Promo 7 hari → SKIP
   - Promo 14 hari → SKIP
   - Promo 30 hari → LANJUT ✅
   - **Fast retry** (500ms delay, bukan 2000ms)
3. Isi email di Netflix
4. Klik button "Try 30 Days for IDR 0"
5. Klik "Send Link"
6. Tunggu email verifikasi (max 3 menit)
7. Buka link verifikasi
8. Klik "Create Your Account"
9. Stop di halaman "Choose your plan"

**Output:** Email, password, dan link tersimpan di `result.txt`

⚡ **Speed Optimizations:**
- Page load timeout: 60s → **30s**
- After load wait: 3000ms → **1500ms**
- Retry delay: 2000ms → **500ms**
- Max attempts: 15x → **20x**

### Mode 2: Auto Register + Paid Gopay

🚧 **Coming Soon** - Fitur payment Gopay masih dalam pengembangan

## Flow Bot

```
[1/8] 📧 MEMBUAT EMAIL MAIL.TM
      ↓
[2/8] 🔍 MENCARI PROMO 30 HARI (Loop sampai dapat, skip 7/14 hari)
      ↓
[3/8] ✍️ MENGISI EMAIL
      ↓
[4/8] 🖱️ KLIK BUTTON "TRY 30 DAYS FOR IDR 0"
      ↓
[5/8] 📤 KLIK "SEND LINK"
      ↓
[6/8] 📬 MENUNGGU EMAIL VERIFIKASI
      ↓
[7/8] 🚀 MEMBUKA LINK & KLIK CREATE ACCOUNT
      ↓
[8/8] 📋 HALAMAN CHOOSE PLAN (STOP)
```

## Format Result

File: `result.txt`

```
[Thread #1] admin123@web-library.net|Admin123@|https://www.netflix.com/epr?code=XXXXX#no_ul
[Thread #2] admin456@web-library.net|Admin123@|https://www.netflix.com/epr?code=YYYYY#no_ul
[Thread #3] admin789@web-library.net|Admin123@|https://www.netflix.com/epr?code=ZZZZZ#no_ul
```

Format: `[Thread #X] email|password_mailtm|verification_link`

## Deteksi Promo

Bot akan detect banner:

```html
<p data-uia="free-trial-banner-text">
  New to Netflix? Try 30 days for IDR 0.
</p>
```

**⚠️ IMPORTANT: Bot HANYA ambil promo 30 hari!**

Promo handling:
- ✅ **30 days for IDR 0** → LANJUT register
- ❌ **14 days for IDR 0** → SKIP, retry (fast 500ms)
- ❌ **7 days for IDR 0** → SKIP, retry (fast 500ms)
- ❌ **Tidak dapat promo** → SKIP, retry (fast 500ms)

Max retry: **20 kali** (naikkan dari 15x)
Retry speed: **500ms** (turun dari 2000ms)

## Email Verification

Bot menunggu email dari Netflix dengan subject:
- "You're almost there!"
- "create your account"

Link format: `https://www.netflix.com/epr?code=XXXXX#no_ul`

## Error Handling

Jika error, bot akan otomatis:
- Screenshot: `error_screenshot_thread{X}_{timestamp}.png`
- Save HTML: `error_page_thread{X}_{timestamp}.html`
- Log error message & stack trace

Setiap thread punya error file sendiri untuk debugging.

## Technical Details

### Dependencies:
- `playwright` - Browser automation
- `axios` - HTTP client untuk Mail.TM API

### Mail.TM API:
- Domain: `https://api.mail.tm`
- Email format: `admin{3digit}@web-library.net`
- Password: `Admin123@`

### Browser:
- Engine: Chromium (Playwright)
- Headless: `false` (visible)
- Viewport: 1280x800

## Troubleshooting

### Error: "Tidak menemukan promo setelah 20 percobaan"
**Solusi:** 
- Promo 30 hari tidak tersedia di region/IP Anda
- Coba pakai VPN lokasi lain
- Tunggu beberapa jam/hari, promo bisa berubah

### Banyak browser terbuka (multi-thread)
**Solusi:**
- Kurangi jumlah thread
- 1-2 thread untuk PC low-end
- 3-5 thread untuk PC medium
- Close browser lain untuk free up memory

### Error: "Email verifikasi tidak diterima dalam 3 menit"
**Solusi:** 
- Cek email manual di https://mail.tm
- Cek spam/promotions folder
- Mungkin Netflix sedang slow

### Error: "Button tidak ditemukan"
**Solusi:** Netflix mungkin update UI. Cek screenshot error dan update selector.

## Notes

- ⚠️ Bot menggunakan Playwright (lebih stabil dari Puppeteer)
- ⚠️ Email Mail.TM kadang lambat, tunggu 3 menit
- ⚠️ Netflix UI bisa berubah sewaktu-waktu
- ⚠️ Mode payment Gopay belum ready
- ⚡ **Multi-threading support 1-10 thread**
- ⚡ **Fast retry mode** (500ms vs 2000ms)
- 📊 Setiap thread berjalan independent
- 📊 Result tersimpan dengan label thread ID

## Author

Netflix Auto Register Bot v2.0

## License

ISC
