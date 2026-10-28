/**
 * @file mpm_module.js
 * @description Manpower Management (MPM) Module for BUJM Dashboard.
 * Executive Light Theme matching ALL AGING and GD & SALES pages.
 * Integrates:
 * 1. Samsung Capacity Plan & 3-Month Moving Average GD
 * 2. Wall of Fame Live Production Ratios (Repair, Cancel, MX vs CE)
 * 3. Master Employee Roster (Sheet DATA 284 Staf + Official Photos)
 * 4. Inline Edit / Update Modal for Positions, Branches, and Active/Resign Status
 * 5. BOS Physical Guardrail: MX + CE Hybrid branches require MIN 2 MANPOWER
 */

(function () {
    // State management
    let mpmEmployees = [];
    let capacityData = [];
    let currentMpmSubTab = (function() {
        try {
            const saved = localStorage.getItem('bujm_mpm_subtab');
            return (saved === 'roster') ? 'roster' : 'capacity';
        } catch (_) { return 'capacity'; }
    })();
    let currentFilterStatus = 'ALL';
    let currentFilterType = 'ALL'; // 'ALL' | 'HYBRID' | 'MX' | 'CE' | 'REVISI'
    let currentFilterBranch = 'ALL';
    let currentFilterRole = 'ALL';
    let currentSearchTerm = '';
    let currentRosterBranch = 'ALL';
    let currentRosterSearch = '';
    let branchOverrides = {}; // { [branch]: { productType: string, note: string, updatedAt: string, updatedBy: string } }

    // Official operating branches present in Capacity Plan sheet "Summary" (Summ)
    const SUMMARY_ALLOWED_BRANCHES = new Set([
        'PONTIANAK',
        'BANJARMASIN',
        'PALANGKARAYA',
        'SAMARINDA',
        'TARAKAN',
        'BANDAR LAMPUNG',
        'BATAM',
        'PANGKAL PINANG',
        'BENGKULU',
        'TANJUNGPINANG',
        'SINGKAWANG',
        'BONTANG',
        'PAMEKASAN',
        'KARAWANG',
        'SAMPIT',
        'PANGKALAN BUN',
        'BANDAR JAYA',
        'PATI',
        'SRAGEN',
        'SERPONG ITC-BSD',
        'SERPONG',
        'BOJONEGORO',
        'SIDOARJO',
        'PROBOLINGGO',
        'DENPASAR',
        'DENPASAR - PLANET GADGET',
        'DENPASAR - CELLULAR WORLD',
        'SINGARAJA',
        'MAKASSAR',
        'MAKASSAR - LEVEL 21',
        'KENDARI',
        'PALOPO',
        'MAMUJU',
        'PALU',
        'LUWUK',
        'GORONTALO',
        'MANADO',
        'MANADO - IT CENTER',
        'TERNATE',
        'AMBON',
        'KUPANG',
        'ATAMBUA',
        'SORONG',
        'JAYAPURA',
        'TIMIKA',
        'BERAU'
    ]);

    // =========================================================================
    // STANDAR SAMSUNG ROLES & MAPPING HELPERS (MANDAT RESMI BOS 27 OKT 2026)
    // =========================================================================
    const SAMSUNG_ROLES_LIST = [
        'PIC',
        'CUSTOMER SERVICE',
        'ADMIN KEUANGAN',
        'TEKNISI HHP',
        'TEKNISI UB',
        'TEKNISI CE IN HOME',
        'TEKNISI CE CARRY IN',
        'TEKNISI B2B',
        'TEKNISI WELDER',
        'ADMIN TRACKING HHP',
        'ADMIN TRACKING CE',
        'ADMIN PART HHP',
        'ADMIN PART CE',
        'DRIVER',
        'OB',
        'SECURITY'
    ];

    function inferEmployeeRoles(emp) {
        if (!emp) return ['CUSTOMER SERVICE'];
        if (Array.isArray(emp.roles) && emp.roles.length > 0) return emp.roles;
        const text = ((emp.position || '') + ' ' + (emp.roleStatus || '')).toUpperCase();
        const roles = new Set();
        if (/\b(LEADER|PIC|HEAD|MANAGER|AM|SUPERVISOR|SPV|KOORDINATOR|COORDINATOR)\b/.test(text)) roles.add('PIC');
        if (/\b(CS|CUSTOMER)\b/.test(text)) roles.add('CUSTOMER SERVICE');
        if (/\b(KEUANGAN|FINANCE|ACCOUNTING|ACCT|CFO)\b/.test(text)) roles.add('ADMIN KEUANGAN');
        if (/\bTRACKING\b/.test(text)) {
            if (/\bCE\b/.test(text)) roles.add('ADMIN TRACKING CE');
            else roles.add('ADMIN TRACKING HHP');
        }
        if (/\bPART\b/.test(text)) {
            if (/\bCE\b/.test(text)) roles.add('ADMIN PART CE');
            else roles.add('ADMIN PART HHP');
        }
        if (/\bADMIN\b/.test(text) && !roles.has('ADMIN KEUANGAN') && !roles.has('ADMIN TRACKING HHP') && !roles.has('ADMIN PART HHP') && !roles.has('ADMIN TRACKING CE') && !roles.has('ADMIN PART CE')) {
            roles.add('CUSTOMER SERVICE');
        }
        if (/\bUB\b/.test(text)) roles.add('TEKNISI UB');
        if (/\bWELDER\b/.test(text)) roles.add('TEKNISI WELDER');
        if (/\bB2B\b/.test(text)) roles.add('TEKNISI B2B');
        if (/\b(CARRY IN|CARRY-IN)\b/.test(text)) roles.add('TEKNISI CE CARRY IN');
        if (/\b(IN HOME|INHOME|TOUR SERVICE|HOME SERVICE)\b/.test(text)) roles.add('TEKNISI CE IN HOME');
        if (/\b(HHP|MOBILE|SMARTPHONE|MX)\b/.test(text) && /\b(TECH|TEKNISI)\b/.test(text)) roles.add('TEKNISI HHP');
        if (/\b(TECH|TEKNISI|TECHNICIAN)\b/.test(text) && /\bCE\b/.test(text) && !roles.has('TEKNISI CE CARRY IN') && !roles.has('TEKNISI CE IN HOME')) roles.add('TEKNISI CE IN HOME');
        if (/\b(TECH|TEKNISI|TECHNICIAN|TS)\b/.test(text) && !Array.from(roles).some(r => r.startsWith('TEKNISI'))) roles.add('TEKNISI HHP');
        if (/\bDRIVER\b/.test(text)) roles.add('DRIVER');
        if (/\b(OB|OFFICE BOY)\b/.test(text)) roles.add('OB');
        if (/\bSECURITY\b/.test(text)) roles.add('SECURITY');
        if (roles.size === 0) roles.add('CUSTOMER SERVICE');
        return Array.from(roles);
    }

    function inferPositionCategory(pos, roles) {
        if (['LEADER/PIC', 'ADMIN', 'TEKNISI', 'HELPER'].includes(pos)) return pos;
        const up = String(pos || '').toUpperCase();
        if (roles.includes('DRIVER') || roles.includes('OB') || roles.includes('SECURITY') || up.includes('DRIVER') || up.includes('OB') || up.includes('SECURITY')) {
            return 'HELPER';
        }
        if (roles.some(r => r.startsWith('TEKNISI')) || up.includes('TECH') || up.includes('TEKNISI') || up.includes('WELDER')) {
            if (roles.includes('PIC') || up.includes('LEADER') || up.includes('PIC')) {
                return 'LEADER/PIC';
            }
            return 'TEKNISI';
        }
        if (roles.includes('PIC') || up.includes('LEADER') || up.includes('PIC') || up.includes('AM') || up.includes('MANAGER')) {
            return 'LEADER/PIC';
        }
        return 'ADMIN';
    }

    // =========================================================================
    // HELPER: PARSE TANGGAL & KALKULASI MASA KERJA (MANDAT BOS)
    // =========================================================================
    function parseJoinDate(val) {
        if (!val) return null;
        if (val instanceof Date && !isNaN(val)) return val;
        val = String(val).trim();
        // Format YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
            const parts = val.split('-');
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
        // Format DD/MM/YYYY or DD-MM-YYYY
        const dmyMatch = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dmyMatch) {
            return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
        }
        const parsed = new Date(val);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    function calculateTenure(joinDateVal) {
        const startDate = parseJoinDate(joinDateVal);
        if (!startDate) return { tenureYears: '0.0', tenureText: '-' };
        const now = new Date();
        if (startDate > now) return { tenureYears: '0.0', tenureText: 'Baru Masuk' };

        let years = now.getFullYear() - startDate.getFullYear();
        let months = now.getMonth() - startDate.getMonth();
        let days = now.getDate() - startDate.getDate();

        if (days < 0) {
            months -= 1;
            const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years -= 1;
            months += 12;
        }

        const totalDays = Math.max(0, Math.floor((now - startDate) / (1000 * 60 * 60 * 24)));
        const tenureYears = (totalDays / 365.25).toFixed(1);

        const parts = [];
        if (years > 0) parts.push(`${years} tahun`);
        if (months > 0) parts.push(`${months} bulan`);
        if (days > 0 || parts.length === 0) parts.push(`${days} hari`);

        const tenureText = parts.join(', ');
        return { tenureYears, tenureText };
    }

    function toInputDateFormat(dateVal) {
        const d = parseJoinDate(dateVal);
        if (!d) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function toDisplayDateFormat(dateVal) {
        const d = parseJoinDate(dateVal);
        if (!d) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy}`;
    }

    function normalizeEmployeeFields(emp) {
        if (!emp) return;
        emp.branch = normalizeBranchName(emp.branch);
        if (!emp.roles || !Array.isArray(emp.roles) || emp.roles.length === 0) {
            emp.roles = inferEmployeeRoles(emp);
        }
        if (!['LEADER/PIC', 'ADMIN', 'TEKNISI', 'HELPER'].includes(emp.position)) {
            emp.position = inferPositionCategory(emp.position, emp.roles);
        }
        emp.roleStatus = emp.roles.join(', ');

        // Kalkulasi dinamis masa kerja dari joinDate jika belum ada atau kosong
        if (emp.joinDate && (!emp.tenureText || emp.tenureText === '-')) {
            const tenureCalc = calculateTenure(emp.joinDate);
            emp.tenureYears = tenureCalc.tenureYears;
            emp.tenureText = tenureCalc.tenureText;
        }
    }

    // MANDAT RESMI BOS:
    // "saat peran ada tercek list teknisi, posisi itu penentu masuk di perhitungan 'Ratio w/o Admin' (ratio tanpa admin)"
    function isEmployeeTechnician(emp) {
        if (!emp) return false;
        if (Array.isArray(emp.roles) && emp.roles.length > 0) {
            return emp.roles.some(r => {
                const up = String(r).toUpperCase();
                return up.includes('TEKNISI') || up.includes('TECH') || up.includes('WELDER');
            });
        }
        if (emp.roleStatus) {
            const up = String(emp.roleStatus).toUpperCase();
            if (up.includes('TEKNISI') || up.includes('TECH') || up.includes('WELDER')) return true;
        }
        if (emp.position) {
            const up = String(emp.position).toUpperCase();
            if (up === 'TEKNISI' || up.includes('TEKNISI') || up.includes('TECH') || up.includes('WELDER')) return true;
        }
        return false;
    }

    function isEmployeeCe(emp) {
        if (!emp) return false;
        const combined = ((emp.roles ? emp.roles.join(' ') : '') + ' ' + (emp.roleStatus || '') + ' ' + (emp.position || '')).toUpperCase();
        return /\b(CE|IN HOME|INHOME|CARRY IN|WELDER|B2B)\b/.test(combined);
    }

    function isEmployeeMx(emp) {
        if (!emp) return false;
        const combined = ((emp.roles ? emp.roles.join(' ') : '') + ' ' + (emp.roleStatus || '') + ' ' + (emp.position || '')).toUpperCase();
        return /\b(HHP|UB|MX|MOBILE|SMARTPHONE)\b/.test(combined);
    }

    // Initialize module when DOM is ready or called
    window.initMpmModule = async function () {
        console.log('[MPM] Initializing Manpower Management Module (Executive Light Theme)...');
        const container = document.getElementById('mpm-container');
        if (!container) {
            console.error('[MPM] Container #mpm-container not found in DOM!');
            return;
        }

        // Apply clean executive white background matching ALL AGING and GD & SALES
        container.style.display = 'flex';
        container.style.background = '#ffffff';
        container.style.color = '#0f172a';
        container.style.width = '100%';
        container.style.minHeight = '85vh';

        // Render base shell immediately so user sees layout without delay
        renderMpmShell(container);

        // Instant render from local cache if already present
        if (capacityData.length > 0) {
            renderActiveSubTab();
        }

        // Load data in sequence so calculateMpmCapacityData has full employees roster
        await loadBranchOverrides();
        await loadEmployeesData();
        await calculateMpmCapacityData();

        // Render active view with fresh data
        console.log(`[MPM] Ready! Rendering active view with ${capacityData.length} branches and ${mpmEmployees.length} employees.`);
        renderActiveSubTab();
    };

    // Helper to reliably obtain window.db even if module scripts initialize asynchronously
    async function waitForDb(maxWaitMs = 4000) {
        if (window.db) return window.db;
        return new Promise((resolve) => {
            const start = Date.now();
            const timer = setInterval(() => {
                if (window.db) {
                    clearInterval(timer);
                    resolve(window.db);
                } else if (Date.now() - start >= maxWaitMs) {
                    clearInterval(timer);
                    console.warn('[MPM] Timed out waiting for window.db');
                    resolve(null);
                }
            }, 50);
        });
    }

    // Load branch service type overrides (BOS Revisions)
    async function loadBranchOverrides() {
        const localCached = localStorage.getItem('bujm_mpm_branch_overrides');
        if (localCached) {
            try {
                branchOverrides = JSON.parse(localCached) || {};
                console.log(`[MPM] Loaded ${Object.keys(branchOverrides).length} branch service overrides from LocalStorage.`);
            } catch (_) {}
        }
        const db = await waitForDb(2500);
        if (db) {
            try {
                const snap = await db.collection('dashboard_data').doc('mpm_branch_overrides').get();
                if (snap.exists && snap.data().overrides) {
                    branchOverrides = snap.data().overrides;
                    try { localStorage.setItem('bujm_mpm_branch_overrides', JSON.stringify(branchOverrides)); } catch (_) {}
                    console.log(`[MPM] Synced ${Object.keys(branchOverrides).length} branch service overrides from Firestore.`);
                    applyOverridesToCapacityData();
                    if (currentMpmSubTab === 'capacity') renderActiveSubTab();
                }
            } catch (err) {
                console.warn('[MPM] Firestore overrides sync warning:', err.message);
            }
        }
    }

    // Apply BOS service type overrides to capacityData
    function applyOverridesToCapacityData() {
        if (!capacityData || !capacityData.length) return;
        capacityData.forEach(r => {
            const ovr = branchOverrides[r.branch];
            if (ovr && ovr.productType) {
                r.productType = ovr.productType;
                r.isOverridden = true;
                r.overrideNote = ovr.note || '';

                let pureMinStaff = 1;
                if (r.totalAdjust < 100) pureMinStaff = 1;
                else if (r.totalAdjust < 200) pureMinStaff = 2;
                else pureMinStaff = Math.round(r.totalAdjust / 100);

                if (r.productType === 'HYBRID (MX+CE)') {
                    r.finalMinStaff = Math.max(pureMinStaff, 2);
                    r.bosGuardrail = pureMinStaff < 2;
                } else {
                    r.finalMinStaff = pureMinStaff;
                    r.bosGuardrail = false;
                }

                // Formula Kolom BJ Excel (Real Person vs Min Staff) tapi HELPER DIKELUARKAN (Count = 0 di sheet 1)
                const effectiveStaff = (r.allStaff || 0) - (r.helperCount || 0);
                r.effectiveStaff = effectiveStaff;
                r.totalStaff = effectiveStaff;
                r.diff = effectiveStaff - r.finalMinStaff;
                if (effectiveStaff < r.finalMinStaff) r.status = 'KURANG';
                else if (effectiveStaff > r.finalMinStaff) r.status = 'LEBIH';
                else r.status = 'CUKUP';
            } else {
                r.isOverridden = false;
                r.overrideNote = '';
            }
        });
    }

    // Load employee roster from LocalStorage, JSON fallback, and REALTIME Firestore listener
    async function loadEmployeesData() {
        let loadedInitial = false;

        // 1. Check localStorage first for instant 0ms rendering
        const localCached = localStorage.getItem('bujm_mpm_employees');
        if (localCached) {
            try {
                const parsed = JSON.parse(localCached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    mpmEmployees = parsed;
                    mpmEmployees.forEach(normalizeEmployeeFields);
                    loadedInitial = true;
                    console.log(`[MPM] Loaded & normalized ${mpmEmployees.length} employees from LocalStorage.`);
                }
            } catch (_) {}
        }

        // 2. Fetch local JSON file if localCache is not available
        if (!loadedInitial) {
            try {
                const res = await fetch('./data/mpm_employees.json?v=' + Date.now());
                if (res.ok) {
                    mpmEmployees = await res.json();
                    mpmEmployees.forEach(normalizeEmployeeFields);
                    try { localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees)); } catch (_) {}
                    console.log(`[MPM] Loaded ${mpmEmployees.length} employees from JSON fallback.`);
                }
            } catch (e) {
                console.warn('[MPM] JSON fetch error:', e.message);
            }
        }

        // 3. Actively wait for window.db and fetch latest authoritative data from Firestore
        const db = await waitForDb(4000);
        if (db) {
            try {
                const snap = await db.collection('dashboard_data').doc('mpm_employees').get();
                if (snap.exists && Array.isArray(snap.data().employees)) {
                    mpmEmployees = snap.data().employees;
                    mpmEmployees.forEach(normalizeEmployeeFields);
                    try {
                        localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
                    } catch (_) {}
                    console.log(`[MPM] Firestore authoritative sync loaded ${mpmEmployees.length} employees.`);
                }
            } catch (e) {
                console.warn('[MPM] Firestore employees initial fetch error:', e.message);
            }

            // ATTACH REAL-TIME FIRESTORE LISTENER (Mandat Real-time Multi-User Asmen & BOS)
            // Whenever ANY Asmen or BOS edits any employee, changes sync automatically in real-time
            if (!window._mpmEmployeesListenerAttached) {
                window._mpmEmployeesListenerAttached = true;
                db.collection('dashboard_data').doc('mpm_employees').onSnapshot(snap => {
                    if (snap.exists && Array.isArray(snap.data().employees)) {
                        const remoteEmployees = snap.data().employees;
                        console.log(`[MPM] Realtime Firestore sync: ${remoteEmployees.length} employees received.`);
                        mpmEmployees = remoteEmployees;
                        mpmEmployees.forEach(normalizeEmployeeFields);
                        try {
                            localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
                        } catch (_) {}

                        // Auto-recalculate capacity when data changes remotely
                        calculateMpmCapacityData();

                        // Update current active subtab
                        if (currentMpmSubTab === 'roster') {
                            updateRosterTableRows();
                            // Update tab header badge
                            const branchEmployees = mpmEmployees.filter(e => normalizeBranchName(e.branch) !== 'HO' && e.status !== 'RESIGN');
                            const rosterBtn = document.getElementById('mpm-tab-roster');
                            if (rosterBtn) {
                                rosterBtn.innerHTML = `<i class="fa-solid fa-id-card-clip"></i> Data Manpower (${branchEmployees.length})`;
                            }
                        } else if (currentMpmSubTab === 'capacity') {
                            updateCapacityTableRows();
                        }
                    }
                }, err => console.warn('[MPM] Realtime employees listener warning:', err.message));
            }

            // 4. Background sync photos from Firestore collection 'mpm_photos' (non-blocking)
            db.collection('mpm_photos').get().then(snap => {
                if (!snap.empty) {
                    snap.forEach(docSnap => {
                        const d = docSnap.data();
                        if (d && d.nik && d.photoData) {
                            try { localStorage.setItem('bujm_photo_' + d.nik, d.photoData); } catch (_) {}
                        }
                    });
                    console.log(`[MPM] Synced ${snap.size} photos from Firestore 'mpm_photos'.`);
                    if (currentMpmSubTab === 'roster') {
                        updateRosterTableRows();
                    }
                }
            }).catch(err => console.warn('[MPM] Firestore photos sync warning:', err.message));
        }
    }

    // Calculate capacity data based on 3M GD average + Wall of Fame + BOS Rules
    async function calculateMpmCapacityData() {
        // 1. Instant load from local JSON cache if capacityData is empty
        if (!capacityData.length) {
            try {
                const res = await fetch('./data/mpm_capacity.json');
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.branches && json.branches.length > 0) {
                        capacityData = json.branches
                            .map(b => ({ ...b, branch: normalizeBranchName(b.branch) }))
                            .filter(b => SUMMARY_ALLOWED_BRANCHES.has(b.branch));
                        applyOverridesToCapacityData();
                        console.log(`[MPM] Instantly pre-loaded ${capacityData.length} branches from mpm_capacity.json.`);
                    }
                }
            } catch (err) {
                console.warn('[MPM] Local capacity JSON fetch warning:', err.message);
            }
        }

        let gdTrend = (window.rawDashboardData && window.rawDashboardData.gdTrendData) || window.gdTrendDataGlobal || {};
        let fameList = window.fameData || window.prodData || [];
        let dtsMx = {};
        let dtsIh = {};

        // 2. Try Firestore with strict 2-second timeout so it NEVER hangs
        const db = await waitForDb(2000);
        if (db) {
            try {
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000));
                const fetchPromise = Promise.all([
                    db.collection('dashboard_data').doc('latest_prod').get(),
                    db.collection('dashboard_data').doc('latest_eng').get()
                ]);
                const [prodSnap, engSnap] = await Promise.race([fetchPromise, timeoutPromise]);
                if (prodSnap && prodSnap.exists) {
                    const p = prodSnap.data();
                    if (p.gdTrendData) gdTrend = p.gdTrendData;
                    if (p.fameList && p.fameList.length > 0) fameList = p.fameList;
                }
                if (engSnap && engSnap.exists) {
                    const e = engSnap.data();
                    if (e.dtsMxData) dtsMx = e.dtsMxData;
                    if (e.dtsIhData) dtsIh = e.dtsIhData;
                }
            } catch (err) {
                console.warn('[MPM] Firestore capacity fetch warning (using cached data):', err.message);
            }
        }

        // Count real technicians and staff positions from live edited mpmEmployees for real-time reactive sync!
        // Mandat BOS: Leader/PIC, Teknisi (Teknisi Riil), Admin, Helper
        const rosterBranchStats = {};
        mpmEmployees.filter(e => e.status !== 'RESIGN').forEach(e => {
            const b = normalizeBranchName(e.branch);
            if (!rosterBranchStats[b]) {
                rosterBranchStats[b] = {
                    techs: 0,
                    allStaff: 0,
                    techHhp: 0,
                    techCe: 0,
                    leaderCount: 0,
                    techCount: 0,
                    adminCount: 0,
                    helperCount: 0
                };
            }
            rosterBranchStats[b].allStaff++;

            const pos = ['LEADER/PIC', 'ADMIN', 'TEKNISI', 'HELPER'].includes(e.position)
                ? e.position
                : inferPositionCategory(e.position, e.roles);

            if (pos === 'LEADER/PIC') rosterBranchStats[b].leaderCount++;
            else if (pos === 'TEKNISI') rosterBranchStats[b].techCount++;
            else if (pos === 'ADMIN') rosterBranchStats[b].adminCount++;
            else if (pos === 'HELPER') rosterBranchStats[b].helperCount++;

            if (isEmployeeTechnician(e)) {
                rosterBranchStats[b].techs++;
                if (isEmployeeCe(e)) rosterBranchStats[b].techCe++;
                else rosterBranchStats[b].techHhp++;
            }
        });

        const hasGdData = gdTrend && Object.keys(gdTrend).length > 0;

        // If no live GD trend data available (offline / initial load), preserve precalculated GD numbers from cache
        if (!hasGdData && capacityData.length > 0) {
            capacityData = capacityData.filter(b => SUMMARY_ALLOWED_BRANCHES.has(b.branch));
            capacityData.forEach(r => {
                const rData = rosterBranchStats[r.branch];
                if (rData) {
                    if (rData.techs > 0) r.realTech = rData.techs;
                    if (rData.allStaff > 0) r.allStaff = rData.allStaff;
                    r.leaderCount = rData.leaderCount || 0;
                    r.techCount = rData.techCount || 0;
                    r.adminCount = rData.adminCount || 0;
                    r.helperCount = rData.helperCount || 0;
                    const effectiveStaff = (r.allStaff || 0) - (r.helperCount || 0);
                    r.effectiveStaff = effectiveStaff;
                    r.totalStaff = effectiveStaff;
                    r.totalCancel = (r.cancelHhp || 0) + (r.cancelCe || 0);
                    r.ratioWoAdmin = r.realTech > 0 ? parseFloat((r.totalAdjust / r.realTech).toFixed(1)) : 0;
                    r.ratioWithAdmin = r.allStaff > 0 ? parseFloat((r.totalAdjust / r.allStaff).toFixed(1)) : 0;
                    r.diff = effectiveStaff - r.finalMinStaff;
                    if (effectiveStaff < r.finalMinStaff) r.status = 'KURANG';
                    else if (effectiveStaff > r.finalMinStaff) r.status = 'LEBIH';
                    else r.status = 'CUKUP';
                } else {
                    r.leaderCount = r.leaderCount || 0;
                    r.techCount = r.techCount || 0;
                    r.adminCount = r.adminCount || 0;
                    r.helperCount = r.helperCount || 0;
                    r.effectiveStaff = (r.allStaff || 0) - (r.helperCount || 0);
                    r.totalStaff = r.effectiveStaff;
                    r.totalCancel = (r.cancelHhp || 0) + (r.cancelCe || 0);
                }
            });
            applyOverridesToCapacityData();
            return;
        }

        const months3 = ['2026-07', '2026-08', '2026-09'];
        const techCategoryMap = {};
        for (const name in dtsMx) techCategoryMap[name.toUpperCase()] = 'MX';
        for (const name in dtsIh) techCategoryMap[name.toUpperCase()] = 'CE';

        // Fame stats
        const fameStats = {};
        fameList.forEach(t => {
            const b = normalizeBranchName(t.resolvedBranch || t.asc);
            if (!fameStats[b]) fameStats[b] = { repairHhp: 0, repairCe: 0, cancelHhp: 0, cancelCe: 0 };
            const engUpper = (t.engineer || '').toUpperCase().trim();
            const cat = techCategoryMap[engUpper] || (t.dtsIhTotalVisits > 0 ? 'CE' : 'MX');
            if (cat === 'CE') {
                fameStats[b].repairCe += (t.gdRepair || 0);
                fameStats[b].cancelCe += (t.gdCancel || 0);
            } else {
                fameStats[b].repairHhp += (t.gdRepair || 0);
                fameStats[b].cancelHhp += (t.gdCancel || 0);
            }
        });

        const allBranches = new Set();
        months3.forEach(m => {
            const mObj = gdTrend[m] || {};
            Object.keys(mObj).forEach(b => allBranches.add(normalizeBranchName(b)));
        });
        Object.keys(rosterBranchStats).forEach(b => allBranches.add(b));

        const results = [];

        allBranches.forEach(branch => {
            if (!branch || branch === 'UNKNOWN' || branch === 'HO' || !SUMMARY_ALLOWED_BRANCHES.has(branch)) return;

            let gdSum = 0, gdCount = 0;
            months3.forEach(m => {
                const mObj = gdTrend[m] || {};
                for (const k in mObj) {
                    if (normalizeBranchName(k) === branch) {
                        gdSum += mObj[k];
                        gdCount++;
                        break;
                    }
                }
            });
            const avg3MonthGd = gdCount > 0 ? Math.round(gdSum / gdCount) : 0;
            const rData = rosterBranchStats[branch] || { techs: 0, allStaff: 0, techHhp: 0, techCe: 0 };
            const fData = fameStats[branch] || { repairHhp: 0, repairCe: 0, cancelHhp: 0, cancelCe: 0 };

            if (avg3MonthGd === 0 && rData.allStaff === 0) return;

            // MANDAT RESMI OPERASIONAL DARI BOS (27 OKT 2026):
            // 1. CE ONLY: HANYA cabang SERPONG
            // 2. MX ONLY: SERPONG ITC-BSD, DENPASAR CELLULAR WORLD, DENPASAR PLANET GADGET, SRAGEN, SINGARAJA, BANDAR JAYA
            // 3. HYBRID (MX + CE): Semua cabang sisanya (35 cabang)
            // Serta Aturan Emas BOS: Hybrid WAJIB MINIMAL 2 MANPOWER (1 counter MX + 1 mobile CE in-home)
            let baseProductType = 'HYBRID (MX+CE)';
            if (branch === 'SERPONG') {
                baseProductType = 'CE ONLY';
            } else if (
                branch === 'SERPONG ITC-BSD' ||
                branch === 'DENPASAR - CELLULAR WORLD' ||
                branch === 'DENPASAR - PLANET GADGET' ||
                branch === 'SRAGEN' ||
                branch === 'SINGARAJA' ||
                branch === 'BANDAR JAYA'
            ) {
                baseProductType = 'MX ONLY';
            }

            // Cek apakah ada revisi tipe layanan manual dari BOS
            const ovr = branchOverrides[branch];
            const productType = (ovr && ovr.productType) ? ovr.productType : baseProductType;
            const isOverridden = !!(ovr && ovr.productType);
            const overrideNote = ovr ? (ovr.note || '') : '';

            // FIX REKAP DATA: Proporsi Volume dihitung murni dari Tipe Layanan & Data Riil Tiket GSPN (Fame),
            // TIDAK BOLEH dioverride atau dirusak oleh roster teknisi cabang!
            const totalFame = fData.repairHhp + fData.repairCe;
            let propHhp = 0.8;
            let propCe = 0.2;

            if (productType === 'CE ONLY') {
                propHhp = 0.0;
                propCe = 1.0;
            } else if (productType === 'MX ONLY') {
                propHhp = 1.0;
                propCe = 0.0;
            } else if (totalFame > 0) {
                // Cabang HYBRID: Gunakan proporsi riil tiket repair GSPN
                propHhp = fData.repairHhp / totalFame;
                propCe = fData.repairCe / totalFame;
            }

            const volHhp = Math.round(avg3MonthGd * propHhp);
            const volCe = Math.round(avg3MonthGd * propCe);
            const cancelHhp = fData.cancelHhp || 0;
            const cancelCe = fData.cancelCe || 0;
            const totalCancel = cancelHhp + cancelCe;

            const adjustHhp = volHhp + (0.5 * cancelHhp);
            const adjustCe = (volCe * 2.5) + (0.5 * cancelCe);
            const totalAdjust = Math.round(adjustHhp + adjustCe);

            // Norma Samsung Murni
            let pureMinStaff = 1;
            if (totalAdjust < 100) pureMinStaff = 1;
            else if (totalAdjust < 200) pureMinStaff = 2;
            else pureMinStaff = Math.round(totalAdjust / 100);

            const hasCe = volCe > 0 || rData.techCe > 0 || fData.repairCe > 0;
            const hasMx = volHhp > 0 || rData.techHhp > 0 || fData.repairHhp > 0;

            let finalMinStaff = pureMinStaff;
            let bosGuardrail = false;
            if (productType === 'HYBRID (MX+CE)' && finalMinStaff < 2) {
                finalMinStaff = 2;
                bosGuardrail = true;
            } else if (productType !== 'HYBRID (MX+CE)') {
                finalMinStaff = pureMinStaff;
                bosGuardrail = false;
            }

            const realTech = rData.techs > 0 ? rData.techs : (fameStats[branch] ? 1 : 0);
            const ratioWoAdmin = realTech > 0 ? (totalAdjust / realTech) : 0;
            const ratioWithAdmin = rData.allStaff > 0 ? (totalAdjust / rData.allStaff) : 0;

            // Formula Kolom BJ Excel (Real Person vs Min Staff) tapi HELPER DIKELUARKAN (Count = 0 di sheet 1)
            const effectiveStaff = (rData.allStaff || 0) - (rData.helperCount || 0);
            rData.effectiveStaff = effectiveStaff;
            rData.totalStaff = effectiveStaff;
            const diff = effectiveStaff - finalMinStaff;

            let status = 'CUKUP';
            if (effectiveStaff < finalMinStaff) status = 'KURANG';
            else if (effectiveStaff > finalMinStaff) status = 'LEBIH';

            results.push({
                branch,
                productType,
                isOverridden,
                overrideNote,
                hasCe,
                hasMx,
                avg3MonthGd,
                volHhp,
                volCe,
                totalCancel,
                cancelHhp,
                cancelCe,
                totalAdjust,
                pureMinStaff,
                finalMinStaff,
                leaderCount: rData.leaderCount || 0,
                techCount: rData.techCount || 0,
                realTech,
                adminCount: rData.adminCount || 0,
                helperCount: rData.helperCount || 0,
                totalStaff: effectiveStaff,
                effectiveStaff,
                allStaff: rData.allStaff,
                ratioWoAdmin: parseFloat(ratioWoAdmin.toFixed(1)),
                ratioWithAdmin: parseFloat(ratioWithAdmin.toFixed(1)),
                diff,
                status,
                bosGuardrail
            });
        });

        // Sort: Z-A (Descending) by Ratio w/ Admin (Permintaan BOS)
        results.sort((a, b) => {
            const diff = (b.ratioWithAdmin || 0) - (a.ratioWithAdmin || 0);
            if (diff !== 0) return diff;
            return (b.totalAdjust || 0) - (a.totalAdjust || 0);
        });

        // Only update if we calculated valid branches, otherwise keep preloaded cache
        if (results.length > 0) {
            capacityData = results;
        }
    }

    // Dictionary mapping 100% abbreviations & 3-letter codes to Official Non-Abbreviated Branch Names
    const BRANCH_CODE_MAP = {
        'PNK': 'PONTIANAK', 'PNK2': 'PONTIANAK', 'PT2': 'PONTIANAK', '002-PNK': 'PONTIANAK', '002-PNK2': 'PONTIANAK',
        'BJM': 'BANJARMASIN', 'BNJ': 'BANJARMASIN', '003-BJM': 'BANJARMASIN', '003-BNJ': 'BANJARMASIN',
        'PKY': 'PALANGKARAYA', '004-PKY': 'PALANGKARAYA',
        'SMD': 'SAMARINDA', '005-SMD': 'SAMARINDA',
        'TRK': 'TARAKAN', 'TKN': 'TARAKAN', '006-TRK': 'TARAKAN', '006-TKN': 'TARAKAN',
        'LPG': 'BANDAR LAMPUNG', '007-LPG': 'BANDAR LAMPUNG',
        'BTM': 'BATAM', '008-BTM': 'BATAM',
        'PPG': 'PANGKAL PINANG', 'PKP': 'PANGKAL PINANG', '009-PPG': 'PANGKAL PINANG', '009-PKP': 'PANGKAL PINANG', 'PANGKALPINANG': 'PANGKAL PINANG',
        'BKL': 'BENGKULU', '010-BKL': 'BENGKULU',
        'TPG': 'TANJUNGPINANG', '011-TPG': 'TANJUNGPINANG',
        'SKW': 'SINGKAWANG', '012-SKW': 'SINGKAWANG',
        'BTG': 'BONTANG', '013-BTG': 'BONTANG',
        'PKS': 'PAMEKASAN', 'PMK': 'PAMEKASAN', '014-PKS': 'PAMEKASAN', '014-PMK': 'PAMEKASAN',
        'KRW': 'KARAWANG', '015-KRW': 'KARAWANG',
        'SMP': 'SAMPIT', 'SPT': 'SAMPIT', '016-SMP': 'SAMPIT', '016-SPT': 'SAMPIT',
        'PKB': 'PANGKALAN BUN', 'PBN': 'PANGKALAN BUN', '017-PKB': 'PANGKALAN BUN', '017-PBN': 'PANGKALAN BUN',
        'BDJ': 'BANDAR JAYA', '018-BDJ': 'BANDAR JAYA',
        'PTI': 'PATI', 'PAT': 'PATI', '019-PTI': 'PATI', '019-PAT': 'PATI',
        'SRG': 'SRAGEN', '020-SRG': 'SRAGEN',
        'SRT': 'SERPONG ITC-BSD', '021-SRT': 'SERPONG ITC-BSD',
        'SRP': 'SERPONG', '022-SRP': 'SERPONG', '022-SRP B2B': 'SERPONG',
        'BJN': 'BOJONEGORO', '023-BJN': 'BOJONEGORO',
        'SDJ': 'SIDOARJO', '024-SDJ': 'SIDOARJO',
        'PBO': 'PROBOLINGGO', '025-PBO': 'PROBOLINGGO',
        'DPS': 'DENPASAR', '026-DPS': 'DENPASAR',
        'DPG': 'DENPASAR - PLANET GADGET', '027-DPG': 'DENPASAR - PLANET GADGET',
        'DCW': 'DENPASAR - CELLULAR WORLD', '028-DCW': 'DENPASAR - CELLULAR WORLD',
        'SGJ': 'SINGARAJA', '029-SGJ': 'SINGARAJA',
        'MKS': 'MAKASSAR', '030-MKS': 'MAKASSAR',
        'MKL': 'MAKASSAR - LEVEL 21', '031-MKL': 'MAKASSAR - LEVEL 21',
        'KDI': 'KENDARI', '032-KDI': 'KENDARI',
        'PLP': 'PALOPO', '033-PLP': 'PALOPO',
        'MMJ': 'MAMUJU', '034-MMJ': 'MAMUJU',
        'PLU': 'PALU', '035-PLU': 'PALU',
        'LWK': 'LUWUK', '036-LWK': 'LUWUK',
        'GTO': 'GORONTALO', '037-GTO': 'GORONTALO',
        'MND': 'MANADO', '038-MND': 'MANADO',
        'TNT': 'TERNATE', '040-TNT': 'TERNATE',
        'ABN': 'AMBON', '041-ABN': 'AMBON',
        'KPG': 'KUPANG', '042-KPG': 'KUPANG',
        'SRO': 'SORONG', '044-SRO': 'SORONG',
        'JYP': 'JAYAPURA', '045-JYP': 'JAYAPURA',
        'TMK': 'TIMIKA', '046-TMK': 'TIMIKA',
        'BRU': 'BERAU', '049-BRU': 'BERAU',
        'HO': 'HO'
    };

    // Helper: Normalize Branch Name for reliable merging (Strict Non-Abbreviation)
    function normalizeBranchName(name) {
        if (!name) return '';
        let b = String(name).toUpperCase().trim();
        b = b.replace(/^BE\s+/i, '').replace(/^UNICOM\s+/i, '').replace(/^PT\.?\s*/i, '').trim();
        if (BRANCH_CODE_MAP[b]) return BRANCH_CODE_MAP[b];
        const stripped = b.replace(/^\d+\s*-\s*/, '').trim();
        if (BRANCH_CODE_MAP[stripped]) return BRANCH_CODE_MAP[stripped];

        if (b.includes('CELLULAR WORLD') || b.includes('TEUKU')) return 'DENPASAR - CELLULAR WORLD';
        if (b.includes('PLANET GADGET') || b.includes('GATSU')) return 'DENPASAR - PLANET GADGET';
        if (b.includes('ITC') || b.includes('BSD')) return 'SERPONG ITC-BSD';
        if (b.includes('SERPONG')) return 'SERPONG';
        if (b.includes('DENPASAR')) return 'DENPASAR';
        if (b.includes('MAKASSAR')) return 'MAKASSAR';
        if (b.includes('BANJARMASIN')) return 'BANJARMASIN';
        if (b.includes('SAMARINDA')) return 'SAMARINDA';
        if (b.includes('BANDAR LAMPUNG') || b.includes('LAMPUNG')) return 'BANDAR LAMPUNG';
        if (b.includes('PONTIANAK')) return 'PONTIANAK';
        if (b.includes('SIDOARJO')) return 'SIDOARJO';
        if (b.includes('MANADO')) return 'MANADO';
        if (b.includes('KARAWANG')) return 'KARAWANG';
        if (b.includes('KUPANG')) return 'KUPANG';
        if (b.includes('KENDARI')) return 'KENDARI';
        if (b.includes('BENGKULU')) return 'BENGKULU';
        if (b.includes('PALANGKARAYA')) return 'PALANGKARAYA';
        if (b.includes('PALU')) return 'PALU';
        if (b.includes('BATAM')) return 'BATAM';
        if (b.includes('AMBON')) return 'AMBON';
        if (b.includes('JAYAPURA')) return 'JAYAPURA';
        if (b.includes('PANGKALAN BUN')) return 'PANGKALAN BUN';
        if (b.includes('TANJUNGPINANG') || b.includes('TANJUNG PINANG')) return 'TANJUNGPINANG';
        if (b.includes('PATI')) return 'PATI';
        if (b.includes('SORONG')) return 'SORONG';
        if (b.includes('BONTANG')) return 'BONTANG';
        if (b.includes('SINGARAJA')) return 'SINGARAJA';
        if (b.includes('SAMPIT')) return 'SAMPIT';
        if (b.includes('SRAGEN')) return 'SRAGEN';
        if (b.includes('BOJONEGORO')) return 'BOJONEGORO';
        if (b.includes('PROBOLINGGO')) return 'PROBOLINGGO';
        if (b.includes('BANDAR JAYA')) return 'BANDAR JAYA';
        if (b.includes('BERAU')) return 'BERAU';
        if (b.includes('GORONTALO')) return 'GORONTALO';
        if (b.includes('LUWUK')) return 'LUWUK';
        if (b.includes('MAMUJU')) return 'MAMUJU';
        if (b.includes('PALOPO')) return 'PALOPO';
        if (b.includes('PAMEKASAN')) return 'PAMEKASAN';
        if (b.includes('PANGKAL PINANG') || b.includes('PANGKALPINANG')) return 'PANGKAL PINANG';
        if (b.includes('SINGKAWANG')) return 'SINGKAWANG';
        if (b.includes('TERNATE')) return 'TERNATE';
        if (b.includes('TIMIKA')) return 'TIMIKA';
        return stripped;
    }

    // Ensure modals are mounted directly to document.body to prevent containing-block / transform trapping
    function ensureMpmModals() {
        let editBackdrop = document.getElementById('mpm-edit-modal-backdrop');
        if (!editBackdrop) {
            editBackdrop = document.createElement('div');
            editBackdrop.id = 'mpm-edit-modal-backdrop';
            editBackdrop.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); z-index: 999999; backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 20px; overflow-y: auto;';
            editBackdrop.innerHTML = `
                <div id="mpm-edit-modal-box" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; width: 95%; max-width: 580px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.25); max-height: 90vh; overflow-y: auto; color: #0f172a; margin: auto;">
                    <!-- Modal body injected dynamically -->
                </div>
            `;
            document.body.appendChild(editBackdrop);
        } else if (editBackdrop.parentElement !== document.body) {
            document.body.appendChild(editBackdrop);
        }

        let typeBackdrop = document.getElementById('mpm-type-modal-backdrop');
        if (!typeBackdrop) {
            typeBackdrop = document.createElement('div');
            typeBackdrop.id = 'mpm-type-modal-backdrop';
            typeBackdrop.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); z-index: 999999; backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 20px; overflow-y: auto;';
            typeBackdrop.innerHTML = `
                <div id="mpm-type-modal-box" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; width: 95%; max-width: 540px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.25); max-height: 90vh; overflow-y: auto; color: #0f172a; margin: auto;">
                    <!-- Modal body injected dynamically -->
                </div>
            `;
            document.body.appendChild(typeBackdrop);
        } else if (typeBackdrop.parentElement !== document.body) {
            document.body.appendChild(typeBackdrop);
        }
    }

    // Render base shell with navigation tabs & containers
    function renderMpmShell(container) {
        ensureMpmModals();
        const branchStaffCount = mpmEmployees.filter(e => normalizeBranchName(e.branch) !== 'HO' && e.status !== 'RESIGN').length || 257;
        container.innerHTML = `
            <!-- MPM Header Bar (Executive Light Theme) -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">
                <div>
                    <h2 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; margin: 0;">
                        <i class="fa-solid fa-users-gear" style="color: var(--accent-blue, #2563eb);"></i>
                        MANPOWER MANAGEMENT (MPM)
                    </h2>
                    <p style="font-size: 0.85rem; color: #64748b; margin: 4px 0 0 0;">
                        Capacity Plan & Data Manpower Tim Operasional PT BUJM (Terintegrasi Live GSPN)
                    </p>
                </div>

                <!-- Sub-Tabs Switcher -->
                <div style="display: flex; gap: 6px; background: #f1f5f9; padding: 4px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <button id="mpm-tab-capacity" class="mpm-tab-btn" style="background: ${currentMpmSubTab === 'capacity' ? '#ffffff' : 'transparent'}; color: ${currentMpmSubTab === 'capacity' ? 'var(--accent-blue, #2563eb)' : '#64748b'}; border: 1px solid ${currentMpmSubTab === 'capacity' ? '#cbd5e1' : 'transparent'}; padding: 8px 16px; border-radius: 6px; font-weight: ${currentMpmSubTab === 'capacity' ? '700' : '600'}; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: ${currentMpmSubTab === 'capacity' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'};">
                        <i class="fa-solid fa-chart-pie"></i> Capacity & Load Ratios
                    </button>
                    <button id="mpm-tab-roster" class="mpm-tab-btn" style="background: ${currentMpmSubTab === 'roster' ? '#ffffff' : 'transparent'}; color: ${currentMpmSubTab === 'roster' ? 'var(--accent-blue, #2563eb)' : '#64748b'}; border: 1px solid ${currentMpmSubTab === 'roster' ? '#cbd5e1' : 'transparent'}; padding: 8px 16px; border-radius: 6px; font-weight: ${currentMpmSubTab === 'roster' ? '700' : '600'}; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: ${currentMpmSubTab === 'roster' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'};">
                        <i class="fa-solid fa-id-card-clip"></i> Data Manpower (${branchStaffCount})
                    </button>
                </div>
            </div>

            <!-- Content Area for Sub-Tabs -->
            <div id="mpm-subtab-content" style="width: 100%;">
                <div style="text-align: center; padding: 40px; color: #64748b;">
                    <i class="fa-solid fa-spinner fa-spin fa-2x" style="color: var(--accent-blue, #2563eb);"></i>
                    <p style="margin-top: 10px; font-weight: 500;">Menghitung kapasitas dan memuat data karyawan...</p>
                </div>
            </div>
        `;

        // Sub-Tab Switcher Event Handlers
        const tabCap = document.getElementById('mpm-tab-capacity');
        if (tabCap) tabCap.addEventListener('click', () => switchMpmSubTab('capacity'));
        const tabRoster = document.getElementById('mpm-tab-roster');
        if (tabRoster) tabRoster.addEventListener('click', () => switchMpmSubTab('roster'));
    }

    function switchMpmSubTab(tabName) {
        currentMpmSubTab = tabName;
        try { localStorage.setItem('bujm_mpm_subtab', tabName); } catch (_) {}
        document.querySelectorAll('.mpm-tab-btn').forEach(btn => {
            btn.style.background = 'transparent';
            btn.style.color = '#64748b';
            btn.style.borderColor = 'transparent';
            btn.style.boxShadow = 'none';
            btn.style.fontWeight = '600';
        });
        const activeBtn = document.getElementById(`mpm-tab-${tabName}`);
        if (activeBtn) {
            activeBtn.style.background = '#ffffff';
            activeBtn.style.color = 'var(--accent-blue, #2563eb)';
            activeBtn.style.borderColor = '#cbd5e1';
            activeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.06)';
            activeBtn.style.fontWeight = '700';
        }

        // Dynamically update Manpower tab label to show branch staff count (excl HO & Resign)
        const branchStaffCount = mpmEmployees.filter(e => normalizeBranchName(e.branch) !== 'HO' && e.status !== 'RESIGN').length || 257;
        const rosterBtn = document.getElementById('mpm-tab-roster');
        if (rosterBtn) {
            rosterBtn.innerHTML = `<i class="fa-solid fa-id-card-clip"></i> Data Manpower (${branchStaffCount})`;
        }

        renderActiveSubTab();
    }

    function renderActiveSubTab() {
        const content = document.getElementById('mpm-subtab-content');
        if (!content) return;

        if (currentMpmSubTab === 'roster') {
            renderRosterSubTab(content);
        } else {
            renderCapacitySubTab(content);
        }
    }

    // =========================================================================
    // SUB-TAB 1: CAPACITY & LIVING LOAD RATIOS (EXECUTIVE LIGHT THEME)
    // =========================================================================
    function renderCapacitySubTab(container) {
        const totalPoints = capacityData.reduce((s, r) => s + r.totalAdjust, 0);
        const totalMin = capacityData.reduce((s, r) => s + r.finalMinStaff, 0);
        const totalReal = capacityData.reduce((s, r) => s + r.realTech, 0);
        const totalEffective = capacityData.reduce((s, r) => s + (r.effectiveStaff || (r.allStaff - (r.helperCount || 0))), 0);
        const gap = totalEffective - totalMin;
        const kurangCount = capacityData.filter(r => r.status === 'KURANG').length;
        const cukupCount = capacityData.filter(r => r.status === 'CUKUP').length;
        const lebihCount = capacityData.filter(r => r.status === 'LEBIH').length;

        // Breakdown counts by Tipe Layanan (BOS Request)
        const hybridCount = capacityData.filter(r => r.productType === 'HYBRID (MX+CE)').length;
        const mxCount = capacityData.filter(r => r.productType === 'MX ONLY').length;
        const ceCount = capacityData.filter(r => r.productType === 'CE ONLY').length;
        const overriddenCount = capacityData.filter(r => r.isOverridden).length;

        // Distinct branches list for Capacity Branch Filter (Permintaan BOS)
        const allCapBranches = Array.from(new Set(capacityData.map(r => r.branch))).sort();

        // Filter data
        let filtered = capacityData.filter(r => {
            const matchStatus = currentFilterStatus === 'ALL' || r.status === currentFilterStatus;
            
            let matchType = true;
            if (currentFilterType === 'HYBRID') matchType = r.productType === 'HYBRID (MX+CE)';
            else if (currentFilterType === 'MX') matchType = r.productType === 'MX ONLY';
            else if (currentFilterType === 'CE') matchType = r.productType === 'CE ONLY';
            else if (currentFilterType === 'REVISI') matchType = r.isOverridden;

            const matchBranch = currentFilterBranch === 'ALL' || r.branch === currentFilterBranch;
            return matchStatus && matchType && matchBranch;
        });

        // Always ensure Z-A sort by Ratio w/ Admin (Permintaan BOS)
        filtered.sort((a, b) => {
            const diff = (b.ratioWithAdmin || 0) - (a.ratioWithAdmin || 0);
            if (diff !== 0) return diff;
            return (b.totalAdjust || 0) - (a.totalAdjust || 0);
        });

        container.innerHTML = `
            <!-- Controls: Filter Status Gap & Filter Cabang (Clean Single-Row Executive Style) -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin: 15px 0; background: #f8fafc; padding: 12px 18px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <!-- Filter Status Gap (Kurang, Cukup, Lebih) -->
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span style="font-size: 0.8rem; color: #475569; font-weight: 700; display: flex; align-items: center; gap: 6px; margin-right: 4px;">
                        <i class="fa-solid fa-filter" style="color: #2563eb;"></i> Filter Status:
                    </span>
                    <button class="cap-filter-btn ${currentFilterStatus === 'ALL' ? 'active' : ''}" data-val="ALL" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 700; border: 1px solid ${currentFilterStatus === 'ALL' ? '#2563eb' : '#cbd5e1'}; background: ${currentFilterStatus === 'ALL' ? '#2563eb' : '#ffffff'}; color: ${currentFilterStatus === 'ALL' ? '#ffffff' : '#475569'}; box-shadow: ${currentFilterStatus === 'ALL' ? '0 2px 4px rgba(37,99,235,0.2)' : 'none'};">Semua (${capacityData.length})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'KURANG' ? 'active' : ''}" data-val="KURANG" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 700; border: 1px solid ${currentFilterStatus === 'KURANG' ? '#ef4444' : '#fca5a5'}; background: ${currentFilterStatus === 'KURANG' ? '#ef4444' : '#fee2e2'}; color: ${currentFilterStatus === 'KURANG' ? '#ffffff' : '#dc2626'}; box-shadow: ${currentFilterStatus === 'KURANG' ? '0 2px 4px rgba(239,68,68,0.2)' : 'none'};">🔴 Kurang (${kurangCount})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'CUKUP' ? 'active' : ''}" data-val="CUKUP" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 700; border: 1px solid ${currentFilterStatus === 'CUKUP' ? '#10b981' : '#86efac'}; background: ${currentFilterStatus === 'CUKUP' ? '#10b981' : '#dcfce7'}; color: ${currentFilterStatus === 'CUKUP' ? '#ffffff' : '#16a34a'}; box-shadow: ${currentFilterStatus === 'CUKUP' ? '0 2px 4px rgba(16,185,129,0.2)' : 'none'};">🟢 Cukup (${cukupCount})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'LEBIH' ? 'active' : ''}" data-val="LEBIH" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 700; border: 1px solid ${currentFilterStatus === 'LEBIH' ? '#0284c7' : '#7dd3fc'}; background: ${currentFilterStatus === 'LEBIH' ? '#0284c7' : '#e0f2fe'}; color: ${currentFilterStatus === 'LEBIH' ? '#ffffff' : '#0284c7'}; box-shadow: ${currentFilterStatus === 'LEBIH' ? '0 2px 4px rgba(2,132,199,0.2)' : 'none'};">🔵 Lebih (${lebihCount})</button>
                </div>

                <!-- Filter Dropdown Cabang -->
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.8rem; color: #475569; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-location-dot" style="color: #2563eb;"></i> Cabang:
                    </span>
                    <select id="cap-branch-select" style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 7px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; outline: none; cursor: pointer; min-width: 220px;">
                        <option value="ALL">Semua Cabang (${allCapBranches.length})</option>
                        ${allCapBranches.map(b => `<option value="${b}" ${currentFilterBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                </div>
            </div>

            <!-- Capacity Data Table (Matching BUJM Executive Style) -->
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                    <thead>
                        <tr style="background: var(--accent-blue, #2563eb); color: #ffffff; border-bottom: 2px solid #1d4ed8;">
                            <th style="padding: 10px 8px; text-align: center; width: 40px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">No</th>
                            <th style="padding: 10px 10px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Cabang</th>
                            <th style="padding: 10px 10px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Tipe Layanan</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Vol HHP</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Vol CE (x2.5)</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #991b1b; color: #fee2e2;" title="Cancel tiket servis (bobot 0.5x poin)">Cancel (x0.5)</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Total Poin</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #1e3a8a;">Leader/PIC</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #1d4ed8;">Teknisi</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #1e3a8a;">Admin</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #1e3a8a;">Helper</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #1e40af;" title="Total Staf Efektif = Leader/PIC + Teknisi + Admin (Helper tidak dihitung)">Total Staff</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #0284c7;" title="Kebutuhan Minimum Staff dari Total Poin">Min Staff</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Ratio w/o Admin</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; background: #172554; border-left: 1px solid #3b82f6; border-right: 1px solid #3b82f6;">Ratio w/ Admin <i class="fa-solid fa-arrow-down-wide-short" style="color: #93c5fd; margin-left: 4px;" title="Sorted Z-A (Tertinggi ke Terendah)"></i></th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Status Gap</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; width: 85px;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="cap-table-body">
                    </tbody>
                </table>
            </div>
        `;

        // Event Listeners for Status Filter
        container.querySelectorAll('.cap-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilterStatus = btn.dataset.val;
                renderCapacitySubTab(container);
            });
        });

        const branchSelect = document.getElementById('cap-branch-select');
        if (branchSelect) {
            branchSelect.addEventListener('change', (e) => {
                currentFilterBranch = e.target.value;
                updateCapacityTableRows();
            });
        }

        // Initial render of table rows
        updateCapacityTableRows();
    }

    // Update only Capacity table rows to prevent input destruction and focus loss
    function updateCapacityTableRows() {
        const tbody = document.getElementById('cap-table-body');
        if (!tbody) return;

        let filtered = capacityData.filter(r => {
            const matchStatus = currentFilterStatus === 'ALL' || r.status === currentFilterStatus;
            const matchBranch = currentFilterBranch === 'ALL' || r.branch === currentFilterBranch;
            return matchStatus && matchBranch;
        });

        // Always ensure Z-A sort by Ratio w/ Admin (Permintaan BOS)
        filtered.sort((a, b) => {
            const diff = (b.ratioWithAdmin || 0) - (a.ratioWithAdmin || 0);
            if (diff !== 0) return diff;
            return (b.totalAdjust || 0) - (a.totalAdjust || 0);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="17" style="text-align: center; padding: 30px; color: #94a3b8; font-weight: 500;">Tidak ada cabang yang cocok dengan filter pencarian.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map((r, idx) => {
            let statusBadge = '';
            if (r.status === 'KURANG') statusBadge = `<span style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem; display: inline-block;">KURANG (${r.diff})</span>`;
            else if (r.status === 'LEBIH') statusBadge = `<span style="background: #e0f2fe; color: #0284c7; border: 1px solid #7dd3fc; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem; display: inline-block;">LEBIH (+${r.diff})</span>`;
            else statusBadge = `<span style="background: #dcfce7; color: #16a34a; border: 1px solid #86efac; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem; display: inline-block;">CUKUP</span>`;

            let ratioColor = '#16a34a';
            if (r.ratioWoAdmin > 115) ratioColor = '#dc2626';
            else if (r.ratioWoAdmin < 85) ratioColor = '#0284c7';

            let typeBadge = '';
            if (r.productType === 'HYBRID (MX+CE)') {
                typeBadge = `<span style="background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; padding: 3px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🟣 HYBRID MX+CE</span>`;
            } else if (r.productType === 'CE ONLY') {
                typeBadge = `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 3px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🟡 CE IN-HOME</span>`;
            } else {
                typeBadge = `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 3px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🔵 MX COUNTER</span>`;
            }

            return `
                <tr style="border-bottom: 1px solid #f1f5f9; background: #ffffff; color: #0f172a; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                    <td style="padding: 8px 10px; text-align: center; color: #64748b; font-size: 0.8rem;">${idx + 1}</td>
                    <td style="padding: 8px 10px; font-weight: 700; color: #0f172a;">
                        ${r.branch}
                        ${r.bosGuardrail ? `<i class="fa-solid fa-shield-halved" title="Aturan Khusus BOS: Hybrid MX+CE Wajib Min 2 Teknisi" style="color: #7c3aed; font-size: 0.75rem; margin-left: 5px;"></i>` : ''}
                    </td>
                    <td style="padding: 8px 10px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            ${typeBadge}
                            ${r.isOverridden ? `<span title="Direvisi manual oleh BOS: ${r.overrideNote || ''}" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; cursor: help;"><i class="fa-solid fa-check"></i> REVISI</span>` : ''}
                        </div>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #64748b;">${r.volHhp}</td>
                    <td style="padding: 8px 10px; text-align: center; color: #d97706; font-weight: 600;">${r.volCe}</td>
                    <td style="padding: 8px 10px; text-align: center; color: #dc2626; font-weight: 700;" title="Cancel HHP: ${r.cancelHhp || 0}, Cancel CE: ${r.cancelCe || 0} (Bobot 0.5x: ${(((r.totalCancel || 0) * 0.5)).toFixed(1)} Poin)">${r.totalCancel || ((r.cancelHhp || 0) + (r.cancelCe || 0))}</td>
                    <td style="padding: 8px 10px; text-align: center; color: #7c3aed; font-weight: 800;">${r.totalAdjust}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #b45309; background: #fffbeb;">${r.leaderCount || 0}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 800; color: #1d4ed8; background: #eff6ff;" title="Teknisi: ${r.techCount != null ? r.techCount : r.realTech} Orang (Teknisi Riil Lapangan: ${r.realTech})">${r.techCount != null ? r.techCount : r.realTech}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #0284c7; background: #f0f9ff;">${r.adminCount || 0}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 600; color: #64748b; background: #f8fafc;" title="Helper (Driver/OB/Security) - Tidak masuk hitungan Min Staff">${r.helperCount || 0}</td>
                    <td style="padding: 8px 10px; text-align: center; background: #eff6ff;" title="Total Staf Efektif = Leader (${r.leaderCount || 0}) + Teknisi (${r.techCount != null ? r.techCount : r.realTech}) + Admin (${r.adminCount || 0})">
                        <span style="font-weight: 800; font-size: 0.88rem; color: #1e40af; background: #dbeafe; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 6px; display: inline-block;">
                            ${r.effectiveStaff != null ? r.effectiveStaff : ((r.leaderCount || 0) + (r.techCount != null ? r.techCount : r.realTech) + (r.adminCount || 0))}
                        </span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; background: #f0f9ff;" title="Kebutuhan Minimum Staff (Total Poin: ${r.totalAdjust})">
                        <span style="font-weight: 800; font-size: 0.88rem; color: #0369a1; background: #e0f2fe; border: 1px solid #bae6fd; padding: 2px 8px; border-radius: 6px; display: inline-block;">
                            ${r.finalMinStaff}
                        </span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center;">
                        <span style="font-weight: 800; color: ${ratioColor}; font-size: 0.9rem;">${r.ratioWoAdmin}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #64748b; font-weight: 600;">
                        ${r.ratioWithAdmin > 0 ? r.ratioWithAdmin : '-'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center;" title="Status Gap = Total Staff (${r.effectiveStaff != null ? r.effectiveStaff : ((r.leaderCount || 0) + (r.techCount != null ? r.techCount : r.realTech) + (r.adminCount || 0))}) - Min Staff (${r.finalMinStaff})">${statusBadge}</td>
                    <td style="padding: 8px 10px; text-align: center;">
                        <button class="mpm-btn-edit-type" data-branch="${r.branch}" style="background: #ffffff; border: 1px solid #cbd5e1; color: #1e293b; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" title="Edit Tipe Layanan Cabang ${r.branch}" onmouseover="this.style.background='#eff6ff'; this.style.borderColor='#93c5fd';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1';">
                            <i class="fa-solid fa-pen-to-square" style="color: #2563eb;"></i> Edit
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach click handlers to row buttons
        tbody.querySelectorAll('.mpm-btn-edit-type').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const branch = btn.dataset.branch;
                openBranchTypeModal(branch);
            });
        });
    }

    // =========================================================================
    // MODAL REVISI TIPE LAYANAN CABANG (BOS REVISION MODAL)
    // =========================================================================
    function openBranchTypeModal(branchName) {
        ensureMpmModals();
        const branchData = capacityData.find(c => c.branch === branchName);
        if (!branchData) return;

        const ovr = branchOverrides[branchName];
        const currentType = (ovr && ovr.productType) ? ovr.productType : branchData.productType;

        const backdrop = document.getElementById('mpm-type-modal-backdrop');
        const box = document.getElementById('mpm-type-modal-box');
        if (!backdrop || !box) return;

        box.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;">
                <div>
                    <h3 style="margin: 0; color: #0f172a; font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-sliders" style="color: var(--accent-blue, #2563eb);"></i>
                        Revisi Tipe Layanan Operasional
                    </h3>
                    <div style="font-size: 0.85rem; color: #64748b; margin-top: 2px;">
                        Cabang: <strong style="color: #1d4ed8; font-size: 0.95rem;">${branchName}</strong>
                    </div>
                </div>
                <button id="mpm-type-modal-close-x" style="background: transparent; border: none; color: #64748b; font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
            </div>

            <!-- Current Summary Stats -->
            <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center;">
                <div>
                    <div style="font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Avg 3M GD</div>
                    <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">${branchData.avg3MonthGd}</div>
                    <div style="font-size: 0.7rem; color: #64748b;">HHP: ${branchData.volHhp} | CE: ${branchData.volCe}</div>
                </div>
                <div>
                    <div style="font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Teknisi Riil</div>
                    <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">${branchData.realTech} Org</div>
                    <div style="font-size: 0.7rem; color: #64748b;">Total Staf: ${branchData.allStaff}</div>
                </div>
                <div>
                    <div style="font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Status Gap</div>
                    <div style="font-size: 1.05rem; font-weight: 800; color: ${branchData.status === 'KURANG' ? '#dc2626' : (branchData.status === 'LEBIH' ? '#0284c7' : '#16a34a')};">
                        ${branchData.status} (${branchData.diff > 0 ? '+' + branchData.diff : branchData.diff})
                    </div>
                    <div style="font-size: 0.7rem; color: #64748b;">Kebutuhan: ${branchData.finalMinStaff} Org</div>
                </div>
            </div>

            <form id="mpm-type-form" style="display: flex; flex-direction: column; gap: 12px;">
                <label style="font-size: 0.85rem; font-weight: 700; color: #0f172a;">Pilih Tipe Layanan Operasional:</label>

                <!-- Option 1: HYBRID MX+CE -->
                <label class="type-option-card" style="border: 2px solid ${currentType === 'HYBRID (MX+CE)' ? '#7c3aed' : '#e2e8f0'}; background: ${currentType === 'HYBRID (MX+CE)' ? '#faf5ff' : '#ffffff'}; padding: 12px 14px; border-radius: 8px; cursor: pointer; display: flex; gap: 12px; align-items: flex-start; transition: all 0.2s;">
                    <input type="radio" name="branch-type" value="HYBRID (MX+CE)" ${currentType === 'HYBRID (MX+CE)' ? 'checked' : ''} style="margin-top: 3px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                            <span style="font-weight: 800; color: #6d28d9; font-size: 0.95rem;">🟣 HYBRID (MX + CE)</span>
                            <span style="background: #ede9fe; color: #6d28d9; font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid #ddd6fe;">Aturan Emas BOS</span>
                        </div>
                        <div style="font-size: 0.8rem; color: #475569; margin-top: 3px;">
                            Melayani Counter Handphone (MX) dan In-Home Service Elektronik (CE/VD/DA).
                        </div>
                        <div style="font-size: 0.75rem; color: #7c3aed; font-weight: 700; margin-top: 4px;">
                            <i class="fa-solid fa-shield-halved"></i> Wajib minimal 2 teknisi (1 counter MX + 1 teknisi mobile CE keluar kantor).
                        </div>
                    </div>
                </label>

                <!-- Option 2: MX ONLY -->
                <label class="type-option-card" style="border: 2px solid ${currentType === 'MX ONLY' ? '#2563eb' : '#e2e8f0'}; background: ${currentType === 'MX ONLY' ? '#eff6ff' : '#ffffff'}; padding: 12px 14px; border-radius: 8px; cursor: pointer; display: flex; gap: 12px; align-items: flex-start; transition: all 0.2s;">
                    <input type="radio" name="branch-type" value="MX ONLY" ${currentType === 'MX ONLY' ? 'checked' : ''} style="margin-top: 3px;">
                    <div style="flex: 1;">
                        <span style="font-weight: 800; color: #1d4ed8; font-size: 0.95rem;">🔵 MX ONLY (Khusus Counter HP)</span>
                        <div style="font-size: 0.8rem; color: #475569; margin-top: 3px;">
                            Hanya perbaikan Smartphone/Tablet counter. Tidak ada perbaikan unit CE keluar kantor.
                        </div>
                        <div style="font-size: 0.75rem; color: #2563eb; font-weight: 700; margin-top: 4px;">
                            <i class="fa-solid fa-calculator"></i> Kebutuhan teknisi mengikuti rasio murni volume (1 teknisi per ~100 unit/bln).
                        </div>
                    </div>
                </label>

                <!-- Option 3: CE ONLY -->
                <label class="type-option-card" style="border: 2px solid ${currentType === 'CE ONLY' ? '#d97706' : '#e2e8f0'}; background: ${currentType === 'CE ONLY' ? '#fffbeb' : '#ffffff'}; padding: 12px 14px; border-radius: 8px; cursor: pointer; display: flex; gap: 12px; align-items: flex-start; transition: all 0.2s;">
                    <input type="radio" name="branch-type" value="CE ONLY" ${currentType === 'CE ONLY' ? 'checked' : ''} style="margin-top: 3px;">
                    <div style="flex: 1;">
                        <span style="font-weight: 800; color: #b45309; font-size: 0.95rem;">🟡 CE ONLY (Khusus In-Home Elektronik)</span>
                        <div style="font-size: 0.8rem; color: #475569; margin-top: 3px;">
                            Khusus perbaikan TV, Kulkas, AC, Mesin Cuci panggilan rumah konsumen.
                        </div>
                        <div style="font-size: 0.75rem; color: #b45309; font-weight: 700; margin-top: 4px;">
                            <i class="fa-solid fa-weight-hanging"></i> Bobot beban kerja dikalikan 2.5x per unit servis.
                        </div>
                    </div>
                </label>

                <!-- Note / Reason -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #334155; font-weight: 600; margin-bottom: 4px;">Alasan / Catatan Revisi (Opsional)</label>
                    <input type="text" id="type-override-note" value="${ovr ? (ovr.note || '') : ''}" placeholder="Contoh: Mulai melayani In-Home CE, penugasan teknisi baru..." style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; outline: none;">
                </div>

                <!-- Footer Buttons -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                    <div>
                        ${ovr ? `
                            <button type="button" id="btn-reset-type-override" style="background: transparent; color: #dc2626; border: 1px solid #fca5a5; padding: 7px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer;">
                                <i class="fa-solid fa-rotate-left"></i> Reset ke Otomatis
                            </button>
                        ` : ''}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button type="button" id="mpm-type-modal-cancel" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">
                            Batal
                        </button>
                        <button type="submit" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                            <i class="fa-solid fa-floppy-disk"></i> Simpan Revisi
                        </button>
                    </div>
                </div>
            </form>
        `;

        backdrop.style.display = 'flex';

        // Close handlers
        const closeModal = () => { backdrop.style.display = 'none'; };
        document.getElementById('mpm-type-modal-close-x').onclick = closeModal;
        document.getElementById('mpm-type-modal-cancel').onclick = closeModal;
        backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };

        // Card click triggers radio check and highlights
        box.querySelectorAll('.type-option-card').forEach(card => {
            card.onclick = (e) => {
                const radio = card.querySelector('input[type="radio"]');
                if (radio && e.target !== radio) {
                    radio.checked = true;
                }
            };
        });

        // Reset button handler
        const resetBtn = document.getElementById('btn-reset-type-override');
        if (resetBtn) {
            resetBtn.onclick = async () => {
                delete branchOverrides[branchName];
                localStorage.setItem('bujm_mpm_branch_overrides', JSON.stringify(branchOverrides));

                if (window.db) {
                    window.db.collection('dashboard_data').doc('mpm_branch_overrides').set({
                        updatedAt: new Date().toISOString(),
                        overrides: branchOverrides
                    }, { merge: true }).catch(err => console.warn('Firestore reset override warning:', err));
                }

                closeModal();
                showToast(`Tipe layanan ${branchName} dikembalikan ke deteksi otomatis.`);
                applyOverridesToCapacityData();
                await calculateMpmCapacityData();
                renderActiveSubTab();
            };
        }

        // Submit handler
        document.getElementById('mpm-type-form').onsubmit = async (e) => {
            e.preventDefault();
            const selectedType = document.querySelector('input[name="branch-type"]:checked').value;
            const note = document.getElementById('type-override-note').value.trim();

            branchOverrides[branchName] = {
                productType: selectedType,
                note,
                updatedAt: new Date().toISOString(),
                updatedBy: 'BOS'
            };

            // Save to localStorage
            localStorage.setItem('bujm_mpm_branch_overrides', JSON.stringify(branchOverrides));

            // Sync to Firestore
            if (window.db) {
                window.db.collection('dashboard_data').doc('mpm_branch_overrides').set({
                    updatedAt: new Date().toISOString(),
                    overrides: branchOverrides
                }, { merge: true }).catch(err => console.warn('Firestore sync override warning:', err));
            }

            closeModal();
            showToast(`Tipe layanan ${branchName} berhasil diubah ke ${selectedType}!`);

            // Recalculate capacity to immediately reflect new guardrails & staff requirements!
            applyOverridesToCapacityData();
            await calculateMpmCapacityData();
            renderActiveSubTab();
        };
    }

    // =========================================================================
    // SUB-TAB 2: MASTER ROSTER KARYAWAN (SHEET DATA STAF CABANG + EDIT MODAL)
    // =========================================================================
    function renderRosterSubTab(container) {
        // Filter out employees at "HO" as instructed by BOS (no correlation with branch capacity plan)
        // AND exclude RESIGN employees (BOS instruction: jika dinyatakan resign, dianggap hilang datanya)
        const branchEmployees = mpmEmployees.filter(e => {
            const b = normalizeBranchName(e.branch);
            return b !== 'HO' && e.status !== 'RESIGN';
        });

        // Update tab header badge count dynamically
        const rosterBtn = document.getElementById('mpm-tab-roster');
        if (rosterBtn) {
            rosterBtn.innerHTML = `<i class="fa-solid fa-id-card-clip"></i> Data Manpower (${branchEmployees.length})`;
        }

        // Collect list of unique branches for filter dropdown (strictly operational branches, no HO)
        const branchList = Array.from(new Set(branchEmployees.map(e => normalizeBranchName(e.branch)).filter(b => b && b !== 'UNKNOWN' && b !== 'BELUM DITENTUKAN'))).sort();

        // Unknown count (karyawan yang tidak masuk di cabang manapun)
        const unknownCount = branchEmployees.filter(e => {
            const b = normalizeBranchName(e.branch);
            return !b || b === 'UNKNOWN' || b === 'BELUM DITENTUKAN';
        }).length;

        container.innerHTML = `
            <!-- Controls Bar (Executive Light Theme) -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin: 15px 0 20px 0; background: #f8fafc; padding: 12px 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <!-- Branch Filter (Termasuk pilihan Unknown sesuai instruksi BOS) -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: #64748b; font-weight: 700;">Cabang:</span>
                        <select id="roster-branch-select" style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; outline: none;">
                            <option value="ALL">Semua Cabang (${branchList.length})</option>
                            <option value="Unknown" ${currentRosterBranch === 'Unknown' ? 'selected' : ''}>❓ Unknown (${unknownCount})</option>
                            ${branchList.map(b => `<option value="${b}" ${currentRosterBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Search Input -->
                    <div style="position: relative;">
                        <input type="text" id="roster-search-input" value="${currentRosterSearch}" placeholder="Cari Nama, NIK, Posisi..." style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 6px 12px 6px 30px; border-radius: 6px; font-size: 0.85rem; width: 220px; outline: none;">
                        <i class="fa-solid fa-search" style="position: absolute; left: 10px; top: 9px; color: #94a3b8; font-size: 0.8rem;"></i>
                    </div>
                </div>

                <!-- Action Button: Add New Employee -->
                <div style="display: flex; gap: 10px;">
                    <button id="btn-add-employee" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);">
                        <i class="fa-solid fa-user-plus"></i> Tambah Manpower Baru
                    </button>
                    <button id="btn-reset-roster" style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; padding: 7px 12px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;" title="Muat Ulang & Sinkronkan Data dari Cloud Firestore">
                        <i class="fa-solid fa-arrow-rotate-right"></i>
                    </button>
                </div>
            </div>

            <!-- Employee Cards / Table View -->
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                    <thead>
                        <tr style="background: var(--accent-blue, #2563eb); color: #ffffff; border-bottom: 2px solid #1d4ed8;">
                            <th style="padding: 10px 8px; text-align: center; width: 60px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Foto</th>
                            <th style="padding: 10px 10px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">NIK & Nama Karyawan</th>
                            <th style="padding: 10px 10px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Lokasi / Cabang</th>
                            <th style="padding: 10px 10px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Posisi Jabatan</th>
                            <th style="padding: 10px 10px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Kategori Peran</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Tgl Masuk</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Masa Kerja</th>
                            <th style="padding: 10px 10px; text-align: center; width: 90px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="roster-table-body">
                    </tbody>
                </table>
            </div>
        `;

        // Event listeners
        const branchSelect = document.getElementById('roster-branch-select');
        if (branchSelect) {
            branchSelect.addEventListener('change', (e) => {
                currentRosterBranch = e.target.value;
                updateRosterTableRows();
            });
        }

        const searchInput = document.getElementById('roster-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentRosterSearch = e.target.value;
                updateRosterTableRows();
            });
        }

        const resetBtn = document.getElementById('btn-reset-roster');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                const icon = resetBtn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-arrow-rotate-right fa-spin';
                resetBtn.disabled = true;

                currentRosterBranch = 'ALL';
                currentRosterSearch = '';
                const bSel = document.getElementById('roster-branch-select');
                if (bSel) bSel.value = 'ALL';
                const sInp = document.getElementById('roster-search-input');
                if (sInp) sInp.value = '';

                // Force re-fetch from Firestore
                const db = await waitForDb(3000);
                if (db) {
                    try {
                        const snap = await db.collection('dashboard_data').doc('mpm_employees').get();
                        if (snap.exists && snap.data().employees) {
                            mpmEmployees = snap.data().employees;
                            mpmEmployees.forEach(normalizeEmployeeFields);
                            try { localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees)); } catch (_) {}
                            console.log(`[MPM] Force refreshed ${mpmEmployees.length} employees from Firestore.`);
                            showToast(`Berhasil menyinkronkan ${mpmEmployees.length} data manpower dari Cloud Firestore!`);
                        }
                    } catch (e) {
                        console.warn('[MPM] Force refresh error:', e);
                    }
                }

                await calculateMpmCapacityData();
                updateRosterTableRows();

                // Update badge
                const branchEmployees = mpmEmployees.filter(e => normalizeBranchName(e.branch) !== 'HO' && e.status !== 'RESIGN');
                const rosterBtn = document.getElementById('mpm-tab-roster');
                if (rosterBtn) {
                    rosterBtn.innerHTML = `<i class="fa-solid fa-id-card-clip"></i> Data Manpower (${branchEmployees.length})`;
                }

                if (icon) icon.className = 'fa-solid fa-arrow-rotate-right';
                resetBtn.disabled = false;
            });
        }

        const addBtn = document.getElementById('btn-add-employee');
        if (addBtn) {
            addBtn.addEventListener('click', () => openEmployeeEditModal(null));
        }

        // Render table rows
        updateRosterTableRows();
    }

    // Update only Manpower table rows to prevent input destruction & pointer/focus loss
    function updateRosterTableRows() {
        const tbody = document.getElementById('roster-table-body');
        if (!tbody) return;

        const branchEmployees = mpmEmployees.filter(e => {
            const b = normalizeBranchName(e.branch);
            return b !== 'HO' && e.status !== 'RESIGN';
        });

        let filtered = branchEmployees.filter(e => {
            const b = normalizeBranchName(e.branch);
            const isUnknown = !b || b === 'UNKNOWN' || b === 'BELUM DITENTUKAN';

            let matchBranch = true;
            if (currentRosterBranch === 'Unknown') {
                matchBranch = isUnknown;
            } else if (currentRosterBranch !== 'ALL') {
                matchBranch = b === currentRosterBranch;
            }

            const searchLower = currentRosterSearch.toLowerCase();
            const matchSearch = !currentRosterSearch || 
                (e.name && e.name.toLowerCase().includes(searchLower)) ||
                (e.nik && e.nik.toLowerCase().includes(searchLower)) ||
                (e.position && e.position.toLowerCase().includes(searchLower)) ||
                (e.roleStatus && e.roleStatus.toLowerCase().includes(searchLower)) ||
                (Array.isArray(e.roles) && e.roles.some(r => r.toLowerCase().includes(searchLower))) ||
                (isUnknown && 'unknown'.includes(searchLower));

            return matchBranch && matchSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8; font-weight: 500;">Tidak ada data manpower yang cocok dengan filter.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(emp => {
            const photoSrc = getEmployeePhotoSrc(emp);
            const empBranch = normalizeBranchName(emp.branch);
            const branchBadge = empBranch
                ? `<span style="font-weight: 600; color: #1d4ed8; background: #eff6ff; padding: 3px 8px; border-radius: 4px; border: 1px solid #bfdbfe;">${empBranch}</span>`
                : `<span style="font-weight: 700; color: #dc2626; background: #fee2e2; padding: 3px 8px; border-radius: 4px; border: 1px solid #fca5a5;"><i class="fa-solid fa-triangle-exclamation" style="margin-right: 4px;"></i>Unknown</span>`;

            return `
                <tr style="border-bottom: 1px solid #f1f5f9; background: #ffffff; color: #0f172a; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                    <!-- Photo Avatar -->
                    <td style="padding: 8px 10px; text-align: center;">
                        <div style="width: 44px; height: 44px; border-radius: 50%; overflow: hidden; border: 2px solid #e2e8f0; display: inline-flex; align-items: center; justify-content: center; background: #f8fafc; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                            ${photoSrc ? `<img src="${photoSrc}" alt="${emp.name}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'font-weight:700; color:#2563eb; font-size:0.8rem;\\'>${getInitials(emp.name)}</span>';" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="font-weight:700; color:#2563eb; font-size:0.8rem;">${getInitials(emp.name)}</span>`}
                        </div>
                    </td>

                    <!-- NIK & Name -->
                    <td style="padding: 8px 10px;">
                        <div style="font-weight: 700; color: #0f172a; font-size: 0.9rem;">${emp.name}</div>
                        <div style="font-family: monospace; color: #64748b; font-size: 0.75rem;">NIK: ${emp.nik}</div>
                    </td>

                    <!-- Branch -->
                    <td style="padding: 8px 10px;">
                        ${branchBadge}
                    </td>

                    <!-- Position -->
                    <td style="padding: 8px 10px;">
                        <span style="font-weight: 700; font-size: 0.78rem; padding: 3px 8px; border-radius: 4px; display: inline-block; background: ${emp.position === 'TEKNISI' ? '#eff6ff' : (emp.position === 'LEADER/PIC' ? '#fef3c7' : (emp.position === 'ADMIN' ? '#e0f2fe' : '#f1f5f9'))}; color: ${emp.position === 'TEKNISI' ? '#1d4ed8' : (emp.position === 'LEADER/PIC' ? '#b45309' : (emp.position === 'ADMIN' ? '#0284c7' : '#475569'))}; border: 1px solid ${emp.position === 'TEKNISI' ? '#bfdbfe' : (emp.position === 'LEADER/PIC' ? '#fde68a' : (emp.position === 'ADMIN' ? '#bae6fd' : '#cbd5e1'))};">
                            ${emp.position || '-'}
                        </span>
                    </td>

                    <!-- Role Category (Multi-Role Badges) -->
                    <td style="padding: 8px 10px;">
                        ${renderRoleBadge(emp.roles || emp.roleStatus || emp.position)}
                    </td>

                    <!-- Join Date -->
                    <td style="padding: 8px 10px; text-align: center; color: #64748b; font-size: 0.8rem;">
                        ${emp.joinDate || '-'}
                    </td>

                    <!-- Tenure -->
                    <td style="padding: 8px 10px; text-align: center; color: #334155; font-size: 0.8rem;">
                        ${emp.tenureText || (emp.tenureYears ? emp.tenureYears + ' Thn' : '-')}
                    </td>

                    <!-- Action Button: Edit -->
                    <td style="padding: 8px 10px; text-align: center;">
                        <button class="mpm-btn-edit-emp" data-nik="${emp.nik}" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Edit Data Karyawan">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach click handlers to Edit buttons
        tbody.querySelectorAll('.mpm-btn-edit-emp').forEach(btn => {
            btn.addEventListener('click', () => {
                const nik = btn.dataset.nik;
                const emp = mpmEmployees.find(e => String(e.nik) === String(nik));
                if (emp) openEmployeeEditModal(emp);
            });
        });
    }

    // Helper: Role badge styling (Light Theme - Multi-Role Support)
    function renderRoleBadge(roleInput) {
        if (!roleInput) return '-';
        let list = [];
        if (Array.isArray(roleInput)) {
            list = roleInput;
        } else {
            list = String(roleInput).split(/[,;+/|]\s*/).filter(Boolean);
        }
        if (!list.length) return '-';

        return `<div style="display: flex; flex-wrap: wrap; gap: 4px;">` + list.map(r => {
            const role = String(r).trim().toUpperCase();
            if (role === 'PIC' || role.includes('LEADER') || role.includes('HEAD') || role.includes('MANAGER')) {
                return `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${r}</span>`;
            }
            if (role.includes('CE') || role.includes('HOME') || role.includes('WELDER') || role.includes('CARRY IN') || role.includes('B2B')) {
                return `<span style="background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${r}</span>`;
            }
            if (role.includes('HHP') || role.includes('UB') || role.includes('TECH') || role.includes('TEKNISI')) {
                return `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${r}</span>`;
            }
            if (role.includes('CS') || role.includes('CUSTOMER')) {
                return `<span style="background: #fdf2f8; color: #be185d; border: 1px solid #fbcfe8; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${r}</span>`;
            }
            if (role.includes('KEUANGAN') || role.includes('FINANCE') || role.includes('ACCT')) {
                return `<span style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${r}</span>`;
            }
            if (role.includes('TRACKING') || role.includes('PART') || role.includes('ADMIN')) {
                return `<span style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${r}</span>`;
            }
            return `<span style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">${r}</span>`;
        }).join('') + `</div>`;
    }

    function getInitials(name) {
        if (!name) return 'EMP';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    // Helper to get employee photo URL (Firestore base64, LocalStorage cache, or static fallback)
    function getEmployeePhotoSrc(emp) {
        if (!emp) return '';
        if (emp.photo === '' || emp.photo === null) return '';
        if (emp.photo && (emp.photo.startsWith('data:') || emp.photo.startsWith('http'))) {
            return emp.photo;
        }
        try {
            const cached = localStorage.getItem('bujm_photo_' + emp.nik);
            if (cached) return cached;
        } catch (_) {}
        if (emp.photo) return emp.photo;
        return `photos/emp_${emp.nik}.jpg`;
    }

    // =========================================================================
    // MODAL EDIT / UPDATE KARYAWAN (BOS BISA EDIT LANGSUNG - LIGHT THEME)
    // =========================================================================
    function openEmployeeEditModal(emp) {
        ensureMpmModals();
        const isNew = !emp;
        const targetEmp = emp || {
            nik: '',
            name: '',
            branch: capacityData[0] ? capacityData[0].branch : 'PONTIANAK',
            position: 'TEKNISI HHP',
            roleStatus: 'Tech HHP',
            joinDate: new Date().toLocaleDateString('id-ID'),
            status: 'AKTIF',
            photo: null
        };

        let pendingPhotoData = null;
        let isPhotoRemoved = false;

        const backdrop = document.getElementById('mpm-edit-modal-backdrop');
        const box = document.getElementById('mpm-edit-modal-box');
        if (!backdrop || !box) return;

        // Distinct branches list for dropdown (strictly operational branches, no HO)
        const distinctBranches = Array.from(new Set(capacityData.map(c => c.branch))).sort();

        const currentPosCategory = ['LEADER/PIC', 'ADMIN', 'TEKNISI', 'HELPER'].includes(targetEmp.position)
            ? targetEmp.position 
            : inferPositionCategory(targetEmp.position, targetEmp.roles || inferEmployeeRoles(targetEmp));
        const currentRoles = (Array.isArray(targetEmp.roles) && targetEmp.roles.length > 0)
            ? targetEmp.roles 
            : inferEmployeeRoles(targetEmp);

        const initialTenure = calculateTenure(targetEmp.joinDate);
        const initialTenureText = targetEmp.tenureText || initialTenure.tenureText;

        const photoSrc = getEmployeePhotoSrc(targetEmp);

        box.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #0f172a; font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-user-pen" style="color: var(--accent-blue, #2563eb);"></i>
                    ${isNew ? 'Tambah Manpower Baru' : 'Edit Data Manpower Karyawan'}
                </h3>
                <button id="mpm-modal-close-x" style="background: transparent; border: none; color: #64748b; font-size: 1.4rem; cursor: pointer; line-height: 1;">&times;</button>
            </div>

            <!-- Profile Summary & Interactive Photo Edit (BOS Request) -->
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div id="mpm-avatar-container" style="position: relative; width: 68px; height: 68px; border-radius: 50%; overflow: hidden; border: 2px solid var(--accent-blue, #2563eb); flex-shrink: 0; background: #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.1); cursor: pointer;" title="Klik untuk ubah foto">
                    ${photoSrc ? `<img id="mpm-edit-preview-photo" src="${photoSrc}" alt="${targetEmp.name}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'font-weight:700; color:#2563eb; font-size:1.2rem;\\'>${getInitials(targetEmp.name)}</span>';" style="width: 100%; height: 100%; object-fit: cover;">` : `<span id="mpm-avatar-initials" style="font-weight:700; color:#2563eb; font-size:1.2rem;">${getInitials(targetEmp.name)}</span>`}
                    <div id="mpm-avatar-hover-overlay" style="position: absolute; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ffffff; font-size: 0.65rem; font-weight: 600; opacity: 0; transition: opacity 0.2s;">
                        <i class="fa-solid fa-camera" style="font-size: 1rem; margin-bottom: 2px;"></i>
                        <span>Ubah</span>
                    </div>
                </div>

                <input type="file" id="mpm-file-photo-input" accept="image/jpeg,image/png,image/webp" style="display: none;">

                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="font-weight: 700; color: #0f172a; font-size: 1rem;">${targetEmp.name || 'Nama Karyawan'}</div>
                        <span id="photo-status-badge" style="display: none; font-size: 0.7rem; padding: 2px 7px; border-radius: 4px; font-weight: 700;"></span>
                    </div>
                    <div style="font-family: monospace; color: #64748b; font-size: 0.8rem; margin-top: 2px;">NIK: ${targetEmp.nik || 'Belum ada NIK'}</div>
                    <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                        <button type="button" id="btn-change-photo" style="background: #ffffff; border: 1px solid #cbd5e1; color: #1e293b; font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.15s;">
                            <i class="fa-solid fa-camera" style="color: #2563eb;"></i> Unggah / Ganti Foto
                        </button>
                        <button type="button" id="btn-remove-photo" style="background: #fff1f2; border: 1px solid #fecdd3; color: #e11d48; font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.15s;">
                            <i class="fa-solid fa-trash-can"></i> Hapus Foto
                        </button>
                    </div>
                    <span style="font-size: 0.72rem; color: #64748b; margin-top: 4px; display: block;">Foto otomatis tersimpan di cloud Firestore & tersinkron di semua perangkat.</span>
                </div>
            </div>

            <!-- Form Fields -->
            <form id="mpm-edit-form" style="display: flex; flex-direction: column; gap: 15px;">
                <!-- NIK -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #334155; font-weight: 600; margin-bottom: 5px;">Nomor Induk Karyawan (NIK)</label>
                    <input type="text" id="edit-nik" value="${targetEmp.nik}" ${!isNew ? 'readonly' : ''} required style="width: 100%; background: ${!isNew ? '#f1f5f9' : '#ffffff'}; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 0.9rem; outline: none;">
                </div>

                <!-- Nama Lengkap -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #334155; font-weight: 600; margin-bottom: 5px;">Nama Lengkap Karyawan</label>
                    <input type="text" id="edit-name" value="${targetEmp.name}" required style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                </div>

                <!-- Cabang / Lokasi Penempatan (Dropdown) -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #334155; font-weight: 600; margin-bottom: 5px;">Lokasi Cabang / Penempatan</label>
                    <select id="edit-branch" style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                        <option value="" ${!targetEmp.branch ? 'selected' : ''}>-- Belum Ditentukan (Unknown) --</option>
                        ${distinctBranches.map(b => `<option value="${b}" ${normalizeBranchName(targetEmp.branch) === b ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                    <span style="font-size: 0.75rem; color: #64748b; margin-top: 3px; display: block;">Perubahan cabang otomatis memperbarui headcount & rasio di Capacity Plan.</span>
                </div>

                <!-- Posisi Jabatan (Deskriptif) Mandat BOS: LEADER/PIC, ADMIN, TEKNISI, HELPER -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #0f172a; font-weight: 700; margin-bottom: 6px;">
                        Posisi Jabatan (Deskriptif)
                    </label>
                    <select id="edit-position" required style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; font-weight: 600; outline: none;">
                        <option value="LEADER/PIC" ${currentPosCategory === 'LEADER/PIC' ? 'selected' : ''}>LEADER/PIC</option>
                        <option value="ADMIN" ${currentPosCategory === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
                        <option value="TEKNISI" ${currentPosCategory === 'TEKNISI' ? 'selected' : ''}>TEKNISI</option>
                        <option value="HELPER" ${currentPosCategory === 'HELPER' ? 'selected' : ''}>HELPER</option>
                    </select>
                </div>

                <!-- Kategori Peran (Standar Samsung - Ceklist Mandat BOS Multi-Role) -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                        <label style="font-size: 0.8rem; color: #0f172a; font-weight: 700;">
                            Kategori Peran (Standar Samsung - Ceklist Double Job)
                        </label>
                        <span style="font-size: 0.72rem; color: #2563eb; font-weight: 600; background: #eff6ff; padding: 2px 6px; border-radius: 4px; border: 1px solid #bfdbfe;">
                            <i class="fa-solid fa-calculator"></i> Ceklist Teknisi = Masuk Teknisi Riil (Ratio w/o Admin)
                        </span>
                    </div>

                    <div id="edit-roles-container" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; max-height: 220px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px;">
                        ${SAMSUNG_ROLES_LIST.map(role => {
                            const isChecked = currentRoles.includes(role);
                            const isTech = role.startsWith('TEKNISI');
                            return `
                                <label class="role-checkbox-item" style="display: flex; align-items: center; gap: 8px; background: ${isChecked ? (isTech ? '#eff6ff' : '#f1f5f9') : '#ffffff'}; border: 1px solid ${isChecked ? (isTech ? '#3b82f6' : '#94a3b8') : '#e2e8f0'}; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: all 0.15s; font-size: 0.8rem;">
                                    <input type="checkbox" name="edit-role-checkbox" value="${role}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: #2563eb;">
                                    <span style="font-weight: ${isChecked ? '700' : '500'}; color: ${isChecked ? (isTech ? '#1d4ed8' : '#0f172a') : '#475569'};">${role}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                    <span style="font-size: 0.73rem; color: #64748b; margin-top: 4px; display: block;">
                        Centang satu atau lebih peran sesuai penugasan riil karyawan.
                    </span>
                </div>

                <!-- Tanggal Masuk & Kalkulasi Masa Kerja (Mandat BOS) -->
                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                        <label style="font-size: 0.8rem; color: #0f172a; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-calendar-day" style="color: #2563eb;"></i> Tanggal Masuk Karyawan
                        </label>
                        <span id="edit-tenure-badge" style="font-size: 0.75rem; color: #1e40af; background: #eff6ff; font-weight: 700; padding: 2px 8px; border-radius: 4px; border: 1px solid #bfdbfe;">
                            Masa Kerja: ${initialTenureText}
                        </span>
                    </div>
                    <input type="date" id="edit-join-date" value="${toInputDateFormat(targetEmp.joinDate)}" required style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                    <span style="font-size: 0.72rem; color: #64748b; margin-top: 4px; display: block;">
                        Masa kerja terkalkulasi secara otomatis (tahun, bulan, hari) dan tersimpan ke data karyawan.
                    </span>
                </div>

                <!-- Status Kerja (Aktif vs Resign) -->
                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <label style="display: block; font-size: 0.8rem; color: #334155; font-weight: 600; margin-bottom: 8px;">Status Hubungan Kerja</label>
                    <div style="display: flex; gap: 20px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #16a34a; font-weight: 700; font-size: 0.85rem;">
                            <input type="radio" name="edit-status" value="AKTIF" ${targetEmp.status !== 'RESIGN' ? 'checked' : ''}>
                            <i class="fa-solid fa-circle-check"></i> Masih Bekerja (Aktif)
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #dc2626; font-weight: 700; font-size: 0.85rem;">
                            <input type="radio" name="edit-status" value="RESIGN" ${targetEmp.status === 'RESIGN' ? 'checked' : ''}>
                            <i class="fa-solid fa-arrow-right-from-bracket"></i> Sudah Resign / Keluar
                        </label>
                    </div>
                    <span style="font-size: 0.75rem; color: #64748b; margin-top: 4px; display: block;">Jika diubah ke Resign, karyawan tidak lagi dihitung sebagai beban aktif di cabang.</span>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                    <button type="button" id="mpm-modal-cancel" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">
                        Batal
                    </button>
                    <button type="submit" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                        <i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan
                    </button>
                </div>
            </form>
        `;

        backdrop.style.display = 'flex';

        // Close handlers
        const closeModal = () => { backdrop.style.display = 'none'; };
        document.getElementById('mpm-modal-close-x').onclick = closeModal;
        document.getElementById('mpm-modal-cancel').onclick = closeModal;
        backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };

        // Photo upload / change / remove event handlers (Mandat BOS)
        const fileInput = document.getElementById('mpm-file-photo-input');
        const changePhotoBtn = document.getElementById('btn-change-photo');
        const removePhotoBtn = document.getElementById('btn-remove-photo');
        const avatarContainer = document.getElementById('mpm-avatar-container');
        const photoBadge = document.getElementById('photo-status-badge');

        const attachAvatarHover = () => {
            const overlay = document.getElementById('mpm-avatar-hover-overlay');
            if (avatarContainer && overlay) {
                avatarContainer.onmouseenter = () => { overlay.style.opacity = '1'; };
                avatarContainer.onmouseleave = () => { overlay.style.opacity = '0'; };
            }
        };
        attachAvatarHover();

        if (avatarContainer) {
            avatarContainer.addEventListener('click', () => { if (fileInput) fileInput.click(); });
        }
        if (changePhotoBtn) {
            changePhotoBtn.addEventListener('click', () => { if (fileInput) fileInput.click(); });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    alert('Format file tidak didukung! Harap pilih gambar JPG, PNG, atau WebP.');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (re) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        const maxDim = 350;

                        if (width > height) {
                            if (width > maxDim) {
                                height = Math.round((height * maxDim) / width);
                                width = maxDim;
                            }
                        } else {
                            if (height > maxDim) {
                                width = Math.round((width * maxDim) / height);
                                height = maxDim;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        pendingPhotoData = compressedDataUrl;
                        isPhotoRemoved = false;

                        avatarContainer.innerHTML = `
                            <img id="mpm-edit-preview-photo" src="${compressedDataUrl}" alt="${targetEmp.name}" style="width: 100%; height: 100%; object-fit: cover;">
                            <div id="mpm-avatar-hover-overlay" style="position: absolute; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ffffff; font-size: 0.65rem; font-weight: 600; opacity: 0; transition: opacity 0.2s;">
                                <i class="fa-solid fa-camera" style="font-size: 1rem; margin-bottom: 2px;"></i>
                                <span>Ubah</span>
                            </div>
                        `;
                        attachAvatarHover();

                        if (photoBadge) {
                            photoBadge.style.display = 'inline-block';
                            photoBadge.style.background = '#dcfce7';
                            photoBadge.style.color = '#16a34a';
                            photoBadge.style.border = '1px solid #86efac';
                            photoBadge.innerHTML = '<i class="fa-solid fa-check"></i> Foto Baru Dipilih';
                        }
                    };
                    img.src = re.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        if (removePhotoBtn) {
            removePhotoBtn.addEventListener('click', () => {
                pendingPhotoData = null;
                isPhotoRemoved = true;
                if (fileInput) fileInput.value = '';

                avatarContainer.innerHTML = `
                    <span id="mpm-avatar-initials" style="font-weight:700; color:#2563eb; font-size:1.2rem;">${getInitials(targetEmp.name)}</span>
                    <div id="mpm-avatar-hover-overlay" style="position: absolute; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ffffff; font-size: 0.65rem; font-weight: 600; opacity: 0; transition: opacity 0.2s;">
                                <i class="fa-solid fa-camera" style="font-size: 1rem; margin-bottom: 2px;"></i>
                                <span>Unggah</span>
                    </div>
                `;
                attachAvatarHover();

                if (photoBadge) {
                    photoBadge.style.display = 'inline-block';
                    photoBadge.style.background = '#fee2e2';
                    photoBadge.style.color = '#dc2626';
                    photoBadge.style.border = '1px solid #fca5a5';
                    photoBadge.innerHTML = '<i class="fa-solid fa-trash-can"></i> Foto Akan Dihapus';
                }
            });
        }

        // Interactive highlighting for role checkboxes
        box.querySelectorAll('input[name="edit-role-checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const label = cb.closest('label');
                const isTech = cb.value.startsWith('TEKNISI');
                if (cb.checked) {
                    label.style.background = isTech ? '#eff6ff' : '#f1f5f9';
                    label.style.borderColor = isTech ? '#3b82f6' : '#94a3b8';
                    label.querySelector('span').style.fontWeight = '700';
                    label.querySelector('span').style.color = isTech ? '#1d4ed8' : '#0f172a';
                } else {
                    label.style.background = '#ffffff';
                    label.style.borderColor = '#e2e8f0';
                    label.querySelector('span').style.fontWeight = '500';
                    label.querySelector('span').style.color = '#475569';
                }
            });
        });

        // Live calculation of tenure when join date changes (Mandat BOS)
        const joinDateInput = document.getElementById('edit-join-date');
        const tenureBadge = document.getElementById('edit-tenure-badge');
        if (joinDateInput && tenureBadge) {
            joinDateInput.addEventListener('input', (e) => {
                const val = e.target.value;
                const calc = calculateTenure(val);
                tenureBadge.textContent = `Masa Kerja: ${calc.tenureText}`;
            });
        }

        // Submit handler
        document.getElementById('mpm-edit-form').onsubmit = async (e) => {
            e.preventDefault();

            const newNik = document.getElementById('edit-nik').value.trim();
            const newName = document.getElementById('edit-name').value.trim().toUpperCase();
            const newBranch = document.getElementById('edit-branch').value.trim();
            const newPosition = document.getElementById('edit-position').value;
            const checkedRoles = Array.from(document.querySelectorAll('input[name="edit-role-checkbox"]:checked')).map(cb => cb.value);
            const newStatus = document.querySelector('input[name="edit-status"]:checked').value;

            const newJoinDateRaw = document.getElementById('edit-join-date') ? document.getElementById('edit-join-date').value : '';
            const newJoinDate = toDisplayDateFormat(newJoinDateRaw) || targetEmp.joinDate || new Date().toLocaleDateString('id-ID');
            const newTenureCalc = calculateTenure(newJoinDateRaw || newJoinDate);

            if (checkedRoles.length === 0) {
                alert('Pilih minimal satu Kategori Peran (Standar Samsung)!');
                return;
            }

            // Handle photo updates (Save to Firestore mpm_photos & local storage)
            let finalPhoto = targetEmp.photo || `photos/emp_${newNik}.jpg`;
            if (pendingPhotoData) {
                finalPhoto = pendingPhotoData;
                try { localStorage.setItem('bujm_photo_' + newNik, pendingPhotoData); } catch (_) {}
                if (window.db) {
                    window.db.collection('mpm_photos').doc(String(newNik)).set({
                        nik: String(newNik),
                        fileName: `emp_${newNik}.jpg`,
                        photoData: pendingPhotoData,
                        updatedAt: new Date().toISOString(),
                        source: 'dashboard_edit'
                    }, { merge: true }).catch(err => console.warn('[MPM] Firestore save photo warning:', err));
                }
            } else if (isPhotoRemoved) {
                finalPhoto = '';
                try { localStorage.removeItem('bujm_photo_' + targetEmp.nik); } catch (_) {}
                if (window.db) {
                    window.db.collection('mpm_photos').doc(String(targetEmp.nik)).delete().catch(err => console.warn('[MPM] Firestore delete photo warning:', err));
                }
            }

            // Build the updated employee record
            const updatedEmpObj = {
                id: newNik,
                nik: newNik,
                name: newName,
                branch: newBranch,
                position: newPosition,
                roles: checkedRoles,
                roleStatus: checkedRoles.join(', '),
                joinDate: newJoinDate,
                tenureYears: newTenureCalc.tenureYears,
                tenureText: newTenureCalc.tenureText,
                status: newStatus,
                photo: finalPhoto,
                updatedAt: new Date().toISOString()
            };

            // Atomic merge with latest Firestore data to PREVENT overwriting edits from other Asmens
            let baseEmployees = [...mpmEmployees];
            const db = await waitForDb(3000);
            if (db) {
                try {
                    const snap = await db.collection('dashboard_data').doc('mpm_employees').get();
                    if (snap.exists && Array.isArray(snap.data().employees)) {
                        baseEmployees = snap.data().employees;
                    }
                } catch (fetchErr) {
                    console.warn('[MPM] Firestore fetch before save warning:', fetchErr);
                }
            }

            if (isNew) {
                baseEmployees.unshift(updatedEmpObj);
            } else {
                const existingIdx = baseEmployees.findIndex(x => String(x.nik) === String(targetEmp.nik));
                if (existingIdx !== -1) {
                    baseEmployees[existingIdx] = {
                        ...baseEmployees[existingIdx],
                        ...updatedEmpObj
                    };
                } else {
                    baseEmployees.unshift(updatedEmpObj);
                }
            }

            mpmEmployees = baseEmployees;
            mpmEmployees.forEach(normalizeEmployeeFields);

            // Save to LocalStorage immediately
            try {
                localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
            } catch (_) {}

            // Save to Firestore (which triggers real-time onSnapshot for everyone)
            if (db) {
                try {
                    await db.collection('dashboard_data').doc('mpm_employees').set({
                        updatedAt: new Date().toISOString(),
                        totalCount: mpmEmployees.length,
                        employees: mpmEmployees
                    }, { merge: true });
                    console.log(`[MPM] Saved ${mpmEmployees.length} employees to Firestore.`);
                } catch (err) {
                    console.error('[MPM] Error saving employees to Firestore:', err);
                }
            }

            closeModal();
            showToast(`Data karyawan ${newName} berhasil disimpan!`);

            // Re-calculate capacity automatically to reflect new branch headcount!
            await calculateMpmCapacityData();
            renderActiveSubTab();
        };
    }

    // Helper: Toast notification
    function showToast(msg) {
        if (typeof window.showToastNotification === 'function') {
            window.showToastNotification(msg);
            return;
        }
        let toast = document.getElementById('mpm-global-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'mpm-global-toast';
            toast.style.position = 'fixed';
            toast.style.bottom = '25px';
            toast.style.right = '25px';
            toast.style.background = '#2563eb';
            toast.style.color = 'white';
            toast.style.padding = '10px 18px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
            toast.style.zIndex = '999999';
            toast.style.fontWeight = '600';
            toast.style.fontSize = '0.85rem';
            toast.style.transition = 'all 0.3s ease';
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.style.display = 'none', 300);
        }, 3000);
    }

})();
