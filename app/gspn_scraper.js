const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const GSPN_URL = 'https://gspn2.samsungcsportal.com';
const USER_DATA_DIR = path.join(__dirname, '.gspn_auth');
const DOWNLOAD_DIR = path.join('C:\\Users\\unicom\\KERJAAN\\Dashboard_BUJM\\data\\downloads');

// Bantuan: Fungsi untuk mencari dan klik elemen berdasarkan teks di semua frame
async function clickElementByText(page, text) {
    console.log(`Mencari teks: "${text}"...`);
    for (const frame of page.frames()) {
        try {
            // Gunakan XPath untuk mencari elemen yang mengandung teks tersebut
            const elements = await frame.$x(`//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${text.toLowerCase()}')]`);
            for (let el of elements) {
                // Cek apakah elemen terlihat
                const isVisible = await frame.evaluate(e => {
                    const style = window.getComputedStyle(e);
                    return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && e.offsetHeight > 0;
                }, el);
                
                if (isVisible) {
                    console.log(`-> Ditemukan & diklik: "${text}" (Frame URL: ${frame.url()})`);
                    await el.click();
                    return true;
                }
            }
        } catch (e) {
            // Abaikan error frame security cross-origin
        }
    }
    console.log(`❌ Teks "${text}" TIDAK DITEMUKAN.`);
    return false;
}

// Bantuan: Fungsi untuk mencari input terdekat setelah teks label tertentu
async function fillInputNextToLabel(page, labelText, valueToFill) {
    console.log(`Mengisi form "${labelText}" dengan "${valueToFill}"...`);
    for (const frame of page.frames()) {
        try {
            // Cari label, lalu cari input type text terdekat di sekitarnya (biasanya di td atau elemen berikutnya)
            const inputs = await frame.$x(`//*[contains(text(), '${labelText}')]/ancestor-or-self::*[position() <= 2]//input[@type='text'] | //*[contains(text(), '${labelText}')]/following::input[@type='text'][1]`);
            for (let el of inputs) {
                const isVisible = await frame.evaluate(e => e.offsetHeight > 0, el);
                if (isVisible) {
                    await el.click({clickCount: 3}); // Select all text
                    await el.type(valueToFill);
                    console.log(`-> Berhasil mengisi "${valueToFill}" pada label "${labelText}"`);
                    return true;
                }
            }
        } catch (e) {}
    }
    console.log(`❌ Input untuk "${labelText}" TIDAK DITEMUKAN.`);
    return false;
}

async function selectDropdownNextToLabel(page, labelText, optionText) {
    console.log(`Memilih opsi "${optionText}" pada dropdown "${labelText}"...`);
    for (const frame of page.frames()) {
        try {
            // Cari tag <select> terdekat
            const selects = await frame.$x(`//*[contains(text(), '${labelText}')]/ancestor-or-self::*[position() <= 2]//select | //*[contains(text(), '${labelText}')]/following::select[1]`);
            for (let el of selects) {
                const isVisible = await frame.evaluate(e => e.offsetHeight > 0, el);
                if (isVisible) {
                    // Cari value dari option yang teksnya cocok
                    const optionValue = await frame.evaluate((select, text) => {
                        for(let opt of select.options) {
                            if(opt.text.toLowerCase().includes(text.toLowerCase())) return opt.value;
                        }
                        return null;
                    }, el, optionText);
                    
                    if (optionValue !== null) {
                        await el.select(optionValue);
                        console.log(`-> Berhasil memilih "${optionText}" pada label "${labelText}"`);
                        return true;
                    }
                }
            }
        } catch (e) {}
    }
    console.log(`❌ Dropdown untuk "${labelText}" TIDAK DITEMUKAN.`);
    return false;
}

async function run() {
    console.log('🤖 Menginisiasi Robot GSPN AUTO-DOWNLOADER...');
    if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        userDataDir: USER_DATA_DIR,
        defaultViewport: null,
        args: [
            '--start-maximized', 
            '--disable-web-security', 
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = (await browser.pages())[0];

    console.log(`🌐 Membuka GSPN: ${GSPN_URL}`);
    await page.goto(GSPN_URL, { waitUntil: 'networkidle2' });
    
    console.log('⏳ Menunggu 10 detik untuk memuat semua frame...');
    await page.waitForTimeout(10000);

    console.log('🔍 Menganalisa semua frame di halaman...');
    let frameDump = '';
    for (const frame of page.frames()) {
        try {
            const url = frame.url();
            const text = await frame.content(); // Ambil HTML mentah saja agar tidak crash
            frameDump += `\n\n=== FRAME URL: ${url} ===\n${text.substring(0, 5000)}\n=========================`;
        } catch(e) {
            console.log(`Gagal membaca frame ${frame.url()}: ${e.message}`);
        }
    }
    
    fs.writeFileSync(path.join(__dirname, 'gspn_frame_dump.txt'), frameDump);
    console.log('✅ Berhasil menyalin isi layar GSPN ke gspn_frame_dump.txt');
    await browser.close();
}

run().catch(console.error);
