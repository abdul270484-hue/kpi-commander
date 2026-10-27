const { exec } = require('child_process');
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
    console.error('[AUTH]¥ [ANTI-CRASH] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[AUTH]¥ [ANTI-CRASH] Unhandled Rejection:', reason);
});

// ==========================================
// DUAL-LOGGING TO FILE FOR REALTIME MONITORING
// ==========================================
const RUNTIME_LOG_FILE = path.join(__dirname, 'super_engine_runtime.log');
try {
    fs.writeFileSync(RUNTIME_LOG_FILE, `=== PRIME SUPER ENGINE LOG SESSION ${new Date().toLocaleString('id-ID')} ===\n`, 'utf8');
} catch (_) {}

const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
const origStdoutWrite = process.stdout.write;

function appendToLog(prefix, args) {
    try {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        const timestamp = new Date().toLocaleTimeString('id-ID');
        fs.appendFileSync(RUNTIME_LOG_FILE, `[${timestamp}] ${prefix} ${msg}\n`);
    } catch (_) {}
}

console.log = function(...args) {
    origLog.apply(console, args);
    appendToLog('[INFO]', args);
};
console.error = function(...args) {
    origErr.apply(console, args);
    appendToLog('[ERROR]', args);
};
console.warn = function(...args) {
    origWarn.apply(console, args);
    appendToLog('[WARN]', args);
};

if (origStdoutWrite) {
    process.stdout.write = function(chunk, encoding, callback) {
        origStdoutWrite.apply(process.stdout, arguments);
        try {
            fs.appendFileSync(RUNTIME_LOG_FILE, chunk);
        } catch (_) {}
        return true;
    };
}

// ==========================================
// 1. EXPRESS & WHATSAPP WEB SERVICE (PORT 3001)
// ==========================================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Controlled CORS: Allow approved origins and local tools
const ALLOWED_ORIGINS = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://aging-commander.web.app',
    'https://aging-commander.firebaseapp.com'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// HARDENED SECURITY FILTER: Block access to backend source code, credentials, and sensitive assets
app.use((req, res, next) => {
    const rawPath = decodeURI(req.path);
    const forbiddenPatterns = [
        /^\/GSPN_Playwright_RPA/i,
        /serviceAccountKey/i,
        /\.env/i,
        /\.git/i,
        /\.wwebjs_auth/i,
        /package(-lock)?\.json/i,
        /\.bak$/i,
        /\.log$/i
    ];
    if (forbiddenPatterns.some(pattern => pattern.test(rawPath))) {
        console.warn(`[SECURITY] Blocked unauthorized access to protected resource: ${rawPath} from ${req.ip}`);
        return res.status(403).json({ error: 'Access Denied: Protected System Resource' });
    }
    next();
});

// Serve frontend static files from Dashboard_BUJM root
const DASHBOARD_ROOT = path.join(__dirname, '..');
app.use(express.static(DASHBOARD_ROOT));

const PORT = 3001;
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// Auto-clean zombie Chrome processes and stale lockfiles on startup
function cleanupStaleSessionLocks() {
    try {
        const { execSync } = require('child_process');
        const myPid = process.pid;
        // Terminate any other node instance running super_engine.js
        const cmdOtherNode = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | Where-Object { \\$_.CommandLine -like '*super_engine.js*' -and \\$_.ProcessId -ne ${myPid} } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
        execSync(cmdOtherNode, { stdio: 'ignore' });

        // Terminate any zombie chrome instance using .wwebjs_auth
        const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe'\\" | Where-Object { \\$_.CommandLine -like '*wwebjs*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
        execSync(cmd, { stdio: 'ignore' });
    } catch (_) {}

    // AUTO-RESET HARIAN: Reset sesi WhatsApp setiap berganti hari agar folder tidak membengkak
    try {
        const dateTrackerFile = path.join(AUTH_DIR, 'last_session_date.txt');
        const todayStr = new Date().toISOString().slice(0, 10); // Format: YYYY-MM-DD
        let lastDate = '';
        if (fs.existsSync(dateTrackerFile)) {
            lastDate = fs.readFileSync(dateTrackerFile, 'utf8').trim();
        }

        if (lastDate !== todayStr) {
            console.log('[INFO] Hari baru terdeteksi (' + todayStr + '). Mempertahankan sesi login WhatsApp aktif...');
            fs.writeFileSync(dateTrackerFile, todayStr, 'utf8');
        } else {
            const sessionLock = path.join(AUTH_DIR, 'session', 'lockfile');
            if (fs.existsSync(sessionLock)) {
                try {
                    fs.unlinkSync(sessionLock);
                    console.log('🧹 Cleaned up stale WhatsApp session lockfile.');
                } catch (_) {}
            }
        }
    } catch (err) {
        console.warn('[WARN]  Warning saat auto-clean sesi:', err.message);
    }
}

cleanupStaleSessionLocks();

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
    console.log('ðŸ“± WhatsApp QR Code generated, saving to Firestore...');
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
    console.log('[OK] PRIME WhatsApp Client is READY & ONLINE!');
    const botNumber = waClient.info && waClient.info.wid ? waClient.info.wid.user : 'Unknown';
    console.log('[PRIME] 📱 Akun WhatsApp Aktif: +' + botNumber);
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
    console.log('[WARN] WhatsApp Client disconnected:', reason);
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
    console.log(`\n[HTTP] [HTTP TRIGGER] Perintah tarik GSPN diterima via Localhost API (${slot})...`);
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
            console.log(`[BLAST] [BLAST ${blastProgress.sent}/${blastProgress.total}] Terkirim Ã¢â€ â€™ ${job.name} (${formattedPhone})`);
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
    const { data, template, allowedBranches } = req.body;
    if (!data || data.length === 0) return res.status(400).json({ error: 'Data kosong' });

    console.log(`\nðŸ“¢ [BLAST INCOMING] Permintaan blast untuk ${data.length} penerima.`);
    if (allowedBranches && Array.isArray(allowedBranches)) {
        console.log(`[AUTH]’ [BLAST AREA FILTER] Cabang Area Diizinkan: ${allowedBranches.join(', ')}`);
    }

    if (!isBlasting) {
        blastProgress = { total: 0, sent: 0, failed: 0, current: 'Memulai...', logs: [] };
    }
    
    let added = 0;
    data.forEach(item => {
        // DOUBLE CHECK: Validasi cabang jika metadata branch tersedia
        if (item.branch && allowedBranches && Array.isArray(allowedBranches) && allowedBranches.length > 0) {
            const b = String(item.branch).toUpperCase().trim();
            const ok = allowedBranches.some(a => {
                const cleanA = String(a).toUpperCase().trim();
                return b.includes(cleanA) || cleanA.includes(b);
            });
            if (!ok) {
                console.warn(`â›” [BLAST REJECTED] Item ${item.name} (${item.phone}) di cabang [${item.branch}] BUKAN bagian dari area yang diizinkan! Ditolak demi keamanan.`);
                return;
            }
        }

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
    res.json({ success: true, message: `Blasting dimulai untuk ${added} penerima cabang area Anda!` });
});

app.get('/api/progress', (req, res) => {
    res.json({ isBlasting, progress: blastProgress });
});

const HOST = process.env.HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
    console.log(`>>> JARVIS WA Engine aktif di http://${HOST}:${PORT}`);
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[FATAL] Port ${PORT} sedang dipakai proses lain! Memuat ulang dalam 3 detik...`);
        setTimeout(() => process.exit(1), 3000);
    }
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
        console.log(`[WARN] RPA cycle sedang berlangsung: ${lockResult.message}`);
        return;
    }

    const startTime = Date.now();
    let syncResult = { success: 0, failed: 0, totalRecords: 0, alertsSent: 0 };
    let finalError = null;

    console.log('\n=============================================================');
    console.log(`  ðŸ•’ [CYCLE START] SIKLUS RPA GSPN: ${slotName}`);
    console.log(`  ID Eksekusi: ${lockResult.executionId}`);
    console.log(`  Waktu: ${lockResult.startedAt}`);
    console.log('=============================================================\n');

    try {
        await lockManager.updateProgress('SCRAPE', '[LISTEN] Membuka GSPN dan mengunduh data...');

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

        // Purge require cache agar perubahan pada scraper & sync selalu dimuat segar setiap siklus
        delete require.cache[require.resolve('./scraper')];
        delete require.cache[require.resolve('./sync')];
        const { scrapeAllBranches } = require('./scraper');
        const { processAndSyncToFirebase } = require('./sync');

        // Robot Chrome: Sesuai arahan BOS, disembunyikan agar berjalan di background (headless: true)
        const isHeadless = process.env.HEADLESS !== 'false'; // Default: true (Background / Tersembunyi)
        const downloadedFiles = await scrapeAllBranches(isHeadless, false, onProgress);

        await lockManager.updateProgress('SYNC', 'ðŸ§  Memproses Data & Intelijen AI (Validation, Sync)...');
        syncResult = await processAndSyncToFirebase(downloadedFiles, slotName);

        // 4. Eksekusi Daily Ledger VOL IN (Cerdas & Cepat: 1 Hari Saja)
        try {
            delete require.cache[require.resolve('./vol_in_engine')];
            const { runDailyVolInLedger } = require('./vol_in_engine');
            await runDailyVolInLedger(slotName, onProgress);
        } catch (volErr) {
            console.warn('⚠️ [WARN] Daily Ledger VOL IN Warning:', volErr.message);
        }

        await lockManager.updateProgress('NOTIFY', '>>> Mengirim Alert / Notifikasi WA...');
        // [DISABLED] WA Blasting Backend dinonaktifkan total agar tidak menembak ke semua teknisi
        // await handleSmartAlerts(syncResult);

        console.log(`\n[OK] [CYCLE SUCCESS] SIKLUS ${slotName} BERHASIL!`);
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
        console.error('\n[FAIL] [CYCLE FAILED] Error:', err);
        await lockManager.releaseLock('FAILED', {
            startedAt: lockResult.startedAt,
            triggerType,
            startedBy: slotName,
            error: err.message,
            durationSec: Math.round((Date.now() - startTime) / 1000)
        });
        await cleanupStorage();
    }
}

// 3. Firestore Remote Trigger Listener (Web Button 'Tarik GSPN Sekarang')
const { getAuth, signInAnonymously } = require('firebase/auth');
const auth = getAuth(firebaseApp);


async function startRemoteListener() {
    console.log('[LISTEN] Mendengarkan perintah remote trigger dari Web Dashboard...');
    const triggerDocRef = doc(db, 'rpa_commands', 'trigger');

    // Auto-heal on engine boot: if stuck on RUNNING from previous aborted run, reset to IDLE
    try {
        await setDoc(triggerDocRef, {
            status: 'IDLE',
            progress: ''
        }, { merge: true });
        console.log('[IDLE] Status remote trigger di-reset ke IDLE (Siap digunakan).');
    } catch (e) {}

    onSnapshot(triggerDocRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            if (data.command === 'RUN_NOW' && data.status === 'PENDING') {
                if (lockManager.currentExecutionId) {
                    console.log(`[WARN]  [REMOTE TRIGGER] Diabaikan: RPA sedang berjalan.`);
                    setDoc(triggerDocRef, {
                        status: 'RUNNING',
                        progress: 'Sedang berjalan dalam proses aktif...'
                    }, { merge: true }).catch(() => {});
                    return;
                }
                console.log(`\n[HTTP] [REMOTE TRIGGER] Perintah dari Web Dashboard (${data.requestedBy || 'User'})...`);
                executeRpaCycle(data.slot || 'WEB_DASHBOARD');
            }
        }
    }, (err) => {
        console.error('Snapshot Listener Warning:', err.message);
    });

    // Telemetry Heartbeat (update every 20 seconds)
    const updateTelemetry = () => {
        const memoryMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        setDoc(doc(db, 'rpa_commands', 'pc_telemetry'), {
            online: true,
            lastHeartbeat: new Date().toISOString(),
            memoryUsage: memoryMB + ' MB',
            hostName: process.env.COMPUTERNAME || 'LAPTOP-BUJM',
            rpaStatus: lockManager.currentExecutionId ? 'RUNNING' : 'IDLE',
            waReady: clientReady
        }, { merge: true }).catch(() => {});
    };
    updateTelemetry();
    setInterval(updateTelemetry, 20000);
}

// =============================================================
// 4. CONTINUOUS RPA CYCLE WITH 10-MIN REST (09:00 - 17:30)
// Sesuai arahan BOS: Tarik selesai -> Istirahat 10 menit -> Tarik lagi
// Berulang terus menerus jam 09:00 s/d 17:30 waktu setempat.
// Jadwal WA Blasting tetap tidak ada perubahan.
// =============================================================
let isContinuousLoopRunning = false;

function isWithinOperatingHours() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTimeMinutes = hours * 60 + minutes;

    const startMinutes = 9 * 60;       // 09:00
    const endMinutes = 17 * 60 + 30;   // 17:30

    return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
}

function getMsUntilNextStart() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(9, 0, 0, 0);

    // Jika sudah lewat 17:30 hari ini, jadwalkan ke jam 09:00 besok
    if (now.getHours() > 17 || (now.getHours() === 17 && now.getMinutes() > 30)) {
        start.setDate(start.getDate() + 1);
    }
    const diff = start.getTime() - now.getTime();
    return Math.max(diff, 60000); // minimal 1 menit
}

async function startContinuousRpaLoop() {
    if (isContinuousLoopRunning) return;
    isContinuousLoopRunning = true;

    console.log('[AUTO-LOOP] 🔄 Siklus Kontinu BUJM Aktif: Tarik GSPN -> Istirahat 10 Menit -> Ulangi (09:00 - 17:30)');

    while (true) {
        if (!isWithinOperatingHours()) {
            const waitMs = getMsUntilNextStart();
            const waitHours = (waitMs / 3600000).toFixed(1);
            console.log(`[AUTO-LOOP] 🌙 Di luar jam operasional (09:00 - 17:30). Menunggu ${waitHours} jam hingga pukul 09:00...`);
            await new Promise(res => setTimeout(res, Math.min(waitMs, 300000))); // cek periodik tiap max 5 menit
            continue;
        }

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const slotName = `AUTO_${pad(now.getHours())}:${pad(now.getMinutes())}`;

        console.log(`\n=============================================================`);
        console.log(`  🔄 [AUTO-LOOP RUN] Memulai Siklus Tarikan GSPN: ${slotName}`);
        console.log(`=============================================================`);

        try {
            await executeRpaCycle(slotName);
        } catch (err) {
            console.error('[AUTO-LOOP] ⚠️ Error saat siklus tarikan:', err.message);
        }

        if (!isWithinOperatingHours()) {
            console.log('[AUTO-LOOP] 🏁 Jam operasional hari ini telah berakhir (lewat 17:30). Menunggu besok pagi.');
            continue;
        }

        const restMinutes = 10;
        const nextRunTime = new Date(Date.now() + restMinutes * 60 * 1000);
        console.log(`\n💤 [AUTO-LOOP REST] Siklus tarikan selesai! Istirahat ${restMinutes} menit sesuai arahan BOS.`);
        console.log(`⏰ Tarikan berikutnya otomatis dimulai pukul: ${pad(nextRunTime.getHours())}:${pad(nextRunTime.getMinutes())}:${pad(nextRunTime.getSeconds())} WIB\n`);

        await new Promise(res => setTimeout(res, restMinutes * 60 * 1000));
    }
}

signInAnonymously(auth).then(() => {
    console.log('[AUTH] Terautentikasi ke Firebase Service.');
    startRemoteListener();
    startContinuousRpaLoop();
}).catch(() => {
    startRemoteListener();
    startContinuousRpaLoop();
});

console.log('\n=============================================================');
console.log('  [SUPER] PRIME SUPER ENGINE (WA BLASTER + PLAYWRIGHT RPA) AKTIF');
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
                console.log(`[${new Date().toLocaleTimeString()}] [REFRESH] Session Keep-Alive: OK (Session diperpanjang)`);
            } else {
                console.log(`[${new Date().toLocaleTimeString()}] [WARN] Session Keep-Alive: Expired`);
            }
        }
    } catch (e) {
        // Abaikan error jaringan sementara
    }
}, 10 * 60 * 1000); // Tiap 10 menit


async function cleanupStorage() {
    try {
        const downloadDir = config.DOWNLOAD_DIR;
        if (fs.existsSync(downloadDir)) {
            const files = fs.readdirSync(downloadDir);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(downloadDir, file));
                } catch (e) {}
            }
            console.log(`ðŸ§¹ [STORAGE CLEANUP] Folder temp_downloads dibersihkan total (${files.length} file dihapus). Local disk tetap 100% aman!`);
        }
    } catch (err) {
        console.warn('[WARN] Warning cleanupStorage:', err.message);
    }
}
