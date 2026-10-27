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

    // Sesuai Aturan & Logika Emas BOS (Daily Incremental Ledger):
    // Cukup tarik tanggal kemarin (H-1) s/d hari ini (H).
    // Tidak perlu tarik ulang dari tgl 1 atau rentang 8-15 hari karena tgl 1 s/d H-2 sudah tersimpan aman di cache MTD & Firestore!
    const yesterday = new Date(refDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const fromDate = (day === 1) ? todayGspn : `${pad(yesterday.getDate())}.${pad(yesterday.getMonth() + 1)}.${yesterday.getFullYear()}`;
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

                // Anti-pollution guard: reject Denpasar data falsely placed in other branch files
                const ascName = String(r['ASC Name'] || '').toUpperCase();
                const ascCode = String(r['ASC Code'] || '');
                if (br !== 'DENPASAR' && (ascName.includes('DENPASAR') || ascCode.includes('4924441'))) {
                    return;
                }

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

async function runFastVolInPull(slotName = 'MANUAL', onProgress = null) {
    const cfg = getFastVolInConfig();
    const { yearMonth, fromDate, toDate, label } = cfg;

    console.log('\n=============================================================');
    console.log(`  [===] MEMULAI TARIKAN VOL IN MTD (${TARGET_BRANCHES.length} CABANG)`);
    console.log(`  📅 Target Periode: ${yearMonth} | Rentang: ${fromDate} s/d ${toDate} (${label})`);
    console.log('=============================================================');

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

        console.log(`2. Memulai penarikan data incremental untuk ${TARGET_BRANCHES.length} Cabang...`);

        for (let i = 0; i < TARGET_BRANCHES.length; i++) {
            const branch = TARGET_BRANCHES[i];
            const t0 = Date.now();

            // Tampilkan listing progress cabang (persis format REDO, GD, PART)
            console.log(`\n[VOL_IN ${i + 1}/${TARGET_BRANCHES.length}] Cabang: ${branch.short} (${branch.code})`);

            // Notifikasi ke onProgress agar live progress di Dashboard & Firestore ter-update
            if (onProgress) {
                onProgress({
                    phase: 'VOL_IN',
                    current: i + 1,
                    total: TARGET_BRANCHES.length,
                    branch: branch.short,
                    ok: true
                });
            }

            process.stdout.write(`   -> Menarik data Excel Service Order... `);

            // Set ASC code dropdown dengan pencocokan ganda (dengan & tanpa leading zeros)
            const matched = await rightFrame.evaluate((bCode) => {
                const td1 = document.querySelector('#td2_01');
                if (td1) td1.click(); // Reset ke tab Quick Search agar binding dropdown aktif
                const sel = document.querySelector('#asc_code');
                if (!sel) return false;
                const cleanCode = bCode.replace(/^0+/, '');
                let found = false;
                for (let j = 0; j < sel.options.length; j++) {
                    const optVal = sel.options[j].value || '';
                    const optTxt = sel.options[j].text || '';
                    if (optVal === bCode || optVal.includes(cleanCode) || optTxt.includes(bCode) || optTxt.includes(cleanCode)) {
                        sel.selectedIndex = j;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        found = true;
                        break;
                    }
                }
                const td2 = document.querySelector('#td2_02');
                if (td2) td2.click(); // Kembali ke tab Bulk Search
                return found;
            }, branch.code);

            if (!matched) {
                console.log(`[-] Skip (Kode cabang tidak ada di dropdown GSPN)`);
                continue;
            }
            await delay(150);

            let dialogMessage = null;
            const onDialog = async (d) => {
                dialogMessage = d.message();
                await d.accept().catch(() => {});
            };
            p2.on('dialog', onDialog);

            const activeChunkFile = path.join(OUTPUT_DIR, `VOL_IN_${branch.short}_${branch.code}_${yearMonth}_${label}.xls`);

            try {
                const dlPromise = p2.waitForEvent('download', { timeout: 3500 });
                await rightFrame.evaluate(() => {
                    if (typeof displaySearch === 'function') displaySearch();
                });

                // Race download against dialog or timeout 3.8s
                const dl = await Promise.race([
                    dlPromise,
                    new Promise((_, reject) => {
                        const timer = setInterval(() => {
                            if (dialogMessage !== null) {
                                clearInterval(timer);
                                reject(new Error('DIALOG: ' + dialogMessage));
                            }
                        }, 80);
                        setTimeout(() => { clearInterval(timer); reject(new Error('TIMEOUT_NO_NEW_DATA')); }, 3800);
                    })
                ]);

                await dl.saveAs(activeChunkFile);

                // Cek apakah file adalah HTML alert 'Excel Data not found!.' (< 200 bytes)
                const fileStat = fs.statSync(activeChunkFile);
                if (fileStat.size < 200) {
                    const currentMtd = branchSoSets[branch.short] ? branchSoSets[branch.short].size : (currentMonthVolIn[branch.short] || 0);
                    console.log(`[-] (Data tidak ada di GSPN / 0 rows, Total MTD: ${currentMtd} SO, ${Date.now() - t0}ms)`);
                    continue;
                }

                // Parse Excel dan merge SO baru ke master cache
                const wb = XLSX.readFile(activeChunkFile, { cellFormula: false, cellHTML: false, cellText: false });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet);

                let newRowsCount = 0;
                rows.forEach(r => {
                    const so = r['Service Order No.'] || r['ASC Job No'] || r['No'];
                    if (!so) return;
                    const soStr = String(so).trim();

                    // Anti-pollution guard: pastikan data Denpasar tidak bocor ke cabang lain
                    const ascName = String(r['ASC Name'] || '').toUpperCase();
                    const ascCode = String(r['ASC Code'] || '');
                    if (branch.short !== 'DENPASAR' && (ascName.includes('DENPASAR') || ascCode.includes('4924441'))) {
                        return; // Discard data Denpasar jika tertulis pada cabang non-Denpasar
                    }

                    const rowBranch = (branch.short === 'DENPASAR') ? getDenpasarBranch(r) : branch.short;
                    if (!branchSoSets[rowBranch]) branchSoSets[rowBranch] = new Set();
                    if (!branchSoSets[rowBranch].has(soStr)) {
                        newRowsCount++;
                        branchSoSets[rowBranch].add(soStr);
                    }
                });

                branchesUpdated++;
                const currentMtd = branchSoSets[branch.short] ? branchSoSets[branch.short].size : rows.length;
                console.log(`[OK] (+${rows.length} rows file, +${newRowsCount} SO baru, Total MTD: ${currentMtd} SO, ${Date.now() - t0}ms)`);

            } catch (err) {
                const currentMtd = branchSoSets[branch.short] ? branchSoSets[branch.short].size : (currentMonthVolIn[branch.short] || 0);
                if (err.message.includes('DIALOG')) {
                    console.log(`[-] (Data tidak ada di GSPN / 0 rows, Total MTD: ${currentMtd} SO, ${Date.now() - t0}ms)`);
                } else if (err.message.includes('TIMEOUT') || err.message.includes('Timeout')) {
                    console.log(`[-] (Tidak ada transaksi baru / 0 rows, Total MTD: ${currentMtd} SO, ${Date.now() - t0}ms)`);
                } else {
                    console.log(`[-] (${err.message}, Total MTD: ${currentMtd} SO, ${Date.now() - t0}ms)`);
                }
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
