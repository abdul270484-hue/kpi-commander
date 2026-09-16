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
    
    // Pastikan app-container disembunyikan dulu jika bukan localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        // Auto-bypass login overlay on local Commander terminal
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.classList.remove('hidden');
        isAdmin = true;
        currentUser = { email: 'commander@bujm.local', displayName: 'Optimus Prime' };
        
        const btnTriggerRpa = document.getElementById('btn-trigger-rpa');
        if (btnTriggerRpa) btnTriggerRpa.style.display = 'flex';
        if (btnManage) btnManage.style.display = '';

        // Ensure anonymous auth for Firestore permissions
        if (!firebase.auth().currentUser) {
            firebase.auth().signInAnonymously().catch(e => console.warn('Local anonymous auth:', e));
        }
        window.dispatchEvent(new Event('bujm_auth_ready'));
    } else if (mainApp) {
        mainApp.classList.add('hidden');
    }

    // Listener State Auth Firebase
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                let role = 'admin'; // Default new user to admin access so dashboard owner is never locked out
                let dbDeviceId = null;
                
                if (userDoc.exists) {
                    role = userDoc.data().role || 'admin';
                    dbDeviceId = userDoc.data().deviceId;
                    window.currentUserBranches = userDoc.data().branches || [];
                    currentUserBranches = window.currentUserBranches;
                    if (typeof window.applyDashboardFilterAndRender === 'function') {
                        window.applyDashboardFilterAndRender();
                    }
                }
                
                // Jika role diset 'rejected' oleh admin, baru tolak akses
                if (role === 'rejected') {
                    await firebase.auth().signOut();
                    if (loginErrorMsg) {
                        loginErrorMsg.style.display = 'block';
                        loginErrorMsg.innerHTML = '<i class="fa-solid fa-lock"></i> Akses Ditolak! Akun Anda dinonaktifkan oleh Admin.';
                    }
                    return;
                }

                // --- DEVICE BINDING LOGIC ---
                let localDeviceId = localStorage.getItem('bujm_device_id');
                if (!localDeviceId) {
                    // Generate unique ID untuk device ini
                    localDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
                    localStorage.setItem('bujm_device_id', localDeviceId);
                }

                // Jika akun sudah punya deviceId di DB, tapi tidak cocok dengan device ini
                // Pengecualian untuk Admin agar tidak terkunci dari sistemnya sendiri
                if (dbDeviceId && dbDeviceId !== localDeviceId && role !== 'admin') {
                    await firebase.auth().signOut();
                    if (loginErrorMsg) {
                        loginErrorMsg.style.display = 'block';
                        loginErrorMsg.innerHTML = '<i class="fa-solid fa-lock"></i> Akses Ditolak! Akun Gmail ini terikat di perangkat lain. Hubungi Admin.';
                    }
                    return; // Batalkan proses login!
                }
                
                // Simpan atau Perbarui Data & Bind Device
                await db.collection('users').doc(user.uid).set({
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    role: role,
                    deviceId: localDeviceId, // Kunci akun ke device ini
                    lastLogin: new Date().toISOString()
                }, { merge: true }); // Pakai merge agar data lain tidak tertimpa

                currentUser = user;
                isAdmin = (role === 'admin');
                
                // Super Admin check: Only ABDUL or Localhost runner
                const isSuperAdmin = (user && user.email === 'abdul270484@gmail.com') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

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
                if (loginErrorMsg) {
                    loginErrorMsg.style.display = 'block';
                    loginErrorMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Gagal memvalidasi sesi DB: ' + err.message;
                }
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
        btnGoogle.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            btnGoogle.innerHTML = 'Memuat...';
            btnGoogle.disabled = true;

            firebase.auth().signInWithPopup(provider).catch((error) => {
                console.error("Gagal Login Google:", error);
                if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
                    console.log("Popup terblokir, mencoba signInWithRedirect...");
                    return firebase.auth().signInWithRedirect(provider);
                }
                if (loginErrorMsg) {
                    loginErrorMsg.style.display = 'block';
                    loginErrorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Login Gagal: ${error.message}`;
                }
                btnGoogle.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google" style="width: 20px; height: 20px;"> Sign in with Google`;
                btnGoogle.disabled = false;
            });
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
