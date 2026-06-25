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

export function getWAPayloadShame(engName, asc, count, detail) {
    const phone = getTechPhone(engName);
    if (!phone) return null;
    
    // Format to 62...
    let waNumber = phone.replace(/\D/g, '');
    if (waNumber.startsWith('0')) {
        waNumber = '62' + waNumber.substring(1);
    }
    
    const displayName = getTechName(engName);
    
    let text = `🚨 *Peringatan AGING!*\n\nHalo ${displayName},\nAwas, *${count} unit pendingmu* sudah melebihi batas 7 hari. Segera eksekusi sebelum aging makin rusak:\n`;
    
    if (window.engineerData && window.engineerData[engName]) {
        const bills = window.engineerData[engName].bills;
        bills.sort((a, b) => b.pendingDays - a.pendingDays);
        
        bills.forEach((b, index) => {
            text += `\n${index+1}. *${b.jobNo}* (*${b.pendingDays} Hari*)\n   👤 ${b.customer}\n   📱 ${b.model}\n   ⚠️ ${b.reason}\n`;
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
    }
    
    const displayName = getTechName(engName);
    
    let text = `🚨 *WARNING PENDING DELIVERY (RC) - CABANG ${asc}*\n\nHalo ${displayName},\nMohon dibantu *${count} unit* Pending Delivery yang sudah melebihi 7 hari agar segera di follow up ke kurir / customer:\n`;
    
    if (window.rcData && window.rcData[asc]) {
        const jobs = window.rcData[asc].jobs;
        jobs.sort((a, b) => b.pendingDays - a.pendingDays);
        
        jobs.forEach((j, index) => {
            text += `\n${index+1}. *${j.jobNo}* (*${j.pendingDays} Hari*)\n   👤 ${j.customer}\n   📱 ${j.model}\n`;
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
