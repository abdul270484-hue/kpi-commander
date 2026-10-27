// ============================================
// FIREBASE USER MANAGEMENT & BRANCH CHECKLIST
// ============================================

export const BUJM_MASTER_BRANCHES = [
    { code: 'AMBON', display: 'AMBON', region: 'Maluku' },
    { code: 'BANDAR JAYA', display: 'BANDAR JAYA', region: 'Lampung' },
    { code: 'BANDAR LAMPUNG', display: 'BANDAR LAMPUNG', region: 'Lampung' },
    { code: 'BANJARMASIN', display: 'BANJARMASIN', region: 'Kalimantan Selatan' },
    { code: 'BATAM', display: 'BATAM', region: 'Kepulauan Riau' },
    { code: 'BE BELITUNG', display: 'BE BELITUNG', region: 'Bangka Belitung' },
    { code: 'BE BITUNG', display: 'BE BITUNG', region: 'Sulawesi Utara' },
    { code: 'BE CURUP', display: 'BE CURUP', region: 'Bengkulu' },
    { code: 'BE KETAPANG', display: 'BE KETAPANG', region: 'Kalimantan Barat' },
    { code: 'BE KONAWE', display: 'BE KONAWE', region: 'Sulawesi Tenggara' },
    { code: 'BE KOTA BUMI', display: 'BE KOTA BUMI', region: 'Lampung' },
    { code: 'BE METRO', display: 'BE METRO', region: 'Lampung' },
    { code: 'BE PRINGSEWU', display: 'BE PRINGSEWU', region: 'Lampung' },
    { code: 'BE SANGGAU', display: 'BE SANGGAU', region: 'Kalimantan Barat' },
    { code: 'BENGKULU', display: 'BENGKULU', region: 'Bengkulu' },
    { code: 'BERAU', display: 'BERAU', region: 'Kalimantan Timur' },
    { code: 'BOJONEGORO', display: 'BOJONEGORO', region: 'Jawa Timur' },
    { code: 'BONTANG', display: 'BONTANG', region: 'Kalimantan Timur' },
    { code: 'DENPASAR', display: 'DENPASAR', region: 'Bali' },
    { code: 'DENPASAR - CELLULAR WORLD', display: 'DENPASAR - CELLULAR WORLD', region: 'Bali' },
    { code: 'DENPASAR - PLANET GADGET', display: 'DENPASAR - PLANET GADGET', region: 'Bali' },
    { code: 'GORONTALO', display: 'GORONTALO', region: 'Gorontalo' },
    { code: 'JAYAPURA', display: 'JAYAPURA', region: 'Papua' },
    { code: 'KARAWANG', display: 'KARAWANG', region: 'Jawa Barat' },
    { code: 'KENDARI', display: 'KENDARI', region: 'Sulawesi Tenggara' },
    { code: 'KUPANG', display: 'KUPANG', region: 'Nusa Tenggara Timur' },
    { code: 'LUWUK', display: 'LUWUK', region: 'Sulawesi Tengah' },
    { code: 'MAKASSAR', display: 'MAKASSAR', region: 'Sulawesi Selatan' },
    { code: 'MAMUJU', display: 'MAMUJU', region: 'Sulawesi Barat' },
    { code: 'MANADO', display: 'MANADO', region: 'Sulawesi Utara' },
    { code: 'PALANGKARAYA', display: 'PALANGKARAYA', region: 'Kalimantan Tengah' },
    { code: 'PALOPO', display: 'PALOPO', region: 'Sulawesi Selatan' },
    { code: 'PALU', display: 'PALU', region: 'Sulawesi Tengah' },
    { code: 'PAMEKASAN', display: 'PAMEKASAN', region: 'Jawa Timur (Madura)' },
    { code: 'PANGKALPINANG', display: 'PANGKALPINANG', region: 'Bangka Belitung' },
    { code: 'PANGKALAN BUN', display: 'PANGKALAN BUN', region: 'Kalimantan Tengah' },
    { code: 'PATI', display: 'PATI', region: 'Jawa Tengah' },
    { code: 'PONTIANAK', display: 'PONTIANAK', region: 'Kalimantan Barat' },
    { code: 'PROBOLINGGO', display: 'PROBOLINGGO', region: 'Jawa Timur' },
    { code: 'SAMARINDA', display: 'SAMARINDA', region: 'Kalimantan Timur' },
    { code: 'SAMPIT', display: 'SAMPIT', region: 'Kalimantan Tengah' },
    { code: 'SDS', display: 'SDS (Warehouse)', region: 'Banten / Pergudangan' },
    { code: 'SERPONG', display: 'SERPONG', region: 'Banten' },
    { code: 'SERPONG ITC - BSD', display: 'SERPONG ITC - BSD', region: 'Banten' },
    { code: 'SIDOARJO', display: 'SIDOARJO', region: 'Jawa Timur' },
    { code: 'SINGARAJA', display: 'SINGARAJA', region: 'Bali' },
    { code: 'SINGKAWANG', display: 'SINGKAWANG', region: 'Kalimantan Barat' },
    { code: 'SORONG', display: 'SORONG', region: 'Papua Barat Daya' },
    { code: 'SRAGEN', display: 'SRAGEN', region: 'Jawa Tengah' },
    { code: 'TANJUNG', display: 'TANJUNG (Tabalong, Kalsel)', region: 'Kalimantan Selatan (Asmen Riris)' },
    { code: 'TANJUNGPINANG', display: 'TANJUNGPINANG (Kep. Riau)', region: 'Kepulauan Riau (Asmen Sadawani)' },
    { code: 'TERNATE', display: 'TERNATE', region: 'Maluku Utara' },
    { code: 'TIMIKA', display: 'TIMIKA', region: 'Papua Tengah' }
];

let approvedUsersCache = [];
let currentEditingUid = null;
let currentEditingEmail = '';
let isModalEventsBound = false;

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

// ----------------------------------------------------
// INTERACTIVE BRANCH CHECKLIST SYSTEM
// ----------------------------------------------------

function createBranchCard(branch, isChecked) {
    const isTanjung = branch.code === 'TANJUNG';
    const isTanjungpinang = branch.code === 'TANJUNGPINANG';
    
    let specialBadge = '';
    if (isTanjung) {
        specialBadge = `<span style="display:inline-block; font-size:0.65rem; font-weight:700; background:#d97706; color:#fff; padding:1px 6px; border-radius:4px; margin-left:4px; white-space:nowrap; flex-shrink:0;">KALSEL (RIRIS)</span>`;
    } else if (isTanjungpinang) {
        specialBadge = `<span style="display:inline-block; font-size:0.65rem; font-weight:700; background:#0284c7; color:#fff; padding:1px 6px; border-radius:4px; margin-left:4px; white-space:nowrap; flex-shrink:0;">KEP. RIAU (SADAWANI)</span>`;
    }

    const card = document.createElement('label');
    card.className = `branch-checkbox-card ${isChecked ? 'is-selected' : ''}`;
    card.setAttribute('data-code', branch.code);
    card.setAttribute('data-search', `${branch.code} ${branch.display} ${branch.region}`);
    
    card.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
        background: ${isChecked ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.04)'};
        border: 1px solid ${isChecked ? 'rgba(59, 130, 246, 0.6)' : 'rgba(255, 255, 255, 0.08)'};
        box-sizing: border-box;
    `;

    card.innerHTML = `
        <input type="checkbox" class="chk-branch-item" value="${branch.code}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #3b82f6; cursor: pointer; flex-shrink: 0; align-self: flex-start; margin-top: 3px;">
        <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 0.82rem; color: #fff; line-height: 1.25;">${branch.display}</span>
                ${specialBadge}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 3px; line-height: 1.2;">
                ${branch.region}
            </div>
        </div>
    `;

    const checkbox = card.querySelector('input');
    checkbox.addEventListener('change', () => {
        updateCardAppearance(card, checkbox.checked);
        updateSelectedCounter();
    });

    return card;
}

function updateCardAppearance(card, isChecked) {
    if (isChecked) {
        card.classList.add('is-selected');
        card.style.background = 'rgba(59, 130, 246, 0.18)';
        card.style.borderColor = 'rgba(59, 130, 246, 0.6)';
    } else {
        card.classList.remove('is-selected');
        card.style.background = 'rgba(255, 255, 255, 0.04)';
        card.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    }
}

function updateSelectedCounter() {
    const counterEl = document.getElementById('checklist-selected-counter');
    if (!counterEl) return;
    const checkedCount = document.querySelectorAll('.chk-branch-item:checked').length;
    counterEl.textContent = `${checkedCount} Cabang Dipilih`;
    if (checkedCount > 0) {
        counterEl.style.background = 'rgba(16, 185, 129, 0.2)';
        counterEl.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        counterEl.style.color = '#6ee7b7';
    } else {
        counterEl.style.background = 'rgba(148, 163, 184, 0.1)';
        counterEl.style.borderColor = 'rgba(148, 163, 184, 0.3)';
        counterEl.style.color = '#94a3b8';
    }
}

function selectAllVisible(selectAll = true) {
    const container = document.getElementById('checklist-branches-container');
    if (!container) return;
    const cards = container.querySelectorAll('.branch-checkbox-card');
    cards.forEach(card => {
        if (card.style.display !== 'none') {
            const cb = card.querySelector('.chk-branch-item');
            if (cb) {
                cb.checked = selectAll;
                updateCardAppearance(card, selectAll);
            }
        }
    });
    updateSelectedCounter();
}

function filterBranches(term) {
    const container = document.getElementById('checklist-branches-container');
    if (!container) return;
    const q = (term || '').trim().toUpperCase();
    const cards = container.querySelectorAll('.branch-checkbox-card');
    cards.forEach(card => {
        const text = (card.getAttribute('data-search') || '').toUpperCase();
        if (!q || text.includes(q)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function addCustomBranch() {
    const input = document.getElementById('checklist-custom-branch-input');
    const container = document.getElementById('checklist-branches-container');
    if (!input || !container) return;
    const val = (input.value || '').trim().toUpperCase();
    if (!val) return;

    // Check if card with this code already exists
    const existing = container.querySelector(`.branch-checkbox-card[data-code="${val}"]`);
    if (existing) {
        const cb = existing.querySelector('.chk-branch-item');
        if (cb) {
            cb.checked = true;
            updateCardAppearance(existing, true);
        }
        existing.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        input.value = '';
        updateSelectedCounter();
        return;
    }

    const customBranch = {
        code: val,
        display: val,
        region: 'Cabang Kustom Tambahan'
    };
    const card = createBranchCard(customBranch, true);
    container.prepend(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    input.value = '';
    updateSelectedCounter();
}

function saveBranchAccess() {
    if (!currentEditingUid) return;
    const btnSave = document.getElementById('checklist-btn-save');
    const checkedBoxes = Array.from(document.querySelectorAll('.chk-branch-item:checked'));
    const selectedBranches = checkedBoxes.map(cb => cb.value.trim().toUpperCase());
    
    // Sort alphabetically
    selectedBranches.sort();

    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    }

    const firestore = (typeof db !== 'undefined' && db) ? db : firebase.firestore();

    firestore.collection('users').doc(currentEditingUid).update({
        branches: selectedBranches
    }).then(() => {
        // If current logged-in user is modified, update window.currentUserBranches live
        const currentEmail = (window.currentUser && window.currentUser.email) || localStorage.getItem('bujm_user_email');
        if (currentEmail && currentEditingEmail && currentEmail.toLowerCase() === currentEditingEmail.toLowerCase()) {
            window.currentUserBranches = selectedBranches;
            try {
                localStorage.setItem('bujm_user_branches', JSON.stringify(selectedBranches));
            } catch (e) {}
            if (typeof window.applyDashboardFilterAndRender === 'function') {
                window.applyDashboardFilterAndRender();
            }
        }

        if (window.showToastNotification) {
            window.showToastNotification(`✅ Akses cabang untuk ${currentEditingEmail || 'user'} berhasil disimpan (${selectedBranches.length} cabang).`);
        }
        closeChecklistModal();
    }).catch(err => {
        alert('Gagal menyimpan daftar cabang: ' + err.message);
    }).finally(() => {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Akses Cabang';
        }
    });
}

function closeChecklistModal() {
    const modal = document.getElementById('user-branches-checklist-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function bindModalEvents() {
    if (isModalEventsBound) return;
    isModalEventsBound = true;

    const modal = document.getElementById('user-branches-checklist-modal');
    const closeBtn = document.getElementById('close-user-branches-modal');
    const cancelBtn = document.getElementById('checklist-btn-cancel');
    const saveBtn = document.getElementById('checklist-btn-save');
    const selectAllBtn = document.getElementById('checklist-btn-select-all');
    const clearAllBtn = document.getElementById('checklist-btn-clear-all');
    const searchInput = document.getElementById('checklist-branch-search');
    const addCustomBtn = document.getElementById('checklist-btn-add-custom');
    const customInput = document.getElementById('checklist-custom-branch-input');

    if (closeBtn) closeBtn.addEventListener('click', closeChecklistModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeChecklistModal);
    if (saveBtn) saveBtn.addEventListener('click', saveBranchAccess);
    if (selectAllBtn) selectAllBtn.addEventListener('click', () => selectAllVisible(true));
    if (clearAllBtn) clearAllBtn.addEventListener('click', () => selectAllVisible(false));
    if (searchInput) searchInput.addEventListener('input', (e) => filterBranches(e.target.value));
    if (addCustomBtn) addCustomBtn.addEventListener('click', addCustomBranch);
    if (customInput) {
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCustomBranch();
            }
        });
    }

    // Close on backdrop click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeChecklistModal();
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeChecklistModal();
        }
    });
}

export function editUserBranches(uid, currentBranches, email) {
    const modal = document.getElementById('user-branches-checklist-modal');
    if (!modal) {
        // Fallback to prompt if modal doesn't exist
        const defaultStr = Array.isArray(currentBranches) ? currentBranches.join(', ') : (currentBranches || '');
        const input = prompt('Enter branches (ASC) handled by this user.\nSeparate by commas (e.g. AMBON, TERNATE, TANJUNG):', defaultStr);
        if (input === null) return;
        const branchesArray = input.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
        const firestore = (typeof db !== 'undefined' && db) ? db : firebase.firestore();
        firestore.collection('users').doc(uid).update({ branches: branchesArray }).then(() => {
            if (window.showToastNotification) window.showToastNotification('✅ Branch list successfully updated.');
        }).catch(err => alert('Failed: ' + err.message));
        return;
    }

    currentEditingUid = uid;
    currentEditingEmail = email || '';

    // Set user info
    const userEmailEl = document.getElementById('checklist-user-email');
    if (userEmailEl) userEmailEl.textContent = email || uid;

    // Parse active branches
    let activeList = [];
    if (Array.isArray(currentBranches)) {
        activeList = currentBranches;
    } else if (typeof currentBranches === 'string') {
        activeList = currentBranches.split(',').map(s => s.trim()).filter(Boolean);
    }
    const activeSet = new Set(activeList.map(s => s.trim().toUpperCase()));

    // Collect all master branches + any extra branches currently assigned to the user
    const branchMap = new Map();
    BUJM_MASTER_BRANCHES.forEach(b => {
        branchMap.set(b.code.toUpperCase(), { ...b });
    });
    activeSet.forEach(bName => {
        if (!branchMap.has(bName)) {
            branchMap.set(bName, {
                code: bName,
                display: bName,
                region: 'Assigned / Custom'
            });
        }
    });

    // Sort list alphabetically
    const combinedList = Array.from(branchMap.values()).sort((a, b) => a.display.localeCompare(b.display));

    // Render cards
    const container = document.getElementById('checklist-branches-container');
    if (container) {
        container.innerHTML = '';
        combinedList.forEach(branch => {
            const isChecked = activeSet.has(branch.code.toUpperCase());
            const card = createBranchCard(branch, isChecked);
            container.appendChild(card);
        });
    }

    // Reset search
    const searchInput = document.getElementById('checklist-branch-search');
    if (searchInput) searchInput.value = '';

    // Reset custom input
    const customInput = document.getElementById('checklist-custom-branch-input');
    if (customInput) customInput.value = '';

    // Update counter
    updateSelectedCounter();

    // Bind modal events
    bindModalEvents();

    // Show modal
    modal.classList.remove('hidden');
}

// Expose to window for inline onclick in main.js
window.editUserBranches = editUserBranches;
window.resetDeviceLock = resetDeviceLock;
window.removeApprovedUser = removeApprovedUser;
window.approveUser = approveUser;
