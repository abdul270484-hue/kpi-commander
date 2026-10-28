/**
 * BRANCH STOCK & PREDICTIVE ALERT ENGINE (ADAPTOR & KABEL DATA)
 * Sesuai arahan BOS:
 * 1. Tarikan HANYA 1 KALI di putaran pertama (first cycle of the day).
 * 2. HANYA FOKUS di Adaptor dan Kabel Data.
 * 3. HANYA FOKUS ke part number yang ada penjualan di bulan Oktober/MTD.
 * 4. Dikoneksikan dengan stok cabang untuk alert prediksi stok habis ke Kepala Cabang & HO.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');
const config = require('./config');

const delay = ms => new Promise(res => setTimeout(res, ms));

const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

// Tracker file untuk memastikan HANYA jalan 1 kali sehari di putaran pertama
const TRACKER_FILE = path.join(__dirname, 'stock_pull_tracker.json');

// 14 Part Number Fokus Aksesoris (Sesuai Arahan BOS)
const TARGET_ACCESSORY_PARTS = [
    // KABEL DATA (9 Part Number)
    { partNo: 'GH39-01999A', category: 'KABEL DATA', model: 'EP-DR140AWE A-to-C White 1.5m' },
    { partNo: 'GH39-02002A', category: 'KABEL DATA', model: 'EP-DR140ABE A-to-C Black 1.5m' },
    { partNo: 'GH39-02026A', category: 'KABEL DATA', model: 'EP-DA705BBE C-to-C 3A Black' },
    { partNo: 'GH39-02028A', category: 'KABEL DATA', model: 'EP-DA705BWE C-to-C 3A White 1m' },
    { partNo: 'GH39-02060A', category: 'KABEL DATA', model: 'EP-DG980BBE C-to-C Cable' },
    { partNo: 'GH39-02111A', category: 'KABEL DATA', model: 'EP-DN980BBE C-to-C Black 1m' },
    { partNo: 'GH39-02115A', category: 'KABEL DATA', model: 'EP-DN980BWE C-to-C White 1m' },
    { partNo: 'GH39-02134A', category: 'KABEL DATA', model: 'EP-DN980 C-to-C Cable 1m' },
    { partNo: 'GH39-02169A', category: 'KABEL DATA', model: 'Tab S9 FE C-to-C Cable' },

    // ADAPTOR (5 Part Number)
    { partNo: 'GH44-02950A', category: 'ADAPTOR', model: 'EP-TA800 25W Travel Adapter' },
    { partNo: 'GH44-03023A', category: 'ADAPTOR', model: 'EP-TA200 15W Type-A Black' },
    { partNo: 'GH44-03049A', category: 'ADAPTOR', model: 'EP-TA200 15W Type-A White' },
    { partNo: 'GH44-03053A', category: 'ADAPTOR', model: 'EP-TA800 25W Type-C White' },
    { partNo: 'GH44-03055A', category: 'ADAPTOR', model: 'EP-TA800 25W Type-C Black' }
];

/**
 * Helper: Ambil data tracker penarikan stok cabang hari ini
 */
function getStockTrackerData() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const defaultData = {
        lastDate: todayStr,
        initialDone: false,
        afternoon15Done: false,
        runs: []
    };
    if (fs.existsSync(TRACKER_FILE)) {
        try {
            const raw = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
            if (raw && raw.lastDate === todayStr) {
                return {
                    lastDate: todayStr,
                    initialDone: typeof raw.initialDone === 'boolean' ? raw.initialDone : (raw.status === 'SUCCESS'),
                    afternoon15Done: !!raw.afternoon15Done,
                    runs: Array.isArray(raw.runs) ? raw.runs : []
                };
            }
        } catch (_) {}
    }
    return defaultData;
}

/**
 * Gatekeeper Jadwal Penarikan Stok Overview Aksesoris
 * Sesuai arahan terbaru BOS:
 * 1. Di putaran awal (putaran pertama hari ini).
 * 2. Di rentang jam 15-an (15:00 - 15:59 WIB) HANYA 1X.
 */
function shouldRunStockScrapeToday(force = false) {
    if (force) return true;

    const now = new Date();
    const currentHour = now.getHours();
    const tracker = getStockTrackerData();

    // 1. Putaran awal hari ini (jika belum pernah jalan sama sekali hari ini)
    if (!tracker.initialDone) {
        return true;
    }

    // 2. Di rentang jam 15-an (15:00 - 15:59) HANYA 1X
    if (currentHour === 15 && !tracker.afternoon15Done) {
        return true;
    }

    // Selain dua kondisi di atas, SKIP agar siklus tetap kilat
    return false;
}

/**
 * Helper: Cek alasan penarikan atau skip untuk keperluan logging & progress
 */
function getStockScrapeTriggerReason() {
    const now = new Date();
    const currentHour = now.getHours();
    const tracker = getStockTrackerData();

    if (!tracker.initialDone) {
        return { shouldRun: true, label: 'PUTARAN AWAL HARI INI' };
    }
    if (currentHour === 15 && !tracker.afternoon15Done) {
        return { shouldRun: true, label: 'RENTANG JAM 15:XX (1X SORE)' };
    }
    return { 
        shouldRun: false, 
        label: `SKIP (Putaran awal: ${tracker.initialDone ? 'Sudah' : 'Belum'}, Jam 15: ${tracker.afternoon15Done ? 'Sudah' : (currentHour < 15 ? 'Menunggu jam 15:00' : 'Lewat')})` 
    };
}

/**
 * Catat bahwa tarikan stok cabang telah sukses dilakukan
 * Memperbarui status initialDone dan afternoon15Done
 */
function markStockScrapeDoneToday(summary = {}) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentHour = now.getHours();
    const tracker = getStockTrackerData();

    let triggerType = 'INITIAL_CYCLE';
    if (!tracker.initialDone) {
        tracker.initialDone = true;
        triggerType = 'INITIAL_CYCLE';
    } else if (currentHour === 15) {
        tracker.afternoon15Done = true;
        triggerType = 'AFTERNOON_15_CYCLE';
    } else {
        triggerType = 'MANUAL_FORCE';
    }

    tracker.lastDate = todayStr;
    tracker.lastTimestamp = now.toISOString();
    tracker.lastTimeStr = now.toLocaleTimeString('id-ID');
    tracker.status = 'SUCCESS';
    tracker.summary = summary;
    tracker.runs.push({
        type: triggerType,
        time: now.toLocaleTimeString('id-ID'),
        timestamp: now.toISOString(),
        summary
    });

    try {
        fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf8');
        console.log(`  💾 [TRACKER] Jadwal stok tercatat: ${triggerType} selesai pada ${tracker.lastTimeStr}.`);
    } catch (e) {
        console.warn('  ⚠️ Gagal menyimpan stock tracker file:', e.message);
    }
}

const ASC_CODE_TO_CANONICAL = {
    '0005277847': 'HO',
    '5277847': 'HO',
    '0007130603': 'BE BELITUNG',
    '0006469030': 'BE BITUNG',
    '0004986640': 'BE CURUP',
    '0006479073': 'BE KETAPANG',
    '0007115862': 'BE KONAWE',
    '0005773598': 'BE KOTA BUMI',
    '0004986618': 'BE METRO',
    '0004986619': 'BE PRINGSEWU',
    '0006479074': 'BE SANGGAU',
    '0007146860': 'BE TOLITOLI',
    '0004886679': 'SRAGEN',
    '0004924733': 'AMBON',
    '0002321530': 'BANDAR JAYA',
    '0005195856': 'BERAU',
    '0004924882': 'BOJONEGORO',
    '0004411723': 'BANJARMASIN',
    '0004411733': 'BENGKULU',
    '0008388746': 'BONTANG',
    '0004924441': 'DENPASAR',
    '0004924851': 'GORONTALO',
    '0004924773': 'JAYAPURA',
    '0002217884': 'KARAWANG',
    '0004924895': 'KENDARI',
    '0004925234': 'KUPANG',
    '0004925215': 'LUWUK',
    '0004411732': 'BANDAR LAMPUNG',
    '0004924922': 'MAKASSAR',
    '0004924924': 'MAMUJU',
    '0004924355': 'MANADO',
    '0004924926': 'PALOPO',
    '0004925216': 'PALU',
    '0001923453': 'PANGKALAN BUN',
    '0003901060': 'PATI',
    '0004924857': 'PROBOLINGGO',
    '0004411722': 'PALANGKARAYA',
    '0009372619': 'PAMEKASAN',
    '0004411730': 'PANGKAL PINANG',
    '0004411726': 'PONTIANAK',
    '0001923454': 'SAMPIT',
    '0005182120': 'SDS WAREHOUSE',
    '0004925239': 'SERPONG',
    '0004925238': 'SERPONG ITC-BSD',
    '0004924700': 'SIDOARJO',
    '0004925270': 'SINGARAJA',
    '0004925218': 'SORONG',
    '0004411727': 'SAMARINDA',
    '0005310660': 'SINGKAWANG',
    '0005195827': 'TANJUNG',
    '0004924770': 'TERNATE',
    '0004924774': 'TIMIKA',
    '0004411731': 'TANJUNGPINANG'
};

/**
 * Normalisasi nama cabang ke bentuk canonical
 */
function toCanonicalBranchName(raw) {
    if (!raw) return '';
    let s = String(raw).trim().toUpperCase();

    // 1. Cek jika raw adalah nomor ASC code GSPN (misal: 0004924922 / 0004411726 / 0005277847)
    const cleanDigits = s.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
        const padded = cleanDigits.padStart(10, '0');
        if (ASC_CODE_TO_CANONICAL[padded]) return ASC_CODE_TO_CANONICAL[padded];
        if (ASC_CODE_TO_CANONICAL[cleanDigits]) return ASC_CODE_TO_CANONICAL[cleanDigits];
    }
    
    // Hilangkan awalan nomor akun/ASC jika ada (misal: 0004924922 / UNICOM MAKASSAR...)
    if (s.includes('/')) {
        const parts = s.split('/');
        s = parts.slice(1).join('/').trim();
    }
    s = s.replace(/^UNICOM\s+/, '').replace(/^PT\.?\s*BINTANG\s*UTAMA\s*JAYA\s*MAKMUR\s*/, '').trim();

    // Mapping alias
    const aliases = {
        'LAMPUNG': 'BANDAR LAMPUNG',
        'ITC-BSD': 'SERPONG ITC-BSD',
        'PANGKALPINANG': 'PANGKAL PINANG',
        'BANDAR': 'BANDAR JAYA',
        'BUJM SRAGEN': 'SRAGEN',
        'TANJUNG PINANG': 'TANJUNGPINANG',
        'BELITUNG': 'BE BELITUNG',
        'BITUNG': 'BE BITUNG',
        'CURUP': 'BE CURUP',
        'KETAPANG': 'BE KETAPANG',
        'KONAWE': 'BE KONAWE',
        'KOTA': 'BE KOTA BUMI',
        'KOTA BUMI': 'BE KOTA BUMI',
        'METRO': 'BE METRO',
        'PRINGSEWU': 'BE PRINGSEWU',
        'SANGGAU': 'BE SANGGAU'
    };

    for (const [k, v] of Object.entries(aliases)) {
        if (s === k || s.startsWith(k + ' ')) return v;
    }
    return s.split(' ')[0] || s;
}

/**
 * Scraper Inti Stock Overview GSPN
 * Mendukung Multi-Tab (3 Worker Paralel) jika businessBtn & mainPage diberikan,
 * atau Single Tab (Fallback) jika hanya tab p2 yang diberikan.
 */
async function scrapeStockOverview(targetPageOrTab, onProgress = null, businessBtn = null) {
    console.log('\n=============================================================');
    console.log('  📦 [STOCK OVERVIEW] MEMULAI PENARIKAN STOK CABANG (PUTARAN PERTAMA)');
    console.log(`  🎯 Target: ${TARGET_ACCESSORY_PARTS.length} Part Numbers (Adaptor & Kabel Data MTD)`);
    console.log('  🏢 Mode Branch: -- ALL -- (Pencarian Nasional Sekaligus)');
    console.log('=============================================================\n');

    const stockRecords = [];

    // Helper navigasi ke form Stock Overview dalam popup p2
    const navigateToStockOverviewForm = async (p2) => {
        let leftScrollFrame = null;
        for (let a = 0; a < 20; a++) {
            leftScrollFrame = p2.frames().find(f => f.name() === 'b2BLeftMenuScroll');
            if (leftScrollFrame) break;
            await delay(500);
        }

        if (leftScrollFrame) {
            await leftScrollFrame.evaluate(() => {
                const tds = Array.from(document.querySelectorAll('td'));
                const invFolder = tds.find(t => t.innerText && t.innerText.trim() === 'Inventory Management');
                if (invFolder) invFolder.click();
            }).catch(()=>{});
            await delay(800);
            await leftScrollFrame.evaluate(() => {
                const tds = Array.from(document.querySelectorAll('td'));
                const stockItem = tds.find(t => (t.getAttribute('onclick') || '').includes('StockOverview.jsp') || (t.innerText && t.innerText.trim() === 'Stock Overview'));
                if (stockItem) {
                    stockItem.click();
                } else if (typeof setForwardURI === 'function') {
                    setForwardURI('', '', '', '', '', '', '/invmgnt/inv/StockOverview.jsp', null, 'Inventory Management:Inventory Management:Stock Overview', 'Stock Overview');
                }
            }).catch(()=>{});
        }

        let rightFrame = null;
        for (let attempt = 0; attempt < 25; attempt++) {
            rightFrame = p2.frames().find(f => f.name() === 'rightContents');
            if (rightFrame) {
                const hasForm = await rightFrame.evaluate(() => {
                    return !!document.querySelector('select#asc_code, select[name="asc_code"]') &&
                           !!document.querySelector('input#material, input[name="material"]');
                }).catch(() => false);
                if (hasForm) break;
            }
            await delay(800);
        }

        if (!rightFrame) throw new Error('Frame rightContents Stock Overview tidak ditemukan.');
        return rightFrame;
    };

    // Helper query 1 part number di form rightFrame
    const queryPartInFrame = async (p2, rightFrame, target, workerId = 1) => {
        let currentRightFrame = p2.frames().find(f => f.name() === 'rightContents') || rightFrame;

        await currentRightFrame.evaluate((targetPart) => {
            const ascSel = document.querySelector('select#asc_code, select[name="asc_code"]');
            if (ascSel) {
                ascSel.value = '';
                ascSel.selectedIndex = 0;
                ascSel.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const matInput = document.querySelector('input#material, input[name="material"]');
            if (matInput) {
                matInput.value = targetPart;
                matInput.dispatchEvent(new Event('input', { bubbles: true }));
                matInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const btns = Array.from(document.querySelectorAll('a, button, input[type="button"]'));
            const searchBtn = btns.find(b => (b.innerText || b.value || '').trim() === 'Search');
            if (searchBtn) searchBtn.click();
        }, target.partNo);

        await delay(4500);

        currentRightFrame = p2.frames().find(f => f.name() === 'rightContents') || currentRightFrame;
        const domRows = await currentRightFrame.evaluate((targetMeta) => {
            const rows = [];
            const tables = Array.from(document.querySelectorAll('table'));
            const dataTable = tables.find(t => {
                const tr0 = t.querySelector('tr');
                return tr0 && tr0.innerText.includes('Total Stock Qty');
            });
            if (!dataTable) return rows;

            const trs = Array.from(dataTable.querySelectorAll('tr'));
            for (let r = 1; r < trs.length; r++) {
                const tr = trs[r];
                const trText = tr.innerText || '';
                if (trText.includes('Grand Total') || trText.includes('Total :') || trText.trim() === '') continue;

                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length >= 7) {
                    const branchRaw = tds[1] ? tds[1].innerText.trim() : '';
                    if (!branchRaw || branchRaw.toLowerCase() === 'branch' || !/\d/.test(branchRaw)) continue;

                    const pNo = tds[2] ? tds[2].innerText.trim() : targetMeta.partNo;
                    const desc = tds[3] ? tds[3].innerText.trim() : targetMeta.model;
                    const totalQty = tds[4] ? parseInt(tds[4].innerText.replace(/,/g, '').trim()) || 0 : 0;
                    const whQty = tds[5] ? parseInt(tds[5].innerText.replace(/,/g, '').trim()) || 0 : 0;
                    const engQty = tds[6] ? parseInt(tds[6].innerText.replace(/,/g, '').trim()) || 0 : 0;
                    const mapVal = tds[12] ? parseFloat(tds[12].innerText.replace(/,/g, '').trim()) || 0 : 0;
                    const totalVal = tds[13] ? parseFloat(tds[13].innerText.replace(/,/g, '').trim()) || 0 : 0;
                    const modDate = tds[15] ? tds[15].innerText.trim() : '';

                    rows.push({
                        branchRaw,
                        partNo: pNo,
                        desc,
                        totalStockQty: totalQty,
                        warehouseStockQty: whQty,
                        engineerStockQty: engQty,
                        map: mapVal,
                        totalStockValue: totalVal,
                        lastModified: modDate
                    });
                }
            }
            return rows;
        }, target);

        return domRows;
    };

    try {
        if (businessBtn) {
            // MULTI-TAB FLOW (3 WORKER PARALEL)
            const mainPage = targetPageOrTab;
            const CONCURRENCY = Math.min(3, TARGET_ACCESSORY_PARTS.length);
            console.log(`  ⚡ [MULTI-TAB] Menggunakan ${CONCURRENCY} Worker Tab Paralel untuk ${TARGET_ACCESSORY_PARTS.length} Part Numbers...`);

            const workerTabs = [];
            for (let i = 0; i < CONCURRENCY; i++) {
                console.log(`  -> Menyiapkan Tab Worker ${i + 1}...`);
                await mainPage.bringToFront();
                await delay(500);
                const popupPromise = mainPage.waitForEvent('popup', { timeout: 30000 });
                await businessBtn.click();
                const p2 = await popupPromise;
                p2.on('dialog', async d => { await d.accept().catch(()=>{}); });
                await delay(2000);

                const rightFrame = await navigateToStockOverviewForm(p2);
                workerTabs.push({ p2, rightFrame });
                await delay(1500); // Stagger 1.5 detik
            }

            console.log(`  ✅ Semua ${CONCURRENCY} Tab Worker Siap! Menjalankan antrean paralel...`);
            const queue = [...TARGET_ACCESSORY_PARTS];
            let completedCount = 0;

            const workerLoop = async (workerId, tabData) => {
                const { p2, rightFrame } = tabData;
                while (queue.length > 0) {
                    const target = queue.shift();
                    if (!target) break;

                    console.log(`  [Worker ${workerId}] Mencari stok nasional: ${target.partNo} (${target.model})...`);
                    const domRows = await queryPartInFrame(p2, rightFrame, target, workerId);

                    domRows.forEach(r => {
                        const canon = toCanonicalBranchName(r.branchRaw);
                        stockRecords.push({
                            branchRaw: r.branchRaw,
                            branch: canon,
                            partNo: r.partNo.trim().toUpperCase(),
                            desc: r.desc,
                            category: target.category,
                            model: target.model,
                            totalStockQty: r.totalStockQty,
                            warehouseStockQty: r.warehouseStockQty,
                            engineerStockQty: r.engineerStockQty,
                            map: r.map,
                            totalStockValue: r.totalStockValue,
                            lastModified: r.lastModified
                        });
                    });

                    completedCount++;
                    if (onProgress) {
                        onProgress({
                            phase: 'STOCK_OVERVIEW',
                            current: completedCount,
                            total: TARGET_ACCESSORY_PARTS.length,
                            branch: `${target.category}: ${target.partNo}`,
                            ok: true
                        });
                    }
                    console.log(`  [Worker ${workerId}] ✅ ${target.partNo} -> ${domRows.length} cabang ditemukan memiliki stok.`);
                }
                await p2.close().catch(()=>{});
            };

            await Promise.all(workerTabs.map((tab, idx) => workerLoop(idx + 1, tab)));

            // Pastikan semua tab tertutup
            for (const tabData of workerTabs) {
                if (tabData && tabData.p2 && !tabData.p2.isClosed()) {
                    await tabData.p2.close().catch(()=>{});
                }
            }

            console.log(`\n🎉 [SELESAI] Penarikan stok selesai! Total ${stockRecords.length} record stok cabang diperoleh.`);
            return { success: true, stockRecords };
        } else {
            // SINGLE TAB FALLBACK (p2)
            const p2 = targetPageOrTab;
            const rightFrame = await navigateToStockOverviewForm(p2);

            for (let i = 0; i < TARGET_ACCESSORY_PARTS.length; i++) {
                const target = TARGET_ACCESSORY_PARTS[i];
                const partNo = target.partNo;
                console.log(`  [ITEM ${i + 1}/${TARGET_ACCESSORY_PARTS.length}] Mencari stok nasional: ${partNo} (${target.model})...`);

                if (onProgress) {
                    onProgress({
                        phase: 'STOCK_OVERVIEW',
                        current: i + 1,
                        total: TARGET_ACCESSORY_PARTS.length,
                        branch: `${target.category}: ${partNo}`,
                        ok: true
                    });
                }

                const domRows = await queryPartInFrame(p2, rightFrame, target, 1);

                domRows.forEach(r => {
                    const canon = toCanonicalBranchName(r.branchRaw);
                    stockRecords.push({
                        branchRaw: r.branchRaw,
                        branch: canon,
                        partNo: r.partNo.trim().toUpperCase(),
                        desc: r.desc,
                        category: target.category,
                        model: target.model,
                        totalStockQty: r.totalStockQty,
                        warehouseStockQty: r.warehouseStockQty,
                        engineerStockQty: r.engineerStockQty,
                        map: r.map,
                        totalStockValue: r.totalStockValue,
                        lastModified: r.lastModified
                    });
                });

                console.log(`    -> [DOM] ${domRows.length} cabang ditemukan memiliki stok untuk ${partNo}.`);
            }

            console.log(`\n🎉 [SELESAI] Penarikan stok selesai! Total ${stockRecords.length} record stok cabang diperoleh.`);
            return { success: true, stockRecords };
        }

    } catch (err) {
        console.error('❌ [ERROR] Gagal saat penarikan stok cabang:', err.message);
        return { success: false, error: err.message, stockRecords };
    }
}

/**
 * Sinkronisasi Data Stok & Kalkulasi Alert Prediksi Habis ke Firestore
 */
async function syncBranchStockToFirestore(stockRecords) {
    console.log('\n🧠 Menghitung Algoritma Prediksi Habis & Sinkronisasi ke Firestore...');
    
    // 1. Ambil data penjualan parts sales MTD aktif dari Firestore
    let partsSalesList = [];
    let partsDailyData = {};
    try {
        const partsSnap = await getDoc(doc(db, 'dashboard_data', 'latest_parts_sales'));
        if (partsSnap.exists()) {
            const data = partsSnap.data();
            partsSalesList = data.partsSalesList || [];
            partsDailyData = data.partsDailyData || {};
        }
    } catch (e) {
        console.warn('⚠️ Gagal mengambil latest_parts_sales:', e.message);
    }

    const now = new Date();
    const currentDay = Math.max(1, now.getDate()); // Hari ke-N dalam bulan (e.g. 22)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Map stok: key = CANONICAL_BRANCH + '_' + PART_NO
    const stockMap = {};
    stockRecords.forEach(s => {
        const key = `${s.branch}_${s.partNo}`;
        stockMap[key] = s;
    });

    // Map penjualan: key = CANONICAL_BRANCH + '_' + PART_NO
    const salesMap = {};
    const activePartsWithHistory = new Set();
    const branchSet = new Set();
    stockRecords.forEach(s => branchSet.add(s.branch));

    // A. Olah data transaksi detail dari partsSalesList (jika terisi)
    partsSalesList.forEach(sale => {
        const canon = toCanonicalBranchName(sale.branch);
        const pNo = (sale.partNo || '').trim().toUpperCase();
        const key = `${canon}_${pNo}`;
        const qty = parseInt(sale.qty) || 0;
        salesMap[key] = (salesMap[key] || 0) + qty;
        if (qty > 0) {
            activePartsWithHistory.add(pNo);
        }
        branchSet.add(canon);
    });

    // B. Olah data agregat harian dari partsDailyData (proteksi fallback agar tidak pernah kosong)
    for (const [rowKey, val] of Object.entries(partsDailyData)) {
        const parts = rowKey.split(' - ');
        const rawBranch = parts[0];
        const canonBranch = toCanonicalBranchName(rawBranch);
        branchSet.add(canonBranch);

        let totalDaily = 0;
        for (const [k, v] of Object.entries(val)) {
            if (/^\d+$/.test(k)) totalDaily += Number(v) || 0;
        }

        const partNos = Array.isArray(val.partNos) ? val.partNos : [];
        partNos.forEach(p => {
            const cleanP = (p || '').trim().toUpperCase();
            if (cleanP) activePartsWithHistory.add(cleanP);
        });

        if (partNos.length > 0 && totalDaily > 0) {
            const share = Math.max(1, Math.round(totalDaily / partNos.length));
            partNos.forEach(p => {
                const cleanP = (p || '').trim().toUpperCase();
                const key = `${canonBranch}_${cleanP}`;
                if (!salesMap[key] || salesMap[key] === 0) {
                    salesMap[key] = share;
                }
            });
        }
    }

    // Aturan BOS: Part number yang tidak memiliki histori dalam 2 minggu TIDAK dimasukkan ke Alert Prediksi Stok Aksesoris Cabang
    console.log(`  ℹ️ Filter Histori 2 Minggu: ${activePartsWithHistory.size} part number memiliki riwayat penjualan.`);

    // Buat daftar prediksi untuk semua cabang & part number target yang memiliki riwayat penjualan
    const predictions = [];

    const allBranches = Array.from(branchSet).filter(b => b && b.length > 1).sort();

    allBranches.forEach(branch => {
        TARGET_ACCESSORY_PARTS.forEach(target => {
            const partNo = target.partNo;

            // Sesuai Arahan BOS: Lewati part number yang tidak memiliki histori dalam 2 minggu
            if (!activePartsWithHistory.has(partNo)) return;

            const key = `${branch}_${partNo}`;

            const stockInfo = stockMap[key];
            const totalStock = stockInfo ? stockInfo.totalStockQty : 0;
            const whStock = stockInfo ? stockInfo.warehouseStockQty : 0;
            const engStock = stockInfo ? stockInfo.engineerStockQty : 0;

            const mtdSold = salesMap[key] || 0;

            // Sesuai Arahan BOS: Cabang yang tidak memiliki riwayat penjualan untuk part ini (mtdSold <= 0)
            // TIDAK dimasukkan ke Alert Prediksi Stok Aksesoris Cabang
            if (mtdSold <= 0) return;

            const dsr = Number((mtdSold / currentDay).toFixed(2)); // Daily Sales Rate

            let doi = 999;
            let status = 'SAFE';
            let statusBadge = '🟢 Aman';

            if (totalStock === 0) {
                doi = 0;
                status = 'OUT_OF_STOCK';
                statusBadge = '🔴 Habis';
            } else if (dsr > 0) {
                doi = Math.round(totalStock / dsr);
                if (doi <= 3) {
                    status = 'CRITICAL';
                    statusBadge = '🔴 Kritis (<= 3 Hari)';
                } else if (doi <= 7) {
                    status = 'WARNING';
                    statusBadge = '🟡 Waspada (4-7 Hari)';
                } else {
                    status = 'SAFE';
                    statusBadge = '🟢 Aman (> 7 Hari)';
                }
            }

            // Rekomendasi kuantitas order (Stok pengaman 14 hari)
            const targetSafety = Math.ceil(dsr * 14);
            const suggestedReorder = Math.max(0, targetSafety - totalStock);

            predictions.push({
                branch,
                partNo,
                category: target.category,
                model: target.model,
                totalStock,
                warehouseStock: whStock,
                engineerStock: engStock,
                mtdSold,
                dailySalesRate: dsr,
                daysRemaining: doi,
                status,
                statusBadge,
                suggestedReorder,
                lastModified: stockInfo ? stockInfo.lastModified : ''
            });
        });
    });

    // Simpan ke Firestore document: dashboard_data/latest_branch_stock
    const payload = {
        lastUpdated: new Date().toLocaleString('id-ID'),
        updatedAtISO: now.toISOString(),
        currentDayOfMonth: currentDay,
        daysInMonth: daysInMonth,
        totalTrackedParts: TARGET_ACCESSORY_PARTS.length,
        totalRecords: predictions.length,
        kpiSummary: {
            outOfStock: predictions.filter(p => p.status === 'OUT_OF_STOCK').length,
            critical: predictions.filter(p => p.status === 'CRITICAL').length,
            warning: predictions.filter(p => p.status === 'WARNING').length,
            safe: predictions.filter(p => p.status === 'SAFE').length,
            totalAlerts: predictions.length
        },
        predictions: predictions,
        stockList: stockRecords
    };

    await setDoc(doc(db, 'dashboard_data', 'latest_branch_stock'), payload);
    console.log(`✅ [FIRESTORE SYNC] Berhasil menyimpan latest_branch_stock (${predictions.length} alert item)!`);
    console.log(`   - 🔴 Habis: ${payload.kpiSummary.outOfStock}`);
    console.log(`   - 🔴 Kritis (<= 3 hari): ${payload.kpiSummary.critical}`);
    console.log(`   - 🟡 Waspada (4-7 hari): ${payload.kpiSummary.warning}`);
    console.log(`   - 🟢 Aman: ${payload.kpiSummary.safe}`);

    return payload;
}

module.exports = {
    TARGET_ACCESSORY_PARTS,
    shouldRunStockScrapeToday,
    getStockScrapeTriggerReason,
    getStockTrackerData,
    markStockScrapeDoneToday,
    toCanonicalBranchName,
    scrapeStockOverview,
    syncBranchStockToFirestore
};
