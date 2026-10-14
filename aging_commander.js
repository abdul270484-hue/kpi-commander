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

// CLASSIFICATION LOGIC
const AGING_REASONS = [
    'MONITORING/AGING OR NOT REPRODUCED', 'RE-SCHEDULING BY ENG\\'R OR ASC',
    'RE-SCHEDULING BY CUSTOMER', 'WAITING FOR CONFIRMATION FROM CUSTOMER',
    'CONTACT WITH CUSTOMER FAILED', 'WAITING FOR ASC CONFIRMATION',
    'WAITING FOR SETTLEMENT'
];

const SEIN_REASONS = [
    'PARTS BACK ORDERED (SAMSUNG)', 'PARTS IN TRANSIT (SAMSUNG)',
    'PARTS NOT AVAILABLE (ASC)', 'PARTS DNA/SNA (ASC)',
    'PARTS P/O CANCELLATION', 'PARTS ALLOCATED(SAMSUNG)',
    'WAITING FOR SAMSUNG CONFIRMATION', 'WAITING CONFIRMATION FROM SAMSUNG',
    'APPROVAL PENDING', 'WAITING FOR APPROVAL'
];

function getReasonCategory(reason) {
    if (!reason) return 'OTHER';
    const r = reason.toUpperCase().trim();
    
    let isSein = SEIN_REASONS.includes(r);
    let isAging = AGING_REASONS.includes(r);
    
    if (rulesConfig.customReasons) {
        for (let cr of rulesConfig.customReasons) {
            if (r.includes(cr.keyword.toUpperCase())) {
                if (cr.category === 'SEIN') isSein = true;
                if (cr.category === 'AGING') isAging = true;
            }
        }
    }
    
    if (isSein) return 'SEIN';
    if (isAging) return 'AGING';
    return 'OTHER';
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
    
    let totalBranchDays = 0;
    let totalSeinDays = 0;
    
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
        let branchD = 0;
        let seinD = 0;
        
        if (row.history) {
            row.history.forEach(h => {
                const cat = getReasonCategory(h.reason);
                if (cat === 'AGING') branchD += h.durationDays;
                if (cat === 'SEIN') seinD += h.durationDays;
            });
        }
        
        const sinceDate = row.currentReasonSince ? new Date(row.currentReasonSince) : new Date(row.firstSeen);
        const diffTime = now.getTime() - sinceDate.getTime();
        const currentStuckDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        
        const currentCat = getReasonCategory(row.reason);
        if (currentCat === 'AGING') branchD += currentStuckDays;
        if (currentCat === 'SEIN') seinD += currentStuckDays;
        
        totalBranchDays += branchD;
        totalSeinDays += seinD;
        
        let heatClass = 'heat-low';
        if (currentStuckDays >= 3) heatClass = 'heat-med';
        if (currentStuckDays >= 7) heatClass = 'heat-high';
        
        let catTag = '<span class="tag other">OTHER</span>';
        if (currentCat === 'AGING') catTag = '<span class="tag branch">CABANG</span>';
        if (currentCat === 'SEIN') catTag = '<span class="tag sein">SEIN</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = \`
            <td class="job-cell" onclick='showTimeline(\${JSON.stringify(row).replace(/'/g, "&apos;")}, \${currentStuckDays})'>\${row.jobNo}</td>
            <td>\${row.asc}</td>
            <td>\${row.engineer}</td>
            <td>\${catTag}</td>
            <td style="font-size: 0.8rem;">\${row.reason || 'KOSONG'}</td>
            <td class="\${heatClass}">\${currentStuckDays} Hari</td>
        \`;
        tbody.appendChild(tr);
    });
    
    document.getElementById('statBranchDays').innerText = totalBranchDays;
    document.getElementById('statSeinDays').innerText = totalSeinDays;
    
    document.getElementById('lastUpdateTxt').innerText = 'Live Update: ' + now.toLocaleTimeString();

    renderChart(totalBranchDays, totalSeinDays);
}

function renderChart(branchDays, seinDays) {
    const ctx = document.getElementById('blameChart').getContext('2d');
    
    if (blameChartInstance) {
        blameChartInstance.data.datasets[0].data = [branchDays, seinDays];
        blameChartInstance.update();
        return;
    }
    
    blameChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Dosa Cabang (Hari)', 'Dosa SEIN (Hari)'],
            datasets: [{
                data: [branchDays, seinDays],
                backgroundColor: ['#ef4444', '#10b981'],
                borderWidth: 0,
                cutout: '75%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Plus Jakarta Sans', weight: 'bold' } } }
            }
        }
    });
}

window.showTimeline = function(row, currentStuckDays) {
    document.getElementById('modalJobNo').innerText = "Job No: " + row.jobNo;
    document.getElementById('modalInfo').innerText = \`\${row.asc} | \${row.engineer} | Total Aging Laporan: \${row.totalAgingDays} Hari\`;
    
    const tlContainer = document.getElementById('modalTimeline');
    tlContainer.innerHTML = '';
    
    if (row.history && row.history.length > 0) {
        row.history.forEach(h => {
            const c = getReasonCategory(h.reason);
            const cl = c === 'AGING' ? 'branch' : (c === 'SEIN' ? 'sein' : 'other');
            tlContainer.innerHTML += \`
                <div class="timeline-item">
                    <div class="tl-date">\${new Date(h.startDate).toLocaleDateString()} - \${new Date(h.endDate).toLocaleDateString()}</div>
                    <div class="tl-reason">\${h.reason || 'KOSONG'}</div>
                    <div class="tl-duration \${cl}">Stagnan: \${h.durationDays} Hari (\${c})</div>
                </div>
            \`;
        });
    }
    
    const currCat = getReasonCategory(row.reason);
    const currCl = currCat === 'AGING' ? 'branch' : (currCat === 'SEIN' ? 'sein' : 'other');
    const sinceDateStr = row.currentReasonSince ? new Date(row.currentReasonSince).toLocaleDateString() : 'Baru';
    
    tlContainer.innerHTML += \`
        <div class="timeline-item">
            <div class="tl-date">\${sinceDateStr} - SEKARANG</div>
            <div class="tl-reason">\${row.reason || 'KOSONG'}</div>
            <div class="tl-duration \${currCl}">Stagnan: \${currentStuckDays} Hari (\${currCat})</div>
        </div>
    \`;
    
    document.getElementById('timelineModal').style.display = 'flex';
};

document.addEventListener('DOMContentLoaded', init);
