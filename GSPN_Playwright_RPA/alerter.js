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

if (!fs.existsSync(BLAST_CACHE_DIR)) {
    try { fs.mkdirSync(BLAST_CACHE_DIR, { recursive: true }); } catch (e) {}
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

    let waNumber = String(phone).replace(/\D/g, '');
    if (waNumber.startsWith('0')) { waNumber = '62' + waNumber.substring(1); }
    else if (waNumber.startsWith('8')) { waNumber = '62' + waNumber; }

    const chatId = waNumber + '@c.us';

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
        // Sesi Pagi (09:10 / 09:15) — toleransi 09:00 - 10:30 WIB
        if (m >= 9 * 60 && m < 10 * 60 + 30) {
            return 'MORNING';
        }
        // Sesi Siang (12:10 / 12:15) — toleransi 12:00 - 13:30 WIB
        if (m >= 12 * 60 && m < 13 * 60 + 30) {
            return 'MIDDAY';
        }
        // Sesi Sore / Closing (15:10 / 15:15) — toleransi 15:00 - 17:00 WIB
        if (m >= 15 * 60 && m < 17 * 60) {
            return 'CLOSING';
        }
    }

    return null;
}

// =============================================================================
// MAIN ALERTING HANDLER (MANDAT BOS: BLAST DITUJUKAN KE PIC/LEADER CABANG!)
// =============================================================================
async function handleSmartAlerts(syncResult, options = {}) {
    if (!syncResult || !syncResult.analytics) {
        console.warn('  ⚠️ [ALERTER] syncResult / analytics tidak valid. Blasting dibatalkan.');
        return { success: false, reason: 'Invalid syncResult' };
    }

    // 1. Ambil kontak
    let customContacts = {};
    if (fs.existsSync(CONTACTS_CACHE_FILE)) {
        try {
            customContacts = JSON.parse(fs.readFileSync(CONTACTS_CACHE_FILE, 'utf-8'));
        } catch (e) {}
    }

    if (Object.keys(customContacts).length === 0) {
        try {
            const contactDoc = await getDoc(doc(db, 'config', 'contacts'));
            if (contactDoc.exists()) {
                const data = contactDoc.data();
                const fetchedPhones = data.phones || data;
                customContacts = { ...customContacts, ...fetchedPhones };
                fs.writeFileSync(CONTACTS_CACHE_FILE, JSON.stringify(fetchedPhones, null, 2), 'utf-8');
            }
        } catch (e) {
            console.warn("  [ALERTER] Menggunakan kontak lokal/cache:", e.message);
        }
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
        console.log(`  ℹ️ [ALERTER] Waktu saat ini (${timeStr} WIB) di luar jendela jadwal blast (09:10, 12:10, 15:10). Auto-blast dilewati.`);
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
        // KHUSUS SESI PAGI (09:10): KIRIM JUGA PENDING DELIVERY (RC) KE PIC CABANG
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
    DEFAULT_CONTACTS
};
