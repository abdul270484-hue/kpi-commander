const fs = require('fs');
let mainJs = fs.readFileSync('main.js', 'utf8');

// 1. Show btn-access-logs on admin login
// We look for: btnManageUsers.style.display = 'block';
const adminLoginRegex = /btnManageUsers\.style\.display = 'block';/;
mainJs = mainJs.replace(adminLoginRegex, `btnManageUsers.style.display = 'block';
                            const btnLogs = document.getElementById('btn-access-logs');
                            if (btnLogs) btnLogs.style.display = 'block';`);

// 2. Add Event Listeners & Logic at the bottom of the file
const logsLogic = `
// ============================================
// Access Logs Management (Admin Only)
// ============================================
const logsModal = document.getElementById('logs-modal');
const btnAccessLogs = document.getElementById('btn-access-logs');
const closeLogsModal = document.getElementById('close-logs-modal');
const accessLogsList = document.getElementById('access-logs-list');

if (btnAccessLogs) {
    btnAccessLogs.addEventListener('click', () => {
        logsModal.classList.remove('hidden');
        renderAccessLogs();
    });
}

if (closeLogsModal) {
    closeLogsModal.addEventListener('click', () => {
        logsModal.classList.add('hidden');
    });
}

window.addEventListener('click', (e) => {
    if (e.target === logsModal) logsModal.classList.add('hidden');
});

function renderAccessLogs() {
    if (!accessLogsList) return;
    accessLogsList.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat log kunjungan...</td></tr>';
    
    db.collection('access_logs').orderBy('timestamp', 'desc').limit(50).get()
        .then(snapshot => {
            accessLogsList.innerHTML = '';
            if (snapshot.empty) {
                accessLogsList.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:20px;">Belum ada riwayat kunjungan.</td></tr>';
                return;
            }
            
            snapshot.forEach(doc => {
                const log = doc.data();
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                
                // Parse userAgent for simple display
                let deviceStr = 'Desktop';
                if (log.userAgent) {
                    if (log.userAgent.includes('Mobile') || log.userAgent.includes('Android') || log.userAgent.includes('iPhone')) {
                        deviceStr = '<i class="fa-solid fa-mobile-screen" style="color:var(--accent-blue);"></i> Mobile';
                    } else {
                        deviceStr = '<i class="fa-solid fa-desktop" style="color:var(--text-muted);"></i> Desktop';
                    }
                }
                
                const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-';
                
                tr.innerHTML = \`
                    <td style="padding: 10px 12px;">
                        <div style="font-weight: 600;">\${log.name || 'User'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">\${log.phone}</div>
                    </td>
                    <td style="padding: 10px 12px; font-size: 0.85rem; color: var(--text-main);">\${timeStr}</td>
                    <td style="padding: 10px 12px; font-size: 0.85rem;">\${deviceStr}</td>
                \`;
                accessLogsList.appendChild(tr);
            });
        })
        .catch(err => {
            accessLogsList.innerHTML = \`<tr><td colspan="3" style="text-align:center; color:var(--accent-red); padding:20px;">Gagal memuat log: \${err.message}</td></tr>\`;
        });
}
`;

if (!mainJs.includes('// Access Logs Management')) {
    mainJs += '\n' + logsLogic;
}

fs.writeFileSync('main.js', mainJs);
console.log('main.js updated with Logs logic!');
