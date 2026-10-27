/**
 * @file mpm_module.js
 * @description Manpower Management & Capacity Intelligence (MPM) Module for BUJM Dashboard.
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
    let currentMpmSubTab = 'capacity'; // 'capacity' | 'roster' | 'simulator'
    let currentFilterStatus = 'ALL';
    let currentFilterBranch = 'ALL';
    let currentFilterRole = 'ALL';
    let currentSearchTerm = '';
    let currentRosterBranch = 'ALL';
    let currentRosterWorkStatus = 'ALL'; // 'ALL' | 'AKTIF' | 'RESIGN'
    let currentRosterSearch = '';

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

        // Load data in parallel with immediate fallback support
        await Promise.all([
            loadEmployeesData(),
            calculateMpmCapacityData()
        ]);

        // Render active view with fresh data
        console.log(`[MPM] Ready! Rendering active view with ${capacityData.length} branches and ${mpmEmployees.length} employees.`);
        renderActiveSubTab();
    };

    // Load employee roster from LocalStorage, JSON fallback, or Firestore
    async function loadEmployeesData() {
        // 1. Check localStorage first
        const localCached = localStorage.getItem('bujm_mpm_employees');
        if (localCached) {
            try {
                mpmEmployees = JSON.parse(localCached);
                if (mpmEmployees && mpmEmployees.length > 0) {
                    mpmEmployees.forEach(e => { e.branch = normalizeBranchName(e.branch); });
                    localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
                    console.log(`[MPM] Loaded & normalized ${mpmEmployees.length} employees from LocalStorage.`);
                    return;
                }
            } catch (_) {}
        }

        // 2. Fetch local JSON file (guaranteed instant 0-delay load)
        try {
            const res = await fetch('./data/mpm_employees.json');
            if (res.ok) {
                mpmEmployees = await res.json();
                mpmEmployees.forEach(e => { e.branch = normalizeBranchName(e.branch); });
                localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
                console.log(`[MPM] Loaded ${mpmEmployees.length} employees from JSON fallback.`);
            }
        } catch (e) {
            console.warn('[MPM] JSON fetch error:', e.message);
        }

        // 3. Background sync from Firestore (non-blocking)
        if (window.db) {
            window.db.collection('dashboard_data').doc('mpm_employees').get().then(snap => {
                if (snap.exists && snap.data().employees) {
                    mpmEmployees = snap.data().employees;
                    mpmEmployees.forEach(e => { e.branch = normalizeBranchName(e.branch); });
                    localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
                    console.log(`[MPM] Synced ${mpmEmployees.length} employees from Firestore in background.`);
                }
            }).catch(err => console.warn('[MPM] Firestore background sync warning:', err.message));
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
                        capacityData = json.branches.map(b => ({ ...b, branch: normalizeBranchName(b.branch) }));
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
        if (window.db) {
            try {
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000));
                const fetchPromise = Promise.all([
                    window.db.collection('dashboard_data').doc('latest_prod').get(),
                    window.db.collection('dashboard_data').doc('latest_eng').get()
                ]);
                const [prodSnap, engSnap] = await Promise.race([fetchPromise, timeoutPromise]);
                if (prodSnap && prodSnap.exists) {
                    const p = prodSnap.data();
                    if (p.gdTrendData) gdTrend = p.gdTrendData;
                    if (!fameList.length && p.fameList) fameList = p.fameList;
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

        // Count real technicians from live edited mpmEmployees for real-time reactive sync!
        const rosterBranchStats = {};
        mpmEmployees.filter(e => e.status !== 'RESIGN').forEach(e => {
            const b = normalizeBranchName(e.branch);
            if (!rosterBranchStats[b]) rosterBranchStats[b] = { techs: 0, allStaff: 0, techHhp: 0, techCe: 0 };
            rosterBranchStats[b].allStaff++;
            const pos = (e.roleStatus || e.position || '').toUpperCase();
            if (pos.includes('TECH') || pos.includes('TEKNISI')) {
                rosterBranchStats[b].techs++;
                if (pos.includes('CE') || pos.includes('HOME') || pos.includes('IN HOME')) rosterBranchStats[b].techCe++;
                else rosterBranchStats[b].techHhp++;
            }
        });

        const hasGdData = gdTrend && Object.keys(gdTrend).length > 0;

        // If no live GD trend data available (offline / initial load), preserve precalculated GD numbers from cache
        if (!hasGdData && capacityData.length > 0) {
            capacityData.forEach(r => {
                const rData = rosterBranchStats[r.branch];
                if (rData) {
                    if (rData.techs > 0) r.realTech = rData.techs;
                    if (rData.allStaff > 0) r.allStaff = rData.allStaff;
                    r.ratioWoAdmin = r.realTech > 0 ? parseFloat((r.totalAdjust / r.realTech).toFixed(1)) : 0;
                    r.ratioWithAdmin = r.allStaff > 0 ? parseFloat((r.totalAdjust / r.allStaff).toFixed(1)) : 0;
                    r.diff = r.realTech - r.finalMinStaff;
                    if (r.realTech < r.finalMinStaff) r.status = 'KURANG';
                    else if (r.realTech > r.finalMinStaff) r.status = 'LEBIH';
                    else r.status = 'CUKUP';
                }
            });
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
            if (!branch || branch === 'UNKNOWN') return;

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

            const totalFame = fData.repairHhp + fData.repairCe;
            let propHhp = totalFame > 0 ? (fData.repairHhp / totalFame) : 0.8;
            let propCe = totalFame > 0 ? (fData.repairCe / totalFame) : 0.2;

            if (rData.techCe > 0 && rData.techHhp === 0) { propCe = 1.0; propHhp = 0.0; }
            if (rData.techHhp > 0 && rData.techCe === 0) { propHhp = 1.0; propCe = 0.0; }

            const volHhp = Math.round(avg3MonthGd * propHhp);
            const volCe = Math.round(avg3MonthGd * propCe);
            const cancelHhp = fData.cancelHhp;
            const cancelCe = fData.cancelCe;

            const adjustHhp = volHhp + (0.5 * cancelHhp);
            const adjustCe = (volCe * 2.5) + (0.5 * cancelCe);
            const totalAdjust = Math.round(adjustHhp + adjustCe);

            // Norma Samsung Murni
            let pureMinStaff = 1;
            if (totalAdjust < 100) pureMinStaff = 1;
            else if (totalAdjust < 200) pureMinStaff = 2;
            else pureMinStaff = Math.round(totalAdjust / 100);

            // ATURAN EMAS OPERASIONAL DARI BOS:
            // 1. Hybrid (MX + CE) -> WAJIB MINIMAL 2 MANPOWER (1 counter MX + 1 mobile CE in-home)
            // 2. Murni MX -> Murni rasio volume
            const hasCe = volCe > 0 || rData.techCe > 0 || fData.repairCe > 0;
            const hasMx = volHhp > 0 || rData.techHhp > 0 || fData.repairHhp > 0;
            const productType = (hasMx && hasCe) ? 'HYBRID (MX+CE)' : (hasCe ? 'CE ONLY' : 'MX ONLY');

            let finalMinStaff = pureMinStaff;
            let bosGuardrail = false;
            if (hasMx && hasCe && finalMinStaff < 2) {
                finalMinStaff = 2;
                bosGuardrail = true;
            }

            const realTech = rData.techs > 0 ? rData.techs : (fameStats[branch] ? 1 : 0);
            const ratioWoAdmin = realTech > 0 ? (totalAdjust / realTech) : 0;
            const ratioWithAdmin = rData.allStaff > 0 ? (totalAdjust / rData.allStaff) : 0;
            const diff = realTech - finalMinStaff;

            let status = 'CUKUP';
            if (realTech < finalMinStaff) status = 'KURANG';
            else if (realTech > finalMinStaff) status = 'LEBIH';

            results.push({
                branch,
                productType,
                hasCe,
                hasMx,
                avg3MonthGd,
                volHhp,
                volCe,
                cancelHhp,
                cancelCe,
                totalAdjust,
                finalMinStaff,
                realTech,
                allStaff: rData.allStaff,
                ratioWoAdmin: parseFloat(ratioWoAdmin.toFixed(1)),
                ratioWithAdmin: parseFloat(ratioWithAdmin.toFixed(1)),
                diff,
                status,
                bosGuardrail
            });
        });

        // Sort: KURANG first (defisit terparah di atas), lalu LEBIH, lalu CUKUP
        results.sort((a, b) => {
            if (a.status === 'KURANG' && b.status !== 'KURANG') return -1;
            if (a.status !== 'KURANG' && b.status === 'KURANG') return 1;
            if (a.status === 'KURANG' && b.status === 'KURANG') return a.diff - b.diff;
            return b.totalAdjust - a.totalAdjust;
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

    // Render base shell with navigation tabs & containers
    function renderMpmShell(container) {
        container.innerHTML = `
            <!-- MPM Header Bar (Executive Light Theme) -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">
                <div>
                    <h2 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; margin: 0;">
                        <i class="fa-solid fa-users-gear" style="color: var(--accent-blue, #2563eb);"></i>
                        MANPOWER MANAGEMENT & CAPACITY INTELLIGENCE (MPM)
                    </h2>
                    <p style="font-size: 0.85rem; color: #64748b; margin: 4px 0 0 0;">
                        Standar Norma Samsung FTE & Master Roster Tim Operasional PT BUJM (Terintegrasi Live GSPN)
                    </p>
                </div>

                <!-- Sub-Tabs Switcher -->
                <div style="display: flex; gap: 6px; background: #f1f5f9; padding: 4px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <button id="mpm-tab-capacity" class="mpm-tab-btn active" style="background: #ffffff; color: var(--accent-blue, #2563eb); border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
                        <i class="fa-solid fa-chart-pie"></i> Capacity & Load Ratios
                    </button>
                    <button id="mpm-tab-roster" class="mpm-tab-btn" style="background: transparent; color: #64748b; border: 1px solid transparent; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-id-card-clip"></i> Master Roster Karyawan (${mpmEmployees.length || 284})
                    </button>
                    <button id="mpm-tab-simulator" class="mpm-tab-btn" style="background: transparent; color: #64748b; border: 1px solid transparent; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-scale-balanced"></i> Simulator Mutasi (Zero-Cost)
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

            <!-- Modal Edit Karyawan Container -->
            <div id="mpm-edit-modal-backdrop" style="display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); z-index: 99999; backdrop-filter: blur(4px); align-items: center; justify-content: center;">
                <div id="mpm-edit-modal-box" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; width: 95%; max-width: 580px; padding: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); max-height: 90vh; overflow-y: auto; color: #0f172a;">
                    <!-- Modal body injected dynamically -->
                </div>
            </div>
        `;

        // Sub-Tab Switcher Event Handlers
        document.getElementById('mpm-tab-capacity').addEventListener('click', () => switchMpmSubTab('capacity'));
        document.getElementById('mpm-tab-roster').addEventListener('click', () => switchMpmSubTab('roster'));
        document.getElementById('mpm-tab-simulator').addEventListener('click', () => switchMpmSubTab('simulator'));
    }

    function switchMpmSubTab(tabName) {
        currentMpmSubTab = tabName;
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
        renderActiveSubTab();
    }

    function renderActiveSubTab() {
        const content = document.getElementById('mpm-subtab-content');
        if (!content) return;

        if (currentMpmSubTab === 'capacity') {
            renderCapacitySubTab(content);
        } else if (currentMpmSubTab === 'roster') {
            renderRosterSubTab(content);
        } else if (currentMpmSubTab === 'simulator') {
            renderSimulatorSubTab(content);
        }
    }

    // =========================================================================
    // SUB-TAB 1: CAPACITY & LIVING LOAD RATIOS (EXECUTIVE LIGHT THEME)
    // =========================================================================
    function renderCapacitySubTab(container) {
        const totalPoints = capacityData.reduce((s, r) => s + r.totalAdjust, 0);
        const totalMin = capacityData.reduce((s, r) => s + r.finalMinStaff, 0);
        const totalReal = capacityData.reduce((s, r) => s + r.realTech, 0);
        const gap = totalReal - totalMin;
        const kurangCount = capacityData.filter(r => r.status === 'KURANG').length;
        const cukupCount = capacityData.filter(r => r.status === 'CUKUP').length;
        const lebihCount = capacityData.filter(r => r.status === 'LEBIH').length;

        // Filter data
        let filtered = capacityData.filter(r => {
            const matchStatus = currentFilterStatus === 'ALL' || r.status === currentFilterStatus;
            const matchSearch = !currentSearchTerm || r.branch.toLowerCase().includes(currentSearchTerm.toLowerCase());
            return matchStatus && matchSearch;
        });

        container.innerHTML = `
            <!-- Top KPI Stat Cards (Matching ALL AGING & GD & SALES) -->
            <div class="kpi-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 15px; margin: 15px 0 20px 0;">
                <div class="kpi-master-card bg-purple">
                    <div class="kpi-icon-left"><i class="fa-solid fa-calculator"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-title">TOTAL POIN BEBAN KERJA</div>
                        <div class="value">${totalPoints.toLocaleString('id-ID')} <span style="font-size: 0.9rem; font-weight: 500; opacity: 0.9;">Poin</span></div>
                        <div class="kpi-subtitle">Avg 3M GD + Bobot CE 2.5x</div>
                    </div>
                    <div class="kpi-chart-right"><i class="fa-solid fa-chart-line"></i></div>
                </div>
                <div class="kpi-master-card bg-blue">
                    <div class="kpi-icon-left"><i class="fa-solid fa-user-check"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-title">KEBUTUHAN MIN TEKNISI</div>
                        <div class="value">${totalMin} <span style="font-size: 0.9rem; font-weight: 500; opacity: 0.9;">Orang</span></div>
                        <div class="kpi-subtitle">Norma Samsung + Aturan BOS</div>
                    </div>
                    <div class="kpi-chart-right"><i class="fa-solid fa-user-gear"></i></div>
                </div>
                <div class="kpi-master-card bg-cyan">
                    <div class="kpi-icon-left"><i class="fa-solid fa-users"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-title">TEKNISI RIIL LAPANGAN</div>
                        <div class="value">${totalReal} <span style="font-size: 0.9rem; font-weight: 500; opacity: 0.9;">Teknisi</span></div>
                        <div class="kpi-subtitle">Aktif di Roster & Fame</div>
                    </div>
                    <div class="kpi-chart-right"><i class="fa-solid fa-id-badge"></i></div>
                </div>
                <div class="kpi-master-card ${gap < 0 ? 'bg-coral' : 'bg-blue'}">
                    <div class="kpi-icon-left"><i class="fa-solid fa-scale-unbalanced"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-title">GAP DEFISIT NASIONAL</div>
                        <div class="value">${gap > 0 ? '+' + gap : gap} <span style="font-size: 0.9rem; font-weight: 500; opacity: 0.9;">Teknisi</span></div>
                        <div class="kpi-subtitle">${gap < 0 ? 'Defisit Perlu Rebalancing' : 'Kapasitas Terpenuhi'}</div>
                    </div>
                    <div class="kpi-chart-right"><i class="fa-solid ${gap < 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i></div>
                </div>
                <div class="kpi-master-card bg-gold">
                    <div class="kpi-icon-left"><i class="fa-solid fa-map-location-dot"></i></div>
                    <div class="kpi-content">
                        <div class="kpi-title">SEBARAN ${capacityData.length} CABANG</div>
                        <div class="value" style="font-size: 1.35rem !important;">
                            <span>${kurangCount} Kurang</span> &bull; 
                            <span>${cukupCount} Cukup</span> &bull; 
                            <span>${lebihCount} Lebih</span>
                        </div>
                        <div class="kpi-subtitle">Peta Intervensi Asmen & Head Ops</div>
                    </div>
                    <div class="kpi-chart-right"><i class="fa-solid fa-diagram-project"></i></div>
                </div>
            </div>

            <!-- Controls: Search & Filter Pills -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; background: #f8fafc; padding: 12px 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span style="font-size: 0.8rem; color: #64748b; font-weight: 700; margin-right: 5px;">Filter Status:</span>
                    <button class="cap-filter-btn ${currentFilterStatus === 'ALL' ? 'active' : ''}" data-val="ALL" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 600; border: 1px solid ${currentFilterStatus === 'ALL' ? '#2563eb' : '#cbd5e1'}; background: ${currentFilterStatus === 'ALL' ? '#2563eb' : '#ffffff'}; color: ${currentFilterStatus === 'ALL' ? '#ffffff' : '#475569'}; box-shadow: ${currentFilterStatus === 'ALL' ? '0 2px 4px rgba(37,99,235,0.2)' : 'none'};">Semua (${capacityData.length})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'KURANG' ? 'active' : ''}" data-val="KURANG" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 700; border: 1px solid ${currentFilterStatus === 'KURANG' ? '#ef4444' : '#fca5a5'}; background: ${currentFilterStatus === 'KURANG' ? '#ef4444' : '#fee2e2'}; color: ${currentFilterStatus === 'KURANG' ? '#ffffff' : '#dc2626'};">🔴 Kurang (${kurangCount})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'CUKUP' ? 'active' : ''}" data-val="CUKUP" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 700; border: 1px solid ${currentFilterStatus === 'CUKUP' ? '#10b981' : '#86efac'}; background: ${currentFilterStatus === 'CUKUP' ? '#10b981' : '#dcfce7'}; color: ${currentFilterStatus === 'CUKUP' ? '#ffffff' : '#16a34a'};">🟢 Cukup (${cukupCount})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'LEBIH' ? 'active' : ''}" data-val="LEBIH" style="padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 700; border: 1px solid ${currentFilterStatus === 'LEBIH' ? '#0284c7' : '#7dd3fc'}; background: ${currentFilterStatus === 'LEBIH' ? '#0284c7' : '#e0f2fe'}; color: ${currentFilterStatus === 'LEBIH' ? '#ffffff' : '#0284c7'};">🔵 Lebih (${lebihCount})</button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div style="position: relative;">
                        <input type="text" id="cap-search-input" value="${currentSearchTerm}" placeholder="Cari nama cabang..." style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 7px 12px 7px 32px; border-radius: 6px; font-size: 0.85rem; width: 220px; outline: none;">
                        <i class="fa-solid fa-search" style="position: absolute; left: 10px; top: 10px; color: #94a3b8; font-size: 0.8rem;"></i>
                    </div>
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
                            <th style="padding: 10px 10px; text-align: right; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Avg 3M GD</th>
                            <th style="padding: 10px 10px; text-align: right; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Vol HHP</th>
                            <th style="padding: 10px 10px; text-align: right; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Vol CE (x2.5)</th>
                            <th style="padding: 10px 10px; text-align: right; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Total Poin</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Min Staf</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Teknisi Riil</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Ratio w/o Admin</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Ratio w/ Admin</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Status Gap</th>
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? `<tr><td colspan="13" style="text-align: center; padding: 30px; color: #94a3b8; font-weight: 500;">Tidak ada cabang yang cocok dengan filter pencarian.</td></tr>` : ''}
                        ${filtered.map((r, idx) => {
                            let statusBadge = '';
                            if (r.status === 'KURANG') statusBadge = `<span style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem; display: inline-block;">KURANG (${r.diff})</span>`;
                            else if (r.status === 'LEBIH') statusBadge = `<span style="background: #e0f2fe; color: #0284c7; border: 1px solid #7dd3fc; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem; display: inline-block;">LEBIH (+${r.diff})</span>`;
                            else statusBadge = `<span style="background: #dcfce7; color: #16a34a; border: 1px solid #86efac; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem; display: inline-block;">CUKUP</span>`;

                            let ratioColor = '#16a34a';
                            if (r.ratioWoAdmin > 115) ratioColor = '#dc2626';
                            else if (r.ratioWoAdmin < 85) ratioColor = '#0284c7';

                            let typeBadge = '';
                            if (r.productType === 'HYBRID (MX+CE)') {
                                typeBadge = `<span style="background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">HYBRID MX+CE</span>`;
                            } else if (r.productType === 'CE ONLY') {
                                typeBadge = `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">CE IN-HOME</span>`;
                            } else {
                                typeBadge = `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">MX COUNTER</span>`;
                            }

                            return `
                                <tr style="border-bottom: 1px solid #f1f5f9; background: #ffffff; color: #0f172a; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                                    <td style="padding: 8px 10px; text-align: center; color: #64748b; font-size: 0.8rem;">${idx + 1}</td>
                                    <td style="padding: 8px 10px; font-weight: 700; color: #0f172a;">
                                        ${r.branch}
                                        ${r.bosGuardrail ? `<i class="fa-solid fa-shield-halved" title="Aturan Khusus BOS: Hybrid MX+CE Wajib Min 2 Teknisi" style="color: #7c3aed; font-size: 0.75rem; margin-left: 5px;"></i>` : ''}
                                    </td>
                                    <td style="padding: 8px 10px;">${typeBadge}</td>
                                    <td style="padding: 8px 10px; text-align: right; color: #334155; font-weight: 600;">${r.avg3MonthGd}</td>
                                    <td style="padding: 8px 10px; text-align: right; color: #64748b;">${r.volHhp}</td>
                                    <td style="padding: 8px 10px; text-align: right; color: #d97706; font-weight: 600;">${r.volCe}</td>
                                    <td style="padding: 8px 10px; text-align: right; color: #7c3aed; font-weight: 800;">${r.totalAdjust}</td>
                                    <td style="padding: 8px 10px; text-align: center; font-weight: 800; color: #0284c7;">${r.finalMinStaff}</td>
                                    <td style="padding: 8px 10px; text-align: center; font-weight: 800; color: #0f172a;">${r.realTech}</td>
                                    <td style="padding: 8px 10px; text-align: center;">
                                        <span style="font-weight: 800; color: ${ratioColor}; font-size: 0.9rem;">${r.ratioWoAdmin}</span>
                                    </td>
                                    <td style="padding: 8px 10px; text-align: center; color: #64748b; font-weight: 600;">
                                        ${r.ratioWithAdmin > 0 ? r.ratioWithAdmin : '-'}
                                    </td>
                                    <td style="padding: 8px 10px; text-align: center;">${statusBadge}</td>
                                    <td style="padding: 8px 10px; text-align: center;">
                                        <button class="mpm-btn-view-roster" data-branch="${r.branch}" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Lihat & Edit Roster Tim di Cabang ini">
                                            <i class="fa-solid fa-users"></i> Roster
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Event Listeners for Filters
        container.querySelectorAll('.cap-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilterStatus = btn.dataset.val;
                renderCapacitySubTab(container);
            });
        });

        const searchInput = document.getElementById('cap-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchTerm = e.target.value;
                renderCapacitySubTab(container);
            });
        }

        // View roster buttons inside table
        container.querySelectorAll('.mpm-btn-view-roster').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetBranch = btn.dataset.branch;
                currentRosterBranch = targetBranch;
                switchMpmSubTab('roster');
            });
        });
    }

    // =========================================================================
    // SUB-TAB 2: MASTER ROSTER KARYAWAN (SHEET DATA 284 STAF + EDIT MODAL)
    // =========================================================================
    function renderRosterSubTab(container) {
        // Collect list of unique branches for filter dropdown
        const branchList = Array.from(new Set(mpmEmployees.map(e => normalizeBranchName(e.branch)))).filter(Boolean).sort();

        // Filter employees
        let filtered = mpmEmployees.filter(e => {
            const b = normalizeBranchName(e.branch);
            const matchBranch = currentRosterBranch === 'ALL' || b === currentRosterBranch;
            const matchWork = currentRosterWorkStatus === 'ALL' || (currentRosterWorkStatus === 'AKTIF' ? e.status !== 'RESIGN' : e.status === 'RESIGN');
            const searchLower = currentRosterSearch.toLowerCase();
            const matchSearch = !currentRosterSearch || 
                (e.name && e.name.toLowerCase().includes(searchLower)) ||
                (e.nik && e.nik.toLowerCase().includes(searchLower)) ||
                (e.position && e.position.toLowerCase().includes(searchLower)) ||
                (e.roleStatus && e.roleStatus.toLowerCase().includes(searchLower));
            return matchBranch && matchWork && matchSearch;
        });

        const totalActive = mpmEmployees.filter(e => e.status !== 'RESIGN').length;
        const totalResign = mpmEmployees.filter(e => e.status === 'RESIGN').length;

        container.innerHTML = `
            <!-- Controls Bar (Executive Light Theme) -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin: 15px 0 20px 0; background: #f8fafc; padding: 12px 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <!-- Branch Filter -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: #64748b; font-weight: 700;">Cabang:</span>
                        <select id="roster-branch-select" style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; outline: none;">
                            <option value="ALL">Semua Cabang (${branchList.length})</option>
                            ${branchList.map(b => `<option value="${b}" ${currentRosterBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Work Status Filter -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: #64748b; font-weight: 700;">Status:</span>
                        <select id="roster-work-status-select" style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; outline: none;">
                            <option value="ALL" ${currentRosterWorkStatus === 'ALL' ? 'selected' : ''}>Semua (${mpmEmployees.length})</option>
                            <option value="AKTIF" ${currentRosterWorkStatus === 'AKTIF' ? 'selected' : ''}>🟢 Masih Bekerja (${totalActive})</option>
                            <option value="RESIGN" ${currentRosterWorkStatus === 'RESIGN' ? 'selected' : ''}>🔴 Sudah Resign (${totalResign})</option>
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
                        <i class="fa-solid fa-user-plus"></i> Tambah Karyawan Baru
                    </button>
                    <button id="btn-reset-roster" style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; padding: 7px 12px; border-radius: 6px; font-size: 0.85rem; cursor: pointer;" title="Reset Filter">
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
                            <th style="padding: 10px 10px; text-align: center; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Status</th>
                            <th style="padding: 10px 10px; text-align: center; width: 90px; font-weight: 700; font-size: 0.78rem; text-transform: uppercase;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? `<tr><td colspan="9" style="text-align: center; padding: 40px; color: #94a3b8; font-weight: 500;">Tidak ada data karyawan yang cocok dengan filter.</td></tr>` : ''}
                        ${filtered.map(emp => {
                            const isResign = emp.status === 'RESIGN';
                            const photoSrc = emp.photo ? emp.photo : `photos/emp_${emp.nik}.jpg`;

                            return `
                                <tr style="border-bottom: 1px solid #f1f5f9; background: #ffffff; color: #0f172a; opacity: ${isResign ? '0.6' : '1.0'}; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                                    <!-- Photo Avatar -->
                                    <td style="padding: 8px 10px; text-align: center;">
                                        <div style="width: 44px; height: 44px; border-radius: 50%; overflow: hidden; border: 2px solid #e2e8f0; display: inline-flex; align-items: center; justify-content: center; background: #f8fafc; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                                            <img src="${photoSrc}" alt="${emp.name}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'font-weight:700; color:#2563eb; font-size:0.8rem;\\'>${getInitials(emp.name)}</span>';" style="width: 100%; height: 100%; object-fit: cover;">
                                        </div>
                                    </td>

                                    <!-- NIK & Name -->
                                    <td style="padding: 8px 10px;">
                                        <div style="font-weight: 700; color: #0f172a; font-size: 0.9rem;">${emp.name}</div>
                                        <div style="font-family: monospace; color: #64748b; font-size: 0.75rem;">NIK: ${emp.nik}</div>
                                    </td>

                                    <!-- Branch -->
                                    <td style="padding: 8px 10px;">
                                        <span style="font-weight: 600; color: #1d4ed8; background: #eff6ff; padding: 3px 8px; border-radius: 4px; border: 1px solid #bfdbfe;">
                                            ${normalizeBranchName(emp.branch)}
                                        </span>
                                    </td>

                                    <!-- Position -->
                                    <td style="padding: 8px 10px; color: #334155; font-weight: 500;">
                                        ${emp.position || '-'}
                                    </td>

                                    <!-- Role Category -->
                                    <td style="padding: 8px 10px;">
                                        ${renderRoleBadge(emp.roleStatus || emp.position)}
                                    </td>

                                    <!-- Join Date -->
                                    <td style="padding: 8px 10px; text-align: center; color: #64748b; font-size: 0.8rem;">
                                        ${emp.joinDate || '-'}
                                    </td>

                                    <!-- Tenure -->
                                    <td style="padding: 8px 10px; text-align: center; color: #334155; font-size: 0.8rem;">
                                        ${emp.tenureText || (emp.tenureYears ? emp.tenureYears + ' Thn' : '-')}
                                    </td>

                                    <!-- Work Status Badge -->
                                    <td style="padding: 8px 10px; text-align: center;">
                                        ${isResign ? 
                                            `<span style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">RESIGN</span>` : 
                                            `<span style="background: #dcfce7; color: #16a34a; border: 1px solid #86efac; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">AKTIF</span>`
                                        }
                                    </td>

                                    <!-- Action Button: Edit -->
                                    <td style="padding: 8px 10px; text-align: center;">
                                        <button class="mpm-btn-edit-emp" data-nik="${emp.nik}" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Edit Data Karyawan">
                                            <i class="fa-solid fa-pen-to-square"></i> Edit
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Event listeners
        const branchSelect = document.getElementById('roster-branch-select');
        if (branchSelect) {
            branchSelect.addEventListener('change', (e) => {
                currentRosterBranch = e.target.value;
                renderRosterSubTab(container);
            });
        }

        const workStatusSelect = document.getElementById('roster-work-status-select');
        if (workStatusSelect) {
            workStatusSelect.addEventListener('change', (e) => {
                currentRosterWorkStatus = e.target.value;
                renderRosterSubTab(container);
            });
        }

        const searchInput = document.getElementById('roster-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentRosterSearch = e.target.value;
                renderRosterSubTab(container);
            });
        }

        const resetBtn = document.getElementById('btn-reset-roster');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                currentRosterBranch = 'ALL';
                currentRosterWorkStatus = 'ALL';
                currentRosterSearch = '';
                renderRosterSubTab(container);
            });
        }

        const addBtn = document.getElementById('btn-add-employee');
        if (addBtn) {
            addBtn.addEventListener('click', () => openEmployeeEditModal(null));
        }

        // Attach click handlers to Edit buttons
        container.querySelectorAll('.mpm-btn-edit-emp').forEach(btn => {
            btn.addEventListener('click', () => {
                const nik = btn.dataset.nik;
                const emp = mpmEmployees.find(e => String(e.nik) === String(nik));
                if (emp) openEmployeeEditModal(emp);
            });
        });
    }

    // Helper: Role badge styling (Light Theme)
    function renderRoleBadge(role) {
        if (!role) return '-';
        const r = String(role).toUpperCase();
        if (r.includes('LEADER')) return `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">LEADER</span>`;
        if (r.includes('TECH') && (r.includes('CE') || r.includes('HOME'))) return `<span style="background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">TECH CE (IH)</span>`;
        if (r.includes('TECH') || r.includes('TEKNISI')) return `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">TECH HHP (MX)</span>`;
        if (r.includes('CS') || r.includes('CUSTOMER')) return `<span style="background: #fdf2f8; color: #be185d; border: 1px solid #fbcfe8; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">CS</span>`;
        if (r.includes('ADMIN')) return `<span style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">ADMIN</span>`;
        if (r.includes('MANAGER') || r.includes('AM')) return `<span style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">MANAGEMENT</span>`;
        return `<span style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${role}</span>`;
    }

    function getInitials(name) {
        if (!name) return 'EMP';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    // =========================================================================
    // MODAL EDIT / UPDATE KARYAWAN (BOS BISA EDIT LANGSUNG - LIGHT THEME)
    // =========================================================================
    function openEmployeeEditModal(emp) {
        const isNew = !emp;
        const targetEmp = emp || {
            nik: '',
            name: '',
            branch: 'HO',
            position: 'TEKNISI HHP',
            roleStatus: 'Tech HHP',
            joinDate: new Date().toLocaleDateString('id-ID'),
            status: 'AKTIF',
            photo: null
        };

        const backdrop = document.getElementById('mpm-edit-modal-backdrop');
        const box = document.getElementById('mpm-edit-modal-box');
        if (!backdrop || !box) return;

        // Distinct branches list for dropdown
        const distinctBranches = Array.from(new Set(capacityData.map(c => c.branch))).sort();
        if (!distinctBranches.includes('HO')) distinctBranches.unshift('HO');

        const photoSrc = targetEmp.photo ? targetEmp.photo : `photos/emp_${targetEmp.nik}.jpg`;

        box.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #0f172a; font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-user-pen" style="color: var(--accent-blue, #2563eb);"></i>
                    ${isNew ? 'Tambah Karyawan Baru' : 'Edit Profil & Lokasi Karyawan'}
                </h3>
                <button id="mpm-modal-close-x" style="background: transparent; border: none; color: #64748b; font-size: 1.4rem; cursor: pointer; line-height: 1;">&times;</button>
            </div>

            <!-- Profile Summary & Photo Preview -->
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; border: 2px solid var(--accent-blue, #2563eb); flex-shrink: 0; background: #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                    <img id="mpm-edit-preview-photo" src="${photoSrc}" alt="${targetEmp.name}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'font-weight:700; color:#2563eb; font-size:1.1rem;\\'>${getInitials(targetEmp.name)}</span>';" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div>
                    <div style="font-weight: 700; color: #0f172a; font-size: 1rem;">${targetEmp.name || 'Nama Karyawan'}</div>
                    <div style="font-family: monospace; color: #64748b; font-size: 0.8rem;">NIK: ${targetEmp.nik || 'Belum ada NIK'}</div>
                    <div style="font-size: 0.75rem; color: #2563eb; margin-top: 2px;">Foto tersinkron dari arsip foto resmi BUJM</div>
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
                    <select id="edit-branch" required style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                        ${distinctBranches.map(b => `<option value="${b}" ${normalizeBranchName(targetEmp.branch) === b ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                    <span style="font-size: 0.75rem; color: #64748b; margin-top: 3px; display: block;">Perubahan cabang otomatis memperbarui headcount & rasio di Capacity Plan.</span>
                </div>

                <!-- Posisi Jabatan & Kategori Peran -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; font-size: 0.8rem; color: #334155; font-weight: 600; margin-bottom: 5px;">Posisi Jabatan (Deskriptif)</label>
                        <input type="text" id="edit-position" value="${targetEmp.position || ''}" style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.8rem; color: #334155; font-weight: 600; margin-bottom: 5px;">Kategori Peran (Standar Samsung)</label>
                        <select id="edit-role" style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                            <option value="Tech HHP" ${String(targetEmp.roleStatus).includes('HHP') ? 'selected' : ''}>Tech HHP (Smartphone / MX)</option>
                            <option value="Tech CE" ${String(targetEmp.roleStatus).includes('CE') ? 'selected' : ''}>Tech CE (Elektronik / In-Home)</option>
                            <option value="Leader" ${String(targetEmp.roleStatus).includes('Leader') ? 'selected' : ''}>Service Leader</option>
                            <option value="CS" ${String(targetEmp.roleStatus).includes('CS') ? 'selected' : ''}>Customer Service (CS)</option>
                            <option value="Admin" ${String(targetEmp.roleStatus).includes('Admin') ? 'selected' : ''}>Admin Part / Tracking</option>
                            <option value="AM" ${String(targetEmp.roleStatus).includes('AM') || String(targetEmp.roleStatus).includes('Manager') ? 'selected' : ''}>Area Manager / Head</option>
                            <option value="Non Staff" ${String(targetEmp.roleStatus).includes('Driver') || String(targetEmp.roleStatus).includes('OB') ? 'selected' : ''}>Non Staff (Driver / OB / Security)</option>
                        </select>
                    </div>
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

        // Submit handler
        document.getElementById('mpm-edit-form').onsubmit = async (e) => {
            e.preventDefault();

            const newNik = document.getElementById('edit-nik').value.trim();
            const newName = document.getElementById('edit-name').value.trim().toUpperCase();
            const newBranch = document.getElementById('edit-branch').value.trim();
            const newPosition = document.getElementById('edit-position').value.trim();
            const newRole = document.getElementById('edit-role').value.trim();
            const newStatus = document.querySelector('input[name="edit-status"]:checked').value;

            if (isNew) {
                // Add new employee
                const newEmpObj = {
                    id: newNik,
                    nik: newNik,
                    name: newName,
                    branch: newBranch,
                    position: newPosition,
                    roleStatus: newRole,
                    joinDate: new Date().toLocaleDateString('id-ID'),
                    status: newStatus,
                    photo: `photos/emp_${newNik}.jpg`,
                    updatedAt: new Date().toISOString()
                };
                mpmEmployees.unshift(newEmpObj);
            } else {
                // Update existing
                const existingIdx = mpmEmployees.findIndex(x => String(x.nik) === String(targetEmp.nik));
                if (existingIdx !== -1) {
                    mpmEmployees[existingIdx].name = newName;
                    mpmEmployees[existingIdx].branch = newBranch;
                    mpmEmployees[existingIdx].position = newPosition;
                    mpmEmployees[existingIdx].roleStatus = newRole;
                    mpmEmployees[existingIdx].status = newStatus;
                    mpmEmployees[existingIdx].updatedAt = new Date().toISOString();
                }
            }

            // Save to LocalStorage immediately
            localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));

            // Sync to Firestore in background
            if (window.db) {
                try {
                    window.db.collection('dashboard_data').doc('mpm_employees').set({
                        updatedAt: new Date().toISOString(),
                        totalCount: mpmEmployees.length,
                        employees: mpmEmployees
                    }, { merge: true }).catch(err => console.warn('Firestore sync background:', err));
                } catch (_) {}
            }

            closeModal();
            showToast(`Data karyawan ${newName} berhasil disimpan!`);

            // Re-calculate capacity automatically to reflect new branch headcount!
            await calculateMpmCapacityData();
            renderActiveSubTab();
        };
    }

    // =========================================================================
    // SUB-TAB 3: SIMULATOR MUTASI (ZERO-COST REBALANCING - LIGHT THEME)
    // =========================================================================
    function renderSimulatorSubTab(container) {
        // Find donor branches (Surplus) and recipient branches (Deficit)
        const donorList = capacityData.filter(c => c.status === 'LEBIH' || c.diff > 0);
        const recipientList = capacityData.filter(c => c.status === 'KURANG' || c.diff < 0);

        let selectedDonor = donorList[0] ? donorList[0].branch : (capacityData[0] ? capacityData[0].branch : '');
        let selectedRecipient = recipientList[0] ? recipientList[0].branch : (capacityData[1] ? capacityData[1].branch : '');
        let transferCount = 1;

        container.innerHTML = `
            <div style="margin: 15px 0 20px 0; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <h3 style="color: #0f172a; margin: 0; font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-scale-balanced" style="color: var(--accent-blue, #2563eb);"></i>
                            Simulator Mutasi Taktis & Zero-Cost Rebalancing
                        </h3>
                        <p style="color: #64748b; font-size: 0.85rem; margin: 4px 0 0 0;">
                            Simulasikan pergeseran teknisi dari cabang donor (kelebihan) ke cabang kritis (kurang) tanpa menambah biaya gaji baru.
                        </p>
                    </div>
                </div>

                <!-- Simulation Inputs Form -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 25px;">
                    <!-- Cabang Asal (Donor) -->
                    <div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #bae6fd; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                        <label style="display: block; font-size: 0.8rem; color: #0284c7; font-weight: 700; margin-bottom: 8px;">1. PILIH CABANG DONOR (SUMBER BANTUAN)</label>
                        <select id="sim-donor-select" style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                            ${capacityData.map(c => `<option value="${c.branch}" ${c.branch === selectedDonor ? 'selected' : ''}>${c.branch} (Riil: ${c.realTech}, Min: ${c.finalMinStaff}, ${c.status})</option>`).join('')}
                        </select>
                    </div>

                    <!-- Jumlah Teknisi -->
                    <div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                        <label style="display: block; font-size: 0.8rem; color: #7c3aed; font-weight: 700; margin-bottom: 8px;">2. JUMLAH TEKNISI YANG DIPINDAHKAN</label>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 5px;">
                            <button id="sim-btn-minus" style="width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 800; cursor: pointer; font-size: 1.1rem;">-</button>
                            <span id="sim-count-display" style="font-size: 1.6rem; font-weight: 800; color: #0f172a;">${transferCount}</span>
                            <button id="sim-btn-plus" style="width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 800; cursor: pointer; font-size: 1.1rem;">+</button>
                        </div>
                    </div>

                    <!-- Cabang Tujuan (Penerima) -->
                    <div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #fecaca; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                        <label style="display: block; font-size: 0.8rem; color: #dc2626; font-weight: 700; margin-bottom: 8px;">3. PILIH CABANG PENERIMA (TARGET DEFISIT)</label>
                        <select id="sim-recipient-select" style="width: 100%; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; outline: none;">
                            ${capacityData.map(c => `<option value="${c.branch}" ${c.branch === selectedRecipient ? 'selected' : ''}>${c.branch} (Riil: ${c.realTech}, Min: ${c.finalMinStaff}, ${c.status})</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- Simulation Result Comparison Cards -->
                <div id="sim-result-box" style="width: 100%;">
                    <!-- Rendered by updateSimulationView -->
                </div>
            </div>
        `;

        function updateSimulationView() {
            const dObj = capacityData.find(c => c.branch === selectedDonor);
            const rObj = capacityData.find(c => c.branch === selectedRecipient);
            const box = document.getElementById('sim-result-box');
            if (!dObj || !rObj || !box) return;

            // Calculations
            const donorRealBefore = dObj.realTech;
            const donorRealAfter = Math.max(0, donorRealBefore - transferCount);
            const donorRatioBefore = dObj.ratioWoAdmin;
            const donorRatioAfter = donorRealAfter > 0 ? (dObj.totalAdjust / donorRealAfter).toFixed(1) : 0;

            const recipRealBefore = rObj.realTech;
            const recipRealAfter = recipRealBefore + transferCount;
            const recipRatioBefore = rObj.ratioWoAdmin;
            const recipRatioAfter = recipRealAfter > 0 ? (rObj.totalAdjust / recipRealAfter).toFixed(1) : 0;

            box.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <!-- Donor Card -->
                    <div style="background: #ffffff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                            <span style="font-weight: 700; color: #0284c7; font-size: 1.1rem;">${dObj.branch} (Cabang Donor)</span>
                            <span style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Beban: ${dObj.totalAdjust} Poin</span>
                        </div>
                        <div style="display: flex; justify-content: space-around; margin-top: 15px; text-align: center;">
                            <div>
                                <div style="font-size: 0.75rem; color: #64748b; font-weight: 600;">SEBELUM</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a;">${donorRealBefore} <span style="font-size: 0.8rem; color: #64748b;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: #0284c7;">Rasio: ${donorRatioBefore}</div>
                            </div>
                            <div style="display: flex; align-items: center; color: #2563eb; font-size: 1.5rem;">
                                <i class="fa-solid fa-arrow-right"></i>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; color: #16a34a; font-weight: 700;">SETELAH PINDAH</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #16a34a;">${donorRealAfter} <span style="font-size: 0.8rem; color: #64748b;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: ${donorRatioAfter > 115 ? '#dc2626' : '#16a34a'};">Rasio: ${donorRatioAfter}</div>
                            </div>
                        </div>
                        <div style="margin-top: 15px; font-size: 0.8rem; color: #0369a1; text-align: center; background: #f0f9ff; padding: 8px; border-radius: 6px; font-weight: 600;">
                            Status Pasca Mutasi: <b>${donorRealAfter >= dObj.finalMinStaff ? 'AMAN / CUKUP' : 'DEFISIT (Tidak Disarankan)'}</b>
                        </div>
                    </div>

                    <!-- Recipient Card -->
                    <div style="background: #ffffff; border: 1px solid #fecaca; border-radius: 10px; padding: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                            <span style="font-weight: 700; color: #dc2626; font-size: 1.1rem;">${rObj.branch} (Cabang Penerima)</span>
                            <span style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Beban: ${rObj.totalAdjust} Poin</span>
                        </div>
                        <div style="display: flex; justify-content: space-around; margin-top: 15px; text-align: center;">
                            <div>
                                <div style="font-size: 0.75rem; color: #64748b; font-weight: 600;">SEBELUM</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a;">${recipRealBefore} <span style="font-size: 0.8rem; color: #64748b;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: #dc2626;">Rasio: ${recipRatioBefore}</div>
                            </div>
                            <div style="display: flex; align-items: center; color: #2563eb; font-size: 1.5rem;">
                                <i class="fa-solid fa-arrow-right"></i>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; color: #16a34a; font-weight: 700;">SETELAH DIBANTU</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #16a34a;">${recipRealAfter} <span style="font-size: 0.8rem; color: #64748b;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: ${recipRatioAfter <= 115 ? '#16a34a' : '#d97706'};">Rasio: ${recipRatioAfter}</div>
                            </div>
                        </div>
                        <div style="margin-top: 15px; font-size: 0.8rem; color: #b91c1c; text-align: center; background: #fef2f2; padding: 8px; border-radius: 6px; font-weight: 600;">
                            Status Pasca Mutasi: <b>${recipRealAfter >= rObj.finalMinStaff ? 'PULIH KE ZONA SEHAT (CUKUP)' : `DEFISIT BERKURANG (${recipRealAfter - rObj.finalMinStaff})`}</b>
                        </div>
                    </div>
                </div>

                <!-- Executive Justification Copy Button -->
                <div style="margin-top: 20px; text-align: center;">
                    <button id="btn-copy-sim-justification" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                        <i class="fa-solid fa-copy"></i> Salin Teks Justifikasi Mutasi untuk Direksi / WA
                    </button>
                </div>
            `;

            const copyBtn = document.getElementById('btn-copy-sim-justification');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    const text = `*USULAN MUTASI REBALANCING SDM BUJM (ZERO COST)*\n` +
                                 `-----------------------------------------\n` +
                                 `• *Cabang Asal (Donor):* ${dObj.branch}\n` +
                                 `  - Riil Saat Ini : ${donorRealBefore} teknisi (Rasio: ${donorRatioBefore})\n` +
                                 `  - Setelah Mutasi: ${donorRealAfter} teknisi (Rasio: ${donorRatioAfter} - Tetap Aman)\n\n` +
                                 `• *Cabang Tujuan (Penerima):* ${rObj.branch}\n` +
                                 `  - Riil Saat Ini : ${recipRealBefore} teknisi (Rasio: ${recipRatioBefore} - Overload)\n` +
                                 `  - Setelah Mutasi: ${recipRealAfter} teknisi (Rasio: ${recipRatioAfter} - Beban Turun)\n\n` +
                                 `• *Dampak Finansial:* Rp 0,- (Tanpa Tambahan Biaya Gaji)\n` +
                                 `• *Tujuan:* Menurunkan beban overload teknisi dan mencegah lonjakan Aging unit > 7 hari.\n\n` +
                                 `Mohon arahan dan persetujuan Manajemen. Terima kasih.`;
                    navigator.clipboard.writeText(text).then(() => {
                        showToast('Draft justifikasi mutasi berhasil disalin ke clipboard!');
                    });
                };
            }
        }

        // Dropdown listeners
        document.getElementById('sim-donor-select').onchange = (e) => {
            selectedDonor = e.target.value;
            updateSimulationView();
        };
        document.getElementById('sim-recipient-select').onchange = (e) => {
            selectedRecipient = e.target.value;
            updateSimulationView();
        };
        document.getElementById('sim-btn-minus').onclick = () => {
            if (transferCount > 1) {
                transferCount--;
                document.getElementById('sim-count-display').innerText = transferCount;
                updateSimulationView();
            }
        };
        document.getElementById('sim-btn-plus').onclick = () => {
            if (transferCount < 5) {
                transferCount++;
                document.getElementById('sim-count-display').innerText = transferCount;
                updateSimulationView();
            }
        };

        updateSimulationView();
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
