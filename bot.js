// bot.js
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs/promises');
const readline = require('readline');

// Hero SMS API Configuration
const HERO_SMS_API_KEY = '26314967c74A49d227f553c54419cc9f';
const HERO_SMS_BASE_URL = 'https://hero-sms.com/stubs/handler_api.php';

// --- Interface untuk input user ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// --- Hero SMS API Functions ---
async function getHeroSmsNumber(country = 'id', service = 'gj', retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`[*] Mengambil nomor dari Hero SMS... (attempt ${attempt}/${retries})`);
            console.log(`[*] Service: '${service}' | Country: '${country}'`);
            
            // Gunakan SMS-Activate compatible endpoint
            // action=getNumber dengan service dan country code
            // Indonesia country code = 6
            // Gojek service code = perlu dicek (gj, gojek, gp, atau lainnya)
            
            let countryCode = 6; // Indonesia default
            if (country === 'id' || country === 'indonesia') {
                countryCode = 6;
            }
            
            console.log(`[*] API Request: service=${service}, country=${countryCode}`);
            
            const response = await axios.get(HERO_SMS_BASE_URL, {
                params: {
                    api_key: HERO_SMS_API_KEY,
                    action: 'getNumber',
                    service: service,
                    country: countryCode
                },
                timeout: 30000 // 30 second timeout
            });
            
            // Response format: "ACCESS_NUMBER:activationId:phoneNumber"
            const responseText = response.data;
            
            console.log(`[*] Hero SMS Response: ${responseText}`);
            
            if (typeof responseText === 'string' && responseText.startsWith('ACCESS_NUMBER:')) {
                const parts = responseText.split(':');
                const id = parts[1]; // activation ID
                const number = parts[2]; // phone number
                
                console.log(`[+] Nomor berhasil didapat: ${number}`);
                console.log(`[+] Activation ID: ${id}`);
                console.log(`[!] ⚠️  PENTING: Pastikan service code '${service}' benar untuk Gojek!`);
                console.log(`[!] Jika nomor bukan untuk Gojek, cek service code di Hero SMS dashboard`);
                return { id, number };
            } else if (responseText === 'NO_NUMBERS') {
                console.log('[-] Tidak ada nomor tersedia');
                if (attempt < retries) {
                    console.log(`[*] Retry in 5 seconds...`);
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }
                return null;
            } else if (responseText.startsWith('BAD_SERVICE')) {
                console.error(`[-] ❌ BAD_SERVICE: Service code '${service}' tidak valid!`);
                console.error(`[-] Kemungkinan service code yang benar:`);
                console.error(`    - 'gojek' (full name)`);
                console.error(`    - 'gp' (gopay)`);
                console.error(`    - 'ot' (other services)`);
                console.error(`[-] Cek dokumentasi Hero SMS untuk service code Gojek yang benar`);
                return null;
            } else {
                throw new Error(`Unexpected response: ${responseText}`);
            }
        } catch (error) {
            console.error(`[-] Error Hero SMS (attempt ${attempt}/${retries}):`, error.message);
            if (error.response) {
                console.error('[-] Response:', error.response.data);
            }
            
            if (attempt < retries) {
                console.log(`[*] Retry in 5 seconds...`);
                await new Promise(r => setTimeout(r, 5000));
            } else {
                return null;
            }
        }
    }
    return null;
}

async function getHeroSmsCode(activationId, timeout = 180000) {
    console.log('[*] Menunggu kode SMS...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const response = await axios.get(HERO_SMS_BASE_URL, {
                params: {
                    api_key: HERO_SMS_API_KEY,
                    action: 'getStatus',
                    id: activationId
                }
            });
            
            const responseText = response.data;
            
            // Response format:
            // "STATUS_WAIT_CODE" - waiting for SMS
            // "STATUS_OK:code" - code received
            // "STATUS_CANCEL" - cancelled
            
            if (typeof responseText === 'string') {
                if (responseText.startsWith('STATUS_OK:')) {
                    const code = responseText.split(':')[1];
                    console.log(`[+] SMS diterima!`);
                    console.log(`[+] Kode OTP: ${code}`);
                    return code;
                } else if (responseText === 'STATUS_WAIT_CODE') {
                    // Still waiting, continue polling
                } else if (responseText === 'STATUS_CANCEL') {
                    console.log('[-] Aktivasi dibatalkan');
                    return null;
                } else {
                    console.log(`[*] Status: ${responseText}`);
                }
            }
        } catch (error) {
            console.error(`[-] Error checking SMS: ${error.message}`);
        }
        
        await new Promise(r => setTimeout(r, 5000)); // Cek tiap 5 detik
    }
    
    console.log('[-] Timeout: SMS tidak diterima');
    return null;
}

async function cancelHeroSmsNumber(activationId) {
    try {
        await axios.get(HERO_SMS_BASE_URL, {
            params: {
                api_key: HERO_SMS_API_KEY,
                action: 'setStatus',
                id: activationId,
                status: 8 // 8 = cancel
            }
        });
        console.log('[*] Nomor dibatalkan');
    } catch (error) {
        console.error('[-] Error cancel nomor:', error.message);
    }
}

// --- Gopay Registration Functions (Converted from PHP) ---
async function generateRandomName() {
    try {
        const response = await axios.get('https://www.ninjaname.net/indonesian_name.php');
        const matches = response.data.match(/&bull; (.*?)<br\/>/g);
        if (matches && matches.length > 0) {
            const names = matches.map(m => m.replace(/&bull; |<br\/>/g, '').trim());
            return names[Math.floor(Math.random() * names.length)];
        }
    } catch (error) {
        console.error('[-] Error generating name:', error.message);
    }
    return 'User' + Math.floor(Math.random() * 10000);
}

function generateUniqueId() {
    return Date.now() + '57' + Math.floor(Math.random() * 9000 + 1000);
}

async function registerGopay(phoneNumber) {
    try {
        console.log('[*] Registrasi/Login Gopay (Customer Initiate Flow)...');
        
        // Generate unique identifiers
        const uniqueId = generateUniqueId();
        const transactionId = `${Date.now().toString(16).toUpperCase()}-${Math.random().toString(16).substr(2, 4).toUpperCase()}-${Math.random().toString(16).substr(2, 4).toUpperCase()}-${Math.random().toString(16).substr(2, 4).toUpperCase()}-${Math.random().toString(16).substr(2, 12).toUpperCase()}`;
        const sessionId = transactionId;
        
        // Format nomor: TANPA +62 atau 0, murni 8xxxxxxxx
        let plainPhone = phoneNumber;
        if (plainPhone.startsWith('+62')) {
            plainPhone = plainPhone.substring(3);
        } else if (plainPhone.startsWith('62')) {
            plainPhone = plainPhone.substring(2);
        } else if (plainPhone.startsWith('0')) {
            plainPhone = plainPhone.substring(1);
        }
        
        // Step 1: Initiate dengan customer.gopayapi.com
        console.log('[*] Step 1: Initiate customer session...');
        console.log(`[*] Phone (plain): ${plainPhone}`);
        
        const initiateBody = {
            phone_number: `+62${plainPhone}`,  // Initiate butuh +62
            country_code: 'ID'
        };
        
        console.log(`[*] Request body:`, JSON.stringify(initiateBody, null, 2));

        const initiateResponse = await axios.post(
            'https://customer.gopayapi.com/v1/support/customer/initiate',
            initiateBody,
            {
                headers: {
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'en-ID',
                    'Connection': 'keep-alive',
                    'Content-Type': 'application/json',
                    'Host': 'customer.gopayapi.com',
                    'User-Agent': 'Gojek/171035685 CFNetwork/3860.600.12 Darwin/25.5.0',
                    'X-AppId': 'com.go-jek.ios',
                    'X-AppVersion': '5.67.1',
                    'X-DeviceOS': 'iOS, 26.5.2',
                    'X-PhoneMake': 'Apple',
                    'X-PhoneModel': 'iPhone 17 Pro Max',
                    'X-Platform': 'iOS',
                    'X-Session-ID': sessionId,
                    'X-UniqueId': uniqueId,
                    'X-User-Locale': 'en_ID'
                },
                timeout: 30000
            }
        );
        
        console.log('[*] Response status:', initiateResponse.status);
        console.log('[*] Response data:', JSON.stringify(initiateResponse.data, null, 2));
        
        // Response bisa {"success": true} saja tanpa session_token
        // Artinya OTP sudah dikirim, kita simpan phone number sebagai identifier
        if (initiateResponse.data && initiateResponse.data.success) {
            console.log('[+] ✅ Initiate berhasil! OTP telah dikirim');
            console.log('[*] Session token tidak diperlukan, gunakan phone number sebagai identifier');
            
            return {
                success: true,
                phone: plainPhone,
                phoneWithCountry: `+62${plainPhone}`,
                uniqueId: uniqueId,
                sessionId: sessionId
            };
        } else {
            throw new Error('Initiate gagal: ' + JSON.stringify(initiateResponse.data));
        }
        
    } catch (error) {
        console.error('[-] Error registrasi Gopay (Customer Initiate):', error.message);
        if (error.response) {
            console.error('[-] Status:', error.response.status);
            console.error('[-] Response headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('[-] Response data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.request && !error.response) {
            console.error('[-] No response received');
        }
        return { success: false, error: error.message, details: error.response?.data };
    }
}

async function verifyGopayOtp(gopayRegister, otp) {
    try {
        console.log('[*] Verifikasi OTP Gopay (Customer Verify)...');
        
        const verifyData = {
            otp: otp,
            phone_number: gopayRegister.phoneWithCountry  // +6285xxx
        };
        
        console.log('[*] Request body:', JSON.stringify(verifyData, null, 2));
        
        const verifyResponse = await axios.post(
            'https://customer.gopayapi.com/v1/support/customer/verify',
            verifyData,
            {
                headers: {
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'en-ID',
                    'Connection': 'keep-alive',
                    'Content-Type': 'application/json',
                    'Host': 'customer.gopayapi.com',
                    'User-Agent': 'Gojek/171035685 CFNetwork/3860.600.12 Darwin/25.5.0',
                    'X-AppId': 'com.go-jek.ios',
                    'X-AppVersion': '5.67.1',
                    'X-DeviceOS': 'iOS, 26.5.2',
                    'X-PhoneMake': 'Apple',
                    'X-PhoneModel': 'iPhone 17 Pro Max',
                    'X-Platform': 'iOS',
                    'X-Session-ID': gopayRegister.sessionId,
                    'X-UniqueId': gopayRegister.uniqueId,
                    'X-User-Locale': 'en_ID'
                },
                timeout: 30000
            }
        );
        
        console.log('[*] Response status:', verifyResponse.status);
        console.log('[*] Response data:', JSON.stringify(verifyResponse.data, null, 2));
        
        if (verifyResponse.data && verifyResponse.data.success) {
            const token = verifyResponse.data.data?.access_token || verifyResponse.data.data?.token || 'no-token';
            const uuid = verifyResponse.data.data?.customer_id || verifyResponse.data.data?.resource_owner_id || 'verified';
            
            console.log('[+] ✅ Gopay berhasil diverifikasi!');
            console.log(`[+] Access Token: ${token !== 'no-token' ? token.substring(0, 30) + '...' : 'N/A'}`);
            console.log(`[+] Customer ID: ${uuid}`);
            
            return {
                success: true,
                token: token,
                uuid: uuid,
            };
        } else {
            throw new Error('Verification failed: ' + JSON.stringify(verifyResponse.data));
        }
        
    } catch (error) {
        console.error('[-] Error verifikasi Gopay (Customer Verify):', error.message);
        if (error.response) {
            console.error('[-] Status:', error.response.status);
            console.error('[-] Response headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('[-] Response data:', JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, error: error.message };
    }
}

async function setGopayPin(token, uuid, pin = '090118') {
    try {
        console.log('[*] Set PIN Gopay...');
        
        const pinData = { pin: pin };
        
        // Request OTP untuk set PIN
        const otpResponse = await axios.post(
            'https://api.gojekapi.com/wallet/pin',
            pinData,
            {
                headers: {
                    'Host': 'api.gojekapi.com',
                    'User-Agent': 'okhttp/3.10.0',
                    'Accept': 'application/json',
                    'Accept-Language': 'id-ID',
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-AppVersion': '3.46.1',
                    'X-UniqueId': Date.now() + '57' + Math.floor(Math.random() * 9000 + 1000),
                    'Connection': 'keep-alive',
                    'X-User-Locale': 'id_ID',
                    'Authorization': `Bearer ${token}`,
                    'User-uuid': uuid
                }
            }
        );
        
        console.log('[+] OTP untuk set PIN telah dikirim');
        return { success: true, needOtp: true };
        
    } catch (error) {
        console.error('[-] Error set PIN Gopay:', error.message);
        return { success: false, error: error.message };
    }
}

// --- Fungsi Mail.TM ---
async function getMailTmAccount() {
    try {
        console.log('[*] Mengambil domain mail.tm...');
        const domainRes = await axios.get('https://api.mail.tm/domains');
        const domains = domainRes.data['hydra:member'];
        
        // Cari domain web-library.net atau ambil yang pertama
        let domain = domains.find(d => d.domain === 'web-library.net')?.domain || domains[0].domain;
        
        const randomNumber = Math.floor(Math.random() * 900) + 100; // 3 digit: 100-999
        const address = `admin${randomNumber}@${domain}`;
        const password = "Admin123@";
        
        console.log(`[*] Membuat akun: ${address}`);
        
        try {
            await axios.post('https://api.mail.tm/accounts', { address, password });
            console.log('[+] Akun berhasil dibuat');
        } catch (createError) {
            if (createError.response?.status === 422) {
                console.log('[i] Akun sudah ada, lanjut login...');
            } else {
                throw createError;
            }
        }
        
        console.log('[*] Login untuk mendapatkan token...');
        const tokenRes = await axios.post('https://api.mail.tm/token', { address, password });
        const token = tokenRes.data.token;
        
        console.log('[+] Token berhasil didapatkan!');
        return { address, password, token };
        
    } catch (e) {
        console.error("[-] Error Mail.tm:", e.message);
        if (e.response) {
            console.error("[-] Response:", e.response.data);
        }
        return null;
    }
}

async function waitForNetflixEmail(token, timeout = 180000) {
    console.log("[*] Menunggu email dari Netflix...");
    console.log("[*] Subject yang dicari: 'You're almost there!' atau 'create your account'");
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const res = await axios.get('https://api.mail.tm/messages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const messages = res.data['hydra:member'];
            
            if (messages.length > 0) {
                console.log(`[*] Ditemukan ${messages.length} email`);
                
                // Cari email dari Netflix
                const netflixMail = messages.find(m =>
                    m.from.address.toLowerCase().includes('netflix') ||
                    m.from.address.toLowerCase().includes('info@account.netflix.com') ||
                    m.subject.toLowerCase().includes('almost there') ||
                    m.subject.toLowerCase().includes('create your account')
                );
                
                if (netflixMail) {
                    console.log(`[+] Email Netflix ditemukan!`);
                    console.log(`    From: ${netflixMail.from.address}`);
                    console.log(`    Subject: ${netflixMail.subject}`);
                    
                    const msgDetail = await axios.get(`https://api.mail.tm/messages/${netflixMail.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    const content = msgDetail.data.html?.[0] || msgDetail.data.text || '';
                    
                    // Cari link verifikasi dengan berbagai pattern
                    const patterns = [
                        /https?:\/\/(www\.)?netflix\.com\/epr\?code=[A-Z0-9]+#no_ul/gi,
                        /https?:\/\/(www\.)?netflix\.com\/epr\?[^"\s<]+/gi,
                        /netflix\.com\/epr\?code=[A-Z0-9]+#no_ul/gi,
                        /netflix\.com\/epr\?[^"\s<]+/gi
                    ];
                    
                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) {
                            let link = match[0];
                            if (!link.startsWith('http')) {
                                link = 'https://' + link;
                            }
                            link = link.replace(/&amp;/g, '&');
                            console.log(`[+] Link verifikasi ditemukan: ${link}`);
                            return link;
                        }
                    }
                    
                    console.log('[-] Link tidak ditemukan dalam email, mencoba parse manual...');
                    console.log('[DEBUG] Email content preview:', content.substring(0, 500));
                }
            }
        } catch (e) {
            console.error(`[-] Error checking email: ${e.message}`);
        }
        
        await new Promise(r => setTimeout(r, 10000)); // Cek tiap 10 detik
    }
    
    console.log('[-] Timeout: Email tidak diterima');
    return null;
}

// --- Fungsi cek promo Netflix ---
async function checkNetflixPromo(page) {
    console.log('[*] Mengecek banner promo...');
    
    try {
        // Tunggu banner muncul
        await page.waitForSelector('[data-uia="free-trial-banner-text"]', { timeout: 10000 });
        
        const bannerText = await page.locator('[data-uia="free-trial-banner-text"]').textContent();
        console.log(`[*] Banner text: ${bannerText}`);
        
        // HANYA AMBIL PROMO 30 DAYS
        if (bannerText.includes('30 days') || bannerText.includes('30 Days')) {
            console.log('[+] ✅ Promo 30 hari ditemukan! (TARGET)');
            return { hasPromo: true, days: 30, text: bannerText };
        } else if (bannerText.includes('14 days') || bannerText.includes('14 Days')) {
            console.log('[-] ❌ Promo 14 hari (SKIP - target 30 hari)');
            return { hasPromo: false, days: 14, text: bannerText };
        } else if (bannerText.includes('7 days') || bannerText.includes('7 Days')) {
            console.log('[-] ❌ Promo 7 hari (SKIP - target 30 hari)');
            return { hasPromo: false, days: 7, text: bannerText };
        } else {
            console.log('[-] ❌ Tidak ada promo free trial');
            return { hasPromo: false, days: 0, text: bannerText };
        }
    } catch (error) {
        console.log('[-] Banner promo tidak ditemukan');
        return { hasPromo: false, days: 0, text: '' };
    }
}

// --- Fungsi Utama Bot ---

async function runBot(mode, threadId = 1, selectedPlan = 'Mobile') {
    console.log(`\n=== NETFLIX BOT #${threadId} - START ===\n`);
    console.log(`Mode: ${mode === 1 ? 'Auto Register Only' : 'Auto Register + Paid Gopay'}\n`);
    if (mode === 2) {
        console.log(`Paket: ${selectedPlan}\n`);
    }
    
    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    
    const page = await context.newPage();

    try {
        // --- Step 1: Buat Email Mail.TM ---
        console.log(`[Thread #${threadId}] [1/8] 📧 MEMBUAT EMAIL MAIL.TM\n`);
        
        const mailAccount = await getMailTmAccount();
        if (!mailAccount) {
            throw new Error('Gagal membuat akun mail.tm');
        }
        
        const emailAddress = mailAccount.address;
        const emailPassword = mailAccount.password;
        const mailToken = mailAccount.token;
        
        console.log(`\n=== THREAD #${threadId} - ACCOUNT INFO ===`);
        console.log(`Email   : ${emailAddress}`);
        console.log(`Password: ${emailPassword}`);
        console.log(`Token   : ${mailToken.substring(0, 20)}...`);
        console.log(`====================\n`);

        // --- Step 2: Cari Netflix dengan Promo 30 HARI ---
        console.log(`[Thread #${threadId}] [2/8] 🔍 MENCARI PROMO NETFLIX (TARGET: 30 HARI)\n`);
        console.log('     ⚠️  Bot hanya akan ambil promo 30 hari');
        console.log('     ⚠️  Promo 7 atau 14 hari akan di-SKIP\n');
        
        let promoFound = false;
        let attempts = 0;
        const maxAttempts = 20; // Naikkan ke 20x
        
        while (!promoFound && attempts < maxAttempts) {
            attempts++;
            console.log(`[Thread #${threadId}] [*] Percobaan #${attempts}/${maxAttempts} - Membuka Netflix...`);
            
            await page.goto('https://www.netflix.com/clearcookies', { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 // Kurangi timeout 60s → 30s
            });
            
            // Kurangi wait time: 3000ms → 1500ms
            await page.waitForTimeout(1500);
            
            const promoCheck = await checkNetflixPromo(page);
            
            if (promoCheck.hasPromo && promoCheck.days === 30) {
                console.log(`[+] ✅ PROMO 30 HARI DITEMUKAN!`);
                console.log(`[+] Banner: ${promoCheck.text}\n`);
                promoFound = true;
            } else {
                if (promoCheck.days === 14 || promoCheck.days === 7) {
                    console.log(`[-] Promo ${promoCheck.days} hari di-skip, retry...\n`);
                } else {
                    console.log(`[-] Promo tidak tersedia, retry...\n`);
                }
                // Kurangi delay retry: 2000ms → 500ms
                await page.waitForTimeout(500);
            }
        }
        
        if (!promoFound) {
            throw new Error('Tidak menemukan promo 30 hari setelah ' + maxAttempts + ' percobaan');
        }

        // --- Step 3: Isi Email ---
        console.log(`[Thread #${threadId}] [3/8] ✍️ MENGISI EMAIL\n`);
        
        const emailInputSelector = 'input[data-uia="field-email"]';
        await page.waitForSelector(emailInputSelector, { timeout: 30000 });
        await page.fill(emailInputSelector, emailAddress);
        console.log(`[+] Email "${emailAddress}" berhasil diisi\n`);

        // --- Step 4: Klik "Try X Days" Button ---
        console.log(`[Thread #${threadId}] [4/8] 🖱️ KLIK BUTTON TRY FREE TRIAL\n`);
        
        // Cari button dengan berbagai selector
        const tryButtonSelectors = [
            'button[data-uia="nmhp-card-cta+hero_card"]',
            'button[type="submit"]',
            'button:has-text("Try")',
            'button:has-text("IDR")'
        ];
        
        let buttonClicked = false;
        for (const selector of tryButtonSelectors) {
            try {
                const button = await page.locator(selector).first();
                if (await button.isVisible()) {
                    await button.click();
                    console.log(`[+] Button diklik (selector: ${selector})\n`);
                    buttonClicked = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!buttonClicked) {
            throw new Error('Tidak dapat menemukan button "Try"');
        }

        // Tunggu navigasi
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        console.log('[+] Navigasi berhasil\n');

        // --- Step 5: Klik "Send Link" ---
        console.log(`[Thread #${threadId}] [5/8] 📤 KLIK "SEND LINK"\n`);
        
        const sendLinkButtonSelector = 'button[type="submit"]';
        await page.waitForSelector(sendLinkButtonSelector, { timeout: 30000 });
        await page.click(sendLinkButtonSelector);
        console.log('[+] Button "Send Link" diklik\n');
        
        await page.waitForTimeout(2000);

        // --- Step 6: Tunggu Email ---
        console.log(`[Thread #${threadId}] [6/8] 📬 MENUNGGU EMAIL VERIFIKASI\n`);
        const verificationLink = await waitForNetflixEmail(mailToken, 180000);

        if (!verificationLink) {
            throw new Error('Email verifikasi tidak diterima dalam 3 menit');
        }

        console.log(`\n[+] LINK VERIFIKASI: ${verificationLink}\n`);
        
        // Simpan ke file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultData = `[Thread #${threadId}] ${emailAddress}|${emailPassword}|${verificationLink}\n`;
        await fs.appendFile('result.txt', resultData, 'utf-8');
        console.log('[+] Data disimpan ke result.txt\n');

        // --- Step 7: Buka Link & Create Account ---
        console.log(`[Thread #${threadId}] [7/8] 🚀 MEMBUKA LINK VERIFIKASI\n`);
        await page.goto(verificationLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        console.log('[+] Link berhasil dibuka\n');

        // Cek apakah ada tombol "Create Your Account"
        try {
            const createAccountButton = await page.locator('button:has-text("Create Your Account"), a:has-text("Create Your Account")').first();
            if (await createAccountButton.isVisible({ timeout: 10000 })) {
                console.log('[*] Klik "Create Your Account"...');
                await createAccountButton.click();
                await page.waitForTimeout(3000);
                console.log('[+] Button diklik');
            }
        } catch (e) {
            console.log('[*] Button "Create Your Account" tidak ditemukan atau sudah redirect');
        }

        // Tunggu redirect atau halaman sukses
        await page.waitForTimeout(5000);
        
        const currentUrl = page.url();
        console.log(`[*] Current URL: ${currentUrl}`);

        if (currentUrl.includes('accountCreated=success') || currentUrl.includes('signup')) {
            console.log('[+] Akun berhasil dibuat!\n');
        }

        // Klik "Finish Sign-Up" atau "Next"
        console.log('[*] Mencari tombol "Finish Sign-Up" atau "Next"...');
        
        const finishButtonSelectors = [
            'button[data-uia="nmhp-card-cta+hero_card"]',
            'button:has-text("Finish")',
            'button:has-text("Next")',
            'button[type="submit"]'
        ];
        
        for (const selector of finishButtonSelectors) {
            try {
                const button = await page.locator(selector).first();
                if (await button.isVisible({ timeout: 5000 })) {
                    console.log(`[+] Button ditemukan: ${selector}`);
                    await button.click();
                    await page.waitForTimeout(3000);
                    console.log('[+] Button diklik\n');
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        // --- Step 8: Choose Plan (jika mode = 2, lanjut payment) ---
        console.log(`[Thread #${threadId}] [8/8] 📋 HALAMAN CHOOSE PLAN\n`);
        
        await page.waitForTimeout(3000);
        const finalUrl = page.url();
        console.log(`[*] Final URL: ${finalUrl}`);
        
        if (mode === 1) {
            console.log(`\n=== ✅ THREAD #${threadId} - PROSES SELESAI (AUTO REGISTER ONLY)! ===`);
            console.log(`Email: ${emailAddress}`);
            console.log(`Password Mail.TM: ${emailPassword}`);
            console.log(`Link: ${verificationLink}`);
            console.log(`Data tersimpan di: result.txt\n`);
            console.log('[*] Mode: Auto Register Only - Berhenti di sini');
            console.log('[*] Anda bisa lanjutkan manual untuk setup payment\n');
        } else if (mode === 2) {
            console.log(`\n[Thread #${threadId}] [*] === MODE 2: AUTO REGISTER + GOPAY PAYMENT ===\n`);
            
            // Step 8.1: Klik Next pertama - "Step 2 of 3" text page
            console.log(`[Thread #${threadId}] [8.1] ▶️ KLIK NEXT PERTAMA (Step 2 of 3)\n`);
            
            try {
                // Tunggu halaman "Step 2 of 3 - Choose your plan" text page
                await page.waitForTimeout(3000);
                
                console.log('[*] Halaman "Step 2 of 3 - Choose your plan" (text description)');
                console.log('[*] Klik Next button pertama...');
                
                // Cari dan klik Next button pertama
                const nextButtonSelectors = [
                    'button:has-text("Next")',
                    'button[type="submit"]:has-text("Next")',
                    'button[data-uia*="next"]',
                    'button.nf-btn-primary'
                ];
                
                let nextClicked = false;
                for (const selector of nextButtonSelectors) {
                    try {
                        const nextButton = await page.locator(selector).first();
                        if (await nextButton.isVisible({ timeout: 5000 })) {
                            await nextButton.click();
                            console.log(`[+] Next button pertama diklik (selector: ${selector})`);
                            nextClicked = true;
                            await page.waitForTimeout(3000);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                if (!nextClicked) {
                    console.log('[-] Next button pertama tidak ditemukan');
                    throw new Error('Tidak dapat menemukan Next button pertama');
                }
            } catch (e) {
                console.error('[-] Error klik Next pertama:', e.message);
                throw new Error('Tidak dapat klik Next button pertama');
            }
            
            // Step 8.2: Klik Next kedua - Plan selection cards page
            console.log(`[Thread #${threadId}] [8.2] ▶️ KLIK NEXT KEDUA (Skip Plan Selection)\n`);
            
            try {
                // Tunggu halaman plan cards (Mobile/Basic/Standard/Premium)
                await page.waitForTimeout(3000);
                
                console.log('[*] Halaman plan selection dengan cards');
                console.log('[*] Skip pilih plan, langsung klik Next button kedua...');
                
                // Cari dan klik Next button kedua
                const nextButtonSelectors = [
                    'button:has-text("Next")',
                    'button[type="submit"]:has-text("Next")',
                    'button[data-uia*="next"]',
                    'button.nf-btn-primary'
                ];
                
                let nextClicked = false;
                for (const selector of nextButtonSelectors) {
                    try {
                        const nextButton = await page.locator(selector).first();
                        if (await nextButton.isVisible({ timeout: 5000 })) {
                            await nextButton.click();
                            console.log(`[+] Next button kedua diklik (selector: ${selector})`);
                            nextClicked = true;
                            await page.waitForTimeout(3000);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                if (!nextClicked) {
                    console.log('[-] Next button kedua tidak ditemukan');
                    throw new Error('Tidak dapat menemukan Next button kedua');
                }
            } catch (e) {
                console.error('[-] Error klik Next kedua:', e.message);
                throw new Error('Tidak dapat klik Next button kedua');
            }
            
            // Step 8.3: Pilih Digital Wallet
            console.log(`[Thread #${threadId}] [8.3] 💳 PILIH DIGITAL WALLET\n`);
            
            try {
                // Tunggu halaman "Choose how to pay"
                await page.waitForTimeout(3000);
                
                console.log('[*] Current URL:', page.url());
                console.log('[*] Mencari payment options...');
                
                // Try multiple selectors for Digital Wallet / E-Wallet
                const walletSelectors = [
                    'li:has-text("Digital Wallet")',
                    'li:has-text("E-Wallet")',
                    'li:has-text("Wallet")',
                    'button:has-text("Digital Wallet")',
                    'button:has-text("E-Wallet")',
                    'div[role="button"]:has-text("Wallet")',
                    '[data-uia*="payment-option"]:has-text("Wallet")'
                ];
                
                let walletClicked = false;
                for (const selector of walletSelectors) {
                    try {
                        const element = await page.locator(selector).first();
                        if (await element.isVisible({ timeout: 3000 })) {
                            console.log(`[*] Digital Wallet ditemukan dengan selector: ${selector}`);
                            await element.click();
                            console.log('[+] Digital Wallet diklik');
                            walletClicked = true;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                if (!walletClicked) {
                    console.log('[-] Digital Wallet tidak ditemukan, coba screenshot...');
                    await page.screenshot({ path: `debug_wallet_${Date.now()}.png` });
                    throw new Error('Tidak dapat menemukan Digital Wallet option');
                }
                
                // Tunggu setelah klik (might redirect or expand)
                await page.waitForTimeout(5000);
                console.log('[*] URL after wallet click:', page.url());
                
                // Check if there's a "Next" or "Continue" button after selecting wallet
                try {
                    const continueButton = await page.locator('button:has-text("Next"), button:has-text("Continue"), button[type="submit"]').first();
                    if (await continueButton.isVisible({ timeout: 3000 })) {
                        console.log('[*] Found Continue/Next button after wallet selection');
                        await continueButton.click();
                        console.log('[+] Clicked Continue button');
                        await page.waitForTimeout(3000);
                    }
                } catch (e) {
                    console.log('[*] No Continue button found, proceeding...');
                }
                
            } catch (e) {
                console.error('[-] Gagal memilih Digital Wallet:', e.message);
                throw new Error('Tidak dapat memilih Digital Wallet');
            }
            
            // Step 8.4: Pilih Gopay
            console.log(`[Thread #${threadId}] [8.4] 🟢 PILIH GOPAY\n`);
            
            try {
                console.log('[*] Mencari opsi Gopay...');
                
                // Try multiple selectors for Gopay
                const gopaySelectors = [
                    'li:has-text("GoPay")',
                    'li:has-text("Gopay")',
                    'button:has-text("GoPay")',
                    'button:has-text("Gopay")',
                    'div[role="button"]:has-text("GoPay")',
                    'label:has-text("GoPay")',
                    'label:has-text("Gopay")',
                    '[data-uia*="payment"]:has-text("GoPay")',
                    'input[value*="gopay"] + label',
                    'input[value*="GOPAY"] + label'
                ];
                
                let gopayClicked = false;
                for (const selector of gopaySelectors) {
                    try {
                        const element = await page.locator(selector).first();
                        if (await element.isVisible({ timeout: 3000 })) {
                            console.log(`[*] Gopay ditemukan dengan selector: ${selector}`);
                            await element.click();
                            console.log('[+] Gopay diklik');
                            gopayClicked = true;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                if (!gopayClicked) {
                    console.log('[-] Gopay tidak ditemukan, coba screenshot...');
                    await page.screenshot({ path: `debug_gopay_${Date.now()}.png` });
                    
                    // List all visible text on page untuk debug
                    const pageText = await page.textContent('body');
                    console.log('[DEBUG] Page contains "gopay":', pageText.toLowerCase().includes('gopay'));
                    console.log('[DEBUG] Page contains "wallet":', pageText.toLowerCase().includes('wallet'));
                    
                    throw new Error('Tidak dapat menemukan Gopay option');
                }
                
                // Tunggu setelah klik
                await page.waitForTimeout(3000);
                console.log('[*] URL after gopay click:', page.url());
                
            } catch (e) {
                console.error('[-] Gagal memilih Gopay:', e.message);
                throw new Error('Tidak dapat memilih Gopay');
            }
            
            // Step 8.5: Registrasi Gopay + Set PIN
            console.log(`[Thread #${threadId}] [8.5] 📱 REGISTRASI GOPAY + SET PIN\n`);
            
            // Ambil nomor dari Hero SMS (with retry)
            // Service code untuk Gojek: 'ni'
            
            console.log('[!] ⚠️  MENGGUNAKAN SERVICE CODE: "ni"');
            
            const SERVICE_CODE = 'ni';  // Service code untuk Gojek
            
            const heroNumber = await getHeroSmsNumber('id', SERVICE_CODE, 3);
            if (!heroNumber) {
                throw new Error('Gagal mendapat nomor dari Hero SMS setelah 3x retry');
            }
            
            const { id: numberId, number: phoneNumber } = heroNumber;
            
            // Hero SMS mengembalikan nomor dalam format: 6289690300487
            // Kita perlu format plain untuk Gopay: 89690300487
            let gopayPhone = phoneNumber;
            
            // Remove country code jika ada
            if (gopayPhone.startsWith('62')) {
                gopayPhone = gopayPhone.substring(2); // 6289690300487 → 89690300487
            } else if (gopayPhone.startsWith('+62')) {
                gopayPhone = gopayPhone.substring(3); // +6289690300487 → 89690300487
            } else if (gopayPhone.startsWith('0')) {
                gopayPhone = gopayPhone.substring(1); // 089690300487 → 89690300487
            }
            // Jika sudah format 8xxx, tidak perlu diubah
            
            console.log(`[*] Nomor Hero SMS: ${phoneNumber}`);
            console.log(`[*] Format Gopay (plain): ${gopayPhone}`);
            
            // Step 8.5.1: Registrasi Gopay
            console.log('\n[*] === REGISTRASI GOPAY ===');
            const gopayRegister = await registerGopay(gopayPhone);
            if (!gopayRegister.success) {
                await cancelHeroSmsNumber(numberId);
                throw new Error('Gagal registrasi Gopay: ' + gopayRegister.error);
            }
            
            // Step 8.5.2: Tunggu OTP pertama (registrasi Gopay) dengan retry jika nomor tabrakan
            console.log('[*] Menunggu OTP #1 (Registrasi Gopay) dari Hero SMS...');
            
            let gopayOtp1 = await getHeroSmsCode(numberId, 120000); // 2 menit
            let currentNumberId = numberId;
            let currentGopayPhone = gopayPhone;
            let currentGopayRegister = gopayRegister;
            let gopayVerify = null;
            
            // Retry jika OTP tidak diterima (nomor tabrakan/sudah terdaftar)
            if (!gopayOtp1) {
                console.log('[-] OTP tidak diterima - kemungkinan nomor sudah terdaftar (tabrakan)');
                console.log('[*] Akan retry dengan nomor baru (max 3x)...');
                await cancelHeroSmsNumber(currentNumberId);
                
                const maxRetries = 3;
                let success = false;
                
                for (let retryCount = 1; retryCount <= maxRetries && !success; retryCount++) {
                    console.log(`\n[*] === RETRY #${retryCount}/${maxRetries} - AMBIL NOMOR BARU ===`);
                    
                    // Ambil nomor baru
                    const retryNumber = await getHeroSmsNumber('id', 'ni', 3);
                    if (!retryNumber) {
                        console.log(`[-] Retry #${retryCount} - Gagal dapat nomor`);
                        continue;
                    }
                    
                    currentNumberId = retryNumber.id;
                    let retryPhoneNumber = retryNumber.number;
                    
                    // Format nomor
                    if (retryPhoneNumber.startsWith('62')) {
                        currentGopayPhone = retryPhoneNumber.substring(2);
                    } else if (retryPhoneNumber.startsWith('+62')) {
                        currentGopayPhone = retryPhoneNumber.substring(3);
                    } else if (retryPhoneNumber.startsWith('0')) {
                        currentGopayPhone = retryPhoneNumber.substring(1);
                    } else {
                        currentGopayPhone = retryPhoneNumber;
                    }
                    
                    console.log(`[*] Nomor retry: ${retryPhoneNumber} → ${currentGopayPhone}`);
                    
                    // Registrasi
                    currentGopayRegister = await registerGopay(currentGopayPhone);
                    if (!currentGopayRegister.success) {
                        console.log(`[-] Retry #${retryCount} - Gagal registrasi`);
                        await cancelHeroSmsNumber(currentNumberId);
                        continue;
                    }
                    
                    // Tunggu OTP
                    console.log('[*] Menunggu OTP dari nomor baru...');
                    gopayOtp1 = await getHeroSmsCode(currentNumberId, 120000);
                    
                    if (!gopayOtp1) {
                        console.log(`[-] Retry #${retryCount} - OTP tidak diterima`);
                        await cancelHeroSmsNumber(currentNumberId);
                        continue;
                    }
                    
                    console.log(`[+] ✅ Retry #${retryCount} - OTP diterima: ${gopayOtp1}`);
                    
                    // Verifikasi
                    gopayVerify = await verifyGopayOtp(currentGopayRegister, gopayOtp1);
                    if (!gopayVerify.success) {
                        console.log(`[-] Retry #${retryCount} - Gagal verifikasi`);
                        await cancelHeroSmsNumber(currentNumberId);
                        continue;
                    }
                    
                    console.log('[+] ✅ Retry berhasil!');
                    success = true;
                    
                    // Update variabel utama
                    numberId = currentNumberId;
                    gopayPhone = currentGopayPhone;
                    gopayRegister = currentGopayRegister;
                }
                
                if (!success) {
                    throw new Error('Tidak menerima OTP setelah ' + maxRetries + ' retry dengan nomor berbeda');
                }
            } else {
                // OTP diterima dari nomor pertama
                console.log(`[+] OTP #1 diterima: ${gopayOtp1}`);
                
                // Step 8.5.3: Verifikasi OTP Gopay
                gopayVerify = await verifyGopayOtp(gopayRegister, gopayOtp1);
                if (!gopayVerify.success) {
                    await cancelHeroSmsNumber(numberId);
                    throw new Error('Gagal verifikasi Gopay: ' + gopayVerify.error);
                }
            }
            
            console.log('[+] ✅ Gopay berhasil diverifikasi!');
            
            // Step 8.5.4: Set PIN Gopay
            console.log('\n[*] === SET PIN GOPAY ===');
            const defaultPin = '090118';
            const gopayPin = await setGopayPin(gopayVerify.token, gopayVerify.uuid, defaultPin);
            
            if (!gopayPin.success) {
                console.log('[-] Gagal set PIN:', gopayPin.error);
                // Continue anyway, PIN might not be mandatory for payment
            } else if (gopayPin.needOtp) {
                // Step 8.5.5: Tunggu OTP kedua (set PIN)
                console.log('[*] Menunggu OTP #2 (Set PIN Gopay) dari Hero SMS...');
                const gopayOtp2 = await getHeroSmsCode(numberId, 120000); // 2 menit
                
                if (!gopayOtp2) {
                    console.log('[-] Tidak menerima OTP #2, lanjut tanpa PIN');
                } else {
                    console.log(`[+] OTP #2 diterima: ${gopayOtp2}`);
                    console.log('[+] ✅ PIN Gopay berhasil di-set!');
                }
            }
            
            console.log(`[+] ✅ Gopay siap digunakan!`);
            console.log(`[*] Token: ${gopayVerify.token.substring(0, 30)}...`);
            console.log(`[*] UUID: ${gopayVerify.uuid}\n`);
            
            // Step 8.6: Input nomor ke Netflix
            console.log(`[Thread #${threadId}] [8.6] ✍️ INPUT NOMOR KE NETFLIX\n`);
            
            // Format nomor untuk Netflix (format Indonesia: 08xxx)
            // gopayPhone sekarang plain (89690300487), Netflix butuh 089690300487
            let netflixPhone = gopayPhone;
            if (!netflixPhone.startsWith('0')) {
                netflixPhone = '0' + netflixPhone; // 89690300487 → 089690300487
            }
            console.log(`[*] Nomor untuk Netflix: ${netflixPhone}`);
            
            try {
                // Cari input field untuk nomor HP
                const phoneInputSelector = 'input[name="phoneNumber"], input[data-uia="field-phoneNumber"], input[type="tel"], input[placeholder*="phone"], input[placeholder*="number"]';
                await page.waitForSelector(phoneInputSelector, { timeout: 15000 });
                
                await page.fill(phoneInputSelector, netflixPhone);
                console.log(`[+] Nomor ${netflixPhone} berhasil diisi`);
                await page.waitForTimeout(2000);
            } catch (e) {
                console.error('[-] Gagal input nomor ke Netflix:', e.message);
                throw new Error('Tidak dapat input nomor ke Netflix');
            }
            
            // Step 8.7: Submit Payment + OTP Netflix
            console.log(`[Thread #${threadId}] [8.7] 🚀 SUBMIT PAYMENT + OTP NETFLIX\n`);
            
            // Step 8.7: Submit / Start Membership
            console.log(`[Thread #${threadId}] [8.7] 🚀 SUBMIT PAYMENT\n`);
            
            try {
                const submitButton = await page.locator('button:has-text("Start Membership"), button:has-text("Submit"), button[type="submit"]').first();
                if (await submitButton.isVisible({ timeout: 10000 })) {
                    await submitButton.click();
                    console.log('[+] Button Submit diklik');
                    await page.waitForTimeout(5000);
                    
                    // Tunggu OTP dari Hero SMS
                    console.log('[*] Menunggu OTP Netflix dari Hero SMS...');
                    const netflixOtp = await getHeroSmsCode(numberId, 180000); // 3 menit
                    
                    if (!netflixOtp) {
                        await cancelHeroSmsNumber(numberId);
                        throw new Error('Tidak menerima OTP Netflix');
                    }
                    
                    console.log(`[+] OTP Netflix diterima: ${netflixOtp}`);
                    
                    // Input OTP ke Netflix
                    try {
                        const otpInputSelector = 'input[name="otp"], input[data-uia*="otp"], input[type="text"]';
                        await page.waitForSelector(otpInputSelector, { timeout: 15000 });
                        await page.fill(otpInputSelector, netflixOtp);
                        console.log('[+] OTP berhasil diisi');
                        await page.waitForTimeout(2000);
                        
                        // Klik verify atau submit
                        const verifyButton = await page.locator('button:has-text("Verify"), button:has-text("Submit"), button[type="submit"]').first();
                        if (await verifyButton.isVisible({ timeout: 5000 })) {
                            await verifyButton.click();
                            console.log('[+] Button Verify diklik');
                        }
                    } catch (otpError) {
                        console.error('[-] Error input OTP:', otpError.message);
                        throw new Error('Gagal input OTP Netflix');
                    }
                    
                    // Tunggu redirect ke sukses atau browse page
                    console.log('[*] Menunggu redirect...');
                    await page.waitForTimeout(10000);
                    
                    const currentUrl = page.url();
                    console.log(`[*] Current URL: ${currentUrl}`);
                    
                    // Cek apakah berhasil
                    if (currentUrl.includes('browse') || currentUrl.includes('success')) {
                        console.log('[+] ✅ PAYMENT BERHASIL!');
                    } else {
                        console.log('[!] Payment mungkin perlu verifikasi manual di Gopay app');
                    }
                }
            } catch (e) {
                console.error('[-] Error saat submit:', e.message);
            }
            
            // Simpan data lengkap
            const resultData = `\n[GOPAY] ${netflixPhone} | Hero SMS ID: ${numberId}`;
            await fs.appendFile('result.txt', resultData, 'utf-8');
            
            console.log(`\n=== ✅ THREAD #${threadId} - PROSES SELESAI (GOPAY PAYMENT)! ===`);
            console.log(`Email Netflix: ${emailAddress}`);
            console.log(`Password Mail.TM: ${emailPassword}`);
            console.log(`Nomor Hero SMS: ${netflixPhone}`);
            console.log(`Hero SMS Activation ID: ${numberId}`);
            console.log(`Data tersimpan di: result.txt\n`);
        }

    } catch (error) {
        console.error(`\n=== ❌ THREAD #${threadId} - ERROR ===`);
        console.error(`Message: ${error.message}`);
        console.error(`Stack: ${error.stack}\n`);
        
        const timestamp = Date.now();
        const screenshotPath = `error_screenshot_thread${threadId}_${timestamp}.png`;
        const htmlPath = `error_page_thread${threadId}_${timestamp}.html`;
        
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            const html = await page.content();
            await fs.writeFile(htmlPath, html, 'utf-8');
            
            console.log(`Screenshot: ${screenshotPath}`);
            console.log(`HTML: ${htmlPath}`);
        } catch (saveError) {
            console.error('Gagal menyimpan error file:', saveError.message);
        }
    } finally {
        console.log(`\n[Thread #${threadId}] Menutup browser dalam 10 detik...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        await browser.close();
    }
}

// --- Main Menu ---
async function main() {
    console.clear();
    console.log('╔═══════════════════════════════════════╗');
    console.log('║     NETFLIX AUTO REGISTER BOT        ║');
    console.log('╚═══════════════════════════════════════╝\n');
    console.log('Pilih mode:');
    console.log('1. Auto Register Only');
    console.log('2. Auto Register + Paid Gopay (Coming Soon)');
    console.log('0. Exit\n');
    
    const choice = await askQuestion('Pilihan Anda (1/2/0): ');
    
    if (choice === '0') {
        console.log('\n[*] Terima kasih! Bot ditutup.');
        rl.close();
        process.exit(0);
    } else if (choice === '1' || choice === '2') {
        const mode = parseInt(choice);
        let selectedPlan = 'Mobile'; // Default
        
        if (mode === 2) {
            console.log('\n[!] Fitur Auto Register + Gopay Payment siap digunakan!');
            console.log('[*] Bot akan otomatis registrasi Gopay menggunakan Hero SMS API\n');
            
            // Pilih paket Netflix
            console.log('Pilih paket Netflix:');
            console.log('1. Mobile (480p) - IDR 54,000/bulan');
            console.log('2. Basic (720p) - IDR 65,000/bulan');
            console.log('3. Standard (1080p) - IDR 120,000/bulan');
            console.log('4. Premium (4K+HDR) - IDR 186,000/bulan\n');
            
            const planChoice = await askQuestion('Pilih paket (1/2/3/4) [default: 1]: ');
            const planMapping = {
                '1': 'Mobile',
                '2': 'Basic',
                '3': 'Standard',
                '4': 'Premium'
            };
            selectedPlan = planMapping[planChoice] || 'Mobile';
            console.log(`[*] Paket terpilih: ${selectedPlan}\n`);
            
            const confirm = await askQuestion('Lanjutkan? (y/n): ');
            if (confirm.toLowerCase() !== 'y') {
                rl.close();
                console.log('[*] Dibatalkan.');
                process.exit(0);
            }
        }
        
        // Tanya jumlah thread
        console.log('\n');
        const threadInput = await askQuestion('Berapa thread yang ingin dijalankan? (1-10): ');
        const threadCount = parseInt(threadInput);
        
        if (isNaN(threadCount) || threadCount < 1 || threadCount > 10) {
            console.log('\n[!] Jumlah thread tidak valid! (harus 1-10)');
            rl.close();
            process.exit(1);
        }
        
        rl.close();
        
        console.log(`\n[*] Menjalankan ${threadCount} thread...\n`);
        
        // Jalankan bot dengan multi-threading
        const promises = [];
        for (let i = 1; i <= threadCount; i++) {
            // Delay antar thread agar tidak bentrok
            await new Promise(resolve => setTimeout(resolve, 2000 * (i - 1)));
            
            // Pass selectedPlan hanya jika mode 2
            if (mode === 2) {
                promises.push(runBot(mode, i, selectedPlan));
            } else {
                promises.push(runBot(mode, i));
            }
        }
        
        // Tunggu semua thread selesai
        await Promise.allSettled(promises);
        
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║   SEMUA THREAD SELESAI!               ║');
        console.log('╚═══════════════════════════════════════╝\n');
        console.log('[*] Check result.txt untuk melihat hasilnya\n');
        
    } else {
        console.log('\n[!] Pilihan tidak valid!');
        rl.close();
        process.exit(1);
    }
}

// Jalankan main menu
main().catch(error => {
    console.error('Fatal error:', error);
    rl.close();
    process.exit(1);
});
