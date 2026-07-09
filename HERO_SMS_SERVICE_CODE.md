# 🔍 Hero SMS Service Code untuk Gojek

## ❌ Problem
Bot membeli nomor dengan service code yang salah, dapat nomor YouTube/Google bukan Gojek!

Screenshot menunjukkan:
- ✅ Service UI: "Gojek" 
- ✅ Country: "Indonesia"
- ❌ Nomor yang dibeli: YouTube/Google icon

---

## 🎯 Cara Cek Service Code yang Benar

### **Method 1: Hero SMS Dashboard**

1. **Login ke Hero SMS:** https://hero-sms.com
2. **Buka halaman aktivasi baru**
3. **Pilih:**
   - Service: **Gojek**
   - Country: **Indonesia**
4. **Buka Browser DevTools:**
   - Chrome: F12 → Network tab
   - Firefox: F12 → Network
5. **Klik "Buy" atau beli nomor**
6. **Lihat API request:**
   ```
   GET https://hero-sms.com/stubs/handler_api.php?
     api_key=xxx&
     action=getNumber&
     service=XX  ← INI SERVICE CODE YANG BENAR!
     &country=6
   ```
7. **Copy service code** yang muncul di request

---

### **Method 2: Test via CURL**

Test manual dengan berbagai service code:

```bash
# Test 1: Service 'gj'
curl "https://hero-sms.com/stubs/handler_api.php?api_key=YOUR_API_KEY&action=getNumber&service=gj&country=6"

# Test 2: Service 'gojek'
curl "https://hero-sms.com/stubs/handler_api.php?api_key=YOUR_API_KEY&action=getNumber&service=gojek&country=6"

# Test 3: Service 'gp' (gopay)
curl "https://hero-sms.com/stubs/handler_api.php?api_key=YOUR_API_KEY&action=getNumber&service=gp&country=6"

# Test 4: Service 'ot' (other)
curl "https://hero-sms.com/stubs/handler_api.php?api_key=YOUR_API_KEY&action=getNumber&service=ot&country=6"
```

**Response Success:**
```
ACCESS_NUMBER:123456:6285xxxxxxxxx
```

**Response Error (Wrong Service):**
```
BAD_SERVICE
```

**Response No Stock:**
```
NO_NUMBERS
```

---

### **Method 3: Contact Hero SMS Support**

Jika masih bingung, tanya langsung ke Hero SMS:
- **Website:** https://hero-sms.com
- **Email/Support:** Ada di dashboard
- **Question:** "What is the correct service code for Gojek/Gopay in Indonesia?"

---

## 🔧 Cara Update Service Code di Bot

### **File:** `bot.js`
### **Lokasi:** Sekitar baris 940-950

```javascript
// EDIT SERVICE CODE DI SINI:
const SERVICE_CODE = 'gj';  // ← GANTI INI!

const heroNumber = await getHeroSmsNumber('id', SERVICE_CODE, 3);
```

### **Kemungkinan Service Code:**
- `gj` - Gojek (kemungkinan)
- `gojek` - Gojek full name
- `gp` - Gopay
- `ot` - Other/Gojek
- `go` - ❌ WRONG! Ini untuk YouTube/Google

---

## 📊 Service Code List (Common)

Berdasarkan SMS-Activate standard:

| Service | Code | Notes |
|---------|------|-------|
| Google/YouTube | `go` | ❌ Bukan Gojek! |
| WhatsApp | `wa` | - |
| Telegram | `tg` | - |
| Facebook | `fb` | - |
| Instagram | `ig` | - |
| Gojek/Gopay | `gj` atau `gojek` atau `gp` | ✅ Yang kita cari |
| Tokopedia | `tk` | - |
| Shopee | `sp` | - |

---

## 🧪 Test Bot dengan Logging

Bot sekarang menampilkan log detail:

```
[*] Mengambil nomor dari Hero SMS... (attempt 1/3)
[*] Service: 'gj' | Country: 'id'
[*] API Request: service=gj, country=6
[*] Hero SMS Response: ACCESS_NUMBER:123456:6285xxxxxxxxx
[+] Nomor berhasil didapat: 6285xxxxxxxxx
[+] Activation ID: 123456
[!] ⚠️  PENTING: Pastikan service code 'gj' benar untuk Gojek!
[!] Jika nomor bukan untuk Gojek, cek service code di Hero SMS dashboard
```

Jika response: `BAD_SERVICE`:
```
[-] ❌ BAD_SERVICE: Service code 'gj' tidak valid!
[-] Kemungkinan service code yang benar:
    - 'gojek' (full name)
    - 'gp' (gopay)
    - 'ot' (other services)
[-] Cek dokumentasi Hero SMS untuk service code Gojek yang benar
```

---

## ✅ Action Items

1. **Cek service code** via Method 1, 2, atau 3 di atas
2. **Update `SERVICE_CODE`** di `bot.js` baris ~945
3. **Test bot** dengan `node bot.js`
4. **Verifikasi nomor** yang dibeli benar untuk Gojek (bukan YouTube/Google)

---

## 📝 Current Status

**Service Code Tested:**
- ❌ `go` - Salah! (YouTube/Google)
- ⏳ `gj` - Perlu diverifikasi

**Next Steps:**
1. Cek service code yang benar
2. Update bot
3. Test ulang

---

## 👨‍💻 Author
Documentation by Kiro AI Assistant
