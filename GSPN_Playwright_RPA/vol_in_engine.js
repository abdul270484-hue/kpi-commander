/**
 * VOL IN MTD Engine - Ultra Fast 2-Day Incremental Pull (Kemarin & Hari Ini)
 * Sesuai arahan BOS:
 * - Menarik rentang H-1 (kemarin) s/d H (hari ini) saja (2 hari transaksi)
 * - MTD diakumulasikan ke master cache deduplikasi (mtd_so_cache_{yearMonth}.json)
 * - Anti double-count (menggunakan Set unik per Service Order No.)
 * - Dialog race & timeout pendek (8s) agar cabang kosong/sepi langsung lanjut tanpa hang
 * - Memisahkan Denpasar menjadi: Denpasar, Cellular World, Planet Gadget
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

function getFastVolInConfig(refDate = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const year = refDate.getFullYear();
    const month = refDate.getMonth() + 1;
    const day = refDate.getDate();

    const yearMonth = `${year}-${pad(month)}`;
    const todayGspn = `${pad(day)}.${pad(month)}.${year}`;

    // Kemarin (H-1)
    const yesterday = new Date(refDate);
    yesterday.setDate(refDate.getDate() - 1);
    const yesterdayGspn = `${pad(yesterday.getDate())}.${pad(yesterday.getMonth() + 1)}.${yesterday.getFullYear()}`;

    // Jika tgl 1 awal bulan, fromDate = todayGspn. Jika tgl > 1, fromDate = yesterdayGspn
    const fromDate = (day === 1) ? todayGspn : yesterdayGspn;
    const toDate = todayGspn;

    return {
        yearMonth,
        todayGspn,
        fromDate,
        toDate,
        label: `${pad(day === 1 ? 1 : yesterday.getDate())}-${pad(day)}`
    };
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

function loadOrCreateSoCache(yearMonth) {
    const cacheFile = path.join(OUTPUT_DIR, `mtd_so_cache_${yearMonth}.json`);
    const branchSoSets = {};

    if (fs.existsSync(cacheFile)) {
        try {
            const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            Object.keys(raw).forEach(b => {
                branchSoSets[b] = new Set(raw[b] || []);
            });
            return { cacheFile, branchSoSets };
        } catch (_) {}
    }

    // Fallback: Seed dari file lokal yang ada
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.includes(yearMonth) && (f.endsWith('.xls') || f.endsWith('.xlsx')));
    files.forEach(f => {
        const m = f.match(/^VOL_IN_([A-Z0-9_\s]+?)_(?:000\d{7}_)?2026-\d{2}_/);
        if (!m) return;
        const br = m[1].trim().replace(/_/g, ' ');
        const filePath = path.join(OUTPUT_DIR, f);
        if (fs.statSync(filePath).size < 200) return;

        try {
            const wb = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false, cellText: false });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            rows.forEach(r => {
                const so = r['Service Order No.'] || r['ASC Job No'] || r['No'];
                if (!so) return;
                const soStr = String(so).trim();
                let targetBr = br;
                if (br === 'DENPASAR') targetBr = getDenpasarBranch(r);
                if (!branchSoSets[targetBr]) branchSoSets[targetBr] = new Set();
                branchSoSets[targetBr].add(soStr);
            });
        } catch (_) {}
    });

    return { cacheFile, branchSoSets };
}

function saveSoCache(cacheFile, branchSoSets) {
    try {
        const exportObj = {};
        Object.keys(branchSoSets).forEach(b => {
            exportObj[b] = Array.from(branchSoSets[b]);
        });
        fs.writeFileSync(cacheFile, JSON.stringify(exportObj, null, 2), 'utf8');
    } catch (e) {
        console.warn('⚠️ [CACHE SAVE ERROR]:', e.message);
    }
}

async function runFastVolInPull(slotName = 'MANUAL') {
    console.log('\n=============================================================');
    console.log(`  ⚡ [FAST VOL_IN] SIKLUS INCREMENTAL 2-HARI (H-1 s/d H) (${slotName})`);
    console.log('=============================================================');

    const cfg = getFastVolInConfig();
    const { yearMonth, fromDate, toDate, label } = cfg;

    console.log(`📅 Target Periode: ${yearMonth} | Rentang Tarik: ${fromDate} s/d ${toDate} (${label})`);

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

    // 2. Siapkan master deduplikasi cache MTD
    const { cacheFile, branchSoSets } = loadOrCreateSoCache(yearMonth);

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--no-default-browser-check']
    });

    let mainPage = null;
    let p2 = null;
    let branchesUpdated = 0;
    const startTime = Date.now();

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
        await delay(1200);

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

        // Set Rentang Tanggal (Kemarin s/d Hari Ini)
        await rightFrame.evaluate(({ fDate, tDate }) => {
            const f1 = document.querySelector('#req_date_from1');
            const t1 = document.querySelector('#req_date_to1');
            if (f1) { f1.value = fDate; f1.dispatchEvent(new Event('change', { bubbles: true })); }
            if (t1) { t1.value = tDate; t1.dispatchEvent(new Event('change', { bubbles: true })); }

            const fH = document.querySelector('#req_date_from');
            const tH = document.querySelector('#req_date_to');
            if (fH) fH.value = fDate;
            if (tH) tH.value = tDate;

            const s1 = document.querySelector('#status1');
            if (s1) { s1.selectedIndex = 0; s1.dispatchEvent(new Event('change', { bubbles: true })); }
            const s2 = document.querySelector('#status2');
            if (s2) { s2.selectedIndex = 0; s2.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { fDate: fromDate, tDate: toDate });
        await delay(350);

        console.log(`2. Menjalankan Fast Incremental Pull untuk ${TARGET_BRANCHES.length} Cabang...`);

        for (let i = 0; i < TARGET_BRANCHES.length; i++) {
            const branch = TARGET_BRANCHES[i];
            const t0 = Date.now();

            // Set ASC code dropdown dengan pencocokan ganda (dengan & tanpa leading zeros)
            const matched = await rightFrame.evaluate((bCode) => {
                const sel = document.querySelector('#asc_code');
                if (!sel) return false;
                const cleanCode = bCode.replace(/^0+/, '');
                for (let j = 0; j < sel.options.length; j++) {
                    const optVal = sel.options[j].value || '';
                    const optTxt = sel.options[j].text || '';
                    if (optVal === bCode || optVal.includes(cleanCode) || optTxt.includes(bCode) || optTxt.includes(cleanCode)) {
                        sel.selectedIndex = j;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }
                return false;
            }, branch.code);

            if (!matched) {
                // Skip jika kode cabang tidak ada di dropdown
                continue;
            }
            await delay(150);

            let dialogMessage = null;
            const onDialog = async (d) => {
                dialogMessage = d.message();
                await d.accept().catch(() => {});
            };
            p2.on('dialog', onDialog);

            const activeChunkFile = path.join(OUTPUT_DIR, `VOL_IN_${branch.short}_${yearMonth}_${label}.xls`);

            try {
                const dlPromise = p2.waitForEvent('download', { timeout: 3000 });
                await rightFrame.evaluate(() => {
                    if (typeof displaySearch === 'function') displaySearch();
                });

                // Race download against dialog or timeout 3.2s
                const dl = await Promise.race([
                    dlPromise,
                    new Promise((_, reject) => {
                        const timer = setInterval(() => {
                            if (dialogMessage !== null) {
                                clearInterval(timer);
                                reject(new Error('DIALOG: ' + dialogMessage));
                            }
                        }, 80);
                        setTimeout(() => { clearInterval(timer); reject(new Error('TIMEOUT_NO_NEW_DATA')); }, 3200);
                    })
                ]);

                await dl.saveAs(activeChunkFile);

                // Parse Excel dan merge SO baru ke master cache
                const wb = XLSX.readFile(activeChunkFile, { cellFormula: false, cellHTML: false, cellText: false });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet);

                rows.forEach(r => {
                    const so = r['Service Order No.'] || r['ASC Job No'] || r['No'];
                    if (!so) return;
                    const soStr = String(so).trim();

                    let targetBr = branch.short;
                    if (branch.short === 'DENPASAR') {
                        targetBr = getDenpasarBranch(r);
                    }
                    if (!branchSoSets[targetBr]) branchSoSets[targetBr] = new Set();
                    branchSoSets[targetBr].add(soStr);
                });

                branchesUpdated++;
                process.stdout.write(`   [OK] ${branch.short.padEnd(16)} (+${rows.length} rows, ${Date.now() - t0}ms)\n`);

            } catch (err) {
                // Dialog atau timeout = Tidak ada transaksi baru di 2 hari ini (Aman!)
                // process.stdout.write(`   [-] ${branch.short.padEnd(16)} (No new data, ${Date.now() - t0}ms)\n`);
            } finally {
                p2.off('dialog', onDialog);
            }
        }

        // 3. Simpan cache SO yang sudah ter-update
        saveSoCache(cacheFile, branchSoSets);

        // 4. Hitung MTD terkini dari cache
        const updatedMtdCounts = Object.assign({}, currentMonthVolIn);
        Object.keys(branchSoSets).forEach(b => {
            updatedMtdCounts[b] = branchSoSets[b].size;
        });

        // 5. Simpan hasil terupdate ke Firestore
        existingVolIn[yearMonth] = updatedMtdCounts;
        await updateDoc(prodDocRef, {
            [`volInTrendData.${yearMonth}`]: updatedMtdCounts,
            volInLastUpdated: new Date().toISOString()
        });

        const totalDurationSec = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n🎉 [SUKSES] FAST VOL IN MTD ${yearMonth} SELESAI DALAM ${totalDurationSec} DETIK!`);
        console.log(`   Total Cabang Diperbarui: ${branchesUpdated} cabang.`);

        // Tampilkan rekap area Asmen (Pak Abdul)
        const abdulBranches = ['DENPASAR', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET', 'KUPANG', 'MANADO', 'SINGARAJA'];
        console.log('\n--- REKAP VOL IN MTD AREA ASMEN (PAK ABDUL) ---');
        abdulBranches.forEach(b => {
            console.log(`  ${b.padEnd(28)} : MTD = ${updatedMtdCounts[b] || 0}`);
        });
        console.log('------------------------------------------------\n');

    } catch (e) {
        console.error('❌ [ERROR] Gagal eksekusi FAST VOL IN:', e.message);
    } finally {
        if (p2 && !p2.isClosed()) await p2.close().catch(() => {});
        if (mainPage && !mainPage.isClosed()) await mainPage.close().catch(() => {});
        await browser.close().catch(() => {});
    }
}

module.exports = {
    runDailyVolInLedger: runFastVolInPull,
    runFastVolInPull,
    runMtdVolInPull: runFastVolInPull
};

if (require.main === module) {
    runFastVolInPull('MANUAL_TEST').then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
