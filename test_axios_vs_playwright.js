// Test: Axios vs Playwright untuk Netflix
const axios = require('axios');
const { chromium } = require('playwright');

async function testAxios() {
    console.log('\n=== TEST AXIOS ===\n');
    try {
        const response = await axios.get('https://www.netflix.com/clearcookies', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        console.log('Status:', response.status);
        console.log('Content Length:', response.data.length);
        console.log('Content Preview:', response.data.substring(0, 500));
        
        // Cek apakah ada promo banner
        const hasPromoBanner = response.data.includes('data-uia="free-trial-banner-text"');
        console.log('Has Promo Banner:', hasPromoBanner);
        
        if (!hasPromoBanner) {
            console.log('\n❌ AXIOS GAGAL: Tidak bisa detect promo banner');
            console.log('Alasan: HTML yang di-return hanya skeleton, butuh JavaScript untuk render konten');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function testPlaywright() {
    console.log('\n=== TEST PLAYWRIGHT ===\n');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://www.netflix.com/clearcookies', { 
            waitUntil: 'domcontentloaded' 
        });
        
        await page.waitForTimeout(3000);
        
        const content = await page.content();
        console.log('Content Length:', content.length);
        
        // Cek promo banner
        try {
            const banner = await page.locator('[data-uia="free-trial-banner-text"]').textContent({ timeout: 5000 });
            console.log('✅ PLAYWRIGHT BERHASIL: Banner ditemukan');
            console.log('Banner Text:', banner);
        } catch (e) {
            console.log('Banner tidak ditemukan (mungkin tidak ada promo)');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   TEST: AXIOS vs PLAYWRIGHT untuk NETFLIX    ║');
    console.log('╚═══════════════════════════════════════════════╝');
    
    await testAxios();
    await testPlaywright();
    
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   KESIMPULAN:                                 ║');
    console.log('║   - Axios: Hanya dapat HTML skeleton          ║');
    console.log('║   - Playwright: Dapat render full content     ║');
    console.log('║                                               ║');
    console.log('║   Netflix WAJIB pakai browser automation!     ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
}

main().catch(console.error);
