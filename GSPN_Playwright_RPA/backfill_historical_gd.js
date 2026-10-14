const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');
const config = require('./config');
const { shortenASC, parseProductivityFile } = require('./sync');

const delay = ms => new Promise(res => setTimeout(res, ms));

const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

async function backfillMonth(monthStr, browser, branchList) {
    console.log(`\n==============================================`);
    console.log(`  📥 Memulai Penarikan GD Historis: Bulan ${monthStr}`);
    console.log(`==============================================`);

    const [yearStr, mStr] = monthStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10); // 1-indexed

    const pad = n => String(n).padStart(2, '0');
    const lastDayNum = new Date(year, month, 0).getDate();
    const fromDate = `01.${pad(month)}.${year}`;
    const toDate = `${pad(lastDayNum)}.${pad(month)}.${year}`;

    console.log(`  Rentang Tanggal: ${fromDate} s/d ${toDate}`);

    const context = await browser.newContext({
        storageState: config.STORAGE_STATE_PATH,
        viewport: null,
        acceptDownloads: true
    });

    const mainPage = await context.newPage();
    mainPage.on('dialog', async d => await d.accept().catch(() => {}));

    await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await delay(2500);

    const menuFrame = mainPage.frameLocator('frame[name="menu"]');
    const businessBtn = menuFrame.getByText('Business').first();
    await businessBtn.waitFor({ state: 'visible', timeout: 25000 });

    const openGdTabForBatch = async () => {
        await mainPage.bringToFront();
        await delay(500);
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
        await clickInMenu('td#Accounting_top', 'Accounting');
        await delay(800);
        await clickInMenu('td#Accounting_2', 'Partner Accounting');
        await delay(800);
        await clickInMenu(null, 'Daily Repair Statement (Detail)');

        let rightFrame = null;
        for (let attempt = 0; attempt < 20; attempt++) {
            rightFrame = p2.frames().find(f => f.name() === 'rightContents');
            if (rightFrame) {
                try {
                    const found = await rightFrame.evaluate(() => !!document.querySelector('#Partner'));
                    if (found) break;
                } catch (_) {}
            }
            await delay(1000);
        }
        return { p2, rightFrame };
    };

    const gdQueue = [...branchList];
    let gdCompleted = 0;
    const branchCounts = {};

    const workerGD = async (workerId) => {
        let pageData = null;
        while (gdQueue.length > 0) {
            const asc = gdQueue.shift();
            try {
                if (!pageData) pageData = await openGdTabForBatch();
                const { p2, rightFrame } = pageData;

                await rightFrame.evaluate(val => {
                    const selects = Array.from(document.querySelectorAll('select'));
                    const branchSel = selects.find(s => s.id.toLowerCase().includes('branch') || s.name.toLowerCase().includes('branch') || s.id === 'asc_code');
                    const partnerSel = document.querySelector('#Partner') || selects.find(s => s.id.toLowerCase().includes('partner') || s.name.toLowerCase().includes('partner'));

                    if (branchSel) {
                        for (let i = 0; i < branchSel.options.length; i++) {
                            if (branchSel.options[i].value === val || branchSel.options[i].text.includes(val)) {
                                branchSel.selectedIndex = i;
                                branchSel.dispatchEvent(new Event('change', { bubbles: true }));
                                break;
                            }
                        }
                    }
                    if (partnerSel) {
                        for (let i = 0; i < partnerSel.options.length; i++) {
                            if (partnerSel.options[i].value === val || partnerSel.options[i].text.includes(val)) {
                                partnerSel.selectedIndex = i;
                                partnerSel.dispatchEvent(new Event('change', { bubbles: true }));
                                break;
                            }
                        }
                    }
                }, asc.code);

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
                }, { from: fromDate, to: toDate }).catch(() => {});

                await delay(2000);

                const downloadPromise = p2.waitForEvent('download', { timeout: 8000 }).catch(() => null);
                await rightFrame.evaluate(() => {
                    if (typeof downloadList === 'function') downloadList();
                    else {
                        const dlBtn = Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Download');
                        if (dlBtn) dlBtn.click();
                    }
                }).catch(() => {});

                const download = await downloadPromise;
                if (download) {
                    const tempPath = path.join(config.DOWNLOAD_DIR, `TEMP_HIST_GD_${asc.short}_${Date.now()}.xls`);
                    await download.saveAs(tempPath);

                    // Parse row count
                    try {
                        const rows = parseProductivityFile(tempPath);
                        // Row count excluding header (first 2 rows)
                        let count = 0;
                        for (let r = 2; r < rows.length; r++) {
                            if (rows[r] && rows[r].length > 0 && rows[r][0]) count++;
                        }
                        branchCounts[asc.short] = count;
                        console.log(`  [W${workerId}] 📊 [${monthStr}] ${asc.short}: ${count} GD`);
                    } catch (e) {
                        console.warn(`  [W${workerId}] Parse error ${asc.short}:`, e.message);
                    } finally {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    }
                } else {
                    console.log(`  [W${workerId}] ℹ️ [${monthStr}] ${asc.short}: 0 GD`);
                    branchCounts[asc.short] = 0;
                }
            } catch (err) {
                console.log(`  [W${workerId}] ⚠️ [${monthStr}] GD Error (${asc.short}): ${err.message.substring(0, 40)}`);
                if (pageData && pageData.p2) await pageData.p2.close().catch(() => {});
                pageData = null;
            }
            gdCompleted++;
        }
        if (pageData && pageData.p2) await pageData.p2.close().catch(() => {});
    };

    const CONCURRENCY = Math.min(5, branchList.length);
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(workerGD(i + 1));
        await delay(3000);
    }
    await Promise.all(workers);
    await context.close().catch(() => {});

    const totalMonthGd = Object.values(branchCounts).reduce((a, b) => a + b, 0);
    console.log(`✅ Bulan ${monthStr} selesai: ${Object.keys(branchCounts).length} cabang diproses, Total GD: ${totalMonthGd}`);
    return branchCounts;
}

async function main() {
    const args = process.argv.slice(2);
    const targetMonths = args.length > 0 ? args : ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05'];

    console.log('Target Backfill Months:', targetMonths);

    // Ambil daftar cabang unik
    const branchList = [];
    const seenCodes = new Set();
    config.ASC_CODES.forEach(asc => {
        if (!seenCodes.has(asc.code)) {
            seenCodes.add(asc.code);
            branchList.push(asc);
        }
    });

    console.log(`Total Cabang Unik: ${branchList.length}`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--start-maximized', '--disable-web-security', '--no-default-browser-check']
    });

    const results = {};

    try {
        for (const m of targetMonths) {
            results[m] = await backfillMonth(m, browser, branchList);
        }
    } finally {
        await browser.close().catch(() => {});
    }

    console.log('\n==============================================');
    console.log('☁️ Menyimpan Hasil Backfill ke Firestore...');
    console.log('==============================================');

    try {
        const prodDocRef = doc(db, 'dashboard_data', 'latest_prod');
        const snap = await getDoc(prodDocRef);
        if (!snap.exists()) {
            console.error('Document dashboard_data/latest_prod does not exist!');
            return;
        }

        const currentData = snap.data();
        const gdTrend = currentData.gdTrendData || {};

        for (const m in results) {
            gdTrend[m] = { ...(gdTrend[m] || {}), ...results[m] };
        }

        await updateDoc(prodDocRef, { gdTrendData: gdTrend });
        console.log('🎉 SUKSES! Firestore latest_prod.gdTrendData berhasil diperbarui!');
        console.log('Bulan yang kini tersedia di Firestore:', Object.keys(gdTrend).sort());
        for (const m of Object.keys(gdTrend).sort()) {
            const sum = Object.values(gdTrend[m]).reduce((a, b) => a + b, 0);
            console.log(`  - ${m}: ${sum} GD (${Object.keys(gdTrend[m]).length} cabang)`);
        }
    } catch (e) {
        console.error('Gagal update Firestore:', e);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
