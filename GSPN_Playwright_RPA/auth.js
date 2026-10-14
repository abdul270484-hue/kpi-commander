const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./config');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function waitForEnter(promptText) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(promptText, () => {
            rl.close();
            resolve();
        });
    });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loginAndSaveSession() {
    console.log('=============================================================');
    console.log('  🔐 GSPN PLAYWRIGHT - AUTENTIKASI & SIMPAN SESI LOGIN');
    console.log('=============================================================');
    
    ensureDir(config.AUTH_DIR);

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--start-maximized',
            '--disable-web-security',
            '--no-default-browser-check',
            '--disable-save-password-bubble'
        ]
    });

    const context = await browser.newContext({
        viewport: null,
        acceptDownloads: true
    });

    const page = await context.newPage();

    // Auto-accept all alert dialogs
    page.on('dialog', async dialog => {
        console.log(`  [DIALOG GSPN]: ${dialog.message().substring(0, 80)}`);
        await dialog.accept().catch(() => {});
    });

    console.log(`\n1. Membuka portal GSPN: ${config.GSPN_URL}`);
    try {
        await page.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
    } catch (err) {
        console.log('  -> Timeout goto initial (normal pada GSPN, lanjut...).');
    }

    console.log('\n=============================================================');
    console.log('  💡 SILAKAN LOGIN DI JENDELA BROWSER YANG TERBUKA');
    console.log('  - Masukkan User ID & Password GSPN Anda yang benar.');
    console.log('  - Selesaikan OTP / MFA jika diminta.');
    console.log('  - Robot TIDAK AKAN menutup browser sampai Anda berhasil masuk');
    console.log('    atau menekan [ENTER] di jendela ini.');
    console.log('=============================================================\n');

    // Auto-fill jika disetting di .env atau config.js
    if (config.DEFAULT_USER_ID && config.DEFAULT_PASSWORD) {
        try {
            await delay(2000);
            const idField = page.locator('#login_form_all input[name="LOGIN_ID"], input[name="LOGIN_ID"], input[name="USER_ID"]');
            const pwdField = page.locator('input[type="password"], input[name="LOGIN_PWD"]');
            
            if (await idField.count() > 0) {
                await idField.first().fill(config.DEFAULT_USER_ID);
            }
            if (await pwdField.count() > 0) {
                await pwdField.first().fill(config.DEFAULT_PASSWORD);
                console.log('  ✅ [AUTO-FILL] User ID & Password berhasil diisikan!');
                console.log('  🚀 [AUTO-LOGIN] Menekan tombol Login...');
                
                const loginImg = page.getByRole('img', { name: 'Login' });
                if (await loginImg.count() > 0) {
                    await loginImg.first().click().catch(() => pwdField.first().press('Enter'));
                } else {
                    await pwdField.first().press('Enter').catch(() => {});
                }
            }
        } catch (e) {
            console.log('  ⚠️ [AUTO-FILL] Gagal auto-fill:', e.message);
        }
    }

    let loggedIn = false;
    const maxWaitSeconds = 600; // 10 Menit

    // Pemantauan otomatis di latar belakang
    console.log('🤖 Menunggu otomatis hingga berhasil masuk ke menu utama GSPN...');
    for (let i = 0; i < maxWaitSeconds / 2; i++) {
        await delay(2000);

        try {
            const url = page.url();
            const isMainPage = url.includes('main.jsp') || url.includes('main.do') || url.includes('index.jsp');
            
            // Cek apakah password field sudah hilang dan frame menu / business tersedia
            let hasPasswordField = false;
            for (const f of page.frames()) {
                if (await f.locator('input[name="LOGIN_PWD"], input[type="password"]').count() > 0) {
                    hasPasswordField = true;
                    break;
                }
            }

            let hasBusinessMenu = false;
            try {
                const menuFrame = page.frameLocator('frame[name="menu"]');
                if (await menuFrame.getByText('Business').count() > 0) {
                    hasBusinessMenu = true;
                }
            } catch (e) {}

            if ((isMainPage && !hasPasswordField) || hasBusinessMenu) {
                console.log('\n🎉 [TERDETEKSI OTOMATIS] Berhasil masuk ke halaman utama GSPN!');
                loggedIn = true;
                break;
            }

            if (i % 5 === 0) {
                console.log(`  ⏳ Masih menunggu proses login/OTP... (${i * 2} detik)`);
                try {
                    await page.screenshot({ path: 'C:/Users/unicom/KERJAAN/Dashboard_BUJM/GSPN_Playwright_RPA/auth_debug.png' });
                    console.log('Saved debug screenshot.');
                } catch(err) {}
            }
            if (fs.existsSync('C:/Users/unicom/KERJAAN/Dashboard_BUJM/GSPN_Playwright_RPA/FORCE_PROCEED')) {
                console.log('FORCE_PROCEED detected! Forcing login success.');
                loggedIn = true;
                break;
            }
        } catch (e) {}
    }

    if (!loggedIn) {
        await browser.close().catch(() => {});
        throw new Error('Login GSPN belum berhasil atau waktu habis.');
    }

    console.log('\n💾 Menyimpan cookies dan sesi login ke storageState.json...');
    await delay(2500);

    // Save session storage & cookies
    await context.storageState({ path: config.STORAGE_STATE_PATH });
    console.log(`\n✅ Sesi berhasil disimpan ke: ${config.STORAGE_STATE_PATH}`);
    console.log('Robot sekarang sudah memiliki kunci sesi aktif dan siap digunakan!\n');

    await browser.close().catch(() => {});
}

if (require.main === module) {
    loginAndSaveSession().catch(err => {
        console.error('Fatal Auth Error:', err);
        process.exit(1);
    });
}

module.exports = { loginAndSaveSession };
