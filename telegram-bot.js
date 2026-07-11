// telegram-bot.js
// Bot Telegram untuk Netflix Email Generator
// 1 Trial per Telegram Account

const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');

// ===== KONFIGURASI =====
const BOT_TOKEN = '8557661156:AAG49v40J15F140lI4CAba8Ypx0E_uy8_M8';
const ADMIN_USER_ID = null; // Set ke Telegram User ID Anda untuk admin access (optional)

// Database sederhana: menyimpan user yang sudah pake trial
const DB_FILE = './telegram_users.json';

// Cookies 30 days
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

// ===== DATABASE FUNCTIONS =====
function loadDatabase() {
    try {
        if (fsSync.existsSync(DB_FILE)) {
            const data = fsSync.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading database:', error.message);
    }
    return { users: {} };
}

function saveDatabase(db) {
    try {
        fsSync.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error saving database:', error.message);
    }
}

function hasUsedTrial(userId) {
    const db = loadDatabase();
    return db.users[userId] !== undefined;
}

function markTrialUsed(userId, username, email) {
    const db = loadDatabase();
    db.users[userId] = {
        username: username,
        email: email,
        timestamp: new Date().toISOString(),
        used: true
    };
    saveDatabase(db);
}

function isAdmin(userId) {
    return ADMIN_USER_ID && userId === ADMIN_USER_ID;
}

function resetUser(userId) {
    const db = loadDatabase();
    if (db.users[userId]) {
        delete db.users[userId];
        saveDatabase(db);
        return true;
    }
    return false;
}

// ===== MAIL.TM FUNCTIONS =====
async function getMailTmAccount() {
    try {
        console.log('[*] Mengambil domain mail.tm...');
        const domainRes = await axios.get('https://api.mail.tm/domains');
        const domains = domainRes.data['hydra:member'];
        
        let domain = domains.find(d => d.domain === 'web-library.net')?.domain || domains[0].domain;
        
        const randomNumber = Math.floor(Math.random() * 900) + 100;
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
        return null;
    }
}

async function waitForNetflixEmail(token, timeout = 180000) {
    console.log("[*] Menunggu email dari Netflix...");
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const res = await axios.get('https://api.mail.tm/messages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const messages = res.data['hydra:member'];
            
            if (messages.length > 0) {
                const netflixMail = messages.find(m =>
                    m.from.address.toLowerCase().includes('netflix') ||
                    m.from.address.toLowerCase().includes('info@account.netflix.com') ||
                    m.subject.toLowerCase().includes('almost there') ||
                    m.subject.toLowerCase().includes('create your account')
                );
                
                if (netflixMail) {
                    console.log(`[+] Email Netflix ditemukan!`);
                    
                    const msgDetail = await axios.get(`https://api.mail.tm/messages/${netflixMail.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    const content = msgDetail.data.html?.[0] || msgDetail.data.text || '';
                    
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
                            console.log(`[+] Link verifikasi ditemukan`);
                            return link;
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[-] Error checking email: ${e.message}`);
        }
        
        await new Promise(r => setTimeout(r, 10000));
    }
    
    console.log('[-] Timeout: Email tidak diterima');
    return null;
}

// ===== NETFLIX AUTOMATION =====
async function generateNetflixAccount() {
    console.log('[*] Starting Netflix account generation...');
    
    // Buat Mail.TM account
    const mailAccount = await getMailTmAccount();
    if (!mailAccount) {
        throw new Error('Gagal membuat akun Mail.TM');
    }
    
    const email = mailAccount.address;
    const password = mailAccount.password;
    const mailToken = mailAccount.token;
    
    console.log(`[+] Email created: ${email}`);
    
    // Launch browser (headless untuk VPS)
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    await context.addCookies(COOKIES_30_DAYS);
    const page = await context.newPage();
    
    try {
        // Buka Netflix
        await page.goto('https://www.netflix.com/id-en/', { 
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await page.waitForTimeout(2000);
        
        // Input email dengan retry
        let emailSuccess = false;
        let attempt = 0;
        const maxAttempts = 10;
        
        while (!emailSuccess && attempt < maxAttempts) {
            attempt++;
            console.log(`[*] Input email (attempt ${attempt}/${maxAttempts})`);
            
            await page.fill('input[data-uia="field-email"]', email);
            await page.click('button[type="submit"]');
            await page.waitForTimeout(3000);
            
            try {
                const sendLinkButton = page.locator('button[data-uia="email-register-send-link-send-link-button"]');
                const hasSendLink = await sendLinkButton.isVisible({ timeout: 2000 });
                
                if (hasSendLink) {
                    console.log(`[+] Berhasil! Klik "Send Link"`);
                    await sendLinkButton.click();
                    emailSuccess = true;
                } else {
                    await page.goBack();
                    await page.waitForTimeout(2000);
                }
            } catch (e) {
                await page.goBack();
                await page.waitForTimeout(2000);
            }
        }
        
        if (!emailSuccess) {
            throw new Error('Gagal input email setelah ' + maxAttempts + ' percobaan');
        }
        
        await page.waitForTimeout(3000);
        
        // Tunggu email verifikasi
        console.log('[*] Menunggu email verifikasi...');
        const verificationLink = await waitForNetflixEmail(mailToken, 180000);
        
        if (!verificationLink) {
            throw new Error('Email verifikasi tidak diterima dalam 3 menit');
        }
        
        console.log(`[+] Link verifikasi diterima`);
        
        // Buka link verifikasi
        await page.goto(verificationLink, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });
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
        
        console.log('[+] ✅ Account generation complete!');
        
        await browser.close();
        
        return {
            success: true,
            email: email,
            password: password,
            verificationLink: verificationLink
        };
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// ===== TELEGRAM BOT =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Netflix Email Generator Bot started!');
console.log('Bot Token:', BOT_TOKEN.substring(0, 20) + '...');

// Command: /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    const welcomeMessage = `
🎬 *Netflix Email Generator Bot*

Halo ${username}! 👋

Bot ini akan generate email Netflix dengan promo 30 hari gratis untuk kamu.

📌 *Aturan:*
• Setiap akun Telegram dapat *1 trial gratis*
• Proses займет 2-3 menit
• Email akan auto-verify

🔰 *Command:*
/generate - Generate email Netflix (1x per akun)
/status - Cek status trial kamu
/help - Panduan lengkap

Gunakan /generate untuk mulai! 🚀
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
📚 *Panduan Netflix Email Generator*

🔹 *Cara Kerja:*
1. Ketik /generate
2. Bot akan membuat email Mail.TM otomatis
3. Bot register ke Netflix dengan cookies 30 hari
4. Email akan auto-verify
5. Kamu terima email + password + link

🔹 *Batasan:*
• 1 trial per akun Telegram
• Tidak bisa generate lagi setelah dipakai
• Email valid selama 30 hari (promo Netflix)

🔹 *Troubleshooting:*
Jika gagal, kemungkinan:
• Server Netflix sedang sibuk
• Cookies expired
• Coba lagi beberapa menit kemudian

🔹 *Admin Commands:* (jika kamu admin)
/reset <user_id> - Reset trial user
/stats - Statistik bot

Butuh bantuan? Contact admin bot! 🙋‍♂️
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Command: /status
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    const used = hasUsedTrial(userId);
    
    let statusMessage;
    if (used) {
        const db = loadDatabase();
        const userData = db.users[userId];
        statusMessage = `
📊 *Status Akun*

👤 User: ${username}
🆔 ID: ${userId}

❌ *Trial sudah digunakan*
📧 Email: ${userData.email}
📅 Tanggal: ${new Date(userData.timestamp).toLocaleString('id-ID')}

Maaf, hanya 1 trial per akun Telegram ya! 😊
        `;
    } else {
        statusMessage = `
📊 *Status Akun*

👤 User: ${username}
🆔 ID: ${userId}

✅ *Trial masih tersedia!*

Gunakan /generate untuk mulai generate email Netflix gratis! 🎬
        `;
    }
    
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
});

// Command: /generate
bot.onText(/\/generate/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    // Cek apakah sudah pernah menggunakan trial
    if (hasUsedTrial(userId)) {
        bot.sendMessage(chatId, 
            `❌ *Trial sudah digunakan!*\n\n` +
            `Maaf ${username}, kamu sudah menggunakan 1x trial gratis. ` +
            `Setiap akun Telegram hanya dapat 1 trial.\n\n` +
            `Gunakan /status untuk cek detail akun kamu.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Mulai generate
    const processingMsg = await bot.sendMessage(chatId,
        `🔄 *Memproses...*\n\n` +
        `Sedang generate email Netflix untuk kamu, ${username}!\n\n` +
        `⏱ Estimasi: 2-3 menit\n` +
        `📧 Membuat email Mail.TM...\n` +
        `🌐 Register ke Netflix...\n` +
        `✅ Auto-verify email...\n\n` +
        `Mohon tunggu ya... ☕`,
        { parse_mode: 'Markdown' }
    );
    
    try {
        console.log(`[${userId}] ${username} - Starting generation...`);
        
        // Generate account
        const result = await generateNetflixAccount();
        
        if (result.success) {
            // Mark trial as used
            markTrialUsed(userId, username, result.email);
            
            // Send success message
            const successMessage = `
✅ *Berhasil! Account Netflix Created*

📧 *Email:* \`${result.email}\`
🔑 *Password:* \`${result.password}\`
🔗 *Verification Link:*
${result.verificationLink}

📝 *Cara Pakai:*
1. Klik link verifikasi di atas
2. Login dengan email & password
3. Pilih paket Netflix yang kamu mau
4. Nikmati 30 hari gratis! 🎉

⚠️ *Penting:*
• Simpan email & password ini!
• Link verifikasi valid 24 jam
• Setelah 30 hari, perlu bayar atau cancel

Selamat menikmati Netflix! 🍿🎬
            `;
            
            await bot.deleteMessage(chatId, processingMsg.message_id);
            bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
            
            console.log(`[${userId}] ${username} - Success: ${result.email}`);
            
            // Log ke file
            const logData = `[${new Date().toISOString()}] User: ${username} (${userId}) | Email: ${result.email}\n`;
            await fs.appendFile('./telegram_bot_log.txt', logData);
        }
        
    } catch (error) {
        console.error(`[${userId}] Error:`, error.message);
        
        await bot.deleteMessage(chatId, processingMsg.message_id);
        
        bot.sendMessage(chatId,
            `❌ *Gagal Generate Email*\n\n` +
            `Maaf ${username}, terjadi error:\n` +
            `\`${error.message}\`\n\n` +
            `Kemungkinan penyebab:\n` +
            `• Server Netflix sedang sibuk\n` +
            `• Koneksi internet tidak stabil\n` +
            `• Cookies expired\n\n` +
            `Trial kamu masih tersisa, silakan coba lagi nanti! 🔄`,
            { parse_mode: 'Markdown' }
        );
    }
});

// Admin Command: /reset <user_id>
bot.onText(/\/reset (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const targetUserId = parseInt(match[1]);
    
    if (!isAdmin(adminId)) {
        bot.sendMessage(chatId, '❌ Hanya admin yang bisa menggunakan command ini.');
        return;
    }
    
    const success = resetUser(targetUserId);
    
    if (success) {
        bot.sendMessage(chatId, `✅ User ${targetUserId} berhasil di-reset. Trial tersedia kembali.`);
    } else {
        bot.sendMessage(chatId, `❌ User ${targetUserId} tidak ditemukan di database.`);
    }
});

// Admin Command: /stats
bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    
    if (!isAdmin(adminId)) {
        bot.sendMessage(chatId, '❌ Hanya admin yang bisa menggunakan command ini.');
        return;
    }
    
    const db = loadDatabase();
    const totalUsers = Object.keys(db.users).length;
    
    let statsMessage = `📊 *Bot Statistics*\n\n`;
    statsMessage += `👥 Total users: ${totalUsers}\n\n`;
    statsMessage += `*Recent Users:*\n`;
    
    const recentUsers = Object.entries(db.users)
        .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp))
        .slice(0, 10);
    
    recentUsers.forEach(([userId, data], index) => {
        statsMessage += `${index + 1}. ${data.username} (${userId})\n`;
        statsMessage += `   Email: ${data.email}\n`;
        statsMessage += `   Date: ${new Date(data.timestamp).toLocaleString('id-ID')}\n\n`;
    });
    
    bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

console.log('✅ Bot is running...');
console.log('📝 Commands:');
console.log('   /start - Welcome message');
console.log('   /generate - Generate Netflix email (1x per user)');
console.log('   /status - Check trial status');
console.log('   /help - Help guide');
console.log('   /reset <user_id> - Reset user trial (admin only)');
console.log('   /stats - Bot statistics (admin only)');
