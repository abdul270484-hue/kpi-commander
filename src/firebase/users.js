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
    if (!confirm('Are you sure you want to reset device lock for this user? (They will be able to log in on a new device)')) return;
    db.collection('users').doc(uid).update({ deviceId: firebase.firestore.FieldValue.delete() }).then(() => {
        if (window.showToastNotification) window.showToastNotification(`🔓 Device lock successfully reset.`);
    }).catch(e => alert(e.message));
}

export function removeApprovedUser(uid, email) {
    if (!confirm(`Are you sure you want to permanently DELETE access for ${email}?`)) return;
    
    db.collection('users').doc(uid).delete().then(() => {
        if (window.showToastNotification) window.showToastNotification(`🗑️ Access for ${email} has been removed.`);
    }).catch(err => {
        alert('Failed to delete: ' + err.message);
    });
}

export function approveUser(uid, email) {
    if (!confirm(`Are you sure you want to approve access (Role: User) for ${email}?`)) return;
    
    db.collection('users').doc(uid).update({ role: 'user' }).then(() => {
        if (window.showToastNotification) window.showToastNotification(`✅ Access for ${email} successfully approved.`);
    }).catch(err => {
        alert('Failed to approve: ' + err.message);
    });
}

export function editUserBranches(uid, currentBranches) {
    const input = prompt('Enter branches (ASC) handled by this user.\nSeparate by commas (e.g. AMBON, TERNATE, JAYAPURA):', currentBranches);
    if (input === null) return; // Cancel
    
    // Parse
    const branchesArray = input.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    
    db.collection('users').doc(uid).update({ branches: branchesArray }).then(() => {
        if (window.showToastNotification) window.showToastNotification('✅ Branch list successfully updated.');
    }).catch(err => {
        alert('Failed to update branch list: ' + err.message);
    });
}

// Expose to window for inline onclick in main.js
window.editUserBranches = editUserBranches;
window.resetDeviceLock = resetDeviceLock;
window.removeApprovedUser = removeApprovedUser;
window.approveUser = approveUser;
