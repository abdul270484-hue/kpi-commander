import { CONFIG } from './src/config.js?v=1790141904536';
import { scanRedoImage, initTesseract } from './src/services/ocr.js?v=1790141904536';
import { sendWA, sendWARC, sendWADosaSingleBranch, sendWARedo, getWAPayloadShame, getWAPayloadRC, getWAPayloadShameBranch, sendWABranchShame, getBranchPICContact } from './src/services/whatsapp.js?v=20261022_clean_filter_v2';
import { initRulesListener, addCustomRule as configAddRule, deleteCustomRule as configDeleteRule, initContactsListener, saveTechContacts } from './src/firebase/config.js?v=20261007_v8';
import { initUserListener, resetDeviceLock, removeApprovedUser, approveUser, editUserBranches } from './src/firebase/users.js?v=20261021_checklist_v1';
import { initAuth, isAdmin, normalizePhone } from './src/auth.js?v=20261013_v10';
import { handleFiles, handleProductivityFiles } from './src/parser.js?v=1790141904536';
import { initFirebaseAutoSync } from './src/firebase_sync.js?v=20261015_lock';

// Expose services to global scope for HTML inline onclick handlers
window.sendWA = sendWA;
window.sendWARC = sendWARC;
window.getWAPayloadShame = getWAPayloadShame;
window.getWAPayloadShameBranch = getWAPayloadShameBranch;
window.sendWABranchShame = sendWABranchShame;
window.getBranchPICContact = getBranchPICContact;
window.getWAPayloadRC = getWAPayloadRC;
window.sendWADosaSingleBranch = sendWADosaSingleBranch;
window.sendWARedo = sendWARedo;
window.resetDeviceLock = resetDeviceLock;
window.removeApprovedUser = removeApprovedUser;
window.approveUser = approveUser;
window.editUserBranches = editUserBranches;

// Firebase Initialization
const firebaseConfig = {
  projectId: "management-bujm-dashboard",
  appId: "1:686973979324:web:312ee50bb607be47621eb9",
  storageBucket: "management-bujm-dashboard.firebasestorage.app",
  apiKey: "AIzaSyDLKSMnHgiRE0v1KMW7S2iOOL4MjZ272pg",
  authDomain: "management-bujm-dashboard.firebaseapp.com",
  messagingSenderId: "686973979324"
};

if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
}
const db = window.firebase.firestore();
window.db = db;

window.customModels = [];
window.customReasons = [];

// Initialize Auth
initAuth(db);

// Initialize Firebase Realtime Cloud Sync (Zero-Drop Auto-Load)
initFirebaseAutoSync(db);

// Initialize Web Worker
const analyzerWorker = new Worker(`./src/worker.js?v=${Date.now()}`, { type: 'module' });

analyzerWorker.onmessage = function(e) {
    const { type, payload, error } = e.data;
    if (type === 'ANALYZE_DONE') {
        const {
            stats, mpuList, ubList, x09List, branchStats, shameList, rcStats,
            dosaCabangOver7, dosaCabangStats, engineerStats, dtsMxData, dtsIhData,
            unknownModels, unknownReasons
        } = payload;

        window.prodData = engineerStats; 
        window.dtsMxData = dtsMxData;
        window.dtsIhData = dtsIhData;
        window.unknownModels = unknownModels || [];
        window.unknownReasons = unknownReasons || [];
        window.dosaCabangData = dosaCabangOver7;
        window.dosaCabangStatsGlobal = dosaCabangStats;
        window.engineerData = engineerStats;
        window.rcData = rcStats; 
        window.shameData = shameList; 
        window.mpuData = mpuList; 
        window.ubData = ubList; 
        window.lastUnknownModels = unknownModels || [];
        window.lastUnknownReasons = unknownReasons || [];

        if (typeof updateUI === 'function') {
             updateUI(stats, mpuList, ubList, branchStats, shameList, rcStats);
        }
        
        if (unknownModels && unknownModels.length > 0) {
            showToastNotification('<strong>Attention:</strong> Found ' + unknownModels.length + ' unmapped models.<br>Please add them in <b>Rules Config</b>!');
        }

        if (unknownReasons && unknownReasons.length > 0) {
            setTimeout(() => {
                showToastNotification('<strong>\u{26A0}\u{FE0F}  Unmapped Reason Detected!</strong><br>Found ' + unknownReasons.length + ' unmapped reasons.<br>Click <b>Rules Config</b> to configure them!');
            }, 4000); 
        }
        
        if (typeof window.reMapRedoList === 'function') window.reMapRedoList();
        
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    } else if (type === 'PRODUCTIVITY_DONE') {
        try {
            const fameList = payload.fameList;
            const gdTrendData = payload.gdTrendData;
            const gdDailyData = payload.gdDailyData;
            window.prodData = fameList;
            window.prodJobs = payload.prodJobs || [];
            
            renderFameTable(fameList);
            if (typeof renderDtsIhTable === 'function') renderDtsIhTable();
            if (typeof renderDtsMxTable === 'function') renderDtsMxTable();
            
            if (typeof window.renderGdTrendChart === 'function') {
                window.renderGdTrendChart(gdTrendData);
            }
            if (payload.partsDailyData) window.partsDailyDataGlobal = payload.partsDailyData;
            if (typeof window.renderPartsSalesTable === 'function') { window.renderPartsSalesTable(payload.partsDailyData || {}); }
            if (typeof window.renderGdDailyTable === 'function') {
                window.renderGdDailyTable(gdDailyData);
            }
            if (typeof window.renderVolInVsGdTable === 'function') {
                window.renderVolInVsGdTable(payload.volInTrendData || window.volInTrendDataGlobal || {}, gdTrendData || window.gdTrendDataGlobal || {});
            }
            if (typeof window.reMapRedoList === 'function') window.reMapRedoList();
        } catch (err) {
            console.error('[PRODUCTIVITY ERROR]', err);
        }
        
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    } else if (type === 'ANALYZE_ERROR') {
        alert("An error occurred while processing data: " + error);
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }
};

// UI Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const dropZoneProd = document.getElementById('drop-zone-prod');
const fileInputProd = document.getElementById('file-input-prod');
const loadingOverlay = document.getElementById('loading-overlay');
const dashboardContent = document.getElementById('dashboard-content');
const emptyState = document.getElementById('empty-state');

// Business Logic Configuration (From Optimus Prime's Knowledge Base)
// Shorten ASC Name

// Determine product category based on model prefix

// Check if a part string matches any expensive part keywords

// Event Listeners for File Upload (Locked by Auth)
function initAuthGuardedListeners() {
    initTesseract(); // Pre-warm OCR worker in the background
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                handleFiles(e.dataTransfer.files, analyzerWorker, window.customModels || [], window.customReasons || []);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFiles(e.target.files, analyzerWorker, window.customModels || [], window.customReasons || []);
            }
        });
    }

    // Event Listeners for Productivity File Upload
    if (dropZoneProd && fileInputProd) {
        dropZoneProd.addEventListener('click', () => fileInputProd.click());
        dropZoneProd.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneProd.classList.add('dragover'); });
        dropZoneProd.addEventListener('dragleave', () => dropZoneProd.classList.remove('dragover'));
        dropZoneProd.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZoneProd.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleProductivityFiles(e.dataTransfer.files, analyzerWorker);
        });
        fileInputProd.addEventListener('change', (e) => {
            if (e.target.files.length) handleProductivityFiles(e.target.files, analyzerWorker);
        });
    }

    // Event Listeners for Queue CSV Upload (Multi File)
    const dropZoneQueue = document.getElementById('drop-zone-queue');
    const fileInputQueue = document.getElementById('file-input-queue');

    if (dropZoneQueue && fileInputQueue) {
        dropZoneQueue.addEventListener('click', () => fileInputQueue.click());
        dropZoneQueue.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneQueue.classList.add('dragover'); });
        dropZoneQueue.addEventListener('dragleave', () => dropZoneQueue.classList.remove('dragover'));
        dropZoneQueue.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZoneQueue.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleQueueFiles(e.dataTransfer.files);
        });
        fileInputQueue.addEventListener('change', (e) => {
            if (e.target.files.length) handleQueueFiles(e.target.files);
        });
    }
}

if (window.authReady) {
    initAuthGuardedListeners();
} else {
    window.addEventListener('bujm_auth_ready', initAuthGuardedListeners);
}

// ==========================================
// Sistem Bot WA WA BLASTER INTEGRATION (via Firestore)
// ==========================================
let isJarvisOnline = false;
let lastJarvisQr = null;

function updateJarvisUI(isReady, qrCode, isLocal = false) {
    const statusEl = document.getElementById('jarvis-status');
    const textEl = document.getElementById('jarvis-status-text');
    const qrModal = document.getElementById('jarvis-qr-modal');
    const qrImg = document.getElementById('jarvis-qr-img');
    if (!statusEl || !textEl) return;

    if (isReady) {
        if (isLocal) {
            isJarvisOnline = true;
            textEl.innerText = 'WA Bot System: Online (Local)';
        } else {
            isJarvisOnline = false;
            textEl.innerText = 'WA Bot System: Online (Central)';
        }
        lastJarvisQr = null;
        statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
        statusEl.style.color = '#10b981';
        statusEl.style.borderColor = '#10b981';
        statusEl.style.cursor = 'default';
        if (qrModal && qrModal.classList.contains('active')) qrModal.classList.remove('active');
    } else if (qrCode) {
        isJarvisOnline = false;
        lastJarvisQr = qrCode;
        statusEl.style.background = 'rgba(245, 158, 11, 0.2)';
        statusEl.style.color = '#f59e0b';
        statusEl.style.borderColor = '#f59e0b';
        statusEl.style.cursor = 'pointer';
        textEl.innerText = 'WA Bot System: Scan QR';
        if (qrImg) qrImg.src = qrCode;
    } else {
        isJarvisOnline = false;
        lastJarvisQr = null;
        statusEl.style.background = 'rgba(239, 68, 68, 0.2)';
        statusEl.style.color = 'var(--accent-red)';
        statusEl.style.borderColor = 'var(--accent-red)';
        statusEl.style.cursor = 'default';
        textEl.innerText = 'WA Bot System: Offline';
    }
}

let isLocalJarvisDetected = false;

function startJarvisFirestoreListener() {
    try {
        if (window.db) {
            window.db.collection('rpa_commands').doc('wa_status').onSnapshot(snap => {
                // If the user is running their own local Sistem Bot WA, ignore the central Firestore status
                if (isLocalJarvisDetected) return;
                if (snap.exists) {
                    const d = snap.data();
                    updateJarvisUI(!!d.waReady, d.qrCode || null);
                } else {
                    updateJarvisUI(false, null);
                }
            }, () => {
                if (!isLocalJarvisDetected) updateJarvisUI(false, null);
            });
        } else {
            setTimeout(startJarvisFirestoreListener, 2000);
        }
    } catch(e) { 
        if (!isLocalJarvisDetected) updateJarvisUI(false, null); 
    }
}
startJarvisFirestoreListener();

function checkJarvisStatus() {
    fetch('http://127.0.0.1:3001/api/status')
        .then(res => res.json())
        .then(data => {
            isLocalJarvisDetected = true;
            updateJarvisUI(data.ready, data.qr || null, true);
        })
        .catch(() => {
            if (isLocalJarvisDetected) {
                isLocalJarvisDetected = false;
                updateJarvisUI(false, null);
            }
        });
}

// Click on jarvis-status badge to open QR Code if not ready
const jarvisBadge = document.getElementById('jarvis-status');
if (jarvisBadge) {
    jarvisBadge.addEventListener('click', () => {
        if (!isJarvisOnline && lastJarvisQr) {
            const qrModal = document.getElementById('jarvis-qr-modal');
            const qrImg = document.getElementById('jarvis-qr-img');
            if (qrImg && lastJarvisQr) qrImg.src = lastJarvisQr;
            if (qrModal) qrModal.classList.add('active');
        } else if (!isJarvisOnline) {
            if (window.showToastNotification) {
                window.showToastNotification('\u{26A0}\u{FE0F}  WA Bot Super Engine is starting on port 3001...');
            }
        }
    });
}

// Close QR modal on backdrop click
const qrModalEl = document.getElementById('jarvis-qr-modal');
if (qrModalEl) {
    qrModalEl.addEventListener('click', (e) => {
        if (e.target === qrModalEl) {
            qrModalEl.classList.remove('active');
        }
    });
}

// Cek status saat pertama kali load dan setiap 5 detik
checkJarvisStatus();
setInterval(checkJarvisStatus, 5000);

// ==========================================
// AREA BRANCH SECURITY & VALIDATION HELPERS
// ==========================================
function getAllowedBranches() {
    let branches = window.currentUserBranches || [];
    if (!Array.isArray(branches) || branches.length === 0) {
        try {
            const cached = JSON.parse(localStorage.getItem('bujm_user_branches') || '[]');
            if (Array.isArray(cached) && cached.length > 0) {
                branches = cached;
                window.currentUserBranches = branches;
            }
        } catch (e) {}
    }
    if (!Array.isArray(branches) || branches.length === 0) {
        const email = (window.currentUser && window.currentUser.email) || 
                      (window.firebase && window.firebase.auth().currentUser && window.firebase.auth().currentUser.email);
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (email === 'abdul270484@gmail.com' || isLocal) {
            branches = ['DENPASAR', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET', 'KUPANG', 'SINGARAJA', 'MANADO'];
            window.currentUserBranches = branches;
        }
    }
    return branches.map(b => String(b).toUpperCase().trim()).filter(Boolean);
}

function isBranchAllowed(branchName, allowedBranches) {
    if (!branchName) return false;
    if (!allowedBranches || !Array.isArray(allowedBranches) || allowedBranches.length === 0) return false;
    if (typeof window.branchMatches === 'function') {
        return allowedBranches.some(allowed => window.branchMatches(allowed, branchName));
    }
    const target = String(branchName).toUpperCase().trim();
    return allowedBranches.some(allowed => {
        const a = String(allowed).toUpperCase().trim();
        if (!a) return false;
        const hasPinangTarget = target.includes('PINANG');
        const hasPinangA = a.includes('PINANG');
        if (hasPinangTarget !== hasPinangA && (target.includes('TANJUNG') || a.includes('TANJUNG'))) {
            return false;
        }
        return target.includes(a) || a.includes(target);
    });
}
window.getAllowedBranches = getAllowedBranches;
window.isBranchAllowed = isBranchAllowed;

async function blastViaJarvis(blastQueueArray) {
    if (!isJarvisOnline) {
        showToastNotification('WA System is Offline! Ensure start_jarvis_background.vbs is running.');
        return false;
    }

    // [SECURITY] DOUBLE CHECK AREA KEAMANAN
    const allowed = getAllowedBranches();
    if (!allowed || allowed.length === 0) {
        alert('\u{1F6A8} KEAMANAN SISTEM:\nTidak ada cabang area yang terdaftar untuk akun Anda! Pengiriman dibatalkan.');
        return false;
    }
    
    const safeQueue = blastQueueArray.filter(item => {
        if (!item.branch) return true;
        return isBranchAllowed(item.branch, allowed);
    });

    if (safeQueue.length === 0) {
        alert('\u{1F6A8} KEAMANAN SISTEM:\nSemua antrean pesan berada di luar area cabang Anda. Tidak ada pesan yang dikirim.');
        return false;
    }
    
    showToastNotification(`Mengirim ${safeQueue.length} pesan ke Bot WA (Area: ${allowed.join(', ')})...`);
    
    try {
        const response = await fetch('http://127.0.0.1:3001/api/blast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                template: '[PesanUtama]',
                data: safeQueue,
                allowedBranches: allowed
            })
        });
        
        const result = await response.json();
        if (result.success) {
            showToastNotification('SUCCESS! WA Bot System is now sending messages in background automatically.');
            return true;
        } else {
            showToastNotification('Failed to send to WA Bot System: ' + result.error);
            return false;
        }
    } catch (err) {
        showToastNotification('Communication error with WA Bot System: ' + err.message);
        return false;
    }
}

// Function for Blast Wall of Shame (HANYA AREA SENDIRI)
async function executeAreaBlastShame(isAuto = false) {
    // 1. Ambil daftar cabang yang diizinkan untuk user aktif (Asmen)
    const allowedBranches = getAllowedBranches();
    if (!allowedBranches || allowedBranches.length === 0) {
        console.warn('\u{26A0}\u{FE0F}  [BLAST SHAME] Ditolak: Tidak ada cabang area yang terdaftar!');
        showToastNotification('\u{26A0}\u{FE0F}  WA Blast dibatalkan: Akun Anda tidak memiliki cabang area yang terdaftar.');
        return false;
    }

    // MULTI-PAGE ROBUST FALLBACK:
    // Jika window.shameData belum siap (misal sedang di halaman GD & SALES), ambil dari rawDashboardData atau Firestore!
    let sourceShame = (window.shameData && window.shameData.length > 0) ? window.shameData : null;
    if (!sourceShame && window.rawDashboardData && Array.isArray(window.rawDashboardData.shameList) && window.rawDashboardData.shameList.length > 0) {
        sourceShame = window.rawDashboardData.shameList;
    }
    if (!sourceShame && window.db) {
        try {
            const snap = await window.db.collection('dashboard_data').doc('latest').get();
            if (snap.exists && snap.data().shameList) {
                sourceShame = snap.data().shameList;
                window.shameData = sourceShame;
            }
        } catch (_) {}
    }

    if (!sourceShame || sourceShame.length === 0) {
        console.warn('\u{26A0}\u{FE0F}  [BLAST SHAME] Data Wall of Shame belum tersedia di memori.');
        if (!isAuto) showToastNotification('Tidak ada data Wall of Shame yang tersedia.');
        return false;
    }

    // 2. Filter STRICT HANYA cabang area sendiri
    const areaShameData = sourceShame.filter(item => {
        if (!item || !item.engineer) return false;
        const norm = (item.engineer || '').toUpperCase().trim();
        if (norm === 'UNKNOWN ENGINEER' || norm === 'UNKNOWN' || norm === 'UNKNOWN_ENGINEER' || norm === 'N/A' || norm.startsWith('PIC ') || norm.startsWith('KACAB ')) {
            return false;
        }
        return isBranchAllowed(item.asc, allowedBranches);
    });

    if (areaShameData.length === 0) {
        if (!isAuto) showToastNotification(`Tidak ada teknisi Wall of Shame di cabang area Anda (${allowedBranches.join(', ')}).`);
        return true; // Tidak ada pelanggaran di area sendiri, dianggap beres
    }

    // 3. Kelompokkan teknisi Wall of Shame per Cabang (ASC) untuk Blast ke PIC/Leader Cabang
    const branchMap = {};
    areaShameData.forEach(item => {
        const branchKey = item.asc;
        if (!branchMap[branchKey]) branchMap[branchKey] = [];
        branchMap[branchKey].push(item);
    });

    const blastQueueArray = [];
    const blastQueueManual = [];
    const missingPicBranches = [];

    for (let branch in branchMap) {
        const branchTechs = branchMap[branch];
        if (typeof window.getWAPayloadShameBranch === 'function') {
            const payload = window.getWAPayloadShameBranch(branch, branchTechs);
            if (payload && payload.phone) {
                blastQueueArray.push({
                    phone: payload.phone,
                    name: payload.name || ("PIC " + branch),
                    branch: branch,
                    PesanUtama: payload.text
                });
                blastQueueManual.push({
                    branch: branch,
                    payload: payload
                });
            } else {
                missingPicBranches.push(branch);
            }
        }
    }

    if (blastQueueArray.length === 0) {
        if (!isAuto) {
            if (missingPicBranches.length > 0) {
                showToastNotification("Nomor WA PIC/Leader untuk cabang (" + missingPicBranches.join(', ') + ") belum disetting di menu Kontak!");
            } else {
                showToastNotification('Tidak ada kontak PIC/Leader yang ditemukan untuk cabang di area Anda.');
            }
        }
        return false;
    }

    if (missingPicBranches.length > 0) {
        console.warn("[BLAST SHAME PIC] Cabang tanpa kontak PIC/Leader: " + missingPicBranches.join(', '));
    }

    // 4. Langsung jalankan pengiriman (Non-blocking tanpa modal popup)
    const targetBranches = blastQueueArray.map(item => item.branch);
    // Pastikan status WA dicek ulang TERLEBIH DAHULU sebelum memberi notifikasi
    if (!isJarvisOnline) {
        try {
            const checkRes = await fetch('http://127.0.0.1:3001/api/status');
            const checkData = await checkRes.json();
            if (checkData.ready) isJarvisOnline = true;
        } catch (_) {}
    }

    if (isJarvisOnline) {
        // Sistem Bot WA Mode (Online)
        console.log("[BLAST WA SHAME PIC] Mengirim chat ke " + blastQueueArray.length + " PIC Cabang (" + targetBranches.join(', ') + ")...");
        showToastNotification("🚀 Mengirim WA Blast ke " + blastQueueArray.length + " PIC Cabang (" + targetBranches.join(', ') + ")...");
        const blastOk = await blastViaJarvis(blastQueueArray);
        return blastOk;
    } else if (!isAuto) {
        // Manual Fallback Mode (Hanya saat manual klik di browser)
        showToastNotification("⚠️ Bot WA offline. Membuka WhatsApp Web Manual untuk " + blastQueueManual.length + " PIC Cabang... Izinkan POPUP BROWSER!");
        let index = 0;
        const blastInterval = setInterval(() => {
            if (index >= blastQueueManual.length) {
                clearInterval(blastInterval);
                showToastNotification('WA Blast PIC Cabang Selesai! Semua pesan monitoring telah diproses.');
                return;
            }
            const item = blastQueueManual[index];
            const url = "https://wa.me/" + item.payload.phone + "?text=" + encodeURIComponent(item.payload.text);
            window.open(url, '_blank');
            index++;
        }, 10000);
        return true;
    } else {
        console.warn('⚠️ [AUTO ALERT] Bot WA lokal offline di port 3001, pengiriman otomatis ditunda.');
        return false;
    }
}

// Function for Blast Pending Delivery (HANYA AREA SENDIRI)
async function executeAreaBlastRC(isAuto = false) {
    // 1. Ambil daftar cabang yang diizinkan untuk user aktif (Asmen)
    const allowedBranches = getAllowedBranches();
    if (!allowedBranches || allowedBranches.length === 0) {
        console.warn('\u{26A0}\u{FE0F}  [BLAST RC] Ditolak: Tidak ada cabang area yang terdaftar!');
        showToastNotification('\u{26A0}\u{FE0F}  WA Blast RC dibatalkan: Akun Anda tidak memiliki cabang area yang terdaftar.');
        return false;
    }

    // MULTI-PAGE ROBUST FALLBACK
    let sourceRC = (window.rcData && Object.keys(window.rcData).length > 0) ? window.rcData : null;
    if (!sourceRC && window.rawDashboardData && window.rawDashboardData.rcStats) {
        sourceRC = window.rawDashboardData.rcStats;
        window.rcData = sourceRC;
    }
    if (!sourceRC && window.db) {
        try {
            const snap = await window.db.collection('dashboard_data').doc('latest_eng').get();
            if (snap.exists && snap.data().rcStats) {
                sourceRC = snap.data().rcStats;
                window.rcData = sourceRC;
            }
        } catch (_) {}
    }

    if (!sourceRC || Object.keys(sourceRC).length === 0) {
        if (!isAuto) showToastNotification('Tidak ada data Pending Delivery yang tersedia.');
        return false;
    }

    // 2. Filter STRICT HANYA cabang area sendiri
    const areaAscList = Object.keys(sourceRC).filter(asc => {
        return isBranchAllowed(asc, allowedBranches);
    });

    if (areaAscList.length === 0) {
        if (!isAuto) showToastNotification(`Tidak ada data Pending Delivery di cabang area Anda (${allowedBranches.join(', ')}).`);
        return true;
    }

    const blastQueueArray = [];
    const blastQueueManual = [];

    areaAscList.forEach(asc => {
        if (window.getWAPayloadRC) {
            const count = sourceRC[asc].count;
            const payload = window.getWAPayloadRC(asc, count);
            if (payload) {
                blastQueueArray.push({
                    phone: payload.phone,
                    name: payload.name,
                    branch: asc,
                    PesanUtama: payload.text
                });
                blastQueueManual.push({ asc, count });
            }
        }
    });
    
    if (blastQueueArray.length === 0) {
        if (!isAuto) showToastNotification('PIC cabang di area Anda belum memiliki nomor kontak WA terdaftar!');
        return false;
    }

    // 3. Langsung jalankan pengiriman (Non-blocking tanpa modal popup)
    const targetBranches = [...new Set(blastQueueManual.map(item => item.asc))];
    // Pastikan status WA dicek ulang TERLEBIH DAHULU sebelum memberi notifikasi
    if (!isJarvisOnline) {
        try {
            const checkRes = await fetch('http://127.0.0.1:3001/api/status');
            const checkData = await checkRes.json();
            if (checkData.ready) isJarvisOnline = true;
        } catch (_) {}
    }

    if (isJarvisOnline) {
        // Sistem Bot WA Mode (Online)
        console.log(`[BLAST WA RC] Mengirim chat ke ${blastQueueArray.length} PIC cabang area (${targetBranches.join(', ')})...`);
        showToastNotification(`\u{1F680} Mengirim WA Blast ke ${blastQueueArray.length} PIC cabang area Anda (${targetBranches.join(', ')})...`);
        const blastOk = await blastViaJarvis(blastQueueArray);
        return blastOk;
    } else if (!isAuto) {
        // Manual Fallback Mode
        showToastNotification(`\u{26A0}\u{FE0F} Bot WA belum terhubung (Scan QR). Beralih ke WhatsApp Web Manual untuk ${blastQueueManual.length} cabang area... Izinkan POPUP BROWSER!`);
        let index = 0;
        const blastInterval = setInterval(() => {
            if (index >= blastQueueManual.length) {
                clearInterval(blastInterval);
                showToastNotification('WA Blast RC Area Selesai! Semua peringatan telah diproses.');
                return;
            }
            const item = blastQueueManual[index];
            if (typeof window.sendWARC === 'function') {
                window.sendWARC(item.asc, item.count);
            }
            index++;
        }, 10000);
        return true;
    } else {
        console.warn('\u{26A0}\u{FE0F}  [AUTO ALERT] Bot WA lokal offline di port 3001, pengiriman otomatis ditunda.');
        return false;
    }
}

window.executeAreaBlastShame = executeAreaBlastShame;
window.executeAreaBlastRC = executeAreaBlastRC;

// Event Listeners for Manual Blast Buttons
const btnBlastShame = document.getElementById('btnBlastShame');
if (btnBlastShame) {
    btnBlastShame.addEventListener('click', () => executeAreaBlastShame(false));
}

const btnBlastRC = document.getElementById('btnBlastRC');
if (btnBlastRC) {
    btnBlastRC.addEventListener('click', () => executeAreaBlastRC(false));
}

// Event Listener for Share Dosa Cabang (> 7 Hari)
const btnShareDosaCabang = document.getElementById('btnShareDosaCabang');
if (btnShareDosaCabang) {
    btnShareDosaCabang.addEventListener('click', () => {
        if (!window.dosaCabangData || window.dosaCabangData.length === 0) {
            showToastNotification('No Branch Defect data > 7 days available!');
            return;
        }
        
        const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        let text = `*AGING DOSA CABANG (> 7 HARI)*\n*Update:* ${dateStr}\n\nHere is the list of pending bills originating from branch internal delays over 7 days (excluding SEIN/Part issues):\n\n`;
        
        // Group by Branch
        const grouped = {};
        window.dosaCabangData.forEach((item) => {
            if (!grouped[item.asc]) grouped[item.asc] = [];
            grouped[item.asc].push(item);
        });
        
        // Sort Branch A-Z
        const sortedBranches = Object.keys(grouped).sort();
        
        sortedBranches.forEach((branch, bIdx) => {
            text += `*${bIdx+1}. ${branch}*\n`;
            grouped[branch].forEach(item => {
                text += `   - ${item.jobNo} | ${item.engineer} | ${item.model} | *${item.pendingDays} hari* | Reason: ${item.reason || '-'}\n`;
            });
            text += `\n`;
        });
        
        text += `Branch Heads / PIC please follow up on the above pending units today! Thank you. \u{1F64F}`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Branch Defect list > 7 days copied! Please paste into your WA group.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Failed to copy text.');
        });
    });
}


// Event Listener for Share Wall of Fame
const btnShareFame = document.getElementById('btnShareFame');
if (btnShareFame) {
    btnShareFame.addEventListener('click', () => {
        if (!window.fameData || window.fameData.length === 0) {
            showToastNotification('No Wall of Fame data available or list is empty!');
            return;
        }
        
        const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        // Penentuan sapaan berdasarkan waktu
        const hour = new Date().getHours();
        let greeting = 'Selamat pagi';
        if (hour >= 11 && hour < 15) greeting = 'Selamat siang';
        else if (hour >= 15 && hour < 18) greeting = 'Selamat sore';
        else if (hour >= 18 || hour < 4) greeting = 'Selamat malam';

        let text = `*WALL OF FAME (TOP PERFORMERS)* \u{1F3C6}\n` +
                   `Update: ${dateStr}\n\n` +
                   `${greeting} Tim, mari berikan apresiasi kepada Teknisi dengan produktivitas GD tertinggi (Bulan Berjalan):\n\n`;

        const seenEng = new Set();
        let rankIdx = 0;
        window.fameData.forEach((eng) => {
            const engKey = (eng.engineer || '').trim().toUpperCase();
            if (seenEng.has(engKey)) return;
            seenEng.add(engKey);

            let medali = '';
            if (rankIdx === 0) medali = '\u{1F947}';
            else if (rankIdx === 1) medali = '\u{1F948}';
            else if (rankIdx === 2) medali = '\u{1F949}';
            else medali = '\u{1F396}\u{FE0F}';
            
            text += `${medali} *${eng.engineer}* (${eng.resolvedBranch || eng.asc || '-'})` +
                    `\n   Total GD : ${eng.gdCount}` +
                    `\n   Repair   : ${eng.gdRepair}` +
                    `\n   Cancel   : ${eng.gdCancel}\n\n`;
            rankIdx++;
        });
        
        text += `Terus tingkatkan produktivitas dan pertahankan performa luar biasa ini! \u{1F525}\u{1F44D}`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Daftar Wall of Fame berhasil disalin! Silakan paste di Grup WA.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Failed to copy text.');
        });
    });
}


// Event Listener for Share MPU
const btnShareMpu = document.getElementById('btnShareMpu');
if (btnShareMpu) {
    btnShareMpu.addEventListener('click', () => {
        if (!window.mpuData || window.mpuData.length === 0) {
            showToastNotification('No MPU Violation data available or list is empty!');
            return;
        }
        
        let text = `*MPU VIOLATION REPORT (Multiple Part Usage)*\nDetected multiple main/expensive parts usage on IW bills:\n\n`;
        
        window.mpuData.forEach((item, idx) => {
            text += `${idx + 1}. *${item.asc}* | ${item.engineer} | Job: ${item.jobNo} (${item.model})\n`;
        });
        
        text += `Please verify immediately as this degrades KPI Grading.`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('MPU text copied! Please paste into Branch Head WA group.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Failed to copy text. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share UB
const btnShareUb = document.getElementById('btnShareUb');
if (btnShareUb) {
    btnShareUb.addEventListener('click', () => {
        if (!window.ubData || window.ubData.length === 0) {
            showToastNotification('No UB Repair Violation data available or list is empty!');
            return;
        }
        
        let text = `*UB REPAIR VIOLATION REPORT (FOLD/FLIP)*\nStrict Prohibition! Detected OCTA replacement on Fold/Flip IW units:\n\n`;
        
        window.ubData.forEach((item, idx) => {
            text += `${idx + 1}. *${item.asc}* | ${item.engineer} | Job: ${item.jobNo} (${item.model})\n`;
        });
        
        text += `Please verify immediately as this degrades KPI Grading.`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('UB text copied! Please paste into Branch Head WA group.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Failed to copy text. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share DTS MX
const btnExportDts = document.getElementById('btnExportDts');
if (btnExportDts) {
    btnExportDts.addEventListener('click', () => {
        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            showToastNotification('No DTS MX data available to share!');
            return;
        }
        
        let text = `*MX TECHNICIAN PRODUCTIVITY REPORT (CARRY IN)*\n\n`;
        
        const grouped = {};
        Object.values(window.dtsMxData).forEach(item => {
            if (!grouped[item.asc]) grouped[item.asc] = [];
            grouped[item.asc].push(item);
        });
        
        const sortedBranches = Object.keys(grouped).sort();
        
        sortedBranches.forEach((branch, bIdx) => {
            text += `*${bIdx+1}. ${branch}*\n`;
            grouped[branch].sort((a, b) => a.name.localeCompare(b.name));
            grouped[branch].forEach(item => {
                text += `   - ${item.name}: Vol In: ${item.volIn} | RC: ${item.rc} | GD: ${item.gd} | Sisa Aging: ${item.aging}\n`;
            });
        });
        
        text += `\nMohon memonitor teknisi yang produktivitasnya masih rendah dan segera menyelesaikan sisa aging.`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('DTS MX text copied! Please paste into Branch Head WA group.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Failed to copy text. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share DTS IH
const btnExportDtsIh = document.getElementById('btnExportDtsIh');
if (btnExportDtsIh) {
    btnExportDtsIh.addEventListener('click', () => {
        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            showToastNotification('No DTS CE data available to share!');
            return;
        }
        
        let text = `*REPORT DAILY TRACKING SYSTEM (DTS) - CE*\n\n`;
        
        let validDtsIh = Object.values(window.dtsIhData).filter(item => item.totalVisits > 0 || item.totalAging > 0);
        
        const grouped = {};
        validDtsIh.forEach(item => {
            if (!grouped[item.asc]) grouped[item.asc] = [];
            grouped[item.asc].push(item);
        });
        
        const sortedBranches = Object.keys(grouped).sort();
        
        sortedBranches.forEach((branch, bIdx) => {
            text += `*${bIdx+1}. ${branch}*\n`;
            grouped[branch].sort((a, b) => a.name.localeCompare(b.name));
            grouped[branch].forEach(item => {
                text += `   - ${item.name}: Visits: ${item.totalVisits} | RC: ${item.rcVisits} | GD: ${item.gdVisits} | Pend: ${item.pendingVisits} | Aging: ${item.totalAging}\n`;
            });
        });
        
        text += `\nMohon memonitor teknisi yang produktivitasnya masih rendah dan segera menyelesaikan sisa aging.`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('DTS CE text copied! Please paste into Branch Head WA group.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Failed to copy text. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share Queue (Front Desk)
const btnExportQueue = document.getElementById('btnExportQueue');
if (btnExportQueue) {
    btnExportQueue.addEventListener('click', () => {
        if (!window.queueData || Object.keys(window.queueData).length === 0) {
            showToastNotification('No Queue data available to share!');
            return;
        }
        
        let text = `*REPORT CS / FRONT DESK PERFORMANCE*\n(Target Waiting Time < 10 Menit)\n\n`;
        
        let validQueue = Object.values(window.queueData).filter(item => item.totalQ > 0);
        validQueue.sort((a,b) => a.asc.localeCompare(b.asc));
        
        validQueue.forEach((item, idx) => {
            let avgWait = (item.totalWaitMins / item.totalQ).toFixed(1);
            let avgHand = (item.totalHandleMins / item.totalQ).toFixed(1);
            let pct = ((item.under10Mins / item.totalQ) * 100).toFixed(1);
            
            text += `*${idx+1}. ${item.asc}*\n`;
            text += `   - Total Antrean: ${item.totalQ} org\n`;
            text += `   - Avg Waiting Time: ${avgWait} menit\n`;
            text += `   - Avg Handling Time: ${avgHand} menit\n`;
            text += `   - Pencapaian (<10m): ${pct}%\n\n`;
        });
        
        text += `Mohon Kepala Cabang memonitor kecepatan pelayanan Front Desk / Customer Service.`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Teks CS Performance berhasil disalin! Silakan paste di Grup WA Kepala Cabang.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Failed to copy text. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}


// Process Operational Excel Files (Multi File Auto-Merge & Auto-VLOOKUP)

// Global Queue Data
window.queueData = {};

// Process Queue CSV Files (Multi File Auto-Merge)
function handleQueueFiles(fileList) {
    loadingOverlay.classList.remove('hidden');
    
    let promises = [];
    
    for (let i = 0; i < fileList.length; i++) {
        let file = fileList[i];
        
        // Extract branch from filename (e.g. "CSP DPS.csv" -> "DPS")
        let branchName = "UNKNOWN";
        let fileName = file.name.toUpperCase();
        let match = fileName.match(/CSP\s+([A-Z0-9]+)/);
        if (match && match[1]) {
            branchName = match[1];
        } else if (fileName.includes('DPS')) {
            branchName = 'DPS';
        } else if (fileName.includes('DCW')) {
            branchName = 'DCW';
        } else if (fileName.includes('KPG')) {
            branchName = 'KPG';
        } else if (fileName.includes('SGJ')) {
            branchName = 'SGJ';
        }
        
        let promise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                resolve({ branch: branchName, data: json });
            };
            reader.readAsArrayBuffer(file);
        });
        promises.push(promise);
    }
    
    Promise.all(promises).then((results) => {
        analyzeQueueData(results);
    });
}

// Logic: Calculate Queue Times
function analyzeQueueData(results) {
    // We don't reset window.queueData here if we want to allow uploading more files sequentially
    // But for a single batch drag-and-drop, it's safer to reset so it doesn't double count if same file dropped twice.
    window.queueData = {}; 
    let totalQueueGlobal = 0;
    let under10Global = 0;
    let under10HandleGlobal = 0;
    
    results.forEach(fileResult => {
        let asc = fileResult.branch;
        if (!window.queueData[asc]) {
            window.queueData[asc] = {
                asc: asc,
                totalQ: 0,
                totalWaitMins: 0,
                totalHandleMins: 0,
                under10Mins: 0,
                under10HandleMins: 0
            };
        }
        
        let bStats = window.queueData[asc];
        
        fileResult.data.forEach(row => {
            // Ignore Cancelled Queue
            if (row['dtCancel'] && row['dtCancel'] !== '#null#' && String(row['dtCancel']).trim() !== '') {
                return;
            }
            
            // Helper to parse both String and Excel Number Dates accurately
            function parseQueueDate(val) {
                if (!val || val === '#null#') return null;
                if (typeof val === 'number') {
                    // Convert Excel Serial Date to JS Timestamp
                    return Math.round((val - 25569) * 86400 * 1000);
                }
                if (typeof val === 'string') {
                    return new Date(val.replace(/-/g, '/')).getTime();
                }
                return null;
            }
            
            let tMake = parseQueueDate(row['dtMake']);
            let tCall = parseQueueDate(row['dtCall']);
            let tComp = parseQueueDate(row['dtComplete']) || tCall;
            
            if (!tMake || !tCall || isNaN(tMake) || isNaN(tCall)) return;
            
            let waitMs = tCall - tMake;
            let waitMins = waitMs / (1000 * 60);
            if (waitMins < 0) waitMins = 0;
            
            // Perintah Komandan: Q-HANDLING = dtComplete - dtMake
            let handleMs = tComp - tMake;
            let handleMins = handleMs / (1000 * 60);
            if (handleMins < 0) handleMins = 0;
            
            bStats.totalQ++;
            bStats.totalWaitMins += waitMins;
            bStats.totalHandleMins += handleMins;
            
            totalQueueGlobal++;
            if (waitMins < 10) {
                bStats.under10Mins++;
                under10Global++;
            }
            if (handleMins < 10) {
                bStats.under10HandleMins++;
                under10HandleGlobal++;
            }
        });
    });
    
    // Update KPI UI
    let pctGlobal = totalQueueGlobal > 0 ? ((under10Global / totalQueueGlobal) * 100).toFixed(1) : 0;
    const valQWaiting = document.getElementById('val-q-waiting');
    if (valQWaiting) valQWaiting.textContent = `${pctGlobal}%`;
    
    let pctHandleGlobal = totalQueueGlobal > 0 ? ((under10HandleGlobal / totalQueueGlobal) * 100).toFixed(1) : 0;
    const valQHandling = document.getElementById('val-q-handling');
    if (valQHandling) valQHandling.textContent = `${pctHandleGlobal}%`;
    
    renderQueueTable();
    
    loadingOverlay.classList.add('hidden');
    dashboardContent.classList.remove('hidden');
    emptyState.classList.add('hidden');
}

// Render Table
function renderQueueTable() {
    const tbody = document.querySelector('#queue-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let branches = Object.values(window.queueData).sort((a,b) => a.asc.localeCompare(b.asc));
    
    if (branches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Data antrean kosong atau tidak valid</td></tr>`;
        return;
    }
    
    branches.forEach(b => {
        let avgWait = b.totalQ > 0 ? (b.totalWaitMins / b.totalQ).toFixed(1) : 0;
        let avgHand = b.totalQ > 0 ? (b.totalHandleMins / b.totalQ).toFixed(1) : 0;
        let pctWait = b.totalQ > 0 ? ((b.under10Mins / b.totalQ) * 100).toFixed(1) : 0;
        let pctHand = b.totalQ > 0 ? ((b.under10HandleMins / b.totalQ) * 100).toFixed(1) : 0;
        
        let waitColor = avgWait > 10 ? 'color:var(--accent-red);' : 'color:var(--accent-green);';
        let pctWaitColor = pctWait < 100 ? 'color:var(--accent-orange);' : 'color:var(--accent-green);';
        let pctHandColor = pctHand < 100 ? 'color:var(--accent-orange);' : 'color:var(--accent-green);';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${b.asc}</strong></td>
            <td style="text-align:center; font-weight:600;">${b.totalQ}</td>
            <td style="text-align:center; font-weight:600; ${waitColor}">${avgWait} m</td>
            <td style="text-align:center; font-weight:600;">${avgHand} m</td>
            <td style="text-align:center; font-weight:600; ${pctWaitColor}">${pctWait}%</td>
            <td style="text-align:center; font-weight:600; ${pctHandColor}">${pctHand}%</td>
        `;
        tbody.appendChild(tr);
    });
}

// Process Productivity Excel Files (Multi File Auto-Merge)

// Chart Instances
let ltpChartInstance = null;
let respChartInstance = null;

// --- HELPER FUNCTION: Smart Date Parser ---
// Defeats Excel Regional Corruption by evaluating both DD/MM and MM/DD.
function parseExcelDate(dateVal) {
    if (!dateVal) return null;
    let dateObj = null;
    if (typeof dateVal === 'number') {
        let dateRaw = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        let dateSwapped = new Date(dateRaw.getFullYear(), dateRaw.getDate() - 1, dateRaw.getMonth() + 1);
        
        let diffRaw = Date.now() - dateRaw.getTime();
        let diffSwapped = Date.now() - dateSwapped.getTime();
        
        let validRaw = !isNaN(dateRaw.getTime()) && diffRaw >= -86400000;
        let validSwapped = !isNaN(dateSwapped.getTime()) && diffSwapped >= -86400000;
        
        if (validRaw && validSwapped) {
            dateObj = (diffRaw < diffSwapped) ? dateRaw : dateSwapped;
        } else if (validRaw) {
            dateObj = dateRaw;
        } else {
            dateObj = dateSwapped;
        }
    } else if (typeof dateVal === 'string') {
        const parts = dateVal.split(/[-/ :.]/);
        if (parts.length >= 3) {
            let p0 = parts[0].padStart(2, '0');
            let p1 = parts[1].padStart(2, '0');
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            
            let dateA = new Date(`${year}-${p1}-${p0}T00:00:00`);
            let dateB = new Date(`${year}-${p0}-${p1}T00:00:00`);
            
            let diffA = Date.now() - dateA.getTime();
            let diffB = Date.now() - dateB.getTime();
            
            let validA = !isNaN(dateA.getTime()) && diffA >= -86400000;
            let validB = !isNaN(dateB.getTime()) && diffB >= -86400000;
            
            if (validA && validB) {
                dateObj = (diffA < diffB) ? dateA : dateB;
            } else if (validA) {
                dateObj = dateA;
            } else {
                dateObj = dateB;
            }
        } else {
            dateObj = new Date(dateVal);
        }
    }
    return dateObj;
}

function isDateToday(dateVal) {
    let parsedDate = parseExcelDate(dateVal);
    if (!parsedDate || isNaN(parsedDate.getTime())) return false;
    let today = new Date();
    return parsedDate.getDate() === today.getDate() &&
           parsedDate.getMonth() === today.getMonth() &&
           parsedDate.getFullYear() === today.getFullYear();
}

// Productivity Core Analytics Engine

function renderFameTable(fameList) {
    const uniqueFame = [];
    const seen = new Set();
    (fameList || []).forEach(f => {
        const k = (f.engineer || '').trim().toUpperCase();
        if (!seen.has(k)) {
            seen.add(k);
            uniqueFame.push(f);
        }
    });
    fameList = uniqueFame;
    window.fameData = fameList;
    const tbodyFame = document.querySelector('#fame-table tbody');
    tbodyFame.innerHTML = '';
    
    if (fameList.length === 0) {
        tbodyFame.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">No Good Delivered data found!</td></tr>`;
    } else {
        fameList.forEach(item => {
            let gdCountText = item.gdCount > 0 ? `${item.gdCount} Units` : '';
            let gdPrevText = item.gdPrevMonth > 0 ? `${item.gdPrevMonth} Units` : '-';
            let avgGdText = parseFloat(item.avgGd) > 0 ? item.avgGd : '';
            let repairText = item.gdRepair > 0 ? item.gdRepair : '';
            let cancelText = item.gdCancel > 0 ? item.gdCancel : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-size: 0.85rem; font-weight: 600;">${item.resolvedBranch}</td>
                <td style="font-size: 0.85rem; font-weight: 600;">${item.engineer}</td>
                <td style="text-align:center;"><span style="color:var(--accent-blue); font-size:0.85rem; font-weight: 700;">${gdCountText}</span></td>
                <td style="text-align:center; font-weight:700; font-size:0.85rem;">${avgGdText}</td>
                <td style="color:var(--accent-green); font-weight:700; font-size: 0.85rem; text-align:center;">${repairText}</td>
                <td style="color:var(--accent-red); font-weight:700; font-size: 0.85rem; text-align:center;">${cancelText}</td>
            `;
            tbodyFame.appendChild(tr);
        });
    }
    
    // Also re-render DTS MX and DTS IH Tables in case GD data updated it
    renderDtsMxTable();
    if (typeof renderDtsIhTable === 'function') renderDtsIhTable();

    
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 500);
}

// Core Analytics Engine

// Toast Notification System
function showToastNotification(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.right = '30px';
    toast.style.backgroundColor = 'rgba(249, 115, 22, 0.95)'; // accent-orange
    toast.style.color = '#fff';
    toast.style.padding = '16px 24px';
    toast.style.borderRadius = '12px';
    toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    toast.style.zIndex = '9999';
    toast.style.maxWidth = '400px';
    toast.style.fontSize = '0.9rem';
    toast.style.borderLeft = '4px solid #fff';
    toast.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px;"></i> ${msg}`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 10000); // Dismiss after 10s
}

// Update DOM and Charts
function updateUI(stats, mpuList, ubList, branchStats, shameList, rcStats) {
    if (stats) window.dashboardSummary = stats;
    if (branchStats) window.branchData = branchStats;
    if (rcStats) window.rcData = rcStats;

    // Render KPI Scoreboard
    const kpiContainer = document.getElementById('kpi-cards-container');
    const kpiScoreboard = document.getElementById('kpi-scoreboard');
    
    if (kpiContainer && kpiScoreboard) {
        kpiContainer.innerHTML = '';
        
        const renderKPIBox = (title, targetPct, actualPct) => {
            const isFail = actualPct > targetPct;
            const color = isFail ? 'var(--accent-red)' : 'var(--accent-green)';
            const icon = isFail ? 'fa-triangle-exclamation' : 'fa-circle-check';
            
            return `
                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; flex: 1; min-width: 150px; border-left: 4px solid ${color}; text-align:center;">
                    <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">${title}</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: ${color}; margin: 5px 0;">
                        ${actualPct.toFixed(1)}%
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-main);">
                        <i class="fa-solid ${icon}"></i> Target: <strong>${targetPct}%</strong>
                    </div>
                </div>
            `;
        };

        const calcPct = (count, total) => total > 0 ? (count / total) * 100 : 0;
        
        // Ex-LTP is a subset of pending that passed the LTP timeline, so total LTP includes Ex-LTP.
        const mxLtp = (stats.breakdownLtp?.MX || 0) + (stats.breakdownExLtp?.MX || 0);
        const vdLtp = (stats.breakdownLtp?.VD || 0) + (stats.breakdownExLtp?.VD || 0);
        const daLtp = (stats.breakdownLtp?.DA || 0) + (stats.breakdownExLtp?.DA || 0);

        // Targets based on 2026 KPI Image
        kpiContainer.innerHTML += renderKPIBox('MX LTP (> 3d)', 5.8, calcPct(mxLtp, stats.totalCat?.MX || 0));
        kpiContainer.innerHTML += renderKPIBox('VD LTP (> 7d)', 7.6, calcPct(vdLtp, stats.totalCat?.VD || 0));
        kpiContainer.innerHTML += renderKPIBox('DA LTP (> 5d)', 5.3, calcPct(daLtp, stats.totalCat?.DA || 0));
        
        // Ex-LTP Targets based on 2026 KPI Image
        kpiContainer.innerHTML += renderKPIBox('MX EX-LTP (> 7d)', 1.23, calcPct(stats.breakdownExLtp?.MX || 0, stats.totalCat?.MX || 0));
        kpiContainer.innerHTML += renderKPIBox('VD EX-LTP (> 14d)', 0.88, calcPct(stats.breakdownExLtp?.VD || 0, stats.totalCat?.VD || 0));
        kpiContainer.innerHTML += renderKPIBox('DA EX-LTP (> 14d)', 0.88, calcPct(stats.breakdownExLtp?.DA || 0, stats.totalCat?.DA || 0));
        
        kpiScoreboard.style.display = 'block';
    }

    if (document.getElementById('val-total-so')) document.getElementById('val-total-so').innerText = stats.total || 0;
    if (document.getElementById('val-total-ltp')) document.getElementById('val-total-ltp').innerText = stats.ltp || 0;
    if (document.getElementById('val-total-exltp')) document.getElementById('val-total-exltp').innerText = stats.exLtp || 0;
    if (document.getElementById('val-total-mpu')) document.getElementById('val-total-mpu').innerText = stats.mpuViolations || 0;
    if (document.getElementById('val-total-ub')) document.getElementById('val-total-ub').innerText = stats.ubViolations || 0;
    if (document.getElementById('val-total-x09')) document.getElementById('val-total-x09').innerText = stats.x09Violations || 0;
    if (document.getElementById('val-total-redo')) document.getElementById('val-total-redo').innerText = (stats.redoCount !== undefined ? stats.redoCount : (window.redoList ? window.redoList.length : 0));

    // Render LTP Chart
    const ctxLtp = document.getElementById('ltpChart') ? document.getElementById('ltpChart').getContext('2d') : null;
    if (ltpChartInstance) ltpChartInstance.destroy();
    
    Chart.defaults.color = '#8b9bb4';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    
    if(ctxLtp) ltpChartInstance = new Chart(ctxLtp, {
        type: 'bar',
        data: {
            labels: ['MX (Mobile)', 'VD (TV)', 'DA (Appliances)'],
            datasets: [{
                label: 'Pending LTP/Ex-LTP',
                data: [stats.breakdownLtp?.MX || 0, stats.breakdownLtp?.VD || 0, stats.breakdownLtp?.DA || 0],
                backgroundColor: [
                    'rgba(37, 99, 235, 0.85)',
                    'rgba(139, 92, 246, 0.85)',
                    'rgba(244, 63, 94, 0.85)'
                ],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // Render Responsibility Chart
    const ctxResp = document.getElementById('responsibilityChart') ? document.getElementById('responsibilityChart').getContext('2d') : null;
    if (respChartInstance) respChartInstance.destroy();
    
    if (ctxResp) {
        const h = ctxResp.canvas.height || 300;
        const gradRed = ctxResp.createLinearGradient(0, 0, 0, h);
        gradRed.addColorStop(0, '#fca5a5'); gradRed.addColorStop(0.4, '#ef4444'); gradRed.addColorStop(1, '#7f1d1d');
        const gradGreen = ctxResp.createLinearGradient(0, 0, 0, h);
        gradGreen.addColorStop(0, '#6ee7b7'); gradGreen.addColorStop(0.4, '#10b981'); gradGreen.addColorStop(1, '#064e3b');
        const gradBlue = ctxResp.createLinearGradient(0, 0, 0, h);
        gradBlue.addColorStop(0, '#93c5fd'); gradBlue.addColorStop(0.4, '#3b82f6'); gradBlue.addColorStop(1, '#1e3a8a');

        const pseudo3DPlugin = {
            id: 'pseudo3d',
            beforeDatasetDraw(chart, args) {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 15;
            },
            afterDatasetDraw(chart, args) {
                chart.ctx.restore();
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(args.index);
                if (meta.type !== 'doughnut') return;
                meta.data.forEach(arc => {
                    const outerRadius = arc.outerRadius;
                    const innerRadius = arc.innerRadius;
                    const x = arc.x;
                    const y = arc.y;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, outerRadius, arc.startAngle, arc.endAngle);
                    ctx.arc(x, y, innerRadius, arc.endAngle, arc.startAngle, true);
                    ctx.closePath();
                    ctx.clip();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.beginPath();
                    ctx.arc(x, y - 5, outerRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                });
            }
        };

        respChartInstance = new Chart(ctxResp, {
            type: 'doughnut',
            data: {
                labels: ['AGING (Branch Fault)', 'SEIN (Samsung Fault)', 'OTHER'],
                datasets: [{
                    data: [(stats.responsibility?.AGING ?? stats.breakdownResp?.aging ?? 0), (stats.responsibility?.SEIN ?? stats.breakdownResp?.sein ?? 0), (stats.responsibility?.OTHER ?? stats.breakdownResp?.other ?? 0)],
                    backgroundColor: [gradRed, gradGreen, gradBlue],
                    borderColor: ['#f87171', '#34d399', '#60a5fa'],
                    borderWidth: 2,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { weight: 'bold', size: 9 } } }
                }
            },
            plugins: [pseudo3DPlugin]
        });
    }

    // Render MPU Table
    const tbodyMpu = document.querySelector('#mpu-table tbody');
    if (tbodyMpu) {
        tbodyMpu.innerHTML = '';
        if (mpuList.length === 0) {
            tbodyMpu.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px;">No MPU Violations Detected!</td></tr>`;
        } else {
            // Sort: 1. Branch A-Z, 2. Engineer Name A-Z
            const sortedMpu = [...mpuList].sort((a, b) => {
                const comp = (a.asc || '').localeCompare(b.asc || '');
                if (comp !== 0) return comp;
                return (a.engineer || '').localeCompare(b.engineer || '');
            });

            sortedMpu.forEach(item => {
                const tr = document.createElement('tr');
                const isRC = item.status && (item.status.includes('Completed') || item.status === 'Repair Completed');
                const jobColor = isRC ? 'var(--accent-red)' : 'var(--text-main)';
                const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">\u{26A0}\u{FE0F}  TELANJUR RC</span>' : '';
                
                tr.innerHTML = `
                    <td><strong>${item.asc}</strong></td>
                    <td style="color:var(--text-main); font-weight: 500; font-size: 0.85rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="color:var(--accent-red); font-weight:bold;">${item.engineer || 'PIC ' + item.asc}</span>
                                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${item.jobNo} | ${item.model} ${warningTag}</div>
                            </div>
                        </div>
                    </td>
                    `;
                tbodyMpu.appendChild(tr);
            });
        }
    }

    // Render UB Repair Table
    const tbodyUb = document.querySelector('#ub-table tbody');
    if (tbodyUb) {
        tbodyUb.innerHTML = '';
        if (ubList.length === 0) {
            tbodyUb.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px;">Aman! None pelanggaran UB Repair.</td></tr>`;
        } else {
            // Sort: 1. Branch A-Z, 2. Engineer Name A-Z
            const sortedUb = [...ubList].sort((a, b) => {
                const comp = (a.asc || '').localeCompare(b.asc || '');
                if (comp !== 0) return comp;
                return (a.engineer || '').localeCompare(b.engineer || '');
            });

            sortedUb.forEach(item => {
                const tr = document.createElement('tr');
                const isRC = item.status && (item.status.includes('Completed') || item.status === 'Repair Completed');
                const jobColor = isRC ? 'var(--accent-red)' : 'var(--text-main)';
                const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">\u{26A0}\u{FE0F}  TELANJUR RC</span>' : '';

                tr.innerHTML = `
                    <td><strong>${item.asc}</strong></td>
                    <td style="color:var(--text-main); font-weight: 500; font-size: 0.85rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="color:var(--accent-red); font-weight:bold;">${item.engineer || 'PIC ' + item.asc}</span>
                                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${item.jobNo} | ${item.model} ${warningTag}</div>
                            </div>
                        </div>
                    </td>
                    `;
                tbodyUb.appendChild(tr);
            });
        }
    }

    // Render Dosa Cabang Over 7 Days Table
    const tbodyDosa = document.querySelector('#dosa-cabang-table tbody');
    if (tbodyDosa) {
        tbodyDosa.innerHTML = '';
        const statsMap = window.dosaCabangStatsGlobal || {};
        const branches = Object.keys(statsMap);
        
        if (branches.length === 0) {
            tbodyDosa.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px;">Bersih! None dosa cabang > 7 hari.</td></tr>`;
        } else {
            // Sort: 1. Total Unit (Dosa) DESC (Z - A), 2. Branch A-Z
            const sortedDosaBranches = branches.sort((a, b) => {
                const countA = statsMap[a].count || 0;
                const countB = statsMap[b].count || 0;
                if (countB !== countA) return countB - countA;
                return a.localeCompare(b);
            });
            
            sortedDosaBranches.forEach(asc => {
                const dc = statsMap[asc];
                const hasPhone = !!(window.techContacts || {})[`PIC ${asc}`] || !!(window.techContacts || {})[`Kacab ${asc}`];
                const waColor = hasPhone ? '#25D366' : 'var(--text-muted)';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${asc}</strong>
                        <button onclick="sendWADosaSingleBranch('${asc}')" style="background: none; border: none; color: ${waColor}; font-size: 1rem; cursor: pointer; margin-left: 10px;" title="Send WA Alert to PIC Dosa Cabang"><i class="fa-brands fa-whatsapp"></i></button>
                    </td>
                    <td><span class="clickable-number" style="color:var(--accent-red); font-size: 1rem; font-weight: 700;" onclick="openDosaModal('${asc}')">${dc.count} Units</span></td>
                `;
                tbodyDosa.appendChild(tr);
            });
        }
    }

    // ==========================================
    // EXECUTIVE CONTROL TOWER WIDGETS
    // ==========================================
    let top5Container = document.getElementById('top5-critical-widget');
    if (!top5Container) {
        top5Container = document.createElement('div');
        top5Container.id = 'top5-critical-widget';
        top5Container.className = 'span-12 page-all'; // holding multiple cards now
        top5Container.style.marginTop = '20px';
        top5Container.style.display = 'flex';
        top5Container.style.flexDirection = 'column';
        top5Container.style.gap = '20px';
        
        // Insert below Branch Performance Breakdown
        const branchTableCard = document.querySelector('#branch-table').closest('.card');
        if (branchTableCard && branchTableCard.parentNode) {
            branchTableCard.parentNode.insertBefore(top5Container, branchTableCard.nextSibling);
        }
    }
    
    // Gather all bills
    let allAgingBills = [];
    if (window.dosaCabangStatsGlobal) {
        Object.entries(window.dosaCabangStatsGlobal).forEach(([branchName, branchStats]) => {
            if (branchStats.bills) {
                branchStats.bills.forEach(bill => {
                    bill.ascName = branchName; // Store branch name explicitely
                    allAgingBills.push(bill);
                });
            }
        });
    }
    
    // Split into Extreme (>=10) and Critical (7-9)
    let extremeBills = allAgingBills.filter(b => (b.pendingDays || 0) >= 10);
    let criticalBills = allAgingBills.filter(b => (b.pendingDays || 0) >= 7 && (b.pendingDays || 0) < 10);

    // Sort by AI Risk Score
    const sortFn = (a, b) => {
        const riskA = a.ai_riskScore || 0;
        const riskB = b.ai_riskScore || 0;
        if (riskB !== riskA) return riskB - riskA;
        return (b.pendingDays || 0) - (a.pendingDays || 0);
    };

    extremeBills.sort(sortFn);
    criticalBills.sort(sortFn);
    
    const top5Extreme = extremeBills.slice(0, 5);
    const top5Critical = criticalBills.slice(0, 5);
    
    const renderTableHtml = (title, items, icon, colorGrad) => {
        let html = `
            <div class="card glass-panel control-tower-card page-all" style="width:100%; border:2px solid ${colorGrad.includes('#f43f5e') ? '#f43f5e' : '#f97316'}; box-shadow:0 10px 25px rgba(0,0,0,0.15); margin-bottom: 25px;">
                <div class="card-header" style="background: ${colorGrad}; border-bottom: none; display: flex; justify-content: space-between; align-items: center; padding: 20px;">
                    <h3 style="color: white; font-size: 1.25rem; font-weight: 800; margin:0; letter-spacing: 0.5px; display: flex; align-items: center; gap: 10px;"><span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 6px;"><i class="${icon}"></i></span> ${title}</h3><div style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; color: white; font-weight: bold; border: 1px solid rgba(255,255,255,0.4);">ACTION REQUIRED</div>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Branch</th>
                                <th>Job No</th>
                                <th>Customer</th>
                                <th>Reason</th>
                                <th>Aging</th>
                                <th>AI Priority</th>
                                <th>Action Required</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        if (items.length === 0) {
            html += `<tr><td colspan="7" style="text-align:center; padding:15px; color:#94a3b8;">None kasus di kategori ini. Excellent!</td></tr>`;
        } else {
            items.forEach(b => {
                const priorityColor = b.ai_priority?.level === 'CRITICAL' ? 'var(--accent-red)' :
                                      b.ai_priority?.level === 'HIGH' ? 'orange' : 'var(--text-muted)';
                const priorityText = b.ai_priority ? `<span style="color: ${priorityColor}; font-weight: bold;">${b.ai_priority.level} (Score: ${Math.round(b.ai_riskScore || 0)})</span>` : '-';
                const actionText = b.ai_action ? `<span style="font-size: 0.8rem; color: #a5b4fc;">${b.ai_action.actionText}</span>` : '-';
                
                html += `
                    <tr>
                        <td><strong>${b.ascName || b.asc || '-'}</strong><br><span style="font-size: 0.7rem; color: #9ca3af;">${b.engineer || '-'}</span></td>
                        <td>${b.jobNo}</td>
                        <td>${b.customer}</td>
                        <td style="font-size:0.8rem; color:var(--text-muted);">${b.reason || '-'}</td>
                        <td style="color: var(--accent-red); font-weight: bold;">${b.pendingDays} days</td>
                        <td>${priorityText}</td>
                        <td>${actionText}</td>
                    </tr>
                `;
            });
        }
        
        html += `</tbody></table></div></div>`;
        return html;
    };

    let finalHtml = renderTableHtml('Executive Control Tower: Top 5 EXTREME Cases (Aging >= 10 Hari)', top5Extreme, 'fa-solid fa-triangle-exclamation', 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)');
    finalHtml += renderTableHtml('Executive Control Tower: Top 5 CRITICAL Cases (Aging 7-9 Hari)', top5Critical, 'fa-solid fa-fire', 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)');
    
    if (top5Container) top5Container.innerHTML = finalHtml;

    // Render Wall of Shame Table
    const tbodyShame = document.querySelector('#shame-table tbody');
    if (tbodyShame) tbodyShame.innerHTML = '';
    
    if (shameList.length === 0) {
        tbodyShame.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">No bad engineers found! Great job!</td></tr>`;
    } else {
        // Sort: 1. Branch A-Z, 2. Aging Units DESC
        const sortedShame = [...shameList].sort((a, b) => {
            const comp = (a.asc || '').localeCompare(b.asc || '');
            if (comp !== 0) return comp;
            return b.count - a.count;
        });

        sortedShame.forEach(item => {
            const hasPhone = !!(window.techContacts || {})[item.engineer];
            const isRC = item.status && (item.status === 'Repair Completed' || item.status.includes('Completed'));
            const warningTag = isRC ? '<br><span style=\"background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;\">\u{26A0}\u{FE0F}  TELANJUR RC</span>' : '';
            const waColor = hasPhone ? '#25D366' : 'var(--text-muted)';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.asc}</strong></td>
                <td style="color:var(--text-main); font-weight: 500; font-size: 0.85rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            ${item.engineer}
                            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${item.detail}</div>
                        </div>
                        <button onclick="sendWA('${item.engineer.replace(/'/g, "\\'")}', '${item.asc}', ${item.count}, '${item.detail}')" style="background: none; border: none; color: ${waColor}; font-size: 1.5rem; cursor: pointer;" title="Send WA Warning"><i class="fa-brands fa-whatsapp"></i></button>
                    </div>
                </td>
                <td style="text-align:center;"><span class="clickable-number" style="color:var(--accent-red); font-size:1rem; font-weight: 700;" onclick="openEngModal('${item.engineer.replace(/'/g, "\\'")}')">${item.count} Units</span></td>
            `;
            tbodyShame.appendChild(tr);
        });
    }

    window.renderShameTableFromSnapshot = function(shameList) {
        if (!tbodyShame) return;
        tbodyShame.innerHTML = '';
        if (!shameList || shameList.length === 0) {
            tbodyShame.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">No bad engineers found! Great job!</td></tr>`;
            return;
        }
        const sorted = [...shameList].sort((a, b) => {
            const comp = (a.asc || '').localeCompare(b.asc || '');
            if (comp !== 0) return comp;
            return b.count - a.count;
        });
        sorted.forEach(item => {
            const hasPhone = !!(window.techContacts || {})[item.engineer];
            const waColor = hasPhone ? '#25D366' : 'var(--text-muted)';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.asc}</strong></td>
                <td style="color:var(--text-main); font-weight: 500; font-size: 0.85rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            ${item.engineer}
                            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${item.detail}</div>
                        </div>
                        <button onclick="sendWA('${item.engineer.replace(/'/g, "\\'")}', '${item.asc}', ${item.count}, '${item.detail}')" style="background: none; border: none; color: ${waColor}; font-size: 1.5rem; cursor: pointer;" title="Send WA Warning"><i class="fa-brands fa-whatsapp"></i></button>
                    </div>
                </td>
                <td style="text-align:center;"><span class="clickable-number" style="color:var(--accent-red); font-size:1rem; font-weight: 700;" onclick="openEngModal('${item.engineer.replace(/'/g, "\\'")}')">${item.count} Units</span></td>
            `;
            tbodyShame.appendChild(tr);
        });
    };

    // Render Repair Completed (Pending Delivery) Table
    const tbodyRC = document.querySelector('#rc-table tbody');
    if (tbodyRC) {
        tbodyRC.innerHTML = '';
        
        if (!rcStats || Object.keys(rcStats).length === 0) {
            tbodyRC.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px; color:var(--text-muted);">Great! No stagnant units pending delivery!</td></tr>`;
        } else {
            // Sort: 1. Total Unit (RC) DESC (Z - A), 2. Branch A-Z
            const sortedRCBranches = Object.keys(rcStats).sort((a, b) => {
                const countA = rcStats[a].count || 0;
                const countB = rcStats[b].count || 0;
                if (countB !== countA) return countB - countA;
                return a.localeCompare(b);
            });

            sortedRCBranches.forEach(asc => {
                const rc = rcStats[asc];
                const hasPhone = !!(window.techContacts || {})[`PIC ${asc}`] || !!(window.techContacts || {})[`Kacab ${asc}`];
                const waColor = hasPhone ? '#25D366' : 'var(--text-muted)';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${asc}</strong>
                        <button onclick="sendWARC('${asc}', ${rc.count})" style="background: none; border: none; color: ${waColor}; font-size: 1rem; cursor: pointer; margin-left: 10px;" title="Send WA Alert to PIC"><i class="fa-brands fa-whatsapp"></i></button>
                    </td>
                    <td><span class="clickable-number" style="color:var(--accent-orange); font-size: 1rem; font-weight: 700;" onclick="openRCModal('${asc}')">${rc.count} Units</span></td>
                `;
                tbodyRC.appendChild(tr);
            });
        }
    }

    // Modal Variables & Functions
    window.branchData = branchStats; // Expose globally for click handlers
    
    // Render Branch Breakdown Table (Only display branches with violations/issues)
    const tbodyBranch = document.querySelector('#branch-table tbody');
    tbodyBranch.innerHTML = '';

    // Calculate REDO counts per branch
    const redoBranchCounts = {};
    (window.redoList || []).forEach(item => {
        const b = item.asc || 'Unknown';
        redoBranchCounts[b] = (redoBranchCounts[b] || 0) + 1;
    });
    
    // Sort: Z - A by Total S/O DESC
    const violationBranches = Object.keys(branchStats).filter(branch => {
        const bs = branchStats[branch];
        const redoCount = redoBranchCounts[branch] || 0;
        const totalViolations = (bs.ltp || 0) + (bs.exLtp || 0) + (bs.mpu || 0) + (bs.ub || 0) + (bs.x09 || 0) + redoCount;
        return totalViolations > 0;
    });

    const sortedBranches = violationBranches.sort((a, b) => {
        const bsA = branchStats[a];
        const bsB = branchStats[b];
        const totalA = bsA.total || 0;
        const totalB = bsB.total || 0;
        if (totalB !== totalA) return totalB - totalA;
        return a.localeCompare(b);
    });

    if (sortedBranches.length === 0) {
        tbodyBranch.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted); font-size: 0.95rem;">\u{1F389} Awesome! No branches currently have violations or penalties.</td></tr>`;
    } else {
        sortedBranches.forEach(branch => {
            const bs = branchStats[branch];
            const tr = document.createElement('tr');
            
            // Helper to generate clickable cell
            const getCell = (val, metric, colorStyle) => {
                if (val === 0) return `<td></td>`;
                return `<td style="text-align:center; ${colorStyle}"><span class="clickable-number" style="font-weight: 700;" onclick="openModal('${branch}', '${metric}')">${val}<span class="unit-text"> Units</span></span></td>`;
            };
            
            tr.innerHTML = `
                <td><strong>${branch}</strong></td>
                ${getCell(bs.total, 'total', '')}
                ${getCell(bs.ltp, 'ltp', 'color:var(--accent-red); font-weight:bold;')}
                ${getCell(bs.exLtp, 'exLtp', 'color:var(--accent-purple); font-weight:bold;')}
                ${getCell(bs.mpu, 'mpu', 'color:var(--accent-orange); font-weight:bold;')}
                ${getCell(bs.ub, 'ub', 'color:darkred; font-weight:bold;')}
                ${getCell(bs.x09, 'x09', 'color:#eab308; font-weight:bold;')}
                <td style="text-align:center;"><span class="val-redo" data-asc="${branch}" style="font-size: 1rem; font-weight: 700; color: var(--text-muted);"></span></td>
            `;

            tbodyBranch.appendChild(tr);
        });
    }

    renderDtsMxTable();
    renderDtsIhTable();
    renderRedoTable();

    // Switch views
    setTimeout(() => {
        const loadingOverlay = document.getElementById('loading-overlay');
        const emptyState = document.getElementById('empty-state');
        const dashboardContent = document.getElementById('dashboard-content');
        if(loadingOverlay) loadingOverlay.classList.add('hidden');
        if(emptyState) emptyState.classList.add('hidden');
        if(dashboardContent) dashboardContent.classList.remove('hidden');
        
        if (typeof gdChartInstance !== 'undefined' && gdChartInstance) {
            gdChartInstance.resize();
        }
    }, 500);
} // End of updateUI

window.updateUI = updateUI;

window.onclick = function(event) {
    if (event.target == document.getElementById('detail-modal')) {
        document.getElementById('detail-modal').classList.remove('active');
        document.getElementById('detail-modal').classList.remove('hidden');
    }
    if (event.target == document.getElementById('eng-modal')) {
        let eng = document.getElementById('eng-modal');
        if(eng) {
            eng.classList.remove('active');
            eng.classList.remove('hidden');
        }
    }
    if (event.target == document.getElementById('contacts-modal')) {
        document.getElementById('contacts-modal').classList.add('hidden');
    }
    if (event.target == document.getElementById('rules-modal')) {
        document.getElementById('rules-modal').classList.add('hidden');
    }
}

// Render DTS IH Table
function renderDtsIhTable() {
    const tbodyDtsIh = document.querySelector('#dts-ih-table tbody');
    if (tbodyDtsIh) {
        tbodyDtsIh.innerHTML = '';
        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            tbodyDtsIh.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">No CE data recorded today</td></tr>`;
        } else {
            
            if (window.prodData && Array.isArray(window.prodData)) {
                window.prodData.forEach(prod => {
                    const normEng = prod.engineer ? prod.engineer.trim().toUpperCase() : '';
                    if (!normEng) return;
                    for (let key in window.dtsIhData) {
                        const normKey = key.trim().toUpperCase();
                        if (normKey === normEng || normKey.includes(normEng) || normEng.includes(normKey)) {
                            window.dtsIhData[key].gdVisits = prod.dtsIhGdVisits || 0;
                        }
                    }
                });
            }
            let list = Object.values(window.dtsIhData);
            // Sort by Total Visits DESC, then Pending Visits DESC
            list.sort((a, b) => {
                if (b.totalVisits !== a.totalVisits) return b.totalVisits - a.totalVisits;
                return b.pendingVisits - a.pendingVisits;
            });
            
            list.forEach(d => {
                if (d.totalVisits === 0 && d.totalAging === 0) return; // Hide if completely inactive
                
                const tr = document.createElement('tr');
                let visitsStyling = d.totalVisits >= 3 ? `color:var(--accent-green);` : (d.totalVisits === 0 ? `color:var(--text-muted);` : `color:var(--text-main);`);
                let pendingStyling = d.pendingVisits > 0 ? `color:var(--accent-orange);` : `color:var(--text-main);`;
                let agingStyling = d.totalAging > 0 ? `color:var(--accent-red);` : `color:var(--text-main);`;
                
                let vTotal = d.totalVisits > 0 ? d.totalVisits : '';
                let vRC = d.rcVisits > 0 ? d.rcVisits : '';
                let vGD = d.gdVisits > 0 ? d.gdVisits : '';
                let vPending = d.pendingVisits > 0 ? d.pendingVisits : '';
                
                let agingCell = d.totalAging > 0 ? `<span class="clickable-number" onclick="openEngModal('${d.name.replace(/'/g, "\\'")}', 'VD/DA')">${d.totalAging}</span>` : '';
                
                let rcStyling = '';
                let gdStyling = d.gdVisits > 0 ? `color:var(--accent-blue);` : '';
                
                tr.innerHTML = `
                    <td><strong>${d.asc}</strong></td>
                    <td>${d.name}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${visitsStyling}">${vTotal}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${rcStyling}">${vRC}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${gdStyling}">${vGD}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${pendingStyling}">${vPending}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${agingStyling}">${agingCell}</td>
                `;
                tbodyDtsIh.appendChild(tr);
            });
            
            if (tbodyDtsIh.children.length === 0) {
                tbodyDtsIh.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">No VD/DA technicians with visits/aging today</td></tr>`;
            }
        }
    }
}

// Render DTS MX Table
function renderDtsMxTable() {
    const tbodyDtsMx = document.querySelector('#dts-mx-table tbody');
    if (tbodyDtsMx) {
        tbodyDtsMx.innerHTML = '';
        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            tbodyDtsMx.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">No MX data recorded today</td></tr>`;
        } else {
            
            if (window.prodData && Array.isArray(window.prodData)) {
                window.prodData.forEach(prod => {
                    const normEng = prod.engineer ? prod.engineer.trim().toUpperCase() : '';
                    if (!normEng) return;
                    for (let key in window.dtsMxData) {
                        const normKey = key.trim().toUpperCase();
                        if (normKey === normEng || normKey.includes(normEng) || normEng.includes(normKey)) {
                            window.dtsMxData[key].gd = prod.dtsGd || 0;
                        }
                    }
                });
            }
            const sortedDts = Object.values(window.dtsMxData).sort((a, b) => a.asc.localeCompare(b.asc));
            sortedDts.forEach(item => {
                const tr = document.createElement('tr');
                const agingColor = item.aging > 0 ? 'color:var(--accent-red);' : '';
                const custColor = item.cust > 0 ? 'color:var(--accent-orange);' : '';
                const seinColor = item.sein > 0 ? 'color:var(--accent-green);' : '';
                const gdColor = item.gd > 0 ? 'color:var(--accent-blue);' : '';
                
                let vVolIn = item.volIn > 0 ? item.volIn : '';
                let vRC = item.rc > 0 ? item.rc : '';
                let vGD = item.gd > 0 ? item.gd : '';
                let vCust = item.cust > 0 ? item.cust : '';
                let vSein = item.sein > 0 ? item.sein : '';
                
                let agingCell = item.aging > 0 ? `<span class="clickable-number" onclick="openEngModal('${item.name.replace(/'/g, "\\'")}', 'MX')">${item.aging}</span>` : '';
                
                tr.innerHTML = `
                    <td><strong>${item.asc}</strong></td>
                    <td>${item.name}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700;">${vVolIn}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700;">${vRC}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${gdColor}">${vGD}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${agingColor}">${agingCell}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${custColor}">${vCust}</td>
                    <td style="text-align:center; font-size:1rem; font-weight:700; ${seinColor}">${vSein}</td>
                `;
                tbodyDtsMx.appendChild(tr);
            });
        }
    }
}

// ============================================
// Rules Configuration Logic
// ============================================
window.customModels = [];
window.customReasons = [];

// Inisialisasi Firebase Listeners (menunggu db dimuat)
function tryInitFirebaseListeners() {
    if (typeof db !== 'undefined') {
        // Init Rules Listener
        initRulesListener(() => {
            if (typeof renderCustomRules === 'function') renderCustomRules();
        });
        
        // Init Contacts Listener (MIGRASI WA KE CLOUD)
        initContactsListener(() => {
            if (typeof renderContactsTable === 'function') renderContactsTable();
        });
        
    } else {
        setTimeout(tryInitFirebaseListeners, 500);
    }
}
tryInitFirebaseListeners();

const rulesModal = document.getElementById('rules-modal');
const btnRules = document.getElementById('btn-rules');
const closeRulesModal = document.getElementById('close-rules-modal');

// ---- ADMIN WA NUMBER (Ganti dengan nomor WA Admin/Komandan) ----
const ADMIN_WA_NUMBER = '6285249946694'; // Nomor WA Komandan

const rulesPwModal = document.getElementById('rules-password-modal');
const rulesPwInput = document.getElementById('rules-pw-input');
const rulesPwError = document.getElementById('rules-pw-error');
const btnRulesPwSubmit = document.getElementById('btn-rules-pw-submit');
const btnRequestAccessWa = document.getElementById('btn-request-access-wa');
const closeRulesPwModal = document.getElementById('close-rules-pw-modal');

if(btnRules) {
    btnRules.addEventListener('click', () => {
        // Reset state
        if(rulesPwInput) rulesPwInput.value = '';
        if(rulesPwError) rulesPwError.style.display = 'none';
        rulesPwModal.classList.remove('hidden');
        setTimeout(() => { if(rulesPwInput) rulesPwInput.focus(); }, 200);
    });
}

// Handle UNLOCK button
if(btnRulesPwSubmit) {
    btnRulesPwSubmit.addEventListener('click', () => {
        const pwd = rulesPwInput.value;
        if (pwd === "AUTOBOTS") {
            rulesPwModal.classList.add('hidden');
            renderCustomRules();
            rulesModal.classList.remove('hidden');
        } else {
            rulesPwError.style.display = 'block';
            rulesPwInput.style.border = '1px solid var(--accent-red)';
            rulesPwInput.classList.add('shake');
            setTimeout(() => rulesPwInput.classList.remove('shake'), 500);
        }
    });
}

// Handle Enter key on password input
if(rulesPwInput) {
    rulesPwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnRulesPwSubmit.click();
        }
        // Reset error display on typing
        rulesPwError.style.display = 'none';
        rulesPwInput.style.border = '1px solid var(--border-glass)';
    });
}

// Handle "Minta Akses via WhatsApp"
if(btnRequestAccessWa) {
    btnRequestAccessWa.addEventListener('click', () => {
        const nama = prompt("Masukkan nama Anda:");
        if (!nama || nama.trim() === '') return;
        
        const pesan = `\u{1F511} *REQUEST AKSES RULES CONFIG*\n\nHalo Ndan,\nSaya *${nama.trim()}* ingin meminta izin akses ke menu *Rules Config* di Dashboard BUJM.\n\nMohon diberikan password-nya ya Ndan. Terima kasih! \u{1F64F}`;
        
        const url = `https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(pesan)}`;
        window.open(url, '_blank');
        
        rulesPwModal.classList.add('hidden');
    });
}

// Close password modal
if(closeRulesPwModal) {
    closeRulesPwModal.addEventListener('click', () => {
        rulesPwModal.classList.add('hidden');
    });
}

// ============================================
// User Management (Admin Only)
// ============================================
const usersModal = document.getElementById('users-modal');
const btnManageUsers = document.getElementById('btn-manage-users');
const closeUsersModal = document.getElementById('close-users-modal');
const btnAddUser = document.getElementById('btn-add-user');
const approvedUsersList = document.getElementById('approved-users-list');
let approvedUsersCache = [];

if (btnManageUsers) {
    btnManageUsers.addEventListener('click', () => {
        usersModal.classList.remove('hidden');
        renderApprovedUsers();
    });
}
if (closeUsersModal) {
    closeUsersModal.addEventListener('click', () => {
        usersModal.classList.add('hidden');
    });
}

// Coba inisialisasi dari modul users.js (jika db sudah siap)
function tryInitUserListener() {
    if (typeof db !== 'undefined') {
        initUserListener((users) => {
            approvedUsersCache = users;
            renderApprovedUsers();
        });
    } else {
        setTimeout(tryInitUserListener, 500);
    }
}
tryInitUserListener();

function renderApprovedUsers() {
    if (!approvedUsersList) return;
    approvedUsersList.innerHTML = '';
    
    if (approvedUsersCache.length === 0) {
        approvedUsersList.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">No users logged in yet</td></tr>`;
        return;
    }
    
    approvedUsersCache.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    
    approvedUsersCache.forEach(user => {
        const tr = document.createElement('tr');
        
        // Warna dan Label Role
        let roleColor = 'var(--text-main)';
        let roleDisplay = (user.role || 'USER').toUpperCase();
        if (user.role === 'admin') roleColor = 'var(--accent-purple)';
        if (user.role === 'pending') {
            roleColor = 'var(--accent-orange)';
            roleDisplay = '<i class="fa-solid fa-hourglass-half"></i> PENDING';
        }
        
        const deviceStatus = user.deviceId ? '<span style="color:var(--accent-green);"><i class="fa-solid fa-lock"></i> Locked</span>' : '<span style="color:var(--text-muted);">Unlocked</span>';
        
        let branchesDisplay = '<span style="color:var(--text-muted); font-style:italic;">No Branch Assigned</span>';
        if (user.branches && Array.isArray(user.branches) && user.branches.length > 0) {
            branchesDisplay = '<div style="font-size:0.75rem; color:var(--accent-blue); line-height: 1.4; word-wrap: break-word;">' + user.branches.join(', ') + '</div>';
        } else if (user.role === 'admin') {
            branchesDisplay = '<span style="color:var(--text-muted); font-style:italic;">All Branches (Global)</span>';
        }
        
        let actionsHTML = '';
        if (user.role === 'pending') {
            actionsHTML = `
                <button onclick="approveUser('${user.id}', '${user.email}')" style="background: rgba(37, 211, 102, 0.2); border: 1px solid var(--accent-green); color: var(--accent-green); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem; margin-right: 5px;" title="Setujui Akses">
                    <i class="fa-solid fa-check"></i> Setujui
                </button>
                <button onclick="removeApprovedUser('${user.id}', '${user.email}')" style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--accent-red); color: var(--accent-red); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem;" title="Tolak / Hapus User">
                    <i class="fa-solid fa-xmark"></i> Tolak
                </button>
            `;
        } else {
            actionsHTML = `
                <button onclick="window.editUserBranches('${user.id}', '${(user.branches || []).join(', ')}', '${user.email || ''}')" style="background: rgba(59, 130, 246, 0.2); border: 1px solid var(--accent-blue); color: var(--accent-blue); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem; margin-right: 5px;" title="Edit Branch">
                    <i class="fa-solid fa-map-location-dot"></i>
                </button>
                <button onclick="resetDeviceLock('${user.id}')" style="background: rgba(37, 211, 102, 0.2); border: 1px solid var(--accent-green); color: var(--accent-green); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem; margin-right: 5px;" title="Reset Device (Unlock)">
                    <i class="fa-solid fa-unlock-keyhole"></i>
                </button>
                <button onclick="removeApprovedUser('${user.id}', '${user.email}')" style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--accent-red); color: var(--accent-red); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem;" title="Delete User">
                    <i class="fa-solid fa-user-xmark"></i>
                </button>
            `;
        }

        tr.innerHTML = `
            <td>
                <strong>${user.email || '-'}</strong><br>
                <span style="font-size:0.7rem; color:var(--text-muted);">${user.displayName || '-'}</span>
            </td>
            <td style="color:${roleColor}; font-weight:600; font-size:0.8rem;">${roleDisplay}</td>
              <td>${branchesDisplay}</td>
              <td>${deviceStatus}</td>
              <td style="text-align:center; white-space: nowrap;">
                ${actionsHTML}
            </td>
        `;
        approvedUsersList.appendChild(tr);
    });
}

// Reset Device and Remove User logic moved to src/firebase/users.js

window.addEventListener('click', (e) => {
    if (e.target === usersModal) usersModal.classList.add('hidden');
});


window.fillModelRule = function(val) {
    document.getElementById('rule-model-keyword').value = val;
};
window.fillReasonRule = function(val) {
    document.getElementById('rule-reason-keyword').value = val;
};

function renderUnmappedSuggestions() {
    const ml = document.getElementById('unmapped-models-list');
    const rl = document.getElementById('unmapped-reasons-list');
    if (!ml || !rl) return;
    
    ml.innerHTML = '';
    rl.innerHTML = '';
    
    const unModels = window.unknownModels || [];
    const unReasons = window.unknownReasons || [];
    
    if (unModels.length === 0) ml.innerHTML = '<span style="font-size: 0.75rem; color: #94a3b8; font-style: italic;"><i class="fa-solid fa-check"></i> None</span>';
    else {
        unModels.forEach(m => {
            const btn = document.createElement('button');
            btn.textContent = m;
            btn.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #dc2626; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s;';
            btn.onclick = () => fillModelRule(m);
            ml.appendChild(btn);
        });
    }
    
    if (unReasons.length === 0) rl.innerHTML = '<span style="font-size: 0.75rem; color: #94a3b8; font-style: italic;"><i class="fa-solid fa-check"></i> None</span>';
    else {
        unReasons.forEach(r => {
            const btn = document.createElement('button');
            btn.textContent = r;
            btn.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #dc2626; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s;';
            btn.onclick = () => fillReasonRule(r);
            rl.appendChild(btn);
        });
    }
}

function renderCustomRules() {
    const tbodyModels = document.getElementById('custom-models-list');
    if(tbodyModels) {
        tbodyModels.innerHTML = '';
        if (customModels.length === 0) {
            tbodyModels.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 14px; font-size:0.8rem;">Belum ada aturan model</td></tr>';
        } else {
            customModels.forEach((rule, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 7px 10px; font-weight: 600; color: #0f172a; font-size: 0.82rem;">${rule.keyword}</td>
                    <td style="padding: 7px 10px; text-align:center;"><span style="color: #2563eb; font-weight: 700; font-size: 0.8rem;">${rule.category}</span></td>
                    <td style="padding: 7px 10px; text-align:center;">
                        <button onclick="deleteCustomRule('model', ${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px 8px; font-size: 0.85rem;" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbodyModels.appendChild(tr);
            });
        }
    }

    const tbodyReasons = document.getElementById('custom-reasons-list');
    if(tbodyReasons) {
        tbodyReasons.innerHTML = '';
        if (customReasons.length === 0) {
            tbodyReasons.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 14px; font-size:0.8rem;">Belum ada aturan reason</td></tr>';
        } else {
            customReasons.forEach((rule, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 7px 10px; font-size: 0.78rem; font-weight: 500; color: #0f172a; line-height: 1.35; word-break: break-word;">${rule.keyword}</td>
                    <td style="padding: 7px 10px; text-align:center;"><span style="color: #ef4444; font-weight: 700; font-size: 0.8rem;">${rule.category}</span></td>
                    <td style="padding: 7px 10px; text-align:center;">
                        <button onclick="deleteCustomRule('reason', ${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px 8px; font-size: 0.85rem;" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbodyReasons.appendChild(tr);
            });
        }
    }
    renderUnmappedSuggestions();

    // Render Misterious Models
    let modelsAlertContainer = document.getElementById('unknown-models-alert');
    if (!modelsAlertContainer) {
        modelsAlertContainer = document.createElement('div');
        modelsAlertContainer.id = 'unknown-models-alert';
        document.getElementById('rule-model-keyword').parentElement.insertAdjacentElement('beforebegin', modelsAlertContainer);
    }
    if (window.lastUnknownModels && window.lastUnknownModels.length > 0) {
        modelsAlertContainer.innerHTML = `<div style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--accent-red); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            <strong style="color: var(--accent-red); font-size: 0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Model Asing Ditemukan:</strong>
            <ul style="margin: 5px 0 0 20px; font-size: 0.8rem; color: var(--text-main); max-height: 80px; overflow-y: auto;">
                ${window.lastUnknownModels.map(m => `<li>${m}</li>`).join('')}
            </ul>
        </div>`;
    } else {
        modelsAlertContainer.innerHTML = '';
    }

    // Render Misterious Reasons
    let reasonsAlertContainer = document.getElementById('unknown-reasons-alert');
    if (!reasonsAlertContainer) {
        reasonsAlertContainer = document.createElement('div');
        reasonsAlertContainer.id = 'unknown-reasons-alert';
        document.getElementById('rule-reason-keyword').parentElement.insertAdjacentElement('beforebegin', reasonsAlertContainer);
    }
    if (window.lastUnknownReasons && window.lastUnknownReasons.length > 0) {
        reasonsAlertContainer.innerHTML = `<div style="background: rgba(249, 115, 22, 0.2); border: 1px solid var(--accent-orange); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            <strong style="color: var(--accent-orange); font-size: 0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Reason Asing Ditemukan:</strong>
            <ul style="margin: 5px 0 0 20px; font-size: 0.8rem; color: var(--text-main); max-height: 80px; overflow-y: auto;">
                ${window.lastUnknownReasons.map(r => `<li style="margin-bottom:3px;">${r}</li>`).join('')}
            </ul>
        </div>`;
    } else {
        reasonsAlertContainer.innerHTML = '';
    }
}

window.addCustomRule = function(type, kwInputId, catInputId) {
    const kw = document.getElementById(kwInputId).value.trim().toUpperCase();
    const cat = document.getElementById(catInputId).value;
    const kwInput = document.getElementById(kwInputId);
    
    configAddRule(type, kw, cat, () => {
        renderCustomRules();
    });
    kwInput.value = '';
};

window.deleteCustomRule = function(type, index) {
    configDeleteRule(type, index, () => {
        renderCustomRules();
    });
};

if(document.getElementById('btn-add-model-rule')) {
    document.getElementById('btn-add-model-rule').addEventListener('click', () => {
        addCustomRule('model', 'rule-model-keyword', 'rule-model-category');
    });
}

if(document.getElementById('btn-add-reason-rule')) {
    document.getElementById('btn-add-reason-rule').addEventListener('click', () => {
        addCustomRule('reason', 'rule-reason-keyword', 'rule-reason-category');
    });
}

// ============================================
// WhatsApp Contacts Database Logic
// ============================================

const contactsModal = document.getElementById('contacts-modal');
const btnContacts = document.getElementById('btn-contacts');
const closeContactsModal = document.getElementById('close-contacts-modal');
const btnSaveContacts = document.getElementById('btn-save-contacts');
const contactsTableBody = document.getElementById('contacts-table-body');

btnContacts.addEventListener('click', () => {
    // Populate HOM fields
    const homPhoneInput = document.getElementById('hom-phone-input');
    const homNameInput = document.getElementById('hom-name-input');
    if (homPhoneInput) {
        homPhoneInput.value = (window.techContacts && window.techContacts['HEAD_OPERASIONAL_MANAGER']) || '';
    }
    if (homNameInput) {
        homNameInput.value = (window.techNames && window.techNames['HEAD_OPERASIONAL_MANAGER']) || '';
    }

    renderContactsTable();
    contactsModal.classList.remove('hidden');
});

closeContactsModal.addEventListener('click', () => {
    contactsModal.classList.add('hidden');
});

btnSaveContacts.addEventListener('click', () => {
    // Get working copy from global state to avoid overwriting un-rendered contacts
    let currentPhones = { ...(window.techContacts || {}) };
    let currentNames = { ...(window.techNames || {}) };

    // Save HOM contact
    const homPhoneInput = document.getElementById('hom-phone-input');
    const homNameInput = document.getElementById('hom-name-input');
    if (homPhoneInput) {
        const hp = homPhoneInput.value.trim();
        if (hp) currentPhones['HEAD_OPERASIONAL_MANAGER'] = hp;
        else delete currentPhones['HEAD_OPERASIONAL_MANAGER'];
    }
    if (homNameInput) {
        const hn = homNameInput.value.trim();
        if (hn) currentNames['HEAD_OPERASIONAL_MANAGER'] = hn;
        else delete currentNames['HEAD_OPERASIONAL_MANAGER'];
    }

    const inputs = contactsTableBody.querySelectorAll('.tech-phone');
    inputs.forEach(input => {
        const name = input.dataset.name;
        const phone = input.value.trim();
        if (phone) currentPhones[name] = phone;
        else delete currentPhones[name];
    });
    
    // Save Custom Names for Kacab
    const nameInputs = contactsTableBody.querySelectorAll('.tech-real-name');
    nameInputs.forEach(input => {
        const engKey = input.dataset.name;
        const val = input.value.trim();
        if (val) currentNames[engKey] = val;
        else delete currentNames[engKey];
    });
    
    saveTechContacts(currentPhones, currentNames, () => {
        showToastNotification('WhatsApp Contacts Database (termasuk Kontak HOM) tersimpan ke Cloud!');
        contactsModal.classList.add('hidden');
        
        if (window.engineerData) {
            showToastNotification('Saved successfully! Refresh page to update WA button status.');
        }
    });
});

function renderContactsTable() {
    if ((!window.engineerData || Object.keys(window.engineerData).length === 0) &&
        (!window.branchData || Object.keys(window.branchData).length === 0)) {
        return; // Retain default message
    }
    
    contactsTableBody.innerHTML = '';
    
    // Combine engineers from engineerData and generate PIC for all branches
    let engList = [];
    if (window.engineerData) {
        Object.keys(window.engineerData).forEach(eng => {
            engList.push({ eng: eng, asc: window.engineerData[eng].asc });
        });
    }
    if (window.branchData) {
        Object.keys(window.branchData).forEach(branch => {
            engList.push({ eng: `PIC ${branch}`, asc: branch });
        });
    }
    
    // Remove duplicates
    let uniqueEngs = [];
    let seen = new Set();
    engList.forEach(item => {
        if (!seen.has(item.eng)) {
            seen.add(item.eng);
            uniqueEngs.push(item);
        }
    });

    // Sort by branch (asc) first, then by engineer name
    uniqueEngs.sort((a, b) => {
        if (a.asc === b.asc) {
            return a.eng.localeCompare(b.eng);
        }
        return a.asc.localeCompare(b.asc);
    });
    
    uniqueEngs.forEach(item => {
        const eng = item.eng;
        const asc = item.asc;
        const phone = (window.techContacts || {})[eng] || '';
        let realName = (window.techNames || {})[eng] || '';
        
        let nameHtml = `
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:bold; margin-bottom:2px;">[${asc}]</div>
            <div>${eng}</div>
        `;
        
        if (eng.startsWith('PIC ')) {
            nameHtml = `
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:bold; margin-bottom:2px;">[${asc}]</div>
                <div style="font-size:0.85rem; color:var(--accent-blue); font-weight:bold;">${eng}</div>
                <input type="text" class="tech-real-name" data-name="${eng}" value="${realName}" placeholder="Enter PIC actual name..." style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.3); color: white; font-size: 0.85rem;">
            `;
        }
        
        contactsTableBody.innerHTML += `
            <tr>
                <td style="font-weight: 500; font-size: 0.9rem;">${nameHtml}</td>
                <td>
                    <input type="text" class="tech-phone" data-name="${eng}" value="${phone}" placeholder="e.g. 0812345..." style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05); color: white;">
                </td>
            </tr>
        `;
    });
}

// Send WA Function
// WA Function moved to src/services/whatsapp.js

// WA Functions for RC and Dosa have been moved to src/services/whatsapp.js

// Open Modal for Dosa Cabang
window.openDosaModal = function(asc) {
    if (!window.dosaCabangStatsGlobal || !window.dosaCabangStatsGlobal[asc] || window.dosaCabangStatsGlobal[asc].bills.length === 0) {
        return;
    }
    
    document.getElementById('modal-extra-info').innerHTML = ''; // Reset extra info
    const thead = document.getElementById('modal-thead');
    thead.style.display = ''; // Show thead
    thead.innerHTML = `
        <tr>
            <th>Job No / S.O.</th>
            <th>Customer Name</th>
            <th>Model</th>
            <th>Reason</th>
            <th>Pending Days</th>
            <th>AI Priority</th>
            <th>AI Recommendation</th>
        </tr>
    `;
    
    const bills = window.dosaCabangStatsGlobal[asc].bills;
    
    document.getElementById('modal-title').innerText = `${asc} - Aging Dosa Cabang (> 7 Hari) (${bills.length} units)`;
    
    const tbody = document.querySelector('#modal-table tbody');
    tbody.innerHTML = '';
    
    // Urutkan bills Z-A berdasarkan pendingDays (Terlama di atas), prioritas sekunder: Risk Score
    bills.sort((a, b) => {
        const riskA = a.ai_riskScore || 0;
        const riskB = b.ai_riskScore || 0;
        if (riskB !== riskA) return riskB - riskA;
        return (b.pendingDays || 0) - (a.pendingDays || 0);
    });
    
    bills.forEach(b => {
        const priorityColor = b.ai_priority?.level === 'CRITICAL' ? 'var(--accent-red)' :
                              b.ai_priority?.level === 'HIGH' ? 'orange' :
                              b.ai_priority?.level === 'MEDIUM' ? 'yellow' : 'var(--text-muted)';
        const priorityText = b.ai_priority ? `<span style="color: ${priorityColor}; font-weight: bold;">${b.ai_priority.level} (Score: ${Math.round(b.ai_riskScore || 0)})</span>` : '-';
        const actionText = b.ai_action ? `<span style="font-size: 0.8rem; color: #a5b4fc;">${b.ai_action.actionText}</span>` : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${b.jobNo}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">${b.status || ''}</span></td>
            <td>${b.customer}</td>
            <td>${b.model}</td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${b.reason || '-'}</td>
            <td style="color:var(--accent-red); font-weight:bold;">${b.pendingDays} days</td>
            <td>${priorityText}</td>
            <td>${actionText}</td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('detail-modal').classList.remove('hidden');
    document.getElementById('detail-modal').classList.add('active');
};

// Modal Handling Functions
window.openModal = function(branch, metric) {
    let bills = [];
    
    // 1. Direct from branchData
    if (window.branchData && window.branchData[branch] && window.branchData[branch].bills && Array.isArray(window.branchData[branch].bills[metric]) && window.branchData[branch].bills[metric].length > 0) {
        bills = window.branchData[branch].bills[metric];
    }
    
    // 1b. Direct from rcData for 'rc'
    if (bills.length === 0 && metric === 'rc') {
        if (window.rcData && window.rcData[branch] && Array.isArray(window.rcData[branch].bills)) {
            bills = window.rcData[branch].bills;
        }
    }
    
    // 2. Fallbacks for 'total' (Total S/O)
    if (bills.length === 0 && metric === 'total') {
        if (window.soBillsByBranchGlobal && Array.isArray(window.soBillsByBranchGlobal[branch]) && window.soBillsByBranchGlobal[branch].length > 0) {
            bills = window.soBillsByBranchGlobal[branch];
        } else if (window.rawDashboardData && window.rawDashboardData.soBillsByBranch && Array.isArray(window.rawDashboardData.soBillsByBranch[branch])) {
            bills = window.rawDashboardData.soBillsByBranch[branch];
        }
    }
    
    // 3. Fallback from fuzzy branch matching
    if (bills.length === 0 && metric === 'total') {
        const soSources = [window.soBillsByBranchGlobal, (window.rawDashboardData && window.rawDashboardData.soBillsByBranch)];
        for (const src of soSources) {
            if (!src) continue;
            for (const k in src) {
                if (k.toUpperCase() === branch.toUpperCase() || k.toUpperCase().replace(/\s*-\s*/g, ' ') === branch.toUpperCase().replace(/\s*-\s*/g, ' ')) {
                    if (Array.isArray(src[k]) && src[k].length > 0) {
                        bills = src[k];
                        break;
                    }
                }
            }
            if (bills.length > 0) break;
        }
    }

    // 4. Secondary fallback for total: aggregate all known bills for this branch
    if (bills.length === 0 && metric === 'total') {
        const fallbackMap = new Map();
        const addBills = (list) => {
            if (!Array.isArray(list)) return;
            list.forEach(b => {
                const bBranch = (b.asc || b.branch || '').toUpperCase();
                const targetBranch = branch.toUpperCase();
                if (bBranch === targetBranch || bBranch.includes(targetBranch) || targetBranch.includes(bBranch)) {
                    const id = b.jobNo || b['Job No'] || b['Service Order No.'];
                    if (id && id !== 'N/A' && !fallbackMap.has(id)) {
                        fallbackMap.set(id, {
                            jobNo: id,
                            customer: b.customer || b['Customer Name'] || '-',
                            model: b.model || b['Model'] || '-',
                            reason: b.reason || b['Reason For Pending / Transfer'] || '-',
                            pendingDays: parseInt(b.pendingDays || b['Pending Days']) || 0,
                            status: b.status || b['Status'] || '-',
                            engineer: b.engineer || '-'
                        });
                    }
                }
            });
        };
        if (window.branchData && window.branchData[branch] && window.branchData[branch].bills) {
            Object.keys(window.branchData[branch].bills).forEach(k => {
                if (k !== 'total') addBills(window.branchData[branch].bills[k]);
            });
        }
        if (window.dosaCabangData) addBills(window.dosaCabangData);
        if (window.rcData && window.rcData[branch] && window.rcData[branch].bills) addBills(window.rcData[branch].bills);
        if (window.mpuData) addBills(window.mpuData);
        if (window.ubData) addBills(window.ubData);
        bills = Array.from(fallbackMap.values());
    }

    if (!bills || bills.length === 0) {
        if (typeof showToastNotification === 'function') {
            showToastNotification(`Data ${metric === 'total' ? 'Total S/O' : metric} untuk ${branch} sedang disinkronkan...`);
        }
        return;
    }
    
    const extraInfo = document.getElementById('modal-extra-info');
    if (extraInfo) {
        extraInfo.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:12px; flex-wrap:wrap;">
                <div style="position:relative; flex:1; min-width:240px;">
                    <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:0.85rem;"></i>
                    <input type="text" id="modal-search-input" placeholder="🔍 Cari Job No, Model, Customer, Teknisi, Reason..." style="width:100%; padding:8px 12px 8px 36px; border-radius:8px; border:1px solid var(--border-glass); background:rgba(0,0,0,0.25); color:#fff; font-size:0.85rem; outline:none;">
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span id="modal-count-badge" style="font-size:0.82rem; font-weight:700; color:var(--accent-blue); background:rgba(37,99,235,0.15); padding:6px 14px; border-radius:20px; border:1px solid rgba(59,130,246,0.3); white-space:nowrap;">${bills.length} Units</span>
                </div>
            </div>
        `;
    }

    const thead = document.getElementById('modal-thead');
    thead.style.display = '';
    
    if (metric === 'total') {
        thead.innerHTML = `
            <tr>
                <th style="width: 17%;">Job No / S.O.</th>
                <th style="width: 22%;">Customer Name</th>
                <th style="width: 17%;">Model</th>
                <th style="width: 16%;">Technician</th>
                <th style="width: 18%;">Reason</th>
                <th style="width: 10%; text-align: center;">Aging</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th>Job No / S.O.</th>
                <th>Customer Name</th>
                <th>Model</th>
                <th>Reason</th>
                <th>Pending Days</th>
            </tr>
        `;
    }
    
    const metricNames = {
        total: 'Total S/O (Active Units)',
        ltp: 'LTP (Aging)',
        exLtp: 'Ex-LTP',
        mpu: 'MPU Violations',
        ub: 'UB Violations',
        x09: 'X09 Violations'
    };
    
    document.getElementById('modal-title').innerText = `${branch} - ${metricNames[metric] || metric} Details (${bills.length} units)`;
    
    const tbody = document.querySelector('#modal-table tbody');
    tbody.innerHTML = '';
    
    // Urutkan bills Z-A berdasarkan pendingDays (Terlama di atas)
    bills.sort((a, b) => (parseInt(b.pendingDays) || 0) - (parseInt(a.pendingDays) || 0));
    
    bills.forEach(b => {
        const tr = document.createElement('tr');
        const days = parseInt(b.pendingDays) || 0;
        if (metric === 'total') {
            const dayColor = days > 7 ? '#ef4444' : (days > 3 ? '#f59e0b' : 'var(--text-main)');
            tr.innerHTML = `
                <td><strong style="color:var(--accent-blue); font-family:monospace; font-size:0.9rem;">${b.jobNo}</strong></td>
                <td>${b.customer || '-'}</td>
                <td><span style="background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-size:0.82rem;">${b.model || '-'}</span></td>
                <td style="color:#60a5fa; font-weight:600; font-size:0.85rem;">${b.engineer || '-'}</td>
                <td style="font-size:0.82rem; color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${b.reason || '-'}">${b.reason || '-'}</td>
                <td style="color:${dayColor}; font-weight:bold; text-align:center;">${days}d</td>
            `;
        } else {
            tr.innerHTML = `
                <td><strong>${b.jobNo}</strong></td>
                <td>${b.customer || '-'}</td>
                <td>${b.model || '-'}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${b.reason || '-'}</td>
                <td style="color:var(--accent-red); font-weight:bold; text-align:center;">${days} days</td>
            `;
        }
        tbody.appendChild(tr);
    });

    // Wire live search in modal
    const searchInput = document.getElementById('modal-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const rows = tbody.querySelectorAll('tr');
            let visibleCount = 0;
            rows.forEach(r => {
                const match = !q || r.innerText.toLowerCase().includes(q);
                r.style.display = match ? '' : 'none';
                if (match) visibleCount++;
            });
            const badge = document.getElementById('modal-count-badge');
            if (badge) badge.innerText = `${visibleCount} / ${bills.length} Units`;
        });
    }
    
    document.getElementById('detail-modal').classList.remove('hidden');
    document.getElementById('detail-modal').classList.add('active');
};

window.openEngModal = function(engineer, categoryFilter = null) {
    let bills = [];
    
    // 1. Try finding in shameData (compact bills preserved for modal)
    if (window.shameData && Array.isArray(window.shameData)) {
        const foundShame = window.shameData.find(s => s.engineer === engineer || s.engineer.toUpperCase() === engineer.toUpperCase());
        if (foundShame && Array.isArray(foundShame.bills) && foundShame.bills.length > 0) {
            bills = foundShame.bills;
        }
    }

    // 2. Try finding in engineerData if bills exist
    if (bills.length === 0 && window.engineerData && window.engineerData[engineer] && Array.isArray(window.engineerData[engineer].bills)) {
        bills = window.engineerData[engineer].bills;
    }

    // 3. Try finding in dosaCabangOver7 if matching engineer
    if (bills.length === 0 && window.dosaCabangData && Array.isArray(window.dosaCabangData)) {
        bills = window.dosaCabangData.filter(d => d.engineer === engineer || (d.engineer && d.engineer.toUpperCase() === engineer.toUpperCase()));
    }

    if (categoryFilter === 'MX') {
        bills = bills.filter(b => b.category === 'MX');
    } else if (categoryFilter === 'VD/DA') {
        bills = bills.filter(b => b.category === 'VD' || b.category === 'DA');
    }
    
    if (bills.length === 0) return;
    
    document.getElementById('modal-extra-info').innerHTML = ''; // Reset extra info
    const thead = document.getElementById('modal-thead');
    thead.style.display = ''; // Show thead
    thead.innerHTML = `
        <tr>
            <th>Job No / S.O.</th>
            <th>Customer Name</th>
            <th>Model</th>
            <th>Reason</th>
            <th>Pending Days</th>
        </tr>
    `;
    
    let titleSuffix = "Dosa Cabang";
    if (categoryFilter === 'MX') titleSuffix = "Aging MX";
    if (categoryFilter === 'VD/DA') titleSuffix = "Aging VD/DA";
    
    document.getElementById('modal-title').innerText = `${engineer} - ${titleSuffix} (${bills.length} units)`;
    
    const tbody = document.querySelector('#modal-table tbody');
    tbody.innerHTML = '';
    
    // Urutkan bills Z-A berdasarkan pendingDays (Terlama di atas)
    bills.sort((a, b) => b.pendingDays - a.pendingDays);
    
    bills.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${b.jobNo}</strong></td>
            <td>${b.customer}</td>
            <td>${b.model}</td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${b.reason}</td>
            <td style="color:var(--accent-red); font-weight:bold;">${b.pendingDays} days</td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('detail-modal').classList.remove('hidden');
    document.getElementById('detail-modal').classList.add('active');
};

window.openRCModal = function(asc) {
    if (!window.rcData || !window.rcData[asc] || window.rcData[asc].bills.length === 0) {
        return;
    }
    
    document.getElementById('modal-extra-info').innerHTML = ''; // Reset extra info
    const thead = document.getElementById('modal-thead');
    thead.style.display = ''; // Show thead
    thead.innerHTML = `
        <tr>
            <th>Job No / S.O.</th>
            <th>Customer Name</th>
            <th>Model</th>
            <th>Reason</th>
            <th>Pending Days</th>
        </tr>
    `;
    
    const bills = window.rcData[asc].bills;
    
    document.getElementById('modal-title').innerText = `${asc} - Pending Delivery (Repair Completed) (${bills.length} units)`;
    
    const tbody = document.querySelector('#modal-table tbody');
    tbody.innerHTML = '';
    
    // Urutkan bills Z-A berdasarkan pendingDays (Terlama di atas)
    bills.sort((a, b) => b.pendingDays - a.pendingDays);
    
    bills.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${b.jobNo}</strong></td>
            <td>${b.customer}</td>
            <td>${b.model}</td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${b.reason}</td>
            <td style="color:var(--accent-red); font-weight:bold;">${b.pendingDays} days</td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('detail-modal').classList.remove('hidden');
    document.getElementById('detail-modal').classList.add('active');
};

window.openAllProdModal = function() {
    if (!window.prodData || Object.keys(window.prodData).length === 0) return;
    
    document.getElementById('modal-title').innerText = `Productivity & Revenue Leaderboard`;
    document.getElementById('modal-extra-info').innerHTML = '';
    
    const thead = document.getElementById('modal-thead');
    thead.style.display = '';
    thead.innerHTML = `
        <tr>
            <th>Engineer Name</th>
            <th>Total GD</th>
            <th>GD Repair</th>
            <th>GD Cancel</th>
            <th>Total Revenue (+11% Tax)</th>
        </tr>
    `;
    
    const tbody = document.querySelector('#modal-table tbody');
    tbody.innerHTML = '';
    
    let allEng = Object.keys(window.prodData).map(eng => {
        return { engineer: eng, ...window.prodData[eng] };
    });
    allEng.sort((a, b) => b.gdCount - a.gdCount);
    
    allEng.forEach(d => {
        const laborNet = d.laborIW + d.laborOOW;
        const gross = laborNet * 1.11;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold;">${d.engineer}</td>
            <td style="text-align:center; color:var(--accent-blue); font-size: 1rem; font-weight:700;">${d.gdCount} Units</td>
            <td style="color:var(--accent-green); font-weight:bold;">${d.gdRepair}</td>
            <td style="color:var(--accent-red); font-weight:bold;">${d.gdCancel}</td>
            <td style="color:var(--text-main); font-weight:bold;">Rp ${gross.toLocaleString('id-ID', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('detail-modal').classList.remove('hidden');
    document.getElementById('detail-modal').classList.add('active');
};

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.remove('active');
});

// Close modal when clicking outside
document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') {
        document.getElementById('detail-modal').classList.remove('active');
    }
});



// --- REDO OCR SCANNER LOGIC ---
const redoDropZone = document.getElementById('redo-drop-zone');
const redoFileInput = document.getElementById('redo-file-input');

if (redoDropZone && redoFileInput) {
    // Only file input change & drag-and-drop trigger OCR, not random card clicks
    redoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processMultipleRedoFiles(e.target.files);
        }
    });

    redoDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        redoDropZone.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.8)';
    });

    redoDropZone.addEventListener('dragleave', () => {
        redoDropZone.style.backgroundColor = 'transparent';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    });

    async function processMultipleRedoFiles(files) {
        if (!files.length) return;
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
        showToastNotification(`Starting AI scan on ${files.length} images... Please wait.`);
        
        for (let i = 0; i < files.length; i++) {
            if (files.length > 1) {
                showToastNotification(`Scanning image ${i+1} of ${files.length}...`);
            }
            await handleRedoImage(files[i]);
        }
        
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        showToastNotification('OCR Scan Complete! Redo table updated.');
        renderRedoTable();
    }

    redoDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        redoDropZone.style.backgroundColor = 'transparent';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        if (e.dataTransfer.files.length) {
            processMultipleRedoFiles(Array.from(e.dataTransfer.files));
        }
    });

    redoFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            processMultipleRedoFiles(Array.from(e.target.files));
        }
    });
}

async function handleRedoImage(file) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.querySelector('p').innerText = 'Scanning text with AI (Fast Mode)...';
    
    const result = await scanRedoImage(file);
    
    if (result.error) {
        showToastNotification(result.error);
        return;
    }
    
    if (!result.uniqueJobs || result.uniqueJobs.length === 0) {
        console.log('No Service Order No found in image!');
        showToastNotification('\u{26A0}\u{FE0F}  No Service Order Number (10-digit Job No) detected in this image.');
        return;
    }

    console.log('Detected Job Numbers:', result.uniqueJobs);
    
    // Cross Reference
    window.redoList = window.redoList || [];
    
    result.uniqueJobs.forEach(jobNo => {
        let cleanJobNo = String(jobNo).trim();
        // Check if already in redo list
        if (window.redoList.find(r => String(r.jobNo).trim() === cleanJobNo)) return;
        
        let matchedBill = null;
        let matchedAsc = null;
        
        // Search directly in globalRawSOList to get the raw un-overridden Engineer Name
        if (window.globalRawSOList && Array.isArray(window.globalRawSOList)) {
            function getLevenshtein(a, b) {
                if (a.length === 0) return b.length;
                if (b.length === 0) return a.length;
                let matrix = [];
                for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                for (let i = 1; i <= b.length; i++) {
                    for (let j = 1; j <= a.length; j++) {
                        if (b.charAt(i - 1) === a.charAt(j - 1)) {
                            matrix[i][j] = matrix[i - 1][j - 1];
                        } else {
                            matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                        }
                    }
                }
                return matrix[b.length][a.length];
            }

            let bestMatch = null;
            let bestDistance = 999;
            let bestRealJobNo = '';

            window.globalRawSOList.forEach(b => {
                for (let key in b) {
                    if (b[key]) {
                        let cellVal = String(b[key]).trim();
                        let numericClean = cleanJobNo.replace(/\D/g, '');
                        let cellNumeric = cellVal.replace(/\D/g, '');
                        
                        if (cellVal === cleanJobNo || (numericClean.length > 5 && cellNumeric === numericClean)) {
                            bestDistance = 0;
                            bestMatch = b;
                            bestRealJobNo = numericClean.length === 10 ? numericClean : cellVal;
                            return; 
                        }
                        
                        if (numericClean.length === 10 && cellNumeric.length === 10) {
                            let dist = getLevenshtein(numericClean, cellNumeric);
                            if (dist <= 2 && dist < bestDistance) {
                                bestDistance = dist;
                                bestMatch = b;
                                bestRealJobNo = cellNumeric;
                            }
                        }
                    }
                }
            });

            if (bestMatch && bestDistance <= 2) {
                let rawEngineer = bestMatch['Engineer Name'] || bestMatch['Engineer'] || 'Unmapped Technician';
                rawEngineer = String(rawEngineer).trim().toUpperCase().replace(/^\d+\s+/, '');
                if (!rawEngineer || /^\d+$/.test(rawEngineer) || rawEngineer.includes('UNMAPPED')) {
                     rawEngineer = 'Unmapped Technician';
                }

                let rawAsc = bestMatch['ASC Name'] || bestMatch['ASC'] || bestMatch['Service Center'] || bestMatch.asc || 'UNMAPPED';
                
                function shortAsc(name, matchObj = null) {
                    if (matchObj) {
                        let ccName = '';
                        for (let key in matchObj) {
                            let k = key.toLowerCase().replace(/[^a-z]/g, '');
                            if (k === 'collectioncentername' || k === 'collectioncenter' || k === 'ccname') {
                                ccName = String(matchObj[key] || '').toUpperCase();
                                break;
                            }
                        }
                        if (ccName.includes('CELLULAR WORLD')) return 'DENPASAR - CELLULAR WORLD';
                        if (ccName.includes('PLANET GADGET')) return 'DENPASAR - PLANET GADGET';
                    }
                    let u = String(name).toUpperCase();
                    if (u.includes('KARYA') || u.includes('KUPANG')) return 'KUPANG';
                    if (u.includes('MAHENDRA') || u.includes('DENPASAR')) return 'DENPASAR';
                    if (u.includes('SAKA') || u.includes('SINGARAJA')) return 'SINGARAJA';
                    if (u.includes('TEUKU') || u.includes('CELLULAR WORLD')) return 'DENPASAR - CELLULAR WORLD';
                    if (u.includes('GATOT') || u.includes('PLANET GADGET')) return 'DENPASAR - PLANET GADGET';
                    return name;
                }

                matchedBill = {
                    jobNo: bestDistance > 0 ? bestRealJobNo : cleanJobNo,
                    engineer: rawEngineer,
                    model: bestMatch['Model'] || bestMatch.model || 'Model N/A',
                    customer: bestMatch['Customer Name'] || bestMatch.customer || '-',
                    category: bestMatch['Product Category'] || bestMatch.category || '-',
                    status: bestMatch['Status'] || bestMatch.status || 'REDO'
                };
                matchedAsc = shortAsc(rawAsc);
                
                if (bestDistance > 0) {
                    cleanJobNo = bestRealJobNo;
                }
            }
        }
        
        // 3. Search in prodJobs if available (Productivity Data)
        if (!matchedBill && window.prodJobs && Array.isArray(window.prodJobs)) {
            const found = window.prodJobs.find(b => b.jobNo === cleanJobNo);
            if (found) {
                matchedBill = {
                    jobNo: cleanJobNo,
                    engineer: found.engineer,
                    model: 'Model N/A',
                    customer: '-',
                    category: '-',
                    status: 'REDO'
                };
                matchedAsc = found.branch;
            }
        }
        
        // 3. Add to redoList (either with full bill info or fallback OCR info)
        if (matchedBill) {
            window.redoList.push({
                asc: matchedAsc || 'UNMAPPED',
                jobNo: matchedBill.jobNo || cleanJobNo,
                engineer: matchedBill.engineer || 'Unmapped Technician',
                model: matchedBill.model || 'REDO Item',
                customer: matchedBill.customer || '-',
                category: matchedBill.category || '-',
                status: matchedBill.status || 'REDO'
            });
        } else {
            // FALLBACK: Always add to REDO list even if not matched in Excel data yet!
            window.redoList.push({
                asc: 'SCAN OCR',
                jobNo: cleanJobNo,
                engineer: 'Unmapped (Excel not uploaded yet)',
                model: 'REDO Ticket',
                customer: '-',
                category: '-',
                status: 'REDO'
            });
        }
    });
}

window.reMapRedoList = function() {
    if (!window.redoList || window.redoList.length === 0) return;
    
    let changed = false;
    window.redoList.forEach(item => {
        if (item.asc === 'SCAN OCR') {
            let matchedBill = null;
            let matchedAsc = null;
            let cleanJobNo = item.jobNo;

            // Search directly in globalRawSOList to get the raw un-overridden Engineer Name
            if (window.globalRawSOList && Array.isArray(window.globalRawSOList)) {
                
                function getLevenshtein(a, b) {
                    if (a.length === 0) return b.length;
                    if (b.length === 0) return a.length;
                    let matrix = [];
                    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                    for (let i = 1; i <= b.length; i++) {
                        for (let j = 1; j <= a.length; j++) {
                            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                                matrix[i][j] = matrix[i - 1][j - 1];
                            } else {
                                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                            }
                        }
                    }
                    return matrix[b.length][a.length];
                }

                let bestMatch = null;
                let bestDistance = 999;
                let bestRealJobNo = '';

                window.globalRawSOList.forEach(b => {
                    for (let key in b) {
                        if (b[key]) {
                            let cellVal = String(b[key]).trim();
                            let numericClean = cleanJobNo.replace(/\D/g, '');
                            let cellNumeric = cellVal.replace(/\D/g, '');
                            
                            if (cellVal === cleanJobNo || (numericClean.length > 5 && cellNumeric === numericClean)) {
                                bestDistance = 0;
                                bestMatch = b;
                                bestRealJobNo = numericClean.length === 10 ? numericClean : cellVal;
                                return; 
                            }
                            
                            if (numericClean.length === 10 && cellNumeric.length === 10) {
                                let dist = getLevenshtein(numericClean, cellNumeric);
                                if (dist <= 2 && dist < bestDistance) {
                                    bestDistance = dist;
                                    bestMatch = b;
                                    bestRealJobNo = cellNumeric;
                                }
                            }
                        }
                    }
                });

                if (bestMatch && bestDistance <= 2) {
                    // Extract RAW engineer name to avoid PIC DPS overrides
                    let rawEngineer = bestMatch['Engineer Name'] || bestMatch['Engineer'] || 'Unmapped Technician';
                    rawEngineer = String(rawEngineer).trim().toUpperCase().replace(/^\d+\s+/, '');
                    if (!rawEngineer || /^\d+$/.test(rawEngineer) || rawEngineer.includes('UNMAPPED')) {
                         rawEngineer = 'Unmapped Technician';
                    }

                    let rawAsc = bestMatch['ASC Name'] || bestMatch['ASC'] || bestMatch['Service Center'] || bestMatch.asc || 'UNMAPPED';
                    
                    // Simple branch shortener inline
                    function shortAsc(name, matchObj = null) {
                        if (matchObj) {
                            let ccName = '';
                            for (let key in matchObj) {
                                let k = key.toLowerCase().replace(/[^a-z]/g, '');
                                if (k === 'collectioncentername' || k === 'collectioncenter' || k === 'ccname') {
                                    ccName = String(matchObj[key] || '').toUpperCase();
                                    break;
                                }
                            }
                            if (ccName.includes('CELLULAR WORLD')) return 'DENPASAR - CELLULAR WORLD';
                            if (ccName.includes('PLANET GADGET')) return 'DENPASAR - PLANET GADGET';
                        }
                        let u = String(name).toUpperCase();
                        if (u.includes('KARYA') || u.includes('KUPANG')) return 'KUPANG';
                        if (u.includes('MAHENDRA') || u.includes('DENPASAR')) return 'DENPASAR';
                        if (u.includes('SAKA') || u.includes('SINGARAJA')) return 'SINGARAJA';
                        if (u.includes('TEUKU') || u.includes('CELLULAR WORLD')) return 'DENPASAR - CELLULAR WORLD';
                        if (u.includes('GATOT') || u.includes('PLANET GADGET')) return 'DENPASAR - PLANET GADGET';
                        return name;
                    }

                    matchedBill = {
                        jobNo: bestDistance > 0 ? bestRealJobNo : cleanJobNo,
                        engineer: rawEngineer,
                        model: bestMatch['Model'] || bestMatch.model || 'Model N/A',
                        customer: bestMatch['Customer Name'] || bestMatch.customer || '-',
                        category: bestMatch['Product Category'] || bestMatch.category || '-',
                        status: bestMatch['Status'] || bestMatch.status || 'REDO'
                    };
                    matchedAsc = shortAsc(rawAsc);
                    
                    if (bestDistance > 0) {
                        item.jobNo = bestRealJobNo;
                    }
                }
            }
            
            // 3. Search in prodJobs (Productivity Data)
            if (!matchedBill && window.prodJobs && Array.isArray(window.prodJobs)) {
                const found = window.prodJobs.find(b => b.jobNo === cleanJobNo);
                if (found) {
                    matchedBill = {
                        jobNo: cleanJobNo,
                        engineer: found.engineer,
                        model: 'Model N/A',
                        customer: '-',
                        category: '-',
                        status: 'REDO'
                    };
                    matchedAsc = found.branch;
                }
            }
            
            // Update if found
            if (matchedBill) {
                item.asc = matchedAsc || 'UNMAPPED';
                item.engineer = matchedBill.engineer || 'Unmapped Technician';
                item.model = matchedBill.model || 'REDO Item';
                item.customer = matchedBill.customer || '-';
                item.category = matchedBill.category || '-';
                item.status = matchedBill.status || 'REDO';
                changed = true;
            }
        }
    });
    
    if (changed && typeof renderRedoTable === 'function') {
        renderRedoTable();
    }
};

function renderRedoTable() {
    const tbody = document.querySelector('#redo-table tbody');
    if (!tbody) return;
    
    // Apply branch filter
    if (window.currentUserBranches && window.currentUserBranches.length > 0 && window.redoList) {
        const allowed = window.currentUserBranches;
        window.redoList = window.redoList.filter(s => {
            if (!s.asc) return false;
            return isBranchAllowed(s.asc, allowed);
        });
    }
    
    if (!window.redoList || window.redoList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada hasil scan OCR</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    // Sort by branch, then engineer
    window.redoList.sort((a, b) => {
        if (a.asc !== b.asc) return a.asc.localeCompare(b.asc);
        return a.engineer.localeCompare(b.engineer);
    });
    
    // Update Overall and Branch counts
    if (document.getElementById('val-total-redo')) {
        document.getElementById('val-total-redo').innerText = window.redoList.length;
    }
    
    const branchRedoCounts = {};
    window.redoList.forEach(item => {
        branchRedoCounts[item.asc] = (branchRedoCounts[item.asc] || 0) + 1;
    });
    
    document.querySelectorAll('.val-redo').forEach(span => {
        const asc = span.getAttribute('data-asc');
        if (branchRedoCounts[asc]) {
            span.innerText = branchRedoCounts[asc];
            span.style.color = 'var(--accent-purple)';
            span.classList.add('clickable-number'); // give it same visual style on hover
        } else {
            span.innerText = '';
            span.classList.remove('clickable-number');
        }
    });

    window.redoList.forEach(item => {
        const hasPhone = !!(window.techContacts || {})[item.engineer];
        const isRC = item.status && (item.status === 'Repair Completed' || item.status.includes('Completed'));
        const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">\u{26A0}\u{FE0F}  TELANJUR RC</span>' : '';
        const waColor = hasPhone ? '#25D366' : 'var(--text-muted)';
        
        let branchDisplay = item.asc || 'UNKNOWN';
        if (typeof shortenASC === 'function') {
            branchDisplay = shortenASC(branchDisplay);
        } else {
            branchDisplay = branchDisplay.replace(/PT\.?\s*BEKARYA\s+UGERTAMA\s+JAYA\s+MANDIRI\s*/gi, '')
                                         .replace(/SAMSUNG\s+SERVICE\s+CENTER\s*/gi, '')
                                         .replace(/UNICOM\s*/gi, '')
                                         .replace(/^\d+_/, '')
                                         .split('_')[0]
                                         .trim();
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${branchDisplay}</strong></td>
            <td style="color:var(--text-main); font-weight: 500; font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="color:var(--accent-red); font-weight:bold;">${item.engineer || 'PIC ' + branchDisplay}</span>
                        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
                            ${item.jobNo} 
                            | ${item.model || '-'} ${warningTag}
                        </div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
window.renderRedoTable = renderRedoTable;

window.editRedoJobNo = function(oldJobNo) {
    const newJobNo = prompt("Correct OCR scan result (Enter correct Job No):", oldJobNo);
    if (!newJobNo || newJobNo === oldJobNo) return;
    
    const idx = window.redoList.findIndex(r => r.jobNo === oldJobNo);
    if (idx !== -1) {
        window.redoList[idx].jobNo = newJobNo.trim();
        window.redoList[idx].asc = 'SCAN OCR';
        window.redoList[idx].engineer = 'Unmapped (Excel not uploaded yet)';
        window.redoList[idx].model = 'REDO Ticket';
        window.redoList[idx].status = 'Unmapped';
        
        if (typeof window.reMapRedoList === 'function') {
            window.reMapRedoList();
            if (typeof renderRedoTable === 'function') renderRedoTable();
        }
    }
};

window.sendWARedo = function(engName, jobNo, model) {
    const phone = (window.techContacts || {})[engName];
    if (!phone) {
        showToastNotification('Nomor WA belum disetting! Buka menu "Kontak Teknisi" di atas dulu.');
        return;
    }
    
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    }
    
    let displayName = (window.techNames || {})[engName] || engName;
    
    let text = `\u{1F6A8} *PERINGATAN REDO (BOUNCING)!*\n\nHalo ${displayName},\nKami mendeteksi adanya servis berulang (REDO) untuk Job No: *${jobNo}* (${model}).\n\nTolong segera tindak lanjuti unit ini dengan perbaikan maksimal agar tidak bounce untuk yang ketiga kalinya!\n\nTerima kasih.`;
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Event Listener for Share REDO
const btnShareRedo = document.getElementById('btnShareRedo');
if (btnShareRedo) {
    btnShareRedo.addEventListener('click', () => {
        if (!window.redoList || window.redoList.length === 0) {
            showToastNotification('No OCR REDO data available or list is empty!');
            return;
        }
        
        let text = `*REDO VIOLATION REPORT*\nLarangan Keras! Ditemukan perbaikan recall, cek agar tidak merusak KPI\nkoordinasikan dengan TS jika bill *IW*\n\n`;
        
        window.redoList.forEach((item, idx) => {
            const isRC = item.status && (item.status === 'Repair Completed' || item.status.includes('Completed'));
            const rcWarning = isRC ? ' [\u{26A0}\u{FE0F}  TELANJUR RC]' : '';
            
            text += `${idx + 1}. *${item.asc}* | ${item.engineer} | Job: ${item.jobNo} (${item.model})${rcWarning}\n`;
        });
        
        navigator.clipboard.writeText(text);
        showToastNotification('REDO report copied! Please paste into Branch Head WA group.');
    });
}

// Expose functions to global scope for Web Worker and Inline HTML onclick handlers
window.updateUI = updateUI;
window.renderFameTable = renderFameTable;
window.renderDtsIhTable = renderDtsIhTable;
window.renderDtsMxTable = renderDtsMxTable;

let gdChartInstance = null;
window.renderGdTrendChart = function(gdTrendData) {
    const ctx = document.getElementById('gdTrendChart');
    if (!ctx) return;
    
    if (gdChartInstance) {
        gdChartInstance.destroy();
    }
    
    if (!gdTrendData || Object.keys(gdTrendData).length === 0) {
        return;
    }

    // Filter dan urutkan bulan yang memiliki data riil (> 50 GD nasional)
    const validMonths = Object.keys(gdTrendData).filter(m => {
        const monthBranches = gdTrendData[m] || {};
        const sum = Object.values(monthBranches).reduce((a, b) => a + (parseInt(b) || 0), 0);
        return sum > 50;
    }).sort();
    
    // Tampilkan hingga 6 bulan terakhir yang valid (mulai dari Juni 2026)
    const months = validMonths.slice(-6);
    
    // Hitung total GD per cabang untuk bulan-bulan yang aktif
    const branchTotals = {};
    months.forEach(m => {
        Object.keys(gdTrendData[m] || {}).forEach(b => {
            const count = gdTrendData[m][b] || 0;
            branchTotals[b] = (branchTotals[b] || 0) + count;
        });
    });

    // Ambil SEMUA cabang yang memiliki GD > 0, urutkan berdasarkan total terbanyak
    const branches = Object.keys(branchTotals)
        .filter(b => branchTotals[b] > 0)
        .sort((a, b) => branchTotals[b] - branchTotals[a]);
    
    // Fixed Brand Colors per Cabang
    const branchColors = {
        'MAKASSAR': '#3b82f6',                  // Blue
        'DENPASAR': '#a855f7',                  // Purple
        'DENPASAR - CELLULAR WORLD': '#ef4444', // Red
        'DENPASAR - PLANET GADGET': '#10b981',  // Emerald Green
        'MANADO': '#f97316',                    // Bright Orange (Distinct from Red)
        'KUPANG': '#eab308',                    // Gold / Amber
        'SINGARAJA': '#06b6d4',                 // Cyan
        'BANJARMASIN': '#ec4899',               // Pink
        'SAMARINDA': '#8b5cf6',                 // Violet
        'PONTIANAK': '#14b8a6',                 // Teal
        'SERPONG': '#6366f1',                   // Indigo
        'SIDOARJO': '#84cc16',                  // Lime
        'KARAWANG': '#f43f5e',                  // Rose
        'LAMPUNG': '#0ea5e9'                    // Sky Blue
    };

    // Siapkan dataset untuk semua cabang aktif
    const datasets = branches.map((branch, index) => {
        const color = branchColors[branch] || `hsl(${(index * 137.5) % 360}, 75%, 55%)`;
        
        return {
            label: branch,
            data: months.map(m => (gdTrendData[m] && gdTrendData[m][branch]) || 0),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.3,
            fill: false,
            hidden: index >= 10 // Top 10 aktif, sisanya dapat diklik di legend
        };
    });

    gdChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#64748b', font: { weight: 'bold' } }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    ticks: { color: '#94a3b8', font: { weight: '600' } }
                },
                x: {
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    ticks: { color: '#94a3b8', font: { weight: '600' } }
                }
            }
        }
    });
};

window.renderGdDailyTable = function(gdDailyData) {
    const table = document.getElementById('gd-daily-table');
    if (!table) return;
    
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;
    
    if (!gdDailyData || Object.keys(gdDailyData).length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td style="padding:15px; color:var(--text-muted); border: none;">No daily GD data available for current month.</td></tr>';
        return;
    }

    // Filter & Sort: Cabang dengan total GD > 0 diurutkan Z - A by Total GD DESC
    const activeBranches = Object.keys(gdDailyData).filter(b => {
        const days = gdDailyData[b] || {};
        const sum = Object.values(days).reduce((acc, v) => acc + (parseInt(v) || 0), 0);
        return sum > 0;
    }).sort((a, b) => {
        const daysA = gdDailyData[a] || {};
        const daysB = gdDailyData[b] || {};
        const sumA = Object.values(daysA).reduce((acc, v) => acc + (parseInt(v) || 0), 0);
        const sumB = Object.values(daysB).reduce((acc, v) => acc + (parseInt(v) || 0), 0);
        if (sumB !== sumA) return sumB - sumA;
        return a.localeCompare(b);
    });

    if (activeBranches.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td style="padding:15px; color:var(--text-muted); border: none;">No branches with GD movement this month.</td></tr>';
        return;
    }

    let maxDay = 0;
    activeBranches.forEach(b => {
        Object.keys(gdDailyData[b] || {}).forEach(day => {
            const dNum = parseInt(day);
            if (dNum > maxDay) maxDay = dNum;
        });
    });
    
    if (maxDay === 0) maxDay = 31;

    // Header (Warna Biru standar sesuai header kolom tabel dashboard)
    let headerHtml = `<tr style="position: sticky; top: 0; background: var(--accent-blue); z-index: 2;"><th style="padding: 8px 10px; background: var(--accent-blue); color: #ffffff; font-size: 0.80rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: left;">BRANCH</th>`;
    for (let day = 1; day <= maxDay; day++) {
        headerHtml += `<th style="padding: 8px 6px; background: var(--accent-blue); color: #ffffff; font-size: 0.80rem; font-weight: 700; border: 1px solid var(--border-glass); min-width: 36px; text-align: center;">${day}</th>`;
    }
    headerHtml += `<th style="padding: 8px 10px; background: var(--accent-blue); color: #ffffff; font-size: 0.80rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: center;">TOTAL</th>`;
    headerHtml += `<th style="padding: 8px 10px; background: var(--accent-blue); color: #ffffff; font-size: 0.80rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: center; white-space: nowrap;">ESTIMASI GD</th></tr>`;
    thead.innerHTML = headerHtml;

    // Rows
    tbody.innerHTML = '';
    const dayTotals = new Array(maxDay + 1).fill(0);
    let grandTotal = 0;

    // Perhitungan Kalender Bulan Berjalan
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    // Hari terakhir dalam bulan ini sesuai kalender (misal 31 untuk Okt, 30 untuk Nov)
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const yesterday = currentDay - 1;

    activeBranches.forEach((branch) => {
        const branchDays = gdDailyData[branch] || {};
        let branchTotal = 0;
        let sumYesterday = 0;
        let rowHtml = `<tr><td style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); padding: 7px 10px; border: 1px solid var(--border-glass); text-align: left; white-space: nowrap;">${branch}</td>`;
        
        for (let day = 1; day <= maxDay; day++) {
            const val = parseInt(branchDays[day]) || 0;
            branchTotal += val;
            dayTotals[day] += val;

            if (day <= yesterday) {
                sumYesterday += val;
            }

            const displayVal = val > 0 ? val : '-';
            const textStyle = val > 0 ? 'font-weight: 600; color: var(--text-main);' : 'color: var(--text-muted);';
            rowHtml += `<td style="font-size: 0.85rem; ${textStyle} padding: 7px 6px; border: 1px solid var(--border-glass); text-align: center;">${displayVal}</td>`;
        }
        
        grandTotal += branchTotal;
        rowHtml += `<td style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${branchTotal}</td>`;

        // ESTIMASI GD: Prediksi total GD hingga tgl akhir bulan
        // Cara hitung: Average GD dari tgl 1 s/d kemarin (bukan hari ini) dikali total hari kalender bulan ini
        let estimasiVal = '-';
        let tooltipText = '';
        if (yesterday >= 1) {
            const avgDaily = sumYesterday / yesterday;
            const estimasiGd = Math.round(avgDaily * totalDaysInMonth);
            estimasiVal = estimasiGd > 0 ? estimasiGd : 0;
            tooltipText = `Estimasi GD: Rata-rata ${avgDaily.toFixed(1)} GD/hari (tgl 1 s/d ${yesterday}) x ${totalDaysInMonth} hari`;
        } else if (branchTotal > 0) {
            estimasiVal = Math.round((branchTotal / 1) * totalDaysInMonth);
            tooltipText = `Estimasi GD tgl 1: ${branchTotal} x ${totalDaysInMonth} hari`;
        }

        rowHtml += `<td style="font-size: 0.85rem; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.08); padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;" title="${tooltipText}">${estimasiVal}</td></tr>`;
        tbody.innerHTML += rowHtml;
    });

    
};

window.renderVolInVsGdTable = function(volInTrendData, gdTrendData) {
    const table = document.getElementById('vol-in-vs-gd-table');
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    // Dynamic 4 months in English: 3 past months + current month MTD
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthNames = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];

    const monthsConfig = [];
    for (let i = 3; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const padM = String(m + 1).padStart(2, '0');
        const key = `${y}-${padM}`;
        const name = monthNames[m];
        const isCurrent = (i === 0);
        monthsConfig.push({
            key: key,
            label: isCurrent ? `${name} ${y} (MTD)` : `${name} ${y}`,
            sub: '(VOL IN | GD | %)',
            isCurrent: isCurrent
        });
    }

    volInTrendData = volInTrendData || {};
    gdTrendData = gdTrendData || {};
    window.volInTrendDataGlobal = volInTrendData;
    window.gdTrendDataGlobal = gdTrendData;

    const branchSet = new Set();

    monthsConfig.forEach(m => {
        if (volInTrendData[m.key]) {
            Object.keys(volInTrendData[m.key]).forEach(b => {
                if (b && b.trim()) branchSet.add(b.trim());
            });
        }
        if (gdTrendData[m.key]) {
            Object.keys(gdTrendData[m.key]).forEach(b => {
                if (b && b.trim()) branchSet.add(b.trim());
            });
        }
    });

    const pastMonthsCount = monthsConfig.filter(m => !m.isCurrent).length || 3;

    // Hitung performa 3 bulan lalu untuk pengurutan Z - A berdasarkan Average 3 Months RATIO
    const branchStats = {};
    branchSet.forEach(b => {
        let past3VInSum = 0;
        let past3GdSum = 0;
        monthsConfig.forEach(m => {
            if (!m.isCurrent) {
                past3VInSum += (volInTrendData[m.key] && parseInt(volInTrendData[m.key][b])) || 0;
                past3GdSum += (gdTrendData[m.key] && parseInt(gdTrendData[m.key][b])) || 0;
            }
        });
        const avgVIn = Math.round(past3VInSum / pastMonthsCount);
        const avgGd = Math.round(past3GdSum / pastMonthsCount);
        const ratio = avgVIn > 0 ? (avgGd / avgVIn) * 100 : (avgGd > 0 ? 100 : -1);
        branchStats[b] = { past3VInSum, past3GdSum, avgVIn, avgGd, ratio };
    });

    const branches = Array.from(branchSet).sort((a, b) => {
        const statA = branchStats[a] || { ratio: -1, avgGd: 0, avgVIn: 0 };
        const statB = branchStats[b] || { ratio: -1, avgGd: 0, avgVIn: 0 };
        // 1. Z - A (Descending): Ratio tertinggi ke terendah
        if (statB.ratio !== statA.ratio) return statB.ratio - statA.ratio;
        // 2. Tiebreaker: Avg GD terbanyak
        if (statB.avgGd !== statA.avgGd) return statB.avgGd - statA.avgGd;
        // 3. Secondary tiebreaker: Avg VOL IN terbanyak
        if (statB.avgVIn !== statA.avgVIn) return statB.avgVIn - statA.avgVIn;
        // 4. Alphabetical tiebreaker
        return a.localeCompare(b);
    });

    // 1. Table Header (English & styled to match dashboard theme)
    let headerHtml = '<tr style="position: sticky; top: 0; z-index: 3; background: var(--accent-blue);">';
    headerHtml += '<th style="padding: 8px 10px; background: var(--accent-blue); color: #ffffff; font-size: 0.80rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: center; width: 45px;">NO</th>';
    headerHtml += '<th style="padding: 8px 10px; background: var(--accent-blue); color: #ffffff; font-size: 0.80rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: left; min-width: 170px;">BRANCH (ASC)</th>';

    monthsConfig.forEach(m => {
        headerHtml += `<th style="padding: 8px 10px; background: var(--accent-blue); color: #ffffff; font-size: 0.80rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: center; min-width: 175px; line-height: 1.35;">
            ${m.label}<br>
            <span style="font-size: 0.72rem; font-weight: 600; opacity: 0.95; color: #bae6fd;">(VOL IN | GD | %)</span>
        </th>`;
    });

    // Kolom paling kanan: Average 3 Months (Eksklusif MTD) - Diurutkan Z - A berdasarkan Ratio
    headerHtml += `<th style="padding: 8px 10px; background: #1d4ed8; color: #ffffff; font-size: 0.80rem; font-weight: 800; border: 1px solid var(--border-glass); text-align: center; min-width: 180px; line-height: 1.35;" title="Rata-rata 3 Bulan Terakhir (Bulan Berjalan MTD Tidak Dihitung) - Diurutkan Z - A berdasarkan Ratio">
        AVG 3 MONTHS <i class="fa-solid fa-arrow-down-wide-short" style="margin-left: 4px; color: #fbbf24;"></i><br>
        <span style="font-size: 0.72rem; font-weight: 600; opacity: 0.95; color: #bae6fd;">(VOL IN | GD | %)</span>
    </th>`;

    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;

    // 2. Data Rows
    tbody.innerHTML = '';
    const colTotals = {};
    monthsConfig.forEach(m => {
        colTotals[m.key] = { volIn: 0, gd: 0 };
    });

    branches.forEach((branch, idx) => {
        let rowHtml = '<tr>';
        rowHtml += `<td style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${idx + 1}</td>`;
        rowHtml += `<td style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); padding: 7px 10px; border: 1px solid var(--border-glass); text-align: left; white-space: nowrap;">${branch}</td>`;

        let past3VInSum = 0;
        let past3GdSum = 0;

        monthsConfig.forEach(m => {
            const vIn = (volInTrendData[m.key] && parseInt(volInTrendData[m.key][branch])) || 0;
            const gd = (gdTrendData[m.key] && parseInt(gdTrendData[m.key][branch])) || 0;
            const rate = vIn > 0 ? ((gd / vIn) * 100).toFixed(1) + '%' : (gd > 0 ? '100%' : '-');

            colTotals[m.key].volIn += vIn;
            colTotals[m.key].gd += gd;

            if (!m.isCurrent) {
                past3VInSum += vIn;
                past3GdSum += gd;
            }

            let cellContent = '<span style="color: var(--text-muted);">-</span>';
            if (vIn > 0 || gd > 0) {
                const vInStr = vIn > 0 ? vIn.toLocaleString('id-ID') : '0';
                const gdStr = gd > 0 ? gd.toLocaleString('id-ID') : '0';
                cellContent = `<span style="font-weight: 700; color: #0f172a;">${vInStr}</span> <span style="color: #64748b; margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 700; color: #059669;">${gdStr}</span> <span style="color: #64748b; margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 700; color: #d97706;">${rate}</span>`;
            }

            rowHtml += `<td style="font-size: 0.85rem; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center; white-space: nowrap;">${cellContent}</td>`;
        });

        // Kolom paling kanan: Average 3 months (bulan berjalan tidak dihitung)
        const avgVIn = Math.round(past3VInSum / pastMonthsCount);
        const avgGd = Math.round(past3GdSum / pastMonthsCount);
        const avgRate = avgVIn > 0 ? ((avgGd / avgVIn) * 100).toFixed(1) + '%' : (avgGd > 0 ? '100%' : '-');

        let avgCellContent = '<span style="color: var(--text-muted);">-</span>';
        if (avgVIn > 0 || avgGd > 0) {
            const avgVInStr = avgVIn > 0 ? avgVIn.toLocaleString('id-ID') : '0';
            const avgGdStr = avgGd > 0 ? avgGd.toLocaleString('id-ID') : '0';
            avgCellContent = `<span style="font-weight: 700; color: #0f172a;">${avgVInStr}</span> <span style="color: #64748b; margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 700; color: #059669;">${avgGdStr}</span> <span style="color: #64748b; margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 700; color: #d97706;">${avgRate}</span>`;
        }

        rowHtml += `<td style="font-size: 0.85rem; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center; white-space: nowrap; background: rgba(37, 99, 235, 0.04);">${avgCellContent}</td>`;

        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });

    // 3. Total Area / All Row (Mockup Style)
    let footHtml = '<tr style="background: rgba(15, 23, 42, 0.9); border-top: 2px solid var(--accent-blue); font-weight: 700;">';
    footHtml += '<td style="padding: 8px 10px; color: #38bdf8; border: 1px solid var(--border-glass); text-align: center; font-size: 0.95rem; font-weight: 800;">&Sigma;</td>';
    footHtml += '<td style="padding: 8px 10px; color: #f8fafc; border: 1px solid var(--border-glass); text-align: left; font-size: 0.88rem; font-weight: 800; white-space: nowrap;">TOTAL AREA / ALL</td>';

    let totalPast3VIn = 0;
    let totalPast3Gd = 0;

    monthsConfig.forEach(m => {
        const tVIn = colTotals[m.key].volIn;
        const tGd = colTotals[m.key].gd;
        const tRate = tVIn > 0 ? ((tGd / tVIn) * 100).toFixed(1) + '%' : '-';

        if (!m.isCurrent) {
            totalPast3VIn += tVIn;
            totalPast3Gd += tGd;
        }

        let cellContent = '-';
        if (tVIn > 0 || tGd > 0) {
            cellContent = `<span style="font-weight: 800; color: #ffffff;">${tVIn.toLocaleString('id-ID')}</span> <span style="color: rgba(255,255,255,0.45); margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 800; color: #34d399;">${tGd.toLocaleString('id-ID')}</span> <span style="color: rgba(255,255,255,0.45); margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 800; color: #fbbf24;">${tRate}</span>`;
        }

        footHtml += `<td style="padding: 8px 10px; border: 1px solid var(--border-glass); text-align: center; white-space: nowrap; font-size: 0.88rem;">${cellContent}</td>`;
    });

    // Footer Avg 3 months (paling kanan)
    const totAvgVIn = Math.round(totalPast3VIn / pastMonthsCount);
    const totAvgGd = Math.round(totalPast3Gd / pastMonthsCount);
    const totAvgRate = totAvgVIn > 0 ? ((totAvgGd / totAvgVIn) * 100).toFixed(1) + '%' : '-';

    let totAvgCellContent = '-';
    if (totAvgVIn > 0 || totAvgGd > 0) {
        totAvgCellContent = `<span style="font-weight: 800; color: #ffffff;">${totAvgVIn.toLocaleString('id-ID')}</span> <span style="color: rgba(255,255,255,0.45); margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 800; color: #34d399;">${totAvgGd.toLocaleString('id-ID')}</span> <span style="color: rgba(255,255,255,0.45); margin: 0 4px; font-weight: 700;">|</span> <span style="font-weight: 800; color: #fbbf24;">${totAvgRate}</span>`;
    }

    footHtml += `<td style="padding: 8px 10px; border: 1px solid var(--border-glass); text-align: center; white-space: nowrap; font-size: 0.88rem; background: rgba(37, 99, 235, 0.25);">${totAvgCellContent}</td>`;

    footHtml += '</tr>';
    tbody.innerHTML += footHtml;

    if (typeof window.renderExecutiveSummaryTable === 'function') {
        window.renderExecutiveSummaryTable();
    }
};

// ==========================================
// EXECUTIVE DAILY SUMMARY TABLE & REPORT ENGINE
// ==========================================
window.renderExecutiveSummaryTable = function() {
    const table = document.getElementById('exec-summary-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const padMonth = String(currentMonth + 1).padStart(2, '0');
    const currentKey = `${currentYear}-${padMonth}`;

    const volData = window.volInTrendDataGlobal || {};
    const gdData = window.gdTrendDataGlobal || {};
    const branchStats = window.branchData || {};
    const rcData = window.rcData || {};
    const dosaList = window.dosaCabangData || [];
    const redoList = window.redoList || [];
    const mpuList = window.mpuData || [];
    const ubList = window.ubData || [];
    const partsDaily = window.partsDailyDataGlobal || (window.rawDashboardData && window.rawDashboardData.partsDailyData) || {};
    const partsList = window.partsSalesListGlobal || (window.rawDashboardData && window.rawDashboardData.partsSalesList) || [];

    const branchSet = new Set();
    if (window.currentUserBranches && window.currentUserBranches.length > 0) {
        window.currentUserBranches.forEach(b => { if (b && b.trim()) branchSet.add(b.trim()); });
    } else {
        Object.keys(volData[currentKey] || {}).forEach(b => { if (b && b.trim()) branchSet.add(b.trim()); });
        Object.keys(gdData[currentKey] || {}).forEach(b => { if (b && b.trim()) branchSet.add(b.trim()); });
        Object.keys(branchStats).forEach(b => { if (b && b.trim()) branchSet.add(b.trim()); });
    }
    if (branchSet.size === 0) {
        ['DENPASAR', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET'].forEach(b => branchSet.add(b));
    }

    const preferredOrder = [
        'DENPASAR',
        'DENPASAR - CELLULAR WORLD',
        'DENPASAR - PLANET GADGET'
    ];
    const branches = Array.from(branchSet).sort((a, b) => {
        const idxA = preferredOrder.indexOf(a);
        const idxB = preferredOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    tbody.innerHTML = '';

    let totVIn = 0;
    let totGd = 0;
    let totParts = 0;
    let totUnitAktif = 0;
    let totLtp = 0;
    let totAging7 = 0;
    let totRC = 0;
    let totRedo = 0;
    let totPenalties = 0;

    function matchBranchParts(branch, rowKey) {
        if (!branch || !rowKey) return false;
        const bUpper = branch.toUpperCase().trim();
        const rUpper = String(rowKey).toUpperCase().trim();
        if (bUpper.includes('CELLULAR WORLD')) return rUpper.includes('CELLULAR WORLD');
        if (bUpper.includes('PLANET GADGET')) return rUpper.includes('PLANET GADGET');
        if (bUpper === 'DENPASAR') return rUpper.startsWith('DENPASAR') && !rUpper.includes('CELLULAR WORLD') && !rUpper.includes('PLANET GADGET');
        if (bUpper.includes('ITC') || bUpper.includes('BSD')) return rUpper.includes('ITC') || rUpper.includes('BSD');
        if (bUpper === 'SERPONG') return rUpper.startsWith('SERPONG') && !rUpper.includes('ITC') && !rUpper.includes('BSD');
        const hasPinangB = bUpper.includes('PINANG');
        const hasPinangR = rUpper.includes('PINANG');
        if (hasPinangB !== hasPinangR && (bUpper.includes('TANJUNG') || rUpper.includes('TANJUNG'))) {
            return false;
        }
        return rUpper.includes(bUpper) || bUpper.includes(rUpper);
    }

    branches.forEach((b, idx) => {
        // 1. Pencapaian GD & Volume
        let vIn = (volData[currentKey] && parseInt(volData[currentKey][b])) || 0;
        let gd = (gdData[currentKey] && parseInt(gdData[currentKey][b])) || 0;
        if (vIn === 0 && volData[currentKey]) {
            const foundK = Object.keys(volData[currentKey]).find(k => matchBranchParts(b, k));
            if (foundK) vIn = parseInt(volData[currentKey][foundK]) || 0;
        }
        if (gd === 0 && gdData[currentKey]) {
            const foundK = Object.keys(gdData[currentKey]).find(k => matchBranchParts(b, k));
            if (foundK) gd = parseInt(gdData[currentKey][foundK]) || 0;
        }
        const rate = vIn > 0 ? ((gd / vIn) * 100).toFixed(1) + '%' : (gd > 0 ? '100%' : '-');

        // 2. Aksesoris (Qty pcs terjual)
        let bParts = 0;
        Object.keys(partsDaily).forEach(rowKey => {
            if (matchBranchParts(b, rowKey)) {
                const days = partsDaily[rowKey] || {};
                const sum = Object.keys(days).filter(k => k !== "partNos").reduce((acc, k) => acc + (parseInt(days[k]) || 0), 0);
                bParts += sum;
            }
        });
        if (bParts === 0 && Array.isArray(partsList)) {
            partsList.forEach(item => {
                if (matchBranchParts(b, item.branch || item.asc || '')) {
                    bParts += (parseInt(item.qty) || 0);
                }
            });
        }

        // 3. Kontrol TAT & Aging: Unit Aktif, LTP, Aging > 7D, RC
        let bs = branchStats && branchStats[b];
        if (!bs && branchStats) {
            const foundK = Object.keys(branchStats).find(k => matchBranchParts(b, k));
            if (foundK) bs = branchStats[foundK];
        }
        bs = bs || {};
        const unitAktif = bs.total || 0;
        const ltp = bs.ltp || 0;

        let aging7 = 0;
        let dStat = window.dosaCabangStatsGlobal && window.dosaCabangStatsGlobal[b];
        if (!dStat && window.dosaCabangStatsGlobal) {
            const foundK = Object.keys(window.dosaCabangStatsGlobal).find(k => matchBranchParts(b, k));
            if (foundK) dStat = window.dosaCabangStatsGlobal[foundK];
        }
        if (dStat && Array.isArray(dStat.bills)) {
            aging7 = dStat.bills.length;
        } else if (dosaList && dosaList.length > 0) {
            aging7 = dosaList.filter(d => matchBranchParts(b, d.asc || d.branch || '')).length;
        } else {
            aging7 = bs.exLtp || 0;
        }

        let rc = 0;
        let rcObj = rcData[b];
        if (!rcObj && rcData) {
            const foundK = Object.keys(rcData).find(k => matchBranchParts(b, k));
            if (foundK) rcObj = rcData[foundK];
        }
        if (typeof rcObj === 'number') rc = rcObj;
        else if (rcObj) rc = parseInt(rcObj.total) || parseInt(rcObj.count) || (Array.isArray(rcObj.bills) ? rcObj.bills.length : 0) || 0;

        // 4. Quality & Compliance: Redo, Penalti MPU/UB/X09
        const bRedo = redoList.filter(r => matchBranchParts(b, r.asc || r.branch || '')).length;
        const bMpu = mpuList.filter(m => matchBranchParts(b, m.asc || m.branch || '')).length || (bs.mpu || 0);
        const bUb = ubList.filter(u => matchBranchParts(b, u.asc || u.branch || '')).length || (bs.ub || 0);
        const bX09 = bs.x09 || 0;
        const penalties = bMpu + bUb + bX09;

        totVIn += vIn;
        totGd += gd;
        totParts += bParts;
        totUnitAktif += unitAktif;
        totLtp += ltp;
        totAging7 += aging7;
        totRC += rc;
        totRedo += bRedo;
        totPenalties += penalties;

        let rowHtml = '<tr>';
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${idx + 1}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: var(--text-main); padding: 7px 10px; border: 1px solid var(--border-glass); text-align: left; white-space: nowrap;">${b}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: #0f172a; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${vIn > 0 ? vIn.toLocaleString('id-ID') : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: #059669; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${gd > 0 ? gd.toLocaleString('id-ID') : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: #d97706; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${rate}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: ${bParts > 0 ? '#0284c7' : 'var(--text-muted)'}; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${bParts > 0 ? bParts.toLocaleString('id-ID') + ' pcs' : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: ${unitAktif > 0 ? 'var(--accent-blue)' : 'var(--text-muted)'}; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${unitAktif > 0 ? `<span class="clickable-number" style="cursor:pointer;" onclick="openModal('${b}', 'total')">${unitAktif.toLocaleString('id-ID')} Unit</span>` : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: ${ltp > 0 ? '#f59e0b' : 'var(--text-muted)'}; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${ltp > 0 ? `<span class="clickable-number" style="cursor:pointer;" onclick="openModal('${b}', 'ltp')">${ltp} Unit</span>` : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: ${aging7 > 0 ? '#ef4444' : 'var(--text-muted)'}; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${aging7 > 0 ? `<span class="clickable-number" style="cursor:pointer;" onclick="openModal('${b}', 'exLtp')">${aging7} Unit</span>` : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: ${rc > 0 ? '#0284c7' : 'var(--text-muted)'}; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${rc > 0 ? `<span class="clickable-number" style="cursor:pointer;" onclick="openModal('${b}', 'rc')">${rc} Unit</span>` : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: ${bRedo > 0 ? '#dc2626' : 'var(--text-muted)'}; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${bRedo > 0 ? bRedo + ' Unit' : '-'}</td>`;
        rowHtml += `<td style="font-size: 0.82rem; font-weight: 700; color: ${penalties > 0 ? '#f43f5e' : 'var(--text-muted)'}; padding: 7px 10px; border: 1px solid var(--border-glass); text-align: center;">${penalties > 0 ? penalties + ' Kasus' : '0'}</td>`;
        rowHtml += '</tr>';

        tbody.innerHTML += rowHtml;
    });

    // Total Row
    const totRate = totVIn > 0 ? ((totGd / totVIn) * 100).toFixed(1) + '%' : '-';

    // Summary fallbacks if branchStats was empty
    const summary = window.dashboardSummary || {};
    if (totUnitAktif === 0 && (summary.total || summary.totalSO)) totUnitAktif = summary.total || summary.totalSO || 0;
    if (totLtp === 0 && (summary.ltp || summary.totalLTP)) totLtp = summary.ltp || summary.totalLTP || 0;
    if (totAging7 === 0 && (summary.exLtp || summary.totalExLTP)) totAging7 = summary.exLtp || summary.totalExLTP || 0;

    let footHtml = '<tr style="background: rgba(15, 23, 42, 0.92); border-top: 2px solid #38bdf8; font-weight: 700;">';
    footHtml += '<td style="padding: 9px 10px; color: #38bdf8; border: 1px solid var(--border-glass); text-align: center; font-size: 0.90rem; font-weight: 800;">&Sigma;</td>';
    footHtml += '<td style="padding: 9px 10px; color: #ffffff; border: 1px solid var(--border-glass); text-align: left; font-size: 0.85rem; font-weight: 800; white-space: nowrap;">TOTAL AREA / ALL</td>';
    footHtml += `<td style="padding: 9px 10px; color: #ffffff; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totVIn > 0 ? totVIn.toLocaleString('id-ID') : '0'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #34d399; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totGd > 0 ? totGd.toLocaleString('id-ID') : '0'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #fbbf24; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totRate}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #38bdf8; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totParts > 0 ? totParts.toLocaleString('id-ID') + ' pcs' : '0 pcs'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #94a3b8; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totUnitAktif > 0 ? totUnitAktif.toLocaleString('id-ID') + ' Unit' : '0 Unit'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #fbbf24; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totLtp > 0 ? totLtp + ' Unit' : '0 Unit'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #f87171; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totAging7 > 0 ? totAging7 + ' Unit' : '0 Unit'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #38bdf8; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totRC > 0 ? totRC + ' Unit' : '0 Unit'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #f87171; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totRedo > 0 ? totRedo + ' Unit' : '0 Unit'}</td>`;
    footHtml += `<td style="padding: 9px 10px; color: #fb7185; border: 1px solid var(--border-glass); text-align: center; font-size: 0.85rem; font-weight: 800;">${totPenalties > 0 ? totPenalties + ' Kasus' : '0 Kasus'}</td>`;
    footHtml += '</tr>';

    tbody.innerHTML += footHtml;
};

window.generateExecutiveReportText = function() {
    const now = new Date();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const indMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const fullIndMonthNames = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
    
    const dayStr = dayNames[now.getDay()];
    const dateStr = `${dayStr}, ${now.getDate()} ${indMonthNames[now.getMonth()]} ${now.getFullYear()}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WITA`;
    const currentMonthName = fullIndMonthNames[now.getMonth()];

    // Dynamic greeting based on current local hour
    const hours = now.getHours();
    let timeGreeting = 'pagi';
    if (hours >= 11 && hours < 15) {
        timeGreeting = 'siang';
    } else if (hours >= 15 && hours < 18) {
        timeGreeting = 'sore';
    } else if (hours >= 18 || hours < 5) {
        timeGreeting = 'malam';
    }

    // HOM recipient name
    let rawHom = (window.techNames && window.techNames['HEAD_OPERASIONAL_MANAGER']) || '';
    let homCleanName = rawHom.trim();
    if (!homCleanName) {
        homCleanName = 'HENDRI';
    } else {
        homCleanName = homCleanName.replace(/^(Pak|Bpk|Bapak)\s+/i, '');
    }

    // Months Config
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthsConfig = [];
    for (let i = 3; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const padM = String(m + 1).padStart(2, '0');
        monthsConfig.push({
            key: `${y}-${padM}`,
            isCurrent: (i === 0)
        });
    }
    const currentKey = monthsConfig[3].key;

    const volData = window.volInTrendDataGlobal || (window.rawDashboardData && window.rawDashboardData.volInTrendData) || {};
    const gdData = window.gdTrendDataGlobal || (window.rawDashboardData && window.rawDashboardData.gdTrendData) || {};

    const cleanBranchName = (b) => {
        if (!b) return '-';
        let bName = b.replace(/^DENPASAR\s*-\s*/i, '').trim();
        bName = bName.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (bName.toLowerCase() === 'denpasar') bName = 'Denpasar';
        return bName;
    };

    const cleanTechName = (t) => {
        if (!t || t === '-') return '-';
        return t.trim().toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const matchBranch = (b, raw) => {
        if (!b || !raw) return false;
        const bUpper = b.toUpperCase().trim();
        const rUpper = String(raw).toUpperCase().trim();
        if (bUpper.includes('CELLULAR WORLD')) return rUpper.includes('CELLULAR WORLD');
        if (bUpper.includes('PLANET GADGET')) return rUpper.includes('PLANET GADGET');
        if (bUpper === 'DENPASAR') return rUpper.startsWith('DENPASAR') && !rUpper.includes('CELLULAR WORLD') && !rUpper.includes('PLANET GADGET');
        if (bUpper.includes('ITC') || bUpper.includes('BSD')) return rUpper.includes('ITC') || rUpper.includes('BSD');
        if (bUpper === 'SERPONG') return rUpper.startsWith('SERPONG') && !rUpper.includes('ITC') && !rUpper.includes('BSD');
        const hasPinangB = bUpper.includes('PINANG');
        const hasPinangR = rUpper.includes('PINANG');
        if (hasPinangB !== hasPinangR && (bUpper.includes('TANJUNG') || rUpper.includes('TANJUNG'))) {
            return false;
        }
        return rUpper.includes(bUpper) || bUpper.includes(rUpper);
    };

    // Resolusi cabang untuk user yang sedang aktif (Asmen / Admin / Super Admin)
    let branches = [];
    if (window.currentUserBranches && window.currentUserBranches.length > 0) {
        branches = [...window.currentUserBranches];
    } else {
        const branchSet = new Set();
        Object.keys(volData[currentKey] || {}).forEach(b => { if (b && b.trim()) branchSet.add(b.trim()); });
        Object.keys(gdData[currentKey] || {}).forEach(b => { if (b && b.trim()) branchSet.add(b.trim()); });
        Object.keys(branchStats).forEach(b => { if (b && b.trim()) branchSet.add(b.trim()); });
        if (branchSet.size === 0) {
            ['DENPASAR', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET'].forEach(b => branchSet.add(b));
        }
        const preferredOrder = ['DENPASAR', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET'];
        branches = Array.from(branchSet).sort((a, b) => {
            const idxA = preferredOrder.indexOf(a);
            const idxB = preferredOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });
    }

    let totVolIn = 0;
    let totGd = 0;
    const branchGdList = [];
    const volInBreakdown = [];
    const gdBreakdown = [];
    const gdRateBreakdown = [];

    branches.forEach(b => {
        let v = (volData[currentKey] && parseInt(volData[currentKey][b])) || 0;
        let g = (gdData[currentKey] && parseInt(gdData[currentKey][b])) || 0;

        // Fallback pencarian fleksibel
        if (v === 0 && volData[currentKey]) {
            const foundK = Object.keys(volData[currentKey]).find(k => matchBranch(b, k));
            if (foundK) v = parseInt(volData[currentKey][foundK]) || 0;
        }
        if (g === 0 && gdData[currentKey]) {
            const foundK = Object.keys(gdData[currentKey]).find(k => matchBranch(b, k));
            if (foundK) g = parseInt(gdData[currentKey][foundK]) || 0;
        }

        totVolIn += v;
        totGd += g;
        const rate = v > 0 ? ((g / v) * 100).toFixed(1) + '%' : (g > 0 ? '100%' : '0%');
        const bLabel = cleanBranchName(b);
        volInBreakdown.push(`${bLabel}: ${v.toLocaleString('id-ID')}`);
        gdBreakdown.push(`${bLabel}: ${g.toLocaleString('id-ID')}`);
        gdRateBreakdown.push(`${bLabel}: ${rate}`);
        branchGdList.push({ branch: b, gd: g });
    });

    const totRate = totVolIn > 0 ? ((totGd / totVolIn) * 100).toFixed(1) + '%' : (totGd > 0 ? '100%' : '0%');

    // Top branches list
    branchGdList.sort((a, b) => b.gd - a.gd);
    let topBranchesText = '';
    branchGdList.forEach((item, idx) => {
        topBranchesText += `${idx + 1}. ${cleanBranchName(item.branch)}: ${item.gd.toLocaleString('id-ID')} unit GD\n`;
    });

    // Accessories Sales (omit branches with 0)
    let totalPartsQty = 0;
    const partsBreakdown = [];
    const partsDaily = window.partsDailyDataGlobal || (window.rawDashboardData && window.rawDashboardData.partsDailyData) || {};
    const partsList = window.partsSalesListGlobal || (window.rawDashboardData && window.rawDashboardData.partsSalesList) || [];

    branches.forEach(b => {
        let sum = 0;
        Object.keys(partsDaily).forEach(rowKey => {
            if (matchBranch(b, rowKey)) {
                const days = partsDaily[rowKey] || {};
                sum += Object.keys(days).filter(k => k !== "partNos").reduce((acc, k) => acc + (parseInt(days[k]) || 0), 0);
            }
        });
        if (sum === 0 && Array.isArray(partsList)) {
            partsList.forEach(item => {
                if (matchBranch(b, item.asc || item.branch)) {
                    sum += (parseInt(item.qty) || 0);
                }
            });
        }
        totalPartsQty += sum;
        if (sum > 0) {
            partsBreakdown.push(`${cleanBranchName(b)}: ${sum.toLocaleString('id-ID')}`);
        }
    });

    // Health of Aging & TAT
    const branchStats = window.branchData || (window.rawDashboardData && window.rawDashboardData.branchStats) || {};
    const rcData = window.rcData || (window.rawDashboardData && window.rawDashboardData.rcStats) || {};
    const dosaList = window.dosaCabangData || (window.rawDashboardData && window.rawDashboardData.dosaCabangOver7) || [];
    const dosaStats = window.dosaCabangStatsGlobal || (window.rawDashboardData && window.rawDashboardData.dosaCabangStats) || {};

    let totalSO = 0;
    let totalLTP = 0;
    let totalExLTP = 0;
    let totalRC = 0;

    const soBreakdown = [];
    const ltpBreakdown = [];
    const exLtpBreakdown = [];
    const rcBreakdown = [];

    branches.forEach(b => {
        let bs = branchStats[b];
        if (!bs) {
            const foundK = Object.keys(branchStats).find(k => matchBranch(b, k));
            if (foundK) bs = branchStats[foundK];
        }
        bs = bs || {};
        const bSO = bs.total || 0;
        totalSO += bSO;
        soBreakdown.push(`${cleanBranchName(b)}: ${bSO.toLocaleString('id-ID')}`);

        // LTP (omit 0)
        const bLtpBills = (bs.bills && bs.bills.ltp) || [];
        const bLtp = bs.ltp !== undefined ? bs.ltp : bLtpBills.length;
        totalLTP += bLtp;
        if (bLtpBills.length === 1) {
            ltpBreakdown.push(`${cleanBranchName(b)}: ${bLtpBills[0].jobNo || bLtpBills[0]['Job No']} [${cleanTechName(bLtpBills[0].engineer)}]`);
        } else if (bLtpBills.length > 1) {
            const listStr = bLtpBills.map(x => `${x.jobNo || x['Job No']} [${cleanTechName(x.engineer)}]`).join(', ');
            ltpBreakdown.push(`${cleanBranchName(b)}: ${bLtpBills.length} unit (${listStr})`);
        }

        // Critical Aging (> 7 hari / Ex-LTP) - detail all bills without "dll"
        let bExBills = [];
        let dStat = dosaStats[b];
        if (!dStat) {
            const foundK = Object.keys(dosaStats).find(k => matchBranch(b, k));
            if (foundK) dStat = dosaStats[foundK];
        }
        if (dStat && Array.isArray(dStat.bills)) {
            bExBills = dStat.bills;
        } else if (dosaList && dosaList.length > 0) {
            bExBills = dosaList.filter(d => matchBranch(b, d.asc || d.branch));
        } else if (bs.bills && Array.isArray(bs.bills.exLtp)) {
            bExBills = bs.bills.exLtp;
        }

        const bAging7 = bExBills.length || bs.exLtp || 0;
        totalExLTP += bAging7;

        if (bAging7 === 1) {
            const bill = bExBills[0];
            const jNo = bill ? (bill.jobNo || bill['Job No']) : '-';
            const eng = bill ? (bill.engineer || bill.Engineer) : '-';
            exLtpBreakdown.push(`${cleanBranchName(b)}: ${jNo} [${cleanTechName(eng)}]`);
        } else if (bAging7 > 1) {
            const listStr = bExBills.map(x => `${x.jobNo || x['Job No']} [${cleanTechName(x.engineer || x.Engineer)}]`).join(', ');
            exLtpBreakdown.push(`${cleanBranchName(b)}: ${bAging7} unit (${listStr})`);
        }

        // RC (Pending Delivery)
        let rcObj = rcData[b];
        if (!rcObj) {
            const foundK = Object.keys(rcData).find(k => matchBranch(b, k));
            if (foundK) rcObj = rcData[foundK];
        }
        let rc = 0;
        if (typeof rcObj === 'number') rc = rcObj;
        else if (rcObj) rc = parseInt(rcObj.total) || parseInt(rcObj.count) || (Array.isArray(rcObj.bills) ? rcObj.bills.length : 0) || 0;
        totalRC += rc;
        rcBreakdown.push(`${cleanBranchName(b)}: ${rc.toLocaleString('id-ID')}`);
    });

    // Quality & Compliance - Redo (detail all bills without "dll", omit 0)
    let totalRedo = 0;
    const redoBreakdown = [];
    const redoList = window.redoList || (window.rawDashboardData && (window.rawDashboardData.redoList || window.rawDashboardData.redoItems)) || [];

    branches.forEach(b => {
        const bRedoBills = redoList.filter(r => matchBranch(b, r.asc || r.branch));
        const bRedo = bRedoBills.length;
        totalRedo += bRedo;
        if (bRedo === 1) {
            redoBreakdown.push(`${cleanBranchName(b)}: ${bRedoBills[0].jobNo || bRedoBills[0]['Job No']} [${cleanTechName(bRedoBills[0].engineer)}]`);
        } else if (bRedo > 1) {
            const listStr = bRedoBills.map(x => `${x.jobNo || x['Job No']} [${cleanTechName(x.engineer)}]`).join(', ');
            redoBreakdown.push(`${cleanBranchName(b)}: ${bRedo} unit (${listStr})`);
        }
    });

    // Quality & Compliance - Penalties MPU / UB / X09 (detail all bills without "dll", omit 0)
    let totalViolations = 0;
    const penaltyBreakdown = [];
    const mpuList = window.mpuData || (window.rawDashboardData && window.rawDashboardData.mpuList) || [];
    const ubList = window.ubData || (window.rawDashboardData && window.rawDashboardData.ubList) || [];

    branches.forEach(b => {
        let bs = branchStats[b];
        if (!bs) {
            const foundK = Object.keys(branchStats).find(k => matchBranch(b, k));
            if (foundK) bs = branchStats[foundK];
        }
        bs = bs || {};
        const bMpuBills = mpuList.filter(m => matchBranch(b, m.asc || m.branch));
        const bUbBills = ubList.filter(u => matchBranch(b, u.asc || u.branch));
        const bX09Bills = (bs.bills && bs.bills.x09) || [];

        const bMpu = bMpuBills.length;
        const bUb = bUbBills.length;
        const bX09 = bX09Bills.length || bs.x09 || 0;
        const bTotalPenalties = bMpu + bUb + bX09;
        totalViolations += bTotalPenalties;

        if (bTotalPenalties > 0) {
            const allBills = [
                ...bMpuBills.map(x => ({ jobNo: x.jobNo || x['Job No'], eng: x.engineer, type: 'MPU' })),
                ...bUbBills.map(x => ({ jobNo: x.jobNo || x['Job No'], eng: x.engineer, type: 'UB' })),
                ...bX09Bills.map(x => ({ jobNo: x.jobNo || x['Job No'], eng: x.engineer, type: 'X09' }))
            ];
            const typeCounts = [];
            if (bMpu > 0) typeCounts.push(`${bMpu} MPU`);
            if (bUb > 0) typeCounts.push(`${bUb} UB`);
            if (bX09 > 0) typeCounts.push(`${bX09} X09`);
            const typeStr = typeCounts.join(', ');

            if (bTotalPenalties === 1) {
                const b0 = allBills[0];
                penaltyBreakdown.push(`${cleanBranchName(b)}: ${b0.jobNo} [${cleanTechName(b0.eng)} - ${b0.type}]`);
            } else {
                const listStr = allBills.map(x => `${x.jobNo} [${cleanTechName(x.eng)}]`).join(', ');
                penaltyBreakdown.push(`${cleanBranchName(b)}: ${bTotalPenalties} kasus (${typeStr} | ${listStr})`);
            }
        }
    });

    let text = `Selamat ${timeGreeting} Pak ${homCleanName},\n`;
    text += `Izin menyampaikan *Daily Operational Report Area Saya* per hari ini, [${dateStr} | ${timeStr}]:\n\n`;
    text += `📊 *PENCAPAIAN GD & VOLUME*\n`;
    text += `• Total VOL IN: ${totVolIn.toLocaleString('id-ID')} unit \n(${volInBreakdown.join(', ')})\n`;
    text += `• Total GD: ${totGd.toLocaleString('id-ID')} unit \n(${gdBreakdown.join(', ')})\n`;
    text += `• Delivery Rate (GD%): ${totRate} \n(${gdRateBreakdown.join(', ')})\n\n`;
    text += `🏆 *Top Branch GD ${currentMonthName}:*\n`;
    text += topBranchesText + `\n`;
    text += `💰 *PENJUALAN AKSESORIS*\n`;
    text += `• Total Qty Terjual: ${totalPartsQty.toLocaleString('id-ID')} pcs\n(${partsBreakdown.length > 0 ? partsBreakdown.join(', ') : 'Nihil'})\n\n`;
    text += `⏳ *KONTROL TAT & AGING*\n`;
    text += `• Total Unit Aktif: ${totalSO.toLocaleString('id-ID')} unit \n(${soBreakdown.join(', ')})\n`;
    text += `• Pending Aging (LTP): ${totalLTP.toLocaleString('id-ID')} unit \n(${ltpBreakdown.length > 0 ? ltpBreakdown.join(', ') : 'Nihil'})\n`;
    text += `• Critical Aging (> 7 Hari / Ex-LTP): ${totalExLTP.toLocaleString('id-ID')} unit\n(${exLtpBreakdown.length > 0 ? exLtpBreakdown.join(', ') : 'Nihil'})\n`;
    text += `• Total RC: ${totalRC.toLocaleString('id-ID')} unit\n(${rcBreakdown.join(', ')})\n\n`;
    text += `🛡️ *QUALITY & COMPLIANCE*\n`;
    text += `• Kasus Redo: ${totalRedo} unit \n(${redoBreakdown.length > 0 ? redoBreakdown.join(', ') : 'Nihil'})\n`;
    text += `• Penalti MPU / UB / X09: ${totalViolations} kasus\n(${penaltyBreakdown.length > 0 ? penaltyBreakdown.join(', ') : 'Nihil'})\n\n`;
    text += `📌 *ACTION TAKEN AREA HARI INI:*\n`;
    text += `1. Sistem Auto-Alert WA pengingat aging berjalan terjadwal (09:15, 12:15, 15:15) langsung ke PIC/Leader cabang.\n`;
    text += `2. Unit Pending Delivery (RC) terus di-blast ke PIC cabang agar segera di-follow up ke customer/kurir sehingga target GD harian tercapai optimal.\n\n`;
    text += `Data lengkap real-time dapat dipantau di:\n`;
    text += `👉 https://management-bujm-dashboard.web.app\n`;

    return text;
};

// Wire Event Listeners for Executive Summary buttons
const btnShareSummary = document.getElementById('btnShareSummary');
if (btnShareSummary) {
    btnShareSummary.addEventListener('click', () => {
        const text = window.generateExecutiveReportText();
        let homPhone = (window.techContacts && window.techContacts['HEAD_OPERASIONAL_MANAGER']) || '';
        
        navigator.clipboard.writeText(text).then(() => {
            if (homPhone) {
                let norm = homPhone.replace(/[^0-9]/g, '');
                if (norm.startsWith('0')) norm = '62' + norm.substring(1);
                showToastNotification('Laporan Eksekutif disalin ke clipboard! Membuka WhatsApp HOM...');
                window.open(`https://wa.me/${norm}?text=${encodeURIComponent(text)}`, '_blank');
            } else {
                showToastNotification('Laporan Eksekutif disalin ke clipboard! Masukkan nomor WA HOM di menu Technician Contacts untuk kirim langsung.');
            }
        }).catch(err => {
            console.error('Copy failed:', err);
            if (homPhone) {
                let norm = homPhone.replace(/[^0-9]/g, '');
                if (norm.startsWith('0')) norm = '62' + norm.substring(1);
                window.open(`https://wa.me/${norm}?text=${encodeURIComponent(text)}`, '_blank');
            }
        });
    });
}

async function executeAreaBlastHOM(isAuto = false) {
    if (typeof window.generateExecutiveReportText !== 'function') {
        console.warn('⚠️ [BLAST HOM] generateExecutiveReportText belum siap.');
        return false;
    }
    const text = window.generateExecutiveReportText();
    const contacts = window.techContacts || {};
    const recipients = [];

    // Target KHUSUS & HANYA: HEAD OPERASIONAL MANAGER
    const homPhone = contacts['HEAD_OPERASIONAL_MANAGER'];
    if (homPhone) {
        recipients.push({
            name: (window.techNames && window.techNames['HEAD_OPERASIONAL_MANAGER']) || 'Head Operational Manager',
            phone: homPhone
        });
    }

    if (recipients.length === 0) {
        if (!isAuto) showToastNotification('Belum ada nomor WA HOM di menu Technician Contacts!');
        console.warn('⚠️ [BLAST HOM] Belum ada nomor kontak HEAD_OPERASIONAL_MANAGER.');
        return false;
    }

    let isJarvisUp = false;
    try {
        const checkRes = await fetch('http://127.0.0.1:3001/api/status');
        const checkData = await checkRes.json();
        if (checkData.ready) isJarvisUp = true;
    } catch (_) {}

    if (isJarvisUp && typeof blastViaJarvis === 'function') {
        const blastQueue = recipients.map(r => {
            let norm = r.phone.replace(/[^0-9]/g, '');
            if (norm.startsWith('0')) norm = '62' + norm.substring(1);
            return {
                phone: norm,
                name: r.name,
                PesanUtama: text
            };
        });
        console.log(`[BLAST HOM] Mengirim Laporan Eksekutif khusus ke HOM via Bot WA...`);
        if (!isAuto) showToastNotification(`🚀 Mengirim Laporan Eksekutif khusus ke HOM via Bot WA...`);
        const blastOk = await blastViaJarvis(blastQueue);
        if (!isAuto && blastOk) showToastNotification('✅ Blast Laporan Eksekutif ke HOM selesai diproses!');
        return blastOk;
    } else if (!isAuto) {
        // Manual Fallback: Copy to clipboard and open HOM WhatsApp
        navigator.clipboard.writeText(text);
        let firstRecipient = recipients[0];
        let norm = firstRecipient.phone.replace(/[^0-9]/g, '');
        if (norm.startsWith('0')) norm = '62' + norm.substring(1);
        showToastNotification(`Bot WA offline. Teks disalin ke clipboard! Membuka chat WA ke ${firstRecipient.name}...`);
        window.open(`https://wa.me/${norm}?text=${encodeURIComponent(text)}`, '_blank');
        return true;
    } else {
        console.warn('⚠️ [AUTO ALERT HOM] Bot WA lokal offline di port 3001, pengiriman Laporan Eksekutif ke HOM ditunda.');
        return false;
    }
}
window.executeAreaBlastHOM = executeAreaBlastHOM;

const btnBlastSummary = document.getElementById('btnBlastSummary');
if (btnBlastSummary) {
    btnBlastSummary.addEventListener('click', () => executeAreaBlastHOM(false));
}

window.showToastNotification = showToastNotification;
window.openAllProdModal = openAllProdModal;


// ==========================================
// AUTO ALERT SYSTEM (CRON JOB FRONTEND - JADWAL AREA AKTIF)
// ==========================================
const AUTO_ALERT_TIMES = ['09:15', '12:15', '15:15'];
let isAutoAlertRunning = false;

async function checkAutoAlerts() {
    // DEPRECATED DI BROWSER: Jadwal 09:15, 12:15, 15:15 WIB & Laporan HOM 09:15 ditangani 100% oleh backend Super Engine.
    return;
}



window.renderPartsSalesTable = function(partsDailyData) {
    if (partsDailyData) window.partsDailyDataGlobal = partsDailyData;
    const table = document.getElementById('parts-sales-table');
    if (!table) return;
    
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;
    
    if (!partsDailyData || Object.keys(partsDailyData).length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td style="padding:15px; color:var(--text-muted); border: none;">No daily parts sales data available for current month.</td></tr>';
        return;
    }

    const activeRows = Object.keys(partsDailyData).filter(b => {
        const days = partsDailyData[b] || {};
        const sum = Object.keys(days).filter(k => k !== "partNos").reduce((acc, k) => acc + (parseInt(days[k]) || 0), 0);
        return sum > 0;
    }).sort((a, b) => a.localeCompare(b));

    if (activeRows.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td style="padding:15px; color:var(--text-muted); border: none;">No accessories sales this month.</td></tr>';
        return;
    }

    let maxDay = 0;
    activeRows.forEach(b => {
        Object.keys(partsDailyData[b] || {}).forEach(day => {
            if (day !== "partNos") {
                const dNum = parseInt(day);
                if (dNum > maxDay) maxDay = dNum;
            }
        });
    });

    if (maxDay === 0) maxDay = new Date().getDate();

    let ths = `<th style="min-width: 150px;">CABANG</th>`;
    ths += `<th style="min-width: 150px;">PARTS NO</th>`;
    ths += `<th style="min-width: 150px;">NAMA PARTS</th>`;
    
    for(let i=1; i<=maxDay; i++) {
        ths += `<th style="text-align:center;">${i}</th>`;
    }
    ths += `<th style="text-align:center; background: rgba(56, 189, 248, 0.1);">TOTAL QTY</th>`;
    ths += `<th style="text-align:center; background: rgba(37, 99, 235, 0.2); color: #ffffff;">GRAND TOTAL</th>`;
    
    thead.innerHTML = `<tr>${ths}</tr>`;
    tbody.innerHTML = '';

    // Calculate Grand Total (Adaptor + Data Link) per Branch
    const branchTotals = {};
    const branchRows = {};
    activeRows.forEach(rowKey => {
        const parts = rowKey.split(' - ');
        const branch = parts[0];
        const days = partsDailyData[rowKey] || {};
        const sum = Object.keys(days).filter(k => k !== "partNos").reduce((acc, k) => acc + (parseInt(days[k]) || 0), 0);
        
        branchTotals[branch] = (branchTotals[branch] || 0) + sum;
        if (!branchRows[branch]) branchRows[branch] = [];
        branchRows[branch].push({ rowKey, sum });
    });

    // Render grouped by branch so GRAND TOTAL cell can span with rowspan
    const sortedBranches = Object.keys(branchRows).sort((a, b) => a.localeCompare(b));

    sortedBranches.forEach(branch => {
        const items = branchRows[branch];
        const grandTotal = branchTotals[branch] || 0;

        items.forEach((itemObj, index) => {
            const { rowKey, sum } = itemObj;
            const parts = rowKey.split(' - ');
            const itemType = parts.length > 1 ? parts[1] : '';
            
            const days = partsDailyData[rowKey] || {};
            const partNosArr = days.partNos || [];
            const partNosStr = partNosArr.join(', ');
            
            let tds = `<td>${branch}</td>`;
            tds += `<td><div style="max-width: 200px; white-space: normal; word-wrap: break-word;">${partNosStr}</div></td>`;
            tds += `<td>${itemType}</td>`;
            
            for(let i=1; i<=maxDay; i++) {
                const val = parseInt(days[i]) || 0;
                if (val > 0) {
                    tds += `<td style="text-align:center; font-weight:bold; color:var(--accent-blue);">${val}</td>`;
                } else {
                    tds += `<td style="text-align:center; color:var(--text-muted); opacity: 0.3;">-</td>`;
                }
            }
            
            tds += `<td style="text-align:center; font-weight:bold; background: rgba(56, 189, 248, 0.05); color:var(--accent-blue);">${sum}</td>`;
            
            // GRAND TOTAL cell with rowspan for the branch
            if (index === 0) {
                tds += `<td rowspan="${items.length}" style="text-align:center; font-weight:800; font-size:0.90rem; background: rgba(37, 99, 235, 0.12); color: var(--accent-blue); vertical-align: middle; border-left: 2px solid rgba(56, 189, 248, 0.3);">${grandTotal}</td>`;
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = tds;
            tbody.appendChild(tr);
        });
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const searchParts = document.getElementById('search-parts');
    if (searchParts) {
        searchParts.addEventListener('keyup', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#parts-sales-table tbody tr');
            rows.forEach(row => {
                if (row.innerText.toLowerCase().includes(term)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const btnShare = document.getElementById('btnShareParts');
    if (btnShare) {
        btnShare.addEventListener('click', () => {
            const table = document.getElementById('parts-sales-table');
            if (!table || table.querySelectorAll('tbody tr').length <= 1) {
                alert('No data to share!');
                return;
            }
            
            let text = "*ACCESSORIES SALES REPORT*\n*(Current Month)*\n\n";
            
            const rows = table.querySelectorAll('tbody tr');
            const branchMap = {};

            rows.forEach(row => {
                if(row.innerText.includes('TOTAL QTY') || row.innerText.includes('Belum ada')) return;
                
                const cells = row.querySelectorAll('td');
                if(cells.length < 3) return;
                
                const branch = cells[0].innerText.trim();
                const item = cells[2].innerText.trim();
                
                let totalQty = 0;
                let grandTotal = null;
                
                if (cells.length >= 4) {
                    const hasGrandTotal = cells[cells.length - 1].hasAttribute('rowspan') || cells[cells.length - 1].style.verticalAlign === 'middle';
                    if (hasGrandTotal) {
                        totalQty = cells[cells.length - 2].innerText.trim();
                        grandTotal = cells[cells.length - 1].innerText.trim();
                    } else {
                        totalQty = cells[cells.length - 1].innerText.trim();
                    }
                }
                
                if (!branchMap[branch]) {
                    branchMap[branch] = { items: [], grandTotal: grandTotal };
                }
                if (grandTotal) {
                    branchMap[branch].grandTotal = grandTotal;
                }
                if (item) {
                    branchMap[branch].items.push({ item, total: totalQty });
                }
            });

            Object.keys(branchMap).forEach(b => {
                text += "*" + b + "*\n";
                branchMap[b].items.forEach(it => {
                    text += "- " + it.item + ": " + it.total + "\n";
                });
                if (branchMap[b].grandTotal) {
                    text += "\u{1F449} *GRAND TOTAL: " + branchMap[b].grandTotal + "*\n";
                }
                text += "\n";
            });
            
            text += "_Generated by BUJM Dashboard_";
            
            navigator.clipboard.writeText(text).then(() => {
                const orig = btnShare.innerHTML;
                btnShare.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                setTimeout(() => { btnShare.innerHTML = orig; }, 2000);
            }).catch(err => {
                console.error('Failed to copy', err);
                alert('Failed to copy to clipboard!');
            });
        });
    }
});





