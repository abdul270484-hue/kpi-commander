// ============================================
// WHATSAPP MESSAGING SERVICE
// ============================================

function normalizeName(name) {
    if (!name) return '';
    // Hapus escape karakter \ yang mungkin masuk dari replace(/'/g, "\\'")
    let n = name.replace(/\\'/g, "'");
    return n.trim().replace(/\s+/g, ' ').toUpperCase();
}

function getTechPhone(engName) {
    const contacts = window.techContacts || JSON.parse(localStorage.getItem('bujm_tech_contacts')) || {};
    const norm = normalizeName(engName);
    
    if (contacts[engName]) return contacts[engName];
    if (contacts[norm]) return contacts[norm];
    
    // Fuzzy search
    for (let key in contacts) {
        if (normalizeName(key) === norm) {
            return contacts[key];
        }
    }
    return null;
}

function getTechName(engName) {
    const names = window.techNames || {};
    const norm = normalizeName(engName);
    
    if (names[engName]) return names[engName];
    if (names[norm]) return names[norm];
    
    // Fuzzy search
    for (let key in names) {
        if (normalizeName(key) === norm) {
            return names[key];
        }
    }
    return engName.replace(/\\'/g, "'");
}

export function getWAPayloadShame(engName, asc, count, detail) {
    const phone = getTechPhone(engName);
    if (!phone) return null;
    
    // Format to 62...
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    }
    
    const displayName = getTechName(engName);
    
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const tzOffset = now.getTimezoneOffset();
    let tzLabel = 'WIB';
    if (tzOffset <= -540) tzLabel = 'WIT';
    else if (tzOffset <= -480) tzLabel = 'WITA';

    // Daftar 11 Reason Kritis yang dipertegas saat Siang & Sore
    const CRITICAL_TARGET_REASONS = [
        'MONITORING/AGING OR NOT REPRODUCED',
        'RE-SCHEDULING BY ENG\'R OR ASC',
        'NEED TO SET APPOINTMENT DATE',
        'WAITING FOR WARRANTY DOCUMENTS',
        'CHECKING CUSTOMER INFO',
        'ASSIGN TO ENG\'R AFTER PARTS RECEIVED',
        'WAITING FOR CONFIRMATION FROM CUSTOMER',
        'REPAIR IN PROGRESS',
        'REPAIR IN PROGRESS AFTER PARTS RECEIVED',
        'PARTS ARRIVED BUT NO G/R YET(ASC)',
        'REQUEST TECH SUPPORT (TECHNICAL PROBLEM)'
    ];

    const isTargetReason = (reasonText) => {
        if (!reasonText) return false;
        const norm = reasonText.toUpperCase().trim();
        return CRITICAL_TARGET_REASONS.some(target => norm.includes(target) || target.includes(norm));
    };

    // Ambil daftar bills teknisi
    let bills = [];
    const shameListSource = (window.shameData && Array.isArray(window.shameData)) 
        ? window.shameData 
        : (window.rawDashboardData && Array.isArray(window.rawDashboardData.shameList) ? window.rawDashboardData.shameList : []);
    
    const found = shameListSource.find(s => normalizeName(s.engineer) === normalizeName(engName));
    if (found && Array.isArray(found.bills)) {
        bills = [...found.bills];
    }
    bills.sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));

    // Pisahkan bills yang masuk 11 reason kritis dan bills lainnya
    const criticalBills = bills.filter(b => isTargetReason(b.reason));
    const otherBills = bills.filter(b => !isTargetReason(b.reason));

    let text = '';

    // GRADASI 1: SESI SORE (>= 14:30 WIB) — Closing Escalation & Final Push
    if (totalMinutes >= 14 * 60 + 30) {
        text = `🚨 *CRITICAL ALERT [Update: ${timeStr} ${tzLabel}]*\n\n`;
        text += `Perhatian *${displayName}*,\n`;
        text += `Jam operasional segera berakhir! Unit berikut tercatat *BELUM ADA PROGRES SEJAK PAGI* dan berada di ambang batas toleransi:\n\n`;
        
        if (criticalBills.length > 0) {
            text += `⛔ *DEADLINE CLOSING HARI INI:*\n`;
            criticalBills.forEach((b, idx) => {
                text += `\n${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n👤 ${b.customer}\n📱 ${b.model}\n🚨 Stagnant Reason: *${b.reason}*\n⚡ *Instruksi:* WAJIB DISELESAIKAN ATAU DI-UPDATE SEKARANG! Jangan sampai unit ini masuk ke laporan evaluasi manajemen malam ini!\n`;
            });
        }

        if (otherBills.length > 0) {
            text += `\n_(Daftar unit pending lainnya tetap wajib diselesaikan:)_\n`;
            otherBills.forEach((b, idx) => {
                text += `${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.reason}\n`;
            });
        }

        text += `\nPenyelesaian unit ini sangat krusial bagi penilaian performa teknisi dan grading cabang hari ini.`;

    // GRADASI 2: SESI SIANG (>= 11:30 s/d < 14:30 WIB) — Midday Follow-Up & Escalation
    } else if (totalMinutes >= 11 * 60 + 30) {
        text = `⚠️ *AGING WARNING [Update: ${timeStr} ${tzLabel}]*\n\n`;
        text += `*${displayName}*,\n`;
        text += `Bill belum ada update\n\n`;

        if (criticalBills.length > 0) {
            text += `🔴 *UNIT BUTUH TINDAKAN SEGERA DARI PAGI GA ADA PERUBAHAN:*\n`;
            criticalBills.forEach((b, idx) => {
                text += `\n${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n👤 ${b.customer}\n📱 ${b.model}\n⚠️ Status: *${b.reason}*\n💬 Action: Mohon segera dieksekusi / hubungi user / update status di GSPN sebelum tarikan sore jam 15:00!\n`;
            });
        }

        if (otherBills.length > 0) {
            text += `\n_(Daftar unit pending lainnya tetap wajib diselesaikan:)_\n`;
            otherBills.forEach((b, idx) => {
                text += `${idx + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*) — ${b.reason}\n`;
            });
        }

        text += `\nJangan biarkan unit menginap lebih lama dan memicu penalty KPI!`;

    // GRADASI 3: SESI PAGI (< 11:30 WIB) — Morning Operational Briefing
    } else {
        text = `🚨 *AGING WARNING [Update: ${timeStr} ${tzLabel}]*\n\n`;
        text += `Selamat Pagi *${displayName}*,\n`;
        text += `Saat ini tercatat Anda memiliki *${count} unit pending*.\n`;
        text += `Mohon utamakan pengerjaan unit dengan aging tertinggi agar KPI cabang tetap aman:\n`;

        if (bills.length > 0) {
            bills.forEach((b, index) => {
                text += `\n${index + 1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n👤 ${b.customer}\n📱 ${b.model}\n📌 Reason: *${b.reason}*\n`;
            });
        }

        text += `\nMari tuntaskan sebelum evaluasi siang hari. Semangat bertugas!`;
    }

    return { phone: waNumber, name: displayName, text: text };
}

export function sendWA(engName, asc, count, detail) {
    const payload = getWAPayloadShame(engName, asc, count, detail);
    if (!payload) {
        if (window.showToastNotification) window.showToastNotification('WhatsApp number is not configured! Please open "Technician Contacts" menu above first.');
        return;
    }
    
    const url = `https://wa.me/${payload.phone}?text=${encodeURIComponent(payload.text)}`;
    window.open(url, '_blank');
}

export function getWAPayloadRC(asc, count) {
    let engName = `PIC ${asc}`;
    let phone = getTechPhone(engName);
    
    if (!phone) {
        // Fallback ke Kacab jika PIC kosong
        engName = `Kacab ${asc}`;
        phone = getTechPhone(engName);
    }
    
    if (!phone) return null;
    
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    }
    
    const displayName = getTechName(engName);
    
const now = new Date();
    const hours = now.getHours();
    let greeting = 'Pagi';
    if (hours >= 11 && hours < 15) greeting = 'Siang';
    else if (hours >= 15 && hours < 18) greeting = 'Sore';
    else if (hours >= 18) greeting = 'Malam';
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    let text = `🚨 *WARNING PENDING DELIVERY (RC) - BRANCH ${asc} [Update: ${timeStr} WIB]*\n\nSelamat ${greeting} ${displayName},\nHere are *${count} units* in Pending Delivery (Repair Completed). Please follow up immediately with courier / customer (offer D2D delivery):\n`;
    
    const rcSource = (window.rcData && Object.keys(window.rcData).length > 0)
        ? window.rcData
        : (window.rawDashboardData && window.rawDashboardData.rcStats ? window.rawDashboardData.rcStats : null);

    if (rcSource && rcSource[asc]) {
        const bills = rcSource[asc].bills || [];
        const sortedBills = [...bills].sort((a, b) => b.pendingDays - a.pendingDays);
        
        sortedBills.forEach((j, index) => {
            text += `\n${index+1}. *${j.jobNo}* (*${j.pendingDays} Hari*)\n   👤 ${j.customer}\n   📱 ${j.model}\n   ⚠️ ${j.reason}\n`;
        });
    }
    
    text += `\nPlease process immediately to maintain branch aging performance. Thank you.`;
    return { phone: waNumber, name: displayName, text: text };
}

export function sendWARC(asc, count) {
    const payload = getWAPayloadRC(asc, count);
    if (!payload) {
        if (window.showToastNotification) window.showToastNotification(`WhatsApp number is not configured for PIC/Branch Head ${asc}!`);
        return;
    }
    
    const url = `https://wa.me/${payload.phone}?text=${encodeURIComponent(payload.text)}`;
    window.open(url, '_blank');
}

export function sendWADosaSingleBranch(asc) {
    let engName = `PIC ${asc}`;
    let phone = getTechPhone(engName);
    
    if (!phone) {
        if (window.showToastNotification) window.showToastNotification(`WhatsApp number is not configured for PIC ${asc}! Please open "Technician Contacts" menu above first.`);
        return;
    }
    
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    }
    
    const displayName = getTechName(engName);
    
    if (!window.dosaCabangStatsGlobal || !window.dosaCabangStatsGlobal[asc]) return;
    const bills = window.dosaCabangStatsGlobal[asc].bills;
    
    let text = `🚨 *Branch Defect Aging Warning (> 7 Days)*\n\nHello ${displayName},\nHere is the list of pending bills originating from branch internal delays exceeding 7 days (excluding SEIN/Part constraints):\n`;
    
    bills.sort((a, b) => b.pendingDays - a.pendingDays);
    
    bills.forEach((b, index) => {
        text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason || '-'}\n`;
    });
    
    text += `\nPlease follow up on the above pending units today to prevent branch aging degradation. Thank you. 🙏`;
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

export function sendWARedo(engName, jobNo, model) {
    const phone = getTechPhone(engName);
    if (!phone) {
        if (window.showToastNotification) window.showToastNotification('Nomor WA belum disetting! Buka menu "Kontak Teknisi" di atas dulu.');
        return;
    }
    
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    }
    
    const displayName = getTechName(engName);
    
    const text = `🚨 *WARNING REDO (Repair Violation)*\n\nHalo ${displayName},\nPlease inspect the following unit immediately as it has been flagged as *REDO* (Repeated repair / customer complaint):\n\nNo Job: *${jobNo}*\nModel: *${model}*\n\n_Please retrieve or follow up immediately before it impacts performance grading._`;
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}
