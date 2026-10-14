import { CONFIG } from './config.js';

export let isAdmin = false;
export let currentUser = null;
export let currentUserBranches = [];
window.currentUserBranches = [];

// Normalisasi HP (tetap ada karena dipakai di main.js untuk nomor teknisi)
export function normalizePhone(phone) {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '62' + digits.substring(1);
    if (!digits.startsWith('62')) digits = '62' + digits;
    return digits;
}

export function initAuth(db) {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const btnGoogle = document.getElementById('btn-google-signin');
    const loginErrorMsg = document.getElementById('login-google-error');
    const btnManage = document.getElementById('btn-manage-users');
    const btnLogs = document.getElementById('btn-access-logs');
    
    // Pastikan session disimpan secara persisten di browser (IndexedDB / LocalStorage)
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
        console.warn('Set persistence warning:', err);
    });

    // Pastikan app-container disembunyikan dulu jika bukan localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        // Auto-bypass login overlay on local Commander terminal
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.classList.remove('hidden');
        isAdmin = true;
        currentUser = { email: 'abdul270484@gmail.com', displayName: 'Abdul (Local Commander)' };
        window.currentUser = currentUser;

        // Kunci cabang area default Abdul untuk Localhost
        window.currentUserBranches = [
            'DENPASAR',
            'DENPASAR - CELLULAR WORLD',
            'DENPASAR - PLANET GADGET',
            'KUPANG',
            'SINGARAJA',
            'MANADO'
        ];
        currentUserBranches = window.currentUserBranches;
        
        const btnTriggerRpa = document.getElementById('btn-trigger-rpa');
        if (btnTriggerRpa) btnTriggerRpa.style.display = 'flex';
        if (btnManage) btnManage.style.display = '';

        // Ensure anonymous auth for Firestore permissions
        if (!firebase.auth().currentUser) {
            firebase.auth().signInAnonymously().catch(e => console.warn('Local anonymous auth:', e));
        }

        // Ambil branches Abdul secara live dari Firestore jika tersedia
        if (db) {
            db.collection('users').doc('DBGCiSp4BXZP8mwXW7cJr2ugrAW2').get().then(snap => {
                if (snap.exists && snap.data().branches && snap.data().branches.length > 0) {
                    window.currentUserBranches = snap.data().branches;
                    currentUserBranches = window.currentUserBranches;
                    if (typeof window.applyDashboardFilterAndRender === 'function') {
                        window.applyDashboardFilterAndRender();
                    }
                }
            }).catch(() => {});
        }

        window.dispatchEvent(new Event('bujm_auth_ready'));
    } else if (mainApp) {
        mainApp.classList.add('hidden');
    }

    // Listener State Auth Firebase
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            if (user.isAnonymous) {
                console.log('Anonymous user detected on main dashboard. Prompting Google Sign-In.');
                currentUser = null;
                isAdmin = false;
                if (loginScreen) loginScreen.style.display = 'flex';
                if (mainApp) mainApp.classList.add('hidden');
                return;
            }
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                let role = 'admin'; // Default new user to admin access so dashboard owner is never locked out
                let dbDeviceId = null;
                
                if (userDoc.exists) {
                    role = userDoc.data().role || 'admin';
                    dbDeviceId = userDoc.data().deviceId;
                    let dbBranches = userDoc.data().branches || [];
                    if (user.email === 'abdul270484@gmail.com' && dbBranches.length === 0) {
                        dbBranches = [
                            'DENPASAR',
                            'DENPASAR - CELLULAR WORLD',
                            'DENPASAR - PLANET GADGET',
                            'KUPANG',
                            'SINGARAJA',
                            'MANADO'
                        ];
                    }
                    window.currentUserBranches = dbBranches;
                    currentUserBranches = window.currentUserBranches;
                    try {
                        localStorage.setItem('bujm_user_branches', JSON.stringify(dbBranches));
                        localStorage.setItem('bujm_user_email', user.email);
                    } catch (e) {}
                    if (typeof window.applyDashboardFilterAndRender === 'function') {
                        window.applyDashboardFilterAndRender();
                    }
                }
                
                // Jika role diset 'rejected' oleh admin, baru tolak akses
                if (role === 'rejected') {
                    await firebase.auth().signOut();
                    if (loginErrorMsg) {
                        loginErrorMsg.style.display = 'block';
                        loginErrorMsg.innerHTML = '<i class="fa-solid fa-lock"></i> Access Denied! Your account has been disabled by Admin.';
                    }
                    return;
                }

                // Super Admin check: Only ABDUL or Localhost runner
                const isSuperAdmin = (user && user.email === 'abdul270484@gmail.com') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isSuperAdmin) {
                    role = 'admin';
                }

                // --- DEVICE BINDING LOGIC (HANYA UNTUK USER BIASA / BUKAN ADMIN / BUKAN SUPER ADMIN) ---
                let localDeviceId = localStorage.getItem('bujm_device_id');
                if (!localDeviceId) {
                    localDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
                    localStorage.setItem('bujm_device_id', localDeviceId);
                }

                // Super Admin & Admin BERHAK LOGIN DARI DEVICE MANAPUN (Bebas tanpa batas device)
                if (!isSuperAdmin && role !== 'admin') {
                    // Jika akun user biasa sudah punya deviceId di DB dan berbeda dengan device ini, tolak
                    if (dbDeviceId && dbDeviceId !== localDeviceId) {
                        await firebase.auth().signOut();
                        if (loginErrorMsg) {
                            loginErrorMsg.style.display = 'block';
                            loginErrorMsg.innerHTML = '<i class="fa-solid fa-lock"></i> Access Denied! This Google account is linked to another device. Please contact Admin.';
                        }
                        return; // Batalkan proses login user biasa
                    }
                }
                
                // Simpan atau Perbarui Data
                const updatePayload = {
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    role: role,
                    lastLogin: new Date().toISOString()
                };

                // Hanya kunci deviceId jika ini USER BIASA (User biasa 1 akun = 1 device)
                // Super Admin / Admin TIDAK dikunci ke satu deviceId agar tidak saling menimpa saat multi-device login
                if (!isSuperAdmin && role !== 'admin') {
                    updatePayload.deviceId = localDeviceId;
                }

                await db.collection('users').doc(user.uid).set(updatePayload, { merge: true });

                currentUser = user;
                isAdmin = (role === 'admin' || isSuperAdmin);

                // Update UI
                if (loginScreen) loginScreen.style.display = 'none';
                if (mainApp) mainApp.classList.remove('hidden');

                const btnTriggerRpa = document.getElementById('btn-trigger-rpa');

                if (isSuperAdmin) {
                    if (btnManage) btnManage.style.display = '';
                    if (btnTriggerRpa) btnTriggerRpa.style.display = 'flex';
                } else {
                    if (btnManage) btnManage.style.display = 'none';
                    if (btnTriggerRpa) btnTriggerRpa.style.display = 'none';
                }
                
                if (isAdmin) {
                    if (btnLogs) btnLogs.style.display = '';
                }

                // Update Topbar
                const nameEl = document.querySelector('.user-info .name');
                const roleEl = document.querySelector('.user-info .role');
                const avatarEl = document.querySelector('.user-profile .avatar');

                if (nameEl) nameEl.textContent = user.displayName || user.email;
                if (roleEl) roleEl.textContent = isAdmin ? 'Admin Access' : 'User Access';
                if (avatarEl && user.photoURL) {
                    avatarEl.innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;border-radius:50%;" alt="Avatar">`;
                }
                
                // --- SECURITY LOCK RELEASE ---
                // Trigger event global menandakan sistem siap digunakan
                window.dispatchEvent(new Event('bujm_auth_ready'));

            } catch (err) {
                console.error("Gagal memvalidasi sesi:", err);
                // Walaupun error baca firestore (misal offline), JANGAN logout jika user sudah terautentikasi Firebase
                currentUser = user;
                isAdmin = (user && user.email === 'abdul270484@gmail.com');
                if (loginScreen) loginScreen.style.display = 'none';
                if (mainApp) mainApp.classList.remove('hidden');
                window.dispatchEvent(new Event('bujm_auth_ready'));
            }
        } else {
            // User is signed out
            currentUser = null;
            isAdmin = false;
            if (loginScreen) loginScreen.style.display = 'flex';
            if (mainApp) mainApp.classList.add('hidden');
        }
    });

    // Handle Auth Redirect result if popup fallback was used
    firebase.auth().getRedirectResult().catch(err => {
        console.error("Redirect Auth Error:", err);
    });

    // Event Handler Button Login Google
    if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            btnGoogle.innerHTML = 'Loading...';
            btnGoogle.disabled = true;

            try {
                await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                await firebase.auth().signInWithPopup(provider);
            } catch (error) {
                console.error("Gagal Login Google:", error);
                if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
                    console.log("Popup terblokir, mencoba signInWithRedirect...");
                    return firebase.auth().signInWithRedirect(provider);
                }
                if (loginErrorMsg) {
                    loginErrorMsg.style.display = 'block';
                    loginErrorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Login Failed: ${error.message}`;
                }
                btnGoogle.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google" style="width: 20px; height: 20px;"> Sign in with Google`;
                btnGoogle.disabled = false;
            }
        });
    }

    // Event Handler Logout
    const logoutBtn = document.createElement('button');
    logoutBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
    logoutBtn.style.cssText = 'background: rgba(239, 68, 68, 0.2); color: var(--accent-red); border: 1px solid var(--accent-red); padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-left: 10px;';
    logoutBtn.addEventListener('click', () => firebase.auth().signOut());
    
    const userProfileDiv = document.querySelector('.user-profile');
    if (userProfileDiv) {
        userProfileDiv.appendChild(logoutBtn);
    }
}
