const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('./serviceAccountKey.json');

let adminDb = null;
let adminApp = null;

function initAdmin() {
    if (!getApps().length) {
        adminApp = initializeApp({
            credential: cert(serviceAccount)
        });
        adminDb = getFirestore();
        console.log("  [FCM ENGINE] Firebase Admin initialized.");
    } else {
        adminDb = getFirestore();
    }
    return adminDb;
}

const fs = require('fs');
const path = require('path');

let cachedUsers = null;
let lastUsersFetch = 0;
const USERS_CACHE_TTL = 24 * 60 * 60 * 1000; // Cache 24 jam
const CACHE_FILE_PATH = path.join(__dirname, 'users_cache.json');

async function getCachedUsers(db) {
    const now = Date.now();

    // 1. Cek memory cache
    if (cachedUsers && (now - lastUsersFetch < USERS_CACHE_TTL)) {
        return cachedUsers;
    }

    // 2. Cek local file cache jika ada di komputer
    if (fs.existsSync(CACHE_FILE_PATH)) {
        try {
            const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.timestamp && (now - parsed.timestamp < USERS_CACHE_TTL) && Array.isArray(parsed.data)) {
                cachedUsers = parsed.data;
                lastUsersFetch = parsed.timestamp;
                return cachedUsers;
            }
        } catch (e) {
            console.warn("  [FCM ENGINE] Gagal membaca local users cache:", e.message);
        }
    }

    // 3. Fallback ambil dari Firestore (jika kuota aman)
    try {
        const snap = await db.collection('users').get();
        cachedUsers = [];
        snap.forEach(doc => cachedUsers.push(doc.data()));
        lastUsersFetch = now;

        // Simpan ke local disk
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify({
            timestamp: now,
            data: cachedUsers
        }, null, 2), 'utf-8');
        return cachedUsers;
    } catch (err) {
        console.warn("  [FCM ENGINE] Gagal fetch users dari Firestore (Quota/Network). Memakai cache yang ada jika tersedia:", err.message);
        // Jika gagal fetch tapi file cache lama ada, gunakan saja data lama
        if (fs.existsSync(CACHE_FILE_PATH)) {
            try {
                const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.data)) {
                    cachedUsers = parsed.data;
                    return cachedUsers;
                }
            } catch (_) {}
        }
        return [];
    }
}

// Map user tokens based on scoping
async function sendTargetedFCM(alertData) {
    const db = initAdmin();
    const { jobNo, alertLvl, engineer, branch, reason } = alertData;
    
    try {
        const usersList = await getCachedUsers(db);
        const tokensToAlert = [];
        
        usersList.forEach(u => {
            if (!u.fcmToken || u.status !== 'approved') return;

            let shouldSendToThisUser = false;
            const uRole = (u.role || '').toLowerCase();
            
            // 1. Teknisi (Hanya dapat miliknya sendiri)
            if (uRole === 'teknisi') {
                if (u.teknisi && u.teknisi.toUpperCase() === (engineer || '').toUpperCase()) {
                    shouldSendToThisUser = true;
                }
            } 
            // 2. PIC (Hanya cabang miliknya, dan minimal Warning/Critical)
            else if (uRole === 'pic') {
                if (u.branch && (u.branch === branch || u.branch === 'ALL')) {
                    if (['WARNING', 'CRITICAL', 'EXTREME', 'REDO', 'LTP'].includes(alertLvl)) {
                        shouldSendToThisUser = true;
                    }
                }
            }
            // 3. Manager & Admin (Hanya Extreme / Redo biar gak spam)
            else if (uRole === 'manager' || uRole === 'admin' || uRole === 'super admin') {
                if (['EXTREME', 'REDO'].includes(alertLvl)) {
                    // Manager bisa difilter by branch kalau perlu, tp default semua cabang
                    if (u.branch === 'ALL' || u.branch === branch) {
                        shouldSendToThisUser = true;
                    }
                }
            }
            
            if (shouldSendToThisUser) {
                tokensToAlert.push(u.fcmToken);
            }
        });

        if (tokensToAlert.length > 0) {
            // Deduplicate tokens array
            const uniqueTokens = [...new Set(tokensToAlert)];
            
            const message = {
                notification: {
                    title: `⚠️ [${alertLvl}] ${jobNo}`,
                    body: `Cabang: ${branch}\nTeknisi: ${engineer}\nAlasan: ${reason}`
                },
                tokens: uniqueTokens,
            };
            
            const response = await getMessaging().sendEachForMulticast(message);
            console.log(`  [FCM] Terkirim ke ${response.successCount} HP untuk job ${jobNo}`);
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.log('  [FCM Error] Token:', uniqueTokens[idx], resp.error);
                    }
                });
            }
        }
    } catch (err) {
        console.error("  [FCM ENGINE] Gagal memproses Push Notif:", err);
    }
}

module.exports = {
    initAdmin,
    sendTargetedFCM
};
