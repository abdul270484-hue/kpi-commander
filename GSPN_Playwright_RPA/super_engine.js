const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, onSnapshot } = require('firebase/firestore');

const config = require('./config');
const { scrapeAllBranches } = require('./scraper');
const { processAndSyncToFirebase } = require('./sync');
const { handleSmartAlerts } = require('./alerter');

// ==========================================
// GLOBAL ERROR HANDLER TO PREVENT CRASHES
// ==========================================
process.on('uncaughtException', (err) => {
    console.error('🔥 [ANTI-CRASH] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [ANTI-CRASH] Unhandled Rejection:', reason);
});

// ==========================================
// 1. EXPRESS & WHATSAPP WEB SERVICE (PORT 3001)
// ==========================================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Serve frontend static files from Dashboard_BUJM root
const DASHBOARD_ROOT = path.join(__dirname, '..');
app.use(express.static(DASHBOARD_ROOT));

const PORT = 3001;
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

let qrData = null;
let clientReady = false;

const waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
        headless: true,
        executablePath: fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
            ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            : undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials'
        ],
        timeout: 90000,
        protocolTimeout: 300000
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    webVersionCache: {
        type: 'local'
    }
});

waClient.on('qr', (qr) => {
    console.log('📱 WhatsApp QR Code generated, saving to Firestore...');
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) {
            qrData = url;
            // Save QR to Firestore so HTTPS dashboard can read it
            setDoc(doc(db, 'rpa_commands', 'wa_status'), {
                waReady: false,
                qrCode: url,
                updatedAt: new Date().toISOString()
            }, { merge: true }).catch(() => {});
        }
    });
});

waClient.on('ready', () => {
    console.log('✅ JARVIS WhatsApp Client is READY & ONLINE!');
    clientReady = true;
    qrData = null;
    // Update Firestore: WA is ready, clear QR
    setDoc(doc(db, 'rpa_commands', 'wa_status'), {
        waReady: true,
        qrCode: null,
        updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
});

waClient.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp Client disconnected:', reason);
    clientReady = false;
    qrData = null;
    setDoc(doc(db, 'rpa_commands', 'wa_status'), {
        waReady: false,
        qrCode: null,
        updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
    waClient.initialize().catch(() => {});
});

waClient.initialize().catch(err => {
    console.error('WhatsApp init error (will retry in background):', err.message);
});

// API: Get JARVIS Online Status (For Web Dashboard Topbar)
app.get('/api/status', (req, res) => {
    res.json({ ready: clientReady, qr: qrData });
});

// API: Remote Trigger RPA directly from Web Dashboard
app.post('/api/trigger-rpa', (req, res) => {
    const slot = (req.body && req.body.slot) ? req.body.slot : 'WEB_DASHBOARD';
    console.log(`\nâš¡ [HTTP TRIGGER] Perintah tarik GSPN diterima via Localhost API (${slot})...`);
    executeRpaCycle(slot);
    res.json({ success: true, message: 'RPA Cycle Started' });
});

// API: Send Single Message (For Alerter)
app.post('/api/send-message', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });
    if (!clientReady) return res.status(503).json({ error: 'WhatsApp is not ready' });

    try {
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.substring(1);
        const chatId = formattedPhone + '@c.us';

        await waClient.sendMessage(chatId, message);
        res.json({ success: true, phone: formattedPhone });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Blasting Queue
let blastQueue = [];
let isBlasting = false;
let blastProgress = { total: 0, sent: 0, failed: 0, current: null, logs: [] };

async function processBlastQueue() {
    if (isBlasting || blastQueue.length === 0) return;
    isBlasting = true;

    while (blastQueue.length > 0) {
        const job = blastQueue.shift();
        blastProgress.current = `Mengirim ke ${job.phone} (${job.name})...`;

        try {
            let formattedPhone = job.phone.replace(/\D/g, '');
            if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.substring(1);
            const chatId = formattedPhone + '@c.us';

            const zeroWidthSpace = '\u200B';
            const randomCount = Math.floor(Math.random() * 15) + 1;
            const uniqueMessage = job.message + zeroWidthSpace.repeat(randomCount);

            const typingTime = Math.floor(Math.random() * 2000) + 2000;
            await new Promise(resolve => setTimeout(resolve, typingTime));

            await waClient.sendMessage(chatId, uniqueMessage);
            blastProgress.sent++;
            console.log(`ðŸ“¤ [BLAST ${blastProgress.sent}/${blastProgress.total}] Terkirim â†’ ${job.name} (${formattedPhone})`);
            blastProgress.logs.unshift({ status: 'Sukses', phone: job.phone, name: job.name, reason: '-' });
        } catch (err) {
            blastProgress.failed++;
            blastProgress.logs.unshift({ status: 'Gagal', phone: job.phone, name: job.name, reason: String(err) });
        }

        const delay = 8000; // 8 detik + 2 detik ngetik = 10 detik
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    blastProgress.current = 'Selesai';
    isBlasting = false;
}

// API: Start Blast (From Dashboard Wall of Shame / Wall of Fame)
app.post('/api/blast', (req, res) => {
    if (!clientReady) return res.status(400).json({ error: 'WhatsApp belum terkoneksi' });
    const { data, template } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ error: 'Data kosong' });

    if (!isBlasting) {
        blastProgress = { total: 0, sent: 0, failed: 0, current: 'Memulai...', logs: [] };
    }
    
    let added = 0;
    data.forEach(item => {
        let message = template;
        Object.keys(item).forEach(key => {
            const regex = new RegExp('\\[\\s*' + key + '\\s*\\]', 'gi');
            message = message.replace(regex, item[key] || '-');
        });

        const phone = item.phone || item.no_hp || item.hp;
        const name = item.name || item.nama || 'Teknisi';

        if (phone) {
            blastQueue.push({ phone, name, message });
            added++;
        }
    });
    
    blastProgress.total += added;

    processBlastQueue();
    res.json({ success: true, message: 'Blasting dimulai!' });
});

app.get('/api/progress', (req, res) => {
    res.json({ isBlasting, progress: blastProgress });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`ðŸš€ JARVIS WA Engine aktif di http://localhost:${PORT}`);
});

// ==========================================
// 2. PLAYWRIGHT RPA & CLOUD SCHEDULER
// ==========================================
const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);
const { ExecutionLockManager } = require('./intelligence/execution_lock');
const lockManager = new ExecutionLockManager(db);

async function executeRpaCycle(slotName = 'MANUAL') {
    const triggerType = slotName === 'WEB_DASHBOARD' ? 'MANUAL' : 'SCHEDULED';
    const lockResult = await lockManager.acquireLock(triggerType, slotName);
    
    if (!lockResult.success) {
        console.log(`⚠️ RPA cycle sedang berlangsung: ${lockResult.message}`);
        return;
    }

    const startTime = Date.now();
    let syncResult = { success: 0, failed: 0, totalRecords: 0, alertsSent: 0 };
    let finalError = null;

    console.log('\n=============================================================');
    console.log(`  🕒 [CYCLE START] SIKLUS RPA GSPN: ${slotName}`);
    console.log(`  ID Eksekusi: ${lockResult.executionId}`);
    console.log(`  Waktu: ${lockResult.startedAt}`);
    console.log('=============================================================\n');

    try {
        await lockManager.updateProgress('SCRAPE', '📡 Membuka GSPN dan mengunduh data...');

        // Progress callback
        let lastPushTime = 0;
        const onProgress = ({ phase, current, total, branch, ok }) => {
            const now = Date.now();
            if (now - lastPushTime < 2000) return; // throttle
            lastPushTime = now;
            lockManager.updateProgress(
                'SCRAPE_PROGRESS', 
                `[${phase}] ${current}/${total} >> ${branch}`, 
                current, total
            ).catch(() => {});
        };

        const downloadedFiles = await scrapeAllBranches(false, false, onProgress);

        await lockManager.updateProgress('SYNC', '🧠 Memproses Data & Intelijen AI (Validation, Sync)...');
        syncResult = await processAndSyncToFirebase(downloadedFiles, slotName);

        await lockManager.updateProgress('NOTIFY', '🚀 Mengirim Alert / Notifikasi...');
        // await handleSmartAlerts(syncResult); // [DISABLED] WA Blasting dipindahkan ke Frontend (Decentralized)

        console.log(`\n✅ [CYCLE SUCCESS] SIKLUS ${slotName} BERHASIL!`);
        await lockManager.releaseLock('COMPLETED', {
            startedAt: lockResult.startedAt,
            triggerType,
            startedBy: slotName,
            branchesSuccess: syncResult.success || 0,
            branchesFailed: syncResult.failed || 0,
            recordsProcessed: syncResult.totalRecords || 0,
            alertsSent: syncResult.alertsSent || 0,
            durationSec: Math.round((Date.now() - startTime) / 1000)
        });
        
        await cleanupStorage();
    } catch (err) {
        finalError = err;
        console.error(`\n❌ [CYCLE FAILED] Error:`, err);
        await lockManager.releaseLock('FAILED', {
            startedAt: lockResult.startedAt,
            triggerType,
            startedBy: slotName,
            error: err.message,
            durationSec: Math.round((Date.now() - startTime) / 1000)
        });
    }
}

// 3. Firestore Remote Trigger Listener (Web Button 'Tarik GSPN Sekarang')
const { getAuth, signInAnonymously } = require('firebase/auth');
const auth = getAuth(firebaseApp);

async function startRemoteListener() {
    console.log('ðŸ“¡ Mendengarkan perintah remote trigger dari Web Dashboard...');
    const triggerDocRef = doc(db, 'rpa_commands', 'trigger');

    // Auto-heal on engine boot: if stuck on RUNNING from previous aborted run, reset to IDLE
    try {
        await setDoc(triggerDocRef, {
            status: 'IDLE',
            progress: ''
        }, { merge: true });
        console.log('âœ¨ Status remote trigger di-reset ke IDLE (Siap digunakan).');
    } catch (e) {}

    onSnapshot(triggerDocRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            if (data.command === 'RUN_NOW' && data.status === 'PENDING') {
                if (lockManager.currentExecutionId) {
                    console.log(`⚠️ [REMOTE TRIGGER] Diabaikan: RPA sedang berjalan.`);
                    setDoc(triggerDocRef, {
                        status: 'RUNNING',
                        progress: 'Sedang berjalan dalam proses aktif...'
                    }, { merge: true }).catch(() => {});
                    return;
                }
                console.log(`\n⚡ [REMOTE TRIGGER] Perintah dari Web Dashboard (${data.requestedBy || 'User'})...`);
                executeRpaCycle(data.slot || 'WEB_DASHBOARD');
            }
        }
    }, (err) => {
        console.error('Snapshot Listener Warning:', err.message);
    });
}

// 4. Start Cron Schedulers (09:00, 12:00, 15:00, 17:00 WIB)
cron.schedule('0 9 * * *', () => executeRpaCycle('09:00'), { timezone: 'Asia/Jakarta' });
cron.schedule('0 12 * * *', () => executeRpaCycle('12:00'), { timezone: 'Asia/Jakarta' });
cron.schedule('0 15 * * *', () => executeRpaCycle('15:00'), { timezone: 'Asia/Jakarta' });
cron.schedule('0 17 * * *', () => executeRpaCycle('17:00'), { timezone: 'Asia/Jakarta' });

signInAnonymously(auth).then(() => {
    console.log('ðŸ” Terautentikasi ke Firebase Service.');
    startRemoteListener();
}).catch(() => {
    startRemoteListener();
});

console.log('\n=============================================================');
console.log('  ðŸ‘‘ JARVIS SUPER ENGINE (WA BLASTER + PLAYWRIGHT RPA) AKTIF');
console.log('  Semua layanan terhubung & siap dikendalikan dari Web Dashboard!');
console.log('=============================================================\n');

// ==========================================
// 5. SESSION KEEP-ALIVE (ANTI EXPIRED)
// ==========================================
setInterval(async () => {
    try {
        const statePath = path.join(__dirname, '.auth', 'storageState.json');
        if (fs.existsSync(statePath)) {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            const cookieStr = state.cookies.map(c => c.name + '=' + c.value).join('; ');
            const res = await fetch('https://gspn2.samsungcsportal.com/gspn/index.do', {
                headers: { 'Cookie': cookieStr, 'User-Agent': 'Mozilla/5.0' }
            });
            const text = await res.text();
            if (!text.includes('Notice')) {
                // Berhasil ping
                console.log(`[${new Date().toLocaleTimeString()}] â™»ï¸ Session Keep-Alive: OK (Session diperpanjang)`);
            } else {
                console.log(`[${new Date().toLocaleTimeString()}] âš ï¸ Session Keep-Alive: Expired`);
            }
        }
    } catch (e) {
        // Abaikan error jaringan sementara
    }
}, 10 * 60 * 1000); // Tiap 10 menit



async function cleanupStorage() {}
