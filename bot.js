// bot.js
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs/promises');
const readline = require('readline');

// --- Interface untuk input user ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
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

async function runBot(mode, threadId = 1) {
    console.log(`\n=== NETFLIX BOT #${threadId} - START ===\n`);
    console.log(`Mode: ${mode === 1 ? 'Auto Register Only' : 'Auto Register + Paid Gopay'}\n`);
    
    const browser = await chromium.launch({
        headless: true, // Browser tidak muncul
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ],
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
        } else {
            console.log(`[Thread #${threadId}] [*] Mode: Auto Register + Paid Gopay`);
            console.log('[!] FITUR PAYMENT GOPAY BELUM DIIMPLEMENTASI');
            console.log('[!] Silakan lanjutkan manual untuk setup payment Gopay\n');
            
            // TODO: Implementasi payment Gopay di sini
            // 1. Pilih plan
            // 2. Klik Next
            // 3. Pilih metode payment Gopay
            // 4. dst...
        }

    } catch (error) {
        // Silent error - tidak tampilkan error message
        const timestamp = Date.now();
        const screenshotPath = `error_screenshot_thread${threadId}_${timestamp}.png`;
        const htmlPath = `error_page_thread${threadId}_${timestamp}.html`;
        
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            const html = await page.content();
            await fs.writeFile(htmlPath, html, 'utf-8');
        } catch (saveError) {
            // Ignore save error
        }
    } finally {
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
        
        if (mode === 2) {
            console.log('\n[!] Fitur payment Gopay masih dalam pengembangan!');
            console.log('[*] Bot akan berjalan dalam mode Register Only\n');
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
            promises.push(runBot(mode, i));
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
