const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');
const config = require('./config');

// Initialize Firebase
const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

// Default Technician Contacts (Phone Numbers)
const DEFAULT_CONTACTS = {};
const CONTACTS_CACHE_FILE = path.join(__dirname, 'contacts_cache.json');
const BLAST_CACHE_DIR = path.join(__dirname, 'blast_logs');
const TRACKER_FILE = path.join(BLAST_CACHE_DIR, 'blast_tracker.json');

// Pastikan folder log lokal tersedia
if (!fs.existsSync(BLAST_CACHE_DIR)) {
    try { fs.mkdirSync(BLAST_CACHE_DIR, { recursive: true }); } catch (e) {}
}

// 11 Reason Kritis yang dipertegas jika tidak ada progres dari pagi ke siang/sore
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

// Normalisasi pencocokan cabang area
function isBranchMatching(branchToCheck, allowedBranches) {
    if (!branchToCheck || !allowedBranches || allowedBranches.length === 0) return false;
    const target = String(branchToCheck).trim().toUpperCase();
    return allowedBranches.some(a => {
        const cleanA = String(a).trim().toUpperCase();
        // Cegah salah match misal TANJUNG vs TANJUNGPINANG
        if (cleanA === 'TANJUNG' && target.includes('PINANG')) return false;
        if (target === 'TANJUNG' && cleanA.includes('PINANG')) return false;
        return target.includes(cleanA) || cleanA.includes(target);
    });
}

// Fetch technician phone number (from contacts)
function getTechPhone(engineerName, customContacts = {}) {
    if (!engineerName) return null;
    const cleanName = String(engineerName).trim().toUpperCase();
    if (customContacts[cleanName]) return customContacts[cleanName];

    // Coba hapus teks dalam kurung misal "(JANGAN DIPAKAI)"
    const noParen = cleanName.replace(/\(.*?\)/g, '').trim();
    if (customContacts[noParen]) return customContacts[noParen];

    // Fuzzy search
    for (const k in customContacts) {
        const kClean = k.toUpperCase().replace(/\(.*?\)/g, '').trim();
        if (kClean === cleanName || kClean === noParen) {
            return customContacts[k];
        }
    }
    return DEFAULT_CONTACTS[cleanName] || null;
}

// Fetch PIC/Leader phone number for branch (from contacts)
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

    if (options.dryRun) {
        console.log(`  🔍 [DRY RUN WA] Disimulasikan kirim ke ${waNumber} (${messageText.substring(0, 30).replace(/\n/g, ' ')}...)`);
        return true;
    }

    const chatId = waNumber + '@c.us';

    // Tambahkan variasi zero-width space agar hash unik (Anti-Spam WA)
    const zeroWidth = '\u200B'.repeat(Math.floor(Math.random() * 8) + 1);
    const finalMessage = messageText + zeroWidth;

    // Prioritas 1: Jika waClient diberikan langsung dari super_engine
    if (options.waClient && options.isReady) {
        try {
            await options.waClient.sendMessage(chatId, finalMessage);
            console.log(`  ✅ [WA SENT DIRECT] Berhasil kirim ke ${waNumber}`);
            await new Promise(r => setTimeout(r, options.delayMs || 3500));
            return true;
        } catch (err) {
            console.warn(`  ⚠️ [WA DIRECT FAIL] Gagal langsung ke ${waNumber}: ${err.message}, mencoba via API port 3001...`);
        }
    }

    // Prioritas 2: Kirim via Local Express API port 3001
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
            await new Promise(r => setTimeout(r, options.delayMs || 3500));
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

// Helper untuk baca/tulis state blast harian (Prioritas Local File agar hemat kuota Firestore)
function getLocalBlastState(dateStr) {
    const filePath = path.join(BLAST_CACHE_DIR, `blast_${dateStr}.json`);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            console.warn(`  [ALERTER] Gagal membaca local blast cache:`, e.message);
        }
    }
    return null;
}

function saveLocalBlastState(dateStr, data) {
    const filePath = path.join(BLAST_CACHE_DIR, `blast_${dateStr}.json`);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.warn(`  [ALERTER] Gagal menyimpan local blast cache:`, e.message);
    }
}

// Daily Blast Tracker: Mencegah blast terkirim ganda di jam/sesi yang sama
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

// Menentukan sesi blast aktif berdasarkan jadwal / waktu saat ini (WIB)
function getActiveBlastSession(scheduleSlot, forceSession = null) {
    if (forceSession) return forceSession.toUpperCase();

    // Cek jika keyword sesi eksplisit
    const s = String(scheduleSlot || '').toUpperCase();
    if (s.includes('MORNING')) return 'MORNING';
    if (s.includes('MIDDAY')) return 'MIDDAY';
    if (s.includes('CLOSING')) return 'CLOSING';

    // Parse waktu jam:menit jika tersedia (misal AUTO_09:15, 09:10, AUTO_12:12)
    let slotMins = null;
    const match = s.match(/(\d{1,2}):(\d{2})/);
    if (match) {
        slotMins = parseInt(match[1]) * 60 + parseInt(match[2]);
    }

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Evaluasi kedua kemungkinan: waktu yang tertera pada slot ATAU waktu aktual jam laptop
    const candidateMins = [currentMins];
    if (slotMins !== null) candidateMins.unshift(slotMins);

    for (const m of candidateMins) {
        // 1. Sesi Pagi (Target 09:10 / 09:15) — Window toleransi: 09:00 - 10:30 WIB
        if (m >= 9 * 60 && m < 10 * 60 + 30) {
            return 'MORNING';
        }

        // 2. Sesi Siang (Target 12:10 / 12:15) — Window toleransi: 12:00 - 13:30 WIB
        if (m >= 12 * 60 && m < 13 * 60 + 30) {
            return 'MIDDAY';
        }

        // 3. Sesi Sore / Closing (Target 15:10 / 15:15) — Window toleransi: 15:00 - 17:00 WIB
        if (m >= 15 * 60 && m < 17 * 60) {
            return 'CLOSING';
        }
    }

    return null; // Di luar jadwal blast resmi
}

// Main Alerting Handler
async function handleSmartAlerts(syncResult, options = {}) {
    if (!syncResult || !syncResult.analytics) {
        console.warn('  ⚠️ [ALERTER] syncResult / analytics tidak valid. Blasting dibatalkan.');
        return { success: false, reason: 'Invalid syncResult' };
    }

    // 1. Ambil kontak (Cek local cache dulu, fallback ke Firestore)
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
            console.warn("  [ALERTER] Menggunakan kontak lokal/cache (Firestore quota/network):", e.message);
        }
    }

    const { analytics, dateStr, timeStr, scheduleSlot } = syncResult;
    const { shameList = [], dosaCabangBills = [], rcStats = {} } = analytics;

    // 2. Filter STRICT HANYA cabang area BOS (Mencegah blasting liar ke cabang luar area)
    const allowedBranches = options.allowedBranches || config.BLAST_ALLOWED_BRANCHES || [
        'DENPASAR',
        'DENPASAR - CELLULAR WORLD',
        'DENPASAR - PLANET GADGET',
        'KUPANG',
        'SINGARAJA',
        'MANADO'
    ];

    const areaShameList = shameList.filter(item => {
        if (!item || !item.asc) return false;
        return isBranchMatching(item.asc, allowedBranches);
    });

    const areaDosaBills = dosaCabangBills.filter(b => {
        if (!b || !b.asc) return false;
        return isBranchMatching(b.asc, allowedBranches);
    });

    // 3. Tentukan Sesi Blast
    const session = getActiveBlastSession(scheduleSlot, options.forceSession);
    if (!session && !options.force) {
        console.log(`  ℹ️ [ALERTER] Waktu saat ini (${timeStr} WIB) di luar jendela jadwal blast (09:10, 12:10, 15:10). Auto-blast dilewati.`);
        return { success: true, skipped: true, reason: 'Outside blast window' };
    }

    const activeSession = session || 'MANUAL_BLAST';

    // 4. Cek Tracker Harian (Mencegah duplikasi tembak di sesi yang sama)
    const tracker = getBlastTracker();
    if (!tracker[dateStr]) tracker[dateStr] = {};

    if (tracker[dateStr][activeSession] && tracker[dateStr][activeSession].executed && !options.force) {
        console.log(`  ℹ️ [ALERTER] Sesi ${activeSession} untuk hari ini (${dateStr}) SUDAH BERHASIL dikirim pada pukul ${tracker[dateStr][activeSession].timestamp}. Melewati agar tidak duplikat.`);
        return { success: true, skipped: true, reason: 'Already blasted today' };
    }

    console.log('\n=============================================================');
    console.log(`  📱 SMART WA ALERTER — SESI: ${activeSession} (Slot: ${scheduleSlot})`);
    console.log(`  Cabang Area: ${allowedBranches.join(', ')}`);
    console.log(`  Teknisi Area Masuk Radar: ${areaShameList.length} orang`);
    console.log(`  Waktu: ${dateStr} ${timeStr} WIB`);
    console.log('=============================================================');

    const dailyBlastDocRef = doc(db, 'daily_blasts', dateStr);
    let sentCount = 0;
    let failedCount = 0;

    // =========================================================================
    // 🌅 1. Sesi Pagi (09:10 / 09:15 WIB) — Rule 5.3: Dosa Cabang + RC Delivery
    // =========================================================================
    if (activeSession === 'MORNING') {
        console.log('\n🌅 [SESI PAGI 09:10] Menjalankan Morning Operational Briefing...');
        let blastRecords = {};

        // A. Blast Dosa Cabang ke Setiap Teknisi di Cabang Area
        for (const item of areaShameList) {
            const phone = getTechPhone(item.engineer, customContacts);
            const bills = item.bills || [];
            bills.sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0)); // Terlama di atas

            let text = `🚨 *AGING WARNING [Update: 09:15 WIB]*\n\n`;
            text += `Selamat Pagi ${item.engineer},\n`;
            text += `Saat ini tercatat Anda memiliki *${item.count} unit pending* di cabang *${item.asc}*.\n`;
            text += `Mohon utamakan pengerjaan unit dengan aging tertinggi agar KPI cabang tetap aman:\n`;

            bills.forEach((b, index) => {
                text += `\n${index + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n`;
                text += `   👤 ${b.customer} | 📱 ${b.model}\n`;
                text += `   📌 Reason: ${b.reason}\n`;

                blastRecords[b.jobNo] = {
                    engineer: item.engineer,
                    phone: phone,
                    asc: item.asc,
                    model: b.model,
                    customer: b.customer,
                    reason: b.reason,
                    pendingDays: b.pendingDays,
                    firstBlastedAt: '09:15',
                    lastAlertSlot: '09:15',
                    status: 'PENDING'
                };
            });

            text += `\nMari tuntaskan sebelum evaluasi siang hari. Semangat bertugas! 🙏`;

            console.log(`\n📤 [PAGI] Mengirim Alert ke Teknisi: ${item.engineer} (${item.asc} - ${item.count} Unit)...`);
            const ok = await dispatchWAMessage(phone, text, options);
            if (ok) sentCount++; else failedCount++;
        }

        // B. Blast Pending Delivery / RC ke PIC Cabang Area (Sesuai Mandat Rule 5.3)
        console.log('\n📦 [PAGI RC] Mengecek Pending Delivery (RC) untuk PIC Cabang Area...');
        for (const branch of allowedBranches) {
            let matchedRc = null;
            for (const rcKey in rcStats) {
                if (isBranchMatching(rcKey, [branch])) {
                    matchedRc = rcStats[rcKey];
                    break;
                }
            }

            if (matchedRc && matchedRc.count > 0 && Array.isArray(matchedRc.bills) && matchedRc.bills.length > 0) {
                const picInfo = getBranchPICPhone(branch, customContacts);
                if (picInfo && picInfo.phone) {
                    const sortedRc = [...matchedRc.bills].sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));

                    let rcText = `🚨 *WARNING PENDING DELIVERY (RC) - ${branch} [Update: 09:15 WIB]*\n\n`;
                    rcText += `Selamat Pagi ${picInfo.name},\n`;
                    rcText += `Tercatat ada *${matchedRc.count} unit* dalam status Pending Delivery (Repair Completed).\n`;
                    rcText += `Mohon segera difollow-up ke kurir / customer (tawarkan antar D2D):\n`;

                    sortedRc.forEach((j, index) => {
                        rcText += `\n${index + 1}. *${j.jobNo}* (*${j.pendingDays} Hari*)\n`;
                        rcText += `   👤 ${j.customer} | 📱 ${j.model}\n`;
                        rcText += `   ⚠️ Reason: ${j.reason}\n`;
                    });

                    rcText += `\nMohon segera diproses demi menjaga performa aging cabang. Terima kasih! 🙏`;

                    console.log(`\n📤 [PAGI RC] Mengirim RC Alert ke PIC Cabang: ${branch} (${picInfo.phone} - ${matchedRc.count} Unit)...`);
                    const ok = await dispatchWAMessage(picInfo.phone, rcText, options);
                    if (ok) sentCount++; else failedCount++;
                } else {
                    console.warn(`  ⚠️ [PAGI RC] Nomor WA PIC untuk cabang ${branch} belum terdaftar di kontak.`);
                }
            }
        }

        const blastPayload = {
            date: dateStr,
            updatedAt: `${dateStr} ${timeStr} WIB`,
            totalBlastedEngineers: areaShameList.length,
            records: blastRecords
        };

        // Simpan baseline pagi ke local disk
        saveLocalBlastState(dateStr, blastPayload);

        // Sinkron ke Firestore daily_blasts
        try {
            await setDoc(dailyBlastDocRef, blastPayload, { merge: true });
            console.log(`  ✅ Baseline blast pagi tersimpan di Firestore: daily_blasts/${dateStr}`);
        } catch (e) {
            console.warn(`  ℹ️ Baseline tersimpan lokal (Firestore sync bypass):`, e.message);
        }

    // =========================================================================
    // ☀️ 2. Sesi Siang (12:10 WIB) & 🌇 Sesi Sore (15:10 WIB) — Rule 5.3: HANYA Teknisi
    // =========================================================================
    } else {
        const isMidday = (activeSession === 'MIDDAY');
        console.log(`\n⏰ [SESI ${activeSession}] Mengecek kelanjutan bill dari pagi untuk cabang area...`);

        // Prioritas ambil baseline dari local cache, fallback ke Firestore
        let morningData = getLocalBlastState(dateStr);
        if (!morningData) {
            try {
                const dailySnap = await getDoc(dailyBlastDocRef);
                if (dailySnap.exists()) morningData = dailySnap.data();
            } catch (e) {}
        }

        // Map bill yang MASIH pending pada tarikan saat ini (dari dosaCabangBills & shameList)
        const currentPendingMap = {};
        areaDosaBills.forEach(b => {
            if (b && b.jobNo) currentPendingMap[b.jobNo] = b;
        });
        areaShameList.forEach(item => {
            (item.bills || []).forEach(b => {
                if (b && b.jobNo && !currentPendingMap[b.jobNo]) {
                    currentPendingMap[b.jobNo] = { ...b, engineer: item.engineer, asc: item.asc };
                }
            });
        });

        const followUpPerEngineer = {};

        if (morningData && morningData.records && Object.keys(morningData.records).length > 0) {
            // Skenario Ideal: Ada data baseline pagi, evaluasi eskalasi secara cerdas
            const morningRecords = morningData.records;

            for (const jobNo in morningRecords) {
                const rec = morningRecords[jobNo];
                if (currentPendingMap[jobNo]) {
                    const currentBill = currentPendingMap[jobNo];

                    if (!followUpPerEngineer[rec.engineer]) {
                        followUpPerEngineer[rec.engineer] = {
                            phone: rec.phone || getTechPhone(rec.engineer, customContacts),
                            asc: rec.asc || currentBill.asc,
                            escalatedBills: [],
                            otherBills: []
                        };
                    }

                    const isStillSameReason = (String(rec.reason || '').trim().toUpperCase() === String(currentBill.reason || '').trim().toUpperCase());
                    if (isEscalationReason(currentBill.reason) && isStillSameReason) {
                        followUpPerEngineer[rec.engineer].escalatedBills.push(currentBill);
                    } else {
                        followUpPerEngineer[rec.engineer].otherBills.push(currentBill);
                    }
                } else {
                    rec.status = 'COMPLETED';
                }
            }
        } else {
            // Skenario Cadangan: Jika tarikan pagi terlewat, jangan batalkan siang/sore!
            // Tetap berikan alert ke teknisi berdasarkan snapshot aktif saat ini.
            console.log('  ℹ️ Baseline pagi tidak ditemukan. Menggunakan snapshot data terkini untuk follow-up...');
            for (const item of areaShameList) {
                const bills = item.bills || [];
                const escalated = [];
                const others = [];

                bills.forEach(b => {
                    if (isEscalationReason(b.reason)) escalated.push(b);
                    else others.push(b);
                });

                if (escalated.length > 0 || others.length > 0) {
                    followUpPerEngineer[item.engineer] = {
                        phone: getTechPhone(item.engineer, customContacts),
                        asc: item.asc,
                        escalatedBills: escalated,
                        otherBills: others
                    };
                }
            }
        }

        console.log(`\n📋 Ditemukan ${Object.keys(followUpPerEngineer).length} teknisi di area BOS yang masih memiliki pending bill.`);

        for (const engName in followUpPerEngineer) {
            const item = followUpPerEngineer[engName];
            const { escalatedBills, otherBills, phone, asc } = item;

            if (escalatedBills.length === 0 && otherBills.length === 0) continue;

            escalatedBills.sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));
            otherBills.sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));

            let text = "";

            if (isMidday) {
                // =============================================================
                // ☀️ Sesi Siang (Pukul 12:10 / 12:15 WIB) — Follow-Up & Escalation
                // =============================================================
                text += `⚠️ *AGING WARNING [Update: 12:15 WIB]*\n\n`;
                text += `Halo ${engName} (${asc || '-'}),\n`;
                text += `Evaluasi siang hari: Unit berikut tercatat masih belum selesai di GSPN:\n`;

                if (escalatedBills.length > 0) {
                    text += `\n🔴 *UNIT BUTUH TINDAKAN SEGERA (STAGNAN SEJAK PAGI):*\n`;
                    escalatedBills.forEach(b => {
                        text += `\n• *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.model}\n`;
                        text += `  ⚠️ Status: ${b.reason}\n`;
                        text += `  💬 Tindakan: Segera eksekusi / hubungi user / update status di GSPN sebelum evaluasi sore jam 15:00!\n`;
                    });
                }

                if (otherBills.length > 0) {
                    text += `\n(Daftar unit pending lainnya yang tetap wajib diselesaikan:)\n`;
                    otherBills.forEach((b, idx) => {
                        text += `${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.reason}\n`;
                    });
                }

                text += `\nJangan biarkan unit menginap lebih lama dan memicu penalti KPI cabang! Semangat tuntaskan! 🙏`;

            } else {
                // =============================================================
                // 🌇 Sesi Sore (Pukul 15:10 / 15:15 WIB) — Closing Escalation
                // =============================================================
                text += `🚨 *CRITICAL ALERT [Update: 15:15 WIB]*\n\n`;
                text += `Perhatian ${engName} (${asc || '-'}),\n`;
                text += `Jam operasional segera berakhir! Unit berikut tercatat *BELUM ADA PROGRES SEJAK PAGI* dan berada di ambang batas toleransi:\n`;

                if (escalatedBills.length > 0) {
                    text += `\n⛔ *DEADLINE CLOSING HARI INI:*\n`;
                    escalatedBills.forEach(b => {
                        text += `\n• *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.model}\n`;
                        text += `  🚨 Stagnant Reason: ${b.reason}\n`;
                        text += `  ⚡ Instruksi: WAJIB DISELESAIKAN ATAU DI-UPDATE SEKARANG! Jangan sampai unit ini masuk ke laporan evaluasi manajemen malam ini!\n`;
                    });
                }

                if (otherBills.length > 0) {
                    text += `\n(Unit pending lainnya yang masih gantung:)\n`;
                    otherBills.forEach((b, idx) => {
                        text += `${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.reason}\n`;
                    });
                }

                text += `\nPenyelesaian unit ini sangat krusial bagi penilaian performa teknisi dan grading cabang hari ini. Segera bereskan! 🙏`;
            }

            console.log(`\n📤 [${activeSession}] Mengirim Follow-Up ke Teknisi: ${engName} (${escalatedBills.length} Eskalasi, ${otherBills.length} Lainnya)...`);
            const ok = await dispatchWAMessage(phone, text, options);
            if (ok) sentCount++; else failedCount++;
        }

        // Catat update di morningData jika tersedia
        if (morningData) {
            morningData.lastFollowUpSlot = activeSession;
            morningData.lastFollowUpAt = `${dateStr} ${timeStr} WIB`;
            saveLocalBlastState(dateStr, morningData);
            try {
                await setDoc(dailyBlastDocRef, morningData, { merge: true });
            } catch (_) {}
        }
    }

    // 5. Update Tracker Harian
    tracker[dateStr][activeSession] = {
        executed: true,
        timestamp: `${dateStr} ${timeStr} WIB`,
        sent: sentCount,
        failed: failedCount,
        totalEngineers: areaShameList.length
    };
    saveBlastTracker(tracker);

    // Update Telemetry Status ke Firestore
    try {
        await setDoc(doc(db, 'rpa_commands', 'wa_blast_status'), {
            lastBlastSession: activeSession,
            lastBlastDate: dateStr,
            lastBlastTime: `${timeStr} WIB`,
            sentCount: sentCount,
            failedCount: failedCount,
            allowedBranches: allowedBranches,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (_) {}

    console.log('\n=============================================================');
    console.log(`  🎉 SMART WA ALERTER SESI ${activeSession} SELESAI!`);
    console.log(`  Terkirim Sukses: ${sentCount} | Gagal: ${failedCount}`);
    console.log('=============================================================\n');

    return {
        success: true,
        session: activeSession,
        sent: sentCount,
        failed: failedCount
    };
}

module.exports = {
    handleSmartAlerts,
    getActiveBlastSession,
    getTechPhone,
    getBranchPICPhone,
    dispatchWAMessage,
    getBlastTracker,
    DEFAULT_CONTACTS
};
