// ============================================
// WHATSAPP MESSAGING SERVICE
// ============================================

function getTechPhone(engName) {
    const contacts = window.techContacts || JSON.parse(localStorage.getItem('bujm_tech_contacts')) || {};
    return contacts[engName];
}

function getTechName(engName) {
    if (window.techNames && window.techNames[engName]) {
        return window.techNames[engName];
    }
    return engName;
}

export function sendWA(engName, asc, count, detail) {
    const phone = getTechPhone(engName);
    if (!phone) {
        if (window.showToastNotification) window.showToastNotification('Nomor WA belum disetting! Buka menu "Kontak Teknisi" di atas dulu.');
        return;
    }
    
    // Format to 62...
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    }
    
    const displayName = getTechName(engName);
    
    let text = `🚨 *Peringatan AGING!*\n\nHalo ${displayName},\nAwas, *${count} unit pendingmu* sudah melebihi batas 7 hari. Segera eksekusi sebelum aging makin rusak:\n`;
    
    if (window.engineerData && window.engineerData[engName]) {
        const bills = window.engineerData[engName].bills;
        // Urutkan dari yang paling lama ngendap (Pending Days tertinggi)
        bills.sort((a, b) => b.pendingDays - a.pendingDays);
        
        bills.forEach((b, index) => {
            text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason}\n`;
        });
    }
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

export function sendWARC(asc, count) {
    let engName = `PIC ${asc}`;
    let phone = getTechPhone(engName);
    
    if (!phone) {
        if (window.showToastNotification) window.showToastNotification(`Nomor WA belum disetting untuk PIC ${asc}! Buka menu "Kontak Teknisi" di atas dulu.`);
        return;
    }
    
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    }
    
    const displayName = getTechName(engName);
    let text = `Halo ${displayName},\nBerikut ada *${count} bill Repair Completed*:\n_Segera hubungi cust / tawarkan D2D._\n`;
    
    if (window.rcData && window.rcData[asc]) {
        const bills = window.rcData[asc].bills;
        bills.sort((a, b) => b.pendingDays - a.pendingDays);
        
        bills.forEach((b, index) => {
            text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason}\n`;
        });
    }
    
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
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
    }
    
    const displayName = getTechName(engName);
    
    const text = `🚨 *PERINGATAN REDO (Repair Gagal)*\n\nHalo ${displayName},\nMohon segera dicek kembali unit berikut karena terindikasi *REDO* (Unit kembali rusak / dikomplain user):\n\nNo Job: *${jobNo}*\nModel: *${model}*\n\n_Harap segera ditarik atau difollow up sebelum mempengaruhi metrik performa._`;
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}
