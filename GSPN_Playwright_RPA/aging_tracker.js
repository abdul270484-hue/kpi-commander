const { initializeApp } = require('firebase/app');
const { getFirestore, doc, collection, getDocs, writeBatch } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// Cache lokal aging_tracking (lihat QUOTA SAVER di trackAgingStates)
const AGING_CACHE_PATH = path.join(__dirname, '.aging_cache.json');
function invalidateAgingCache() {
    try { if (fs.existsSync(AGING_CACHE_PATH)) fs.unlinkSync(AGING_CACHE_PATH); } catch (_) {}
}

const agingConfig = {
  apiKey: "AIzaSyBLbVbEAZ_jvfkBD0YL_lXpVvIQAz0ZCLM",
  authDomain: "aging-commander.firebaseapp.com",
  projectId: "aging-commander",
  storageBucket: "aging-commander.firebasestorage.app",
  messagingSenderId: "286087165205",
  appId: "1:286087165205:web:07c7d7380b0c5a2ca8251c"
};

let agingDb = null;

function parseExcelDate(dateVal, formatHint = 'DD/MM/YYYY', applyCorruptionFix = false) {
    if (dateVal == null || dateVal === '') return null;
    let dateObj = null;

    if (typeof dateVal === 'number') {
        dateObj = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        if (applyCorruptionFix && formatHint === 'DD/MM/YYYY') {
            let m = dateObj.getMonth();
            let d = dateObj.getDate();
            let y = dateObj.getFullYear();
            if (m < 12 && d <= 12) {
                dateObj = new Date(y, d - 1, m + 1);
            }
        }
    } else if (typeof dateVal === 'string') {
        let str = dateVal.trim();
        if (str.match(/[a-zA-Z]/)) {
            dateObj = new Date(str);
        } else {
            const parts = str.split(/[-/ :.]/);
            if (parts.length >= 3) {
                if (parts[0].length === 4) {
                    let y = parts[0];
                    let m = parts[1].padStart(2, '0');
                    let d = parts[2].padStart(2, '0');
                    dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
                } else {
                    let p0 = parts[0].padStart(2, '0');
                    let p1 = parts[1].padStart(2, '0');
                    let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];

                    if (formatHint === 'DD/MM/YYYY') {
                        dateObj = new Date(`${year}-${p1}-${p0}T00:00:00`);
                    } else if (formatHint === 'MM/DD/YYYY') {
                        dateObj = new Date(`${year}-${p0}-${p1}T00:00:00`);
                    } else {
                        if (parseInt(p0) > 12) {
                            dateObj = new Date(`${year}-${p1}-${p0}T00:00:00`);
                        } else {
                            dateObj = new Date(`${year}-${p0}-${p1}T00:00:00`);
                        }
                    }
                }
            } else {
                dateObj = new Date(str);
            }
        }
    }

    if (dateObj && isNaN(dateObj.getTime())) return null;
    return dateObj;
}

// The parameter 'db' is the OLD BUJM db. We will IGNORE it and use our own!
async function trackAgingStates(oldDb, baseData) {
    console.log('\n=============================================================');
    console.log('  [AGING COMMANDER] Menghubungkan ke Database Baru (Double-Sync)...');
    
    if (!agingDb) {
        try {
            const agingApp = initializeApp(agingConfig, 'AgingCommanderApp');
            agingDb = getFirestore(agingApp);
            
            // WE MUST AUTHENTICATE SO FIRESTORE RULES ALLOW READ/WRITE
            // Anonymous Auth removed to avoid admin-restricted-operation crash
            // We bypass read block by using "allow read: if true;" in firestore rules
            // We bypass write block by injecting rpaSecret in the payload
            
            console.log('  Berhasil terhubung ke Firebase AGING COMMANDER!');
        } catch (e) {
            console.error('  Gagal inisialisasi Firebase baru:', e);
            return;
        }
    }
    
    const db = agingDb;
    console.log('  [AGING COMMANDER] Menjalankan Micro-Aging State Tracker...');

    // Detect formatHint for Request Date parsing (identik dengan sync.js untuk Pending Delivery RC)
    let formatHint = 'DD/MM/YYYY';
    let hasStringDates = false;
    let hasNumberDates = false;

    for (let i = 0; i < Math.min(100, baseData.length); i++) {
        const row = baseData[i];
        if (!row || row['Request Date'] == null) continue;
        const dVal = row['Request Date'];
        if (typeof dVal === 'number') {
            hasNumberDates = true;
        } else if (typeof dVal === 'string') {
            let sVal = dVal.trim();
            if (sVal.match(/[a-zA-Z,]/) || sVal.startsWith('-')) continue;

            hasStringDates = true;
            const parts = sVal.split(/[-/ :.]/);
            if (parts.length >= 3 && parts[0].length !== 4) {
                let p0 = parseInt(parts[0], 10);
                let p1 = parseInt(parts[1], 10);
                if (!isNaN(p0) && !isNaN(p1)) {
                    if (p0 > 12 && p1 <= 12) formatHint = 'DD/MM/YYYY';
                    else if (p1 > 12 && p0 <= 12) formatHint = 'MM/DD/YYYY';
                }
            }
        }
    }
    const applyCorruptionFix = (hasStringDates && hasNumberDates && formatHint === 'DD/MM/YYYY');
    
    const activeJobsMap = new Map();
    
    for (const row of baseData) {
        const rawJobNo = row['Service Order No.'] || row['Job No'] || row['Tracking No.'];
        if (!row || !rawJobNo) continue;
        const jobNo = rawJobNo.toString().trim();
        const status = (row['Status'] || row['Job Status'] || '').toString().trim();
        let reason = (row['Reason'] || row['Pending Reason'] || '').toString().trim();
        if (status === 'Pending' && !reason) reason = '[KOSONG / TIDAK ADA ALASAN]';

        let engineer = row['Engineer Name'] ? row['Engineer Name'].toString().trim().toUpperCase().replace(/^\d+\s+/, '') : null;
        if (!engineer || /^\d+$/.test(engineer)) {
            let backup = row['Engineer'] ? row['Engineer'].toString().trim().toUpperCase().replace(/^\d+\s+/, '') : null;
            if (backup && /[a-zA-Z]/.test(backup)) {
                engineer = backup;
            } else {
                engineer = engineer || 'UNKNOWN ENGINEER';
            }
        }

        const rawAsc = (row['ASC Name'] || row['ASC'] || '').toString().trim();
        const asc = rawAsc;
        let virtualAsc = rawAsc;
        try {
            const { shortenASC } = require('./sync');
            if (typeof shortenASC === 'function') {
                virtualAsc = shortenASC(rawAsc, row, engineer);
            }
        } catch(e) {}

        // Keep actual technician name from SO pull (do not overwrite with PIC)

        let warranty = '';
        for (let k in row) {
            let kLow = k.toLowerCase().replace(/[^a-z]/g, '');
            if (kLow.includes('warranty') || kLow === 'inoutwarrantyflag' || kLow === 'inoutflag' || kLow === 'wty' || kLow === 'iwow') {
                if (row[k]) { warranty = String(row[k]).trim().toUpperCase(); break; }
            }
        }
        if (warranty === 'IW' || warranty === 'LP' || warranty === 'L' || warranty.startsWith('IN') || warranty === 'IN WARRANTY') warranty = 'IW';
        else if (warranty === 'OW' || warranty === 'O' || warranty.startsWith('OUT') || warranty === 'OUT OF WARRANTY') warranty = 'OW';
        const model = (row['Model'] || '').toString().trim();

        let agingDaysStr = row['Pending aging Days'] || row['Pending Aging Days'] || row['Aging Days'] || '0';
        let totalAgingDays = agingDaysStr ? parseInt(agingDaysStr) : 0;

        // LOGIKA TABEL "Pending Delivery (Repair Completed)" DI BUJM DASHBOARD (sync.js baris 793-805):
        // Di GSPN, kolom 'Pending aging Days' otomatis bernilai 0 saat status menjadi 'Repair Completed' (RC).
        // Oleh karena itu, untuk unit RC durasi hari aging dihitung dari selisih hari ini dikurangi 'Request Date'.
        const sUp = status.toUpperCase();
        const rUp = reason.toUpperCase();
        if (sUp === 'REPAIR COMPLETED' || sUp.includes('COMPLET') || sUp.includes('COMPLIT') || rUp.includes('REPAIR COMPLET') || rUp.includes('REPAIR COMPLIT')) {
            const reqDateVal = row['Request Date'];
            if (reqDateVal) {
                const reqDateObj = parseExcelDate(reqDateVal, formatHint, applyCorruptionFix);
                if (reqDateObj && !isNaN(reqDateObj.getTime())) {
                    const reqMidnight = new Date(reqDateObj.getFullYear(), reqDateObj.getMonth(), reqDateObj.getDate());
                    const todayMidnight = new Date();
                    todayMidnight.setHours(0, 0, 0, 0);
                    const diffTime = todayMidnight.getTime() - reqMidnight.getTime();
                    totalAgingDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                }
            }
        }

        let serviceType = '';
        for (let k in row) {
            let kLow = k.toLowerCase().replace(/[^a-z]/g, '');
            if (kLow === 'servicetype' || kLow === 'svctype') {
                if (row[k]) { serviceType = String(row[k]).trim().toUpperCase(); break; }
            }
        }
        
        let branchGroup = virtualAsc;
        try {
            const { cleanBranchName } = require('./sync'); // Or require from shared_logic if it was there
            if (typeof cleanBranchName === 'function') {
                branchGroup = cleanBranchName(virtualAsc);
            }
        } catch(e) {}
        // Fallback robust cleanBranchName
        if (!branchGroup) branchGroup = virtualAsc;
        let bgUpper = branchGroup.toUpperCase();
        if (bgUpper.includes('MAHENDRA')) branchGroup = 'DENPASAR';
        else if (bgUpper.includes('CELLULAR WORLD') || bgUpper.includes('TEUKU')) branchGroup = 'DENPASAR - CELLULAR WORLD';
        else if (bgUpper.includes('PLANET GADGET') || bgUpper.includes('GATOT')) branchGroup = 'DENPASAR - PLANET GADGET';
        else if (bgUpper.includes('KUPANG')) branchGroup = 'KUPANG';
        else if (bgUpper.includes('SINGARAJA')) branchGroup = 'SINGARAJA';
        else if (bgUpper.includes('MANADO')) branchGroup = 'MANADO';
        else branchGroup = bgUpper.replace(/PT\.?\s*BEKARYA\s+UGERTAMA\s+JAYA\s+MANDIRI\s*/gi, '').replace(/SAMSUNG\s+SERVICE\s+CENTER\s*/gi, '').replace(/UNICOM\s*/gi, '').trim();

        activeJobsMap.set(jobNo, {
            jobNo, asc, virtualAsc, branchGroup, engineer, warranty, serviceType, model, status, reason, totalAgingDays, isRedo: !!row['isRedo']
        });
    }

    console.log(`  Memeriksa riwayat ${activeJobsMap.size} Job di Database...`);
    
    let newJobs = 0;
    let stateChanges = 0;
    const now = new Date();
    const nowIso = now.toISOString();
    
    const trackingCol = collection(db, 'aging_tracking');

    // --- QUOTA SAVER (Rule 4.1): Cache lokal harian ---
    // Baca penuh dari Firestore HANYA pada sync pertama tiap hari (WIB).
    // Sync berikutnya memakai cache lokal (~1-2MB, ditimpa, tidak menumpuk).
    // Jika penulisan gagal / ada penulis lain (jarvis_history), cache dihapus -> sync berikutnya baca ulang Firestore.
    const todayWIB = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const existingMap = new Map();
    let cacheUsed = false;
    try {
        if (fs.existsSync(AGING_CACHE_PATH)) {
            const cache = JSON.parse(fs.readFileSync(AGING_CACHE_PATH, 'utf8'));
            if (cache && cache.date === todayWIB && cache.docs && typeof cache.docs === 'object') {
                for (const id of Object.keys(cache.docs)) existingMap.set(id, cache.docs[id]);
                cacheUsed = true;
            }
        }
    } catch (e) {
        console.log('  [CACHE] Cache rusak, baca ulang dari Firestore:', e.message);
        existingMap.clear();
        cacheUsed = false;
    }
    if (!cacheUsed) {
        const existingDocs = await getDocs(trackingCol);
        existingDocs.forEach(d => {
            existingMap.set(d.id, d.data());
        });
        console.log(`  [CACHE] Baca penuh Firestore: ${existingMap.size} dokumen.`);
    } else {
        console.log(`  [CACHE] Memakai cache lokal (${existingMap.size} dokumen) - hemat ${existingMap.size} reads.`);
    }
    const cacheMap = new Map(existingMap);

    const batches = [];
    let currentBatch = writeBatch(db);
    let opCount = 0;
    
    function commitOp() {
        opCount++;
        if (opCount === 500) {
            batches.push(currentBatch.commit());
            currentBatch = writeBatch(db);
            opCount = 0;
        }
    }

    let deletedJobs = 0;
    
    // PURGE STALE JOBS: If a job is in Firestore but no longer in the Excel (activeJobsMap), delete it!
    for (const [oldJobNo, oldData] of existingMap.entries()) {
        if (!activeJobsMap.has(oldJobNo)) {
            const docRef = doc(trackingCol, oldJobNo);
            
            if (opCount >= 490) {
                batches.push(currentBatch.commit());
                currentBatch = writeBatch(db);
                opCount = 0;
            }
            
            currentBatch.delete(docRef);
            cacheMap.delete(oldJobNo);
            opCount++;
            deletedJobs++;
        }
    }
    
    for (const [jobNo, newData] of activeJobsMap.entries()) {
        const docRef = doc(trackingCol, jobNo);
        const oldData = existingMap.get(jobNo);

        // ALWAYS inject rpaSecret to bypass Client SDK write block
        newData.rpaSecret = 'BUJM_RPA_SECURE_2026';

        if (!oldData) {
            newJobs++;
            const newDocData = {
                ...newData,
                firstSeen: nowIso,
                lastSeen: nowIso,
                currentReasonSince: nowIso,
                history: []
            };
            
            Object.keys(newDocData).forEach(key => {
                if (newDocData[key] === undefined) {
                    newDocData[key] = null;
                }
            });

            currentBatch.set(docRef, newDocData);
            cacheMap.set(jobNo, newDocData);
            commitOp();
        } else {
            const oldReason = oldData.reason || '';
            const oldStatus = oldData.status || '';
            const oldSince = oldData.currentReasonSince || oldData.firstSeen || nowIso;
            
            let history = oldData.history || [];
            let isChanged = false;
            let currentReasonSince = oldSince;
            
            if (oldReason !== newData.reason || oldStatus !== newData.status) {
                stateChanges++;
                isChanged = true;
                
                const startDate = new Date(oldSince);
                const diffTime = now.getTime() - startDate.getTime();
                const durationDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                
                history.push({
                    status: oldStatus,
                    reason: oldReason,
                    startDate: oldSince,
                    endDate: nowIso,
                    durationDays: durationDays
                });
                
                currentReasonSince = nowIso;

                // --- P1.5 & P1.6 NOTIFICATION ENGINE & DEDUPLICATION ---
                // Evaluate Alert Level (Normal 0, Warning 3, Critical 7, Extreme 10)
                let d = newData.totalAgingDays || 0;
                let alertLvl = 'NORMAL';
                if (d >= 10) alertLvl = 'EXTREME';
                else if (d >= 7) alertLvl = 'CRITICAL';
                else if (d >= 3) alertLvl = 'WARNING';

                const isRedoNow = !!newData.isRedo || newData.reason.toUpperCase().includes('REDO');
                if (isRedoNow) alertLvl = 'REDO'; // Priority override

                const lastNotifiedLevel = oldData.lastNotifiedLevel || 'NONE';
                const lastNotifiedReason = oldData.lastNotifiedReason || '';

                // Trigger if:
                // 1. Alert Level Escalated (e.g. WARNING -> CRITICAL)
                // 2. Alert Level is high AND Reason changed (new update from Samsung)
                let shouldNotify = false;
                
                const levelRank = { 'NONE':0, 'NORMAL':1, 'WARNING':2, 'CRITICAL':3, 'EXTREME':4, 'REDO':5, 'LTP':5 };
                
                if (levelRank[alertLvl] > levelRank[lastNotifiedLevel]) {
                    shouldNotify = true;
                } else if (levelRank[alertLvl] >= 3 && newData.reason !== lastNotifiedReason) {
                    shouldNotify = true;
                }

                if (shouldNotify) {
                    newData.lastNotifiedLevel = alertLvl;
                    newData.lastNotifiedReason = newData.reason;
                    newData.lastNotifiedTime = nowIso;
                    
                    console.log(`[NOTIF TRIGGER] Job: ${jobNo} | Level: ${alertLvl} | Teknisi: ${newData.engineer}`);
                    
                    // P1.8 PWA TARGETING (FCM Push) - Dinonaktifkan sementara (hanya menggunakan WA BLAST)
                    /*
                    try {
                        const { sendTargetedFCM } = require('./fcm_engine');
                        sendTargetedFCM({
                            jobNo: jobNo,
                            alertLvl: alertLvl,
                            engineer: newData.engineer,
                            branch: newData.virtualAsc || newData.asc,
                            reason: newData.reason
                        });
                    } catch(err) {
                        console.error('Gagal memanggil fcm_engine', err);
                    }
                    */
                } else {
                    // Carry over old deduplication state
                    newData.lastNotifiedLevel = lastNotifiedLevel;
                    newData.lastNotifiedReason = lastNotifiedReason;
                    newData.lastNotifiedTime = oldData.lastNotifiedTime;
                }
            } else {
                // If no state change, carry over existing deduplication state
                newData.lastNotifiedLevel = oldData.lastNotifiedLevel;
                newData.lastNotifiedReason = oldData.lastNotifiedReason;
                newData.lastNotifiedTime = oldData.lastNotifiedTime;
            }

            let shouldUpdate = isChanged;
            if ((oldData.totalAgingDays || 0) !== (newData.totalAgingDays || 0)) {
                shouldUpdate = true; // Langsung update jika durasi hari aging berubah (termasuk untuk unit RC)
            }
            if (!shouldUpdate && oldData.lastSeen) {
                const lsDate = new Date(oldData.lastSeen);
                if (now.getTime() - lsDate.getTime() > 4 * 60 * 60 * 1000) {
                    shouldUpdate = true; // Update lastSeen tiap 4 jam saja jika tidak ada perubahan
                }
            } else if (!oldData.lastSeen) {
                shouldUpdate = true;
            }

            if (shouldUpdate) {
                const updatedData = {
                    ...newData,
                    firstSeen: oldData.firstSeen || nowIso,
                    lastSeen: nowIso,
                    currentReasonSince,
                    history
                };
                
                // Sanitasi Firestore (hapus undefined supaya tidak error saat WriteBatch.update)
                Object.keys(updatedData).forEach(key => {
                    if (updatedData[key] === undefined) {
                        updatedData[key] = null;
                    }
                });
                
                currentBatch.update(docRef, updatedData);
                cacheMap.set(jobNo, { ...oldData, ...updatedData });
                commitOp();
            } else {
                commitOp(); // skip update
            }
        }
    }

    if (opCount > 0) {
        batches.push(currentBatch.commit());
    }

    try {
        await Promise.all(batches);
    } catch (err) {
        invalidateAgingCache();
        throw err;
    }

    try {
        const docsObj = {};
        for (const [id, data] of cacheMap.entries()) docsObj[id] = data;
        const tmpPath = AGING_CACHE_PATH + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify({ date: todayWIB, savedAt: nowIso, docs: docsObj }));
        fs.renameSync(tmpPath, AGING_CACHE_PATH);
    } catch (e) {
        console.log('  [CACHE] Gagal menyimpan cache (sync berikutnya baca ulang Firestore):', e.message);
        invalidateAgingCache();
    }

    console.log(`  Selesai! Jobs Baru: ${newJobs} | Perubahan State: ${stateChanges} | Dihapus (Selesai): ${deletedJobs}`);
    console.log('=============================================================\n');
}

module.exports = { trackAgingStates };
