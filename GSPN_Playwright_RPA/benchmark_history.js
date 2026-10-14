const { chromium } = require('playwright');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
const config = require('./config');

const delay = ms => new Promise(res => setTimeout(res, ms));

const firebaseConfig = {
    apiKey: config.FIREBASE_API_KEY,
    authDomain: config.FIREBASE_PROJECT_ID + ".firebaseapp.com",
    projectId: config.FIREBASE_PROJECT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runBenchmark() {
    console.log("Mulai BENCHMARK 5 Tiket...");
    const prodSnap = await getDoc(doc(db, 'dashboard_data', 'latest_prod'));
    let latestProd = [];
    if (prodSnap.exists()) {
        latestProd = prodSnap.data().data || [];
    }
    
    if(latestProd.length === 0) {
        console.log("Tidak ada tiket.");
        return;
    }

    const testTickets = latestProd.slice(0, 5);
    console.log(`Mengambil 5 tiket pertama dari total ${latestProd.length}...`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: config.STORAGE_STATE_PATH });
    const page = await context.newPage();

    await page.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
    await delay(2000);

    const startTime = Date.now();

    for (const ticket of testTickets) {
        const jobNo = ticket.jobNo;
        console.log(`> Memproses ${jobNo}...`);
        
        try {
            const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(()=>null);
            await page.evaluate((jno) => {
                window.open(`https://biz2.samsungcsportal.com/gspn/operate.do?cmd=ServiceOrderDetailLiteCmd&objectID=${jno}`, 'GSPN_Popup_' + jno);
            }, jobNo);
            
            const popupPage = await popupPromise;
            if (popupPage) {
                await popupPage.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(()=>{});
                await delay(1500);
                await popupPage.close().catch(()=>{});
            }
        } catch (e) {}
        
        await delay(2000);
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    console.log(`Waktu untuk 5 tiket: ${durationMs} ms`);
    console.log(`Rata-rata per tiket: ${durationMs / 5} ms`);
    console.log(`Estimasi untuk ${latestProd.length} tiket: ${(durationMs / 5 * latestProd.length) / 1000 / 60} menit`);

    await browser.close();
}

runBenchmark().catch(console.error);
