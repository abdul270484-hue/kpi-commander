const { chromium } = require('playwright');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc, setDoc, collection, getDocs } = require('firebase/firestore');
const config = require('./config');
const { loginAndSaveSession } = require('./auth');

const delay = ms => new Promise(res => setTimeout(res, ms));

const agingConfig = {
  apiKey: "AIzaSyBLbVbEAZ_jvfkBD0YL_lXpVvIQAz0ZCLM",
  authDomain: "aging-commander.firebaseapp.com",
  projectId: "aging-commander",
  storageBucket: "aging-commander.firebasestorage.app",
  messagingSenderId: "286087165205",
  appId: "1:286087165205:web:07c7d7380b0c5a2ca8251c"
};

const app = initializeApp(agingConfig);
const db = getFirestore(app);

const WORKER_COUNT = 5;

async function runHistoryRPA() {
    console.log("==================================================");
    console.log(` ?? JARVIS HISTORY ENGINE (MULTI-TAB ${WORKER_COUNT}x) ??`);
    console.log("==================================================");
    console.log("Membaca antrian tiket dari Firebase (aging_tracking)...");

    let latestProd = [];
    try {
        const querySnapshot = await getDocs(collection(db, 'aging_tracking'));
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.status !== 'Repair Completed' && data.status !== 'Closed') {
                latestProd.push({ jobNo: docSnap.id, ...data });
            }
        });
    } catch(e) {
        console.error("Gagal membaca Firebase:", e);
        return;
    }

    if (latestProd.length === 0) {
        console.log("Tidak ada tiket pending. JARVIS HISTORY tidur lagi.");
        return;
    }

    console.log(`Ditemukan ${latestProd.length} tiket pending. Menyiapkan siluman Playwright...`);
    
    const fs = require('fs');
    if (!fs.existsSync(config.STORAGE_STATE_PATH)) {
        console.log("Session tidak ditemukan. Butuh login awal...");
        await loginAndSaveSession();
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: config.STORAGE_STATE_PATH });

    // Membagi tiket ke dalam 5 antrian (chunks)
    const chunks = Array.from({ length: WORKER_COUNT }, () => []);
    for (let i = 0; i < latestProd.length; i++) {
        chunks[i % WORKER_COUNT].push(latestProd[i]);
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    const workerPromises = chunks.map(async (chunk, workerId) => {
        if (chunk.length === 0) return;
        
        const wId = workerId + 1;
        const page = await context.newPage();
        
        console.log(`[Worker ${wId}] Masuk ke GSPN Main Portal...`);
        await page.goto(config.GSPN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{});
        await delay(3000);

        for (let i = 0; i < chunk.length; i++) {
            const ticket = chunk[i];
            const jobNo = ticket.jobNo;
            if (!jobNo) continue;

            console.log(`[Worker ${wId}] ?? (${i+1}/${chunk.length}) Tiket: ${jobNo}`);
            
            try {
                const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(()=>null);
                
                await page.evaluate((jno) => {
                    const targetUrl = `https://biz2.samsungcsportal.com/gspn/operate.do?cmd=ServiceOrderDetailLiteCmd&objectID=${jno}`;
                    window.open(targetUrl, 'GSPN_Popup_' + jno, 'width=1000,height=800');
                }, jobNo);
                
                const popupPage = await popupPromise;
                if (!popupPage) {
                    console.log(`[Worker ${wId}] ? Pop-up gagal terbuka untuk ${jobNo}`);
                    totalFailed++;
                    continue;
                }
                
                await popupPage.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(()=>{});
                await delay(1000); 

                const historyData = await popupPage.evaluate(() => {
                    const trs = Array.from(document.querySelectorAll('tr'));
                    const changeLogHeader = trs.find(tr => tr.innerText.includes('Changed Date') && tr.innerText.includes('Status') && tr.innerText.includes('Reason'));
                    if (!changeLogHeader) return null;
                    
                    const results = [];
                    let curr = changeLogHeader.nextElementSibling;
                    while(curr && curr.tagName === 'TR') {
                        const tds = curr.querySelectorAll('td');
                        if (tds.length >= 6) {
                            results.push({
                                dateStr: tds[1].innerText.trim(),
                                status: tds[4].innerText.trim(),
                                reason: tds[5].innerText.trim()
                            });
                        }
                        curr = curr.nextElementSibling;
                    }
                    return results;
                });
                
                await popupPage.close().catch(()=>{});

                if (historyData && historyData.length > 0) {
                    console.log(`[Worker ${wId}] ? ${jobNo}: Ditemukan ${historyData.length} baris riwayat.`);
                    
                    let parsedHistory = [];
                    for (let j = 0; j < historyData.length; j++) {
                        const row = historyData[j];
                        if (!row.dateStr) continue;
                        
                        const parts = row.dateStr.split(' ');
                        if (parts.length < 2) continue;
                        const dp = parts[0].split('.');
                        const tp = parts[1].split(':');
                        const isoStr = `${dp[2]}-${dp[1]}-${dp[0]}T${tp[0]}:${tp[1]}:${tp[2]}.000Z`;
                        const startDate = new Date(isoStr);
                        
                        let endDate = new Date();
                        if (j < historyData.length - 1) {
                            const np = historyData[j+1].dateStr.split(' ');
                            if (np.length >= 2) {
                                const ndp = np[0].split('.');
                                const ntp = np[1].split(':');
                                endDate = new Date(`${ndp[2]}-${ndp[1]}-${ndp[0]}T${ntp[0]}:${ntp[1]}:${ntp[2]}.000Z`);
                            }
                        }
                        
                        const durationDays = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
                        
                        parsedHistory.push({
                            status: row.status,
                            reason: row.reason,
                            startDate: startDate.toISOString(),
                            endDate: endDate.toISOString(),
                            durationDays: durationDays
                        });
                    }

                    await setDoc(doc(db, 'aging_tracking', jobNo), {
                        history: parsedHistory
                    }, { merge: true }).catch(err => {
                        console.log(`[Worker ${wId}] ? Gagal simpan ${jobNo} ke Firebase:`, err.message);
                    });
                    // Buang cache lokal aging_tracker agar history ini tidak tertimpa data lama
                    try { require('fs').unlinkSync(require('path').join(__dirname, '.aging_cache.json')); } catch (_) {}
                    
                } else {
                    console.log(`[Worker ${wId}] ?? ${jobNo}: Change Log kosong.`);
                }
                
                totalProcessed++;
            } catch (err) {
                console.log(`[Worker ${wId}] ? Error ${jobNo}:`, err.message);
                totalFailed++;
            }
            
            // Jeda aman antar tiket
            await delay(1500); 
        }
        await page.close().catch(()=>{});
    });

    await Promise.all(workerPromises);

    await browser.close();
    console.log("\n==================================================");
    console.log(` ?? JARVIS HISTORY ENGINE (MULTI-TAB) SELESAI ??`);
    console.log(` Total Sukses: ${totalProcessed}`);
    console.log(` Total Gagal: ${totalFailed}`);
    console.log("==================================================");
}

runHistoryRPA();
