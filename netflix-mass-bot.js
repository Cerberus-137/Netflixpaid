// netflix-mass-bot.js
// Bot Netflix: Generate Email → Simpan → Mass Process dengan Thread
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs/promises');
const readline = require('readline');

// ===== KONFIGURASI =====
const COOKIES_30_DAYS = [
    {"domain":"sc-static.net","name":"X-AB","value":"76b8bd3944054e4b924ee9b3f1429c37","path":"/scevent.min.js","secure":true,"httpOnly":false,"sameSite":"None"},
    {"domain":"www.google.com","name":"_GRECAPTCHA","value":"09AKhCRwiA4M5L1c-Wzxo4wuj-zlP2Y_5-odN6OPisYi9mgo5dz-yIbDUmL-nyWS8DJPf-7S44x_Zti3dsaYPpO90","path":"/recaptcha","secure":true,"httpOnly":true,"sameSite":"None"},
    {"domain":".wikipedia.org","name":"WMF-Uniq","value":"Pqc7nRfpygEF_4U5Xv0x_AOYAAEBAFvdkrbf0VBLnmMwF_OhEIl-8C_qOaOUcGOo","path":"/","secure":true,"httpOnly":true,"sameSite":"None"},
    {"domain":".netflix.com","name":"nfvdid","value":"BQFmAAEBEJeAW8T0eoSJwVtxiE7P88lAImNJY-5juXjuVEJ0o4mgDy14avSmwp8aadx0GhYO6U4_pS2o3Xsx6WuP7SPEyN3LngvirNNifhtCkcx2cJhIvQ%3D%3D","path":"/","secure":false,"httpOnly":false,"sameSite":"Lax"},
    {"domain":".netflix.com","name":"SecureNetflixId","value":"v%3D3%26mac%3DAQEAEQABABRq1Kf0X2wjsDrvvM8wb0ejoAxYvmKso1A.%26dt%3D1783739822623","path":"/","secure":true,"httpOnly":true,"sameSite":"Strict"},
    {"domain":".netflix.com","name":"NetflixId","value":"v%3D3%26ct%3DBgjHlOvcAxLbAc4ts4mUKDJ8g9BLj_fSy4H1Bq3nVzOx2623hEo_uvL1ajCpun_VKLwrqDps7EeMZQl1mpFdb73wBndLWJ5xb6uUibonCE6kfOmX9FD7WyJubJ9qeV01M4sll078Tw16YzleoZvHITR4rUE1N73A3HYdZ6zELZE5TvnpUG5sWHVybhsD5qf0Nppg1KHyGjdbsopzHC3xBTDRkzlIw3lONJ1y4kkGoUu6ZMwCTqN4BnO-1e3CGI53dzoilIHM8xYyOxXmgUH9ZZ3e2Au0iqvu3FLVV6xtt1ct9kteahgGIg4KDNNksU_yoPAXOsIrFQ..","path":"/","secure":true,"httpOnly":true,"sameSite":"Lax"},
    {"domain":".netflix.com","name":"netflix-sans-normal-3-loaded","value":"true","path":"/","secure":false,"httpOnly":false,"sameSite":"Lax"},
    {"domain":".netflix.com","name":"netflix-sans-bold-3-loaded","value":"true","path":"/","secure":false,"httpOnly":false,"sameSite":"Lax"}
];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// === MAIL.TM FUNCTIONS ===
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

// Generate random Gmail (10 huruf)
function generateRandomGmail() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let randomStr = '';
    for (let i = 0; i < 10; i++) {
        randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${randomStr}@gmail.com`;
}

// Generate random Mail.TM email
function generateRandomMailTm() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let randomStr = 'admin';
    for (let i = 0; i < 3; i++) {
        randomStr += Math.floor(Math.random() * 10); // 3 digit angka
    }
    return randomStr; // Return username only, domain akan ditambahkan di getMailTmAccount
}

// Step 1: Generate emails dan simpan ke file
async function generateEmails(count, useMailTm = false) {
    if (useMailTm) {
        console.log(`\n[*] Generating ${count} Mail.TM accounts (auto-verify)...`);
        console.log('[!] Note: Mail.TM akan auto-verify email Netflix\n');
    } else {
        console.log(`\n[*] Generating ${count} random Gmail addresses (manual)...`);
        console.log('[!] Note: Anda harus verifikasi email sendiri\n');
    }
    
    const emails = [];
    
    for (let i = 0; i < count; i++) {
        let email;
        if (useMailTm) {
            // Generate Mail.TM username saja (domain akan ditambahkan nanti)
            email = generateRandomMailTm();
        } else {
            email = generateRandomGmail();
        }
        emails.push(email);
        console.log(`[${i + 1}] ${email}${useMailTm ? ' (Mail.TM - auto verify)' : ' (Gmail - manual verify)'}`);
    }
    
    // Simpan ke email.txt dengan marker
    const marker = useMailTm ? 'MAILTM' : 'GMAIL';
    const content = emails.map(e => `${marker}|${e}`).join('\n');
    await fs.writeFile('email.txt', content, 'utf-8');
    console.log(`\n[+] ${count} emails saved to email.txt\n`);
    
    return emails;
}

// Step 2: Process single account
async function processSingleAccount(emailData, useMailTm = false) {
    let email = emailData;
    let mailToken = null;
    let mailPassword = 'Admin123@';
    
    // Parse email data (format: MAILTM|admin123 atau GMAIL|email@gmail.com)
    if (typeof emailData === 'string' && emailData.includes('|')) {
        const parts = emailData.split('|');
        useMailTm = parts[0] === 'MAILTM';
        email = parts[1];
    }
    
    console.log(`\n[*] Processing single account: ${email}`);
    console.log(`[*] Email type: ${useMailTm ? 'Mail.TM (auto-verify)' : 'Manual email'}\n`);
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    await context.addCookies(COOKIES_30_DAYS);
    const page = await context.newPage();
    
    try {
        // Jika Mail.TM, buat akun dulu
        if (useMailTm) {
            console.log('[*] Creating Mail.TM account...');
            const mailAccount = await getMailTmAccount();
            if (!mailAccount) {
                throw new Error('Gagal membuat akun Mail.TM');
            }
            email = mailAccount.address;
            mailPassword = mailAccount.password;
            mailToken = mailAccount.token;
            console.log(`[+] Mail.TM account created: ${email}\n`);
        }
        
        // Buka Netflix
        await page.goto('https://www.netflix.com/id-en/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        
        // Input email dengan retry sampai berhasil (tanpa batas)
        let emailSuccess = false;
        let attempt = 0;
        while (!emailSuccess) {
            attempt++;
            console.log(`[*] Input email (attempt ${attempt})...`);
            
            await page.fill('input[data-uia="field-email"]', email);
            await page.click('button[type="submit"]');
            await page.waitForTimeout(3000);
            
            const currentUrl = page.url();
            console.log(`[*] Current URL: ${currentUrl}`);
            
            // Cek apakah ada tombol "Send Link" di page
            try {
                const sendLinkButton = page.locator('button[data-uia="email-register-send-link-send-link-button"]');
                const hasSendLink = await sendLinkButton.isVisible({ timeout: 2000 });
                
                if (hasSendLink) {
                    console.log(`[+] ✅ Berhasil! Ada tombol "Send Link"`);
                    await sendLinkButton.click();
                    console.log(`[+] Tombol "Send Link" diklik`);
                    emailSuccess = true;
                } else {
                    console.log(`[-] Tidak ada tombol "Send Link", back + retry...`);
                    await page.goBack();
                    await page.waitForTimeout(2000);
                }
            } catch (e) {
                console.log(`[-] Tidak ada tombol "Send Link", back + retry...`);
                await page.goBack();
                await page.waitForTimeout(2000);
            }
        }
        
        // Tunggu setelah klik Send Link
        await page.waitForTimeout(3000);
        console.log('[+] Email submission selesai!\n');
        
        // Jika Mail.TM, auto-verify
        if (useMailTm && mailToken) {
            console.log('[*] === AUTO-VERIFY DENGAN MAIL.TM ===\n');
            console.log('[*] Menunggu email verifikasi dari Netflix...');
            
            const verificationLink = await waitForNetflixEmail(mailToken, 180000);
            
            if (!verificationLink) {
                throw new Error('Email verifikasi tidak diterima dalam 3 menit');
            }
            
            console.log(`\n[+] LINK VERIFIKASI: ${verificationLink}\n`);
            
            // Buka link verifikasi
            console.log('[*] Membuka link verifikasi...');
            await page.goto(verificationLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(5000);
            console.log('[+] Link berhasil dibuka\n');
            
            // Klik "Create Your Account" jika ada
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
            
            // Simpan result
            const resultData = `${email}|${mailPassword}|${verificationLink}\n`;
            await fs.appendFile('netflix-mass-result.txt', resultData);
            
            console.log('\n[+] ✅ SELESAI - AUTO-VERIFY BERHASIL!');
            console.log(`[+] Email: ${email}`);
            console.log(`[+] Password: ${mailPassword}`);
            console.log(`[+] Link: ${verificationLink}`);
            console.log('[+] Data tersimpan di: netflix-mass-result.txt\n');
            
        } else {
            // Manual verify
            console.log('\n[+] ✅ SELESAI - VERIFIKASI MANUAL!');
            console.log(`[+] Email: ${email}`);
            console.log('[!] Silakan check email Anda dan klik link verifikasi');
            console.log('[!] Browser akan tetap terbuka...\n');
        }
        
        console.log('[*] Done! Browser akan tetap terbuka.');
        console.log('[*] Silakan lanjutkan manual atau close browser...');
        
        // Tunggu user tutup manual
        await new Promise(() => {});
        
    } catch (error) {
        console.error(`[-] Error: ${error.message}`);
    }
}


// Step 3: Process mass accounts (multi-thread)
async function processMassAccounts(emailsData, numThreads) {
    console.log(`\n[*] Processing ${emailsData.length} accounts with ${numThreads} threads\n`);
    
    const processAccount = async (emailData, threadId) => {
        let email = emailData;
        let useMailTm = false;
        let mailToken = null;
        let mailPassword = 'Admin123@';
        
        // Parse email data (format: MAILTM|admin123 atau GMAIL|email@gmail.com)
        if (typeof emailData === 'string' && emailData.includes('|')) {
            const parts = emailData.split('|');
            useMailTm = parts[0] === 'MAILTM';
            email = parts[1];
        }
        
        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        await context.addCookies(COOKIES_30_DAYS);
        const page = await context.newPage();
        
        try {
            console.log(`[Thread #${threadId}] Processing: ${email} (${useMailTm ? 'Mail.TM' : 'Manual'})`);
            
            // Jika Mail.TM, buat akun dulu
            if (useMailTm) {
                console.log(`[Thread #${threadId}] Creating Mail.TM account...`);
                const mailAccount = await getMailTmAccount();
                if (!mailAccount) {
                    throw new Error('Gagal membuat akun Mail.TM');
                }
                email = mailAccount.address;
                mailPassword = mailAccount.password;
                mailToken = mailAccount.token;
                console.log(`[Thread #${threadId}] Mail.TM: ${email}`);
            }
            
            // Buka Netflix
            await page.goto('https://www.netflix.com/id-en/', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            
            // Input email dengan retry sampai berhasil (tanpa batas)
            let emailSuccess = false;
            let attempt = 0;
            while (!emailSuccess) {
                attempt++;
                console.log(`[Thread #${threadId}] Input email (attempt ${attempt}): ${email}`);
                
                await page.fill('input[data-uia="field-email"]', email);
                await page.click('button[type="submit"]');
                await page.waitForTimeout(3000);
                
                const currentUrl = page.url();
                console.log(`[Thread #${threadId}] Current URL: ${currentUrl}`);
                
                // Cek apakah ada tombol "Send Link" di page
                try {
                    const sendLinkButton = page.locator('button[data-uia="email-register-send-link-send-link-button"]');
                    const hasSendLink = await sendLinkButton.isVisible({ timeout: 2000 });
                    
                    if (hasSendLink) {
                        console.log(`[Thread #${threadId}] ✅ Berhasil! Ada tombol "Send Link"`);
                        await sendLinkButton.click();
                        console.log(`[Thread #${threadId}] Tombol "Send Link" diklik`);
                        emailSuccess = true;
                    } else {
                        console.log(`[Thread #${threadId}] Tidak ada tombol "Send Link", back + retry...`);
                        await page.goBack();
                        await page.waitForTimeout(2000);
                    }
                } catch (e) {
                    console.log(`[Thread #${threadId}] Tidak ada tombol "Send Link", back + retry...`);
                    await page.goBack();
                    await page.waitForTimeout(2000);
                }
            }
            
            // Tunggu setelah klik Send Link
            await page.waitForTimeout(3000);
            
            let verificationLink = null;
            
            // Jika Mail.TM, auto-verify
            if (useMailTm && mailToken) {
                console.log(`[Thread #${threadId}] Menunggu email verifikasi...`);
                
                verificationLink = await waitForNetflixEmail(mailToken, 180000);
                
                if (!verificationLink) {
                    throw new Error('Email verifikasi tidak diterima');
                }
                
                console.log(`[Thread #${threadId}] Link diterima: ${verificationLink.substring(0, 50)}...`);
                
                // Buka link verifikasi
                await page.goto(verificationLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(5000);
                
                // Klik "Create Your Account" jika ada
                try {
                    const createAccountButton = await page.locator('button:has-text("Create Your Account"), a:has-text("Create Your Account")').first();
                    if (await createAccountButton.isVisible({ timeout: 10000 })) {
                        await createAccountButton.click();
                        await page.waitForTimeout(3000);
                    }
                } catch (e) {
                    // Ignore
                }
            }
            
            const finalUrl = page.url();
            console.log(`[Thread #${threadId}] ✅ ${email} → Done`);
            
            // Simpan result
            const resultLine = useMailTm ? 
                `${email}|${mailPassword}|${verificationLink || 'N/A'}\n` :
                `${email}|manual-verify|N/A\n`;
            await fs.appendFile('netflix-mass-result.txt', resultLine);
            
            // Tunggu 5 detik sebelum close
            await page.waitForTimeout(5000);
            
            return { success: true, email, url: finalUrl };
            
        } catch (error) {
            console.error(`[Thread #${threadId}] ❌ ${email} → Error: ${error.message}`);
            return { success: false, email, error: error.message };
        } finally {
            await browser.close();
        }
    };
    
    // Process in batches (threads)
    const results = [];
    for (let i = 0; i < emailsData.length; i += numThreads) {
        const batch = emailsData.slice(i, i + numThreads);
        const batchPromises = batch.map((emailData, index) => 
            processAccount(emailData, i + index + 1)
        );
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
    }
    
    // Summary
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`\n[*] Summary: ${successCount}/${emailsData.length} success`);
    console.log(`[*] Results saved to: netflix-mass-result.txt\n`);
}

// Main menu
async function main() {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║        NETFLIX MASS BOT dengan COOKIES (30d)          ║
║            Generate → Select → Process                ║
╚═══════════════════════════════════════════════════════╝
    `);
    
    // Menu
    console.log('1. Generate Emails (Mail.TM - Auto Verify)');
    console.log('2. Generate Emails (Gmail/Manual - Manual Verify)');
    console.log('3. Select Account (Single)');
    console.log('4. Mass Account (Multi-Thread)');
    console.log('5. Exit\n');
    
    const choice = await ask('Pilih menu (1/2/3/4/5): ');
    
    if (choice === '1') {
        // Generate emails Mail.TM
        const count = await ask('Jumlah email yang akan digenerate: ');
        await generateEmails(parseInt(count), true); // useMailTm = true
        rl.close();
        
    } else if (choice === '2') {
        // Generate emails Gmail
        const count = await ask('Jumlah email yang akan digenerate: ');
        await generateEmails(parseInt(count), false); // useMailTm = false
        rl.close();
        
    } else if (choice === '3') {
        // Single account
        console.log('\n[?] Mau pakai Mail.TM (auto-verify) atau email manual?');
        const emailChoice = await ask('1 = Mail.TM (auto), 2 = Manual: ');
        
        let emailData;
        if (emailChoice === '1') {
            console.log('[*] Akan membuat Mail.TM account baru...');
            emailData = 'MAILTM|auto'; // Auto-generate
        } else {
            const email = await ask('Masukkan email: ');
            emailData = `GMAIL|${email}`;
        }
        
        rl.close();
        await processSingleAccount(emailData);
        
    } else if (choice === '4') {
        // Mass accounts
        console.log('\n[*] Reading emails from email.txt...');
        try {
            const content = await fs.readFile('email.txt', 'utf-8');
            const emails = content.trim().split('\n').filter(e => e.trim());
            
            if (emails.length === 0) {
                console.log('[-] email.txt kosong! Generate dulu dengan menu 1 atau 2.');
                rl.close();
                return;
            }
            
            // Detect type dari first line
            const firstEmail = emails[0];
            const isMailTm = firstEmail.startsWith('MAILTM|');
            
            console.log(`[+] Found ${emails.length} emails`);
            console.log(`[+] Type: ${isMailTm ? 'Mail.TM (auto-verify)' : 'Manual email'}\n`);
            
            const threads = await ask('Jumlah thread (default 3): ');
            const numThreads = threads ? parseInt(threads) : 3;
            
            rl.close();
            await processMassAccounts(emails, numThreads);
            
        } catch (error) {
            console.log('[-] File email.txt tidak ditemukan!');
            console.log('[-] Generate dulu dengan menu 1 atau 2.');
            rl.close();
        }
        
    } else {
        console.log('Bye!');
        rl.close();
    }
}

main().catch(console.error);
