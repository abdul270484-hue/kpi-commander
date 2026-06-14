// ============================================
// SECURITY / LOGIN LOGIC
// ============================================
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
let isAdmin = false; // Flag: apakah yang login adalah Admin?

// --- Normalize Phone Number (strip non-digit, convert 08 → 628) ---
function normalizePhone(phone) {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '62' + digits.substring(1);
    if (!digits.startsWith('62')) digits = '62' + digits;
    return digits;
}

// Check if already authenticated in this session
const savedAuth = sessionStorage.getItem('bujm_auth');
if (savedAuth === 'admin' || savedAuth === 'user') {
    loginScreen.style.display = 'none';
    mainApp.classList.remove('hidden');
    isAdmin = (savedAuth === 'admin');
    if (isAdmin) {
        const btnManage = document.getElementById('btn-manage-users');
        if (btnManage) btnManage.style.display = '';
    }
}

// ---- Toggle Admin / Phone login ----
const toggleAdminLink = document.getElementById('toggle-admin-login');
const phoneSection = document.getElementById('login-phone-section');
const adminSection = document.getElementById('admin-login-section');

if (toggleAdminLink) {
    toggleAdminLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (adminSection.style.display === 'none') {
            adminSection.style.display = 'block';
            phoneSection.style.display = 'none';
            toggleAdminLink.innerHTML = '<i class="fa-solid fa-phone"></i> Login dengan Nomor HP';
        } else {
            adminSection.style.display = 'none';
            phoneSection.style.display = 'block';
            toggleAdminLink.innerHTML = '<i class="fa-solid fa-user-shield"></i> Login sebagai Admin';
        }
    });
}

// ---- Admin Login (Master Override) ----
const btnLogin = document.getElementById('btn-login');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginErrorMsg = document.getElementById('login-error');

if (btnLogin) {
    btnLogin.addEventListener('click', handleAdminLogin);
}
if (loginPasswordInput) {
    loginPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminLogin();
    });
}

function handleAdminLogin() {
    const user = loginUsernameInput.value.trim().toUpperCase();
    const pass = loginPasswordInput.value.trim().toUpperCase();
    
    if (user === 'OPTIMUS PRIME' && pass === 'AUTOBOTS') {
        sessionStorage.setItem('bujm_auth', 'admin');
        isAdmin = true;
        loginScreen.style.display = 'none';
        mainApp.classList.remove('hidden');
        const btnManage = document.getElementById('btn-manage-users');
        if (btnManage) btnManage.style.display = '';
        // Update topbar name
        const nameEl = document.querySelector('.user-info .name');
        if (nameEl) nameEl.textContent = 'Optimus Prime';
        const roleEl = document.querySelector('.user-info .role');
        if (roleEl) roleEl.textContent = 'Admin Access';
    } else {
        loginErrorMsg.style.display = 'block';
    }
}

// ---- Phone Login (Check Firebase) ----
const btnLoginPhone = document.getElementById('btn-login-phone');
const loginPhoneInput = document.getElementById('login-phone');
const loginPhoneError = document.getElementById('login-phone-error');

if (btnLoginPhone) {
    btnLoginPhone.addEventListener('click', handlePhoneLogin);
}
if (loginPhoneInput) {
    loginPhoneInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlePhoneLogin();
    });
    loginPhoneInput.addEventListener('input', () => {
        loginPhoneError.style.display = 'none';
    });
}

function handlePhoneLogin() {
    const raw = loginPhoneInput.value.trim();
    if (!raw || raw.length < 8) {
        loginPhoneError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Masukkan nomor HP yang valid!';
        loginPhoneError.style.display = 'block';
        return;
    }
    
    const normalized = normalizePhone(raw);
    
    // Tampilkan loading
    btnLoginPhone.disabled = true;
    btnLoginPhone.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memeriksa...';
    
    // Cek di Firebase
    // Note: db belum di-init di sini, pakai lazy check
    const checkInterval = setInterval(() => {
        if (typeof db !== 'undefined') {
            clearInterval(checkInterval);
            db.collection('approved_users').doc(normalized).get()
                .then(doc => {
                    if (doc.exists) {
                        const userData = doc.data();
                        sessionStorage.setItem('bujm_auth', 'user');
                        sessionStorage.setItem('bujm_user_name', userData.name || raw);
                        loginScreen.style.display = 'none';
                        mainApp.classList.remove('hidden');
                        // Update topbar
                        const nameEl = document.querySelector('.user-info .name');
                        if (nameEl) nameEl.textContent = userData.name || raw;
                        const roleEl = document.querySelector('.user-info .role');
                        if (roleEl) roleEl.textContent = 'User Access';
                    } else {
                        loginPhoneError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Nomor HP belum terdaftar! Silakan minta akses.';
                        loginPhoneError.style.display = 'block';
                        loginPhoneInput.classList.add('shake');
                        setTimeout(() => loginPhoneInput.classList.remove('shake'), 500);
                    }
                })
                .catch(err => {
                    console.error('Firebase check error:', err);
                    loginPhoneError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Gagal terhubung ke server. Coba lagi.';
                    loginPhoneError.style.display = 'block';
                })
                .finally(() => {
                    btnLoginPhone.disabled = false;
                    btnLoginPhone.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> MASUK';
                });
        }
    }, 200);
    
    // Timeout safety (jika db belum init dalam 5 detik)
    setTimeout(() => {
        clearInterval(checkInterval);
        btnLoginPhone.disabled = false;
        btnLoginPhone.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> MASUK';
    }, 5000);
}

// ---- "Minta Akses via WhatsApp" di halaman Login ----
const btnLoginRequestWa = document.getElementById('btn-login-request-wa');
if (btnLoginRequestWa) {
    btnLoginRequestWa.addEventListener('click', () => {
        const phoneVal = loginPhoneInput ? loginPhoneInput.value.trim() : '';
        const nama = prompt("Masukkan nama Anda:");
        if (!nama || nama.trim() === '') return;
        
        let phoneTxt = phoneVal ? `\nNomor HP saya: *${phoneVal}*` : '';
        const pesan = `🔑 *REQUEST AKSES DASHBOARD BUJM*\n\nHalo Ndan,\nSaya *${nama.trim()}* ingin meminta izin akses ke *Dashboard BUJM Commander*.${phoneTxt}\n\nMohon didaftarkan ya Ndan. Terima kasih! 🙏`;
        
        const waNumber = '6285249946694';
        const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(pesan)}`;
        window.open(url, '_blank');
    });
}


// UI Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const dropZoneProd = document.getElementById('drop-zone-prod');
const fileInputProd = document.getElementById('file-input-prod');
const loadingOverlay = document.getElementById('loading-overlay');
const dashboardContent = document.getElementById('dashboard-content');
const emptyState = document.getElementById('empty-state');

// Business Logic Configuration (From Optimus Prime's Knowledge Base)
const MODELS = {
    VD: ['QA', 'UA', 'LA', 'LH', 'HW', 'LS', 'SP', 'PS'],
    DA: ['WW', 'WD', 'WA', 'WT', 'DV', 'VC', 'RS', 'RT', 'AR', 'AM', 'MS', 'MG', 'WF', 'RF']
    // MX is defaults to "SM-", "GT-", "EP-" (Accessories) or anything else not in VD/DA
};

const EXPENSIVE_PARTS = {
    MX: ["PBA", "OCTA", "OLED", "FRONT METAL", "CH SET", "CRADLE"],
    VD: ["PCB MAIN", "PANEL", "LCD", "OPEN CELL", "LED BAR", "PCB ONE CONNECT"],
    DA: ["COMP", "MOTOR BLDC", "PCB MAIN", "PCB KIT", "PCB INVERTER"]
};

const SEIN_REASONS = [
    "Parts Back Ordered (Samsung)",
    "Parts In Transit (Samsung)",
    "Parts not available (ASC)",
    "Parts DNA/SNA (ASC)",
    "Parts P/O Cancellation",
    "Parts Allocated(Samsung)"
];

const AGING_REASONS = [
    "Monitoring/Aging or Not reproduced",
    "Re-scheduling by Eng'r or ASC",
    "Re-scheduling by Customer",
    "Waiting for confirmation from customer",
    "Repair In Progress After Parts Receive",
    "Waiting for confirmation from SAMSUNG",
    "Processing exchange",
    "Parts Arrived but no G/R yet(ASC)",
    "Request Tech support (Technical problem)"
];

// Shorten ASC Name
function shortenASC(ascName) {
    if (!ascName) return 'Unknown ASC';
    const name = String(ascName).toUpperCase();
    if (name.includes('CELLULAR WORLD')) return 'DCW';
    if (name.includes('MAHENDRADATA')) return 'DPS';
    if (name.includes('PLANET GADGET')) return 'DPG';
    if (name.includes('KUPANG')) return 'KPG';
    if (name.includes('SINGARAJA')) return 'SGJ';
    return ascName; // Default
}

// Determine product category based on model prefix
function getCategory(model) {
    if (!model) return 'UNKNOWN';
    const m = String(model).toUpperCase();
    
    // 1. Strict Hardcoded Rules (Highest Priority to prevent custom rule false-positives)
    const mxPrefixes = ['SM-', 'GT-', 'EP-', 'SG', 'SPH-', 'SGH-', 'EK-', 'EJ-', 'EB-', 'EE-', 'EO-', 'ET-'];
    if (mxPrefixes.some(prefix => m.startsWith(prefix))) return 'MX';
    
    const vdPrefixes = ['QA', 'UA', 'VG', 'SP', 'QN', 'LS'];
    if (vdPrefixes.some(prefix => m.startsWith(prefix))) return 'VD';
    
    const daPrefixes = ['WA', 'WW', 'RT', 'RS', 'RF', 'DV', 'DF', 'AX', 'AR', 'AC'];
    if (daPrefixes.some(prefix => m.startsWith(prefix))) return 'DA';
    
    // 2. Check Custom Model Rules Next
    for (let i = 0; i < customModels.length; i++) {
        if (m.includes(customModels[i].keyword)) return customModels[i].category;
    }
    
    return 'UNKNOWN';
}

// Check if a part string matches any expensive part keywords
function isExpensivePart(partDesc, category) {
    if (!partDesc) return false;
    const desc = String(partDesc).toUpperCase();
    
    // Exception: "SUB PBA" contains "PBA" but is not considered expensive.
    // We sanitize it by replacing it with a placeholder before checking.
    let sanitizedDesc = desc;
    if (category === 'MX') {
        sanitizedDesc = sanitizedDesc.replace(/SUB PBA/g, 'SUB_BOARD');
        sanitizedDesc = sanitizedDesc.replace(/TAPE[_ ]OCTA/g, 'TAPE_IGNORED');
        sanitizedDesc = sanitizedDesc.replace(/KIT[_ ]OLED/g, 'KIT_IGNORED');
    }
    
    const keywords = EXPENSIVE_PARTS[category] || [];
    return keywords.some(kw => sanitizedDesc.includes(kw));
}

// Event Listeners for File Upload
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
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFiles(e.target.files);
    }
});

// Event Listeners for Productivity File Upload
dropZoneProd.addEventListener('click', () => fileInputProd.click());
dropZoneProd.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneProd.classList.add('dragover'); });
dropZoneProd.addEventListener('dragleave', () => dropZoneProd.classList.remove('dragover'));
dropZoneProd.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZoneProd.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleProdFiles(e.dataTransfer.files);
});
fileInputProd.addEventListener('change', (e) => {
    if (e.target.files.length) handleProdFiles(e.target.files);
});

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
// Event Listener for Blast Wall of Shame (Auto send WA to all)
const btnBlastShame = document.getElementById('btnBlastShame');
if (btnBlastShame) {
    btnBlastShame.addEventListener('click', () => {
        if (!window.shameData || window.shameData.length === 0) {
            showToastNotification('Belum ada data Wall of Shame atau daftar kosong!');
            return;
        }

        // Filter teknisi yang punya nomor HP
        const blastQueue = window.shameData.filter(item => !!techContacts[item.engineer]);
        
        if (blastQueue.length === 0) {
            showToastNotification('Tidak ada teknisi di Wall of Shame yang memiliki nomor WA di database kontak!');
            return;
        }

        showToastNotification(`Memulai WA Blast ke ${blastQueue.length} teknisi... Pastikan POPUP BLOCKER diizinkan (Allow Popups) untuk situs ini!`);
        
        let index = 0;
        const blastInterval = setInterval(() => {
            if (index >= blastQueue.length) {
                clearInterval(blastInterval);
                showToastNotification('WA Blast Selesai! Semua pesan peringatan sudah diantrekan.');
                return;
            }
            
            const item = blastQueue[index];
            // Call existing sendWA function
            if (typeof sendWA === 'function') {
                sendWA(item.engineer.replace(/'/g, "\\'"), item.asc, item.count, item.detail);
            }
            index++;
        }, 17000); // 17 seconds delay
    });
}

// Event Listener for Blast Pending Delivery (Auto send WA to all PICs)
const btnBlastRC = document.getElementById('btnBlastRC');
if (btnBlastRC) {
    btnBlastRC.addEventListener('click', () => {
        if (!window.rcData || Object.keys(window.rcData).length === 0) {
            showToastNotification('Belum ada data Pending Delivery atau daftar kosong!');
            return;
        }

        // Filter branches that actually have PIC/Kacab phone numbers
        const blastQueue = Object.keys(window.rcData)
            .filter(asc => !!techContacts[`PIC ${asc}`] || !!techContacts[`Kacab ${asc}`])
            .map(asc => ({ asc, count: window.rcData[asc].count }))
            .sort((a, b) => b.count - a.count);
        
        if (blastQueue.length === 0) {
            showToastNotification('Tidak ada PIC cabang di daftar Pending Delivery yang memiliki nomor WA di database kontak!');
            return;
        }

        showToastNotification(`Memulai WA Blast ke ${blastQueue.length} cabang... Pastikan POPUP BLOCKER diizinkan (Allow Popups)!`);
        
        let index = 0;
        const blastInterval = setInterval(() => {
            if (index >= blastQueue.length) {
                clearInterval(blastInterval);
                showToastNotification('WA Blast RC Selesai! Semua pesan peringatan sudah diantrekan.');
                return;
            }
            
            const item = blastQueue[index];
            if (typeof window.sendWARC === 'function') {
                window.sendWARC(item.asc, item.count);
            }
            index++;
        }, 17000); // 17 seconds delay
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
        
        let text = `*REPORT PELANGGARAN MPU (Multiple Part Usage)*\nDitemukan penggunaan lebih dari 1 part utama/mahal bill IW:\n`;
        
        window.mpuData.forEach((item, idx) => {
            text += `${idx+1}. Job No: ${item.jobNo} (${item.asc})\n   Teknisi: ${item.engineer}\n   Model: ${item.model}\n   Parts: ${item.parts}\n`;
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
        
        let text = `*REPORT PELANGGARAN UB REPAIR (FOLD/FLIP)*\nLarangan Keras! Ditemukan penggantian OCTA pada unit Fold/Flip IW:\n`;
        
        window.ubData.forEach((item, idx) => {
            text += `${idx+1}. Job No: ${item.jobNo} (${item.asc})\n   Teknisi: ${item.engineer}\n   Model: ${item.model}\n   Parts: ${item.parts}\n`;
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
function handleFiles(fileList) {
    loadingOverlay.classList.remove('hidden');
    let promises = [];
    
    for (let i = 0; i < fileList.length; i++) {
        let file = fileList[i];
        let fileName = file.name.toUpperCase();
        
        let promise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                resolve({ fileName: fileName, data: json });
            };
            reader.readAsArrayBuffer(file);
        });
        promises.push(promise);
    }
    
    Promise.all(promises).then((results) => {
        let baseData = [];
        let statusData = [];
        
        results.forEach(result => {
            if (result.fileName.includes('STATUS')) {
                statusData = statusData.concat(result.data);
            } else {
                baseData = baseData.concat(result.data);
            }
        });
        
        // Auto-VLOOKUP (Dictionary Map)
        if (statusData.length > 0) {
            let customerMap = {};
            statusData.forEach(row => {
                let trackingNo = row['Tracking No'];
                let customerName = row['Customer Name'];
                if (trackingNo && customerName) {
                    customerMap[trackingNo] = customerName;
                }
            });
            
            baseData.forEach(row => {
                let soNo = row['Service Order No.'];
                if (soNo && customerMap[soNo]) {
                    row['Customer Name'] = customerMap[soNo];
                }
            });
        }
        
        if (baseData.length === 0) {
            loadingOverlay.classList.add('hidden');
            showToastNotification('Data tidak terdeteksi! Jika Anda menggunakan file .xls dari sistem, buka file tersebut di Excel dan lakukan "Save As" ke format .xlsx terlebih dahulu.');
            return;
        }
        
        analyzeData(baseData);
    });
}

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
function handleProdFiles(fileList) {
    loadingOverlay.classList.remove('hidden');
    let promises = [];
    
    for (let i = 0; i < fileList.length; i++) {
        let file = fileList[i];
        let promise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                // Read as 2D array to skip merged headers
                const rawData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                resolve(rawData);
            };
            reader.readAsArrayBuffer(file);
        });
        promises.push(promise);
    }
    
    Promise.all(promises).then((results) => {
        let mergedData = [];
        results.forEach(rawData => {
            mergedData = mergedData.concat(rawData);
        });
        
        if (mergedData.length === 0) {
            loadingOverlay.classList.add('hidden');
            showToastNotification('Data kosong! Harap pastikan file .xls di-Save As menjadi .xlsx terlebih dahulu.');
            return;
        }
        
        analyzeProductivity(mergedData);
    });
}

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
function analyzeProductivity(data) {
    let prodStats = {};
    let uniqueWorkingDays = new Set();
    // Loop start at 2 to skip headers
    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0 || !row[0]) continue; // Skip empty rows
        
        const gdDate = row[4];
        if (!gdDate) continue; // Only process Good Delivered units
        
        uniqueWorkingDays.add(gdDate); // Track unique working days
        
        const branch = shortenASC(row[5]);
        let engName = row[7] ? row[7].toString().trim().toUpperCase() : null;
        if (!engName) continue;
        
        // Col 10 = Labor IW, Col 16 = Labor OOW
        const laborIWStr = row[10] || "0";
        const laborOOWStr = row[16] || "0";
        
        const laborIW = parseFloat(laborIWStr.toString().replace(/,/g, '')) || 0;
        const laborOOW = parseFloat(laborOOWStr.toString().replace(/,/g, '')) || 0;
        
        // --- DTS MX Logic (GD) ---
        if (window.dtsMxData && window.dtsMxData[engName] && isDateToday(gdDate)) {
            window.dtsMxData[engName].gd++;
        }
        // --- END DTS MX Logic ---
        
        // --- DTS IH Logic (GD) ---
        if (window.dtsIhData && window.dtsIhData[engName] && isDateToday(gdDate)) {
            let prodJobNo = null;
            for (let j = 0; j < 5; j++) {
                if (row[j] && row[j].toString().startsWith('4') && row[j].toString().length === 10) {
                    prodJobNo = row[j].toString();
                    break;
                }
            }
            
            if (!prodJobNo || !window.dtsIhData[engName]._visitedJobs.has(prodJobNo)) {
                window.dtsIhData[engName].gdVisits++;
                window.dtsIhData[engName].totalVisits++;
                if (prodJobNo) {
                    window.dtsIhData[engName]._visitedJobs.add(prodJobNo);
                }
            }
        }
        // --- END DTS IH Logic ---
        
        if (!prodStats[engName]) {
            prodStats[engName] = { asc: branch, gdCount: 0, gdRepair: 0, gdCancel: 0, laborIW: 0, laborOOW: 0 };
        }
        
        prodStats[engName].gdCount++;
        prodStats[engName].laborIW += laborIW;
        prodStats[engName].laborOOW += laborOOW;
        
        // Categorize GD based on Nominal
        if (laborIW > 0) {
            prodStats[engName].gdRepair++;
        } else if (laborOOW > 0 && laborOOW < 100000) {
            prodStats[engName].gdCancel++;
        } else {
            // Covers laborOOW >= 100000 AND the edge case where both are 0
            prodStats[engName].gdRepair++;
        }
    }
    
    let workingDaysCount = Math.max(1, uniqueWorkingDays.size);
    
    let fameList = Object.keys(prodStats).map(eng => {
        let branchName = (window.engToBranchMap && window.engToBranchMap[eng]) ? window.engToBranchMap[eng] : (prodStats[eng].asc || '-');
        let avgGd = (prodStats[eng].gdCount / workingDaysCount).toFixed(1);
        return { engineer: eng, resolvedBranch: branchName, avgGd: avgGd, ...prodStats[eng] };
    });
    
    // Sort by Branch (A-Z) then by Total GD Count (Desc)
    fameList.sort((a, b) => {
        let cmp = a.resolvedBranch.localeCompare(b.resolvedBranch);
        if (cmp !== 0) return cmp;
        return b.gdCount - a.gdCount;
    });
    
    window.prodData = prodStats; // Expose for modal
    
    renderFameTable(fameList);
}

function renderFameTable(fameList) {
    const tbodyFame = document.querySelector('#fame-table tbody');
    tbodyFame.innerHTML = '';
    
    if (fameList.length === 0) {
        tbodyFame.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">No Good Delivered data found!</td></tr>`;
    } else {
        fameList.forEach(item => {
            let gdCountText = item.gdCount > 0 ? `${item.gdCount} units` : '';
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
function analyzeData(data) {
    console.log("Data loaded:", data.length, "rows");
    
    let stats = {
        total: data.length,
        ltp: 0,
        exLtp: 0,
        mpuViolations: 0,
        x09Violations: 0,
        ubViolations: 0,
        breakdownLtp: { MX: 0, VD: 0, DA: 0 },
        breakdownExLtp: { MX: 0, VD: 0, DA: 0 },
        totalCat: { MX: 0, VD: 0, DA: 0 },
        responsibility: { AGING: 0, SEIN: 0, OTHER: 0 }
    };
    
    let mpuList = [];
    let x09List = [];
    let ubList = [];
    let dosaCabangOver7 = [];
    let unknownModels = new Set();
    let unknownReasons = new Set();
    
    let branchStats = {};
    let engineerStats = {};
    let rcStats = {}; // Tracking Repair Completed
    window.dtsMxData = {}; // Global for DTS MX
    window.dtsIhData = {}; // Global for DTS IH

    // Prepare Custom Reason Keywords
    const customSeinKws = customReasons.filter(r => r.category === 'SEIN').map(r => r.keyword);
    const customAgingKws = customReasons.filter(r => r.category === 'AGING').map(r => r.keyword);

    // Helper for reason matching (Exact Match for reasons)
    const isReasonMatched = (reasonStr, predefinedList, customKeywords) => {
        if (!reasonStr) return false;
        if (predefinedList.includes(reasonStr)) return true;
        const rUpper = String(reasonStr).toUpperCase();
        for (let kw of customKeywords) {
            if (rUpper === kw) return true; // EXACT MATCH
        }
        return false;
    };

    data.forEach(row => {
        const model = row['Model'];
        let category = getCategory(model);
        
        if (category === 'UNKNOWN') {
            if (model) unknownModels.add(model);
            category = 'MX'; // Fallback so it doesn't break calculations
        }
        
        let warranty = row['In Out Warranty Flag'] || '';
        if (typeof warranty === 'string') warranty = warranty.trim().toUpperCase();
        
        // Samsung's In-Warranty flags can be IW, LP, or L
        const isIW = (warranty === 'IW' || warranty === 'LP' || warranty === 'L');

        // Hanya hitung denominator persentase KPI jika unit tersebut IW
        if (isIW) {
            stats.totalCat[category]++;
        }
        
        const status = row['Status'] || '';
        const reason = row['Reason'] || '';
        const agingDaysStr = row['Pending aging Days'];
        let agingDays = agingDaysStr ? parseInt(agingDaysStr) : 0;
        
        // --- KALKULASI ULANG UMUR UNTUK REPAIR COMPLETED ---
        if (status === 'Repair Completed' || status.includes('Completed')) {
            const reqDateVal = row['Request Date'];
            const rcDateVal = row['Repair Completed']; // Sesuai kolom AD
            if (reqDateVal && rcDateVal) {
                let reqDateObj = parseExcelDate(reqDateVal);
                let rcDateObj = parseExcelDate(rcDateVal);
                if (reqDateObj && rcDateObj && !isNaN(reqDateObj.getTime()) && !isNaN(rcDateObj.getTime())) {
                    const reqMidnight = new Date(reqDateObj.getFullYear(), reqDateObj.getMonth(), reqDateObj.getDate());
                    const rcMidnight = new Date(rcDateObj.getFullYear(), rcDateObj.getMonth(), rcDateObj.getDate());
                    const diffTime = rcMidnight.getTime() - reqMidnight.getTime();
                    agingDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                }
            }
        }
        
        // Shorten ASC Name here
        let ascName = shortenASC(row['ASC Name']);

        
        const jobNo = row['ASC Job No'] || row['Service Order No.'] || 'N/A';
        const repairCode = row['Repair Code'] || '';
        let engineer = row['Engineer Name'] ? row['Engineer Name'].toString().trim().toUpperCase() : 'UNKNOWN ENGINEER';
        // --- MANUAL OVERRIDE TECHNICIANS ---
        if (engineer === 'MOHHAMAT BAGAS DWI PRAYOGO') {
            ascName = 'DPG';
        } else if (engineer === 'SATRIA EKA ADITA' || engineer === 'SANI LASARO') {
            ascName = 'DCW';
        }
        
        // Build global Engineer to Branch Map for Wall of Fame sync
        if (engineer !== 'UNKNOWN ENGINEER' && ascName) {
            if (!window.engToBranchMap) window.engToBranchMap = {};
            window.engToBranchMap[engineer] = ascName;
        }
        
        // --- Kacab Responsibility Override ---
        if (status.includes('Assigned to Service Center') || status.includes('Acknowledge')) {
            engineer = `PIC ${ascName}`;
        } else if (reason && (reason.trim().toUpperCase() === 'WAITING FOR CONFIRMATION FROM SAMSUNG' || reason.trim().toUpperCase() === 'PROCESSING EXCHANGE')) {
            engineer = `PIC ${ascName}`;
        }

        // Initialize Branch and Engineer in their respective objects
        if (!branchStats[ascName]) {
            branchStats[ascName] = { 
                total: 0, ltp: 0, exLtp: 0, mpu: 0, x09: 0, ub: 0,
                bills: { total: [], ltp: [], exLtp: [], mpu: [], x09: [], ub: [] }
            };
        }
        
        // Cek nama customer dengan pelacakan pintar (Fuzzy Search) yang lebih tahan banting
        let customerName = 'Unknown Customer';
        
        // Coba cari dengan pencocokan persis tapi abaikan spasi berlebih
        for (let key in row) {
            let k = key.toLowerCase().trim();
            if (k === 'customer name' || k === 'nama konsumen' || k === 'customer' || k === 'cust name' || k === 'cust. name' || k === 'nama pelanggan' || k === 'konsumen' || k === 'unit location' || k === 'customer_name') {
                if (row[key] && row[key].toString().trim() !== '') {
                    customerName = row[key];
                    break;
                }
            }
        }
        
        // Kalau masih belum ketemu, tebak dari kata kunci
        if (customerName === 'Unknown Customer') {
            for (let key in row) {
                let k = key.toLowerCase();
                if ((k.includes('customer') || k.includes('cust') || k.includes('konsumen') || k.includes('nama') || k.includes('pelanggan')) && 
                    !k.includes('asc') && !k.includes('collection') && !k.includes('engineer') && 
                    !k.includes('date') && !k.includes('time') && !k.includes('amount') && 
                    !k.includes('comment') && !k.includes('feedback') && !k.includes('model') && 
                    !k.includes('toko') && !k.includes('cabang') && !k.includes('type') && !k.includes('status')) {
                    if (row[key] && row[key].toString().trim() !== '') {
                        customerName = row[key];
                        break;
                    }
                }
            }
        }
        
        const billInfo = { jobNo, model, customer: customerName, pendingDays: agingDays, reason: reason, category: category, engineer: engineer };
        
        branchStats[ascName].total++;
        branchStats[ascName].bills.total.push(billInfo);
        
        // --- Repair Completed Tracking ---
        if (status === 'Repair Completed' || status.includes('Completed')) {
            // Kita sudah mengkalkulasi agingDays yang akurat di atas
            let rcPendingDays = agingDays;
            
            // Override billInfo for RC specifically
            const rcBillInfo = { ...billInfo, pendingDays: rcPendingDays };
            
            if (!rcStats[ascName]) {
                rcStats[ascName] = { count: 0, bills: [] };
            }
            rcStats[ascName].count++;
            rcStats[ascName].bills.push(rcBillInfo);
        }

        // Only track real engineers
        if (!engineerStats[engineer]) {
            engineerStats[engineer] = { asc: ascName, mxAging: 0, vdAging: 0, daAging: 0, bills: [] };
        }

        // Count all parts used for this row
        let partsUsedCount = 0;
        let expensivePartsFound = [];
        let hasOcta = false;
        let ubPartsFound = [];
        
        for (let i = 1; i <= 10; i++) {
            let descKey = `Parts description ${i.toString().padStart(2, '0')}`;
            let noKey = `Parts No ${i.toString().padStart(2, '0')}`;
            let partDesc = row[descKey];
            let partNo = row[noKey] || partDesc; // Fallback ke deskripsi jika nomor part kosong
            
            if (partDesc) {
                partsUsedCount++;
                if (isExpensivePart(partDesc, category) && !expensivePartsFound.includes(partNo)) {
                    expensivePartsFound.push(partNo);
                }
                if (String(partDesc).toUpperCase().includes('OCTA')) {
                    hasOcta = true;
                    if (!ubPartsFound.includes(partNo)) {
                        ubPartsFound.push(partNo);
                    }
                }
            }
        }

        // 4. X09 Violation Logic (Repair Code X09 but parts are used, AND Status is Repair Completed)
        if (repairCode.includes('X09') && partsUsedCount > 0 && (status === 'Repair Completed' || status.includes('Completed'))) {
            stats.x09Violations++;
            branchStats[ascName].x09++;
            branchStats[ascName].bills.x09.push(billInfo);
            x09List.push({
                jobNo: jobNo,
                asc: ascName,
                engineer: engineer,
                model: model,
                partsCount: partsUsedCount
            });
        }

        // 1. Responsibility Logic (AGING vs SEIN)
        let isAging = false;
        let isSein = false;
        
        // Memasukkan status unassigned (bahaya) ke dalam Dosa Cabang
        if (status === 'Engineer Assigned' || status.includes('Assigned to Service Center') || status.includes('Acknowledge')) {
            isAging = true; // All Engineer Assigned & Unassigned are AGING
            stats.responsibility.AGING++;
        } else if (status === 'Pending' || status === 'Repair Completed' || status.includes('Completed')) {
            if (isReasonMatched(reason, SEIN_REASONS, customSeinKws)) {
                isSein = true;
                stats.responsibility.SEIN++;
            } else if (isReasonMatched(reason, AGING_REASONS, customAgingKws)) {
                isAging = true;
                stats.responsibility.AGING++;
            } else {
                // Jangan masukkan reason RC normal ke dalam daftar Unknown Reasons
                if (status === 'Pending') {
                    if (reason && reason.trim() !== '') unknownReasons.add(reason);
                    stats.responsibility.OTHER++;
                }
            }
        }
        
        if (isAging) {
            engineerStats[engineer].bills.push(billInfo);
            if (category === 'MX') engineerStats[engineer].mxAging++;
            else if (category === 'VD') engineerStats[engineer].vdAging++;
            else if (category === 'DA') engineerStats[engineer].daAging++;
            
            if (agingDays > 7) {
                dosaCabangOver7.push({
                    ...billInfo,
                    asc: ascName
                });
            }
        }

        // --- DTS MX Logic ---
        if (category === 'MX' && !engineer.startsWith('PIC ')) {
            if (!window.dtsMxData[engineer]) {
                window.dtsMxData[engineer] = { volIn: 0, rc: 0, gd: 0, aging: 0, cust: 0, sein: 0, name: engineer, asc: ascName };
            }
            
            const reqDateVal = row['Request Date'];
            if (isDateToday(reqDateVal)) {
                window.dtsMxData[engineer].volIn++;
            }
            
            const rcDateVal = row['Repair Completed'];
            if ((status === 'Repair Completed' || status.includes('Completed')) && isDateToday(rcDateVal)) {
                window.dtsMxData[engineer].rc++;
            }
            
            if (reason === 'Re-scheduling by Customer' || reason === 'Waiting for confirmation from customer') {
                window.dtsMxData[engineer].cust++;
            }
            
            if (isSein) {
                window.dtsMxData[engineer].sein++;
            }
            
            if (isAging) {
                if (reason !== 'Re-scheduling by Customer' && reason !== 'Waiting for confirmation from customer') {
                    window.dtsMxData[engineer].aging++;
                }
            }
        }
        // --- END DTS MX Logic ---

        // --- DTS IH Logic (VD & DA) ---
        if ((category === 'VD' || category === 'DA') && !engineer.startsWith('PIC ')) {
            if (!window.dtsIhData[engineer]) {
                window.dtsIhData[engineer] = { name: engineer, asc: ascName, totalVisits: 0, rcVisits: 0, gdVisits: 0, pendingVisits: 0, totalAging: 0, _visitedJobs: new Set() };
            }
            
            if (isAging) {
                window.dtsIhData[engineer].totalAging++;
            }
            
            let isVisitedToday = false;
            
            // Cek Pending Visits
            let changeDateVal = null;
            for (let key in row) {
                let k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (k === 'changedate') {
                    changeDateVal = row[key];
                    break;
                }
            }
            
            if (isDateToday(changeDateVal)) {
                const upperReason = reason.trim().toUpperCase();
                const pendingReasons = [
                    'PARTS NOT AVAILABLE (ASC)', 'PARTS IN TRANSIT (SAMSUNG)', 'PARTS ALLOCATED(SAMSUNG)', 
                    'PARTS P/O CANCELLATION', 'PARTS DNA/SNA (ASC)', 'PARTS BACK ORDERED (SAMSUNG)',
                    'MONITORING/AGING OR NOT REPRODUCED'
                ];
                if (pendingReasons.includes(upperReason)) {
                    isVisitedToday = true;
                    if (!window.dtsIhData[engineer]._visitedJobs.has(jobNo)) {
                        window.dtsIhData[engineer].pendingVisits++;
                    }
                }
            }
            
            // Cek RC Visits
            const rcDateVal = row['Repair Completed'];
            if ((status === 'Repair Completed' || status.includes('Completed')) && isDateToday(rcDateVal)) {
                isVisitedToday = true;
                if (!window.dtsIhData[engineer]._visitedJobs.has(jobNo)) {
                    window.dtsIhData[engineer].rcVisits++;
                }
            }
            
            // Total Visits Calculation
            if (isVisitedToday) {
                if (!window.dtsIhData[engineer]._visitedJobs.has(jobNo)) {
                    window.dtsIhData[engineer].totalVisits++;
                    window.dtsIhData[engineer]._visitedJobs.add(jobNo);
                }
            }
        }
        // --- END DTS IH Logic ---

        // 2. LTP / Ex-LTP Logic (ONLY for AGING + IW items based on business rules)
        let serviceType = (row['Service Type'] || '').toString().trim().toUpperCase();
        let isValidServiceType = ['CI', 'IH', 'AD', 'PS'].includes(serviceType);
        
        if (isAging && agingDays > 0 && isIW && isValidServiceType) {
            let isLtp = false;
            let isExLtp = false;

            if (category === 'MX') {
                if (agingDays >= 7) isExLtp = true;
                else if (agingDays >= 3) isLtp = true;
            } else if (category === 'VD') {
                if (agingDays >= 14) isExLtp = true;
                else if (agingDays >= 7) isLtp = true;
            } else if (category === 'DA') {
                if (agingDays >= 14) isExLtp = true;
                else if (agingDays >= 5) isLtp = true;
            }

            if (isExLtp) {
                stats.exLtp++;
                stats.breakdownExLtp[category]++;
                branchStats[ascName].exLtp++;
                branchStats[ascName].bills.exLtp.push(billInfo);
            } else if (isLtp) {
                stats.ltp++;
                stats.breakdownLtp[category]++;
                branchStats[ascName].ltp++;
                branchStats[ascName].bills.ltp.push(billInfo);
            }
        }

        // 3. MPU Logic (Only for IW)
        if (isIW) {
            // MPU is defined as MORE THAN 1 unique expensive part
            if (expensivePartsFound.length > 1) {
                stats.mpuViolations++;
                branchStats[ascName].mpu++;
                branchStats[ascName].bills.mpu.push(billInfo);
                mpuList.push({
                    jobNo: jobNo,
                    asc: ascName,
                    model: model,
                    parts: expensivePartsFound.join(" + "),
                    category: category,
                    status: status,
                    engineer: engineer
                });
            }
            
            // 5. UB Repair Logic (SM-F + OCTA + IW)
            if (model && String(model).toUpperCase().startsWith('SM-F') && hasOcta) {
                stats.ubViolations++;
                branchStats[ascName].ub++;
                branchStats[ascName].bills.ub.push(billInfo);
                
                ubList.push({
                    jobNo: jobNo,
                    asc: ascName,
                    model: model,
                    parts: ubPartsFound.join(" + "),
                    status: status,
                    engineer: engineer
                });
            }
        }
    });

    // Determine Wall of Shame (All Engineers with any Dosa Cabang)
    let shameList = [];
    for (let eng in engineerStats) {
        let es = engineerStats[eng];
        let totalDosa = es.mxAging + es.vdAging + es.daAging;
        if (totalDosa > 0) {
            shameList.push({
                engineer: eng,
                asc: es.asc,
                count: totalDosa,
                detail: `MX:${es.mxAging} VD:${es.vdAging} DA:${es.daAging}`
            });
        }
    }
    // Sort shame list A-Z by branch name
    shameList.sort((a, b) => a.asc.localeCompare(b.asc));

    // Sort Dosa Cabang (> 7 Days): Z-A pendingDays, then A-Z branch name (asc)
    dosaCabangOver7.sort((a, b) => {
        if (b.pendingDays !== a.pendingDays) {
            return b.pendingDays - a.pendingDays;
        }
        return a.asc.localeCompare(b.asc);
    });
    window.dosaCabangData = dosaCabangOver7;

    // Group Dosa Cabang Over 7 Days by Branch
    let dosaCabangStats = {};
    dosaCabangOver7.forEach(item => {
        const asc = item.asc;
        if (!dosaCabangStats[asc]) {
            dosaCabangStats[asc] = { count: 0, bills: [] };
        }
        dosaCabangStats[asc].count++;
        dosaCabangStats[asc].bills.push(item);
    });
    window.dosaCabangStatsGlobal = dosaCabangStats;

    // Expose engineer data globally for the modal
    window.engineerData = engineerStats;
    window.rcData = rcStats; // Expose RC data globally for modal too
    window.shameData = shameList; // Expose Shame data globally for sharing
    window.mpuData = mpuList; // Expose MPU data globally for sharing
    window.ubData = ubList; // Expose UB data globally for sharing

    updateUI(stats, mpuList, ubList, branchStats, shameList, rcStats);
    
    // Alert User about Unknown Models
    if (unknownModels.size > 0) {
        showToastNotification(`<strong>Perhatian Bos:</strong> Ada ${unknownModels.size} model tidak dikenali (Cth: ${Array.from(unknownModels).slice(0,3).join(', ')}).<br>Silakan tambah di <b>Rules Config</b>!`);
    }

    // Alert User about Unknown Reasons
    if (unknownReasons.size > 0) {
        setTimeout(() => {
            showToastNotification(`<strong>⚠️ Reason Misterius Terdeteksi!</strong><br>Ada ${unknownReasons.size} alasan asing (Cth: ${Array.from(unknownReasons).slice(0,3).join(', ')}).<br>Klik <b>Rules Config</b> untuk mendaftarkannya!`);
        }, 4000); // Delay so it doesn't overlap immediately
    }
}

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

    if (document.getElementById('val-total-so')) document.getElementById('val-total-so').innerText = stats.total;
    if (document.getElementById('val-total-ltp')) document.getElementById('val-total-ltp').innerText = stats.ltp;
    if (document.getElementById('val-total-exltp')) document.getElementById('val-total-exltp').innerText = stats.exLtp;
    if (document.getElementById('val-total-mpu')) document.getElementById('val-total-mpu').innerText = stats.mpuViolations;
    if (document.getElementById('val-total-ub')) document.getElementById('val-total-ub').innerText = stats.ubViolations;
    if (document.getElementById('val-total-x09')) document.getElementById('val-total-x09').innerText = stats.x09Violations;

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

    respChartInstance = new Chart(ctxResp, {
        type: 'doughnut',
        data: {
            labels: ['AGING (Branch Fault)', 'SEIN (Samsung Fault)', 'OTHER'],
            datasets: [{
                data: [stats.responsibility.AGING, stats.responsibility.SEIN, stats.responsibility.OTHER],
                backgroundColor: [
                    '#ef4444', // Red for Branch Fault
                    '#10b981', // Green for Samsung Fault (safe for branch)
                    '#3b82f6'
                ],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // Render MPU Table
    const tbodyMpu = document.querySelector('#mpu-table tbody');
    if (tbodyMpu) {
        tbodyMpu.innerHTML = '';
        if (mpuList.length === 0) {
            tbodyMpu.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">No MPU Violations Detected!</td></tr>`;
        } else {
            mpuList.forEach(item => {
                const tr = document.createElement('tr');
                const isRC = item.status && (item.status.includes('Completed') || item.status === 'Repair Completed');
                const jobColor = isRC ? 'var(--accent-red)' : 'var(--text-main)';
                const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">⚠️ TELANJUR RC</span>' : '';
                
                tr.innerHTML = `
                    <td><strong style="color:${jobColor};">${item.jobNo}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${item.asc})</span>${warningTag}</td>
                    <td>${item.model}</td>
                    <td style="color:var(--accent-orange); font-size:0.85rem;">${item.parts}</td>
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
            tbodyUb.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">Aman! Tidak ada pelanggaran UB Repair.</td></tr>`;
        } else {
            ubList.forEach(item => {
                const tr = document.createElement('tr');
                const isRC = item.status && (item.status.includes('Completed') || item.status === 'Repair Completed');
                const jobColor = isRC ? 'var(--accent-red)' : 'var(--text-main)';
                const warningTag = isRC ? '<br><span style="background:var(--accent-red); color:white; padding:2px 4px; border-radius:3px; font-size:0.6rem; font-weight:bold;">⚠️ TELANJUR RC</span>' : '';

                tr.innerHTML = `
                    <td><strong style="color:${jobColor};">${item.jobNo}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${item.asc})</span>${warningTag}</td>
                    <td><span style="color:var(--accent-orange); font-weight:bold;">${item.model}</span></td>
                    <td style="color:var(--accent-red); font-weight:bold; font-size:0.85rem;">${item.parts}</td>
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
            // Sort Z-A by max pending days of the branch, then A-Z by branch name
            const sortedDosaBranches = branches.sort((a, b) => {
                const maxA = Math.max(...statsMap[a].bills.map(x => x.pendingDays));
                const maxB = Math.max(...statsMap[b].bills.map(x => x.pendingDays));
                if (maxB !== maxA) return maxB - maxA;
                return a.localeCompare(b);
            });
            
            sortedDosaBranches.forEach(asc => {
                const dc = statsMap[asc];
                const hasPhone = !!techContacts[`PIC ${asc}`] || !!techContacts[`Kacab ${asc}`];
                const waColor = hasPhone ? '#25D366' : 'var(--text-muted)';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${asc}</strong>
                        <button onclick="sendWADosaSingleBranch('${asc}')" style="background: none; border: none; color: ${waColor}; font-size: 1rem; cursor: pointer; margin-left: 10px;" title="Kirim Peringatan WA ke PIC Dosa Cabang"><i class="fa-brands fa-whatsapp"></i></button>
                    </td>
                    <td><span class="clickable-number" style="color:var(--accent-red); font-weight: 700;" onclick="openDosaModal('${asc}')">${dc.count} units</span></td>
                `;
                tbodyDosa.appendChild(tr);
            });
        }
    }

    // Render Wall of Shame Table
    const tbodyShame = document.querySelector('#shame-table tbody');
    tbodyShame.innerHTML = '';
    
    if (shameList.length === 0) {
        tbodyShame.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">No bad engineers found! Great job!</td></tr>`;
    } else {
        shameList.forEach(item => {
            const hasPhone = !!techContacts[item.engineer];
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
                <td style="text-align:center;"><span class="clickable-number" style="color:var(--accent-red); font-size:1rem; font-weight: 700;" onclick="openEngModal('${item.engineer.replace(/'/g, "\\'")}')">${item.count} units</span></td>
            `;
            tbodyShame.appendChild(tr);
        });
    }

    // Render Repair Completed (Pending Delivery) Table
    const tbodyRC = document.querySelector('#rc-table tbody');
    if (tbodyRC) {
        tbodyRC.innerHTML = '';
        
        if (!rcStats || Object.keys(rcStats).length === 0) {
            tbodyRC.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:20px; color:var(--text-muted);">Tumben, tidak ada unit ngendap!</td></tr>`;
        } else {
            const sortedRCBranches = Object.keys(rcStats).sort((a, b) => rcStats[b].count - rcStats[a].count);
            sortedRCBranches.forEach(asc => {
                const rc = rcStats[asc];
                const hasPhone = !!techContacts[`PIC ${asc}`] || !!techContacts[`Kacab ${asc}`];
                const waColor = hasPhone ? '#25D366' : 'var(--text-muted)';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${asc}</strong>
                        <button onclick="sendWARC('${asc}', ${rc.count})" style="background: none; border: none; color: ${waColor}; font-size: 1rem; cursor: pointer; margin-left: 10px;" title="Kirim Peringatan WA ke PIC"><i class="fa-brands fa-whatsapp"></i></button>
                    </td>
                    <td><span class="clickable-number" style="color:var(--accent-orange); font-weight: 700;" onclick="openRCModal('${asc}')">${rc.count} units</span></td>
                `;
                tbodyRC.appendChild(tr);
            });
        }
    }

    // Modal Variables & Functions
    window.branchData = branchStats; // Expose globally for click handlers
    
    // Render Branch Breakdown Table
    const tbodyBranch = document.querySelector('#branch-table tbody');
    tbodyBranch.innerHTML = '';
    
    // Sort branches by total S/O descending
    const sortedBranches = Object.keys(branchStats).sort((a, b) => branchStats[b].total - branchStats[a].total);

    sortedBranches.forEach(branch => {

        const bs = branchStats[branch];
        const tr = document.createElement('tr');
        
        // Helper to generate clickable cell
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
        `;

        tbodyBranch.appendChild(tr);
    });

    renderDtsMxTable();
    renderDtsIhTable();

    // Switch views
    setTimeout(() => {
        const loadingOverlay = document.getElementById('loading-overlay');
        const emptyState = document.getElementById('empty-state');
        const dashboardContent = document.getElementById('dashboard-content');
        if(loadingOverlay) loadingOverlay.classList.add('hidden');
        if(emptyState) emptyState.classList.add('hidden');
        if(dashboardContent) dashboardContent.classList.remove('hidden');
    }, 500);
} // End of updateUI

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
                    <td style="text-align:center; font-weight:600; ${visitsStyling}">${vTotal}</td>
                    <td style="text-align:center; font-weight:600; ${rcStyling}">${vRC}</td>
                    <td style="text-align:center; font-weight:600; ${gdStyling}">${vGD}</td>
                    <td style="text-align:center; font-weight:600; ${pendingStyling}">${vPending}</td>
                    <td style="text-align:center; font-weight:600; ${agingStyling}">${agingCell}</td>
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
                    <td style="text-align:center; font-weight:600;">${vVolIn}</td>
                    <td style="text-align:center; font-weight:600;">${vRC}</td>
                    <td style="text-align:center; font-weight:600; ${gdColor}">${vGD}</td>
                    <td style="text-align:center; font-weight:600; ${agingColor}">${agingCell}</td>
                    <td style="text-align:center; font-weight:600; ${custColor}">${vCust}</td>
                    <td style="text-align:center; font-weight:600; ${seinColor}">${vSein}</td>
                `;
                tbodyDtsMx.appendChild(tr);
            });
        }
    }
}

// ============================================
// Rules Configuration Logic
// ============================================
const defaultCustomModels = [
    {keyword: 'SM-', category: 'MX'},
    {keyword: 'QA', category: 'VD'},
    {keyword: 'UA', category: 'VD'},
    {keyword: 'VG', category: 'VD'},
    {keyword: 'SP', category: 'VD'}
];

const defaultCustomReasons = [
    {keyword: 'MONITORING/AGING OR NOT REPRODUCED', category: 'AGING'},
    {keyword: 'RE-SCHEDULING BY ENG\'R OR ASC', category: 'AGING'},
    {keyword: 'RE-SCHEDULING BY CUSTOMER', category: 'AGING'},
    {keyword: 'WAITING FOR CONFIRMATION FROM CUSTOMER', category: 'AGING'},
    {keyword: 'REPAIR IN PROGRESS AFTER PARTS RECEIVE', category: 'AGING'},
    {keyword: 'WAITING FOR CONFIRMATION FROM SAMSUNG', category: 'AGING'},
    {keyword: 'PARTS ARRIVED BUT NO G/R YET(ASC)', category: 'AGING'},
    {keyword: 'REQUEST TECH SUPPORT (TECHNICAL PROBLEM)', category: 'AGING'},
    {keyword: 'PARTS BACK ORDERED (SAMSUNG)', category: 'SEIN'},
    {keyword: 'PARTS IN TRANSIT (SAMSUNG)', category: 'SEIN'},
    {keyword: 'PARTS NOT AVAILABLE (ASC)', category: 'SEIN'},
    {keyword: 'PARTS DNA/SNA (ASC)', category: 'SEIN'},
    {keyword: 'PARTS P/O CANCELLATION', category: 'SEIN'},
    {keyword: 'PARTS ALLOCATED(SAMSUNG)', category: 'SEIN'},
    {keyword: 'PROCESSING EXCHANGE', category: 'SEIN'}
];

// Firebase Initialization
const firebaseConfig = {
  projectId: "management-bujm-dashboard",
  appId: "1:686973979324:web:312ee50bb607be47621eb9",
  storageBucket: "management-bujm-dashboard.firebasestorage.app",
  apiKey: "AIzaSyDLKSMnHgiRE0v1KMW7S2iOOL4MjZ272pg",
  authDomain: "management-bujm-dashboard.firebaseapp.com",
  messagingSenderId: "686973979324"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let customModels = [];
let customReasons = [];

// Sync Rules with Cloud
db.collection('config').doc('rules').onSnapshot((doc) => {
    if (doc.exists) {
        const data = doc.data();
        customModels = data.models || [];
        customReasons = data.reasons || [];
        if (typeof renderCustomRules === 'function') renderCustomRules();
    } else {
        // Seed default if not exists
        db.collection('config').doc('rules').set({
            models: defaultCustomModels,
            reasons: defaultCustomReasons
        }).catch(err => {
            console.error("Firestore seed error:", err);
            // Display friendly warning if database is not created yet
            showToastNotification(`<strong>Peringatan Cloud Sync:</strong><br>Database Firestore belum siap! Data rules saat ini hanya disimpan sementara. Hubungi Admin (Optimus Prime) untuk Create Database.`);
        });
        customModels = defaultCustomModels;
        customReasons = defaultCustomReasons;
        if (typeof renderCustomRules === 'function') renderCustomRules();
    }
}, (error) => {
    console.error("Firestore Listen Error:", error);
    showToastNotification(`<strong>Koneksi Cloud Terputus:</strong><br>Gagal mengambil rules tersinkronisasi. Pastikan Database Firestore sudah di-Create di Console.`);
});

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

// Real-time listener for approved_users (delayed until db ready)
function initUserListener() {
    if (typeof db === 'undefined') return;
    db.collection('approved_users').onSnapshot((snapshot) => {
        approvedUsersCache = [];
        snapshot.forEach(doc => {
            approvedUsersCache.push({ id: doc.id, ...doc.data() });
        });
        renderApprovedUsers();
    }, (err) => {
        console.error('Error listening approved_users:', err);
    });
}
// Try init immediately, retry if db not ready
if (typeof db !== 'undefined') {
    initUserListener();
} else {
    const waitDbUsers = setInterval(() => {
        if (typeof db !== 'undefined') {
            clearInterval(waitDbUsers);
            initUserListener();
        }
    }, 500);
    setTimeout(() => clearInterval(waitDbUsers), 10000);
}

function renderApprovedUsers() {
    if (!approvedUsersList) return;
    approvedUsersList.innerHTML = '';
    
    if (approvedUsersCache.length === 0) {
        approvedUsersList.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:20px;">Belum ada user terdaftar</td></tr>`;
        return;
    }
    
    approvedUsersCache.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    approvedUsersCache.forEach(user => {
        const tr = document.createElement('tr');
        let displayPhone = user.id;
        if (displayPhone.startsWith('62')) displayPhone = '0' + displayPhone.substring(2);
        
        tr.innerHTML = `
            <td><strong>${user.name || '-'}</strong></td>
            <td style="font-family: monospace; letter-spacing: 1px;">${displayPhone}</td>
            <td style="text-align:center;">
                <button onclick="removeApprovedUser('${user.id}')" style="background: none; border: none; color: var(--accent-red); cursor: pointer; font-size: 1rem;" title="Hapus akses">
                    <i class="fa-solid fa-user-xmark"></i>
                </button>
            </td>
        `;
        approvedUsersList.appendChild(tr);
    });
}

if (btnAddUser) {
    btnAddUser.addEventListener('click', () => {
        const nameInput = document.getElementById('new-user-name');
        const phoneInput = document.getElementById('new-user-phone');
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        
        if (!name) { alert('Nama user harus diisi!'); return; }
        if (!phone || phone.length < 8) { alert('Nomor HP tidak valid!'); return; }
        
        const normalized = normalizePhone(phone);
        
        db.collection('approved_users').doc(normalized).set({
            name: name,
            phone: normalized,
            approved_at: new Date().toISOString()
        }).then(() => {
            nameInput.value = '';
            phoneInput.value = '';
            showToastNotification(`✅ User <strong>${name}</strong> berhasil ditambahkan!`);
        }).catch(err => {
            alert('Gagal menambah user: ' + err.message);
        });
    });
}

window.removeApprovedUser = function(docId) {
    let displayPhone = docId;
    if (displayPhone.startsWith('62')) displayPhone = '0' + displayPhone.substring(2);
    
    if (!confirm(`Yakin ingin menghapus akses untuk nomor ${displayPhone}?`)) return;
    
    db.collection('approved_users').doc(docId).delete().then(() => {
        showToastNotification(`🗑️ Akses untuk ${displayPhone} telah dihapus.`);
    }).catch(err => {
        alert('Gagal menghapus: ' + err.message);
    });
};

window.addEventListener('click', (e) => {
    if (e.target === usersModal) usersModal.classList.add('hidden');
});

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
}

window.addCustomRule = function(type, kwInputId, catInputId) {
    const kw = document.getElementById(kwInputId).value.trim().toUpperCase();
    const cat = document.getElementById(catInputId).value;
    const kwInput = document.getElementById(kwInputId);
    
    if (kw) {
        if (type === 'model') {
            customModels.push({keyword: kw, category: cat});
        } else {
            customReasons.push({keyword: kw, category: cat});
        }
        
        // Save to Cloud
        db.collection('config').doc('rules').set({
            models: customModels,
            reasons: customReasons
        }, {merge: true}).catch(e => showToastNotification("Gagal menyimpan ke Cloud: " + e.message));
        
        kwInput.value = '';
        renderCustomRules();
    }
};

window.deleteCustomRule = function(type, index) {
    if (type === 'model') {
        customModels.splice(index, 1);
    } else {
        customReasons.splice(index, 1);
    }
    
    // Save to Cloud
    db.collection('config').doc('rules').set({
        models: customModels,
        reasons: customReasons
    }, {merge: true}).catch(e => showToastNotification("Gagal menghapus dari Cloud: " + e.message));
    
    renderCustomRules();
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
let techContacts = JSON.parse(localStorage.getItem('bujm_tech_contacts')) || {};
let techNames = JSON.parse(localStorage.getItem('bujm_tech_names')) || {};

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
    const inputs = contactsTableBody.querySelectorAll('.tech-phone');
    inputs.forEach(input => {
        const name = input.dataset.name;
        const phone = input.value.trim();
        if (phone) {
            techContacts[name] = phone;
        } else {
            delete techContacts[name];
        }
    });
    
    // Save Custom Names for Kacab
    const nameInputs = contactsTableBody.querySelectorAll('.tech-real-name');
    nameInputs.forEach(input => {
        const engKey = input.dataset.name;
        const val = input.value.trim();
        if (val) techNames[engKey] = val;
        else delete techNames[engKey];
    });
    
    localStorage.setItem('bujm_tech_contacts', JSON.stringify(techContacts));
    localStorage.setItem('bujm_tech_names', JSON.stringify(techNames));
    
    showToastNotification('Database Nomor WA berhasil disimpan secara lokal!');
    contactsModal.classList.add('hidden');
    
    // Rerender Shame List to update WA button colors
    if (window.engineerData) {
        // Just trigger a fake file input process? No, we don't have the raw shame list.
        // Easiest is to ask user to re-upload, or just let them know.
        showToastNotification('Simpan sukses! Refresh / Tarik ulang Excel untuk melihat warna tombol WA yang baru.');
    }
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
        const phone = techContacts[eng] || '';
        let realName = techNames[eng] || '';
        
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
function sendWA(engName, asc, count, detail) {
    const phone = techContacts[engName];
    if (!phone) {
        showToastNotification('Nomor WA belum disetting! Buka menu "Kontak Teknisi" di atas dulu.');
        return;
    }
    
    // Format to 62...
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    }
    
    // Resolve Display Name (Use custom name for Kacab if available)
    let displayName = engName;
    if (window.techNames && window.techNames[engName]) {
        displayName = window.techNames[engName];
    } else if (techNames[engName]) { // Fallback if window is not attached properly
        displayName = techNames[engName];
    }
    
    let text = `🚨 *Peringatan AGING!*\n\nHalo ${displayName},\nBerikut ada *${count} bill AGING*:\n`;
    
    if (window.engineerData && window.engineerData[engName]) {
        const bills = window.engineerData[engName].bills;
        // Urutkan dari yang paling lama ngendap (Pending Days tertinggi)
        bills.sort((a, b) => b.pendingDays - a.pendingDays);
        
        bills.forEach((b, index) => {
            text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason}\n`;
        });
    }
    
    text += `\nSegera selesaikan agar aging cabang ga rusak.`;
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Send WA Function for Repair Completed (RC)
window.sendWARC = function(asc, count) {
    let engName = `PIC ${asc}`;
    let phone = techContacts[engName];
    
    if (!phone) {
        showToastNotification(`Nomor WA belum disetting untuk PIC ${asc}! Buka menu "Kontak Teknisi" di atas dulu.`);
        return;
    }
    
    // Format to 62...
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    }
    
    // Resolve Display Name
    let displayName = engName;
    if (window.techNames && window.techNames[engName]) {
        displayName = window.techNames[engName];
    } else if (techNames[engName]) { 
        displayName = techNames[engName];
    }
    let text = `Halo ${displayName},\nBerikut ada *${count} bill Repair Completed*:\n_Segera hubungi cust / tawarkan D2D._\n`;
    
    if (window.rcData && window.rcData[asc]) {
        const bills = window.rcData[asc].bills;
        // Urutkan dari yang paling lama ngendap (Pending Days tertinggi)
        bills.sort((a, b) => b.pendingDays - a.pendingDays);
        
        bills.forEach((b, index) => {
            text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason}\n`;
        });
    }
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Send WA Function for Dosa Cabang (> 7 Hari) for a single branch
window.sendWADosaSingleBranch = function(asc) {
    let engName = `PIC ${asc}`;
    let phone = techContacts[engName];
    
    if (!phone) {
        showToastNotification(`Nomor WA belum disetting untuk PIC ${asc}! Buka menu "Kontak Teknisi" di atas dulu.`);
        return;
    }
    
    // Format to 62...
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    }
    
    // Resolve Display Name
    let displayName = engName;
    if (window.techNames && window.techNames[engName]) {
        displayName = window.techNames[engName];
    } else if (techNames[engName]) { 
        displayName = techNames[engName];
    }
    
    if (!window.dosaCabangStatsGlobal || !window.dosaCabangStatsGlobal[asc]) return;
    const bills = window.dosaCabangStatsGlobal[asc].bills;
    
    let text = `🚨 *Peringatan AGING DOSA CABANG (> 7 Hari)*\n\nHalo ${displayName},\nBerikut daftar bill pending murni kesalahan cabang Anda dengan aging di atas 7 hari (tidak termasuk kendala SEIN/Part):\n`;
    
    // Urutkan dari yang paling lama ngendap (Pending Days tertinggi)
    bills.sort((a, b) => b.pendingDays - a.pendingDays);
    
    bills.forEach((b, index) => {
        text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason || '-'}\n`;
    });
    
    text += `\nSegera tindak lanjuti pendingan di atas hari ini juga agar tidak merusak aging cabang. Terima kasih. 🙏`;
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

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
        </tr>
    `;
    
    const bills = window.dosaCabangStatsGlobal[asc].bills;
    
    document.getElementById('modal-title').innerText = `${asc} - Aging Dosa Cabang (> 7 Hari) (${bills.length} units)`;
    
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
            <td style="font-size:0.8rem; color:var(--text-muted);">${b.reason || '-'}</td>
            <td style="color:var(--accent-red); font-weight:bold;">${b.pendingDays} days</td>
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
    if (!window.engineerData || !window.engineerData[engineer] || window.engineerData[engineer].bills.length === 0) {
        return;
    }
    
    let bills = window.engineerData[engineer].bills;
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
            <td style="color:var(--accent-blue); font-weight:bold;">${d.gdCount} Units</td>
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

