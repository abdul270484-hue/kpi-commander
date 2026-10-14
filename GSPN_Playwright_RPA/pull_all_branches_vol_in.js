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

// Deduplikasi target cabang berdasarkan ASC code
const TARGET_BRANCHES = [];
const seenCodes = new Set();
config.ASC_CODES.forEach(b => {
    if (!seenCodes.has(b.code)) {
        seenCodes.add(b.code);
        TARGET_BRANCHES.push({
            code: b.code,
            short: b.short,
            name: b.name
        });
    }
});

// Prioritas area target (Kupang, Manado, Singaraja) diproses lebih dulu
const priority = ['KUPANG', 'MANADO', 'SINGARAJA'];
TARGET_BRANCHES.sort((a, b) => {
    const pA = priority.indexOf(a.short);
    const pB = priority.indexOf(b.short);
    if (pA !== -1 && pB !== -1) return pA - pB;
    if (pA !== -1) return -1;
    if (pB !== -1) return 1;
    return 0;
});

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

async function scrapeVolInMonth(mainPage, businessBtn, branch, monthStr) {
    const chunks = getMonthChunks(monthStr);
    const downloadedFiles = [];

    for (const chunk of chunks) {
        const chunkFile = path.join(OUTPUT_DIR, `VOL_IN_${branch.short}_${monthStr}_${chunk.label}.xls`);

        // Cek cache lokal
        if (fs.existsSync(chunkFile) && fs.statSync(chunkFile).size >= 50) {
            process.stdout.write(`[CACHE] `);
            downloadedFiles.push(chunkFile);
            continue;
        }

        process.stdout.write(`[DL ${chunk.label}] `);
        let p2 = null;
        try {
            await mainPage.bringToFront();
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

    // Parse distinct SO dengan optimasi memori
    const branchCounts = {};
    const seenSOs = new Set();

    for (const filePath of downloadedFiles) {
        try {
            const wb = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false, cellText: false });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            wb.Sheets = null;

            for (const r of rows) {
                const soNo = r['Service Order No.'] || r['ASC Job No'] || r['SO NO'] || r['No'];
                if (!soNo) continue;
                const soKey = String(soNo).trim();
                if (seenSOs.has(soKey)) continue;
                seenSOs.add(soKey);

                let finalBranch = branch.short;
                if (branch.short === 'DENPASAR') {
                    const cc = String(r['Collection Center Name'] || '').toUpperCase();
                    if (cc.includes('CELLULAR WORLD') || cc.includes('TEUKU')) {
                        finalBranch = 'DENPASAR - CELLULAR WORLD';
                    } else if (cc.includes('PLANET GADGET') || cc.includes('GATOT')) {
                        finalBranch = 'DENPASAR - PLANET GADGET';
                    } else {
                        finalBranch = 'DENPASAR';
                    }
                }

                branchCounts[finalBranch] = (branchCounts[finalBranch] || 0) + 1;
            }
        } catch (parseErr) {
            // Ignore parse error on corrupt/empty chunk
        }
    }

    return branchCounts;
}

async function saveBranchProgressToFirestore(branchResults) {
    try {
        const prodDocRef = doc(db, 'dashboard_data', 'latest_prod');
        // Update nested keys directly to avoid massive doc memory overhead
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
    console.log(`  MEMULAI TARIKAN VOL IN UNTUK SEMUA CABANG (${TARGET_BRANCHES.length} CABANG)`);
    console.log(`  Bulan: ${TARGET_MONTHS.join(', ')}`);
    console.log('====================================================\n');

    if (!fs.existsSync(config.STORAGE_STATE_PATH)) {
        console.error('ERROR: storageState.json tidak ditemukan!');
        process.exit(1);
    }

    // Ambil daftar yang sudah tersimpan di Firestore
    const prodDocRef = doc(db, 'dashboard_data', 'latest_prod');
    const snap = await getDoc(prodDocRef);
    const existingVolIn = snap.exists() ? (snap.data().volInTrendData || {}) : {};
    const existingOct = existingVolIn['2026-10'] || {};

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

        const mainPage = await context.newPage();
        mainPage.on('dialog', async d => await d.accept().catch(() => {}));

        console.log('1. Membuka portal GSPN...');
        await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2500);

        const menuFrame = mainPage.frameLocator('frame[name="menu"]');
        const businessBtn = menuFrame.getByText('Business').first();
        await businessBtn.waitFor({ state: 'visible', timeout: 30000 });

        for (let i = 0; i < TARGET_BRANCHES.length; i++) {
            const branch = TARGET_BRANCHES[i];
            console.log(`\n----------------------------------------------------`);
            console.log(`[${i + 1}/${TARGET_BRANCHES.length}] ${branch.short} (${branch.code})`);
            console.log(`----------------------------------------------------`);

            // Skip jika sudah ada di Firestore
            if (existingOct[branch.short] !== undefined || (branch.short === 'DENPASAR' && existingOct['DENPASAR'] !== undefined)) {
                console.log(`   [SKIP] Cabang ${branch.short} sudah ada di Firestore! Melanjutkan...`);
                continue;
            }

            const branchResults = {
                '2026-07': {},
                '2026-08': {},
                '2026-09': {},
                '2026-10': {}
            };

            for (const monthStr of TARGET_MONTHS) {
                process.stdout.write(`   ${monthStr}: `);
                const counts = await scrapeVolInMonth(mainPage, businessBtn, branch, monthStr);
                branchResults[monthStr] = counts;
                console.log(`=>`, counts);
            }

            // Simpan setiap cabang selesai ke Firestore langsung
            await saveBranchProgressToFirestore(branchResults);
            console.log(`   [SAVED] Progress ${branch.short} berhasil disimpan ke Firestore!`);
        }

        console.log('\n====================================================');
        console.log('  🎉 SEMUA CABANG SELESAI DITARIK DAN TERSIMPAN!');
        console.log('====================================================');

    } catch (e) {
        console.error('Fatal Scrape Error:', e);
    } finally {
        await browser.close().catch(() => {});
        console.log('\n=== SELESAI ===');
    }
}

main();
