# Netflix Auto Register Bot v2.0 🚀

Bot otomatis untuk register akun Netflix menggunakan Mail.TM dengan fitur deteksi promo free trial + **AUTO GOPAY PAYMENT!**

## Fitur

✅ **Mode 1: Auto Register Only** - Register otomatis sampai tahap choose plan  
✅ **Mode 2: Auto Register + Paid Gopay** - Full automation with Gopay payment! ⭐ **NEW!**

### Fitur Utama:
- ✅ Deteksi promo free trial **30 HARI ONLY**
- ✅ Loop otomatis sampai dapat promo 30 hari (skip 7/14 hari)
- ✅ **Multi-threading support (1-10 thread)**
- ✅ **Fast retry** (optimized delays untuk speed)
- ✅ Generate email Mail.TM format: admin{3digit}@web-library.net
- ✅ **Auto Gopay registration** dengan Hero SMS API
- ✅ **Auto payment setup** di Netflix
- ✅ **Export cookies** format iXBrowser
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

## 🔑 API Configuration

### Hero SMS API
- **API Key**: `26314967c74A49d227f553c54419cc9f`
- **Base URL**: `https://hero-sms.com/api`
- **Digunakan untuk**: Mendapatkan nomor virtual Indonesia untuk registrasi Gopay

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
2. Auto Register + Paid Gopay ⭐ NEW!
0. Exit

Pilihan Anda (1/2/0): 2

Berapa thread yang ingin dijalankan? (1-10): 1
```

### Multi-Threading

Bot mendukung **1-10 thread** berjalan bersamaan.

⚠️ **Rekomendasi:**
- **Mode 1 (Register Only)**: 1-10 thread
- **Mode 2 (Gopay Payment)**: 1-3 thread (karena perlu Hero SMS API)

### Mode 1: Auto Register Only

Bot akan:
1. Generate email Mail.TM
2. Loop cek promo Netflix sampai dapat **30 hari**
3. Isi email di Netflix
4. Klik button "Try 30 Days"
5. Verifikasi email otomatis
6. Stop di halaman "Choose your plan"

**Output:** 
- `result.txt` - Email, password, dan link
- `cookies_threadX_timestamp.json` - Cookies untuk iXBrowser

### Mode 2: Auto Register + Paid Gopay ⭐

Bot akan melakukan FULL AUTOMATION:

1. **[1/8] 📧 MEMBUAT EMAIL MAIL.TM**
2. **[2/8] 🔍 MENCARI PROMO 30 HARI**
3. **[3/8] ✍️ MENGISI EMAIL**
4. **[4/8] 🖱️ KLIK "TRY 30 DAYS"**
5. **[5/8] 📤 KLIK "SEND LINK"**
6. **[6/8] 📬 VERIFIKASI EMAIL**
7. **[7/8] 🚀 CREATE ACCOUNT**
8. **[8/8] 💳 SETUP PAYMENT GOPAY:**
   - 8.1: Klik Next
   - 8.2: Pilih Digital Wallet
   - 8.3: Pilih Gopay
   - 8.4: Get nomor dari Hero SMS API
   - 8.5: Register Gopay otomatis
   - 8.6: Verify OTP dari Hero SMS
   - 8.7: Input nomor Gopay ke Netflix
   - 8.8: Submit payment
   - ✅ **DONE!**

## 🔄 Gopay Registration Flow

```
Hero SMS API → Get Virtual Number
       ↓
Gojek API → Register Gopay
       ↓
Hero SMS API → Get OTP Code
       ↓
Gojek API → Verify OTP
       ↓
Netflix → Input Gopay Number
       ↓
✅ Payment Complete!
```

### Gopay Details:
- **Nomor Format**: `+628xxxxx` (otomatis diformat)
- **PIN Default**: `090118`
- **OTP Timeout**: 120 detik
- **SMS Polling**: 5 detik interval

## Format Result

File: `result.txt`

```
[Thread #1] admin123@web-library.net|Admin123@|https://www.netflix.com/epr?code=XXXXX
[GOPAY] +6281234567890 | Token: eyJhbGciOiJIUzI1NiIsInR5cCI...
```

File: `cookies_thread1_1783590268.json`

```json
[
  {
    "creation_time": "1783590268",
    "domain": ".netflix.com",
    "name": "NetflixId",
    "value": "v%3D3%26ct%3D...",
    "secure": true,
    "http_only": true
  }
]
```

**Cookies bisa langsung di-import ke iXBrowser!**

## 📱 Hero SMS API Usage

### Get Number
```javascript
GET /get-number?api_key=XXX&country=id&service=go

Response:
{
  "status": "success",
  "id": "123456",
  "number": "628123456789"
}
```

### Get SMS
```javascript
GET /get-sms?api_key=XXX&id=123456

Response:
{
  "status": "success",
  "sms": "Your OTP is 123456"
}
```

## Deteksi Promo

Bot akan detect banner:

```html
<p data-uia="free-trial-banner-text">
  New to Netflix? Try 30 days for IDR 0.
</p>
```

**⚠️ IMPORTANT: Bot HANYA ambil promo 30 hari!**

Promo handling:
- ✅ **30 days** → LANJUT
- ❌ **14 days** → SKIP
- ❌ **7 days** → SKIP

Max retry: **20 kali**  
Retry delay: **500ms**

## Error Handling

Jika error, bot akan otomatis:
- Screenshot: `error_screenshot_thread{X}_{timestamp}.png`
- Save HTML: `error_page_thread{X}_{timestamp}.html`
- Log error message & stack trace

## Technical Details

### Dependencies:
- `playwright` - Browser automation
- `axios` - HTTP client

### APIs Used:
1. **Mail.TM API** - Email verification
   - Domain: `https://api.mail.tm`
   - Email: `admin{3digit}@web-library.net`
   - Password: `Admin123@`

2. **Hero SMS API** - Virtual phone numbers
   - Domain: `https://hero-sms.com/api`
   - API Key: `26314967c74A49d227f553c54419cc9f`
   - Country: `id` (Indonesia)
   - Service: `go` (Gopay/Gojek)

3. **Gojek API** - Gopay registration
   - Domain: `https://api.gojekapi.com`
   - Endpoints: `/v5/customers`, `/v5/customers/phone/verify`

### Browser:
- Engine: Chromium (Playwright)
- Headless: `false` (visible)
- Viewport: 1280x800

## Troubleshooting

### Error: "Promo tidak ditemukan"
**Solusi:** 
- Promo 30 hari tidak tersedia
- Coba VPN lokasi lain
- Tunggu beberapa jam

### Error: "Hero SMS timeout"
**Solusi:** 
- Cek API key valid
- Cek balance Hero SMS
- Nomor tidak menerima SMS

### Error: "Gopay registration failed"
**Solusi:** 
- Nomor sudah terdaftar
- API Gojek berubah
- Cek log error detail

### Multi-threading Issue
**Solusi:**
- Mode 2: Maksimal 1-3 thread (karena Hero SMS API limit)
- Mode 1: Bisa 1-10 thread

## 🎯 Best Practices

### Mode 1 (Register Only):
- Thread: 5-10 untuk speed maksimal
- Output: Email + cookies
- Use case: Butuh banyak akun cepat

### Mode 2 (Gopay Payment):
- Thread: 1-3 (Hero SMS API limit)
- Output: Email + Gopay + cookies
- Use case: Akun Netflix siap pakai dengan payment

## 📚 Files Generated

| File | Description |
|------|-------------|
| `result.txt` | Email, password, link, gopay info |
| `cookies_threadX_timestamp.json` | Cookies format iXBrowser |
| `error_screenshot_threadX_timestamp.png` | Screenshot saat error |
| `error_page_threadX_timestamp.html` | HTML saat error |
| `token.txt` | Gopay access tokens (from PHP script) |

## 🔗 References

- [Playwright Docs](https://playwright.dev)
- [Mail.TM API](https://docs.mail.tm)
- [Hero SMS API](https://hero-sms.com/api)
- [HERO_SMS_GUIDE.md](./HERO_SMS_GUIDE.md) - Detailed Hero SMS integration

## 📝 Credits

**Based on PHP scripts:**
- `antojek.php` - Gopay registration logic
- `function.php` - Helper functions

**Converted to JavaScript with:**
- Multi-threading support
- Hero SMS API integration
- Netflix payment automation
- Cookie export for iXBrowser

## ⚠️ Disclaimer

Bot ini hanya untuk tujuan edukasi. Gunakan dengan bijak dan patuhi Terms of Service Netflix dan Gopay.

## Author

Netflix Auto Register Bot v2.0 with Gopay Payment

## License

ISC

---

Made with ❤️ for automation enthusiasts
