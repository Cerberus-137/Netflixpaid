// telegram-bot.js
// Bot Telegram untuk Netflix Email Generator
// Full Featured: Manual, Auto-Generate, Auto-Register, Mass Email
// Version 3.0

const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const mysql = require('mysql2/promise');

// ===== KONFIGURASI =====
const BOT_TOKEN = '8557661156:AAG49v40J15F140lI4CAba8Ypx0E_uy8_M8';
const ADMIN_USER_ID = 6490037175; // Set ke Telegram User ID Anda untuk admin access (optional)
const DEFAULT_PASSWORD = 'NetflixTrial2025!'; // Password default untuk mode generate

// MySQL Database Configuration
const DB_CONFIG = {
    host: 'localhost',
    user: 'root', // atau user database Anda
    password: 'Milham159753',
    database: 'netflix_bot', // nama database yang akan dibuat
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Database sederhana fallback: menyimpan user yang sudah pake trial
const DB_FILE = './telegram_users.json';

// User state management (untuk multi-step interactions)
const userStates = new Map(); // userId -> { mode, data, step }

// MySQL Pool
let dbPool = null;

// Cookies 30 days - SAMA PERSIS seperti netflix-mass-bot.js
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

// ===== DATABASE FUNCTIONS (MySQL + JSON Fallback) =====

// Initialize MySQL Database
async function initDatabase() {
    try {
        // Create connection pool
        dbPool = mysql.createPool(DB_CONFIG);
        
        console.log('[*] Testing MySQL connection...');
        const connection = await dbPool.getConnection();
        
        // Create database if not exists
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_CONFIG.database}`);
        await connection.query(`USE ${DB_CONFIG.database}`);
        
        // Create users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,
                username VARCHAR(255),
                credit INT DEFAULT 2,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        // Create transactions table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                telegram_id BIGINT,
                type ENUM('netflix', 'topup', 'redeem') DEFAULT 'netflix',
                email VARCHAR(255),
                password VARCHAR(255),
                link TEXT,
                credit_used INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
            )
        `);
        
        // Create redeem_codes table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS redeem_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) UNIQUE,
                credit_value INT,
                used_by BIGINT DEFAULT NULL,
                used_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (used_by) REFERENCES users(telegram_id)
            )
        `);
        
        // Insert default redeem codes
        await connection.query(`
            INSERT IGNORE INTO redeem_codes (code, credit_value) VALUES
            ('WELCOME10', 10),
            ('TRIAL5', 5),
            ('BONUS3', 3)
        `);
        
        connection.release();
        console.log('[+] MySQL database initialized successfully!');
        return true;
    } catch (error) {
        console.error('[-] MySQL connection failed:', error.message);
        console.log('[!] Falling back to JSON database...');
        return false;
    }
}

// Get user from database
async function getUser(telegramId, username) {
    if (dbPool) {
        try {
            const [rows] = await dbPool.query(
                'SELECT * FROM users WHERE telegram_id = ?',
                [telegramId]
            );
            
            if (rows.length === 0) {
                // Create new user
                await dbPool.query(
                    'INSERT INTO users (telegram_id, username, credit) VALUES (?, ?, 2)',
                    [telegramId, username]
                );
                return { telegram_id: telegramId, username, credit: 2 };
            }
            
            return rows[0];
        } catch (error) {
            console.error('[-] MySQL error:', error.message);
        }
    }
    
    // Fallback to JSON
    const db = loadDatabase();
    if (!db.users[telegramId]) {
        db.users[telegramId] = {
            username: username,
            credit: 2,
            timestamp: new Date().toISOString(),
            history: []
        };
        saveDatabase(db);
    }
    return db.users[telegramId];
}

// Update user credit
async function updateCredit(telegramId, creditChange) {
    if (dbPool) {
        try {
            await dbPool.query(
                'UPDATE users SET credit = credit + ? WHERE telegram_id = ?',
                [creditChange, telegramId]
            );
            return true;
        } catch (error) {
            console.error('[-] MySQL error:', error.message);
        }
    }
    
    // Fallback to JSON
    const db = loadDatabase();
    if (db.users[telegramId]) {
        db.users[telegramId].credit += creditChange;
        saveDatabase(db);
        return true;
    }
    return false;
}

// Add transaction
async function addTransaction(telegramId, type, email, password, link, creditUsed = 1) {
    if (dbPool) {
        try {
            await dbPool.query(
                'INSERT INTO transactions (telegram_id, type, email, password, link, credit_used) VALUES (?, ?, ?, ?, ?, ?)',
                [telegramId, type, email, password, link, creditUsed]
            );
            return true;
        } catch (error) {
            console.error('[-] MySQL error:', error.message);
        }
    }
    
    // Fallback to JSON
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

// Get user history
async function getUserHistory(telegramId, limit = 5) {
    if (dbPool) {
        try {
            const [rows] = await dbPool.query(
                'SELECT * FROM transactions WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?',
                [telegramId, limit]
            );
            return rows;
        } catch (error) {
            console.error('[-] MySQL error:', error.message);
        }
    }
    
    // Fallback to JSON
    const db = loadDatabase();
    const history = db.users[telegramId]?.history || [];
    return history.slice(-limit).reverse();
}

// Redeem code
async function redeemCode(telegramId, code) {
    if (dbPool) {
        try {
            const [rows] = await dbPool.query(
                'SELECT * FROM redeem_codes WHERE code = ? AND used_by IS NULL',
                [code]
            );
            
            if (rows.length === 0) {
                return { success: false, message: 'Kode tidak valid atau sudah digunakan' };
            }
            
            const creditValue = rows[0].credit_value;
            
            // Mark as used
            await dbPool.query(
                'UPDATE redeem_codes SET used_by = ?, used_at = NOW() WHERE code = ?',
                [telegramId, code]
            );
            
            // Add credit
            await updateCredit(telegramId, creditValue);
            
            return { success: true, creditValue };
        } catch (error) {
            console.error('[-] MySQL error:', error.message);
        }
    }
    
    // Fallback to JSON
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

// JSON Database Functions (Fallback)
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

// ===== MAIL.TM FUNCTIONS (SAMA seperti netflix-mass-bot.js) =====
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

// ===== NETFLIX AUTOMATION (Seperti netflix-mass-bot.js dengan retry logic) =====

// Process MANUAL EMAIL (user provide email)
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
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await page.waitForTimeout(2000);
        
        // Input email dengan retry
        let emailSuccess = false;
        let attempt = 0;
        
        while (!emailSuccess && attempt < 10) {
            attempt++;
            console.log(`[*] Input email (attempt ${attempt}/10)`);
            
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
        
        await browser.close();
        
        if (emailSuccess) {
            return {
                success: true,
                email: email,
                message: 'Email berhasil disubmit! Silakan cek inbox Anda untuk link verifikasi.'
            };
        } else {
            throw new Error('Gagal submit email setelah 10 percobaan');
        }
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// Generate Mail.TM email + Netflix register (NO VERIFY)
async function generateMailTmOnly() {
    console.log('[*] Generate Mail.TM email only...');
    
    const mailAccount = await getMailTmAccount();
    if (!mailAccount) {
        throw new Error('Gagal membuat akun Mail.TM');
    }
    
    const email = mailAccount.address;
    const password = DEFAULT_PASSWORD;
    
    console.log(`[+] Email created: ${email}`);
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    await context.addCookies(COOKIES_30_DAYS);
    const page = await context.newPage();
    
    try {
        await page.goto('https://www.netflix.com/id-en/', { 
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await page.waitForTimeout(2000);
        
        // Input email dengan retry
        let emailSuccess = false;
        let attempt = 0;
        
        while (!emailSuccess && attempt < 20) {
            attempt++;
            console.log(`[*] Input email (attempt ${attempt})`);
            
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
        
        await browser.close();
        
        if (emailSuccess) {
            return {
                success: true,
                email: email,
                password: password,
                mailToken: mailAccount.token,
                mailPassword: mailAccount.password
            };
        } else {
            throw new Error('Gagal submit email setelah 20 percobaan');
        }
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// Full automation: Generate + Register + Verify
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
        // Buka Netflix dengan retry (FIX untuk timeout issue)
        let pageLoaded = false;
        let loadAttempt = 0;
        
        while (!pageLoaded && loadAttempt < 3) {
            loadAttempt++;
            console.log(`[*] Loading Netflix page (attempt ${loadAttempt}/3)...`);
            
            try {
                await page.goto('https://www.netflix.com/id-en/', { 
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
                await page.waitForTimeout(3000);
                
                // Verify page loaded dengan cek input field
                const emailInput = page.locator('input[data-uia="field-email"]');
                await emailInput.waitFor({ state: 'visible', timeout: 10000 });
                
                pageLoaded = true;
                console.log(`[+] Netflix page loaded successfully`);
            } catch (e) {
                console.log(`[-] Page load failed (${e.message}), retrying...`);
                if (loadAttempt >= 3) {
                    throw new Error('Failed to load Netflix page after 3 attempts');
                }
            }
        }
        
        // Input email dengan retry UNLIMITED seperti netflix-mass-bot.js
        let emailSuccess = false;
        let attempt = 0;
        
        while (!emailSuccess) {
            attempt++;
            console.log(`[*] Input email (attempt ${attempt})`);
            
            try {
                // Wait for input to be ready
                const emailInput = page.locator('input[data-uia="field-email"]');
                await emailInput.waitFor({ state: 'visible', timeout: 10000 });
                await emailInput.clear();
                await emailInput.fill(email);
                
                const submitButton = page.locator('button[type="submit"]');
                await submitButton.click();
                await page.waitForTimeout(5000); // Tunggu lebih lama untuk page navigation
                
                const currentUrl = page.url();
                console.log(`[*] Current URL: ${currentUrl}`);
                
                // Cek apakah ada tombol "Send Link" di page
                try {
                    const sendLinkButton = page.locator('button[data-uia="email-register-send-link-send-link-button"]');
                    const hasSendLink = await sendLinkButton.isVisible({ timeout: 5000 });
                    
                    if (hasSendLink) {
                        console.log(`[+] Berhasil! Klik "Send Link"`);
                        await sendLinkButton.click();
                        emailSuccess = true;
                    } else {
                        console.log(`[-] Tidak ada tombol "Send Link", back + retry...`);
                        await page.goBack({ waitUntil: 'networkidle', timeout: 15000 });
                        await page.waitForTimeout(3000);
                    }
                } catch (e) {
                    console.log(`[-] Tidak ada tombol "Send Link", back + retry...`);
                    await page.goBack({ waitUntil: 'networkidle', timeout: 15000 });
                    await page.waitForTimeout(3000);
                }
            } catch (fillError) {
                console.log(`[-] Error filling email: ${fillError.message}`);
                // Reload page on fill error
                await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
                await page.waitForTimeout(3000);
            }
            
            // Safety: max 20 attempts untuk telegram bot
            if (attempt >= 20) {
                throw new Error('Gagal input email setelah 20 percobaan');
            }
        }
        
        await page.waitForTimeout(3000);
        console.log('[+] Email submission selesai!');
        
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
                console.log('[+] Button "Create Your Account" diklik');
            }
        } catch (e) {
            console.log('[*] Button "Create Your Account" tidak ditemukan atau sudah redirect');
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

// Command: /start dengan INLINE KEYBOARD (RECONIX Style)
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    // Load user data
    const db = loadDatabase();
    if (!db.users[userId]) {
        // New user: initialize dengan 2 kredit gratis
        db.users[userId] = {
            username: username,
            credit: 2, // Starting credit
            timestamp: new Date().toISOString(),
            used: false,
            history: []
        };
        saveDatabase(db);
    }
    
    const userData = db.users[userId];
    
    const welcomeMessage = `
👋 *Selamat datang di  Bot*

🆔 Telegram: \`${userId}\`
🔗 Akun Web: \`${username}\` ✅
💰 Saldo: *${userData.credit} kredit*

Pilih menu di bawah untuk mulai 👇
    `;
    
    const keyboard = {
        inline_keyboard: [
            [
                { text: '🎬 Fitur', callback_data: 'menu_fitur' }
            ],
            [
                { text: '👤 Profile', callback_data: 'menu_profile' },
                { text: '📜 Riwayat', callback_data: 'menu_riwayat' }
            ],
            [
                { text: '🎁 Redeem', callback_data: 'menu_redeem' },
                { text: '💳 Topup', callback_data: 'menu_topup' }
            ],
            [
                { text: '❓ Bantuan', callback_data: 'menu_bantuan' }
            ]
        ]
    };
    
    bot.sendMessage(chatId, welcomeMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    showHelp(chatId);
});

function showHelp(chatId) {
    const helpMessage = `
📚 *Panduan Netflix Email Generator*

🔹 *Mode 1: Manual Email*
1. Pilih "Manual Email"
2. Input email Anda
3. Bot submit ke Netflix
4. Cek inbox untuk verifikasi

🔹 *Mode 2: Generate Email*
1. Pilih "Generate Email"
2. Bot buat email Mail.TM otomatis
3. Email + password dikirim ke Anda
4. Password default: \`${DEFAULT_PASSWORD}\`

🔹 *Mode 3: Auto Register + Claim*
1. Pilih "Auto Register + Claim"
2. Bot buat email + register + verify otomatis
3. Full automation!

🔹 *Mode 4: Mass Email Manual*
1. Pilih "Mass Email Manual"
2. Paste list email (1 per line)
3. Bot process semua email

🔹 *Mode 5: Mass Email Generator*
1. Pilih "Mass Email Generator"
2. Input jumlah email (max 10)
3. Bot generate semua otomatis

🔹 *Admin Commands:*
/reset <user_id> - Reset trial user
/stats - Statistik bot

Butuh bantuan? Contact admin bot! 🙋‍♂️
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
}

// Command: /status
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    showStatus(chatId, userId);
});

function showStatus(chatId, userId) {
    const username = 'User';
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

_Mode lain masih bisa digunakan!_
        `;
    } else {
        statusMessage = `
📊 *Status Akun*

👤 User: ${username}
🆔 ID: ${userId}

✅ *Trial masih tersedia!*

Gunakan mode "Auto Register + Claim" untuk trial gratis! 🎬
        `;
    }
    
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
}

// ===== CALLBACK QUERY HANDLERS (RECONIX System) =====
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username || callbackQuery.from.first_name;
    const data = callbackQuery.data;
    
    // Answer callback query
    bot.answerCallbackQuery(callbackQuery.id);
    
    // Load user data
    const db = loadDatabase();
    const userData = db.users[userId] || { credit: 0, history: [] };
    
    if (data === 'menu_fitur') {
        // Fitur Menu dengan 5 Opsi
        const fiturMsg = `
🎬 *FITUR - Netflix Generator*

💰 Saldo kamu: *${userData.credit} kredit*

Pilih layanan yang kamu mau:

*1.* Manual Email (FREE)
→ Input email sendiri

*2.* Generate Email (FREE)
→ Auto-generate Mail.TM + password default

*3.* Auto Register + Claim (1 Kredit)
→ Full automation dengan verify

*4.* Mass Email Manual (FREE)
→ Paste list email (max 10)

*5.* Mass Email Generator (FREE)
→ Generate multiple emails (max 10)

_Mode berbayar: Auto Register + Claim_
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📝 Manual Email', callback_data: 'fitur_manual' },
                    { text: '🎲 Generate Email', callback_data: 'fitur_generate' }
                ],
                [
                    { text: '🚀 Auto Register + Claim', callback_data: 'fitur_auto' }
                ],
                [
                    { text: '📋 Mass Manual', callback_data: 'fitur_mass_manual' },
                    { text: '⚡ Mass Generator', callback_data: 'fitur_mass_gen' }
                ],
                [
                    { text: '🔙 Kembali', callback_data: 'back_main' }
                ]
            ]
        };
        
        bot.sendMessage(chatId, fiturMsg, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    else if (data === 'fitur_manual') {
        // Mode 1: Manual Email (FREE)
        userStates.set(userId, { mode: 'manual', step: 1 });
        bot.sendMessage(chatId,
            `📝 *Mode: Manual Email* (FREE)\n\n` +
            `Silakan kirim email Anda:\n` +
            `Contoh: user@gmail.com\n\n` +
            `Bot akan submit ke Netflix, lalu cek inbox untuk verifikasi.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'fitur_generate') {
        // Mode 2: Generate Email (FREE)
        bot.sendMessage(chatId,
            `🎲 *Generating Email...* (FREE)\n\n` +
            `Password default: \`${DEFAULT_PASSWORD}\`\n\n` +
            `Mohon tunggu...`,
            { parse_mode: 'Markdown' }
        );
        
        try {
            const result = await generateMailTmOnly();
            
            if (result.success) {
                const successMsg = `
✅ *Email Generated!*

📧 *Email:* \`${result.email}\`
🔑 *Password:* \`${DEFAULT_PASSWORD}\`

📝 *Next:*
1. Cek inbox: ${result.email}
2. Klik link verifikasi Netflix
3. Login dengan password di atas

Format:
\`\`\`
${result.email}|${DEFAULT_PASSWORD}
\`\`\`
                `;
                
                bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
                
                // Log
                const logData = `[${new Date().toISOString()}] Generate (FREE) | User: ${username} (${userId}) | Email: ${result.email}\n`;
                await fs.appendFile('./telegram_bot_log.txt', logData);
            }
        } catch (error) {
            bot.sendMessage(chatId,
                `❌ Gagal: \`${error.message}\``,
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    else if (data === 'fitur_auto') {
        // Mode 3: Auto Register + Claim (PAID - 1 Kredit)
        if (userData.credit < 1) {
            bot.sendMessage(chatId,
                `❌ *Saldo tidak cukup!*\n\n` +
                `Mode ini butuh 1 kredit.\n` +
                `Saldo kamu: ${userData.credit} kredit\n\n` +
                `Silakan topup atau gunakan mode FREE!`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const processingMsg = await bot.sendMessage(chatId,
            `🚀 *Auto Register + Claim* (1 Kredit)\n\n` +
            `⏱ Estimasi: 2-3 menit\n` +
            `📧 Generate Mail.TM\n` +
            `🌐 Register Netflix\n` +
            `✅ Auto-verify\n\n` +
            `Mohon tunggu... ☕`,
            { parse_mode: 'Markdown' }
        );
        
        try {
            const result = await generateNetflixAccount();
            
            if (result.success) {
                // Deduct credit
                await updateCredit(userId, -1);
                
                // Add to transactions
                await addTransaction(userId, 'netflix', result.email, result.password, result.verificationLink, 1);
                
                // Get updated credit
                const updatedUser = await getUser(userId, username);
                
                const successMsg = `
✅ *Netflix Account Created!*

📧 *Email:* \`${result.email}\`
🔑 *Password:* \`${result.password}\`
🔗 *Link:*
${result.verificationLink}

💰 *Saldo:* ${updatedUser.credit} kredit

📝 *Cara Pakai:*
1. Klik link verifikasi
2. Login dengan email & password
3. Enjoy 30 hari gratis! 🎉

Format:
\`\`\`
${result.email}|${result.password}|${result.verificationLink}
\`\`\`
                `;
                
                await bot.deleteMessage(chatId, processingMsg.message_id);
                bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
                
                // Log
                const logData = `[${new Date().toISOString()}] Auto (PAID) | User: ${username} (${userId}) | Email: ${result.email} | Credit: ${updatedUser.credit}\n`;
                await fs.appendFile('./telegram_bot_log.txt', logData);
            }
        } catch (error) {
            await bot.deleteMessage(chatId, processingMsg.message_id);
            bot.sendMessage(chatId,
                `❌ *Gagal*\n\n` +
                `Error: \`${error.message}\`\n\n` +
                `Kredit TIDAK dikurangi. Silakan coba lagi!`,
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    else if (data === 'fitur_mass_manual') {
        // Mode 4: Mass Email Manual (FREE)
        userStates.set(userId, { mode: 'mass_manual', step: 1 });
        bot.sendMessage(chatId,
            `📋 *Mass Email Manual* (FREE)\n\n` +
            `Paste list email (1 per line):\n` +
            `\`\`\`\n` +
            `user1@gmail.com\n` +
            `user2@yahoo.com\n` +
            `user3@outlook.com\n` +
            `\`\`\`\n\n` +
            `Max: 10 emails`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'fitur_mass_gen') {
        // Mode 5: Mass Email Generator (FREE)
        userStates.set(userId, { mode: 'mass_gen', step: 1 });
        bot.sendMessage(chatId,
            `⚡ *Mass Email Generator* (FREE)\n\n` +
            `Berapa email yang mau digenerate?\n\n` +
            `Kirim angka (1-10)`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'fitur_netflix') {
        // Netflix Generation dengan Credit Check
        if (userData.credit < 1) {
            bot.sendMessage(chatId,
                `❌ *Saldo tidak cukup!*\n\n` +
                `Kamu perlu 1 kredit untuk generate Netflix.\n` +
                `Saldo kamu: ${userData.credit} kredit\n\n` +
                `Silakan topup terlebih dahulu!`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const processingMsg = await bot.sendMessage(chatId,
            `🚀 *Generating Netflix Account...*\n\n` +
            `⏱ Estimasi: 2-3 menit\n` +
            `📧 Membuat email Mail.TM\n` +
            `🌐 Register ke Netflix\n` +
            `✅ Auto-verify email\n\n` +
            `Mohon tunggu... ☕`,
            { parse_mode: 'Markdown' }
        );
        
        try {
            const result = await generateNetflixAccount();
            
            if (result.success) {
                // Deduct credit
                userData.credit -= 1;
                
                // Add to history
                userData.history.push({
                    type: 'netflix',
                    email: result.email,
                    password: result.password,
                    link: result.verificationLink,
                    timestamp: new Date().toISOString()
                });
                
                // Save database
                db.users[userId] = userData;
                saveDatabase(db);
                
                const successMsg = `
✅ *Netflix Account Generated!*

📧 *Email:* \`${result.email}\`
🔑 *Password:* \`${result.password}\`
🔗 *Link Verifikasi:*
${result.verificationLink}

💰 *Saldo:* ${userData.credit} kredit

📝 *Cara Pakai:*
1. Klik link verifikasi
2. Login dengan email & password
3. Pilih paket Netflix
4. Enjoy 30 hari gratis! 🎉

_Email & password sudah tersimpan di Riwayat_
                `;
                
                await bot.deleteMessage(chatId, processingMsg.message_id);
                bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
                
                // Log
                const logData = `[${new Date().toISOString()}] User: ${username} (${userId}) | Netflix | Email: ${result.email} | Credit: ${userData.credit}\n`;
                await fs.appendFile('./telegram_bot_log.txt', logData);
            }
        } catch (error) {
            await bot.deleteMessage(chatId, processingMsg.message_id);
            bot.sendMessage(chatId,
                `❌ *Gagal Generate*\n\n` +
                `Error: \`${error.message}\`\n\n` +
                `Kredit kamu tidak dikurangi, silakan coba lagi!`,
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    else if (data === 'menu_profile') {
        // Profile Menu
        const profileMsg = `
👤 *PROFILE*

🆔 Telegram ID: \`${userId}\`
👤 Username: @${username}
💰 Saldo: *${userData.credit} kredit*
📅 Member sejak: ${new Date(userData.timestamp).toLocaleDateString('id-ID')}
📊 Total transaksi: ${userData.history.length}
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔙 Kembali', callback_data: 'back_main' }
                ]
            ]
        };
        
        bot.sendMessage(chatId, profileMsg, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    else if (data === 'menu_riwayat') {
        // Riwayat/History Menu
        const history = await getUserHistory(userId, 5);
        
        let historyMsg = `📜 *RIWAYAT TRANSAKSI*\n\n`;
        
        if (history.length === 0) {
            historyMsg += `Belum ada transaksi.`;
        } else {
            history.forEach((item, index) => {
                historyMsg += `*${index + 1}.* ${item.type === 'netflix' ? 'Netflix' : item.type}\n`;
                historyMsg += `📧 ${item.email || 'N/A'}\n`;
                if (item.password) {
                    historyMsg += `🔑 ${item.password}\n`;
                }
                const timestamp = item.created_at || item.timestamp;
                historyMsg += `📅 ${new Date(timestamp).toLocaleString('id-ID')}\n\n`;
            });
            
            if (history.length >= 5) {
                historyMsg += `_Menampilkan 5 transaksi terakhir_`;
            }
        }
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔙 Kembali', callback_data: 'back_main' }
                ]
            ]
        };
        
        bot.sendMessage(chatId, historyMsg, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    else if (data === 'menu_redeem') {
        // Redeem Menu
        userStates.set(userId, { mode: 'redeem', step: 1 });
        bot.sendMessage(chatId,
            `🎁 *REDEEM KODE*\n\n` +
            `Kirim kode redeem kamu untuk claim kredit gratis!\n\n` +
            `Format: KODE-RAHASIA-123`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'menu_topup') {
        // Topup Menu
        const topupMsg = `
💳 *TOPUP KREDIT*

📋 *Harga:*
• 5 Kredit = Rp 10.000
• 10 Kredit = Rp 18.000 _(Hemat 10%)_
• 20 Kredit = Rp 32.000 _(Hemat 20%)_

💰 Saldo kamu: *${userData.credit} kredit*

📞 *Cara Topup:*
1. Hubungi admin untuk topup
2. Pilih paket yang kamu mau
3. Transfer sesuai nominal
4. Kirim bukti transfer ke admin
5. Kredit otomatis masuk!

👤 Contact Admin: @YourAdminUsername
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📞 Contact Admin', url: 'https://t.me/YourAdminUsername' }
                ],
                [
                    { text: '🔙 Kembali', callback_data: 'back_main' }
                ]
            ]
        };
        
        bot.sendMessage(chatId, topupMsg, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    else if (data === 'menu_bantuan') {
        // Bantuan/Help Menu
        const helpMsg = `
❓ *BANTUAN*

🔹 *Cara Pakai Bot:*
1. Klik "Fitur" di menu utama
2. Pilih "Generate Netflix"
3. Tunggu 2-3 menit
4. Dapat email + password + link

🔹 *Sistem Kredit:*
• New user dapat 2 kredit gratis
• 1 Generate Netflix = 1 Kredit
• Topup via admin untuk kredit tambahan

🔹 *Redeem Kode:*
• Klik "Redeem" di menu utama
• Kirim kode redeem
• Kredit otomatis masuk

🔹 *FAQ:*
Q: Berapa lama proses generate?
A: 2-3 menit per email

Q: Apakah bisa gagal?
A: Bisa, tapi kredit tidak dikurangi jika gagal

Q: Email valid berapa lama?
A: 30 hari (promo Netflix)

📞 Butuh bantuan? Contact admin!
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔙 Kembali', callback_data: 'back_main' }
                ]
            ]
        };
        
        bot.sendMessage(chatId, helpMsg, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    else if (data === 'back_main') {
        // Back to main menu
        const welcomeMsg = `
👋 *Selamat datang di RECONIX Bot*

🆔 Telegram: \`${userId}\`
🔗 Akun Web: \`${username}\` ✅
💰 Saldo: *${userData.credit} kredit*

Pilih menu di bawah untuk mulai 👇
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎬 Fitur', callback_data: 'menu_fitur' }
                ],
                [
                    { text: '👤 Profile', callback_data: 'menu_profile' },
                    { text: '📜 Riwayat', callback_data: 'menu_riwayat' }
                ],
                [
                    { text: '🎁 Redeem', callback_data: 'menu_redeem' },
                    { text: '💳 Topup', callback_data: 'menu_topup' }
                ],
                [
                    { text: '❓ Bantuan', callback_data: 'menu_bantuan' }
                ]
            ]
        };
        
        bot.sendMessage(chatId, welcomeMsg, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
});

// ===== MESSAGE HANDLER untuk Multi-Step Process & Redeem =====
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const text = msg.text;
    
    // Skip command messages
    if (!text || text.startsWith('/')) return;
    
    // Check user state
    const userState = userStates.get(userId);
    if (!userState) return;
    
    const { mode, step, data } = userState;
    
    // MODE 1: MANUAL EMAIL
    if (mode === 'manual' && step === 1) {
        const email = text.trim();
        
        if (!email.includes('@') || !email.includes('.')) {
            bot.sendMessage(chatId, '❌ Email tidak valid!');
            return;
        }
        
        bot.sendMessage(chatId, `📝 Processing: ${email}...`);
        
        try {
            const result = await processManualEmail(email);
            
            if (result.success) {
                bot.sendMessage(chatId,
                    `✅ *Berhasil!*\n\n` +
                    `Email ${email} disubmit ke Netflix!\n\n` +
                    `📬 Cek inbox untuk link verifikasi.`,
                    { parse_mode: 'Markdown' }
                );
                
                const logData = `[${new Date().toISOString()}] Manual (FREE) | User: ${username} (${userId}) | Email: ${email}\n`;
                await fs.appendFile('./telegram_bot_log.txt', logData);
            }
        } catch (error) {
            bot.sendMessage(chatId, `❌ Gagal: \`${error.message}\``, { parse_mode: 'Markdown' });
        }
        
        userStates.delete(userId);
    }
    
    // MODE: REDEEM
    else if (mode === 'redeem' && step === 1) {
        const code = text.trim().toUpperCase();
        
        const result = await redeemCode(userId, code);
        
        if (result.success) {
            const updatedUser = await getUser(userId, username);
            
            bot.sendMessage(chatId,
                `✅ *Redeem Berhasil!*\n\n` +
                `Kode: "${code}"\n` +
                `Bonus: +${result.creditValue} kredit\n\n` +
                `💰 Saldo baru: *${updatedUser.credit} kredit*\n\n` +
                `Selamat! 🎉`,
                { parse_mode: 'Markdown' }
            );
            
            const logData = `[${new Date().toISOString()}] Redeem | User: ${username} (${userId}) | Code: ${code} | Bonus: ${result.creditValue}\n`;
            await fs.appendFile('./telegram_bot_log.txt', logData);
        } else {
            bot.sendMessage(chatId,
                `❌ *${result.message}*\n\n` +
                `Kode: "${code}"`,
                { parse_mode: 'Markdown' }
            );
        }
        
        userStates.delete(userId);
    }
    
    // MODE 4: MASS EMAIL MANUAL
    else if (mode === 'mass_manual' && step === 1) {
        const emails = text.trim().split('\n').map(e => e.trim()).filter(e => e);
        
        if (emails.length === 0) {
            bot.sendMessage(chatId, '❌ Tidak ada email valid!');
            return;
        }
        
        if (emails.length > 10) {
            bot.sendMessage(chatId, `❌ Maksimal 10 emails! (Anda kirim ${emails.length})`);
            return;
        }
        
        bot.sendMessage(chatId,
            `📋 Processing ${emails.length} emails...\n\nMohon tunggu...`,
            { parse_mode: 'Markdown' }
        );
        
        let successCount = 0;
        let failCount = 0;
        const results = [];
        
        for (let i = 0; i < emails.length; i++) {
            const email = emails[i];
            
            try {
                bot.sendMessage(chatId, `[${i + 1}/${emails.length}] ${email}...`);
                
                const result = await processManualEmail(email);
                
                if (result.success) {
                    successCount++;
                    results.push(`✅ ${email}`);
                } else {
                    failCount++;
                    results.push(`❌ ${email}`);
                }
            } catch (error) {
                failCount++;
                results.push(`❌ ${email}`);
            }
        }
        
        const summaryMsg = `
📊 *Summary*

Total: ${emails.length}
✅ Success: ${successCount}
❌ Failed: ${failCount}

*Results:*
${results.join('\n')}

Cek inbox untuk link verifikasi! 📬
        `;
        
        bot.sendMessage(chatId, summaryMsg, { parse_mode: 'Markdown' });
        
        const logData = `[${new Date().toISOString()}] Mass Manual (FREE) | User: ${username} (${userId}) | Total: ${emails.length} | Success: ${successCount}\n`;
        await fs.appendFile('./telegram_bot_log.txt', logData);
        
        userStates.delete(userId);
    }
    
    // MODE 5: MASS EMAIL GENERATOR
    else if (mode === 'mass_gen' && step === 1) {
        const count = parseInt(text.trim());
        
        if (isNaN(count) || count < 1 || count > 10) {
            bot.sendMessage(chatId, '❌ Angka harus 1-10!');
            return;
        }
        
        bot.sendMessage(chatId,
            `⚡ Generating ${count} emails...\n\nEstimasi: ${count * 1}-${count * 2} menit`,
            { parse_mode: 'Markdown' }
        );
        
        let successCount = 0;
        const results = [];
        
        for (let i = 0; i < count; i++) {
            try {
                bot.sendMessage(chatId, `[${i + 1}/${count}] Generating...`);
                
                const result = await generateMailTmOnly();
                
                if (result.success) {
                    successCount++;
                    results.push(`✅ ${result.email}|${DEFAULT_PASSWORD}`);
                }
            } catch (error) {
                results.push(`❌ Failed`);
            }
        }
        
        const summaryMsg = `
📊 *Summary*

Total: ${count}
✅ Success: ${successCount}

*Results:*
\`\`\`
${results.join('\n')}
\`\`\`

Password: \`${DEFAULT_PASSWORD}\`
Format: email|password

Cek inbox untuk verifikasi! 📬
        `;
        
        bot.sendMessage(chatId, summaryMsg, { parse_mode: 'Markdown' });
        
        const logData = `[${new Date().toISOString()}] Mass Gen (FREE) | User: ${username} (${userId}) | Total: ${count} | Success: ${successCount}\n`;
        await fs.appendFile('./telegram_bot_log.txt', logData);
        
        userStates.delete(userId);
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

console.log('🤖 Netflix Email Generator Bot started!');
console.log('Bot Token:', BOT_TOKEN.substring(0, 20) + '...');
console.log('');
console.log('✅ Bot is running...');
console.log('📝 Commands:');
console.log('   /start - Welcome message');
console.log('   /generate - Generate Netflix email (1x per user)');
console.log('   /status - Check trial status');
console.log('   /help - Help guide');
console.log('   /reset <user_id> - Reset user trial (admin only)');
console.log('   /stats - Bot statistics (admin only)');
console.log('');
console.log('⚙️  Features:');
console.log('   • Full netflix-mass-bot.js logic integration');
console.log('   • Auto-retry unlimited (max 20 attempts)');
console.log('   • Mail.TM auto-verify');
console.log('   • Cookies 30 days promo');
console.log('   • Results saved to telegram_bot_results.txt');
console.log('');
