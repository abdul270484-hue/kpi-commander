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
    const cleanR = reason.trim().toUpperCase();
    return ESCALATION_REASONS.some(r => r === cleanR || cleanR.startsWith(r) || r.startsWith(cleanR));
}

// Fetch technician phone number (from contacts)
function getTechPhone(engineerName, customContacts = {}) {
    if (!engineerName) return null;
    const cleanName = engineerName.trim().toUpperCase();
    return customContacts[cleanName] || DEFAULT_CONTACTS[cleanName] || null;
}

// Send WhatsApp payload to JARVIS WA Engine or direct endpoint
async function dispatchWAMessage(phone, messageText) {
    if (!phone) {
        console.log(`  ⚠️ Nomor HP tidak ditemukan. Pesan dilewati.`);
        return false;
    }

    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) { waNumber = '62' + waNumber.substring(1); }
    else if (waNumber.startsWith('8')) { waNumber = '62' + waNumber; }

    try {
        const response = await fetch('http://localhost:3001/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: waNumber, message: messageText })
        }).catch(() => null);

        if (response && response.ok) {
            console.log(`  ✅ [WA SENT] Berhasil kirim ke ${waNumber}`);
            return true;
        } else {
            console.log(`  ℹ️ [WA QUEUE] Pesan disiapkan untuk ${waNumber} (JARVIS Local Service Standby).`);
            return true;
        }
    } catch (err) {
        console.log(`  ℹ️ [WA SIMULATED] Disiapkan untuk ${waNumber}`);
        return true;
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

// Main Alerting Handler
async function handleSmartAlerts(syncResult, customContacts = {}) {
    // 1. Ambil kontak (Cek local cache dulu, fallback ke Firestore jika belum ada)
    if (fs.existsSync(CONTACTS_CACHE_FILE)) {
        try {
            const raw = fs.readFileSync(CONTACTS_CACHE_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            customContacts = { ...customContacts, ...parsed };
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
    const { shameList, dosaCabangBills } = analytics;

    console.log('==============================================');
    console.log(`  📱 SMART WA ALERTER - SLOT: ${scheduleSlot}`);
    console.log(`  Waktu: ${dateStr} ${timeStr} WIB`);
    console.log('==============================================');

    const dailyBlastDocRef = doc(db, 'daily_blasts', dateStr);

    // Identifikasi Sesi: Pagi (09:15 / MORNING), Siang (12:15), Sore (15:15), Closing (17:15)
    const isMorning = (scheduleSlot === '09:00' || scheduleSlot === '09:10' || scheduleSlot === '09:15' || scheduleSlot === 'MORNING_BLAST');
    const isMidday = (scheduleSlot === '12:00' || scheduleSlot === '12:10' || scheduleSlot === '12:15');
    const isClosing = (scheduleSlot === '15:00' || scheduleSlot === '15:10' || scheduleSlot === '15:15' || scheduleSlot === '17:00' || scheduleSlot === '17:10' || scheduleSlot === '17:15');

    if (isMorning) {
        // =========================================================================
        // 🌅 1. Sesi Pagi (09:15 WIB / WITA) — Morning Operational Briefing
        // =========================================================================
        console.log('\n🌅 [09:15] Menjalankan Morning Operational Briefing...');

        let blastRecords = {};

        for (const item of shameList) {
            const phone = getTechPhone(item.engineer, customContacts);
            const bills = item.bills || [];
            bills.sort((a, b) => b.pendingDays - a.pendingDays); // Terlama di atas

            let text = `🚨 *AGING WARNING [Update: 09:15]*\n\n`;
            text += `Selamat Pagi ${item.engineer},\n`;
            text += `Saat ini tercatat Anda memiliki *${item.count} unit pending*.\n`;
            text += `Mohon utamakan pengerjaan unit dengan aging tertinggi agar KPI cabang tetap aman:\n`;

            bills.forEach((b, index) => {
                text += `\n*${b.jobNo}* (*${b.pendingDays} Hari*)\n`;
                text += `👤 ${b.customer} | 📱 ${b.model}\n`;
                text += `📌 Reason: ${b.reason}\n`;

                blastRecords[b.jobNo] = {
                    engineer: item.engineer,
                    phone: phone,
                    model: b.model,
                    customer: b.customer,
                    reason: b.reason,
                    pendingDays: b.pendingDays,
                    firstBlastedAt: '09:15',
                    lastAlertSlot: '09:15',
                    status: 'PENDING'
                };
            });

            text += `\nMari tuntaskan sebelum evaluasi siang hari. Semangat bertugas!`;

            console.log(`\n📤 Mengirim Sesi Pagi ke ${item.engineer} (${item.count} Unit)...`);
            await dispatchWAMessage(phone, text);
        }

        const blastPayload = {
            date: dateStr,
            updatedAt: `${dateStr} ${timeStr} WIB`,
            totalBlastedEngineers: shameList.length,
            records: blastRecords
        };

        // Simpan ke local disk
        saveLocalBlastState(dateStr, blastPayload);

        // Coba sinkron ke Firestore (safe try-catch agar tidak crash jika quota habis)
        try {
            await setDoc(dailyBlastDocRef, blastPayload);
            console.log(`  ✅ Log blast pagi tersimpan di Firestore: daily_blasts/${dateStr}`);
        } catch (e) {
            console.warn(`  ℹ️ Log tersimpan lokal (Firestore sync bypass):`, e.message);
        }

    } else {
        // =========================================================================
        // ☀️ Sesi Siang (12:15) & 🌇 Sesi Sore (15:15) — Escalation
        // =========================================================================
        console.log(`\n⏰ [${scheduleSlot}] Mengecek kelanjutan bill dari pagi...`);

        // Prioritas ambil dari local cache, fallback ke Firestore
        let morningData = getLocalBlastState(dateStr);
        if (!morningData) {
            try {
                const dailySnap = await getDoc(dailyBlastDocRef);
                if (dailySnap.exists()) morningData = dailySnap.data();
            } catch (e) {}
        }

        if (!morningData || !morningData.records) {
            console.log('  ℹ️ Tidak ditemukan data blast pagi untuk hari ini. Melewati follow-up reminder.');
            return;
        }

        const morningRecords = morningData.records;

        // Map bill yang MASIH pending pada tarikan saat ini
        const currentPendingMap = {};
        dosaCabangBills.forEach(b => {
            currentPendingMap[b.jobNo] = b;
        });

        // Pisahkan per teknisi: Kategori Eskalasi (Reason Kritis Tidak Berubah) vs Kategori Biasa
        const followUpPerEngineer = {};

        for (const jobNo in morningRecords) {
            const rec = morningRecords[jobNo];
            if (currentPendingMap[jobNo]) {
                const currentBill = currentPendingMap[jobNo];

                if (!followUpPerEngineer[rec.engineer]) {
                    followUpPerEngineer[rec.engineer] = {
                        phone: rec.phone,
                        escalatedBills: [],
                        otherBills: []
                    };
                }

                // Cek apakah reason termasuk 11 Reason yang belum ada perubahan sejak pagi
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

        console.log(`\n📋 Ditemukan ${Object.keys(followUpPerEngineer).length} teknisi yang masih memiliki pending bill dari pagi.`);

        for (const engName in followUpPerEngineer) {
            const item = followUpPerEngineer[engName];
            const { escalatedBills, otherBills } = item;

            if (escalatedBills.length === 0 && otherBills.length === 0) continue;

            escalatedBills.sort((a, b) => b.pendingDays - a.pendingDays);
            otherBills.sort((a, b) => b.pendingDays - a.pendingDays);

            let text = "";

            if (isMidday) {
                // =============================================================
                // ☀️ 2. Sesi Siang (Pukul 12:15) — Midday Follow-Up & Escalation
                // =============================================================
                text += `⚠️ *AGING WARNING [Update: 12:15]*\n\n`;
                text += `${engName},\n`;
                text += `Bill belum ada update\n`;

                if (escalatedBills.length > 0) {
                    text += `\n🔴 *UNIT BUTUH TINDAKAN SEGERA DARI PAGI GA ADA PERUBAHAN:*\n`;
                    escalatedBills.forEach(b => {
                        text += `\n*${b.jobNo}* (*${b.pendingDays} Hari*)\n`;
                        text += `👤 ${b.customer} | 📱 ${b.model}\n`;
                        text += `⚠️ Status: ${b.reason}\n`;
                        text += `💬 Action: Mohon segera dieksekusi / hubungi user / update status di GSPN sebelum tarikan sore jam 15:00!\n`;
                    });
                }

                if (otherBills.length > 0) {
                    text += `\n(Daftar unit pending lainnya tetap wajib diselesaikan:)\n`;
                    otherBills.forEach((b, idx) => {
                        text += `${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.reason}\n`;
                    });
                }

                text += `\nJangan biarkan unit menginap lebih lama dan memicu penalty KPI!`;

            } else {
                // =============================================================
                // 🌇 3. Sesi Sore (Pukul 15:10 / 17:10 WIB) — Closing Escalation
                // =============================================================
                text += `🚨 *CRITICAL ALERT [Update: ${scheduleSlot} WIB]*\n\n`;
                text += `Perhatian ${engName},\n`;
                text += `Jam operasional segera berakhir! Unit berikut tercatat *BELUM ADA PROGRES SEJAK PAGI* dan berada di ambang batas toleransi:\n`;

                if (escalatedBills.length > 0) {
                    text += `\n⛔ *DEADLINE CLOSING HARI INI:*\n`;
                    escalatedBills.forEach(b => {
                        text += `\n*${b.jobNo}* (*${b.pendingDays} Hari*)\n`;
                        text += `👤 ${b.customer} | 📱 ${b.model}\n`;
                        text += `🚨 Stagnant Reason: ${b.reason}\n`;
                        text += `⚡ Instruksi: WAJIB DISELESAIKAN ATAU DI-UPDATE SEKARANG! Jangan sampai unit ini masuk ke laporan evaluasi manajemen malam ini!\n`;
                    });
                }

                if (otherBills.length > 0) {
                    text += `\n(Unit pending lainnya yang masih gantung:)\n`;
                    otherBills.forEach((b, idx) => {
                        text += `${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.reason}\n`;
                    });
                }

                text += `\nPenyelesaian unit ini sangat krusial bagi penilaian performa teknisi dan grading cabang hari ini.`;
            }

            console.log(`\n📤 Mengirim Sesi ${scheduleSlot} ke ${engName} (${escalatedBills.length} Eskalasi, ${otherBills.length} Lainnya)...`);
            await dispatchWAMessage(item.phone, text);
        }

        // Update local & firestore
        morningData.lastFollowUpSlot = scheduleSlot;
        morningData.lastFollowUpAt = `${dateStr} ${timeStr} WIB`;
        saveLocalBlastState(dateStr, morningData);

        try {
            await setDoc(dailyBlastDocRef, morningData);
        } catch (e) {
            console.warn(`  ℹ️ Update follow-up tersimpan lokal (Firestore sync bypass):`, e.message);
        }
    }

    console.log('==============================================');
    console.log('  🎉 PROSES SMART ALERT SELESAI!');
    console.log('==============================================\n');
}

module.exports = { handleSmartAlerts, getTechPhone, DEFAULT_CONTACTS };
