import { CONFIG } from './config.js';

export let isAdmin = false;
export let currentUser = null;

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
    
    // Pastikan app-container disembunyikan dulu
    if (mainApp) mainApp.classList.add('hidden');

    // Listener State Auth Firebase
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            try {
                // Cek Firestore untuk Whitelist Role (opsional, untuk keamanan ketat)
                // Sementara, kita asumsikan semua yang login Google berhasil masuk (bisa dibatasi nanti)
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                let role = 'pending';
                let dbDeviceId = null;
                
                if (userDoc.exists) {
                    role = userDoc.data().role || 'pending';
                    dbDeviceId = userDoc.data().deviceId;
                }
                
                // Jika role masih pending, catat percobaan login dan tolak akses
                if (role === 'pending') {
                    await db.collection('users').doc(user.uid).set({
                        email: user.email,
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        role: 'pending',
                        lastAttempt: new Date().toISOString()
                    }, { merge: true });
                    
                    await firebase.auth().signOut();
                    if (loginErrorMsg) {
                        loginErrorMsg.style.display = 'block';
                        loginErrorMsg.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Akun Anda berstatus PENDING. Silakan hubungi Admin untuk persetujuan.';
                    }
                    return; // Batalkan proses login!
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

                // Update UI
                if (loginScreen) loginScreen.style.display = 'none';
                if (mainApp) mainApp.classList.remove('hidden');

                if (isAdmin) {
                    if (btnManage) btnManage.style.display = '';
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
                    loginErrorMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Gagal memvalidasi sesi DB.';
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

    // Event Handler Button Login Google
    if (btnGoogle) {
        btnGoogle.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            btnGoogle.innerHTML = 'Memuat...';
            btnGoogle.disabled = true;

            firebase.auth().signInWithPopup(provider).catch((error) => {
                console.error("Gagal Login Google:", error);
                if (loginErrorMsg) {
                    loginErrorMsg.style.display = 'block';
                    loginErrorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${error.message}`;
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
