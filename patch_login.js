const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

const targetStr = `                    if (doc.exists) {
                        const userData = doc.data();
                        sessionStorage.setItem('bujm_auth', 'user');
                        sessionStorage.setItem('bujm_user_name', userData.name || raw);`;

const replacement = `                    if (doc.exists) {
                        const userData = doc.data();
                        
                        // --- DEVICE BINDING LOGIC ---
                        let localDeviceId = localStorage.getItem('bujm_device_id');
                        if (!localDeviceId) {
                            localDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
                            localStorage.setItem('bujm_device_id', localDeviceId);
                        }
                        
                        if (userData.deviceId && userData.deviceId !== localDeviceId) {
                            loginPhoneError.innerHTML = '<i class="fa-solid fa-lock"></i> Akses Ditolak! Nomor HP ini terikat di perangkat lain. Hubungi Admin.';
                            loginPhoneError.style.display = 'block';
                            loginPhoneInput.classList.add('shake');
                            setTimeout(() => loginPhoneInput.classList.remove('shake'), 500);
                            return; // DONT LOGIN
                        }
                        
                        // Bind device & update last login
                        db.collection('approved_users').doc(normalized).update({
                            deviceId: localDeviceId,
                            last_login: new Date().toISOString()
                        });
                        
                        // Record access log
                        db.collection('access_logs').add({
                            name: userData.name || raw,
                            phone: normalized,
                            timestamp: new Date().toISOString(),
                            userAgent: navigator.userAgent
                        });
                        
                        sessionStorage.setItem('bujm_auth', 'user');
                        sessionStorage.setItem('bujm_user_name', userData.name || raw);`;

appJs = appJs.replace(targetStr, replacement);
fs.writeFileSync('app.js', appJs);
console.log('Login logic patched!');
