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
    let greeting = 'Pagi';
    if (hours >= 11 && hours < 15) greeting = 'Siang';
    else if (hours >= 15 && hours < 18) greeting = 'Sore';
    else if (hours >= 18) greeting = 'Malam';
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    let text = `🚨 *Peringatan AGING! [Update: ${timeStr} WIB]*\n\nSelamat ${greeting} ${displayName}, Awas, *${count} unit pendingmu* terutama yg paling lama. Segera eksekusi sebelum aging makin rusak:\n`;
    
    // Bills sekarang disimpan di shameData (bukan engineerData lagi untuk menghemat payload)
    let bills = [];
    if (window.shameData && Array.isArray(window.shameData)) {
        const found = window.shameData.find(s => normalizeName(s.engineer) === normalizeName(engName));
        if (found && Array.isArray(found.bills)) {
            bills = [...found.bills];
        }
    }
    
    if (bills.length > 0) {
        bills.sort((a, b) => (b.pendingDays || 0) - (a.pendingDays || 0));
        bills.forEach((b, index) => {
            text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n👤 ${b.customer}\n📱 ${b.model}\n📌 ${b.reason}\n`;
        });
    }
    
    return { phone: waNumber, name: displayName, text: text };
}

export function sendWA(engName, asc, count, detail) {
    const payload = getWAPayloadShame(engName, asc, count, detail);
    if (!payload) {
        if (window.showToastNotification) window.showToastNotification('Nomor WA belum disetting! Buka menu "Kontak Teknisi" di atas dulu.');
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

    let text = `🚨 *WARNING PENDING DELIVERY (RC) - CABANG ${asc} [Update: ${timeStr} WIB]*\n\nSelamat ${greeting} ${displayName},\nBerikut ada *${count} unit* Pending Delivery (Repair Completed). Mohon segera di-follow up ke kurir / customer (tawarkan D2D):\n`;
    
    if (window.rcData && window.rcData[asc]) {
        const bills = window.rcData[asc].bills;
        bills.sort((a, b) => b.pendingDays - a.pendingDays);
        
        bills.forEach((j, index) => {
            text += `\n${index+1}. *${j.jobNo}* (*${j.pendingDays} Hari*)\n   👤 ${j.customer}\n   📱 ${j.model}\n   ⚠️ ${j.reason}\n`;
        });
    }
    
    text += `\nMohon segera diproses agar tidak merusak performa aging cabang. Terima kasih.`;
    return { phone: waNumber, name: displayName, text: text };
}

export function sendWARC(asc, count) {
    const payload = getWAPayloadRC(asc, count);
    if (!payload) {
        if (window.showToastNotification) window.showToastNotification(`Nomor WA belum disetting untuk PIC/Kacab ${asc}!`);
        return;
    }
    
    const url = `https://wa.me/${payload.phone}?text=${encodeURIComponent(payload.text)}`;
    window.open(url, '_blank');
}

export function sendWADosaSingleBranch(asc) {
    let engName = `PIC ${asc}`;
    let phone = getTechPhone(engName);
    
    if (!phone) {
        if (window.showToastNotification) window.showToastNotification(`Nomor WA belum disetting untuk PIC ${asc}! Buka menu "Kontak Teknisi" di atas dulu.`);
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
    
    let text = `🚨 *Peringatan AGING DOSA CABANG (> 7 Hari)*\n\nHalo ${displayName},\nBerikut daftar bill pending murni kesalahan cabang Anda dengan aging di atas 7 hari (tidak termasuk kendala SEIN/Part):\n`;
    
    bills.sort((a, b) => b.pendingDays - a.pendingDays);
    
    bills.forEach((b, index) => {
        text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason || '-'}\n`;
    });
    
    text += `\nSegera tindak lanjuti pendingan di atas hari ini juga agar tidak merusak aging cabang. Terima kasih. 🙏`;
    
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
    
    const text = `🚨 *PERINGATAN REDO (Repair Gagal)*\n\nHalo ${displayName},\nMohon segera dicek kembali unit berikut karena terindikasi *REDO* (Unit kembali rusak / dikomplain user):\n\nNo Job: *${jobNo}*\nModel: *${model}*\n\n_Harap segera ditarik atau difollow up sebelum mempengaruhi metrik performa._`;
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}
