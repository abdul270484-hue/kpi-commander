const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');
const config = require('./config');

// Initialize Firebase
const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

// Default Contacts Cache & Directories
const DEFAULT_CONTACTS = {};
const CONTACTS_CACHE_FILE = path.join(__dirname, 'contacts_cache.json');
const BLAST_CACHE_DIR = path.join(__dirname, 'blast_logs');
const TRACKER_FILE = path.join(BLAST_CACHE_DIR, 'blast_tracker.json');
const PHONE_COOLDOWN_FILE = path.join(BLAST_CACHE_DIR, 'recent_sent_phones.json');

if (!fs.existsSync(BLAST_CACHE_DIR)) {
    try { fs.mkdirSync(BLAST_CACHE_DIR, { recursive: true }); } catch (e) {}
}

// Helper: Normalize phone to 628...
function formatPhoneNumber(phone) {
    if (!phone) return '';
    let waNumber = String(phone).replace(/\D/g, '');
    if (waNumber.startsWith('0')) waNumber = '62' + waNumber.substring(1);
    else if (waNumber.startsWith('8')) waNumber = '62' + waNumber;
    return waNumber;
}

// Helper: Classify message type so Morning RC or HOM doesn't collide with Morning Aging,
// while preventing duplicate Aging/Closing messages across alerter.js and /api/blast
function getMessageCategory(messageText) {
    const m = String(messageText || '').toUpperCase();
    if (m.includes('DAILY OPERATIONAL REPORT') || m.includes('PENCAPAIAN GD & VOLUME')) return 'HOM_REPORT';
    if (m.includes('WARNING PENDING DELIVERY') || m.includes('PENDING DELIVERY (RC)')) return 'RC_DELIVERY';
    if (m.includes('CRITICAL ALERT') || m.includes('MONITORING AGING') || m.includes('PUSH CLOSING') || m.includes('TEKNISI:')) return 'AGING_SHAME';
    if (m.includes('APRESIASI') || m.includes('WALL OF FAME')) return 'FAME';
    return 'GENERAL';
}

function getPhoneCooldownMap() {
    if (fs.existsSync(PHONE_COOLDOWN_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PHONE_COOLDOWN_FILE, 'utf-8'));
        } catch (_) {}
    }
    return {};
}

function savePhoneCooldownMap(map) {
    try {
        fs.writeFileSync(PHONE_COOLDOWN_FILE, JSON.stringify(map, null, 2), 'utf-8');
    } catch (_) {}
}

function isPhoneRecentlyBlasted(phone, messageText, cooldownMinutes = 90) {
    const waNumber = formatPhoneNumber(phone);
    if (!waNumber) return { blocked: false };
    const category = getMessageCategory(messageText);
    const key = `${waNumber}_${category}`;
    const map = getPhoneCooldownMap();
    const lastSent = map[key] || 0;
    const now = Date.now();
    const cooldownMs = cooldownMinutes * 60 * 1000;
    if (lastSent > 0 && (now - lastSent < cooldownMs)) {
        const elapsedMins = Math.max(1, Math.round((now - lastSent) / 60000));
        return { blocked: true, elapsedMins, category, waNumber };
    }
    return { blocked: false, category, waNumber };
}

function recordPhoneBlasted(phone, messageText) {
    const waNumber = formatPhoneNumber(phone);
    if (!waNumber) return;
    const category = getMessageCategory(messageText);
    const map = getPhoneCooldownMap();
    const now = Date.now();
    map[`${waNumber}_${category}`] = now;
    map[waNumber] = now;
    savePhoneCooldownMap(map);
}

// 11 Reason Kritis untuk eskalasi
const ESCALATION_REASONS = [
    "MONITORING/AGING OR NOT REPRODUCED",
    "RE-SCHEDULING BY ENG'R OR ASC",
    "NEED TO SET APPOINTMENT DATE",
    "WAITING FOR WARRANTY DOCUMENTS",
    "CHECKING CUSTOMER INFO",
    "ASSIGN TO ENG'R AFTER PARTS RECEIVED",
    "WAITING FOR CONFIRMATION FROM CUSTOMER",
    "REPAIR IN PROGRESS",
    "REPAIR IN PROGRESS AFTER PARTS RECEIVED",
    "PARTS ARRIVED BUT NO G/R YET(ASC)",
    "REQUEST TECH SUPPORT (TECHNICAL PROBLEM)"
];

function isEscalationReason(reason) {
    if (!reason) return false;
    const cleanR = String(reason).trim().toUpperCase();
    return ESCALATION_REASONS.some(r => r === cleanR || cleanR.startsWith(r) || r.startsWith(cleanR));
}

// Timezone resolver per branch
function getBranchTimezone(asc) {
    if (!asc) return 'WIB';
    const norm = String(asc).toUpperCase().trim();
    if (norm.includes('PINANG')) return 'WIB';
    const witaKeywords = [
        'BANJARMASIN', 'SAMARINDA', 'BALIKPAPAN', 'PALANGKARAYA', 'TARAKAN', 
        'TANJUNG', 'BERAU', 'MAKASSAR', 'MANADO', 'PALU', 'KENDARI', 'GORONTALO',
        'KOTAMOBAGU', 'PAREPARE', 'PALOPO', 'MAMUJU', 'DENPASAR', 'MATARAM', 'KUPANG', 'SINGARAJA'
    ];
    if (witaKeywords.some(k => norm.includes(k))) return 'WITA';
    const witKeywords = ['AMBON', 'TERNATE', 'JAYAPURA', 'TIMIKA', 'SORONG', 'NABIRE', 'MERAUKE'];
    if (witKeywords.some(k => norm.includes(k))) return 'WIT';
    return 'WIB';
}

// Normalisasi pencocokan nama cabang
function isBranchMatching(branchToCheck, allowedBranches) {
    if (!branchToCheck || !allowedBranches || allowedBranches.length === 0) return false;
    const target = String(branchToCheck).trim().toUpperCase();
    return allowedBranches.some(a => {
        const cleanA = String(a).trim().toUpperCase();
        if (cleanA === 'TANJUNG' && target.includes('PINANG')) return false;
        if (target === 'TANJUNG' && cleanA.includes('PINANG')) return false;
        return target.includes(cleanA) || cleanA.includes(target);
    });
}

// Normalisasi nama teknisi untuk filter PIC/Unknown
function normalizeName(name) {
    if (!name) return '';
    return String(name).trim().toUpperCase();
}

// Helper nama teknisi
function getTechName(name) {
    if (!name) return 'Teknisi';
    return String(name).replace(/\(.*?\)/g, '').trim();
}

// Helper nomor telepon PIC/Leader cabang
function getBranchPICPhone(branchName, customContacts = {}) {
    if (!branchName) return null;
    const clean = String(branchName).trim().toUpperCase();

    const candidates = [
        `PIC ${clean}`,
        `KACAB ${clean}`,
        `LEADER ${clean}`,
        clean
    ];

    if (clean.includes('PLANET GADGET') || clean === 'DPG') {
        candidates.push('PIC DPG', 'PIC DENPASAR - PLANET GADGET');
    }
    if (clean.includes('CELLULAR WORLD') || clean === 'DCW') {
        candidates.push('PIC DCW', 'PIC DENPASAR - CELLULAR WORLD');
    }
    if (clean.includes('MANADO')) {
        candidates.push('PIC UNICOM MANADO', 'PIC MANADO');
    }
    if (clean.includes('DENPASAR') && !clean.includes('PLANET') && !clean.includes('CELLULAR')) {
        candidates.push('PIC DENPASAR', 'PIC UNICOM DENPASAR');
    }

    for (const cand of candidates) {
        if (customContacts[cand]) return { phone: customContacts[cand], name: cand };
    }

    for (const k in customContacts) {
        const kUpper = k.toUpperCase();
        if (kUpper.startsWith('PIC ') && isBranchMatching(branchName, [kUpper.replace('PIC ', '').trim()])) {
            return { phone: customContacts[k], name: k };
        }
    }

    return null;
}

// Send WhatsApp payload safely with anti-ban delay & hash variation
async function dispatchWAMessage(phone, messageText, options = {}) {
    if (!phone) {
        console.log(`  ⚠️ [WA SKIP] Nomor HP kosong. Pesan dilewati.`);
        return false;
    }

    const waNumber = formatPhoneNumber(phone);
    const chatId = waNumber + '@c.us';

    // Cooldown Check (shared 90-minute lock across alerter.js & super_engine.js)
    if (!options.force) {
        const cooldownCheck = isPhoneRecentlyBlasted(waNumber, messageText, 90);
        if (cooldownCheck.blocked) {
            console.warn(`  ⚠️ [WA COOLDOWN BLOCK] Nomor ${waNumber} kategori [${cooldownCheck.category}] sudah dikirim ${cooldownCheck.elapsedMins} menit lalu! Dilewati agar tidak double chat.`);
            return false;
        }
    }

    if (options.dryRun) {
        console.log(`  🔍 [DRY RUN WA] Disimulasikan kirim ke ${waNumber} (${messageText.substring(0, 35).replace(/\n/g, ' ')}...)`);
        return true;
    }

    // Zero-width space randomization (Anti-Spam)
    const zeroWidth = '\u200B'.repeat(Math.floor(Math.random() * 8) + 1);
    const finalMessage = messageText + zeroWidth;

    // Prioritas 1: waClient langsung dari super_engine
    if (options.waClient && options.isReady) {
        try {
            recordPhoneBlasted(waNumber, messageText);
            await options.waClient.sendMessage(chatId, finalMessage);
            console.log(`  ✅ [WA SENT DIRECT] Berhasil kirim ke ${waNumber}`);
            await new Promise(r => setTimeout(r, options.delayMs || 4000));
            return true;
        } catch (err) {
            console.warn(`  ⚠️ [WA DIRECT FAIL] Gagal langsung ke ${waNumber}: ${err.message}, mencoba via API port 3001...`);
        }
    }

    // Prioritas 2: via Local Express API port 3001
    try {
        const response = await fetch('http://127.0.0.1:3001/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: waNumber, message: finalMessage })
        }).catch(err => {
            console.warn(`  [WA API ERROR] ${err.message}`);
            return null;
        });

        if (response && response.ok) {
            recordPhoneBlasted(waNumber, messageText);
            console.log(`  ✅ [WA SENT API] Berhasil kirim ke ${waNumber}`);
            await new Promise(r => setTimeout(r, options.delayMs || 4000));
            return true;
        } else {
            const errText = response ? await response.text() : 'No response from port 3001';
            console.warn(`  ❌ [WA FAILED] Port 3001 menolak kirim ke ${waNumber}: ${errText}`);
            return false;
        }
    } catch (err) {
        console.error(`  ❌ [WA ERROR] Terjadi kesalahan pengiriman ke ${waNumber}:`, err.message);
        return false;
    }
}

// Daily Blast Tracker
function getBlastTracker() {
    if (fs.existsSync(TRACKER_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf-8'));
        } catch (_) {}
    }
    return {};
}

function saveBlastTracker(tracker) {
    try {
        fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2), 'utf-8');
    } catch (e) {
        console.warn('  [ALERTER] Gagal simpan blast tracker:', e.message);
    }
}

// Menentukan sesi blast aktif berdasarkan waktu riil (WIB)
// Jadwal resmi: 09:15 (MORNING), 12:15 (MIDDAY), 15:15 (CLOSING)
function getActiveBlastSession(scheduleSlot, forceSession = null) {
    if (forceSession) return forceSession.toUpperCase();

    const s = String(scheduleSlot || '').toUpperCase();
    if (s.includes('MORNING')) return 'MORNING';
    if (s.includes('MIDDAY')) return 'MIDDAY';
    if (s.includes('CLOSING')) return 'CLOSING';

    let slotMins = null;
    const match = s.match(/(\d{1,2}):(\d{2})/);
    if (match) {
        slotMins = parseInt(match[1]) * 60 + parseInt(match[2]);
    }

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const candidateMins = [currentMins];
    if (slotMins !== null) candidateMins.unshift(slotMins);

    for (const m of candidateMins) {
        // Sesi Pagi: Jadwal 09:15 WIB (jendela aktif 09:15 - 10:30 WIB)
        if (m >= 9 * 60 + 15 && m < 10 * 60 + 30) {
            return 'MORNING';
        }
        // Sesi Siang: Jadwal 12:15 WIB (jendela aktif 12:15 - 13:30 WIB)
        if (m >= 12 * 60 + 15 && m < 13 * 60 + 30) {
            return 'MIDDAY';
        }
        // Sesi Sore / Closing: Jadwal 15:15 WIB (jendela aktif 15:15 - 17:00 WIB)
        if (m >= 15 * 60 + 15 && m < 17 * 60) {
            return 'CLOSING';
        }
    }

    return null;
}

// =============================================================================
// LAPORAN EKSEKUTIF KHUSUS KE HOM (JAM 09:15 PAGI)
// =============================================================================
async function buildExecutiveReportTextForHOM(allowedBranches, customContacts, customNames) {
    const now = new Date();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const indMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const fullIndMonthNames = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];

    const dayStr = dayNames[now.getDay()];
    const dateStr = `${dayStr}, ${now.getDate()} ${indMonthNames[now.getMonth()]} ${now.getFullYear()}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
    const currentMonthName = fullIndMonthNames[now.getMonth()];

    const hours = now.getHours();
    let timeGreeting = 'pagi';
    if (hours >= 11 && hours < 15) timeGreeting = 'siang';
    else if (hours >= 15 && hours < 18) timeGreeting = 'sore';
    else if (hours >= 18 || hours < 5) timeGreeting = 'malam';

    let rawHom = (customNames && customNames['HEAD_OPERASIONAL_MANAGER']) || '';
    let homCleanName = rawHom.trim();
    if (!homCleanName) homCleanName = 'HENDRI';
    else homCleanName = homCleanName.replace(/^(Pak|Bpk|Bapak)\s+/i, '');

    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Fetch latest Firestore docs for complete Area Executive Summary
    let dataCore = {}, dataViol = {}, dataEng = {}, dataProd = {}, dataParts = {};
    try {
        const [snapCore, snapViol, snapEng, snapProd, snapParts] = await Promise.all([
            getDoc(doc(db, 'dashboard_data', 'latest')),
            getDoc(doc(db, 'dashboard_data', 'latest_violations')),
            getDoc(doc(db, 'dashboard_data', 'latest_eng')),
            getDoc(doc(db, 'dashboard_data', 'latest_prod')),
            getDoc(doc(db, 'dashboard_data', 'latest_parts_sales'))
        ]);
        if (snapCore.exists()) dataCore = snapCore.data();
        if (snapViol.exists()) dataViol = snapViol.data();
        if (snapEng.exists()) dataEng = snapEng.data();
        if (snapProd.exists()) dataProd = snapProd.data();
        if (snapParts.exists()) dataParts = snapParts.data();
    } catch (e) {
        console.warn('  [HOM REPORT] Warning saat ambil dokumen Firestore:', e.message);
    }

    const volData = dataProd.volInTrendData || {};
    const gdData = dataProd.gdTrendData || {};
    const branchStats = dataCore.branchStats || {};
    const rcData = dataEng.rcStats || {};
    const dosaList = dataCore.dosaCabangOver7 || [];
    const dosaStats = dataCore.dosaCabangStats || {};
    const partsDaily = dataParts.partsDailyData || {};
    const partsList = dataParts.partsSalesList || [];
    const redoList = dataViol.redoList || [];
    const mpuList = dataViol.mpuList || [];
    const ubList = dataViol.ubList || [];

    const cleanBranchName = (b) => {
        if (!b) return '-';
        let bName = b.replace(/^DENPASAR\s*-\s*/i, '').trim();
        bName = bName.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (bName.toLowerCase() === 'denpasar') bName = 'Denpasar';
        return bName;
    };

    const cleanTechName = (t) => {
        if (!t || t === '-') return '-';
        return String(t).trim().toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
        if (hasPinangB !== hasPinangR && (bUpper.includes('TANJUNG') || rUpper.includes('TANJUNG'))) return false;
        return rUpper.includes(bUpper) || bUpper.includes(rUpper);
    };

    let totVolIn = 0;
    let totGd = 0;
    const branchGdList = [];
    const volInBreakdown = [];
    const gdBreakdown = [];
    const gdRateBreakdown = [];

    allowedBranches.forEach(b => {
        let v = (volData[currentKey] && parseInt(volData[currentKey][b])) || 0;
        let g = (gdData[currentKey] && parseInt(gdData[currentKey][b])) || 0;
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
    branchGdList.sort((a, b) => b.gd - a.gd);
    let topBranchesText = '';
    branchGdList.forEach((item, idx) => {
        topBranchesText += `${idx + 1}. ${cleanBranchName(item.branch)}: ${item.gd.toLocaleString('id-ID')} unit GD\n`;
    });

    let totalPartsQty = 0;
    const partsBreakdown = [];
    allowedBranches.forEach(b => {
        let sum = 0;
        Object.keys(partsDaily).forEach(rowKey => {
            if (matchBranch(b, rowKey)) {
                const days = partsDaily[rowKey] || {};
                sum += Object.keys(days).filter(k => k !== 'partNos').reduce((acc, k) => acc + (parseInt(days[k]) || 0), 0);
            }
        });
        if (sum === 0 && Array.isArray(partsList)) {
            partsList.forEach(item => {
                if (matchBranch(b, item.asc || item.branch)) sum += (parseInt(item.qty) || 0);
            });
        }
        totalPartsQty += sum;
        if (sum > 0) partsBreakdown.push(`${cleanBranchName(b)}: ${sum.toLocaleString('id-ID')}`);
    });

    let totalSO = 0, totalLTP = 0, totalExLTP = 0, totalRC = 0;
    const soBreakdown = [], ltpBreakdown = [], exLtpBreakdown = [], rcBreakdown = [];

    allowedBranches.forEach(b => {
        let bs = branchStats[b];
        if (!bs) {
            const foundK = Object.keys(branchStats).find(k => matchBranch(b, k));
            if (foundK) bs = branchStats[foundK];
        }
        bs = bs || {};
        const bSO = bs.total || 0;
        totalSO += bSO;
        soBreakdown.push(`${cleanBranchName(b)}: ${bSO.toLocaleString('id-ID')}`);

        const bLtpBills = (bs.bills && bs.bills.ltp) || [];
        const bLtp = bs.ltp !== undefined ? bs.ltp : bLtpBills.length;
        totalLTP += bLtp;
        if (bLtpBills.length === 1) {
            ltpBreakdown.push(`${cleanBranchName(b)}: ${bLtpBills[0].jobNo || bLtpBills[0]['Job No']} [${cleanTechName(bLtpBills[0].engineer)}]`);
        } else if (bLtpBills.length > 1) {
            const listStr = bLtpBills.map(x => `${x.jobNo || x['Job No']} [${cleanTechName(x.engineer)}]`).join(', ');
            ltpBreakdown.push(`${cleanBranchName(b)}: ${bLtpBills.length} unit (${listStr})`);
        }

        let bExBills = [];
        let dStat = dosaStats[b];
        if (!dStat) {
            const foundK = Object.keys(dosaStats).find(k => matchBranch(b, k));
            if (foundK) dStat = dosaStats[foundK];
        }
        if (dStat && Array.isArray(dStat.bills)) bExBills = dStat.bills;
        else if (dosaList && dosaList.length > 0) bExBills = dosaList.filter(d => matchBranch(b, d.asc || d.branch));
        else if (bs.bills && Array.isArray(bs.bills.exLtp)) bExBills = bs.bills.exLtp;

        const bAging7 = bExBills.length || bs.exLtp || 0;
        totalExLTP += bAging7;
        if (bAging7 === 1) {
            const bill = bExBills[0];
            exLtpBreakdown.push(`${cleanBranchName(b)}: ${bill ? (bill.jobNo || bill['Job No']) : '-'} [${cleanTechName(bill ? (bill.engineer || bill.Engineer) : '-')}]`);
        } else if (bAging7 > 1) {
            const listStr = bExBills.map(x => `${x.jobNo || x['Job No']} [${cleanTechName(x.engineer || x.Engineer)}]`).join(', ');
            exLtpBreakdown.push(`${cleanBranchName(b)}: ${bAging7} unit (${listStr})`);
        }

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

    let totalRedo = 0;
    const redoBreakdown = [];
    allowedBranches.forEach(b => {
        const bRedoBills = redoList.filter(r => matchBranch(b, r.asc || r.branch));
        totalRedo += bRedoBills.length;
        if (bRedoBills.length === 1) {
            redoBreakdown.push(`${cleanBranchName(b)}: ${bRedoBills[0].jobNo || bRedoBills[0]['Job No']} [${cleanTechName(bRedoBills[0].engineer)}]`);
        } else if (bRedoBills.length > 1) {
            const listStr = bRedoBills.map(x => `${x.jobNo || x['Job No']} [${cleanTechName(x.engineer)}]`).join(', ');
            redoBreakdown.push(`${cleanBranchName(b)}: ${bRedoBills.length} unit (${listStr})`);
        }
    });

    let totalViolations = 0;
    const penaltyBreakdown = [];
    allowedBranches.forEach(b => {
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
}

// =============================================================================
// MAIN ALERTING HANDLER (MANDAT BOS: BLAST DITUJUKAN KE PIC/LEADER CABANG!)
// =============================================================================
async function handleSmartAlerts(syncResult, options = {}) {
    if (!syncResult || !syncResult.analytics) {
        console.warn('  ⚠️ [ALERTER] syncResult / analytics tidak valid. Blasting dibatalkan.');
        return { success: false, reason: 'Invalid syncResult' };
    }

    // 1. Ambil kontak & nama (Termasuk kontak HEAD_OPERASIONAL_MANAGER dari Firestore)
    let customContacts = {};
    let customNames = {};
    if (fs.existsSync(CONTACTS_CACHE_FILE)) {
        try {
            customContacts = JSON.parse(fs.readFileSync(CONTACTS_CACHE_FILE, 'utf-8'));
        } catch (e) {}
    }

    try {
        const contactDoc = await getDoc(doc(db, 'config', 'contacts'));
        if (contactDoc.exists()) {
            const data = contactDoc.data();
            const fetchedPhones = data.phones || data;
            customNames = data.names || {};
            customContacts = { ...customContacts, ...fetchedPhones };
            fs.writeFileSync(CONTACTS_CACHE_FILE, JSON.stringify(customContacts, null, 2), 'utf-8');
        }
    } catch (e) {
        console.warn("  [ALERTER] Menggunakan kontak lokal/cache:", e.message);
    }

    const { analytics, dateStr, timeStr, scheduleSlot } = syncResult;
    const { shameList = [], rcStats = {} } = analytics;

    // 2. Cabang yang diizinkan (HANYA Area BOS Pak Abdul Khoir)
    const allowedBranches = options.allowedBranches || config.BLAST_ALLOWED_BRANCHES || [
        'DENPASAR',
        'DENPASAR - CELLULAR WORLD',
        'DENPASAR - PLANET GADGET',
        'KUPANG',
        'SINGARAJA',
        'MANADO'
    ];

    // 3. Tentukan Sesi Blast
    const session = getActiveBlastSession(scheduleSlot, options.forceSession);
    if (!session && !options.force) {
        console.log(`  ℹ️ [ALERTER] Waktu saat ini (${timeStr} WIB) di luar jendela jadwal blast (09:15, 12:15, 15:15). Auto-blast dilewati.`);
        return { success: true, skipped: true, reason: 'Outside blast window' };
    }

    const activeSession = session || 'MANUAL_BLAST';

    // 4. Cek Tracker Harian
    const tracker = getBlastTracker();
    if (!tracker[dateStr]) tracker[dateStr] = {};

    if (tracker[dateStr][activeSession] && tracker[dateStr][activeSession].executed && !options.force) {
        console.log(`  ℹ️ [ALERTER] Sesi ${activeSession} untuk hari ini (${dateStr}) SUDAH BERHASIL dikirim pada pukul ${tracker[dateStr][activeSession].timestamp}. Melewati.`);
        return { success: true, skipped: true, reason: 'Already blasted today' };
    }

    console.log('\n=============================================================');
    console.log(`  📱 SMART WA ALERTER — SESI: ${activeSession} (MANDAT: KE PIC/LEADER)`);
    console.log(`  Cabang Area: ${allowedBranches.join(', ')}`);
    console.log(`  Waktu: ${dateStr} ${timeStr} WIB`);
    console.log('=============================================================');

    // 5. Kelompokkan teknisi Wall of Shame per Cabang (ASC)
    const branchTechMap = {};
    allowedBranches.forEach(b => { branchTechMap[b] = []; });

    shameList.forEach(item => {
        if (!item || !item.asc || !item.engineer) return false;
        const norm = normalizeName(item.engineer);
        if (!norm || norm === 'UNKNOWN ENGINEER' || norm === 'UNKNOWN' || norm === 'UNKNOWN_ENGINEER' || norm === 'N/A' || norm.startsWith('PIC ') || norm.startsWith('KACAB ')) {
            return;
        }

        for (const branch of allowedBranches) {
            if (isBranchMatching(item.asc, [branch])) {
                branchTechMap[branch].push(item);
                break;
            }
        }
    });

    let sentCount = 0;
    let failedCount = 0;
    const isMorning = (activeSession === 'MORNING');

    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const dayName = days[now.getDay()];
    const dateNum = now.getDate();
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();
    const dateLongStr = `${dayName}, ${dateNum} ${monthName} ${year}`;

    // 6. Eksekusi Blast per Cabang KE PIC / LEADER (Mandat BOS!)
    for (const branch of allowedBranches) {
        const picContact = getBranchPICPhone(branch, customContacts);
        if (!picContact || !picContact.phone) {
            console.warn(`  ⚠️ [BLAST SKIP] Kontak WA PIC/Leader untuk cabang [${branch}] belum dikonfigurasi.`);
            continue;
        }

        const tzLabel = getBranchTimezone(branch);
        const rawBranchTechs = branchTechMap[branch] || [];

        // Urutkan teknisi per abjad
        const sortedTechs = [...rawBranchTechs].sort((a, b) => (a.engineer || '').localeCompare(b.engineer || ''));

        // Hitung total unit dan kumpulkan detail bills per teknisi
        let grandTotal = 0;
        const techData = [];

        sortedTechs.forEach(t => {
            let bills = Array.isArray(t.bills) ? [...t.bills] : [];
            // Filter strictly bill milik cabang ini
            bills = bills.filter(b => isBranchMatching(b.asc || branch, [branch]));
            bills.sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));

            const count = bills.length > 0 ? bills.length : (t.count || 0);
            if (count > 0) {
                grandTotal += count;
                techData.push({
                    engineer: t.engineer,
                    displayName: getTechName(t.engineer),
                    count: count,
                    bills: bills
                });
            }
        });

        // =====================================================================
        // TEMPLATE CHAT SESUAI INSTRUKSI RESMI BOS (STEP 63420)
        // =====================================================================
        if (techData.length > 0) {
            let text = '';

            if (isMorning) {
                // ☀️ Pilihan 1: Sesi Pagi / Universal (Briefing & Pengawalan Awal Hari)
                text += `📋 *MONITORING AGING UNIT PER TEKNISI*\n`;
                text += `Cabang: *${branch}*\n`;
                text += `Update: ${dateLongStr} | ${timeStr} ${tzLabel}\n\n`;
                text += `Selamat pagi. Berikut daftar lengkap seluruh unit yang wajib diselesaikan oleh masing-masing teknisi di cabang hari ini:\n\n`;

                techData.forEach((t, idx) => {
                    text += `👨‍🔧 ${idx + 1}. TEKNISI: *${t.displayName}* (${t.count} Unit)\n\n`;
                    t.bills.forEach(b => {
                        text += `${b.jobNo} (${b.pendingDays || 0} Hari)\n`;
                        text += `📱 ${b.model || '-'} | 👤 ${b.customer || '-'}\n`;
                        text += `⚠️ Reason: ${b.reason || '-'}\n\n`;
                    });
                });

                text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                text += `📌 *Total Unit Tertahan di Cabang: ${grandTotal} Bill*\n\n`;
                text += `Prioritaskan eksekusi unit dengan hari aging terlama agar aging tidak semakin rusak.\n`;
                text += `Segera update status riil di GSPN jika ada kendala konfirmasi user.\n\n`;
                text += `Mari tuntaskan sebelum tarikan data berikutnya. Terima kasih dan selamat bertugas! 🙏`;

            } else {
                // 🚨 Pilihan 2: Sesi Siang / Sore (Push Closing & Peringatan Tegas)
                text += `🚨 *CRITICAL ALERT — PUSH CLOSING CABANG*\n`;
                text += `Cabang: *${branch}*\n`;
                text += `Update: ${timeStr} ${tzLabel}\n\n`;
                text += `Jam operasional segera berakhir! Masih tercatat unit pending yang BELUM SELESAI / STAGNAN SEJAK PAGI:\n\n`;

                techData.forEach((t) => {
                    text += `👨‍🔧 TEKNISI: *${t.displayName}* (${t.count} Unit)\n`;
                    t.bills.forEach(b => {
                        text += `• ${b.jobNo} (${b.pendingDays || 0} Hari) — ${b.model || '-'}\n`;
                        text += `  Reason: ${b.reason || '-'}\n`;
                    });
                    text += `\n`;
                });

                text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                text += `⛔ *DEADLINE CLOSING HARI INI:*\n`;
                text += `Mohon PIC/Leader segera pastikan teknisi menyelesaikan perbaikan atau meng-update status GSPN sore ini.\n`;
                text += `Terima kasih atas kerja samanya! 🙏`;
            }

            console.log(`\n📤 [BLAST PIC] Mengirim Rekap Dosa Cabang ke ${picContact.name} (${branch} - ${picContact.phone}) [${grandTotal} Unit, ${techData.length} Teknisi]...`);
            const ok = await dispatchWAMessage(picContact.phone, text, options);
            if (ok) sentCount++; else failedCount++;

        } else {
            console.log(`  ℹ️ [BLAST PIC] Cabang [${branch}] bersih! Tidak ada unit aging dosa cabang.`);
        }

        // =====================================================================
        // KHUSUS SESI PAGI (09:15): KIRIM JUGA PENDING DELIVERY (RC) KE PIC CABANG
        // (Sesuai Rule 5.3: Siang & Sore DILARANG kirim RC agar tidak spam)
        // =====================================================================
        if (isMorning) {
            let matchedRc = null;
            for (const rcKey in rcStats) {
                if (isBranchMatching(rcKey, [branch])) {
                    matchedRc = rcStats[rcKey];
                    break;
                }
            }

            if (matchedRc && matchedRc.count > 0 && Array.isArray(matchedRc.bills) && matchedRc.bills.length > 0) {
                const sortedRc = [...matchedRc.bills].sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));

                let rcText = `🚨 *WARNING PENDING DELIVERY (RC) - BRANCH ${branch} [Update: ${timeStr} ${tzLabel}]*\n\n`;
                rcText += `Selamat Pagi ${picContact.name},\n`;
                rcText += `Berikut *${matchedRc.count} unit* dalam status Pending Delivery (Repair Completed). Mohon segera follow up kurir / customer (tawarkan antar D2D):\n`;

                sortedRc.forEach((j, index) => {
                    rcText += `\n${index + 1}. *${j.jobNo}* (*${j.pendingDays} Hari*)\n`;
                    rcText += `   👤 ${j.customer}\n`;
                    rcText += `   📱 ${j.model}\n`;
                    rcText += `   ⚠️ ${j.reason}\n`;
                });

                rcText += `\nMohon segera diproses demi menjaga performa aging cabang. Terima kasih. 🙏`;

                console.log(`\n📤 [BLAST RC PIC] Mengirim Pending Delivery ke ${picContact.name} (${branch} - ${picContact.phone}) [${matchedRc.count} Unit]...`);
                const okRc = await dispatchWAMessage(picContact.phone, rcText, options);
                if (okRc) sentCount++; else failedCount++;
            }
        }
    }

    // =====================================================================
    // KHUSUS SESI PAGI (09:15): KIRIM DAILY OPERATIONAL REPORT KE HOM
    // =====================================================================
    if (isMorning) {
        const homPhone = customContacts['HEAD_OPERASIONAL_MANAGER'];
        const homName = (customNames && customNames['HEAD_OPERASIONAL_MANAGER']) || 'HENDRI';
        if (homPhone) {
            try {
                const homReportText = await buildExecutiveReportTextForHOM(allowedBranches, customContacts, customNames);
                console.log(`\n📤 [BLAST HOM 09:15] Mengirim Daily Operational Report Area ke HOM (${homName} - ${homPhone})...`);
                const okHom = await dispatchWAMessage(homPhone, homReportText, options);
                if (okHom) sentCount++; else failedCount++;
            } catch (homErr) {
                console.error(`  ❌ [BLAST HOM ERROR] Gagal menyusun/mengirim laporan HOM:`, homErr.message);
            }
        } else {
            console.warn(`  ⚠️ [BLAST HOM SKIP] Kontak HEAD_OPERASIONAL_MANAGER belum ditemukan.`);
        }
    }

    // 7. Simpan Tracker & Telemetry Firestore
    tracker[dateStr][activeSession] = {
        executed: true,
        timestamp: `${dateStr} ${timeStr} WIB`,
        targetType: 'PIC_LEADER',
        sent: sentCount,
        failed: failedCount,
        branches: allowedBranches
    };
    saveBlastTracker(tracker);

    try {
        await setDoc(doc(db, 'rpa_commands', 'wa_blast_status'), {
            lastBlastSession: activeSession,
            lastBlastDate: dateStr,
            lastBlastTime: `${timeStr} WIB`,
            targetType: 'PIC_LEADER',
            sentCount: sentCount,
            failedCount: failedCount,
            allowedBranches: allowedBranches,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (_) {}

    console.log('\n=============================================================');
    console.log(`  🎉 SMART WA ALERTER SESI ${activeSession} KE PIC/LEADER SELESAI!`);
    console.log(`  Total Pesan Terkirim: ${sentCount} | Gagal: ${failedCount}`);
    console.log('=============================================================\n');

    return {
        success: true,
        session: activeSession,
        targetType: 'PIC_LEADER',
        sent: sentCount,
        failed: failedCount
    };
}

module.exports = {
    handleSmartAlerts,
    getActiveBlastSession,
    getBranchPICPhone,
    getBranchTimezone,
    dispatchWAMessage,
    getBlastTracker,
    isPhoneRecentlyBlasted,
    recordPhoneBlasted,
    formatPhoneNumber,
    DEFAULT_CONTACTS
};
