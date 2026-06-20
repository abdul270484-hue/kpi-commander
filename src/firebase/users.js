// ============================================
// FIREBASE USER MANAGEMENT
// ============================================

let approvedUsersCache = [];

export function initUserListener(onUsersUpdated) {
    if (typeof db === 'undefined') return;
    
    db.collection('users').onSnapshot((snapshot) => {
        approvedUsersCache = [];
        snapshot.forEach(doc => {
            approvedUsersCache.push({ id: doc.id, ...doc.data() });
        });
        if (onUsersUpdated) onUsersUpdated(approvedUsersCache);
    }, (err) => {
        console.error('Error listening users:', err);
    });
}

export function resetDeviceLock(uid) {
    if (!confirm('Yakin ingin mereset kunci perangkat untuk user ini? (Mereka akan bisa login di HP/Laptop baru)')) return;
    db.collection('users').doc(uid).update({ deviceId: firebase.firestore.FieldValue.delete() }).then(() => {
        if (window.showToastNotification) window.showToastNotification(`🔓 Kunci perangkat berhasil di-reset.`);
    }).catch(e => alert(e.message));
}

export function removeApprovedUser(uid, email) {
    if (!confirm(`Yakin ingin MENGHAPUS TOTAL akses untuk ${email}?`)) return;
    
    db.collection('users').doc(uid).delete().then(() => {
        if (window.showToastNotification) window.showToastNotification(`🗑️ Akses untuk ${email} telah dihapus.`);
    }).catch(err => {
        alert('Gagal menghapus: ' + err.message);
    });
}

export function approveUser(uid, email) {
    if (!confirm(`Yakin ingin menyetujui akses (Role: User) untuk ${email}?`)) return;
    
    db.collection('users').doc(uid).update({ role: 'user' }).then(() => {
        if (window.showToastNotification) window.showToastNotification(`✅ Akses untuk ${email} berhasil disetujui.`);
    }).catch(err => {
        alert('Gagal menyetujui: ' + err.message);
    });
}
