const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const config = require('./config');

const delay = ms => new Promise(res => setTimeout(res, ms));

const TEST_BRANCHES = [
    { code: '0004924441', short: 'DENPASAR' },
    { code: '0004924716', short: 'KUPANG' },
    { code: '0004924707', short: 'MANADO' },
    { code: '0004925270', short: 'SINGARAJA' }
];

const TARGET_DATE = '13.10.2026';
const OUTPUT_DIR = path.join(__dirname, 'temp_vol_in_test');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function runTest() {
    console.log(`Testing with smart dialog/download race for ${TEST_BRANCHES.length} branches on ${TARGET_DATE}...`);
    const startTime = Date.now();

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

        console.log('1. Opening GSPN portal...');
        await mainPage.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await delay(2000);

        const menuFrame = mainPage.frameLocator('frame[name="menu"]');
        const businessBtn = menuFrame.getByText('Business').first();

        console.log('2. Opening Business popup window (ONE TIME)...');
        const popupPromise = mainPage.waitForEvent('popup', { timeout: 35000 });
        await businessBtn.click();
        const p2 = await popupPromise;
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

        // Setup Bulk Search tab and date ONCE
        await rightFrame.evaluate(() => {
            const td2 = document.querySelector('#td2_02');
            if (td2) td2.click();
        });
        await delay(500);

        await rightFrame.evaluate(({ targetDate }) => {
            const f1 = document.querySelector('#req_date_from1');
            const t1 = document.querySelector('#req_date_to1');
            if (f1) { f1.value = targetDate; f1.dispatchEvent(new Event('change', { bubbles: true })); }
            if (t1) { t1.value = targetDate; t1.dispatchEvent(new Event('change', { bubbles: true })); }

            const fH = document.querySelector('#req_date_from');
            const tH = document.querySelector('#req_date_to');
            if (fH) fH.value = targetDate;
            if (tH) tH.value = targetDate;

            const s1 = document.querySelector('#status1');
            if (s1) { s1.selectedIndex = 0; s1.dispatchEvent(new Event('change', { bubbles: true })); }
            const s2 = document.querySelector('#status2');
            if (s2) { s2.selectedIndex = 0; s2.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { targetDate: TARGET_DATE });
        await delay(500);

        const results = {};

        // Loop branches WITHOUT closing popup!
        for (const branch of TEST_BRANCHES) {
            process.stdout.write(`   Pulling ${branch.short}... `);
            const t0 = Date.now();

            // Select branch
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
            await delay(300);

            // Smart dialog listener
            let dialogMessage = null;
            const onDialog = async (d) => {
                dialogMessage = d.message();
                await d.accept().catch(() => {});
            };
            p2.on('dialog', onDialog);

            const chunkFile = path.join(OUTPUT_DIR, `TEST_${branch.short}_${TARGET_DATE}.xls`);
            let counts = {};
            counts[branch.short] = 0;

            try {
                const dlPromise = p2.waitForEvent('download', { timeout: 6000 });
                await rightFrame.evaluate(() => {
                    if (typeof displaySearch === 'function') displaySearch();
                });

                // Race download against dialog or timeout
                const dl = await Promise.race([
                    dlPromise,
                    new Promise((_, reject) => {
                        const timer = setInterval(() => {
                            if (dialogMessage !== null) {
                                clearInterval(timer);
                                reject(new Error('DIALOG: ' + dialogMessage));
                            }
                        }, 100);
                        setTimeout(() => { clearInterval(timer); }, 6500);
                    })
                ]);

                await dl.saveAs(chunkFile);

                // Parse file
                const wb = XLSX.readFile(chunkFile, { cellFormula: false, cellHTML: false, cellText: false });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet);
                const seen = new Set();
                counts = {};
                rows.forEach(r => {
                    const so = r['Service Order No.'] || r['ASC Job No'] || r['No'];
                    if (!so || seen.has(so)) return;
                    seen.add(so);

                    let br = branch.short;
                    if (branch.short === 'DENPASAR') {
                        const cc = String(r['Collection Center Name'] || '').toUpperCase();
                        if (cc.includes('CELLULAR WORLD') || cc.includes('TEUKU')) br = 'DENPASAR - CELLULAR WORLD';
                        else if (cc.includes('PLANET GADGET') || cc.includes('GATOT')) br = 'DENPASAR - PLANET GADGET';
                        else br = 'DENPASAR';
                    }
                    counts[br] = (counts[br] || 0) + 1;
                });

            } catch (err) {
                if (err.message.includes('DIALOG')) {
                    // Dialog popped up (No data)
                    counts = { [branch.short]: 0 };
                } else {
                    // Timeout or other error
                    counts = { [branch.short]: 0 };
                }
            } finally {
                p2.off('dialog', onDialog);
            }

            console.log(`[${Date.now() - t0}ms] =>`, counts);
            Object.assign(results, counts);
        }

        console.log(`\nALL DONE in ${((Date.now() - startTime) / 1000).toFixed(1)}s! Final results:`, results);

    } finally {
        await browser.close().catch(() => {});
    }
}

runTest().catch(console.error);
