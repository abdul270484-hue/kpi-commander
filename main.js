import { CONFIG } from './src/config.js';
import { scanRedoImage, initTesseract } from './src/services/ocr.js';
import { sendWA, sendWARC, sendWADosaSingleBranch, sendWARedo, getWAPayloadShame, getWAPayloadRC } from './src/services/whatsapp.js';
import { initRulesListener, addCustomRule as configAddRule, deleteCustomRule as configDeleteRule, initContactsListener, saveTechContacts } from './src/firebase/config.js';
import { initUserListener, resetDeviceLock, removeApprovedUser, approveUser } from './src/firebase/users.js';
import { initAuth, isAdmin, normalizePhone } from './src/auth.js';
import { handleFiles, handleProductivityFiles } from './src/parser.js';
import { initFirebaseAutoSync } from './src/firebase_sync.js?v=46';

// Expose services to global scope for HTML inline onclick handlers
window.sendWA = sendWA;
window.sendWARC = sendWARC;
window.getWAPayloadShame = getWAPayloadShame;
window.getWAPayloadRC = getWAPayloadRC;
window.sendWADosaSingleBranch = sendWADosaSingleBranch;
window.sendWARedo = sendWARedo;
window.resetDeviceLock = resetDeviceLock;
window.removeApprovedUser = removeApprovedUser;
window.approveUser = approveUser;

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
            showToastNotification('<strong>Perhatian Bos:</strong> Ada ' + unknownModels.length + ' model tidak dikenali.<br>Silakan tambah di <b>Rules Config</b>!');
        }

        if (unknownReasons && unknownReasons.length > 0) {
            setTimeout(() => {
                showToastNotification('<strong>⚠️ Reason Misterius Terdeteksi!</strong><br>Ada ' + unknownReasons.length + ' alasan asing.<br>Klik <b>Rules Config</b> untuk mendaftarkannya!');
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
            if (typeof window.renderGdDailyTable === 'function') {
                window.renderGdDailyTable(gdDailyData);
            }
            if (typeof window.reMapRedoList === 'function') window.reMapRedoList();
        } catch (err) {
            console.error('[PRODUCTIVITY ERROR]', err);
        }
        
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    } else if (type === 'ANALYZE_ERROR') {
        alert("Terjadi kesalahan saat memproses data: " + error);
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
window.addEventListener('bujm_auth_ready', () => {
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

// ==========================================
// Sistem Bot WA WA BLASTER INTEGRATION (via Firestore)
// ==========================================
let isJarvisOnline = false;
let lastJarvisQr = null;

function updateJarvisUI(isReady, qrCode) {
    const statusEl = document.getElementById('jarvis-status');
    const textEl = document.getElementById('jarvis-status-text');
    const qrModal = document.getElementById('jarvis-qr-modal');
    const qrImg = document.getElementById('jarvis-qr-img');
    if (!statusEl || !textEl) return;

    if (isReady) {
        isJarvisOnline = true;
        lastJarvisQr = null;
        statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
        statusEl.style.color = '#10b981';
        statusEl.style.borderColor = '#10b981';
        statusEl.style.cursor = 'default';
        textEl.innerText = 'Sistem Bot WA: Online';
        if (qrModal && qrModal.classList.contains('active')) qrModal.classList.remove('active');
    } else if (qrCode) {
        isJarvisOnline = false;
        lastJarvisQr = qrCode;
        statusEl.style.background = 'rgba(245, 158, 11, 0.2)';
        statusEl.style.color = '#f59e0b';
        statusEl.style.borderColor = '#f59e0b';
        statusEl.style.cursor = 'pointer';
        textEl.innerText = 'Sistem Bot WA: Scan QR';
        if (qrImg) qrImg.src = qrCode;
    } else {
        isJarvisOnline = false;
        lastJarvisQr = null;
        statusEl.style.background = 'rgba(239, 68, 68, 0.2)';
        statusEl.style.color = 'var(--accent-red)';
        statusEl.style.borderColor = 'var(--accent-red)';
        statusEl.style.cursor = 'default';
        textEl.innerText = 'Sistem Bot WA: Offline';
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
            updateJarvisUI(data.ready, data.qr || null);
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
                window.showToastNotification('⚠️ Sistem Bot WA Super Engine sedang memulai di port 3001...');
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

async function blastViaJarvis(blastQueueArray) {
    if (!isJarvisOnline) {
        showToastNotification('Sistem WA sedang Offline! Pastikan file start_jarvis_background.vbs sudah dijalankan.');
        return false;
    }
    
    showToastNotification(`Mengirim ${blastQueueArray.length} data ke Sistem Bot WA...`);
    
    try {
        const response = await fetch('http://127.0.0.1:3001/api/blast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                template: '[PesanUtama]',
                data: blastQueueArray
            })
        });
        
        const result = await response.json();
        if (result.success) {
            showToastNotification('BERHASIL! Sistem Bot WA sekarang sedang mengirim WA di background secara otomatis.');
            return true;
        } else {
            showToastNotification('Gagal mengirim ke Sistem Bot WA: ' + result.error);
            return false;
        }
    } catch (err) {
        showToastNotification('Error komunikasi dengan Sistem Bot WA: ' + err.message);
        return false;
    }
}

// Event Listener for Blast Wall of Shame (Auto send WA to all)
const btnBlastShame = document.getElementById('btnBlastShame');
if (btnBlastShame) {
    btnBlastShame.addEventListener('click', async () => {
        if (!window.shameData || window.shameData.length === 0) {
            showToastNotification('Belum ada data Wall of Shame atau daftar kosong!');
            return;
        }

        // Kumpulkan payload Sistem Bot WA
        const blastQueueArray = [];
        const blastQueueManual = [];
        
        window.shameData.forEach(item => {
            if (window.getWAPayloadShame) {
                const payload = window.getWAPayloadShame(item.engineer.replace(/'/g, "\\'"), item.asc, item.count, item.detail);
                if (payload) {
                    blastQueueArray.push({
                        phone: payload.phone,
                        name: payload.name,
                        PesanUtama: payload.text
                    });
                    blastQueueManual.push(item);
                }
            }
        });
        
        if (blastQueueArray.length === 0) {
            showToastNotification('Tidak ada teknisi di Wall of Shame yang memiliki nomor WA di database kontak!');
            return;
        }

        if (isJarvisOnline) {
            // Sistem Bot WA Mode
            await blastViaJarvis(blastQueueArray);
        } else {
            // Manual Fallback Mode
            showToastNotification(`Sistem WA Offline. Memulai WA Blast MANUAL ke ${blastQueueManual.length} teknisi... Pastikan POPUP BLOCKER diizinkan!`);
            let index = 0;
            const blastInterval = setInterval(() => {
                if (index >= blastQueueManual.length) {
                    clearInterval(blastInterval);
                    showToastNotification('WA Blast Selesai! Semua pesan peringatan sudah diantrekan.');
                    return;
                }
                const item = blastQueueManual[index];
                if (typeof window.sendWA === 'function') {
                    window.sendWA(item.engineer.replace(/'/g, "\\'"), item.asc, item.count, item.detail);
                }
                index++;
            }, 10000); // 17 seconds delay
        }
    });
}

// Event Listener for Blast Pending Delivery (Auto send WA to all PICs)
const btnBlastRC = document.getElementById('btnBlastRC');
if (btnBlastRC) {
    btnBlastRC.addEventListener('click', async () => {
        if (!window.rcData || Object.keys(window.rcData).length === 0) {
            showToastNotification('Belum ada data Pending Delivery atau daftar kosong!');
            return;
        }

        const blastQueueArray = [];
        const blastQueueManual = [];

        Object.keys(window.rcData).forEach(asc => {
            if (window.getWAPayloadRC) {
                const count = window.rcData[asc].count;
                const payload = window.getWAPayloadRC(asc, count);
                if (payload) {
                    blastQueueArray.push({
                        phone: payload.phone,
                        name: payload.name,
                        PesanUtama: payload.text
                    });
                    blastQueueManual.push({ asc, count });
                }
            }
        });
        
        if (blastQueueArray.length === 0) {
            showToastNotification('Tidak ada PIC cabang di daftar Pending Delivery yang memiliki nomor WA di database kontak!');
            return;
        }

        if (isJarvisOnline) {
            // Sistem Bot WA Mode
            await blastViaJarvis(blastQueueArray);
        } else {
            // Manual Fallback Mode
            showToastNotification(`Sistem WA Offline. Memulai WA Blast MANUAL ke ${blastQueueManual.length} cabang... Pastikan POPUP BLOCKER diizinkan!`);
            let index = 0;
            const blastInterval = setInterval(() => {
                if (index >= blastQueueManual.length) {
                    clearInterval(blastInterval);
                    showToastNotification('WA Blast RC Selesai! Semua pesan peringatan sudah diantrekan.');
                    return;
                }
                const item = blastQueueManual[index];
                if (typeof window.sendWARC === 'function') {
                    window.sendWARC(item.asc, item.count);
                }
                index++;
            }, 10000); // 17 seconds delay
        }
    });
}

// Event Listener for Share Dosa Cabang (> 7 Hari)
const btnShareDosaCabang = document.getElementById('btnShareDosaCabang');
if (btnShareDosaCabang) {
    btnShareDosaCabang.addEventListener('click', () => {
        if (!window.dosaCabangData || window.dosaCabangData.length === 0) {
            showToastNotification('Belum ada data Dosa Cabang > 7 hari!');
            return;
        }
        
        const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        let text = `*AGING DOSA CABANG (> 7 HARI)*\n*Update:* ${dateStr}\n\nBerikut daftar bill pending murni kesalahan cabang dengan aging di atas 7 hari (tidak termasuk kendala SEIN/Part):\n\n`;
        
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
        
        text += `Mohon Pelatih/Kacab/PIC segera tindak lanjuti pendingan di atas hari ini juga! Terima kasih. 🙏`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Daftar Dosa Cabang > 7 hari berhasil disalin! Silakan paste di Grup WA.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Gagal menyalin teks.');
        });
    });
}


// Event Listener for Share Wall of Fame
const btnShareFame = document.getElementById('btnShareFame');
if (btnShareFame) {
    btnShareFame.addEventListener('click', () => {
        if (!window.fameData || window.fameData.length === 0) {
            showToastNotification('Belum ada data Wall of Fame atau daftar kosong!');
            return;
        }
        
        const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        // Penentuan sapaan berdasarkan waktu
        const hour = new Date().getHours();
        let greeting = 'Selamat pagi';
        if (hour >= 11 && hour < 15) greeting = 'Selamat siang';
        else if (hour >= 15 && hour < 18) greeting = 'Selamat sore';
        else if (hour >= 18 || hour < 4) greeting = 'Selamat malam';
        
        let text = `*WALL OF FAME (TOP PERFORMERS)* 🏆\n` +
                   `Update: ${dateStr}\n\n` +
                   `${greeting} Tim, mari berikan apresiasi kepada Teknisi dengan produktivitas GD tertinggi (Bulan Berjalan):\n\n`;
        
        window.fameData.forEach((eng, idx) => {
            let medali = '';
            if (idx === 0) medali = '🥇';
            else if (idx === 1) medali = '🥈';
            else if (idx === 2) medali = '🥉';
            else medali = '🎖️';
            
            text += `${medali} *${eng.engineer}* (${eng.resolvedBranch})\n` +
                    `   Total GD : ${eng.gdCount}\n` +
                    `   Repair   : ${eng.gdRepair}\n` +
                    `   Cancel   : ${eng.gdCancel}\n\n`;
        });
        
        text += `Terus tingkatkan produktivitas dan pertahankan performa luar biasa ini! 🔥👏`;
        
        
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Daftar Wall of Fame berhasil disalin! Silakan paste di Grup WA.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Gagal menyalin teks. Pastikan browser mengizinkan akses Clipboard.');
        });

    });
}

// Event Listener for Share Wall of Shame
const btnShareShame = document.getElementById('btnShareShame');
if (btnShareShame) {
    btnShareShame.addEventListener('click', () => {
        if (!window.shameData || window.shameData.length === 0) {
            showToastNotification('Belum ada data Wall of Shame atau daftar kosong!');
            return;
        }
        
        const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        let text = `*WALL OF SHAME - DOSA CABANG*\nSelamat pagi Bpk/Ibu, berikut update ${dateStr} daftar teknisi dengan aging yang belum diselesaikan:\n\n`;
        
        // Group by Branch
        const grouped = {};
        window.shameData.forEach((item) => {
            if (!grouped[item.asc]) grouped[item.asc] = [];
            grouped[item.asc].push(item);
        });
        
        // Sort Branch A-Z
        const sortedBranches = Object.keys(grouped).sort();
        
        sortedBranches.forEach((branch, bIdx) => {
            text += `*${bIdx+1}. ${branch}*\n`;
            // Sort Engineer A-Z within branch
            grouped[branch].sort((a, b) => a.engineer.localeCompare(b.engineer));
            grouped[branch].forEach((eng) => {
                text += `   - ${eng.engineer}: ${eng.count} bill\n`;
            });
        });
        
        text += `\nDimohon untuk segera menindaklanjuti bill tersebut agar tidak merusak aging cabang.`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Teks berhasil disalin! Silakan paste di Grup WA Kepala Cabang.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Gagal menyalin teks. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share MPU
const btnShareMpu = document.getElementById('btnShareMpu');
if (btnShareMpu) {
    btnShareMpu.addEventListener('click', () => {
        if (!window.mpuData || window.mpuData.length === 0) {
            showToastNotification('Belum ada data MPU Violation atau daftar kosong!');
            return;
        }
        
        let text = `*REPORT PELANGGARAN MPU (Multiple Part Usage)*\nDitemukan penggunaan lebih dari 1 part utama/mahal bill IW:\n\n`;
        
        window.mpuData.forEach((item, idx) => {
            text += `${idx + 1}. *${item.asc}* | ${item.engineer} | Job: ${item.jobNo} (${item.model})\n`;
        });
        
        text += `Mohon segera memeriksa karena ini bisa mengurangi nilai Grading KPI`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Teks MPU berhasil disalin! Silakan paste di Grup WA Kepala Cabang.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Gagal menyalin teks. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share UB
const btnShareUb = document.getElementById('btnShareUb');
if (btnShareUb) {
    btnShareUb.addEventListener('click', () => {
        if (!window.ubData || window.ubData.length === 0) {
            showToastNotification('Belum ada data UB Repair Violation atau daftar kosong!');
            return;
        }
        
        let text = `*REPORT PELANGGARAN UB REPAIR (FOLD/FLIP)*\nLarangan Keras! Ditemukan penggantian OCTA pada unit Fold/Flip IW:\n\n`;
        
        window.ubData.forEach((item, idx) => {
            text += `${idx + 1}. *${item.asc}* | ${item.engineer} | Job: ${item.jobNo} (${item.model})\n`;
        });
        
        text += `Mohon segera memeriksa karena ini bisa mengurangi nilai Grading KPI`;
        
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification('Teks UB berhasil disalin! Silakan paste di Grup WA Kepala Cabang.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Gagal menyalin teks. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share DTS MX
const btnExportDts = document.getElementById('btnExportDts');
if (btnExportDts) {
    btnExportDts.addEventListener('click', () => {
        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            showToastNotification('Belum ada data DTS MX untuk di-share!');
            return;
        }
        
        let text = `*REPORT PRODUKTIVITAS TEKNISI MX (CARRY IN)*\n\n`;
        
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
            showToastNotification('Teks DTS MX berhasil disalin! Silakan paste di Grup WA Kepala Cabang.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Gagal menyalin teks. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share DTS IH
const btnExportDtsIh = document.getElementById('btnExportDtsIh');
if (btnExportDtsIh) {
    btnExportDtsIh.addEventListener('click', () => {
        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            showToastNotification('Belum ada data DTS CE untuk di-share!');
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
            showToastNotification('Teks DTS CE berhasil disalin! Silakan paste di Grup WA Kepala Cabang.');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToastNotification('Gagal menyalin teks. Pastikan browser mengizinkan akses Clipboard.');
        });
    });
}

// Event Listener for Share Queue (Front Desk)
const btnExportQueue = document.getElementById('btnExportQueue');
if (btnExportQueue) {
    btnExportQueue.addEventListener('click', () => {
        if (!window.queueData || Object.keys(window.queueData).length === 0) {
            showToastNotification('Belum ada data Queue / Antrean untuk di-share!');
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
            showToastNotification('Gagal menyalin teks. Pastikan browser mengizinkan akses Clipboard.');
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
                <td style="font-size: 0.85rem; font-weight: 500;">${item.resolvedBranch}</td>
                <td style="font-size: 0.85rem; font-weight: 500;">${item.engineer}</td>
                <td style="text-align:center;"><span style="color:var(--accent-blue); font-size:1rem; font-weight: 700;">${gdCountText}</span></td>
                <td style="text-align:center; font-weight:700; font-size:1rem;">${avgGdText}</td>
                <td style="color:var(--accent-green); font-weight:700; font-size: 1rem; text-align:center;">${repairText}</td>
                <td style="color:var(--accent-red); font-weight:700; font-size: 1rem; text-align:center;">${cancelText}</td>
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
        const mxLtp = stats.breakdownLtp.MX + stats.breakdownExLtp.MX;
        const vdLtp = stats.breakdownLtp.VD + stats.breakdownExLtp.VD;
        const daLtp = stats.breakdownLtp.DA + stats.breakdownExLtp.DA;

        // Targets based on 2026 KPI Image
        kpiContainer.innerHTML += renderKPIBox('MX LTP (> 3d)', 5.8, calcPct(mxLtp, stats.totalCat.MX));
        kpiContainer.innerHTML += renderKPIBox('VD LTP (> 7d)', 7.6, calcPct(vdLtp, stats.totalCat.VD));
        kpiContainer.innerHTML += renderKPIBox('DA LTP (> 5d)', 5.3, calcPct(daLtp, stats.totalCat.DA));
        
        // Ex-LTP Targets based on 2026 KPI Image
        kpiContainer.innerHTML += renderKPIBox('MX EX-LTP (> 7d)', 1.23, calcPct(stats.breakdownExLtp.MX, stats.totalCat.MX));
        kpiContainer.innerHTML += renderKPIBox('VD EX-LTP (> 14d)', 0.88, calcPct(stats.breakdownExLtp.VD, stats.totalCat.VD));
        kpiContainer.innerHTML += renderKPIBox('DA EX-LTP (> 14d)', 0.88, calcPct(stats.breakdownExLtp.DA, stats.totalCat.DA));
        
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
    const ctxLtp = document.getElementById('ltpChart').getContext('2d');
    if (ltpChartInstance) ltpChartInstance.destroy();
    
    Chart.defaults.color = '#8b9bb4';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    
    ltpChartInstance = new Chart(ctxLtp, {
        type: 'bar',
        data: {
            labels: ['MX (Mobile)', 'VD (TV)', 'DA (Appliances)'],
            datasets: [{
                label: 'Pending LTP/Ex-LTP',
                data: [stats.breakdownLtp.MX, stats.breakdownLtp.VD, stats.breakdownLtp.DA],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(139, 92, 246, 0.7)',
                    'rgba(239, 68, 68, 0.7)'
                ],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // Render Responsibility Chart
    const ctxResp = document.getElementById('responsibilityChart').getContext('2d');
    if (respChartInstance) respChartInstance.destroy();

    const h = ctxResp.canvas.height || 300;
    
    // Create 3D Cylindrical Gradients
    const gradRed = ctxResp.createLinearGradient(0, 0, 0, h);
    gradRed.addColorStop(0, '#fca5a5'); // Highlight
    gradRed.addColorStop(0.4, '#ef4444'); // Base
    gradRed.addColorStop(1, '#7f1d1d'); // Shadow
    
    const gradGreen = ctxResp.createLinearGradient(0, 0, 0, h);
    gradGreen.addColorStop(0, '#6ee7b7');
    gradGreen.addColorStop(0.4, '#10b981');
    gradGreen.addColorStop(1, '#064e3b');
    
    const gradBlue = ctxResp.createLinearGradient(0, 0, 0, h);
    gradBlue.addColorStop(0, '#93c5fd');
    gradBlue.addColorStop(0.4, '#3b82f6');
    gradBlue.addColorStop(1, '#1e3a8a');

    // Pseudo-3D Plugin for Drop Shadow & Bevel Highlight
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
            // Bevel effect (Glass/Plastic reflection on edges)
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(args.index);
            meta.data.forEach(arc => {
                ctx.save();
                ctx.beginPath();
                ctx.arc(arc.x, arc.y, arc.outerRadius, arc.startAngle, arc.endAngle);
                ctx.arc(arc.x, arc.y, arc.innerRadius, arc.endAngle, arc.startAngle, true);
                ctx.closePath();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.stroke();
                
                // Add inner dark shadow bevel
                ctx.beginPath();
                ctx.arc(arc.x, arc.y, arc.innerRadius + 1, arc.startAngle, arc.endAngle);
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.stroke();
                ctx.restore();
            });
        }
    };

    respChartInstance = new Chart(ctxResp, {
        type: 'doughnut',
        data: {
            labels: ['AGING (Branch Fault)', 'SEIN (Samsung Fault)', 'OTHER'],
            datasets: [{
                data: [stats.responsibility.AGING, stats.responsibility.SEIN, stats.responsibility.OTHER],
                backgroundColor: ['#ef4444', '#10b981', '#3b82f6'],
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#0f172a', font: { weight: 'bold' } } }
            }
        }
    });

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
                const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">⚠️ TELANJUR RC</span>' : '';
                
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
            tbodyUb.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px;">Aman! Tidak ada pelanggaran UB Repair.</td></tr>`;
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
                const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">⚠️ TELANJUR RC</span>' : '';

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
            tbodyDosa.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px;">Bersih! Tidak ada dosa cabang > 7 hari.</td></tr>`;
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
                        <button onclick="sendWADosaSingleBranch('${asc}')" style="background: none; border: none; color: ${waColor}; font-size: 1rem; cursor: pointer; margin-left: 10px;" title="Kirim Peringatan WA ke PIC Dosa Cabang"><i class="fa-brands fa-whatsapp"></i></button>
                    </td>
                    <td><span class="clickable-number" style="color:var(--accent-red); font-size: 1rem; font-weight: 700;" onclick="openDosaModal('${asc}')">${dc.count} Units</span></td>
                `;
                tbodyDosa.appendChild(tr);
            });
        }
    }

    // ==========================================
    // TOP 5 CRITICAL CASES WIDGET (EXECUTIVE CONTROL TOWER)
    // ==========================================
    let top5Container = document.getElementById('top5-critical-widget');
    if (!top5Container) {
        // Create widget if not exists
        top5Container = document.createElement('div');
        top5Container.id = 'top5-critical-widget';
        top5Container.className = 'card glass-panel span-10';
        top5Container.style.marginTop = '20px';
        
        // Insert before Branch Performance Breakdown
        const branchTableCard = document.querySelector('#branch-table').closest('.card');
        if (branchTableCard && branchTableCard.parentNode) {
            branchTableCard.parentNode.insertBefore(top5Container, branchTableCard);
        }
    }
    
    // Gather all >7 days bills and sort by AI Risk Score
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
    
    allAgingBills.sort((a, b) => {
        const riskA = a.ai_riskScore || 0;
        const riskB = b.ai_riskScore || 0;
        if (riskB !== riskA) return riskB - riskA;
        return (b.pendingDays || 0) - (a.pendingDays || 0);
    });
    
    const top5 = allAgingBills.slice(0, 5);
    
    let top5HTML = `
        <div class="card-header" style="background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%);">
            <h3 style="color: white; font-size: 1.1rem;"><i class="fa-solid fa-robot"></i> Executive Control Tower: Top 5 Critical Cases</h3>
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
    
    if (top5.length === 0) {
        top5HTML += `<tr><td colspan="7" style="text-align:center;">Tidak ada kasus kritis. Excellent!</td></tr>`;
    } else {
        top5.forEach(b => {
            const priorityColor = b.ai_priority?.level === 'CRITICAL' ? 'var(--accent-red)' :
                                  b.ai_priority?.level === 'HIGH' ? 'orange' : 'var(--text-muted)';
            const priorityText = b.ai_priority ? `<span style="color: ${priorityColor}; font-weight: bold;">${b.ai_priority.level} (Score: ${Math.round(b.ai_riskScore || 0)})</span>` : '-';
            const actionText = b.ai_action ? `<span style="font-size: 0.8rem; color: #a5b4fc;">${b.ai_action.actionText}</span>` : '-';
            
            top5HTML += `
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
    
    top5HTML += `</tbody></table></div>`;
    if (top5Container) top5Container.innerHTML = top5HTML;

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
            const warningTag = isRC ? '<br><span style=\"background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;\">⚠️ TELANJUR RC</span>' : '';
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
                        <button onclick="sendWA('${item.engineer.replace(/'/g, "\\'")}', '${item.asc}', ${item.count}, '${item.detail}')" style="background: none; border: none; color: ${waColor}; font-size: 1.5rem; cursor: pointer;" title="Kirim Teguran WA"><i class="fa-brands fa-whatsapp"></i></button>
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
                        <button onclick="sendWA('${item.engineer.replace(/'/g, "\\'")}', '${item.asc}', ${item.count}, '${item.detail}')" style="background: none; border: none; color: ${waColor}; font-size: 1.5rem; cursor: pointer;" title="Kirim Teguran WA"><i class="fa-brands fa-whatsapp"></i></button>
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
            tbodyRC.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px; color:var(--text-muted);">Tumben, tidak ada unit ngendap!</td></tr>`;
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
                        <button onclick="sendWARC('${asc}', ${rc.count})" style="background: none; border: none; color: ${waColor}; font-size: 1rem; cursor: pointer; margin-left: 10px;" title="Kirim Peringatan WA ke PIC"><i class="fa-brands fa-whatsapp"></i></button>
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
        tbodyBranch.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted); font-size: 0.95rem;">🎉 Luar biasa! Tidak ada cabang yang memiliki pelanggaran/penalti saat ini.</td></tr>`;
    } else {
        sortedBranches.forEach(branch => {
            const bs = branchStats[branch];
            const tr = document.createElement('tr');
            
            // Helper to generate clickable cell
            const getCell = (val, metric, colorStyle) => {
                if (val === 0) return `<td></td>`;
                return `<td style="text-align:center; ${colorStyle}"><span class="clickable-number" onclick="openModal('${branch}', '${metric}')">${val}</span></td>`;
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

// Render Redo Table
function renderRedoTable() {
    const tbodyRedo = document.querySelector('#redo-table tbody');
    if (!tbodyRedo) return;
    
    let redoList = window.redoList || [];
    if (window.currentUserBranches && window.currentUserBranches.length > 0) {
        const allowed = window.currentUserBranches;
        redoList = redoList.filter(s => {
            if (!s.asc) return false;
            let upper = String(s.asc).toUpperCase();
            return allowed.some(a => upper.includes(a));
        });
    }
    tbodyRedo.innerHTML = '';
    
    // Update branch table counts for REDO
    const redoBranchCounts = {};
    redoList.forEach(item => {
        const b = item.asc || 'Unknown';
        redoBranchCounts[b] = (redoBranchCounts[b] || 0) + 1;
    });

    document.querySelectorAll('.val-redo').forEach(el => {
        const asc = el.getAttribute('data-asc');
        const count = redoBranchCounts[asc] || 0;
        if (count > 0) {
            el.innerHTML = `<span class="clickable-number" style="color:var(--accent-orange); font-weight:bold;">${count}</span>`;
        } else {
            el.innerHTML = '';
        }
    });

    if (redoList.length === 0) {
        tbodyRedo.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px; color:var(--text-muted);">Aman! Tidak ada pelanggaran REDO yang terdeteksi.</td></tr>`;
        return;
    }

    const sortedRedo = [...redoList].sort((a, b) => {
        const comp = (a.asc || '').localeCompare(b.asc || '');
        if (comp !== 0) return comp;
        return (a.engineer || '').localeCompare(b.engineer || '');
    });

    sortedRedo.forEach(item => {
        const tr = document.createElement('tr');
        const isRC = item.status && (item.status.includes('Completed') || item.status === 'Repair Completed' || item.status === 'REDO');
        const warningTag = `<br><span style="background:var(--accent-orange); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">⚠️ REDO</span>`;

        tr.innerHTML = `
            <td><strong>${item.asc}</strong></td>
            <td style="color:var(--text-main); font-weight: 500; font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="color:var(--accent-orange); font-weight:bold;">${item.engineer || 'PIC ' + item.asc}</span>
                        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${item.jobNo} | ${item.model || '-'} ${warningTag}</div>
                    </div>
                </div>
            </td>
        `;
        tbodyRedo.appendChild(tr);
    });
}

window.renderRedoTable = renderRedoTable;
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
            tbodyDtsIh.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data CE hari ini</td></tr>`;
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
                tbodyDtsIh.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada teknisi VD/DA dengan kunjungan/aging hari ini</td></tr>`;
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
            tbodyDtsMx.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data MX hari ini</td></tr>`;
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
        
        const pesan = `🔑 *REQUEST AKSES RULES CONFIG*\n\nHalo Ndan,\nSaya *${nama.trim()}* ingin meminta izin akses ke menu *Rules Config* di Dashboard BUJM.\n\nMohon diberikan password-nya ya Ndan. Terima kasih! 🙏`;
        
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
        approvedUsersList.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">Belum ada user yang masuk</td></tr>`;
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
        
        const deviceStatus = user.deviceId ? '<span style="color:var(--accent-green);"><i class="fa-solid fa-lock"></i> Terkunci</span>' : '<span style="color:var(--text-muted);">Bebas</span>';
        
        let branchesDisplay = '<span style="color:var(--text-muted); font-style:italic;">Belum Ada Cabang</span>';
        if (user.branches && Array.isArray(user.branches) && user.branches.length > 0) {
            branchesDisplay = '<div style="font-size:0.75rem; color:var(--accent-blue); max-width: 150px; word-wrap: break-word;">' + user.branches.join(', ') + '</div>';
        } else if (user.role === 'admin') {
            branchesDisplay = '<span style="color:var(--text-muted); font-style:italic;">Semua Cabang (Global)</span>';
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
                <button onclick="window.editUserBranches('${user.id}', '${(user.branches || []).join(', ')}')" style="background: rgba(59, 130, 246, 0.2); border: 1px solid var(--accent-blue); color: var(--accent-blue); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem; margin-right: 5px;" title="Edit Cabang">
                    <i class="fa-solid fa-map-location-dot"></i>
                </button>
                <button onclick="resetDeviceLock('${user.id}')" style="background: rgba(37, 211, 102, 0.2); border: 1px solid var(--accent-green); color: var(--accent-green); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem; margin-right: 5px;" title="Reset Device (Buka Kunci)">
                    <i class="fa-solid fa-unlock-keyhole"></i>
                </button>
                <button onclick="removeApprovedUser('${user.id}', '${user.email}')" style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--accent-red); color: var(--accent-red); cursor: pointer; padding: 5px 8px; border-radius:4px; font-size: 0.8rem;" title="Hapus User">
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
              <td style="text-align:center; min-width: 130px;">
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
    
    if (unModels.length === 0) ml.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">Tidak ada</span>';
    else {
        unModels.forEach(m => {
            const btn = document.createElement('button');
            btn.textContent = m;
            btn.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #dc2626; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;';
            btn.onclick = () => fillModelRule(m);
            ml.appendChild(btn);
        });
    }
    
    if (unReasons.length === 0) rl.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">Tidak ada</span>';
    else {
        unReasons.forEach(r => {
            const btn = document.createElement('button');
            btn.textContent = r;
            btn.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #dc2626; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer;';
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
            tbodyModels.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">Belum ada aturan model</td></tr>`;
        } else {
            customModels.forEach((rule, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${rule.keyword}</td>
                    <td><span style="color:var(--accent-blue);">${rule.category}</span></td>
                    <td style="text-align:center;"><button onclick="deleteCustomRule('model', ${idx})" style="background: none; border: none; color: var(--accent-red); cursor: pointer;" title="Hapus"><i class="fa-solid fa-trash"></i></button></td>
                `;
                tbodyModels.appendChild(tr);
            });
        }
    }

    const tbodyReasons = document.getElementById('custom-reasons-list');
    if(tbodyReasons) {
        tbodyReasons.innerHTML = '';
        if (customReasons.length === 0) {
            tbodyReasons.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">Belum ada aturan reason</td></tr>`;
        } else {
            customReasons.forEach((rule, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${rule.keyword}</td>
                    <td><span style="color:var(--accent-red);">${rule.category}</span></td>
                    <td style="text-align:center;"><button onclick="deleteCustomRule('reason', ${idx})" style="background: none; border: none; color: var(--accent-red); cursor: pointer;" title="Hapus"><i class="fa-solid fa-trash"></i></button></td>
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
        showToastNotification('Database Nomor WA berhasil disimpan ke Cloud!');
        contactsModal.classList.add('hidden');
        
        if (window.engineerData) {
            showToastNotification('Simpan sukses! Refresh halaman untuk melihat warna tombol WA yang baru.');
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
                <input type="text" class="tech-real-name" data-name="${eng}" value="${realName}" placeholder="Ketik nama asli PIC..." style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.3); color: white; font-size: 0.85rem;">
            `;
        }
        
        contactsTableBody.innerHTML += `
            <tr>
                <td style="font-weight: 500; font-size: 0.9rem;">${nameHtml}</td>
                <td>
                    <input type="text" class="tech-phone" data-name="${eng}" value="${phone}" placeholder="Cth: 0812345..." style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05); color: white;">
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
    if (!window.branchData || !window.branchData[branch] || !window.branchData[branch].bills[metric] || window.branchData[branch].bills[metric].length === 0) {
        return; // Do nothing if no data
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
    
    const bills = window.branchData[branch].bills[metric];
    
    const metricNames = {
        total: 'Total S/O',
        ltp: 'LTP (Aging)',
        exLtp: 'Ex-LTP',
        mpu: 'MPU Violations',
        x09: 'X09 Violations'
    };
    
    document.getElementById('modal-title').innerText = `${branch} - ${metricNames[metric]} Details (${bills.length} units)`;
    
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
        showToastNotification(`Memulai pemindaian AI pada ${files.length} gambar... Mohon tunggu.`);
        
        for (let i = 0; i < files.length; i++) {
            if (files.length > 1) {
                showToastNotification(`Memindai gambar ${i+1} dari ${files.length}...`);
            }
            await handleRedoImage(files[i]);
        }
        
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        showToastNotification('Scan OCR Selesai! Tabel Redo telah diperbarui.');
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
    if (loadingOverlay) loadingOverlay.querySelector('p').innerText = 'Memindai teks menggunakan AI (Fast Mode)...';
    
    const result = await scanRedoImage(file);
    
    if (result.error) {
        showToastNotification(result.error);
        return;
    }
    
    if (!result.uniqueJobs || result.uniqueJobs.length === 0) {
        console.log('Tidak ditemukan Service Order No di gambar tersebut!');
        showToastNotification('⚠️ Tidak terdeteksi No. Service Order (Job No 10-digit) pada gambar ini.');
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
                let rawEngineer = bestMatch['Engineer Name'] || bestMatch['Engineer'] || 'Teknisi Unmapped';
                rawEngineer = String(rawEngineer).trim().toUpperCase().replace(/^\d+\s+/, '');
                if (!rawEngineer || /^\d+$/.test(rawEngineer) || rawEngineer.includes('UNMAPPED')) {
                     rawEngineer = 'Teknisi Unmapped';
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
                engineer: matchedBill.engineer || 'Teknisi Unmapped',
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
                engineer: 'Unmapped (Belum upload Excel)',
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
                    let rawEngineer = bestMatch['Engineer Name'] || bestMatch['Engineer'] || 'Teknisi Unmapped';
                    rawEngineer = String(rawEngineer).trim().toUpperCase().replace(/^\d+\s+/, '');
                    if (!rawEngineer || /^\d+$/.test(rawEngineer) || rawEngineer.includes('UNMAPPED')) {
                         rawEngineer = 'Teknisi Unmapped';
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
                item.engineer = matchedBill.engineer || 'Teknisi Unmapped';
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
            let upper = String(s.asc).toUpperCase();
            return allowed.some(a => upper.includes(a));
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
        const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">⚠️ TELANJUR RC</span>' : '';
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
    const newJobNo = prompt("Koreksi hasil scan OCR yang salah (Masukkan Job No yang benar):", oldJobNo);
    if (!newJobNo || newJobNo === oldJobNo) return;
    
    const idx = window.redoList.findIndex(r => r.jobNo === oldJobNo);
    if (idx !== -1) {
        window.redoList[idx].jobNo = newJobNo.trim();
        window.redoList[idx].asc = 'SCAN OCR';
        window.redoList[idx].engineer = 'Unmapped (Belum upload Excel)';
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
    
    let text = `🚨 *PERINGATAN REDO (BOUNCING)!*\n\nHalo ${displayName},\nKami mendeteksi adanya servis berulang (REDO) untuk Job No: *${jobNo}* (${model}).\n\nTolong segera tindak lanjuti unit ini dengan perbaikan maksimal agar tidak bounce untuk yang ketiga kalinya!\n\nTerima kasih.`;
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Event Listener for Share REDO
const btnShareRedo = document.getElementById('btnShareRedo');
if (btnShareRedo) {
    btnShareRedo.addEventListener('click', () => {
        if (!window.redoList || window.redoList.length === 0) {
            showToastNotification('Belum ada data REDO hasil scan OCR atau daftar kosong!');
            return;
        }
        
        let text = `*REPORT PELANGGARAN REDO*\nLarangan Keras! Ditemukan perbaikan recall, cek agar tidak merusak KPI\nkoordinasikan dengan TS jika bill *IW*\n\n`;
        
        window.redoList.forEach((item, idx) => {
            const isRC = item.status && (item.status === 'Repair Completed' || item.status.includes('Completed'));
            const rcWarning = isRC ? ' [⚠️ TELANJUR RC]' : '';
            
            text += `${idx + 1}. *${item.asc}* | ${item.engineer} | Job: ${item.jobNo} (${item.model})${rcWarning}\n`;
        });
        
        navigator.clipboard.writeText(text);
        showToastNotification('Teks REDO berhasil disalin! Silakan paste di Grup WA Kepala Cabang.');
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

    // Ambil daftar bulan (X-axis) dan urutkan secara kronologis
    const months = Object.keys(gdTrendData).sort();
    
    // Hitung total 6 bulan per cabang untuk semua cabang yang memiliki GD
    const branchTotals = {};
    months.forEach(m => {
        Object.keys(gdTrendData[m]).forEach(b => {
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
        'MAKASSAR': '#3b82f6',
        'DENPASAR': '#a855f7',
        'KUPANG': '#eab308',
        'SINGARAJA': '#06b6d4',
        'DENPASAR - CELLULAR WORLD': '#ef4444',
        'DENPASAR - PLANET GADGET': '#10b981'
    };

    // Siapkan dataset untuk semua cabang aktif
    const datasets = branches.map((branch, index) => {
        const color = branchColors[branch] || `hsl(${(index * 137.5) % 360}, 75%, 55%)`;
        
        return {
            label: `${branch} (${branchTotals[branch]} GD)`,
            data: months.map(m => gdTrendData[m][branch] || 0),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.3,
            fill: false
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
                    labels: { color: '#cbd5e1', font: { weight: 'bold' } }
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
        tbody.innerHTML = '<tr><td style="padding:15px; color:var(--text-muted); border: none;">Belum ada data GD harian untuk bulan berjalan.</td></tr>';
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
        tbody.innerHTML = '<tr><td style="padding:15px; color:var(--text-muted); border: none;">Belum ada cabang dengan pergerakan GD bulan berjalan.</td></tr>';
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
    let headerHtml = `<tr style="position: sticky; top: 0; background: var(--accent-blue); z-index: 2;"><th style="padding: 10px 14px; background: var(--accent-blue); color: #ffffff; font-size: 0.85rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: left;">BRANCH</th>`;
    for (let day = 1; day <= maxDay; day++) {
        headerHtml += `<th style="padding: 10px 6px; background: var(--accent-blue); color: #ffffff; font-size: 0.85rem; font-weight: 700; border: 1px solid var(--border-glass); min-width: 36px; text-align: center;">${day}</th>`;
    }
    headerHtml += `<th style="padding: 10px 14px; background: var(--accent-blue); color: #ffffff; font-size: 0.85rem; font-weight: 700; border: 1px solid var(--border-glass); text-align: center;">TOTAL</th></tr>`;
    thead.innerHTML = headerHtml;

    // Rows
    tbody.innerHTML = '';
    const dayTotals = new Array(maxDay + 1).fill(0);
    let grandTotal = 0;

    activeBranches.forEach((branch) => {
        const branchDays = gdDailyData[branch] || {};
        let branchTotal = 0;
        let rowHtml = `<tr><td style="font-size: 0.95rem; font-weight: 600; color: var(--text-main); padding: 8px 14px; border: 1px solid var(--border-glass); text-align: left; white-space: nowrap;">${branch}</td>`;
        
        for (let day = 1; day <= maxDay; day++) {
            const val = branchDays[day] || 0;
            branchTotal += val;
            dayTotals[day] += val;
            const displayVal = val > 0 ? val : '-';
            const textStyle = val > 0 ? 'font-weight: 600; color: var(--text-main);' : 'color: var(--text-muted);';
            rowHtml += `<td style="font-size: 0.95rem; ${textStyle} padding: 8px 6px; border: 1px solid var(--border-glass); text-align: center;">${displayVal}</td>`;
        }
        
        grandTotal += branchTotal;
        rowHtml += `<td style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); padding: 8px 14px; border: 1px solid var(--border-glass); text-align: center;">${branchTotal}</td></tr>`;
        tbody.innerHTML += rowHtml;
    });

    // Total Row
    let totalRowHtml = `<tr style="font-weight: 700; background: var(--bg-panel-hover);"><td style="font-size: 0.95rem; font-weight: 700; color: var(--accent-blue); padding: 10px 14px; border: 1px solid var(--border-glass); text-align: left;">TOTAL</td>`;
    for (let day = 1; day <= maxDay; day++) {
        const dVal = dayTotals[day];
        const displayDVal = dVal > 0 ? dVal : '-';
        totalRowHtml += `<td style="font-size: 0.95rem; font-weight: 700; color: var(--accent-blue); padding: 10px 6px; border: 1px solid var(--border-glass); text-align: center;">${displayDVal}</td>`;
    }
    totalRowHtml += `<td style="font-size: 0.95rem; font-weight: 700; color: var(--accent-blue); padding: 10px 14px; border: 1px solid var(--border-glass); text-align: center;">${grandTotal}</td></tr>`;
    tbody.innerHTML += totalRowHtml;
};

window.showToastNotification = showToastNotification;
window.openAllProdModal = openAllProdModal;

}); // End of bujm_auth_ready block


// ==========================================
// AUTO ALERT SYSTEM (CRON JOB FRONTEND)
// ==========================================
const AUTO_ALERT_TIMES = ['09:10', '12:10', '15:10'];
setInterval(() => {
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate(); 
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let completedAlerts = JSON.parse(localStorage.getItem('bujm_completed_alerts') || '{}');

    // Reset old dates to prevent localStorage from growing forever
    if (completedAlerts.date !== dateStr) {
        completedAlerts = { date: dateStr };
    }

    let needsSave = false;
    const AUTO_ALERT_TIMES = ['09:10', '12:10', '15:10'];

    AUTO_ALERT_TIMES.forEach(targetTime => {
        const parts = targetTime.split(':');
        const targetTotalMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        
        const alertKey = targetTime;
        
        // Window is 45 minutes to account for throttled background tabs
        if (currentMins >= targetTotalMins && currentMins < targetTotalMins + 45 && !completedAlerts[alertKey]) {
            completedAlerts[alertKey] = true; 
            needsSave = true;
            console.log('[AUTO ALERT] Triggering Scheduled Blast for ' + targetTime);
            
            const btnShame = document.getElementById('btnBlastShame');
            if (btnShame) {
                setTimeout(() => btnShame.click(), 2000); 
            }
            
            const btnRC = document.getElementById('btnBlastRC');
            if (btnRC && targetTime === '09:10') {
                setTimeout(() => btnRC.click(), 5000); 
            }
        }
    });

    if (needsSave) {
        localStorage.setItem('bujm_completed_alerts', JSON.stringify(completedAlerts));
    }
}, 30000); // Cek setiap 30 detik
