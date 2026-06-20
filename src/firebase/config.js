// ============================================
// FIREBASE CONFIG & RULES SERVICE
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

export function initRulesListener(onRulesUpdated) {
    if (typeof db === 'undefined') return;
    
    // Seed locally first
    window.customModels = defaultCustomModels;
    window.customReasons = defaultCustomReasons;

    db.collection('config').doc('rules').onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            window.customModels = data.models || [];
            window.customReasons = data.reasons || [];
            if (onRulesUpdated) onRulesUpdated();
        } else {
            // Seed to cloud if not exists
            db.collection('config').doc('rules').set({
                models: defaultCustomModels,
                reasons: defaultCustomReasons
            }).catch(err => {
                console.error("Firestore seed error:", err);
                if (window.showToastNotification) window.showToastNotification(`<strong>Peringatan Cloud Sync:</strong><br>Database Firestore belum siap!`);
            });
            window.customModels = defaultCustomModels;
            window.customReasons = defaultCustomReasons;
            if (onRulesUpdated) onRulesUpdated();
        }
    }, (error) => {
        console.error("Firestore Listen Error:", error);
        if (window.showToastNotification) window.showToastNotification(`<strong>Koneksi Cloud Terputus:</strong><br>Gagal mengambil rules tersinkronisasi.`);
    });
}

export function addCustomRule(type, kw, cat, onComplete) {
    if (!kw) return;
    
    if (type === 'model') {
        window.customModels.push({keyword: kw, category: cat});
    } else {
        window.customReasons.push({keyword: kw, category: cat});
    }
    
    // Save to Cloud
    db.collection('config').doc('rules').set({
        models: window.customModels,
        reasons: window.customReasons
    }, {merge: true}).then(() => {
        if (onComplete) onComplete();
    }).catch(e => {
        if (window.showToastNotification) window.showToastNotification("Gagal menyimpan ke Cloud: " + e.message);
    });
}

export function deleteCustomRule(type, index, onComplete) {
    if (type === 'model') {
        window.customModels.splice(index, 1);
    } else {
        window.customReasons.splice(index, 1);
    }
    
    // Save to Cloud
    db.collection('config').doc('rules').set({
        models: window.customModels,
        reasons: window.customReasons
    }, {merge: true}).then(() => {
        if (onComplete) onComplete();
    }).catch(e => {
        if (window.showToastNotification) window.showToastNotification("Gagal menghapus dari Cloud: " + e.message);
    });
}

export function initContactsListener(onContactsUpdated) {
    if (typeof db === 'undefined') return;
    
    // Seed locally first from localStorage just in case
    window.techContacts = JSON.parse(localStorage.getItem('bujm_tech_contacts')) || {};

    db.collection('config').doc('contacts').onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            window.techContacts = data || {};
            // Backup to localStorage
            localStorage.setItem('bujm_tech_contacts', JSON.stringify(window.techContacts));
            if (onContactsUpdated) onContactsUpdated();
        } else {
            // Seed to cloud if not exists using existing localStorage
            db.collection('config').doc('contacts').set(window.techContacts).catch(err => {
                console.error("Firestore contacts seed error:", err);
            });
            if (onContactsUpdated) onContactsUpdated();
        }
    }, (error) => {
        console.error("Firestore Contacts Listen Error:", error);
    });
}

export function saveTechContacts(contactsObj, onComplete) {
    window.techContacts = contactsObj;
    localStorage.setItem('bujm_tech_contacts', JSON.stringify(contactsObj));
    
    db.collection('config').doc('contacts').set(contactsObj).then(() => {
        if (onComplete) onComplete();
    }).catch(e => {
        if (window.showToastNotification) window.showToastNotification("Gagal menyimpan kontak ke Cloud: " + e.message);
    });
}
