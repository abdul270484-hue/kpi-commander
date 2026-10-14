const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const config = require('./config');

const delay = ms => new Promise(res => setTimeout(res, ms));

const SAMPLE_BRANCHES = [
    { code: '0004924441', short: 'DENPASAR', name: 'UNICOM DENPASAR' },
    { code: '0004924922', short: 'MAKASSAR', name: 'UNICOM MAKASSAR' }
];

const OUTPUT_DIR = path.join(__dirname, 'temp_vol_in');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function runVolInSample() {
    console.log('====================================================');
    console.log('  PILOT TEST: PENARIKAN VOL IN GSPN');
    console.log('  Cabang Target : DENPASAR & MAKASSAR');
    console.log('  Rentang Waktu : 01.10.2026 s/d 12.10.2026');
    console.log('====================================================\n');

    if (!fs.existsSync(config.STORAGE_STATE_PATH)) {
        console.error('ERROR: storageState.json tidak ditemukan!');
        process.exit(1);
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--no-default-browser-check']
    });

    const downloadedResults = [];

    try {
        const context = await browser.newContext({
            storageState: config.STORAGE_STATE_PATH,
            viewport: { width: 1440, height: 900 },
            acceptDownloads: true
        });

        const mainPage = await context.newPage();
        mainPage.on('dialog', async d => await d.accept().catch(() => {}));

        console.log('1. Membuka portal GSPN...');
        await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2500);

        const menuFrame = mainPage.frameLocator('frame[name="menu"]');
        const businessBtn = menuFrame.getByText('Business').first();
        await businessBtn.waitFor({ state: 'visible', timeout: 30000 });

        for (let i = 0; i < SAMPLE_BRANCHES.length; i++) {
            const branch = SAMPLE_BRANCHES[i];
            console.log(`\n----------------------------------------------------`);
            console.log(`[${i + 1}/${SAMPLE_BRANCHES.length}] Memproses Cabang: ${branch.short} (${branch.code})`);
            console.log(`----------------------------------------------------`);

            await mainPage.bringToFront();
            const popupPromise = mainPage.waitForEvent('popup', { timeout: 30000 });
            await businessBtn.click();
            const p2 = await popupPromise;
            p2.on('dialog', async d => await d.accept().catch(() => {}));
            await delay(2000);

            try {
                // Navigasi menu kiri: Service Tracking -> Service Order Excel Download
                await p2.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 15000 });
                const leftMenus = p2.frameLocator('iframe[name="leftMenus"]');
                const b2bScroll = leftMenus.frameLocator('iframe[name="b2BLeftMenuScroll"]');

                await b2bScroll.getByRole('cell', { name: 'Service Tracking' }).first().click({ timeout: 5000 });
                await b2bScroll.getByRole('cell', { name: 'Service Order Excel Download', exact: true }).first().click({ timeout: 5000 });

                // Tunggu rightContents frame
                let rightFrame = null;
                for (let attempt = 0; attempt < 20; attempt++) {
                    rightFrame = p2.frames().find(f => f.name() === 'rightContents');
                    if (rightFrame) {
                        try {
                            const ready = await rightFrame.evaluate(() => !!document.querySelector('#asc_code'));
                            if (ready) break;
                        } catch (_) {}
                    }
                    await delay(1000);
                }

                if (!rightFrame) throw new Error('rightContents frame tidak ditemukan');

                // 1. Pilih Ship to Branch
                console.log(`  -> Memilih Ship to Branch: ${branch.code}...`);
                await rightFrame.evaluate((bCode) => {
                    const sel = document.querySelector('#asc_code');
                    if (sel) {
                        for (let optIdx = 0; optIdx < sel.options.length; optIdx++) {
                            if (sel.options[optIdx].value === bCode || sel.options[optIdx].text.includes(bCode)) {
                                sel.selectedIndex = optIdx;
                                sel.dispatchEvent(new Event('change', { bubbles: true }));
                                break;
                            }
                        }
                    }
                }, branch.code);
                await delay(1000);

                // 2. Klik tab Bulk Search (All Data)
                console.log('  -> Mengaktifkan tab "Bulk Search (All Data)"...');
                const tabActivated = await rightFrame.evaluate(() => {
                    // Cari elemen tab td2_02 atau yang memiliki teks Bulk Search
                    const td2 = document.querySelector('#td2_02');
                    if (td2) {
                        td2.click();
                        return 'td2_02_clicked';
                    }
                    const allTabs = Array.from(document.querySelectorAll('td, a, span, div'));
                    const bulkTab = allTabs.find(el => el.innerText && el.innerText.trim() === 'Bulk Search (All Data)');
                    if (bulkTab) {
                        bulkTab.click();
                        return 'bulkTab_clicked';
                    }
                    // Cek jika ada fungsi switch tab di window
                    if (typeof searchTab === 'function') {
                        searchTab(2);
                        return 'searchTab(2)_invoked';
                    }
                    return 'none';
                });
                console.log(`     Status klik tab: ${tabActivated}`);
                await delay(1000);

                // 3. Set Request Date: 01.10.2026 s/d 12.10.2026
                const dateFrom = '01.10.2026';
                const dateTo = '12.10.2026';
                console.log(`  -> Mengisi Request Date: ${dateFrom} ~ ${dateTo}...`);

                await rightFrame.evaluate(({ from, to }) => {
                    // Set req_date_from1 dan req_date_to1
                    const f1 = document.querySelector('#req_date_from1');
                    const t1 = document.querySelector('#req_date_to1');
                    if (f1) { f1.value = from; f1.dispatchEvent(new Event('change', { bubbles: true })); }
                    if (t1) { t1.value = to; t1.dispatchEvent(new Event('change', { bubbles: true })); }

                    // Set hidden inputs jika ada
                    const fH = document.querySelector('#req_date_from');
                    const tH = document.querySelector('#req_date_to');
                    if (fH) fH.value = from;
                    if (tH) tH.value = to;

                    // Pastikan filter Status dan Reason kosong / default
                    const s1 = document.querySelector('#status1');
                    if (s1) { s1.selectedIndex = 0; s1.dispatchEvent(new Event('change', { bubbles: true })); }
                    const s2 = document.querySelector('#status2');
                    if (s2) { s2.selectedIndex = 0; s2.dispatchEvent(new Event('change', { bubbles: true })); }
                }, { from: dateFrom, to: dateTo });
                await delay(800);

                // 4. Klik tombol Search dan tangkap download file
                console.log('  -> Mengeklik tombol Search dan menunggu unduhan Excel...');
                const downloadPromise = p2.waitForEvent('download', { timeout: 45000 });

                await rightFrame.evaluate(() => {
                    // Panggil fungsi displaySearch jika ada
                    if (typeof displaySearch === 'function') {
                        displaySearch();
                    } else {
                        // Cari tombol Search
                        const links = Array.from(document.querySelectorAll('a, button, input[type="button"]'));
                        const btn = links.find(el => {
                            const txt = (el.innerText || el.value || '').trim();
                            const href = el.getAttribute('href') || '';
                            return txt === 'Search' || href.includes('displaySearch');
                        });
                        if (btn) btn.click();
                    }
                });

                const download = await downloadPromise;
                const saveFilename = `VOL_IN_${branch.short}_OCT2026.xls`;
                const savePath = path.join(OUTPUT_DIR, saveFilename);
                await download.saveAs(savePath);

                console.log(`  [OK] File berhasil diunduh: ${saveFilename} (${fs.statSync(savePath).size} bytes)`);
                downloadedResults.push({ branch: branch.short, code: branch.code, file: savePath });

            } catch (errBranch) {
                console.error(`  [FAIL] Gagal memproses ${branch.short}:`, errBranch.message);
            } finally {
                if (p2 && !p2.isClosed()) await p2.close().catch(() => {});
            }

            await delay(1500);
        }

        // 5. Analisis Hasil Unduhan
        console.log('\n====================================================');
        console.log('  ANALISIS HASIL UNDUHAN VOL IN');
        console.log('====================================================');

        for (const res of downloadedResults) {
            console.log(`\nCabang: ${res.branch} (${res.code})`);
            console.log(`Path  : ${res.file}`);
            
            try {
                const content = fs.readFileSync(res.file, 'utf8');
                // Hitung baris table
                const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
                console.log(`Total <tr> tags: ${rows.length}`);

                // Coba parse dengan xlsx
                const workbook = XLSX.readFile(res.file);
                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                console.log(`Total Data Rows parsed (XLSX): ${jsonData.length}`);
                if (jsonData.length > 0) {
                    console.log('Sample Kolom:', Object.keys(jsonData[0]).slice(0, 10));
                    console.log('Sample Baris 1:', jsonData[0]);
                    
                    // Hitung sebaran status jika ada kolom Status
                    const statusKey = Object.keys(jsonData[0]).find(k => k.toLowerCase().includes('status'));
                    if (statusKey) {
                        const statusCounts = {};
                        jsonData.forEach(row => {
                            const st = row[statusKey] || 'UNKNOWN';
                            statusCounts[st] = (statusCounts[st] || 0) + 1;
                        });
                        console.log('Sebaran Status Order:', statusCounts);
                    }
                }
            } catch (parseErr) {
                console.error('Gagal membaca isi file:', parseErr.message);
            }
        }

    } catch (errGlobal) {
        console.error('[GLOBAL ERROR]', errGlobal);
    } finally {
        await browser.close().catch(() => {});
        console.log('\n=== SELESAI ===');
    }
}

runVolInSample();
