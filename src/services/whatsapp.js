// ============================================
// WHATSAPP MESSAGING SERVICE
// ============================================

function normalizeName(name) {
    if (!name) return '';
    // Hapus escape karakter \ yang mungkin masuk dari replace(/'/g, "\\'")
    let n = name.replace(/\\'/g, "'");
    return n.trim().replace(/\s+/g, ' ').toUpperCase();
}

function formatWANumber(phone) {
    if (!phone) return null;
    let waNumber = String(phone).replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    } else if (waNumber.startsWith('8')) {
        waNumber = '62' + waNumber;
    }
    return waNumber;
}

export function getBranchTimezone(asc) {
    if (!asc) return 'WIB';
    const norm = String(asc).toUpperCase().trim();
    if (norm.includes('PINANG')) return 'WIB'; // Tanjungpinang is Kep. Riau (WIB)
    
    const witaKeywords = [
        'BANJARMASIN', 'SAMARINDA', 'BALIKPAPAN', 'PALANGKARAYA', 'TARAKAN', 
        'TANJUNG', 'BERAU', 'MAKASSAR', 'MANADO', 'PALU', 'KENDARI', 'GORONTALO',
        'KOTAMOBAGU', 'PAREPARE', 'PALOPO', 'MAMUJU', 'DENPASAR', 'MATARAM', 'KUPANG'
    ];
    if (witaKeywords.some(k => norm.includes(k))) return 'WITA';
    
    const witKeywords = ['JAYAPURA', 'AMBON', 'SORONG', 'TIMIKA', 'TERNATE', 'MANOKWARI'];
    if (witKeywords.some(k => norm.includes(k))) return 'WIT';
    
    const tzOffset = new Date().getTimezoneOffset();
    if (tzOffset <= -540) return 'WIT';
    if (tzOffset <= -480) return 'WITA';
    return 'WIB';
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

export function getBranchPICContact(asc) {
    if (!asc) return null;
    const contacts = window.techContacts || JSON.parse(localStorage.getItem('bujm_tech_contacts')) || {};
    const names = window.techNames || {};
    const normAsc = normalizeName(asc);
    
    const candidates = [
        `PIC ${asc}`,
        `KACAB ${asc}`,
        `LEADER ${asc}`,
        `PIC - ${asc}`,
        `KACAB - ${asc}`,
        asc
    ];
    
    for (let c of candidates) {
        let phone = getTechPhone(c);
        if (phone) {
            let displayName = getTechName(c) || c;
            return { phone: formatWANumber(phone), name: displayName, key: c };
        }
    }
    
    // Fuzzy search: search key containing both branch and PIC/KACAB/LEADER
    for (let key in contacts) {
        const normKey = normalizeName(key);
        if (normAsc === 'TANJUNG' && normKey.includes('PINANG')) continue;
        if (normKey.includes(normAsc) && (normKey.includes('PIC') || normKey.includes('KACAB') || normKey.includes('LEADER') || normKey.includes('KEPALA'))) {
            let phone = contacts[key];
            if (phone) {
                return { phone: formatWANumber(phone), name: names[key] || key, key };
            }
        }
    }
    
    // Fallback: search key matching branch alone
    for (let key in contacts) {
        const normKey = normalizeName(key);
        if (normAsc === 'TANJUNG' && normKey.includes('PINANG')) continue;
        if (normKey === normAsc || normKey === `CABANG ${normAsc}`) {
            let phone = contacts[key];
            if (phone) {
                return { phone: formatWANumber(phone), name: names[key] || key, key };
            }
        }
    }

    return null;
}

function isBranchMatching(billAsc, targetAsc) {
    if (!billAsc || !targetAsc) return true;
    const bAsc = normalizeName(billAsc);
    const tAsc = normalizeName(targetAsc);
    if (tAsc === 'TANJUNG' && bAsc.includes('PINANG')) return false;
    if (bAsc === 'TANJUNG' && tAsc.includes('PINANG')) return false;
    return bAsc === tAsc || bAsc.includes(tAsc) || tAsc.includes(bAsc);
}

export function getBillsForEngineer(engName, ascName) {
    const normEng = normalizeName(engName);
    const normAsc = ascName ? normalizeName(ascName) : '';

    // Ignore placeholder / unknown / non-technician names
    if (!normEng || normEng === 'UNKNOWN ENGINEER' || normEng === 'UNKNOWN' || normEng === 'UNKNOWN_ENGINEER' || normEng === 'N/A' || normEng.startsWith('PIC ') || normEng.startsWith('KACAB ')) {
        return [];
    }

    // 1. Check in window.soBillsByBranchGlobal (Highest fidelity: verified branch SO pull)
    const soBranchSource = window.soBillsByBranchGlobal;
    if (soBranchSource && normAsc) {
        for (let bKey in soBranchSource) {
            if (isBranchMatching(bKey, normAsc)) {
                const bills = soBranchSource[bKey];
                if (Array.isArray(bills)) {
                    const matched = bills.filter(b => {
                        const bEng = normalizeName(b.engineer);
                        const isAging = b.category === 'MX' || b.category === 'VD' || b.category === 'DA' || (b.pendingDays && b.pendingDays > 0);
                        return bEng === normEng && isAging;
                    });
                    if (matched.length > 0) return matched;
                }
            }
        }
    }

    // 2. Check in window.shameData (Strictly filter out foreign branch bills)
    if (window.shameData && Array.isArray(window.shameData)) {
        const found = window.shameData.find(s => {
            if (normalizeName(s.engineer) !== normEng) return false;
            if (normAsc && s.asc && !isBranchMatching(s.asc, normAsc)) return false;
            return true;
        });
        if (found && Array.isArray(found.bills) && found.bills.length > 0) {
            const matched = found.bills.filter(b => isBranchMatching(b.asc, normAsc));
            if (matched.length > 0) return matched;
        }
    }

    // 3. Check in window.branchData / branchStats
    const branchSource = window.branchData || (window.rawDashboardData && window.rawDashboardData.branchStats);
    if (branchSource && normAsc) {
        for (let bKey in branchSource) {
            if (isBranchMatching(bKey, normAsc)) {
                const bTotal = branchSource[bKey]?.bills?.total;
                if (Array.isArray(bTotal)) {
                    const matched = bTotal.filter(b => {
                        const bEng = normalizeName(b.engineer);
                        const isAging = b.category === 'MX' || b.category === 'VD' || b.category === 'DA' || (b.pendingDays && b.pendingDays > 0);
                        return bEng === normEng && isAging;
                    });
                    if (matched.length > 0) return matched;
                }
            }
        }
    }

    // 4. Check in window.engineerData or window.prodData (Must match branch!)
    const engDataSource = window.engineerData || window.prodData || (window.rawDashboardData && window.rawDashboardData.engineerStats);
    if (engDataSource) {
        let candidateBills = [];
        if (engDataSource[engName] && Array.isArray(engDataSource[engName].bills)) {
            candidateBills = engDataSource[engName].bills;
        } else {
            for (let k in engDataSource) {
                if (normalizeName(k) === normEng && Array.isArray(engDataSource[k].bills)) {
                    candidateBills = engDataSource[k].bills;
                    break;
                }
            }
        }
        if (candidateBills.length > 0) {
            const matched = candidateBills.filter(b => isBranchMatching(b.asc, normAsc));
            if (matched.length > 0) return matched;
        }
    }

    // 5. Check in window.dosaCabangData
    const dosaSource = window.dosaCabangData || (window.rawDashboardData && window.rawDashboardData.dosaCabangOver7);
    if (Array.isArray(dosaSource)) {
        const matched = dosaSource.filter(b => {
            if (normalizeName(b.engineer) !== normEng) return false;
            return isBranchMatching(b.asc, normAsc);
        });
        if (matched.length > 0) return matched;
    }

    return [];
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

export function getWAPayloadShameBranch(asc, branchTechs) {
    if (!asc || !Array.isArray(branchTechs) || branchTechs.length === 0) return null;
    
    const picContact = getBranchPICContact(asc);
    const phone = picContact ? picContact.phone : null;
    const picDisplayName = picContact ? picContact.name : `PIC ${asc}`;

    // 1. Filter ONLY real human technicians (exclude UNKNOWN ENGINEER and PIC placeholders)
    const validTechs = branchTechs.filter(item => {
        if (!item || !item.engineer) return false;
        const norm = normalizeName(item.engineer);
        if (!norm || norm === 'UNKNOWN ENGINEER' || norm === 'UNKNOWN' || norm === 'UNKNOWN_ENGINEER' || norm === 'N/A' || norm.startsWith('PIC ') || norm.startsWith('KACAB ')) {
            return false;
        }
        return true;
    });

    if (validTechs.length === 0) return null;

    // 2. Sort technicians alphabetically by engineer name
    const sortedTechs = [...validTechs].sort((a, b) => {
        const nameA = (a.engineer || '').toUpperCase();
        const nameB = (b.engineer || '').toUpperCase();
        return nameA.localeCompare(nameB);
    });

    // 3. Collect bills for each technician and calculate grand total
    let grandTotal = 0;
    const techData = [];
    
    sortedTechs.forEach(item => {
        let rawBills = (item.bills && Array.isArray(item.bills) && item.bills.length > 0)
            ? [...item.bills]
            : getBillsForEngineer(item.engineer, asc);
        
        // Strict branch filter: discard any bill with foreign branch
        let bills = rawBills.filter(b => isBranchMatching(b.asc, asc));
        bills.sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));
        
        const count = bills.length > 0 ? bills.length : (item.count || 0);
        if (count > 0) {
            grandTotal += count;
            techData.push({
                engineer: item.engineer,
                displayName: getTechName(item.engineer),
                count: count,
                detail: item.detail,
                bills: bills
            });
        }
    });

    if (techData.length === 0) return null;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const isMorning = totalMinutes < 11 * 60 + 30; // < 11:30 WIB/WITA is Sesi Pagi
    const tzLabel = getBranchTimezone(asc);
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    let text = '';

    if (isMorning) {
        // Pilihan 1: Sesi Pagi / Universal (Briefing & Pengawalan Awal Hari)
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const dayName = days[now.getDay()];
        const dateNum = now.getDate();
        const monthName = months[now.getMonth()];
        const year = now.getFullYear();
        const dateStr = `${dayName}, ${dateNum} ${monthName} ${year}`;

        text = `📋 *MONITORING AGING UNIT PER TEKNISI*\n`;
        text += `Cabang: *${asc}*\n`;
        text += `Update: ${dateStr} | ${timeStr} ${tzLabel}\n\n`;
        text += `Selamat pagi. Berikut daftar lengkap seluruh unit yang wajib diselesaikan oleh masing-masing teknisi di cabang hari ini:\n\n`;

        techData.forEach((t, tIdx) => {
            text += `👨‍🔧 ${tIdx + 1}. TEKNISI: *${t.displayName}* (${t.count} Unit)\n\n`;
            if (t.bills.length > 0) {
                t.bills.forEach((b) => {
                    text += `${b.jobNo} (${b.pendingDays || 0} Hari)\n`;
                    text += `📱 ${b.model || '-'} | 👤 ${b.customer || '-'}\n`;
                    text += `⚠️ Reason: ${b.reason || '-'}\n\n`;
                });
            } else {
                text += `_(Detail: ${t.detail || '-' })_\n\n`;
            }
        });

        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📌 *Total Unit Tertahan di Cabang: ${grandTotal} Bill*\n\n`;
        text += `Prioritaskan eksekusi unit dengan hari aging terlama agar aging tidak semakin rusak.\n`;
        text += `Segera update status riil di GSPN jika ada kendala konfirmasi user.\n\n`;
        text += `Mari tuntaskan sebelum tarikan data berikutnya. Terima kasih dan selamat bertugas! 🙏`;

    } else {
        // Pilihan 2: Sesi Siang / Sore (Push Closing & Peringatan Tegas)
        text = `🚨 *CRITICAL ALERT — PUSH CLOSING CABANG*\n`;
        text += `Cabang: *${asc}*\n`;
        text += `Update: ${timeStr} ${tzLabel}\n\n`;
        text += `Jam operasional segera berakhir! Masih tercatat unit pending yang BELUM SELESAI / STAGNAN SEJAK PAGI:\n\n`;

        techData.forEach((t) => {
            text += `👨‍🔧 TEKNISI: *${t.displayName}* (${t.count} Unit)\n`;
            if (t.bills.length > 0) {
                t.bills.forEach((b) => {
                    text += `• ${b.jobNo} (${b.pendingDays || 0} Hari) — ${b.model || '-'}\n`;
                    text += `  Reason: ${b.reason || '-'}\n`;
                });
            } else {
                text += `• Detail: ${t.detail || '-'}\n`;
            }
            text += `\n`;
        });

        text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `⛔ *DEADLINE CLOSING HARI INI:*\n`;
        text += `Mohon PIC/Leader segera pastikan teknisi menyelesaikan perbaikan atau meng-update status GSPN sore ini.\n`;
        text += `Terima kasih atas kerja samanya!`;
    }

    return {
        phone: phone,
        name: picDisplayName,
        branch: asc,
        text: text,
        grandTotal: grandTotal,
        techCount: techData.length
    };
}

export function sendWABranchShame(asc) {
    const shameSource = (window.shameData && window.shameData.length > 0) ? window.shameData : (window.rawDashboardData?.shameList || []);
    const branchTechs = shameSource.filter(item => {
        if (!item.asc) return false;
        const sAsc = normalizeName(item.asc);
        const targetAsc = normalizeName(asc);
        if (targetAsc === 'TANJUNG' && sAsc.includes('PINANG')) return false;
        return sAsc === targetAsc;
    });

    const payload = getWAPayloadShameBranch(asc, branchTechs);
    if (!payload || !payload.phone) {
        if (window.showToastNotification) window.showToastNotification(`Nomor WhatsApp PIC/Leader cabang ${asc} belum dikonfigurasi!`);
        return;
    }

    const url = `https://wa.me/${payload.phone}?text=${encodeURIComponent(payload.text)}`;
    window.open(url, '_blank');
}
