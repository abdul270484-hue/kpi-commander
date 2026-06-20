import { CONFIG } from './config.js';

export let isAdmin = false;

export function normalizePhone(phone) {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '62' + digits.substring(1);
    if (!digits.startsWith('62')) digits = '62' + digits;
    return digits;
}

export function initAuth(db) {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    
    // Check if already authenticated in this session
    const savedAuth = sessionStorage.getItem('bujm_auth');
    if (savedAuth === 'admin' || savedAuth === 'user') {
        loginScreen.style.display = 'none';
        mainApp.classList.remove('hidden');
        isAdmin = (savedAuth === 'admin');
        if (isAdmin) {
            const btnManage = document.getElementById('btn-manage-users');
            if (btnManage) btnManage.style.display = '';
        }
        
        // Update topbar name based on saved session
        if (isAdmin) {
            const nameEl = document.querySelector('.user-info .name');
            if (nameEl) nameEl.textContent = 'Optimus Prime';
            const roleEl = document.querySelector('.user-info .role');
            if (roleEl) roleEl.textContent = 'Admin Access';
        } else {
            const savedName = sessionStorage.getItem('bujm_user_name');
            if (savedName) {
                const nameEl = document.querySelector('.user-info .name');
                if (nameEl) nameEl.textContent = savedName;
                const roleEl = document.querySelector('.user-info .role');
                if (roleEl) roleEl.textContent = 'User Access';
            }
        }
    }

    // Toggle Admin / Phone login
    const toggleAdminLink = document.getElementById('toggle-admin-login');
    const phoneSection = document.getElementById('login-phone-section');
    const adminSection = document.getElementById('admin-login-section');

    if (toggleAdminLink) {
        toggleAdminLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (adminSection.style.display === 'none') {
                adminSection.style.display = 'block';
                phoneSection.style.display = 'none';
                toggleAdminLink.innerHTML = '<i class="fa-solid fa-phone"></i> Login dengan Nomor HP';
            } else {
                adminSection.style.display = 'none';
                phoneSection.style.display = 'block';
                toggleAdminLink.innerHTML = '<i class="fa-solid fa-user-shield"></i> Login sebagai Admin';
            }
        });
    }

    // Admin Login (Master Override)
    const btnLogin = document.getElementById('btn-login');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMsg = document.getElementById('login-error');

    const handleAdminLogin = () => {
        const user = loginUsernameInput.value.trim().toUpperCase();
        const pass = loginPasswordInput.value.trim().toUpperCase();
        
        if (user === 'OPTIMUS PRIME' && pass === 'AUTOBOTS') {
            sessionStorage.setItem('bujm_auth', 'admin');
            isAdmin = true;
            loginScreen.style.display = 'none';
            mainApp.classList.remove('hidden');
            const btnManage = document.getElementById('btn-manage-users');
            if (btnManage) btnManage.style.display = '';
            
            const nameEl = document.querySelector('.user-info .name');
            if (nameEl) nameEl.textContent = 'Optimus Prime';
            const roleEl = document.querySelector('.user-info .role');
            if (roleEl) roleEl.textContent = 'Admin Access';
        } else {
            loginErrorMsg.style.display = 'block';
        }
    };

    if (btnLogin) btnLogin.addEventListener('click', handleAdminLogin);
    if (loginPasswordInput) {
        loginPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAdminLogin();
        });
    }

    // Phone Login (Check Firebase)
    const btnLoginPhone = document.getElementById('btn-login-phone');
    const loginPhoneInput = document.getElementById('login-phone');
    const loginPhoneError = document.getElementById('login-phone-error');

    const handlePhoneLogin = () => {
        const raw = loginPhoneInput.value.trim();
        if (!raw || raw.length < 8) {
            loginPhoneError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Masukkan nomor HP yang valid!';
            loginPhoneError.style.display = 'block';
            return;
        }
        
        const normalized = normalizePhone(raw);
        btnLoginPhone.disabled = true;
        btnLoginPhone.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memeriksa...';
        
        db.collection('approved_users').doc(normalized).get()
            .then(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    sessionStorage.setItem('bujm_auth', 'user');
                    sessionStorage.setItem('bujm_user_name', userData.name || raw);
                    loginScreen.style.display = 'none';
                    mainApp.classList.remove('hidden');
                    
                    const nameEl = document.querySelector('.user-info .name');
                    if (nameEl) nameEl.textContent = userData.name || raw;
                    const roleEl = document.querySelector('.user-info .role');
                    if (roleEl) roleEl.textContent = 'User Access';
                } else {
                    loginPhoneError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Nomor HP belum terdaftar! Silakan minta akses.';
                    loginPhoneError.style.display = 'block';
                    loginPhoneInput.classList.add('shake');
                    setTimeout(() => loginPhoneInput.classList.remove('shake'), 500);
                }
            })
            .catch(err => {
                console.error('Firebase check error:', err);
                loginPhoneError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Gagal terhubung ke server. Coba lagi.';
                loginPhoneError.style.display = 'block';
            })
            .finally(() => {
                btnLoginPhone.disabled = false;
                btnLoginPhone.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> MASUK';
            });
    };

    if (btnLoginPhone) btnLoginPhone.addEventListener('click', handlePhoneLogin);
    if (loginPhoneInput) {
        loginPhoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePhoneLogin();
        });
        loginPhoneInput.addEventListener('input', () => {
            loginPhoneError.style.display = 'none';
        });
    }

    // "Minta Akses via WhatsApp"
    const btnLoginRequestWa = document.getElementById('btn-login-request-wa');
    if (btnLoginRequestWa) {
        btnLoginRequestWa.addEventListener('click', () => {
            const phoneVal = loginPhoneInput ? loginPhoneInput.value.trim() : '';
            const nama = prompt("Masukkan nama Anda:");
            if (!nama) return;
            const pesan = `📱 *REQUEST AKSES LOGIN*\n\nHalo Ndan,\nSaya *${nama.trim()}* ingin meminta izin akses login ke Dashboard BUJM.\nNomor HP saya: *${phoneVal || '[Isi Nomor HP]'}*\n\nMohon didaftarkan ya Ndan. Terima kasih! 🫡`;
            const url = `https://wa.me/${CONFIG.ADMIN_WA_NUMBER}?text=${encodeURIComponent(pesan)}`;
            window.open(url, '_blank');
        });
    }
}
