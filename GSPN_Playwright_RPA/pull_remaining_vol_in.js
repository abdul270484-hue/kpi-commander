const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');
const config = require('./config');

const delay = ms => new Promise(res => setTimeout(res, ms));

const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

const TARGET_MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10'];
const OUTPUT_DIR = path.join(__dirname, 'temp_vol_in');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function getMonthChunks(yearMonth, currentDateStr = '13.10.2026') {
    const [yearStr, mStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10);
    const pad = n => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();

    if (yearMonth === '2026-10') {
        const todayDay = parseInt(currentDateStr.split('.')[0], 10);
        if (todayDay <= 15) {
            return [{ from: '01.10.2026', to: currentDateStr, label: `01-${todayDay}` }];
        } else if (todayDay <= 30) {
            return [
                { from: '01.10.2026', to: '15.10.2026', label: '01-15' },
                { from: '16.10.2026', to: currentDateStr, label: `16-${todayDay}` }
            ];
        } else {
            return [
                { from: '01.10.2026', to: '15.10.2026', label: '01-15' },
                { from: '16.10.2026', to: '30.10.2026', label: '16-30' },
                { from: '31.10.2026', to: currentDateStr, label: '31-31' }
            ];
        }
    }

    if (lastDay === 31) {
        return [
            { from: `01.${pad(month)}.${year}`, to: `15.${pad(month)}.${year}`, label: '01-15' },
            { from: `16.${pad(month)}.${year}`, to: `30.${pad(month)}.${year}`, label: '16-30' },
            { from: `31.${pad(month)}.${year}`, to: `31.${pad(month)}.${year}`, label: '31-31' }
        ];
    } else {
        return [
            { from: `01.${pad(month)}.${year}`, to: `15.${pad(month)}.${year}`, label: '01-15' },
            { from: `16.${pad(month)}.${year}`, to: `${pad(lastDay)}.${pad(month)}.${year}`, label: `16-${lastDay}` }
        ];
    }
}

async function scrapeVolInMonth(mainPage, branch, monthStr) {
    const chunks = getMonthChunks(monthStr);
    const downloadedFiles = [];

    for (const chunk of chunks) {
        const chunkFile = path.join(OUTPUT_DIR, `VOL_IN_${branch.short}_${branch.code}_${monthStr}_${chunk.label}.xls`);
        // Check legacy naming without code as well
        const legacyChunkFile = path.join(OUTPUT_DIR, `VOL_IN_${branch.short}_${monthStr}_${chunk.label}.xls`);

        if (fs.existsSync(chunkFile) && fs.statSync(chunkFile).size >= 50) {
            process.stdout.write(`[CACHE] `);
            downloadedFiles.push(chunkFile);
            continue;
        }
        if (fs.existsSync(legacyChunkFile) && fs.statSync(legacyChunkFile).size >= 50) {
            process.stdout.write(`[CACHE] `);
            downloadedFiles.push(legacyChunkFile);
            continue;
        }

        process.stdout.write(`[DL ${chunk.label}] `);
        let p2 = null;
        try {
            await mainPage.bringToFront();
            const menuFrame = mainPage.frameLocator('frame[name="menu"]');
            const businessBtn = menuFrame.getByText('Business').first();

            const popupPromise = mainPage.waitForEvent('popup', { timeout: 35000 });
            await businessBtn.click();
            p2 = await popupPromise;
            p2.on('dialog', async d => await d.accept().catch(() => {}));
            await delay(1200);

            await p2.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 15000 });
            const leftMenus = p2.frameLocator('iframe[name="leftMenus"]');
            const b2bScroll = leftMenus.frameLocator('iframe[name="b2BLeftMenuScroll"]');

            await b2bScroll.getByRole('cell', { name: 'Service Tracking' }).first().click({ timeout: 5000 });
            await b2bScroll.getByRole('cell', { name: 'Service Order Excel Download', exact: true }).first().click({ timeout: 5000 });

            let rightFrame = null;
            for (let attempt = 0; attempt < 20; attempt++) {
                rightFrame = p2.frames().find(f => f.name() === 'rightContents');
                if (rightFrame) {
                    try {
                        const ready = await rightFrame.evaluate(() => !!document.querySelector('#asc_code'));
                        if (ready) break;
                    } catch (_) {}
                }
                await delay(800);
            }

            if (!rightFrame) throw new Error('rightContents not ready');

            // 1. Pilih Branch
            await rightFrame.evaluate((bCode) => {
                const sel = document.querySelector('#asc_code');
                if (sel) {
                    for (let i = 0; i < sel.options.length; i++) {
                        if (sel.options[i].value === bCode || sel.options[i].text.includes(bCode)) {
                            sel.selectedIndex = i;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                            break;
                        }
                    }
                }
            }, branch.code);
            await delay(500);

            // 2. Klik tab Bulk Search
            await rightFrame.evaluate(() => {
                const td2 = document.querySelector('#td2_02');
                if (td2) td2.click();
            });
            await delay(500);

            // 3. Set Date
            await rightFrame.evaluate(({ from, to }) => {
                const f1 = document.querySelector('#req_date_from1');
                const t1 = document.querySelector('#req_date_to1');
                if (f1) { f1.value = from; f1.dispatchEvent(new Event('change', { bubbles: true })); }
                if (t1) { t1.value = to; t1.dispatchEvent(new Event('change', { bubbles: true })); }

                const fH = document.querySelector('#req_date_from');
                const tH = document.querySelector('#req_date_to');
                if (fH) fH.value = from;
                if (tH) tH.value = to;

                const s1 = document.querySelector('#status1');
                if (s1) { s1.selectedIndex = 0; s1.dispatchEvent(new Event('change', { bubbles: true })); }
                const s2 = document.querySelector('#status2');
                if (s2) { s2.selectedIndex = 0; s2.dispatchEvent(new Event('change', { bubbles: true })); }
            }, { from: chunk.from, to: chunk.to });
            await delay(400);

            // 4. Download
            const dlPromise = p2.waitForEvent('download', { timeout: 35000 });
            await rightFrame.evaluate(() => {
                if (typeof displaySearch === 'function') displaySearch();
            });

            const dl = await dlPromise;
            await dl.saveAs(chunkFile);
            downloadedFiles.push(chunkFile);

        } catch (errChunk) {
            process.stdout.write(`[ERR: ${errChunk.message.substring(0, 25)}] `);
        } finally {
            if (p2 && !p2.isClosed()) await p2.close().catch(() => {});
        }
        await delay(500);
    }

    // Parse distinct SO
    const branchCounts = {};
    branchCounts[branch.short] = 0; // Default 0
    const seenSOs = new Set();

    for (const filePath of downloadedFiles) {
        try {
            const wb = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false, cellText: false });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            wb.Sheets = null;

            for (const r of rows) {
                const soNo = r['Service Order No.'] || r['ASC Job No'] || r['No'];
                if (!soNo) continue;
                const soKey = String(soNo).trim();
                if (seenSOs.has(soKey)) continue;
                seenSOs.add(soKey);

                branchCounts[branch.short] = (branchCounts[branch.short] || 0) + 1;
            }
        } catch (parseErr) {
            // Ignore parse error on empty/HTML chunk
        }
    }

    return branchCounts;
}

async function saveBranchProgressToFirestore(branchResults) {
    try {
        const prodDocRef = doc(db, 'dashboard_data', 'latest_prod');
        const updatePayload = {};
        for (const m of TARGET_MONTHS) {
            if (branchResults[m]) {
                for (const [bName, count] of Object.entries(branchResults[m])) {
                    updatePayload[`volInTrendData.${m}.${bName}`] = count;
                }
            }
        }
        updatePayload.volInLastUpdated = new Date().toISOString();
        await updateDoc(prodDocRef, updatePayload);
    } catch (e) {
        console.warn('   [WARN] Gagal update progress ke Firestore:', e.message);
    }
}

async function main() {
    console.log('\n====================================================');
    console.log('  MEMULAI TARIKAN SISA CABANG VOL IN KE FIRESTORE');
    console.log('====================================================\n');

    // 1. Update branches yang sudah ada filenya (CURUP, KOTA, METRO)
    console.log('1. Memperbarui data statis CURUP, KOTA, METRO ke Firestore...');
    const staticResults = {
        'CURUP': { '2026-07': { 'CURUP': 5 }, '2026-08': { 'CURUP': 3 }, '2026-09': { 'CURUP': 0 }, '2026-10': { 'CURUP': 0 } },
        'KOTA': { '2026-07': { 'KOTA': 5 }, '2026-08': { 'KOTA': 4 }, '2026-09': { 'KOTA': 4 }, '2026-10': { 'KOTA': 0 } },
        'METRO': { '2026-07': { 'METRO': 3 }, '2026-08': { 'METRO': 5 }, '2026-09': { 'METRO': 0 }, '2026-10': { 'METRO': 0 } }
    };
    for (const b of Object.keys(staticResults)) {
        await saveBranchProgressToFirestore(staticResults[b]);
        console.log(`   [SAVED] ${b} tersimpan di Firestore.`);
    }

    // 2. Daftar sisa cabang yang perlu ditarik
    const REMAINING_TARGETS = [
        { code: '0004411730', short: 'PANGKAL PINANG', name: 'CV. HARIS UTAMA MANDIRI' },
        { code: '0004411726', short: 'PONTIANAK', name: 'PT. DINAMIKA ARTHA PRIMA UTAMA' },
        { code: '0001923454', short: 'SAMPIT', name: 'PT. DIAN KENCANA SEJAHTERA' },
        { code: '0005182120', short: 'SDS', name: 'PT. SMART DIGITAL SOLUTION' },
        { code: '0004925239', short: 'SERPONG', name: 'PT. MANDIRI ABADI TEKNOLOGI (KARAWACI)' },
        { code: '0004925238', short: 'SERPONG', name: 'PT. MANDIRI ABADI TEKNOLOGI (ITC BSD)' },
        { code: '0004924700', short: 'SIDOARJO', name: 'PT. MULTI SARANA TEKNIK' },
        { code: '0004925218', short: 'SORONG', name: 'PT. INTI MEGA PRIMA' },
        { code: '0004411727', short: 'SAMARINDA', name: 'PT. DIAN KENCANA SEJAHTERA' },
        { code: '0005310660', short: 'SINGKAWANG', name: 'PT. DINAMIKA ARTHA PRIMA UTAMA' },
        { code: '0005195827', short: 'TANJUNG', name: 'PT. HARIS UTAMA MANDIRI' },
        { code: '0004411731', short: 'TANJUNG', name: 'PT. HARIS UTAMA MANDIRI (PINANG)' },
        { code: '0004924770', short: 'TERNATE', name: 'PT. INTI MEGA PRIMA' },
        { code: '0004924774', short: 'TIMIKA', name: 'PT. INTI MEGA PRIMA' }
    ];

    if (!fs.existsSync(config.STORAGE_STATE_PATH)) {
        console.error('ERROR: storageState.json tidak ditemukan!');
        process.exit(1);
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--no-default-browser-check']
    });

    try {
        const context = await browser.newContext({
            storageState: config.STORAGE_STATE_PATH,
            viewport: { width: 1440, height: 900 },
            acceptDownloads: true
        });

        let mainPage = await context.newPage();
        mainPage.on('dialog', async d => await d.accept().catch(() => {}));

        console.log('\n2. Membuka portal GSPN...');
        await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2500);

        for (let i = 0; i < REMAINING_TARGETS.length; i++) {
            const branch = REMAINING_TARGETS[i];
            console.log(`\n----------------------------------------------------`);
            console.log(`[${i + 1}/${REMAINING_TARGETS.length}] ${branch.short} (${branch.code})`);
            console.log(`----------------------------------------------------`);

            // Pastikan mainPage aktif
            if (mainPage.isClosed()) {
                mainPage = await context.newPage();
                mainPage.on('dialog', async d => await d.accept().catch(() => {}));
                await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
                await delay(2000);
            }

            const branchResults = {
                '2026-07': {},
                '2026-08': {},
                '2026-09': {},
                '2026-10': {}
            };

            for (const monthStr of TARGET_MONTHS) {
                process.stdout.write(`   ${monthStr}: `);
                const counts = await scrapeVolInMonth(mainPage, branch, monthStr);
                branchResults[monthStr] = counts;
                console.log(`=>`, counts);
            }

            // Simpan setiap cabang selesai ke Firestore langsung
            await saveBranchProgressToFirestore(branchResults);
            console.log(`   [SAVED] Progress ${branch.short} (${branch.code}) berhasil disimpan ke Firestore!`);
        }

        console.log('\n====================================================');
        console.log('  🎉 SEMUA SISA CABANG SELESAI DITARIK DAN TERSIMPAN!');
        console.log('====================================================');

    } catch (e) {
        console.error('Fatal Scrape Error:', e);
    } finally {
        await browser.close().catch(() => {});
        console.log('\n=== SELESAI ===');
    }
}

main();
