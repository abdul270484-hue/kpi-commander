const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { loginAndSaveSession } = require('./auth');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function downloadAscData(page2, asc, downloadDir, savePrefix = 'SO', attempt = 1) {
    const ascValue = asc.code;
    const ascLabel = asc.name;

    try {
        // 1. Klik Service Tracking
        await page2.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 5000 });
        const leftMenusFrame = page2.frameLocator('iframe[name="leftMenus"]');
        await leftMenusFrame.locator('iframe[name="b2BLeftMenuScroll"]').waitFor({ state: 'attached', timeout: 5000 });
        const b2bScrollFrame = leftMenusFrame.frameLocator('iframe[name="b2BLeftMenuScroll"]');

        await b2bScrollFrame.getByRole('cell', { name: 'Service Tracking' }).first().click({ timeout: 5000 });

        // 2. Klik Service Order Excel Download
        await b2bScrollFrame.getByRole('cell', { name: 'Service Order Excel Download', exact: true }).first().click({ timeout: 5000 });

        // 3. Tunggu load state
        await page2.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

        // 4. Akses rightContents frame
        const rightContentsFrame = page2.frameLocator('iframe[name="rightContents"]');
        await rightContentsFrame.locator('#status1').waitFor({ state: 'visible', timeout: 15000 });

        // 5. Tunggu dropdown Ship-to-Branch
        await rightContentsFrame.locator('#asc_code option:not([value=""])').first().waitFor({ state: 'attached', timeout: 8000 });

        // 6. Pilih Status ALL & Pilih ASC Code (Opsi 4: Dipangkas dari 2500ms menjadi 700ms)
        await rightContentsFrame.locator('#status1').selectOption('ALL');
        await delay(200);
        await rightContentsFrame.locator('#asc_code').selectOption(ascValue);
        await delay(500);

        // 7. Klik Search & tangkap download
        const downloadPromise = page2.waitForEvent('download', { timeout: 40000 });
        const searchButton = rightContentsFrame.locator('.btn_padT');
        if (await searchButton.count() > 0) {
            await searchButton.first().click({ timeout: 8000 });
        } else {
            const fallbackBtn = rightContentsFrame.getByRole('row', { name: 'Quick Search (Open Data) \u00a0 \u00a0 Bulk Search (All Data) \u00a0 \u00a0 \u00a0 Search', exact: true }).getByRole('link');
            if (await fallbackBtn.count() > 0) {
                await fallbackBtn.first().click({ timeout: 8000 });
            } else {
                await rightContentsFrame.locator('a:has-text("Search"), a:has-text("Download")').first().click({ timeout: 8000 });
            }
        }

        const download = await downloadPromise;
        const savePath = path.join(downloadDir, `${savePrefix}_${asc.short}_${Date.now()}.xls`);
        await download.saveAs(savePath);
        return savePath;
    } catch (e) {
        throw e;
    }
}

async function scrapeRedoOrders(mainPage, businessBtn, branchList, downloadedFiles) {
    console.log('\n==============================================');
    console.log(`  🔍 [===] MEMULAI PENCARIAN REDO ORDERS (5 WORKER PARALEL, ${branchList.length} CABANG)`);
    console.log('==============================================');

    const allRedoItems = [];
    const CONCURRENCY = Math.min(5, branchList.length);

    const openRedoTabForBatch = async (workerId) => {
        await mainPage.bringToFront();
        await delay(500);
        const popupPromise = mainPage.waitForEvent('popup', { timeout: 30000 });
        await businessBtn.click({ timeout: 5000 });
        const p2 = await popupPromise;
        p2.on('dialog', async d => { await d.accept().catch(() => {}); });
        await delay(2000);

        // 1. Klik Service Tracking -> Service Order Management Light
        await p2.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 15000 });
        const leftMenusFrame = p2.frameLocator('iframe[name="leftMenus"]');
        const b2bScrollFrame = leftMenusFrame.frameLocator('iframe[name="b2BLeftMenuScroll"]');

        await b2bScrollFrame.getByRole('cell', { name: 'Service Tracking' }).first().click({ timeout: 5000 }).catch(() => {});
        await delay(600);
        await b2bScrollFrame.getByRole('cell', { name: 'Service Order Management Light', exact: true }).first().click({ timeout: 5000 }).catch(() => {});

        await p2.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        
        let rightFrame = null;
        for (let attempt = 0; attempt < 25; attempt++) {
            rightFrame = p2.frames().find(f => f.name() === 'rightContents');
            if (rightFrame) {
                const hasForm = await rightFrame.evaluate(() => {
                    return Array.from(document.querySelectorAll('select')).some(s => s.name === 'asc_code' || s.id === 'asc_code' || s.name === 'ASC_CODE' || (s.closest('tr') && s.closest('tr').innerText.includes('Ship to Branch')));
                }).catch(() => false);
                if (hasForm) break;
            }
            await delay(800);
        }

        if (!rightFrame) throw new Error(`[Worker ${workerId}] Gagal memuat form Service Order Management Light`);
        return { p2, rightFrame };
    };

    const statusList = [
        { value: 'ST010', text: 'Assigned to Service Center' },
        { value: 'ST015', text: 'Acknowledged (ASC)' },
        { value: 'ST025', text: 'Engineer Assigned' },
        { value: 'ST030', text: 'Pending' },
        { value: 'ST035', text: 'Repair Completed' }
    ];

    try {
        console.log(`  -> Mempersiapkan ${CONCURRENCY} Tab Worker untuk REDO (Staggered 1.5s)...`);
        const workerTabs = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            const tabData = await openRedoTabForBatch(i + 1);
            workerTabs.push(tabData);
            await delay(1500); // Stagger 1.5s agar event popup tidak tabrakan
        }

        console.log(`  ✅ Semua ${CONCURRENCY} Tab Worker REDO Siap! Menjalankan antrean paralel...`);
        const redoQueue = [...branchList];
        let branchIndex = 0;

        const workerLoop = async (workerId, tabData) => {
            const { p2, rightFrame } = tabData;
            while (redoQueue.length > 0) {
                const asc = redoQueue.shift();
                if (!asc) break;
                branchIndex++;
                const currentIdx = branchIndex;

                // TIP DARI USER: Jika SO kosong, skip REDO
                const soFile = downloadedFiles.soFiles.find(f => f.code === asc.code);
                if (soFile) {
                    try {
                        const html = fs.readFileSync(soFile.path, 'utf8');
                        const trCount = (html.match(/<tr/gi) || []).length;
                        if (trCount <= 3) {
                            console.log(`  [W${workerId}] [REDO ${currentIdx}/${branchList.length}] [-] Skip ${asc.short} (SO Kosong)`);
                            continue;
                        }
                    } catch(e) {}
                }

                console.log(`  [W${workerId}] [REDO ${currentIdx}/${branchList.length}] Cabang: ${asc.short} (${asc.code})`);

                try {
                    let currentRightFrame = p2.frames().find(f => f.name() === 'rightContents') || rightFrame;

                    // 1. Pilih Ship to Branch
                    await currentRightFrame.evaluate((branchCode) => {
                        const selects = Array.from(document.querySelectorAll('select'));
                        for (const s of selects) {
                            const tr = s.closest('tr');
                            const rowText = tr ? tr.innerText : '';
                            if (rowText.includes('Ship to Branch') || s.name === 'asc_code' || s.id === 'asc_code' || s.name === 'ASC_CODE') {
                                for (let i = 0; i < s.options.length; i++) {
                                    const opt = s.options[i];
                                    if (opt.value.includes(branchCode) || opt.text.includes(branchCode)) {
                                        s.selectedIndex = i;
                                        s.dispatchEvent(new Event('change', { bubbles: true }));
                                        break;
                                    }
                                }
                                break;
                            }
                        }
                    }, asc.code).catch(() => {});
                    await delay(100);

                    // 2. Loop 5 Status
                    for (let s = 0; s < statusList.length; s++) {
                        const st = statusList[s];
                        currentRightFrame = p2.frames().find(f => f.name() === 'rightContents') || currentRightFrame;

                        try {
                            await currentRightFrame.evaluate((val) => {
                                const selects = Array.from(document.querySelectorAll('select'));
                                selects.forEach(sel => {
                                    const tr = sel.closest('tr');
                                    const rowText = tr ? tr.innerText : '';
                                    const selName = (sel.name || sel.id || '').toUpperCase();

                                    if (selName === 'STATUS' || selName === 'STATUS1' || rowText.includes('Status')) {
                                        for (let i = 0; i < sel.options.length; i++) {
                                            if (sel.options[i].value === val || sel.options[i].text.includes(val)) {
                                                sel.selectedIndex = i;
                                                sel.dispatchEvent(new Event('change', { bubbles: true }));
                                                break;
                                            }
                                        }
                                    }

                                    if (selName === 'REDO' || rowText.includes('REDO')) {
                                        for (let i = 0; i < sel.options.length; i++) {
                                            if (sel.options[i].value.toUpperCase() === 'Y' || sel.options[i].text.trim().toUpperCase() === 'YES') {
                                                sel.selectedIndex = i;
                                                sel.dispatchEvent(new Event('change', { bubbles: true }));
                                                break;
                                            }
                                        }
                                    }
                                });

                                if (typeof goSearch === 'function') {
                                    goSearch();
                                } else if (typeof doSearch === 'function') {
                                    doSearch();
                                } else {
                                    const btn = Array.from(document.querySelectorAll('a, input, button')).find(el => {
                                        const t = (el.innerText || el.value || '').trim();
                                        return t === 'Search' || t === 'Quick Search' || (el.className && el.className.includes('btn_padT'));
                                    });
                                    if (btn) btn.click();
                                }
                            }, st.value).catch(() => {});

                            await delay(650);

                            currentRightFrame = p2.frames().find(f => f.name() === 'rightContents') || currentRightFrame;
                            const extractedRows = await currentRightFrame.evaluate((ctx) => {
                                const results = [];
                                const trs = Array.from(document.querySelectorAll('table tr'));
                                for (const tr of trs) {
                                    const tds = Array.from(tr.querySelectorAll('td'));
                                    if (tds.length < 8) continue;
                                    const textCells = tds.map(td => td.innerText.trim());
                                    
                                    const col0 = textCells[0] || '';
                                    if (!/^\d+$/.test(col0)) continue;

                                    const col1 = textCells[1] || '';
                                    const matchJob = col1.match(/\b(\d{10})\b/);
                                    const jobNo = matchJob ? matchJob[1] : null;
                                    
                                    if (jobNo) {
                                        const lines = col1.split('\n').map(l => l.replace(/Edit/gi, '').trim()).filter(Boolean);
                                        const customer = lines.length > 1 ? lines[1] : '-';
                                        const model = textCells[5] || '-';
                                        const statusVal = textCells[7] || ctx.statusName || 'Pending';

                                        results.push({
                                            jobNo: jobNo,
                                            asc: ctx.branchInfo.short || ctx.branchInfo.name || 'ASC',
                                            model: model,
                                            engineer: `PIC ${ctx.branchInfo.short || 'ASC'}`,
                                            customer: customer,
                                            status: statusVal
                                        });
                                    }
                                }
                                return results;
                            }, { branchInfo: asc, statusName: st.text }).catch(() => []);

                            if (extractedRows && extractedRows.length > 0) {
                                console.log(`  [W${workerId}] >>> [OK] ${extractedRows.length} REDO di ${asc.short} [${st.value}]!`);
                                extractedRows.forEach(r => {
                                    if (!allRedoItems.find(x => x.jobNo === r.jobNo)) {
                                        allRedoItems.push(r);
                                    }
                                });
                            }
                        } catch (errStatus) {
                            // Abaikan error per-status
                        }
                        await delay(50);
                    }
                } catch (errBranch) {
                    console.log(`  [W${workerId}] [WARN] Skip Cabang ${asc.short}: ${errBranch.message.substring(0, 35)}`);
                }
                await delay(50);
            }

            await p2.close().catch(() => {});
        };

        await Promise.all(workerTabs.map((tab, idx) => workerLoop(idx + 1, tab)));

        // Pastikan semua tab tertutup
        for (const tabData of workerTabs) {
            if (tabData && tabData.p2 && !tabData.p2.isClosed()) {
                await tabData.p2.close().catch(() => {});
            }
        }
    } catch (err) {
        console.warn('  [WARN] REDO Scrape Error:', err.message);
    }

    console.log(`  🎉 [SELESAI] Penarikan REDO selesai! Total ${allRedoItems.length} unit REDO ditemukan.`);
    return allRedoItems;
}

async function scrapeAllBranches(headless = true, sampleOnly = false, onProgress = null) {
    console.log('==============================================');
    console.log(`  >>> GSPN PLAYWRIGHT RPA - ${sampleOnly ? 'SAMPLE TEST (3 CABANG)' : 'ULTRA FAST NATIONAL SCRAPER'}`);
    console.log(`  Waktu: ${new Date().toLocaleString('id-ID')}`);
    console.log('==============================================');

    ensureDir(config.DOWNLOAD_DIR);

    if (!fs.existsSync(config.STORAGE_STATE_PATH)) {
        console.log('[WARN] Sesi login belum tersimpan. Menjalankan proses login awal...');
        await loginAndSaveSession();
    }

    const browser = await chromium.launch({
        headless: headless,
        args: [
            '--start-maximized',
            '--disable-web-security',
            '--no-default-browser-check',
            '--disable-save-password-bubble'
        ]
    });

    let context;
    try {
        context = await browser.newContext({
            storageState: config.STORAGE_STATE_PATH,
            viewport: null,
            acceptDownloads: true
        });
    } catch (e) {
        console.log('[WARN] Sesi kedaluwarsa atau korup. Memperbarui sesi...');
        await browser.close();
        await loginAndSaveSession();
        return await scrapeAllBranches(headless);
    }

    const mainPage = await context.newPage();
    mainPage.on('dialog', async dialog => { await dialog.accept().catch(() => {}); });

    console.log(`\n1. Membuka portal GSPN: ${config.GSPN_URL}`);
    try {
        await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (e) {}

    await delay(2500);

    // Cek Login
    let hasLogin = false;
    for (const f of mainPage.frames()) {
        if (await f.locator('input[name="LOGIN_PWD"], input[type="password"]').count() > 0) {
            hasLogin = true;
            break;
        }
    }
    if (hasLogin || mainPage.url().includes('login') || mainPage.url().includes('Login')) {
        console.log('[WARN] Sesi GSPN telah habis. Melakukan login ulang...');
        await browser.close();
        await loginAndSaveSession();
        return await scrapeAllBranches(headless);
    }

    // Ambil menu frame
    const menuFrame = mainPage.frameLocator('frame[name="menu"]');
    const businessBtn = menuFrame.getByText('Business').first();
    await businessBtn.waitFor({ state: 'visible', timeout: 25000 });

    // 2. Ambil seluruh daftar cabang dari tab inisialisasi awal
    console.log('\n2. Mengambil daftar cabang (ASC Code) dari GSPN...');
    let branchList = [];

    let initTab = null;
    try {
        const popupPromise = mainPage.waitForEvent('popup', { timeout: 20000 });
        await businessBtn.click({ timeout: 5000 });
        initTab = await popupPromise;
        initTab.on('dialog', async d => { await d.accept().catch(() => {}); });

        await initTab.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 15000 });
        const leftMenus = initTab.frameLocator('iframe[name="leftMenus"]');
        const b2bScroll = leftMenus.frameLocator('iframe[name="b2BLeftMenuScroll"]');

        await b2bScroll.getByRole('cell', { name: 'Service Tracking' }).first().click({ timeout: 5000 });
        await b2bScroll.getByRole('cell', { name: 'Service Order Excel Download', exact: true }).first().click({ timeout: 5000 });

        const rightContents = initTab.frameLocator('iframe[name="rightContents"]');
        await rightContents.locator('#status1').waitFor({ state: 'visible', timeout: 15000 });

        const ascDropdown = rightContents.locator('#asc_code');
        await ascDropdown.locator('option:not([value=""])').first().waitFor({ state: 'attached', timeout: 10000 });

        const rawOptions = await ascDropdown.locator('option').all();
        const seen = new Set();

        for (const opt of rawOptions) {
            const val = (await opt.evaluate(el => el.value)).trim();
            const lbl = (await opt.evaluate(el => el.textContent)).trim();

            const isPlaceholder = (
                !val ||
                seen.has(val) ||
                val.toLowerCase() === 'all' ||
                val.toLowerCase() === 'select' ||
                lbl.toLowerCase().includes('select') ||
                lbl.toLowerCase().includes('pilih') ||
                lbl === ''
            );

            if (!isPlaceholder) {
                seen.add(val);
                branchList.push({ code: val, name: lbl });
            }
        }
    } catch (e) {
        console.warn('[WARN] Gagal membaca options #asc_code secara dinamis:', e.message);
    } finally {
        if (initTab && !initTab.isClosed()) await initTab.close().catch(() => {});
    }

    if (!branchList || branchList.length === 0) {
        branchList = config.ASC_CODES.map(c => ({ code: c.code, name: c.name, short: c.short }));
    } else {
        branchList = branchList.map(b => {
            let found = config.ASC_CODES.find(c => c.code === b.code);
            let short = found ? found.short : b.name.substring(0, 15).trim().replace(/[^A-Za-z0-9\s]/g, '').replace(/\s+/g, '_');
            return { code: b.code, name: b.name, short: short };
        });
    }

    if (sampleOnly) {
        console.log('[INFO] Mode SAMPLE AKTIF: Hanya mengambil 3 cabang target (DENPASAR, KUPANG, SINGARAJA)...');
        const targetCodes = ['0004924441', '0004925234', '0004925270'];
        const filtered = branchList.filter(b => targetCodes.includes(b.code));
        if (filtered.length > 0) {
            branchList = filtered;
        } else {
            branchList = config.ASC_CODES.map(c => ({ code: c.code, name: c.name, short: c.short }));
        }
    }

    console.log(`\n[OK] Berhasil menetapkan ${branchList.length} cabang (${branchList.map(b => b.short).join(', ')}).`);
    console.log(`>>> Memulai fast-download untuk ${branchList.length} cabang...`);

    const downloadedFiles = {
        soFiles: [],
        gdFiles: [],
        statusFiles: []
    };

    // ==========================================
    // 3. FAST LOOP SERVICE ORDER DOWNLOAD PER CABANG (PERSIS PYTHON SCRIPT)
    // ==========================================
    console.log('\n==============================================');
    console.log(`  >>> PROSES FAST-DOWNLOAD SERVICE ORDER (${branchList.length} CABANG)`);
    console.log('==============================================');

    let failedBranches = [];

    for (let i = 0; i < branchList.length; i++) {
        const asc = branchList[i];
        process.stdout.write(`[SO ${i + 1}/${branchList.length}] ${asc.short} (${asc.code})... `);

        let page2 = null;
        try {
            await mainPage.bringToFront();
            await delay(200);

            const popupPromise = mainPage.waitForEvent('popup', { timeout: 15000 });
            await businessBtn.click({ timeout: 5000 });
            page2 = await popupPromise;
            await page2.bringToFront();
            page2.on('dialog', async d => { await d.accept().catch(() => {}); });

            const soPath = await downloadAscData(page2, asc, config.DOWNLOAD_DIR, 'SO', 1);
            if (soPath) {
                downloadedFiles.soFiles.push({ branch: asc.short, name: asc.name, code: asc.code, path: soPath });
                console.log(`[OK] SO OK`);
            }
            if (onProgress) onProgress({ phase: 'SO', current: i + 1, total: branchList.length, branch: asc.short, ok: !!soPath });
        } catch (err) {
            console.log(`[WARN] Gagal (${err.message.substring(0, 45)}), masuk antrean retry.`);
            failedBranches.push(asc);
        } finally {
            if (page2 && !page2.isClosed()) {
                await page2.close().catch(() => {});
            }
        }

        await delay(200);
    }

    // RETRY QUEUE UNTUK CABANG YANG TIMEOUT
    if (failedBranches.length > 0) {
        console.log(`\n>>> Memulai RETRY untuk ${failedBranches.length} cabang yang gagal...`);
        const retryList = [...failedBranches];
        failedBranches = [];

        for (let j = 0; j < retryList.length; j++) {
            const asc = retryList[j];
            process.stdout.write(`[RETRY ${j + 1}/${retryList.length}] ${asc.short}... `);

            let page2 = null;
            try {
                await mainPage.bringToFront();
                await delay(1000);

                const popupPromise = mainPage.waitForEvent('popup', { timeout: 20000 });
                await businessBtn.click({ timeout: 5000 });
                page2 = await popupPromise;
                await page2.bringToFront();
                page2.on('dialog', async d => { await d.accept().catch(() => {}); });

                const soPath = await downloadAscData(page2, asc, config.DOWNLOAD_DIR, 'SO', 2);
                if (soPath) {
                    downloadedFiles.soFiles.push({ branch: asc.short, name: asc.name, code: asc.code, path: soPath });
                    console.log(`[OK]`);
                }
            } catch (err) {
                console.log(`[FAIL] Tetap gagal: ${err.message.substring(0, 45)}`);
            } finally {
                if (page2 && !page2.isClosed()) {
                    await page2.close().catch(() => {});
                }
            }
        }
    }

    console.log('\n==============================================');
    console.log('  [SELESAI] PROSES SERVICE ORDER SELESAI!');
    console.log(`  Total File Berhasil : ${downloadedFiles.soFiles.length} / ${branchList.length}`);
    console.log('==============================================\n');



    // ==========================================
    // 4. CUSTOMER LOOKUP (MONITORING BY STATUS) - PULL "ALL"
    // ==========================================
    console.log('\n==============================================');
    console.log('  ?? MENGAMBIL DATA CUSTOMER LOOKUP (ALL BRANCHES)');
    console.log('==============================================');
    
    if (onProgress) onProgress({ phase: 'STATUS', current: 0, total: 1, branch: 'ALL', ok: true });
    
    downloadedFiles.statusFiles = [];
    let statusTab = null;
    try {
        await mainPage.bringToFront();
        await delay(500);
        const popupPromise = mainPage.waitForEvent('popup', { timeout: 30000 });
        await businessBtn.click();
        statusTab = await popupPromise;
        statusTab.on('dialog', async d => { await d.accept().catch(()=>{}); });
        await delay(2000);
        
        await statusTab.locator('iframe[name="leftMenus"]').waitFor({ state: 'attached', timeout: 15000 });
        const leftMenus = statusTab.frameLocator('iframe[name="leftMenus"]');
        const b2bScroll = leftMenus.frameLocator('iframe[name="b2BLeftMenuScroll"]');

        await b2bScroll.getByRole('cell', { name: 'Service Tracking' }).first().click({ timeout: 5000 });
        await b2bScroll.getByRole('cell', { name: 'Service Order Monitoring(by Status)', exact: true }).first().click({ timeout: 5000 });
        
        let rightFrame = null;
        for (let attempt = 0; attempt < 20; attempt++) {
            rightFrame = statusTab.frames().find(f => f.name() === 'rightContents');
            if (rightFrame) {
                try {
                    const found = await rightFrame.evaluate(() => !!document.querySelector('#ASC_CODE') || !!document.querySelector('select[name="asc_code"]'));
                    if (found) break;
                } catch (_) {}
            }
            await delay(1000);
        }
        if (!rightFrame) throw new Error("Failed to load Status tab");
        
        // 1. Pilih ALL dan trigger change, TANPA KLIK SEARCH
        await rightFrame.evaluate(() => {
            const sel = document.querySelector('#ASC_CODE') || document.querySelector('select[name="asc_code"]');
            if (sel) { 
                let idx = 0;
                for(let i=0; i<sel.options.length; i++) {
                    if(sel.options[i].value === 'ALL' || sel.options[i].text.toUpperCase() === 'ALL') idx = i;
                }
                sel.selectedIndex = idx;
                sel.dispatchEvent(new Event('change', { bubbles: true })); 
            }
        });
        
        await delay(3000); // Tunggu loading ajax change asc code
        
        // 2. Langsung panggil goSVCList ('ALL', '', 'ALL', 'TOTAL', '999999')
        rightFrame = statusTab.frames().find(f => f.name() === 'rightContents');
        await rightFrame.evaluate(() => { 
            if (typeof goSVCList === 'function') goSVCList('ALL', '', 'ALL', 'TOTAL', '999999'); 
        }).catch(() => {});
        console.log('  ? Dipanggil goSVCList untuk TOTAL (ALL Branches).');

        // 3. Tunggu list termuat
        console.log('  ? Menunggu data customer dimuat (max 45 detik)...');
        for (let i = 0; i < 45; i++) {
            await delay(1000);
            rightFrame = statusTab.frames().find(f => f.name() === 'rightContents');
            const rowCount = await rightFrame.evaluate(() => {
                const tbody = document.getElementById('listReportTableBody');
                return tbody ? tbody.querySelectorAll('tr').length : 0;
            }).catch(() => 0);
            if (rowCount > 0) {
                console.log('  ? Data customer berhasil dimuat: ' + rowCount + ' baris.');
                break;
            }
        }
        await delay(2000); // buffer
        
        // 4. Download file
        rightFrame = statusTab.frames().find(f => f.name() === 'rightContents');
        const downloadPromise = statusTab.waitForEvent('download', { timeout: 60000 }).catch(() => null);
        
        await rightFrame.evaluate(() => {
            const dlBtn = Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Download' || a.innerText.trim() === 'Excel Download' || a.innerText.trim() === 'Excel');
            if (dlBtn) dlBtn.click();
            else { if (typeof dnEx === 'function') dnEx(); }
        }).catch(()=>{});
        
        const download = await downloadPromise;
        if (download) {
            const statusPath = require('path').join(config.DOWNLOAD_DIR, 'STATUS_CUST_ALL_' + Date.now() + '.xls');
            await download.saveAs(statusPath);
            downloadedFiles.statusFiles.push({ branch: 'ALL', name: 'ALL', code: 'ALL', path: statusPath });
            console.log('  ? Customer Lookup File OK: ' + require('path').basename(statusPath));
        } else {
            console.log('  ?? Customer Lookup File kosong/Timeout');
        }

    } catch (err) {
        console.log('  ?? Customer Lookup Error: ' + err.message.substring(0, 40));
    } finally {
        if (statusTab && !statusTab.isClosed()) await statusTab.close().catch(()=>{});
    }
    // ==========================================
    // 5. REDO ORDERS SCRAPE (SERVICE ORDER MANAGEMENT LIGHT)
    // ==========================================
    downloadedFiles.redoItems = [];
    try {
        const redoResults = await scrapeRedoOrders(mainPage, businessBtn, branchList, downloadedFiles);
        downloadedFiles.redoItems = redoResults || [];
    } catch (err) {
        console.warn('  [WARN] Scrape Redo Orders warning:', err.message);
    }

            // ==========================================
    // PARALLEL GD (PRODUCTIVITY) SCRAPE
    // ==========================================
    console.log('\n==============================================');
    console.log(`  >>> PROSES BATCH PARALLEL GD (${branchList.length} CABANG, 5 TAB)`);
    console.log('==============================================');
    
    if (onProgress) onProgress({ phase: 'GD BATCH', current: 0, total: branchList.length, branch: 'Memulai...', ok: true });
    
    const gdQueue = [...branchList];
    let gdCompleted = 0;
    
    const openGdTabForBatch = async () => {
        await mainPage.bringToFront();
        await delay(500);
        const popupPromise = mainPage.waitForEvent('popup', { timeout: 30000 });
        await businessBtn.click();
        const p2 = await popupPromise;
        p2.on('dialog', async d => { await d.accept().catch(()=>{}); });
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

    const workerGD = async (workerId) => {
        let pageData = null;
        while (gdQueue.length > 0) {
            const asc = gdQueue.shift();
            try {
                if (!pageData) pageData = await openGdTabForBatch();
                const { p2 } = pageData;
                
                let currentRightFrame = p2.frames().find(f => f.name() === 'rightContents');
                if (!currentRightFrame) {
                    for (let attempt = 0; attempt < 15; attempt++) {
                        await delay(1000);
                        currentRightFrame = p2.frames().find(f => f.name() === 'rightContents');
                        if (currentRightFrame) break;
                    }
                }
                if (!currentRightFrame) throw new Error("rightContents frame not found");

                await currentRightFrame.evaluate(val => {
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
                
                await delay(600); // Partner dropdown settle

                const now = new Date();
                const pad = n => String(n).padStart(2, '0');
                const firstDay = `01.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
                const today    = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
                
                currentRightFrame = p2.frames().find(f => f.name() === 'rightContents') || currentRightFrame;
                await currentRightFrame.evaluate(({ from, to }) => {
                    const fi = document.querySelector('#FromDate');
                    const ti = document.querySelector('#ToDate');
                    if (fi) fi.value = from;
                    if (ti) ti.value = to;
                    if (typeof displaySearch === 'function') displaySearch(0, 0);
                    else {
                        const btn = Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Search');
                        if (btn) btn.click();
                    }
                }, { from: firstDay, to: today }).catch(()=>{});
                
                await delay(4000); // Tunggu query server selesai
                
                currentRightFrame = p2.frames().find(f => f.name() === 'rightContents') || currentRightFrame;
                const downloadPromise = p2.waitForEvent('download', { timeout: 30000 }).catch(() => null);
                await currentRightFrame.evaluate(() => {
                    if (typeof downloadList === 'function') downloadList();
                    else {
                        const dlBtn = Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Download');
                        if (dlBtn) dlBtn.click();
                    }
                }).catch(()=>{});
                
                const download = await downloadPromise;
                if (download) {
                    const gdPath = path.join(config.DOWNLOAD_DIR, `GD_${asc.short}_${Date.now()}.xls`);
                    await download.saveAs(gdPath);
                    downloadedFiles.gdFiles.push({ branch: asc.short, name: asc.name, code: asc.code, path: gdPath });
                    console.log(`  [W${workerId}] [OK] GD OK: ${asc.short}`);
                } else {
                    console.log(`  [W${workerId}] [-] GD kosong: ${asc.short}`);
                }
            } catch (err) {
                console.log(`  [W${workerId}] [WARN] GD Error (${asc.short}): ${err.message.substring(0, 40)}`);
                if (pageData && pageData.p2) await pageData.p2.close().catch(()=>{});
                pageData = null;
            }
            gdCompleted++;
            if (onProgress) onProgress({ phase: 'GD', current: gdCompleted, total: branchList.length, branch: asc.short, ok: true });
        }
        if (pageData && pageData.p2) await pageData.p2.close().catch(()=>{});
    };

    // STRICT SEQUENTIAL EXECUTION (CONCURRENCY = 1):
    // Prevents GSPN server-side session crosstalk between partner dropdowns
    const CONCURRENCY = Math.min(5, branchList.length);
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(workerGD(i + 1));
        await delay(4000); // stagger 4 detik agar tidak tabrakan navigasi
    }
    await Promise.all(workers);
    console.log('  [SELESAI] PROSES PARALLEL GD SELESAI!');

    // ==========================================
    



    // ==========================================
    // DAILY STATEMENT PARTS SALES (1X TARIKAN NASIONAL - SERVICE BRANCH ALL)
    // Sesuai arahan BOS: 1x tarikan nasional, Service Branch = ALL, tanggal 1 s/d hari ini
    // ==========================================
    console.log('\n==============================================');
    console.log('  🛒 [PARTS SALES] MENARIK DAILY STATEMENT PARTS SALES (1X TARIKAN NASIONAL - SERVICE BRANCH ALL)');
    console.log('==============================================');
    
    if (onProgress) onProgress({ phase: 'PARTS', current: 1, total: 1, branch: 'NASIONAL (ALL)', ok: true });
    downloadedFiles.partsFiles = [];

    const openPartsTabForBatch = async () => {
        await mainPage.bringToFront();
        await delay(500);
        const popupPromise = mainPage.waitForEvent('popup', { timeout: 30000 });
        await businessBtn.click();
        const p2 = await popupPromise;
        p2.on('dialog', async d => { await d.accept().catch(()=>{}); });
        await delay(2000);
        
        let rightFrame = p2.frames().find(f => f.name() === 'rightContents');
        if (!rightFrame) {
            for (let attempt = 0; attempt < 20; attempt++) {
                await delay(500);
                rightFrame = p2.frames().find(f => f.name() === 'rightContents');
                if (rightFrame) break;
            }
        }
        if (!rightFrame) throw new Error("Failed to find rightContents frame");

        // Buka langsung URL DailyStateParts.jsp
        await rightFrame.goto('https://biz2.samsungcsportal.com/acct/ascacct/DailyStateParts.jsp', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2000);
        
        return { p2, rightFrame };
    };

    try {
        const pageData = await openPartsTabForBatch();
        const { p2, rightFrame } = pageData;

        // 1. Pilih Service Branch: --ALL-- (value: "")
        await rightFrame.evaluate(() => {
            const partnerSel = document.querySelector('#Partner') || document.querySelector('select[name="Partner"]');
            if (partnerSel) {
                partnerSel.value = '';
                partnerSel.selectedIndex = 0;
                partnerSel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        await delay(1500);

        // 2. Set Tanggal S/O Date: 01.MM.YYYY s/d DD.MM.YYYY (1 - hari ini)
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const fromStr = '01.' + pad(now.getMonth() + 1) + '.' + now.getFullYear();
        const toStr = pad(now.getDate()) + '.' + pad(now.getMonth() + 1) + '.' + now.getFullYear();
        console.log(`  -> Filter Periode Penjualan: ${fromStr} s/d ${toStr} (Service Branch: ALL)...`);

        await rightFrame.evaluate(({ from, to }) => {
            const fi = document.querySelector('#FromDate');
            const ti = document.querySelector('#ToDate');
            if (fi) fi.value = from;
            if (ti) ti.value = to;

            const btn = Array.from(document.querySelectorAll('a, button, input[type="button"]')).find(b => (b.innerText || b.value || '').trim() === 'Search');
            if (btn) btn.click();
        }, { from: fromStr, to: toStr });

        console.log('  -> Menunggu query server GSPN selesai (10 detik)...');
        await delay(10000);

        // 3. Download file Excel nasional
        const downloadPromise = p2.waitForEvent('download', { timeout: 45000 }).catch(err => {
            console.log('  [WARN] Download timeout/error:', err.message);
            return null;
        });

        await rightFrame.evaluate(() => {
            const dlBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]')).find(b => {
                const t = (b.innerText || b.value || '').trim();
                return t === 'Download' || t === 'Excel Download' || t === 'Excel';
            });
            if (dlBtn) dlBtn.click();
        });

        const download = await downloadPromise;
        if (download) {
            const partsPath = path.join(config.DOWNLOAD_DIR, 'PARTS_SALES_NATIONAL_' + Date.now() + '.xls');
            await download.saveAs(partsPath);
            downloadedFiles.partsFiles.push({ branch: 'ALL', name: 'ALL BRANCHES', code: '', path: partsPath });
            console.log('  ✅ [OK] File Daily Statement Parts Sales Nasional (ALL) berhasil diunduh!');
        } else {
            console.log('  ⚠️ [WARN] File download parts sales tidak diterima.');
        }

        await p2.close().catch(() => {});
    } catch (err) {
        console.error('  ❌ [ERROR] Gagal saat penarikan parts sales nasional:', err.message);
    }
    console.log('  [SELESAI] PENARIKAN PARTS SALES NASIONAL SELESAI!');

    // ==========================================
    // 5. STOK CABANG AKSESORIS (JADWAL SESUAI ARAHAN TERBARU BOS)
    // 1. Di putaran awal hari ini
    // 2. Di rentang jam 15-an (15:00 - 15:59) hanya 1x
    // ==========================================
    try {
        delete require.cache[require.resolve('./branch_stock_engine')];
        const { shouldRunStockScrapeToday, getStockScrapeTriggerReason, scrapeStockOverview, syncBranchStockToFirestore, markStockScrapeDoneToday } = require('./branch_stock_engine');
        const triggerInfo = getStockScrapeTriggerReason ? getStockScrapeTriggerReason() : { shouldRun: shouldRunStockScrapeToday(), label: 'STOK OVERVIEW' };

        if (shouldRunStockScrapeToday()) {
            console.log('\n==============================================');
            console.log(`  >>> [${triggerInfo.label}] SCRAPE STOK CABANG GSPN (ADAPTOR & KABEL DATA)`);
            console.log('==============================================');
            if (onProgress) onProgress({ phase: 'STOCK', current: 0, total: 18, branch: `Membuka Stock Overview (${triggerInfo.label})...`, ok: true });

            // Eksekusi Multi-Tab 3 Worker Paralel (Hemat durasi dari ~98s ke ~23s)
            const stockResult = await scrapeStockOverview(mainPage, onProgress, businessBtn);

            if (stockResult.success && stockResult.stockRecords && stockResult.stockRecords.length > 0) {
                await syncBranchStockToFirestore(stockResult.stockRecords);
                markStockScrapeDoneToday({ totalRecords: stockResult.stockRecords.length });
                downloadedFiles.stockRecords = stockResult.stockRecords;
            }
        } else {
            console.log(`  ⚡ [STOCK SKIP] Stok cabang tidak ditarik pada putaran ini: ${triggerInfo.label}`);
        }
    } catch (stockErr) {
        console.warn('  ⚠️ [WARN] Error saat penarikan stok cabang:', stockErr.message);
    }



    await browser.close().catch(() => {});
    return downloadedFiles;
}

if (require.main === module) {
    scrapeAllBranches(false).catch(err => {
        console.error('Fatal Scraper Error:', err);
        process.exit(1);
    });
}

module.exports = { scrapeAllBranches };


