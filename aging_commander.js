const firebaseConfig = {
  apiKey: "AIzaSyBLbVbEAZ_jvfkBD0YL_lXpVvIQAz0ZCLM",
  authDomain: "aging-commander.firebaseapp.com",
  projectId: "aging-commander",
  storageBucket: "aging-commander.firebasestorage.app",
  messagingSenderId: "286087165205",
  appId: "1:286087165205:web:07c7d7380b0c5a2ca8251c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let activeTrackingData = [];
let rulesConfig = { customReasons: [] };
let kelolaUsers = [];
let myManagerName = "ALL";
let myBranch = "ALL";
let blameChartInstance = null;

// INIT
async function init() {
    try {
        // Tunggu state auth tersimpan (shared antar tab). Jangan timpa sesi Google dengan anonymous.
        const existing = await new Promise(res => {
            const unsub = firebase.auth().onAuthStateChanged(u => { unsub(); res(u); });
        });
        if (!existing) await firebase.auth().signInAnonymously();
    } catch (e) {
        console.warn("Auth warning:", e);
    }
    
    loadRulesConfig();
    loadUsers();
    
    // Listen to aging_tracking
    db.collection('aging_tracking').onSnapshot(snapshot => {
        const rawData = [];
        snapshot.forEach(doc => {
            rawData.push(doc.data());
        });
        activeTrackingData = rawData;
        renderDashboard();
    });
}

// Karena ini database baru, kita perlu menarik rules & users. 
// Namun untuk sementara jika kosong, kita abaikan atau ambil dari hardcoded jika perlu.
// Idealnya, rules dan users disalin ke database baru ini. Tapi saya akan panggil dari DB lama atau izinkan fallback.
// Agar tidak rumit bagi pengguna, jika config tidak ada, gunakan hardcoded user/rules.
// Nanti akan kita sarankan ke user untuk copy-paste config rules ke DB baru.
function loadRulesConfig() {
    db.collection('config').doc('rules').onSnapshot(doc => {
        if (doc.exists) {
            rulesConfig = doc.data();
            renderDashboard();
        }
    });
}

function loadUsers() {
    db.collection('config').doc('kelola_user').onSnapshot(doc => {
        if (doc.exists) {
            kelolaUsers = doc.data().users || [];
            populateManagerFilter();
        } else {
            // Default users fallback jika DB baru belum disetup
            kelolaUsers = [
                { nama: 'BOS KITA', branches: ['DENPASAR', 'KUPANG', 'MATARAM', 'JEMBER'] }
            ];
            populateManagerFilter();
        }
    });
}

function populateManagerFilter() {
    const selMan = document.getElementById('filterManager');
    selMan.innerHTML = '<option value="ALL">All Managers</option>';
    kelolaUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.nama;
        opt.textContent = u.nama;
        selMan.appendChild(opt);
    });
}

document.getElementById('filterManager').addEventListener('change', function() {
    myManagerName = this.value;
    myBranch = "ALL";
    
    const selBranch = document.getElementById('filterBranch');
    selBranch.innerHTML = '<option value="ALL">All Branches</option>';
    
    if (myManagerName !== "ALL") {
        const u = kelolaUsers.find(x => x.nama === myManagerName);
        if (u && u.branches) {
            u.branches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = b;
                selBranch.appendChild(opt);
            });
        }
    }
    renderDashboard();
});

document.getElementById('filterBranch').addEventListener('change', function() {
    myBranch = this.value;
    renderDashboard();
});

let currentRatioMode = 'UNIT'; // 'UNIT' or 'DAYS'

window.switchRatioMode = function(mode) {
    currentRatioMode = mode;
    const btnUnit = document.getElementById('btnToggleUnit');
    const btnDays = document.getElementById('btnToggleDays');
    if (btnUnit && btnDays) {
        btnUnit.classList.toggle('active', mode === 'UNIT');
        btnDays.classList.toggle('active', mode === 'DAYS');
    }
    const sub = document.getElementById('ratioSubtitle');
    if (sub) {
        sub.innerText = mode === 'UNIT' 
            ? 'Percentage ratio based on active unit bill count.' 
            : 'Percentage ratio based on total stagnation days.';
    }
    renderDashboard();
};

// CLASSIFICATION LOGIC (3-WAY DOSA)
const CUSTOMER_KEYWORDS = ['CUSTOMER', 'POP/BOS', 'WARRANTY DOCUMENTS', 'SETTLEMENT', 'PRICE CONFIRMATION'];
const CABANG_OVERRIDE = ['AFTER PARTS RECEIV', 'BY ENG\'R OR ASC', 'WAIT FOR DELIVERY BY ASC', 'ENGINEER DEPARTURE'];
const SEIN_KEYWORDS = [
    'PARTS', 'SAMSUNG', 'APPROVAL', 'EXCHANGE', 'REPLACE/REFUND', 'TRADE-IN', 
    'REQUEST TECH SUPPORT', 'PART ETA'
];

function getReasonCategory(status, reason, by) {
    const r = (reason || '').toUpperCase().trim();
    const s = (status || '').toUpperCase().trim();
    const b = (by || '').toUpperCase().trim();

    // 1. Customer Responsibility
    if (CUSTOMER_KEYWORDS.some(k => r.includes(k))) return 'CUSTOMER';
    
    // 2. Cabang Override (misal: part sudah diterima di cabang tapi belum dipasang)
    if (CABANG_OVERRIDE.some(k => r.includes(k))) return 'CABANG';

    // 3. SEIN Responsibility (Samsung Pusat / Logistik / Vendor)
    if (SEIN_KEYWORDS.some(k => r.includes(k)) || s === 'ASSIGNED TO SERVICE CENTER' || b.includes('SEIN') || b.includes('CICBATCH')) return 'SEIN';
    
    // 4. Branch Responsibility (Internal Teknisi / Frontdesk / Admin)
    return 'CABANG';
}

function renderDashboard() {
    let filtered = activeTrackingData;
    
    // Filter by Manager
    if (myManagerName !== "ALL") {
        const u = kelolaUsers.find(x => x.nama === myManagerName);
        if (u && u.branches) {
            filtered = filtered.filter(row => {
                return u.branches.some(b => row.asc && row.asc.toUpperCase().includes(b.toUpperCase()));
            });
        } else {
            filtered = [];
        }
    }
    
    // Filter by Branch
    if (myBranch !== "ALL") {
        filtered = filtered.filter(row => row.asc && row.asc.toUpperCase().includes(myBranch.toUpperCase()));
    }
    
    let branchUnits = 0;
    let custUnits = 0;
    let seinUnits = 0;

    let branchDays = 0;
    let custDays = 0;
    let seinDays = 0;
    
    const tbody = document.getElementById('stagnationTbody');
    tbody.innerHTML = '';
    
    const now = new Date();
    
    // Sort by stagnation days descending
    filtered.sort((a, b) => {
        const da = a.currentReasonSince ? new Date(a.currentReasonSince) : new Date(a.firstSeen);
        const db = b.currentReasonSince ? new Date(b.currentReasonSince) : new Date(b.firstSeen);
        return da.getTime() - db.getTime();
    });

    filtered.forEach(row => {
        let bD = 0;
        let cD = 0;
        let sD = 0;
        
        if (row.history && Array.isArray(row.history)) {
            row.history.forEach(h => {
                const cat = getReasonCategory(h.status, h.reason, h.by);
                const d = h.durationDays || 0;
                if (cat === 'CABANG') bD += d;
                else if (cat === 'CUSTOMER') cD += d;
                else if (cat === 'SEIN') sD += d;
            });
        }
        
        const sinceDate = row.currentReasonSince ? new Date(row.currentReasonSince) : new Date(row.firstSeen);
        const diffTime = now.getTime() - sinceDate.getTime();
        const currentStuckDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        
        const currentCat = getReasonCategory(row.status, row.reason, row.engineer);
        if (currentCat === 'CABANG') {
            bD += currentStuckDays;
            branchUnits++;
        } else if (currentCat === 'CUSTOMER') {
            cD += currentStuckDays;
            custUnits++;
        } else {
            sD += currentStuckDays;
            seinUnits++;
        }
        
        branchDays += bD;
        custDays += cD;
        seinDays += sD;
        
        let heatClass = 'heat-low';
        if (currentStuckDays >= 3) heatClass = 'heat-med';
        if (currentStuckDays >= 7) heatClass = 'heat-high';
        
        let catTag = '<span class="tag branch">CABANG</span>';
        if (currentCat === 'CUSTOMER') catTag = '<span class="tag cust">CUSTOMER</span>';
        if (currentCat === 'SEIN') catTag = '<span class="tag sein">SEIN</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = \`
            <td class="job-cell" onclick='showTimeline(\${JSON.stringify(row).replace(/'/g, "&apos;")}, \${currentStuckDays})'>\${row.jobNo}</td>
            <td>\${row.asc}</td>
            <td>\${row.engineer}</td>
            <td>\${catTag}</td>
            <td style="font-size: 0.8rem;">\${row.reason || 'KOSONG'}</td>
            <td class="\${heatClass}">\${currentStuckDays} Days</td>
        \`;
        tbody.appendChild(tr);
    });
    
    const totalUnits = branchUnits + custUnits + seinUnits || 1;
    const totalDays = branchDays + custDays + seinDays || 1;

    if (currentRatioMode === 'UNIT') {
        const pB = (branchUnits / totalUnits * 100).toFixed(1);
        const pC = (custUnits / totalUnits * 100).toFixed(1);
        const pS = (seinUnits / totalUnits * 100).toFixed(1);

        document.getElementById('statBranchVal').innerText = `${branchUnits} (${pB}%)`;
        document.getElementById('statBranchLbl').innerText = 'Branch Responsibility';

        document.getElementById('statCustVal').innerText = `${custUnits} (${pC}%)`;
        document.getElementById('statCustLbl').innerText = 'Customer Responsibility';

        document.getElementById('statSeinVal').innerText = `${seinUnits} (${pS}%)`;
        document.getElementById('statSeinLbl').innerText = 'SEIN Responsibility';

        renderChart([branchUnits, custUnits, seinUnits], ['Branch Responsibility', 'Customer Responsibility', 'SEIN Responsibility']);
    } else {
        const pB = (branchDays / totalDays * 100).toFixed(1);
        const pC = (custDays / totalDays * 100).toFixed(1);
        const pS = (seinDays / totalDays * 100).toFixed(1);

        document.getElementById('statBranchVal').innerText = `${branchDays}d (${pB}%)`;
        document.getElementById('statBranchLbl').innerText = 'Branch Responsibility (Days)';

        document.getElementById('statCustVal').innerText = `${custDays}d (${pC}%)`;
        document.getElementById('statCustLbl').innerText = 'Customer Responsibility (Days)';

        document.getElementById('statSeinVal').innerText = `${seinDays}d (${pS}%)`;
        document.getElementById('statSeinLbl').innerText = 'SEIN Responsibility (Days)';

        renderChart([branchDays, custDays, seinDays], ['Branch Responsibility (Days)', 'Customer Responsibility (Days)', 'SEIN Responsibility (Days)']);
    }
    
    document.getElementById('lastUpdateTxt').innerText = 'Live Update: ' + now.toLocaleTimeString();
}

function renderChart(dataValues, labels) {
    const ctx = document.getElementById('blameChart').getContext('2d');
    
    if (blameChartInstance) {
        blameChartInstance.data.labels = labels;
        blameChartInstance.data.datasets[0].data = dataValues;
        blameChartInstance.update();
        return;
    }
    
    blameChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                borderWidth: 0,
                cutout: '72%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        font: { family: 'Plus Jakarta Sans', weight: 'bold', size: 10 },
                        padding: 8
                    } 
                }
            }
        }
    });
}

window.showTimeline = function(row, currentStuckDays) {
    document.getElementById('modalJobNo').innerText = "Job No: " + row.jobNo;
    document.getElementById('modalInfo').innerText = \`\${row.asc} | \${row.engineer} | Total Aging Laporan: \${row.totalAgingDays} Days\`;
    
    const tlContainer = document.getElementById('modalTimeline');
    tlContainer.innerHTML = '';
    
    if (row.history && row.history.length > 0) {
        row.history.forEach(h => {
            const c = getReasonCategory(h.status, h.reason, h.by);
            const cl = c === 'CABANG' ? 'branch' : (c === 'CUSTOMER' ? 'cust' : 'sein');
            tlContainer.innerHTML += \`
                <div class="timeline-item">
                    <div class="tl-date">\${new Date(h.startDate).toLocaleDateString()} - \${new Date(h.endDate).toLocaleDateString()}</div>
                    <div class="tl-reason">\${h.reason || 'KOSONG'}</div>
                    <div class="tl-duration \${cl}">Stagnan: \${h.durationDays} Days (\${c})</div>
                </div>
            \`;
        });
    }
    
    const currCat = getReasonCategory(row.status, row.reason, row.engineer);
    const currCl = currCat === 'CABANG' ? 'branch' : (currCat === 'CUSTOMER' ? 'cust' : 'sein');
    const sinceDateStr = row.currentReasonSince ? new Date(row.currentReasonSince).toLocaleDateString() : 'Baru';
    
    tlContainer.innerHTML += \`
        <div class="timeline-item">
            <div class="tl-date">\${sinceDateStr} - SEKARANG</div>
            <div class="tl-reason">\${row.reason || 'KOSONG'}</div>
            <div class="tl-duration \${currCl}">Stagnan: \${currentStuckDays} Days (\${currCat})</div>
        </div>
    \`;
    
    document.getElementById('timelineModal').style.display = 'flex';
};

window.triggerManualChangelog = async function() {
    const btn = document.getElementById('btnSyncChangelog');
    const txt = document.getElementById('btnSyncText');
    if (btn) btn.disabled = true;
    if (txt) txt.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memulai...';
    
    const targetBranch = myBranch || 'ALL';
    try {
        await db.collection('config').doc('changelog_trigger').set({
            command: 'SYNC',
            branch: targetBranch,
            status: 'PENDING',
            requestedAt: new Date().toISOString(),
            rpaSecret: 'BUJM_RPA_SECURE_2026'
        });
    } catch (err) {
        console.error('Trigger error:', err);
        if (btn) btn.disabled = false;
        if (txt) txt.innerText = 'Gagal Memicu';
        setTimeout(() => { if (txt) txt.innerText = 'Tarik Change Log'; }, 3000);
    }
};

// Listen to changelog_trigger status
function listenToChangelogTrigger() {
    db.collection('config').doc('changelog_trigger').onSnapshot(docSnap => {
        if (!docSnap.exists) return;
        const data = docSnap.data();
        const btn = document.getElementById('btnSyncChangelog');
        const txt = document.getElementById('btnSyncText');
        if (!btn || !txt) return;

        if (data.status === 'PENDING' || data.status === 'RUNNING') {
            btn.disabled = true;
            txt.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menarik (${data.branch || 'ALL'})...`;
        } else if (data.status === 'COMPLETED') {
            btn.disabled = false;
            txt.innerHTML = '<i class="fa-solid fa-check"></i> Selesai!';
            setTimeout(() => {
                txt.innerText = 'Tarik Change Log';
            }, 3000);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    listenToChangelogTrigger();
});
