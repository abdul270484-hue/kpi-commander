/**
 * @file mpm_module.js
 * @description Manpower Management & Capacity Intelligence (MPM) Module for BUJM Dashboard.
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
        console.log('[MPM] Initializing Manpower Management Module...');
        const container = document.getElementById('mpm-container');
        if (!container) return;

        // Render base shell
        renderMpmShell(container);

        // Load data in parallel
        await Promise.all([
            loadEmployeesData(),
            calculateMpmCapacityData()
        ]);

        // Render active view
        renderActiveSubTab();
    };

    // Load employee roster from Firestore or fallback to JSON
    async function loadEmployeesData() {
        // Check localStorage first for any local unsaved edits
        const localCached = localStorage.getItem('bujm_mpm_employees');
        if (localCached) {
            try {
                mpmEmployees = JSON.parse(localCached);
                console.log(`[MPM] Loaded ${mpmEmployees.length} employees from LocalStorage.`);
                return;
            } catch (_) {}
        }

        // Try Firestore
        if (window.db) {
            try {
                const snap = await window.db.collection('dashboard_data').doc('mpm_employees').get();
                if (snap.exists && snap.data().employees) {
                    mpmEmployees = snap.data().employees;
                    localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
                    console.log(`[MPM] Loaded ${mpmEmployees.length} employees from Firestore.`);
                    return;
                }
            } catch (err) {
                console.warn('[MPM] Firestore fetch fallback to JSON:', err.message);
            }
        }

        // Fallback to local JSON file
        try {
            const res = await fetch('./data/mpm_employees.json');
            if (res.ok) {
                mpmEmployees = await res.json();
                localStorage.setItem('bujm_mpm_employees', JSON.stringify(mpmEmployees));
                console.log(`[MPM] Loaded ${mpmEmployees.length} employees from JSON fallback.`);
            }
        } catch (e) {
            console.error('[MPM] Failed to load employees data:', e);
        }
    }

    // Calculate capacity data based on 3M GD average + Wall of Fame + BOS Rules
    async function calculateMpmCapacityData() {
        let gdTrend = {};
        let fameList = window.fameData || [];
        let dtsMx = {};
        let dtsIh = {};

        // Fetch latest_prod & latest_eng from Firestore if not in memory
        if (window.db) {
            try {
                const [prodSnap, engSnap] = await Promise.all([
                    window.db.collection('dashboard_data').doc('latest_prod').get(),
                    window.db.collection('dashboard_data').doc('latest_eng').get()
                ]);
                if (prodSnap.exists) {
                    const p = prodSnap.data();
                    gdTrend = p.gdTrendData || {};
                    if (!fameList.length) fameList = p.fameList || [];
                }
                if (engSnap.exists) {
                    const e = engSnap.data();
                    dtsMx = e.dtsMxData || {};
                    dtsIh = e.dtsIhData || {};
                }
            } catch (err) {
                console.warn('[MPM] Firestore capacity fetch warning:', err.message);
            }
        }

        const months3 = ['2026-07', '2026-08', '2026-09'];
        const techCategoryMap = {};
        for (const name in dtsMx) techCategoryMap[name.toUpperCase()] = 'MX';
        for (const name in dtsIh) techCategoryMap[name.toUpperCase()] = 'CE';

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

        capacityData = results;
    }

    // Helper: Normalize Branch Name for reliable merging
    function normalizeBranchName(name) {
        if (!name) return '';
        let b = String(name).toUpperCase().trim();
        b = b.replace(/^BE\s+/i, '').replace(/^\d+\s*-\s*/, '').trim();
        if (b.includes('CELLULAR WORLD') || b.includes('TEUKU')) return 'DENPASAR - CELLULAR WORLD';
        if (b.includes('PLANET GADGET') || b.includes('GATSU')) return 'DENPASAR - PLANET GADGET';
        if (b.includes('ITC') || b.includes('BSD')) return 'SERPONG ITC-BSD';
        if (b.includes('SERPONG')) return 'SERPONG';
        if (b.includes('DENPASAR')) return 'DENPASAR';
        if (b.includes('MAKASSAR') || b.includes('MKS')) return 'MAKASSAR';
        if (b.includes('BANJARMASIN') || b.includes('BJM')) return 'BANJARMASIN';
        if (b.includes('SAMARINDA') || b.includes('SMD')) return 'SAMARINDA';
        if (b.includes('LAMPUNG') || b.includes('LPG')) return 'BANDAR LAMPUNG';
        if (b.includes('PONTIANAK') || b.includes('PNK')) return 'PONTIANAK';
        if (b.includes('SIDOARJO') || b.includes('SDJ')) return 'SIDOARJO';
        if (b.includes('MANADO') || b.includes('MND')) return 'MANADO';
        if (b.includes('KARAWANG') || b.includes('KRW')) return 'KARAWANG';
        if (b.includes('KUPANG') || b.includes('KPG')) return 'KUPANG';
        if (b.includes('KENDARI') || b.includes('KDI')) return 'KENDARI';
        if (b.includes('BENGKULU') || b.includes('BKL')) return 'BENGKULU';
        if (b.includes('PALANGKARAYA') || b.includes('PKY')) return 'PALANGKARAYA';
        if (b.includes('PALU') || b.includes('PLU')) return 'PALU';
        if (b.includes('BATAM') || b.includes('BTM')) return 'BATAM';
        if (b.includes('AMBON') || b.includes('ABN')) return 'AMBON';
        if (b.includes('JAYAPURA') || b.includes('JYP')) return 'JAYAPURA';
        if (b.includes('PANGKALAN BUN') || b.includes('PKB')) return 'PANGKALAN BUN';
        if (b.includes('TANJUNGPINANG') || b.includes('TPG')) return 'TANJUNGPINANG';
        if (b.includes('PATI') || b.includes('PTI')) return 'PATI';
        if (b.includes('SORONG') || b.includes('SRO')) return 'SORONG';
        if (b.includes('BONTANG') || b.includes('BTG')) return 'BONTANG';
        if (b.includes('SINGARAJA') || b.includes('SGR')) return 'SINGARAJA';
        if (b.includes('SAMPIT') || b.includes('SMP')) return 'SAMPIT';
        if (b.includes('SRAGEN') || b.includes('SRG')) return 'SRAGEN';
        return b;
    }

    // Render base shell with navigation tabs & containers
    function renderMpmShell(container) {
        container.innerHTML = `
            <!-- MPM Header Bar -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 15px;">
                <div>
                    <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 10px; margin: 0;">
                        <i class="fa-solid fa-users-gear" style="color: #c084fc;"></i>
                        MANPOWER MANAGEMENT & CAPACITY INTELLIGENCE (MPM)
                    </h2>
                    <p style="font-size: 0.85rem; color: #94a3b8; margin: 4px 0 0 0;">
                        Standar Norma Samsung FTE & Master Roster Tim Operasional PT BUJM (Terintegrasi Live GSPN)
                    </p>
                </div>

                <!-- Sub-Tabs Switcher -->
                <div style="display: flex; gap: 8px; background: rgba(15, 23, 42, 0.6); padding: 5px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <button id="mpm-tab-capacity" class="mpm-tab-btn active" style="background: #a855f7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-chart-pie"></i> Capacity & Load Ratios
                    </button>
                    <button id="mpm-tab-roster" class="mpm-tab-btn" style="background: transparent; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-id-card-clip"></i> Master Roster Karyawan (${mpmEmployees.length || 284})
                    </button>
                    <button id="mpm-tab-simulator" class="mpm-tab-btn" style="background: transparent; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-scale-balanced"></i> Simulator Mutasi (Zero-Cost)
                    </button>
                </div>
            </div>

            <!-- Content Area for Sub-Tabs -->
            <div id="mpm-subtab-content" style="width: 100%;">
                <div style="text-align: center; padding: 40px; color: #94a3b8;">
                    <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
                    <p style="margin-top: 10px;">Menghitung kapasitas dan memuat data karyawan...</p>
                </div>
            </div>

            <!-- Modal Edit Karyawan Container -->
            <div id="mpm-edit-modal-backdrop" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 99999; backdrop-filter: blur(4px); align-items: center; justify-content: center;">
                <div id="mpm-edit-modal-box" style="background: #0f172a; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 12px; width: 95%; max-width: 580px; padding: 25px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); max-height: 90vh; overflow-y: auto;">
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
            btn.style.color = '#94a3b8';
        });
        const activeBtn = document.getElementById(`mpm-tab-${tabName}`);
        if (activeBtn) {
            activeBtn.style.background = '#a855f7';
            activeBtn.style.color = '#ffffff';
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
    // SUB-TAB 1: CAPACITY & LIVING LOAD RATIOS
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
            <!-- Top KPI Stat Cards -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0 20px 0;">
                <div style="background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 10px; padding: 15px;">
                    <div style="font-size: 0.8rem; color: #c084fc; text-transform: uppercase; font-weight: 600;">Total Poin Beban Kerja</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #ffffff; margin-top: 5px;">${totalPoints.toLocaleString('id-ID')} <span style="font-size: 0.9rem; font-weight: 400; color: #94a3b8;">Poin</span></div>
                    <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 4px;">Rata-rata 3 Bulan GD + Bobot CE 2.5x</div>
                </div>
                <div style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 15px;">
                    <div style="font-size: 0.8rem; color: #38bdf8; text-transform: uppercase; font-weight: 600;">Kebutuhan Min Teknisi</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #ffffff; margin-top: 5px;">${totalMin} <span style="font-size: 0.9rem; font-weight: 400; color: #94a3b8;">Orang</span></div>
                    <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 4px;">Norma Samsung (100 Poin) + Aturan BOS</div>
                </div>
                <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 15px;">
                    <div style="font-size: 0.8rem; color: #34d399; text-transform: uppercase; font-weight: 600;">Teknisi Riil Lapangan</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #ffffff; margin-top: 5px;">${totalReal} <span style="font-size: 0.9rem; font-weight: 400; color: #94a3b8;">Teknisi</span></div>
                    <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 4px;">Aktif Terdata di Roster & Wall of Fame</div>
                </div>
                <div style="background: ${gap < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; border: 1px solid ${gap < 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}; border-radius: 10px; padding: 15px;">
                    <div style="font-size: 0.8rem; color: ${gap < 0 ? '#f87171' : '#34d399'}; text-transform: uppercase; font-weight: 600;">Gap Defisit Nasional</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: #ffffff; margin-top: 5px;">${gap} <span style="font-size: 0.9rem; font-weight: 400; color: #94a3b8;">Teknisi</span></div>
                    <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 4px;">${gap < 0 ? 'Defisit Nasional Perlu Rebalancing' : 'Kapasitas Nasional Terpenuhi'}</div>
                </div>
                <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 15px;">
                    <div style="font-size: 0.8rem; color: #fbbf24; text-transform: uppercase; font-weight: 600;">Sebaran 52 Cabang</div>
                    <div style="font-size: 1.25rem; font-weight: 800; color: #ffffff; margin-top: 8px;">
                        <span style="color: #ef4444;">${kurangCount} Kurang</span> | 
                        <span style="color: #10b981;">${cukupCount} Cukup</span> | 
                        <span style="color: #38bdf8;">${lebihCount} Lebih</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 4px;">Peta Intervensi Asmen & Head Ops</div>
                </div>
            </div>

            <!-- Controls: Search & Filter Pills -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 8px;">
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 600; margin-right: 5px;">Filter Status:</span>
                    <button class="cap-filter-btn ${currentFilterStatus === 'ALL' ? 'active' : ''}" data-val="ALL" style="padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; border: 1px solid rgba(255,255,255,0.15); background: ${currentFilterStatus === 'ALL' ? '#a855f7' : 'transparent'}; color: white;">Semua (${capacityData.length})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'KURANG' ? 'active' : ''}" data-val="KURANG" style="padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; border: 1px solid rgba(239,68,68,0.3); background: ${currentFilterStatus === 'KURANG' ? '#ef4444' : 'transparent'}; color: #f87171;">🔴 Kurang (${kurangCount})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'CUKUP' ? 'active' : ''}" data-val="CUKUP" style="padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; border: 1px solid rgba(16,185,129,0.3); background: ${currentFilterStatus === 'CUKUP' ? '#10b981' : 'transparent'}; color: #34d399;">🟢 Cukup (${cukupCount})</button>
                    <button class="cap-filter-btn ${currentFilterStatus === 'LEBIH' ? 'active' : ''}" data-val="LEBIH" style="padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; border: 1px solid rgba(56,189,248,0.3); background: ${currentFilterStatus === 'LEBIH' ? '#38bdf8' : 'transparent'}; color: #38bdf8;">🔵 Lebih (${lebihCount})</button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div style="position: relative;">
                        <input type="text" id="cap-search-input" value="${currentSearchTerm}" placeholder="Cari nama cabang..." style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 6px 12px 6px 30px; border-radius: 6px; font-size: 0.85rem; width: 220px;">
                        <i class="fa-solid fa-search" style="position: absolute; left: 10px; top: 9px; color: #94a3b8; font-size: 0.8rem;"></i>
                    </div>
                </div>
            </div>

            <!-- Capacity Data Table -->
            <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; background: rgba(15, 23, 42, 0.6);">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                    <thead>
                        <tr style="background: rgba(30, 41, 59, 0.8); color: #cbd5e1; border-bottom: 2px solid rgba(255,255,255,0.1);">
                            <th style="padding: 12px 10px; text-align: center; width: 40px;">No</th>
                            <th style="padding: 12px 10px;">Cabang</th>
                            <th style="padding: 12px 10px;">Tipe Layanan</th>
                            <th style="padding: 12px 10px; text-align: right;">Avg 3M GD</th>
                            <th style="padding: 12px 10px; text-align: right;">Vol HHP</th>
                            <th style="padding: 12px 10px; text-align: right;">Vol CE (x2.5)</th>
                            <th style="padding: 12px 10px; text-align: right;">Total Poin</th>
                            <th style="padding: 12px 10px; text-align: center;">Min Staf</th>
                            <th style="padding: 12px 10px; text-align: center;">Teknisi Riil</th>
                            <th style="padding: 12px 10px; text-align: center;">Ratio w/o Admin</th>
                            <th style="padding: 12px 10px; text-align: center;">Ratio w/ Admin</th>
                            <th style="padding: 12px 10px; text-align: center;">Status Gap</th>
                            <th style="padding: 12px 10px; text-align: center;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? `<tr><td colspan="13" style="text-align: center; padding: 30px; color: #94a3b8;">Tidak ada cabang yang cocok dengan filter pencarian.</td></tr>` : ''}
                        ${filtered.map((r, idx) => {
                            let statusBadge = '';
                            if (r.status === 'KURANG') statusBadge = `<span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem;">KURANG (${r.diff})</span>`;
                            else if (r.status === 'LEBIH') statusBadge = `<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem;">LEBIH (+${r.diff})</span>`;
                            else statusBadge = `<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem;">CUKUP</span>`;

                            let ratioColor = '#34d399';
                            if (r.ratioWoAdmin > 115) ratioColor = '#f87171';
                            else if (r.ratioWoAdmin < 85) ratioColor = '#38bdf8';

                            let typeBadge = '';
                            if (r.productType === 'HYBRID (MX+CE)') {
                                typeBadge = `<span style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">HYBRID MX+CE</span>`;
                            } else if (r.productType === 'CE ONLY') {
                                typeBadge = `<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">CE IN-HOME</span>`;
                            } else {
                                typeBadge = `<span style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">MX COUNTER</span>`;
                            }

                            return `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
                                    <td style="padding: 10px; text-align: center; color: #64748b;">${idx + 1}</td>
                                    <td style="padding: 10px; font-weight: 700; color: #f8fafc;">
                                        ${r.branch}
                                        ${r.bosGuardrail ? `<i class="fa-solid fa-shield-halved" title="Aturan Khusus BOS: Hybrid MX+CE Wajib Min 2 Teknisi" style="color: #c084fc; font-size: 0.75rem; margin-left: 5px;"></i>` : ''}
                                    </td>
                                    <td style="padding: 10px;">${typeBadge}</td>
                                    <td style="padding: 10px; text-align: right; color: #cbd5e1; font-weight: 600;">${r.avg3MonthGd}</td>
                                    <td style="padding: 10px; text-align: right; color: #94a3b8;">${r.volHhp}</td>
                                    <td style="padding: 10px; text-align: right; color: #fbbf24; font-weight: 600;">${r.volCe}</td>
                                    <td style="padding: 10px; text-align: right; color: #c084fc; font-weight: 700;">${r.totalAdjust}</td>
                                    <td style="padding: 10px; text-align: center; font-weight: 700; color: #38bdf8;">${r.finalMinStaff}</td>
                                    <td style="padding: 10px; text-align: center; font-weight: 700; color: #ffffff;">${r.realTech}</td>
                                    <td style="padding: 10px; text-align: center;">
                                        <span style="font-weight: 800; color: ${ratioColor}; font-size: 0.9rem;">${r.ratioWoAdmin}</span>
                                    </td>
                                    <td style="padding: 10px; text-align: center; color: #94a3b8; font-weight: 600;">
                                        ${r.ratioWithAdmin > 0 ? r.ratioWithAdmin : '-'}
                                    </td>
                                    <td style="padding: 10px; text-align: center;">${statusBadge}</td>
                                    <td style="padding: 10px; text-align: center;">
                                        <button class="mpm-btn-view-roster" data-branch="${r.branch}" style="background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); color: #c084fc; padding: 4px 8px; border-radius: 5px; font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Lihat & Edit Roster Tim di Cabang ini">
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
            <!-- Controls Bar -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; margin: 15px 0 20px 0; background: rgba(30, 41, 59, 0.5); padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <!-- Branch Filter -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 600;">Cabang:</span>
                        <select id="roster-branch-select" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;">
                            <option value="ALL">Semua Cabang (${branchList.length})</option>
                            ${branchList.map(b => `<option value="${b}" ${currentRosterBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Work Status Filter -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 600;">Status:</span>
                        <select id="roster-work-status-select" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;">
                            <option value="ALL" ${currentRosterWorkStatus === 'ALL' ? 'selected' : ''}>Semua (${mpmEmployees.length})</option>
                            <option value="AKTIF" ${currentRosterWorkStatus === 'AKTIF' ? 'selected' : ''}>🟢 Masih Bekerja (${totalActive})</option>
                            <option value="RESIGN" ${currentRosterWorkStatus === 'RESIGN' ? 'selected' : ''}>🔴 Sudah Resign (${totalResign})</option>
                        </select>
                    </div>

                    <!-- Search Input -->
                    <div style="position: relative;">
                        <input type="text" id="roster-search-input" value="${currentRosterSearch}" placeholder="Cari Nama, NIK, Posisi..." style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 6px 12px 6px 30px; border-radius: 6px; font-size: 0.85rem; width: 220px;">
                        <i class="fa-solid fa-search" style="position: absolute; left: 10px; top: 9px; color: #94a3b8; font-size: 0.8rem;"></i>
                    </div>
                </div>

                <!-- Action Button: Add New Employee -->
                <div style="display: flex; gap: 10px;">
                    <button id="btn-add-employee" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                        <i class="fa-solid fa-user-plus"></i> Tambah Karyawan Baru
                    </button>
                    <button id="btn-reset-roster" style="background: rgba(255,255,255,0.05); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; cursor: pointer;" title="Reset Filter">
                        <i class="fa-solid fa-arrow-rotate-right"></i>
                    </button>
                </div>
            </div>

            <!-- Employee Cards / Table View -->
            <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; background: rgba(15, 23, 42, 0.6);">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                    <thead>
                        <tr style="background: rgba(30, 41, 59, 0.8); color: #cbd5e1; border-bottom: 2px solid rgba(255,255,255,0.1);">
                            <th style="padding: 12px 10px; text-align: center; width: 60px;">Foto</th>
                            <th style="padding: 12px 10px;">NIK & Nama Karyawan</th>
                            <th style="padding: 12px 10px;">Lokasi / Cabang</th>
                            <th style="padding: 12px 10px;">Posisi Jabatan</th>
                            <th style="padding: 12px 10px;">Kategori Peran</th>
                            <th style="padding: 12px 10px; text-align: center;">Tgl Masuk</th>
                            <th style="padding: 12px 10px; text-align: center;">Masa Kerja</th>
                            <th style="padding: 12px 10px; text-align: center;">Status</th>
                            <th style="padding: 12px 10px; text-align: center; width: 90px;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? `<tr><td colspan="9" style="text-align: center; padding: 40px; color: #94a3b8;">Tidak ada data karyawan yang cocok dengan filter.</td></tr>` : ''}
                        ${filtered.map(emp => {
                            const isResign = emp.status === 'RESIGN';
                            const photoSrc = emp.photo ? emp.photo : `photos/emp_${emp.nik}.jpg`;

                            return `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); opacity: ${isResign ? '0.55' : '1.0'}; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
                                    <!-- Photo Avatar -->
                                    <td style="padding: 8px 10px; text-align: center;">
                                        <div style="width: 44px; height: 44px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(168, 85, 247, 0.4); display: inline-flex; align-items: center; justify-content: center; background: #1e293b; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
                                            <img src="${photoSrc}" alt="${emp.name}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'font-weight:700; color:#c084fc; font-size:0.8rem;\\'>${getInitials(emp.name)}</span>';" style="width: 100%; height: 100%; object-fit: cover;">
                                        </div>
                                    </td>

                                    <!-- NIK & Name -->
                                    <td style="padding: 10px;">
                                        <div style="font-weight: 700; color: #f8fafc; font-size: 0.9rem;">${emp.name}</div>
                                        <div style="font-family: monospace; color: #94a3b8; font-size: 0.75rem;">NIK: ${emp.nik}</div>
                                    </td>

                                    <!-- Branch -->
                                    <td style="padding: 10px;">
                                        <span style="font-weight: 600; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.2);">
                                            ${normalizeBranchName(emp.branch)}
                                        </span>
                                    </td>

                                    <!-- Position -->
                                    <td style="padding: 10px; color: #cbd5e1; font-weight: 500;">
                                        ${emp.position || '-'}
                                    </td>

                                    <!-- Role Category -->
                                    <td style="padding: 10px;">
                                        ${renderRoleBadge(emp.roleStatus || emp.position)}
                                    </td>

                                    <!-- Join Date -->
                                    <td style="padding: 10px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
                                        ${emp.joinDate || '-'}
                                    </td>

                                    <!-- Tenure -->
                                    <td style="padding: 10px; text-align: center; color: #cbd5e1; font-size: 0.8rem;">
                                        ${emp.tenureText || (emp.tenureYears ? emp.tenureYears + ' Thn' : '-')}
                                    </td>

                                    <!-- Work Status Badge -->
                                    <td style="padding: 10px; text-align: center;">
                                        ${isResign ? 
                                            `<span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">RESIGN</span>` : 
                                            `<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">AKTIF</span>`
                                        }
                                    </td>

                                    <!-- Action Button: Edit -->
                                    <td style="padding: 10px; text-align: center;">
                                        <button class="mpm-btn-edit-emp" data-nik="${emp.nik}" style="background: linear-gradient(135deg, #a855f7, #7c3aed); color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);">
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

    // Helper: Role badge styling
    function renderRoleBadge(role) {
        if (!role) return '-';
        const r = String(role).toUpperCase();
        if (r.includes('LEADER')) return `<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">LEADER</span>`;
        if (r.includes('TECH') && (r.includes('CE') || r.includes('HOME'))) return `<span style="background: rgba(168, 85, 247, 0.2); color: #c084fc; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">TECH CE (IH)</span>`;
        if (r.includes('TECH') || r.includes('TEKNISI')) return `<span style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">TECH HHP (MX)</span>`;
        if (r.includes('CS') || r.includes('CUSTOMER')) return `<span style="background: rgba(236, 72, 153, 0.2); color: #f472b6; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">CS</span>`;
        if (r.includes('ADMIN')) return `<span style="background: rgba(14, 165, 233, 0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">ADMIN</span>`;
        if (r.includes('MANAGER') || r.includes('AM')) return `<span style="background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">MANAGEMENT</span>`;
        return `<span style="background: rgba(100, 116, 139, 0.2); color: #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${role}</span>`;
    }

    function getInitials(name) {
        if (!name) return 'EMP';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    // =========================================================================
    // MODAL EDIT / UPDATE KARYAWAN (BOS BISA EDIT LANGSUNG)
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
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #f8fafc; font-size: 1.25rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-user-pen" style="color: #c084fc;"></i>
                    ${isNew ? 'Tambah Karyawan Baru' : 'Edit Profil & Lokasi Karyawan'}
                </h3>
                <button id="mpm-modal-close-x" style="background: transparent; border: none; color: #94a3b8; font-size: 1.25rem; cursor: pointer;">&times;</button>
            </div>

            <!-- Profile Summary & Photo Preview -->
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; background: rgba(30, 41, 59, 0.4); padding: 12px; border-radius: 8px;">
                <div style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; border: 2px solid #a855f7; flex-shrink: 0; background: #1e293b; display: flex; align-items: center; justify-content: center;">
                    <img id="mpm-edit-preview-photo" src="${photoSrc}" alt="${targetEmp.name}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span style=\\'font-weight:700; color:#c084fc; font-size:1.1rem;\\'>${getInitials(targetEmp.name)}</span>';" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div>
                    <div style="font-weight: 700; color: #ffffff; font-size: 1rem;">${targetEmp.name || 'Nama Karyawan'}</div>
                    <div style="font-family: monospace; color: #94a3b8; font-size: 0.8rem;">NIK: ${targetEmp.nik || 'Belum ada NIK'}</div>
                    <div style="font-size: 0.75rem; color: #c084fc; margin-top: 2px;">Foto tersinkron dari arsip foto resmi BUJM</div>
                </div>
            </div>

            <!-- Form Fields -->
            <form id="mpm-edit-form" style="display: flex; flex-direction: column; gap: 15px;">
                <!-- NIK -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #cbd5e1; font-weight: 600; margin-bottom: 5px;">Nomor Induk Karyawan (NIK)</label>
                    <input type="text" id="edit-nik" value="${targetEmp.nik}" ${!isNew ? 'readonly' : ''} required style="width: 100%; background: ${!isNew ? 'rgba(15, 23, 42, 0.5)' : '#0f172a'}; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 0.9rem;">
                </div>

                <!-- Nama Lengkap -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #cbd5e1; font-weight: 600; margin-bottom: 5px;">Nama Lengkap Karyawan</label>
                    <input type="text" id="edit-name" value="${targetEmp.name}" required style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
                </div>

                <!-- Cabang / Lokasi Penempatan (Dropdown) -->
                <div>
                    <label style="display: block; font-size: 0.8rem; color: #cbd5e1; font-weight: 600; margin-bottom: 5px;">Lokasi Cabang / Penempatan</label>
                    <select id="edit-branch" required style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
                        ${distinctBranches.map(b => `<option value="${b}" ${normalizeBranchName(targetEmp.branch) === b ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                    <span style="font-size: 0.75rem; color: #94a3b8; margin-top: 3px; display: block;">Perubahan cabang otomatis memperbarui headcount & rasio di Capacity Plan.</span>
                </div>

                <!-- Posisi Jabatan & Kategori Peran -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; font-size: 0.8rem; color: #cbd5e1; font-weight: 600; margin-bottom: 5px;">Posisi Jabatan (Deskriptif)</label>
                        <input type="text" id="edit-position" value="${targetEmp.position || ''}" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.8rem; color: #cbd5e1; font-weight: 600; margin-bottom: 5px;">Kategori Peran (Standar Samsung)</label>
                        <select id="edit-role" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
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
                <div style="background: rgba(15, 23, 42, 0.7); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <label style="display: block; font-size: 0.8rem; color: #cbd5e1; font-weight: 600; margin-bottom: 8px;">Status Hubungan Kerja</label>
                    <div style="display: flex; gap: 20px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #34d399; font-weight: 600; font-size: 0.85rem;">
                            <input type="radio" name="edit-status" value="AKTIF" ${targetEmp.status !== 'RESIGN' ? 'checked' : ''}>
                            <i class="fa-solid fa-circle-check"></i> Masih Bekerja (Aktif)
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #f87171; font-weight: 600; font-size: 0.85rem;">
                            <input type="radio" name="edit-status" value="RESIGN" ${targetEmp.status === 'RESIGN' ? 'checked' : ''}>
                            <i class="fa-solid fa-arrow-right-from-bracket"></i> Sudah Resign / Keluar
                        </label>
                    </div>
                    <span style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px; display: block;">Jika diubah ke Resign, karyawan tidak lagi dihitung sebagai beban aktif di cabang.</span>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                    <button type="button" id="mpm-modal-cancel" style="background: rgba(255,255,255,0.08); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 6px; font-size: 0.85rem; cursor: pointer;">
                        Batal
                    </button>
                    <button type="submit" style="background: linear-gradient(135deg, #a855f7, #7c3aed); color: white; border: none; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);">
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
    // SUB-TAB 3: SIMULATOR MUTASI (ZERO-COST REBALANCING)
    // =========================================================================
    function renderSimulatorSubTab(container) {
        // Find donor branches (Surplus) and recipient branches (Deficit)
        const donorList = capacityData.filter(c => c.status === 'LEBIH' || c.diff > 0);
        const recipientList = capacityData.filter(c => c.status === 'KURANG' || c.diff < 0);

        let selectedDonor = donorList[0] ? donorList[0].branch : (capacityData[0] ? capacityData[0].branch : '');
        let selectedRecipient = recipientList[0] ? recipientList[0].branch : (capacityData[1] ? capacityData[1].branch : '');
        let transferCount = 1;

        container.innerHTML = `
            <div style="margin: 15px 0 20px 0; background: rgba(30, 41, 59, 0.5); padding: 20px; border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <h3 style="color: #ffffff; margin: 0; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-scale-balanced" style="color: #c084fc;"></i>
                            Simulator Mutasi Taktis & Zero-Cost Rebalancing
                        </h3>
                        <p style="color: #94a3b8; font-size: 0.85rem; margin: 4px 0 0 0;">
                            Simulasikan pergeseran teknisi dari cabang donor (kelebihan) ke cabang kritis (kurang) tanpa menambah biaya gaji baru.
                        </p>
                    </div>
                </div>

                <!-- Simulation Inputs Form -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 25px;">
                    <!-- Cabang Asal (Donor) -->
                    <div style="background: rgba(15, 23, 42, 0.7); padding: 15px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.3);">
                        <label style="display: block; font-size: 0.8rem; color: #38bdf8; font-weight: 700; margin-bottom: 8px;">1. PILIH CABANG DONOR (SUMBER BANTUAN)</label>
                        <select id="sim-donor-select" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
                            ${capacityData.map(c => `<option value="${c.branch}" ${c.branch === selectedDonor ? 'selected' : ''}>${c.branch} (Riil: ${c.realTech}, Min: ${c.finalMinStaff}, ${c.status})</option>`).join('')}
                        </select>
                    </div>

                    <!-- Jumlah Teknisi -->
                    <div style="background: rgba(15, 23, 42, 0.7); padding: 15px; border-radius: 8px; border: 1px solid rgba(168, 85, 247, 0.3); text-align: center;">
                        <label style="display: block; font-size: 0.8rem; color: #c084fc; font-weight: 700; margin-bottom: 8px;">2. JUMLAH TEKNISI YANG DIPINDAHKAN</label>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 5px;">
                            <button id="sim-btn-minus" style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-weight: 700; cursor: pointer;">-</button>
                            <span id="sim-count-display" style="font-size: 1.6rem; font-weight: 800; color: #ffffff;">${transferCount}</span>
                            <button id="sim-btn-plus" style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-weight: 700; cursor: pointer;">+</button>
                        </div>
                    </div>

                    <!-- Cabang Tujuan (Penerima) -->
                    <div style="background: rgba(15, 23, 42, 0.7); padding: 15px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);">
                        <label style="display: block; font-size: 0.8rem; color: #f87171; font-weight: 700; margin-bottom: 8px;">3. PILIH CABANG PENERIMA (TARGET DEFISIT)</label>
                        <select id="sim-recipient-select" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;">
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
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <!-- Donor Card -->
                    <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 10px; padding: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                            <span style="font-weight: 700; color: #38bdf8; font-size: 1.1rem;">${dObj.branch} (Cabang Donor)</span>
                            <span style="font-size: 0.8rem; color: #94a3b8;">Beban: ${dObj.totalAdjust} Poin</span>
                        </div>
                        <div style="display: flex; justify-content: space-around; margin-top: 15px; text-align: center;">
                            <div>
                                <div style="font-size: 0.75rem; color: #94a3b8;">SEBELUM</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #ffffff;">${donorRealBefore} <span style="font-size: 0.8rem;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: #38bdf8;">Rasio: ${donorRatioBefore}</div>
                            </div>
                            <div style="display: flex; align-items: center; color: #c084fc; font-size: 1.5rem;">
                                <i class="fa-solid fa-arrow-right"></i>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; color: #34d399; font-weight: 700;">SETELAH PINDAH</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #34d399;">${donorRealAfter} <span style="font-size: 0.8rem;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: ${donorRatioAfter > 115 ? '#ef4444' : '#34d399'};">Rasio: ${donorRatioAfter}</div>
                            </div>
                        </div>
                        <div style="margin-top: 15px; font-size: 0.8rem; color: #cbd5e1; text-align: center; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 6px;">
                            Status Pasca Mutasi: <b>${donorRealAfter >= dObj.finalMinStaff ? 'AMAN / CUKUP' : 'DEFISIT (Tidak Disarankan)'}</b>
                        </div>
                    </div>

                    <!-- Recipient Card -->
                    <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 10px; padding: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                            <span style="font-weight: 700; color: #f87171; font-size: 1.1rem;">${rObj.branch} (Cabang Penerima)</span>
                            <span style="font-size: 0.8rem; color: #94a3b8;">Beban: ${rObj.totalAdjust} Poin</span>
                        </div>
                        <div style="display: flex; justify-content: space-around; margin-top: 15px; text-align: center;">
                            <div>
                                <div style="font-size: 0.75rem; color: #94a3b8;">SEBELUM</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #ffffff;">${recipRealBefore} <span style="font-size: 0.8rem;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: #f87171;">Rasio: ${recipRatioBefore}</div>
                            </div>
                            <div style="display: flex; align-items: center; color: #c084fc; font-size: 1.5rem;">
                                <i class="fa-solid fa-arrow-right"></i>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; color: #34d399; font-weight: 700;">SETELAH DIBANTU</div>
                                <div style="font-size: 1.4rem; font-weight: 800; color: #34d399;">${recipRealAfter} <span style="font-size: 0.8rem;">Org</span></div>
                                <div style="font-size: 0.85rem; font-weight: 700; color: ${recipRatioAfter <= 115 ? '#34d399' : '#fbbf24'};">Rasio: ${recipRatioAfter}</div>
                            </div>
                        </div>
                        <div style="margin-top: 15px; font-size: 0.8rem; color: #cbd5e1; text-align: center; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 6px;">
                            Status Pasca Mutasi: <b>${recipRealAfter >= rObj.finalMinStaff ? 'PULIH KE ZONA SEHAT (CUKUP)' : `DEFISIT BERKURANG (${recipRealAfter - rObj.finalMinStaff})`}</b>
                        </div>
                    </div>
                </div>

                <!-- Executive Justification Copy Button -->
                <div style="margin-top: 20px; text-align: center;">
                    <button id="btn-copy-sim-justification" style="background: linear-gradient(135deg, #a855f7, #6366f1); color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);">
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
            toast.style.background = '#a855f7';
            toast.style.color = 'white';
            toast.style.padding = '10px 18px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.4)';
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
