// telegram-bot.js - FIXED VERSION
// Bot Telegram RECONIX dengan MySQL + 5 Fitur

const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');

// ===== KONFIGURASI =====
const BOT_TOKEN = '8557661156:AAG49v40J15F140lI4CAba8Ypx0E_uy8_M8';
const ADMIN_USER_ID = null;
const DEFAULT_PASSWORD = 'NetflixTrial2025!';

// Database sederhana fallback
const DB_FILE = './telegram_users.json';
const userStates = new Map();

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

async function getUser(telegramId, username) {
    const db = loadDatabase();
    if (!db.users[telegramId]) {
        db.users[telegramId] = {
            username: username || 'User',
            credit: 2,
            timestamp: new Date().toISOString(),
            history: [],
            redeemedCodes: []
        };
        saveDatabase(db);
    }
    return db.users[telegramId];
}

async function updateCredit(telegramId, creditChange) {
    const db = loadDatabase();
    if (db.users[telegramId]) {
        db.users[telegramId].credit += creditChange;
        saveDatabase(db);
        return true;
    }
    return false;
}

async function addTransaction(telegramId, type, email, password, link, creditUsed = 1) {
    const db = loadDatabase();
    if (!db.users[telegramId].history) {
        db.users[telegramId].history = [];
    }
    db.users[telegramId].history.push({
        type, email, password, link,
        timestamp: new Date().toISOString()
    });
    saveDatabase(db);
    return true;
}

async function getUserHistory(telegramId, limit = 5) {
    const db = loadDatabase();
    const history = db.users[telegramId]?.history || [];
    return history.slice(-limit).reverse();
}

async function redeemCode(telegramId, code) {
    const validCodes = {
        'WELCOME10': 10,
        'TRIAL5': 5,
        'BONUS3': 3
    };
    
    if (validCodes[code]) {
        const db = loadDatabase();
        const userData = db.users[telegramId];
        
        if (userData.redeemedCodes && userData.redeemedCodes.includes(code)) {
            return { success: false, message: 'Kode sudah digunakan' };
        }
        
        if (!userData.redeemedCodes) {
            userData.redeemedCodes = [];
        }
        userData.redeemedCodes.push(code);
        userData.credit += validCodes[code];
        saveDatabase(db);
        
        return { success: true, creditValue: validCodes[code] };
    }
    
    return { success: false, message: 'Kode tidak valid' };
}

// ===== MAIL.TM FUNCTIONS =====
async function getMailTmAccount() {
    try {
        console.log('[*] Mengambil domain mail.tm...');
        const domainRes = await axios.get('https://api.mail.tm/domains');
        const domains = domainRes.data['hydra:member'];
        
        let domain = domains.find(d => d.domain === 'web-library.net')?.domain || domains[0].domain;
        
        // Generate: netflix + (5 huruf random) + (5 angka random)
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const nums = '0123456789';
        let randomStr = 'netflix';
        
        for (let i = 0; i < 5; i++) {
            randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        for (let i = 0; i < 5; i++) {
            randomStr += nums.charAt(Math.floor(Math.random() * nums.length));
        }
        
        const address = `${randomStr}@${domain}`;
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
                        /https?:\/\/(www\.)?netflix\.com\/epr\?[^"\s<]+/gi
                    ];
                    
                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) {
                            let link = match[0].replace(/&amp;/g, '&');
                            if (!link.startsWith('http')) link = 'https://' + link;
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
async function processManualEmail(email) {
    console.log(`[*] Processing manual email: ${email}`);
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    await context.addCookies(COOKIES_30_DAYS);
    const page = await context.newPage();
    
    try {
        await page.goto('https://www.netflix.com/id-en/', { 
            waitUntil: 'networkidle',
            timeout: 30000
        });
        await page.waitForTimeout(3000);
        
        let emailSuccess = false;
        let attempt = 0;
        
        while (!emailSuccess && attempt < 10) {
            attempt++;
            console.log(`[*] Input email (attempt ${attempt}/10)`);
            
            try {
                const emailInput = page.locator('input[data-uia="field-email"]');
                await emailInput.waitFor({ state: 'visible', timeout: 10000 });
                await emailInput.clear();
                await emailInput.fill(email);
                
                const submitButton = page.locator('button[type="submit"]');
                await submitButton.click();
                await page.waitForTimeout(5000);
                
                const sendLinkButton = page.locator('button[data-uia="email-register-send-link-send-link-button"]');
                const hasSendLink = await sendLinkButton.isVisible({ timeout: 5000 });
                
                if (hasSendLink) {
                    await sendLinkButton.click();
                    emailSuccess = true;
                } else {
                    await page.goBack({ waitUntil: 'networkidle', timeout: 15000 });
                    await page.waitForTimeout(2000);
                }
            } catch (e) {
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);
            }
        }
        
        await browser.close();
        
        if (emailSuccess) {
            return { success: true, email };
        } else {
            throw new Error('Gagal submit email');
        }
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

async function generateMailTmOnly() {
    const mailAccount = await getMailTmAccount();
    if (!mailAccount) throw new Error('Gagal membuat akun Mail.TM');
    
    const result = await processManualEmail(mailAccount.address);
    
    return {
        success: result.success,
        email: mailAccount.address,
        password: DEFAULT_PASSWORD,
        mailToken: mailAccount.token,
        mailPassword: mailAccount.password
    };
}

async function generateNetflixAccount() {
    const mailAccount = await getMailTmAccount();
    if (!mailAccount) throw new Error('Gagal membuat akun Mail.TM');
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    await context.addCookies(COOKIES_30_DAYS);
    const page = await context.newPage();
    
    try {
        await page.goto('https://www.netflix.com/id-en/', { 
            waitUntil: 'networkidle',
            timeout: 30000
        });
        await page.waitForTimeout(3000);
        
        let emailSuccess = false;
        let attempt = 0;
        
        while (!emailSuccess && attempt < 20) {
            attempt++;
            console.log(`[*] Input email (attempt ${attempt})`);
            
            try {
                const emailInput = page.locator('input[data-uia="field-email"]');
                await emailInput.waitFor({ state: 'visible', timeout: 10000 });
                await emailInput.clear();
                await emailInput.fill(mailAccount.address);
                
                const submitButton = page.locator('button[type="submit"]');
                await submitButton.click();
                await page.waitForTimeout(5000);
                
                const sendLinkButton = page.locator('button[data-uia="email-register-send-link-send-link-button"]');
                const hasSendLink = await sendLinkButton.isVisible({ timeout: 5000 });
                
                if (hasSendLink) {
                    console.log(`[+] Berhasil! Klik "Send Link"`);
                    await sendLinkButton.click();
                    emailSuccess = true;
                } else {
                    await page.goBack({ waitUntil: 'networkidle', timeout: 15000 });
                    await page.waitForTimeout(2000);
                }
            } catch (e) {
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);
            }
        }
        
        if (!emailSuccess) throw new Error('Gagal submit email');
        
        await page.waitForTimeout(3000);
        
        const verificationLink = await waitForNetflixEmail(mailAccount.token, 180000);
        if (!verificationLink) throw new Error('Email verifikasi tidak diterima');
        
        await page.goto(verificationLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);
        
        try {
            const createButton = page.locator('button:has-text("Create Your Account"), a:has-text("Create Your Account")').first();
            if (await createButton.isVisible({ timeout: 10000 })) {
                await createButton.click();
                await page.waitForTimeout(3000);
            }
        } catch (e) {}
        
        await browser.close();
        
        return {
            success: true,
            email: mailAccount.address,
            password: mailAccount.password,
            verificationLink: verificationLink
        };
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// ===== TELEGRAM BOT =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Netflix Bot started!');
console.log('Bot Token:', BOT_TOKEN.substring(0, 20) + '...');
console.log('✅ Bot is running...');

// Command: /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    const userData = await getUser(userId, username);
    
    const welcomeMessage = `
👋 *Selamat datang di Bot*

🆔 Telegram: \`${userId}\`
🔗 Akun Web: \`${username}\` ✅
💰 Saldo: *${userData.credit} kredit*

Pilih menu di bawah untuk mulai 👇
    `;
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '🎬 Fitur', callback_data: 'menu_fitur' }],
            [
                { text: '👤 Profile', callback_data: 'menu_profile' },
                { text: '📜 Riwayat', callback_data: 'menu_riwayat' }
            ],
            [
                { text: '🎁 Redeem', callback_data: 'menu_redeem' },
                { text: '💳 Topup', callback_data: 'menu_topup' }
            ],
            [{ text: '❓ Bantuan', callback_data: 'menu_bantuan' }]
        ]
    };
    
    bot.sendMessage(chatId, welcomeMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

// Callback Query Handler
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username || callbackQuery.from.first_name || 'User';
    const data = callbackQuery.data;
    
    bot.answerCallbackQuery(callbackQuery.id);
    
    try {
        const userData = await getUser(userId, username);
        
        if (data === 'menu_fitur') {
            const fiturMsg = `
🎬 *FITUR - Netflix Generator*

💰 Saldo: *${userData.credit} kredit*

*1.* Manual Email (FREE)
*2.* Generate Email (FREE)
*3.* Auto Register + Claim (1 Kredit)
*4.* Mass Manual (FREE)
*5.* Mass Generator (FREE)
            `;
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📝 Manual', callback_data: 'fitur_manual' },
                        { text: '🎲 Generate', callback_data: 'fitur_generate' }
                    ],
                    [{ text: '🚀 Auto Register', callback_data: 'fitur_auto' }],
                    [
                        { text: '📋 Mass Manual', callback_data: 'fitur_mass_manual' },
                        { text: '⚡ Mass Gen', callback_data: 'fitur_mass_gen' }
                    ],
                    [{ text: '🔙 Kembali', callback_data: 'back_main' }]
                ]
            };
            
            bot.sendMessage(chatId, fiturMsg, { parse_mode: 'Markdown', reply_markup: keyboard });
        }
        
        else if (data === 'fitur_manual') {
            userStates.set(userId, { mode: 'manual', step: 1 });
            bot.sendMessage(chatId, '📝 *Manual Email* (FREE)\n\nKirim email Anda:', { parse_mode: 'Markdown' });
        }
        
        else if (data === 'fitur_generate') {
            bot.sendMessage(chatId, '🎲 Generating...', { parse_mode: 'Markdown' });
            
            try {
                const result = await generateMailTmOnly();
                bot.sendMessage(chatId, 
                    `✅ *Email Generated!*\n\n📧 \`${result.email}\`\n🔑 \`${DEFAULT_PASSWORD}\``,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                bot.sendMessage(chatId, `❌ Gagal: ${error.message}`);
            }
        }
        
        else if (data === 'fitur_auto') {
            if (userData.credit < 1) {
                bot.sendMessage(chatId, '❌ Saldo tidak cukup!', { parse_mode: 'Markdown' });
                return;
            }
            
            const processingMsg = await bot.sendMessage(chatId, '🚀 Processing...');
            
            try {
                const result = await generateNetflixAccount();
                
                await updateCredit(userId, -1);
                await addTransaction(userId, 'netflix', result.email, result.password, result.verificationLink, 1);
                
                const updatedUser = await getUser(userId, username);
                
                await bot.deleteMessage(chatId, processingMsg.message_id);
                bot.sendMessage(chatId,
                    `✅ *Success!*\n\n📧 \`${result.email}\`\n🔑 \`${result.password}\`\n🔗 ${result.verificationLink}\n\n💰 Saldo: ${updatedUser.credit}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                await bot.deleteMessage(chatId, processingMsg.message_id);
                bot.sendMessage(chatId, `❌ Gagal: ${error.message}`);
            }
        }
        
        else if (data === 'fitur_mass_manual') {
            userStates.set(userId, { mode: 'mass_manual', step: 1 });
            bot.sendMessage(chatId, '📋 *Mass Manual* (FREE)\n\nPaste list email (max 10):', { parse_mode: 'Markdown' });
        }
        
        else if (data === 'fitur_mass_gen') {
            userStates.set(userId, { mode: 'mass_gen', step: 1 });
            bot.sendMessage(chatId, '⚡ *Mass Generator* (FREE)\n\nBerapa email? (1-10):', { parse_mode: 'Markdown' });
        }
        
        else if (data === 'menu_profile') {
            bot.sendMessage(chatId,
                `👤 *PROFILE*\n\n🆔 \`${userId}\`\n👤 ${username}\n💰 ${userData.credit} kredit`,
                { parse_mode: 'Markdown' }
            );
        }
        
        else if (data === 'menu_riwayat') {
            const history = await getUserHistory(userId, 5);
            let msg = '📜 *RIWAYAT*\n\n';
            
            if (history.length === 0) {
                msg += 'Belum ada transaksi.';
            } else {
                history.forEach((item, i) => {
                    msg += `*${i + 1}.* ${item.email || 'N/A'}\n`;
                });
            }
            
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
        
        else if (data === 'menu_redeem') {
            userStates.set(userId, { mode: 'redeem', step: 1 });
            bot.sendMessage(chatId, '🎁 *REDEEM*\n\nKirim kode redeem:', { parse_mode: 'Markdown' });
        }
        
        else if (data === 'menu_topup') {
            bot.sendMessage(chatId,
                `💳 *TOPUP*\n\n5 Kredit = Rp 10.000\n10 Kredit = Rp 18.000\n\nContact admin untuk topup!`,
                { parse_mode: 'Markdown' }
            );
        }
        
        else if (data === 'menu_bantuan') {
            bot.sendMessage(chatId, '❓ *BANTUAN*\n\nGunakan menu Fitur untuk generate Netflix.', { parse_mode: 'Markdown' });
        }
        
        else if (data === 'back_main') {
            bot.sendMessage(chatId,
                `👋 *Welcome*\n\n💰 Saldo: ${userData.credit} kredit`,
                { parse_mode: 'Markdown' }
            );
        }
        
    } catch (error) {
        console.error('Callback error:', error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// Message Handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const text = msg.text;
    
    if (!text || text.startsWith('/')) return;
    
    const userState = userStates.get(userId);
    if (!userState) return;
    
    const { mode, step } = userState;
    
    if (mode === 'manual' && step === 1) {
        const email = text.trim();
        
        try {
            await processManualEmail(email);
            bot.sendMessage(chatId, `✅ Email ${email} disubmit! Cek inbox.`);
        } catch (error) {
            bot.sendMessage(chatId, `❌ Gagal: ${error.message}`);
        }
        
        userStates.delete(userId);
    }
    
    else if (mode === 'redeem' && step === 1) {
        const code = text.trim().toUpperCase();
        const result = await redeemCode(userId, code);
        
        if (result.success) {
            const userData = await getUser(userId, username);
            bot.sendMessage(chatId, `✅ +${result.creditValue} kredit! Saldo: ${userData.credit}`);
        } else {
            bot.sendMessage(chatId, `❌ ${result.message}`);
        }
        
        userStates.delete(userId);
    }
    
    else if (mode === 'mass_manual' && step === 1) {
        const emails = text.trim().split('\n').filter(e => e.trim());
        
        if (emails.length > 10) {
            bot.sendMessage(chatId, '❌ Max 10 emails!');
            return;
        }
        
        bot.sendMessage(chatId, `Processing ${emails.length} emails...`);
        
        let success = 0;
        for (const email of emails) {
            try {
                await processManualEmail(email);
                success++;
            } catch (e) {}
        }
        
        bot.sendMessage(chatId, `✅ Done: ${success}/${emails.length}`);
        userStates.delete(userId);
    }
    
    else if (mode === 'mass_gen' && step === 1) {
        const count = parseInt(text.trim());
        
        if (isNaN(count) || count < 1 || count > 10) {
            bot.sendMessage(chatId, '❌ Angka harus 1-10!');
            return;
        }
        
        bot.sendMessage(chatId, `Generating ${count} emails...`);
        
        let success = 0;
        const results = [];
        
        for (let i = 0; i < count; i++) {
            try {
                const result = await generateMailTmOnly();
                results.push(`${result.email}|${DEFAULT_PASSWORD}`);
                success++;
            } catch (e) {}
        }
        
        bot.sendMessage(chatId, `✅ Done: ${success}/${count}\n\`\`\`\n${results.join('\n')}\n\`\`\``, { parse_mode: 'Markdown' });
        userStates.delete(userId);
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

console.log('📝 Commands: /start');
console.log('⚙️  Features: 5 modes + Credit system');
console.log('🗄️  Database: telegram_users.json');
