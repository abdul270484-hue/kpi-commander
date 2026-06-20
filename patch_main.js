const fs = require('fs');
let mainJs = fs.readFileSync('main.js', 'utf8');

// 1. Add resetUserDevice function
const removeFuncRegex = /window\.removeApprovedUser = function\(docId, displayPhone\) \{[\s\S]*?\};/;
const resetFunc = `
window.resetUserDevice = function(docId, displayPhone) {
    if (!confirm(\`Reset pengikatan perangkat untuk \${displayPhone}? Ini akan mengizinkan user login di HP baru.\`)) return;
    db.collection('approved_users').doc(docId).update({
        deviceId: window.firebase.firestore.FieldValue.delete()
    }).then(() => {
        showToastNotification(\`Perangkat untuk \${displayPhone} berhasil di-reset.\`);
    }).catch(err => {
        alert('Gagal mereset perangkat: ' + err.message);
    });
};
`;

mainJs = mainJs.replace(removeFuncRegex, (match) => {
    return resetFunc + '\n' + match;
});

// 2. Update renderApprovedUsers table row
const trRegex = /const tr = document\.createElement\('tr'\);[\s\S]*?approvedUsersList\.appendChild\(tr\);/g;
mainJs = mainJs.replace(trRegex, (match) => {
    return `        const tr = document.createElement('tr');
        let displayPhone = user.id;
        if (displayPhone.startsWith('62')) displayPhone = '0' + displayPhone.substring(2);
        
        let deviceStatus = user.deviceId ? '<span style="color:#10b981; font-size:0.7rem;"><i class="fa-solid fa-lock"></i> Terikat</span>' : '<span style="color:var(--text-muted); font-size:0.7rem;"><i class="fa-solid fa-lock-open"></i> Bebas</span>';
        
        tr.innerHTML = \`
            <td>
                <div style="font-weight: 600;">\${user.name || 'User'} \${deviceStatus}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">\${displayPhone}</div>
            </td>
            <td>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Login Terakhir: \${user.last_login ? new Date(user.last_login).toLocaleString('id-ID') : '-'}</div>
            </td>
            <td style="text-align: right;">
                \${user.deviceId ? \`<button onclick="resetUserDevice('\${user.id}', '\${displayPhone}')" style="background: rgba(56, 189, 248, 0.2); color: #38BDF8; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right:5px;" title="Reset Device">
                    <i class="fa-solid fa-mobile-screen"></i>
                </button>\` : ''}
                <button onclick="removeApprovedUser('\${user.id}', '\${displayPhone}')" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; transition: all 0.2s;" title="Hapus Akses">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        \`;
        approvedUsersList.appendChild(tr);`;
});

fs.writeFileSync('main.js', mainJs);
console.log('Main.js updated with Reset Device features!');
