/**
 * VOL IN MTD Engine (Tarikan Tanggal 1 s/d Sekarang)
 * Mengambil data Service Order created (VOL IN) MTD sesuai rentang tgl 1 s/d hari ini:
 * - Jika tgl <= 15: 1 tarikan langsung dari 01.MM.YYYY s/d Hari ini (<= 15 hari sesuai batas GSPN)
 * - Jika tgl > 15 : Tarikan 01-15 (terkunci di cache/file) + Tarikan 16 s/d Hari ini
 * - Hasil diparse secara deduplikasi per Service Order No.
 * - Cabang Denpasar dipecah akurat (Denpasar, Cellular World, Planet Gadget)
 * - AMAN: Jika sebuah cabang gagal download/timeout, TIDAK AKAN di-reset ke 0 (mempertahankan data sebelumnya)
 */

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

// Prioritaskan cabang area target (Pak Abdul) di urutan depan
const priority = ['DENPASAR', 'KUPANG', 'MANADO', 'SINGARAJA'];
TARGET_BRANCHES.sort((a, b) => {
    const pA = priority.indexOf(a.short);
    const pB = priority.indexOf(b.short);
    if (pA !== -1 && pB !== -1) return pA - pB;
    if (pA !== -1) return -1;
    if (pB !== -1) return 1;
    return 0;
});

const OUTPUT_DIR = path.join(__dirname, 'temp_vol_in');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function getMtdConfig(refDate = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const year = refDate.getFullYear();
    const month = refDate.getMonth() + 1;
    const day = refDate.getDate();

    const yearMonth = `${year}-${pad(month)}`;
    const todayGspn = `${pad(day)}.${pad(month)}.${year}`;
    const firstDayGspn = `01.${pad(month)}.${year}`;
    const midDayGspn = `15.${pad(month)}.${year}`;
    const sixteenDayGspn = `16.${pad(month)}.${year}`;

    if (day <= 15) {
        return {
            yearMonth,
            todayDay: day,
            isSplit: false,
            activeRange: { from: firstDayGspn, to: todayGspn, label: `01-${day}` }
        };
    } else {
        return {
            yearMonth,
            todayDay: day,
            isSplit: true,
            chunk1: { from: firstDayGspn, to: midDayGspn, label: '01-15' },
            activeRange: { from: sixteenDayGspn, to: todayGspn, label: `16-${day}` }
        };
    }
}

function getDenpasarBranch(row) {
    const cc = String(row['Collection Center Name'] || '').toUpperCase();
    if (cc.includes('CELLULAR WORLD') || cc.includes('TEUKU')) {
        return 'DENPASAR - CELLULAR WORLD';
    }
    if (cc.includes('PLANET GADGET') || cc.includes('GATOT')) {
        return 'DENPASAR - PLANET GADGET';
    }
    return 'DENPASAR';
}

function parseExcelSos(filePath, branchShort, seenSet) {
    const counts = {};
    if (!fs.existsSync(filePath)) return counts;
    const stat = fs.statSync(filePath);
    if (stat.size < 200) return counts;

    try {
        const wb = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false, cellText: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        rows.forEach(r => {
            const so = r['Service Order No.'] || r['ASC Job No'] || r['No'];
            if (!so) return;
            const soStr = String(so).trim();
            if (seenSet.has(soStr)) return;
            seenSet.add(soStr);

            let targetBr = branchShort;
            if (branchShort === 'DENPASAR') {
                targetBr = getDenpasarBranch(r);
            }
            counts[targetBr] = (counts[targetBr] || 0) + 1;
        });
    } catch (e) {
        // Abaikan parse error jika file kosong
    }
    return counts;
}

async function runMtdVolInPull(slotName = 'MANUAL') {
    console.log('\n=============================================================');
    console.log(`  📊 [VOL_IN] SIKLUS MTD VOL IN (TGL 1 s/d HARI INI) (${slotName})`);
    console.log('=============================================================');

    const mtdCfg = getMtdConfig();
    const { yearMonth, activeRange, isSplit, chunk1 } = mtdCfg;

    console.log(`📅 Target Periode: ${yearMonth} (Rentang Aktif: ${activeRange.from} s/d ${activeRange.to})`);

    // 1. Ambil data Firestore saat ini sebagai fallback aman
    const prodDocRef = doc(db, 'dashboard_data', 'latest_prod');
    const snap = await getDoc(prodDocRef);
    const existingData = snap.exists() ? snap.data() : {};
    const existingVolIn = existingData.volInTrendData || {};
    const currentMonthVolIn = Object.assign({}, existingVolIn[yearMonth] || {});

    // Pastikan session GSPN tersedia
    if (!fs.existsSync(config.STORAGE_STATE_PATH)) {
        console.warn('⚠️ [WARN] storageState.json tidak ditemukan. Melewati siklus VOL IN.');
        return;
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--no-default-browser-check']
    });

    let mainPage = null;
    let p2 = null;

    try {
        const context = await browser.newContext({
            storageState: config.STORAGE_STATE_PATH,
            viewport: { width: 1440, height: 900 },
            acceptDownloads: true
        });

        mainPage = await context.newPage();
        mainPage.on('dialog', async d => await d.accept().catch(() => {}));

        console.log('1. Membuka GSPN Portal...');
        await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2000);

        const menuFrame = mainPage.frameLocator('frame[name="menu"]');
        const businessBtn = menuFrame.getByText('Business').first();
        await businessBtn.waitFor({ state: 'visible', timeout: 30000 });

        const popupPromise = mainPage.waitForEvent('popup', { timeout: 35000 });
        await businessBtn.click();
        p2 = await popupPromise;
        p2.on('dialog', async d => { await d.accept().catch(() => {}); });
        await p2.waitForLoadState('domcontentloaded').catch(() => {});
        await delay(1500);

        await p2.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 30000 });
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

        if (!rightFrame) throw new Error('rightContents frame tidak siap.');

        // Klik tab Bulk Search
        await rightFrame.evaluate(() => {
            const td2 = document.querySelector('#td2_02');
            if (td2) td2.click();
        });
        await delay(400);

        // Set Rentang Tanggal (01.{MM}.{YYYY} s/d Hari ini)
        await rightFrame.evaluate(({ fromDate, toDate }) => {
            const f1 = document.querySelector('#req_date_from1');
            const t1 = document.querySelector('#req_date_to1');
            if (f1) { f1.value = fromDate; f1.dispatchEvent(new Event('change', { bubbles: true })); }
            if (t1) { t1.value = toDate; t1.dispatchEvent(new Event('change', { bubbles: true })); }

            const fH = document.querySelector('#req_date_from');
            const tH = document.querySelector('#req_date_to');
            if (fH) fH.value = fromDate;
            if (tH) tH.value = toDate;

            const s1 = document.querySelector('#status1');
            if (s1) { s1.selectedIndex = 0; s1.dispatchEvent(new Event('change', { bubbles: true })); }
            const s2 = document.querySelector('#status2');
            if (s2) { s2.selectedIndex = 0; s2.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { fromDate: activeRange.from, toDate: activeRange.to });
        await delay(400);

        console.log(`2. Menarik data Bulk Search untuk ${TARGET_BRANCHES.length} Cabang...`);

        const updatedMtdCounts = Object.assign({}, currentMonthVolIn);
        let branchesUpdated = 0;

        for (let i = 0; i < TARGET_BRANCHES.length; i++) {
            const branch = TARGET_BRANCHES[i];

            // Set ASC code dropdown
            await rightFrame.evaluate((bCode) => {
                const sel = document.querySelector('#asc_code');
                if (sel) {
                    for (let j = 0; j < sel.options.length; j++) {
                        if (sel.options[j].value === bCode || sel.options[j].text.includes(bCode)) {
                            sel.selectedIndex = j;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                            break;
                        }
                    }
                }
            }, branch.code);
            await delay(250);

            let dialogMessage = null;
            const onDialog = async (d) => {
                dialogMessage = d.message();
                await d.accept().catch(() => {});
            };
            p2.on('dialog', onDialog);

            const activeChunkFile = path.join(OUTPUT_DIR, `VOL_IN_${branch.short}_${yearMonth}_${activeRange.label}.xls`);

            try {
                const dlPromise = p2.waitForEvent('download', { timeout: 25000 });
                await rightFrame.evaluate(() => {
                    if (typeof displaySearch === 'function') displaySearch();
                });

                const dl = await Promise.race([
                    dlPromise,
                    new Promise((_, reject) => {
                        const timer = setInterval(() => {
                            if (dialogMessage !== null) {
                                clearInterval(timer);
                                reject(new Error('DIALOG: ' + dialogMessage));
                            }
                        }, 100);
                        setTimeout(() => clearInterval(timer), 26000);
                    })
                ]);

                await dl.saveAs(activeChunkFile);

                // Parse Excel dan hitung MTD
                const branchSeenSOs = new Set();
                let counts = {};

                // Jika split (> 15 hari), parse juga chunk 01-15 jika ada
                if (isSplit && chunk1) {
                    const chunk1File = path.join(OUTPUT_DIR, `VOL_IN_${branch.short}_${yearMonth}_${chunk1.label}.xls`);
                    const c1Counts = parseExcelSos(chunk1File, branch.short, branchSeenSOs);
                    for (const [k, v] of Object.entries(c1Counts)) {
                        counts[k] = (counts[k] || 0) + v;
                    }
                }

                // Parse chunk aktif (01-today atau 16-today)
                const activeCounts = parseExcelSos(activeChunkFile, branch.short, branchSeenSOs);
                for (const [k, v] of Object.entries(activeCounts)) {
                    counts[k] = (counts[k] || 0) + v;
                }

                // Update ke memory
                if (branch.short === 'DENPASAR') {
                    updatedMtdCounts['DENPASAR'] = counts['DENPASAR'] || 0;
                    updatedMtdCounts['DENPASAR - CELLULAR WORLD'] = counts['DENPASAR - CELLULAR WORLD'] || 0;
                    updatedMtdCounts['DENPASAR - PLANET GADGET'] = counts['DENPASAR - PLANET GADGET'] || 0;
                } else {
                    updatedMtdCounts[branch.short] = counts[branch.short] || 0;
                }

                branchesUpdated++;

            } catch (err) {
                // Jangan reset ke 0 jika timeout/error! Pertahankan nilai sebelumnya
                // console.warn(`   [SKIP] Cabang ${branch.short}: ${err.message}`);
            } finally {
                p2.off('dialog', onDialog);
            }
        }

        // 3. Simpan hasil terupdate ke Firestore
        existingVolIn[yearMonth] = updatedMtdCounts;
        await updateDoc(prodDocRef, {
            [`volInTrendData.${yearMonth}`]: updatedMtdCounts,
            volInLastUpdated: new Date().toISOString()
        });

        console.log(`\n🎉 [SUKSES] VOL IN MTD ${yearMonth} berhasil diperbarui di Firestore (${branchesUpdated} cabang ter-refresh)!`);

        // Tampilkan recap area Pak Abdul di konsol
        const abdulBranches = ['DENPASAR', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET', 'KUPANG', 'MANADO', 'SINGARAJA'];
        console.log('\n--- REKAP VOL IN MTD AREA ASMEN (PAK ABDUL) ---');
        abdulBranches.forEach(b => {
            console.log(`  ${b.padEnd(28)} : MTD = ${updatedMtdCounts[b] || 0}`);
        });
        console.log('------------------------------------------------\n');

    } catch (e) {
        console.error('❌ [ERROR] Gagal eksekusi MTD VOL IN:', e.message);
    } finally {
        if (p2 && !p2.isClosed()) await p2.close().catch(() => {});
        if (mainPage && !mainPage.isClosed()) await mainPage.close().catch(() => {});
        await browser.close().catch(() => {});
    }
}

module.exports = {
    runDailyVolInLedger: runMtdVolInPull, // Alias kompatibel untuk super_engine.js
    runMtdVolInPull
};

if (require.main === module) {
    runMtdVolInPull('MANUAL_CLI').then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
