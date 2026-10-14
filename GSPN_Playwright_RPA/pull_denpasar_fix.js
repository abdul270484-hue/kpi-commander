const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');
const config = require('./config');
const { loginAndSaveSession } = require('./auth');
const { shortenASC, parseProductivityFile } = require('./sync');

const delay = ms => new Promise(res => setTimeout(res, ms));

const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

async function main() {
    console.log('=============================================================');
    console.log('  🚀 PROSES PERBAIKAN DATA HISTORIS DENPASAR');
    console.log('=============================================================');

    // 1. Jalankan proses login interaktif
    console.log('Membuka browser login GSPN... Silakan approve di HP jika diminta.');
    await loginAndSaveSession();

    console.log('\n✅ Login berhasil! Memulai penarikan data Denpasar...');

    const browser = await chromium.launch({
        headless: true,
        args: ['--start-maximized', '--disable-web-security', '--no-default-browser-check']
    });

    const results = {};
    const targetMonths = ['2026-06', '2026-07', '2026-08', '2026-09'];

    try {
        const context = await browser.newContext({
            storageState: config.STORAGE_STATE_PATH,
            viewport: null,
            acceptDownloads: true
        });

        const mainPage = await context.newPage();
        mainPage.on('dialog', async d => await d.accept().catch(() => {}));

        console.log('Membuka portal GSPN...');
        await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2500);

        const menuFrame = mainPage.frameLocator('frame[name="menu"]');
        const businessBtn = menuFrame.getByText('Business').first();
        await businessBtn.waitFor({ state: 'visible', timeout: 30000 });

        console.log('Membuka menu Business...');
        const popupPromise = mainPage.waitForEvent('popup', { timeout: 30000 });
        await businessBtn.click();
        const p2 = await popupPromise;
        p2.on('dialog', async d => await d.accept().catch(() => {}));
        await delay(2000);

        await p2.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 15000 });
        const clickInMenu = async (selector, text) => {
            await p2.evaluate(({ selector, text }) => {
                const lm = document.querySelector('iframe[name="leftMenus"]');
                if (!lm) return;
                const sc = lm.contentDocument.querySelector('iframe[name="b2BLeftMenuScroll"]');
                if (!sc) return;
                const doc = sc.contentDocument;
                let el = selector ? doc.querySelector(selector) : null;
                if (!el && text) el = Array.from(doc.querySelectorAll('td')).find(t => t.innerText.trim() === text);
                if (el) el.click();
            }, { selector, text });
        };

        console.log('Membuka Daily Repair Statement (Detail)...');
        await clickInMenu('td#Accounting_top', 'Accounting');
        await delay(800);
        await clickInMenu('td#Accounting_2', 'Partner Accounting');
        await delay(800);
        await clickInMenu(null, 'Daily Repair Statement (Detail)');

        let rightFrame = null;
        for (let attempt = 0; attempt < 25; attempt++) {
            rightFrame = p2.frames().find(f => f.name() === 'rightContents');
            if (rightFrame) {
                try {
                    const found = await rightFrame.evaluate(() => !!document.querySelector('#Partner'));
                    if (found) break;
                } catch (_) {}
            }
            await delay(1000);
        }

        if (!rightFrame) throw new Error('rightFrame tidak ditemukan!');

        const ascCode = '0004924441'; // DENPASAR
        console.log(`Memilih cabang Denpasar (${ascCode})...`);
        await rightFrame.evaluate(val => {
            const selects = Array.from(document.querySelectorAll('select'));
            const partnerSel = document.querySelector('#Partner') || selects.find(s => s.id.toLowerCase().includes('partner'));
            if (partnerSel) {
                for (let i = 0; i < partnerSel.options.length; i++) {
                    if (partnerSel.options[i].value === val || partnerSel.options[i].text.includes(val)) {
                        partnerSel.selectedIndex = i;
                        partnerSel.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            }
        }, ascCode);

        await delay(3000);

        for (const monthStr of targetMonths) {
            console.log(`\n----------------------------------------------`);
            console.log(`📅 Memproses Denpasar Bulan ${monthStr}...`);
            console.log(`----------------------------------------------`);

            const [yearStr, mStr] = monthStr.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(mStr, 10);

            const pad = n => String(n).padStart(2, '0');
            const lastDayNum = new Date(year, month, 0).getDate();
            const fromDate = `01.${pad(month)}.${year}`;
            const toDate = `${pad(lastDayNum)}.${pad(month)}.${year}`;

            console.log(`  Set Tanggal: ${fromDate} s/d ${toDate} & Search...`);
            await rightFrame.evaluate(({ from, to }) => {
                const fi = document.querySelector('#FromDate');
                const ti = document.querySelector('#ToDate');
                if (fi) fi.value = from;
                if (ti) ti.value = to;
                if (typeof displaySearch === 'function') displaySearch(0, 0);
                else {
                    const btn = Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Search');
                    if (btn) btn.click();
                }
            }, { from: fromDate, to: toDate });

            // Beri jeda 5 detik agar query server selesai
            await delay(5000);

            console.log(`  Mengunduh file excel...`);
            const downloadPromise = p2.waitForEvent('download', { timeout: 25000 }).catch(() => null);
            await rightFrame.evaluate(() => {
                if (typeof downloadList === 'function') downloadList();
                else {
                    const dlBtn = Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Download');
                    if (dlBtn) dlBtn.click();
                }
            }).catch(() => {});

            const download = await downloadPromise;
            const branchCounts = {
                'DENPASAR': 0,
                'DENPASAR - CELLULAR WORLD': 0,
                'DENPASAR - PLANET GADGET': 0
            };

            if (download) {
                const tempPath = path.join(config.DOWNLOAD_DIR, `FIX_DPS_${monthStr}_${Date.now()}.xls`);
                await download.saveAs(tempPath);
                console.log(`  ✅ File terunduh: ${path.basename(tempPath)} (${fs.statSync(tempPath).size} bytes)`);

                try {
                    const rows = parseProductivityFile(tempPath);
                    console.log(`  Total baris raw: ${rows.length}`);

                    for (let r = 2; r < rows.length; r++) {
                        const row = rows[r];
                        if (!row || row.length === 0 || !row[0]) continue;

                        let rawEng = row[7] || row[6] || '';
                        let engName = String(rawEng).trim().toUpperCase().replace(/^\d+\s+/, '');
                        let resolvedBranch = shortenASC('DENPASAR', row, engName);

                        if (!branchCounts[resolvedBranch]) branchCounts[resolvedBranch] = 0;
                        branchCounts[resolvedBranch]++;
                    }

                    console.log(`  📊 Rincian Denpasar [${monthStr}]:`);
                    console.log(`     * DENPASAR (Induk): ${branchCounts['DENPASAR']} GD`);
                    console.log(`     * DENPASAR - CELLULAR WORLD: ${branchCounts['DENPASAR - CELLULAR WORLD']} GD`);
                    console.log(`     * DENPASAR - PLANET GADGET: ${branchCounts['DENPASAR - PLANET GADGET']} GD`);
                    const tot = branchCounts['DENPASAR'] + branchCounts['DENPASAR - CELLULAR WORLD'] + branchCounts['DENPASAR - PLANET GADGET'];
                    console.log(`     * TOTAL AREA: ${tot} GD`);

                    results[monthStr] = branchCounts;
                } finally {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                }
            } else {
                console.warn(`  ⚠️ Tidak ada unduhan untuk Denpasar ${monthStr}`);
            }

            await delay(2000);
        }

    } finally {
        await browser.close().catch(() => {});
    }

    console.log('\n==============================================');
    console.log('☁️ Menyimpan Hasil Denpasar ke Firestore...');
    console.log('==============================================');

    const prodDocRef = doc(db, 'dashboard_data', 'latest_prod');
    const snap = await getDoc(prodDocRef);
    if (!snap.exists()) {
        console.error('Dokumen dashboard_data/latest_prod tidak ditemukan!');
        return;
    }

    const currentData = snap.data();
    const gdTrend = currentData.gdTrendData || {};

    for (const m of targetMonths) {
        if (!gdTrend[m]) gdTrend[m] = {};
        if (results[m]) {
            gdTrend[m]['DENPASAR'] = results[m]['DENPASAR'];
            gdTrend[m]['DENPASAR - CELLULAR WORLD'] = results[m]['DENPASAR - CELLULAR WORLD'];
            gdTrend[m]['DENPASAR - PLANET GADGET'] = results[m]['DENPASAR - PLANET GADGET'];
        }
    }

    await updateDoc(prodDocRef, { gdTrendData: gdTrend });
    console.log('🎉 SUKSES! Data Denpasar bulan 6, 7, 8, dan 9 berhasil diperbarui di Firestore!');

    console.log('\nRingkasan Terkini Denpasar di Firestore:');
    for (const m of Object.keys(gdTrend).sort()) {
        console.log(`  [${m}] Induk: ${gdTrend[m]['DENPASAR'] || 0} | CW: ${gdTrend[m]['DENPASAR - CELLULAR WORLD'] || 0} | PG: ${gdTrend[m]['DENPASAR - PLANET GADGET'] || 0}`);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
