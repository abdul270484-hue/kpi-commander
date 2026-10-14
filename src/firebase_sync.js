// ==========================================
// FIREBASE CLOUD REALTIME SYNC & REMOTE RPA TRIGGER
// ==========================================

export function initFirebaseAutoSync(db) {
    if (!db) return;

    const syncStatusEl = document.getElementById('rpa-sync-status');
    const syncTimeEl = document.getElementById('rpa-sync-time');
    const btnTriggerRpa = document.getElementById('btn-trigger-rpa');

    console.log('🔄 Mengaktifkan sinkronisasi otomatis Firebase Firestore...');

    // 1. Subscribe to all 4 split dashboard docs and merge them into rawDashboardData
    let _mergedData = {};
    let _renderTimer = null;
    function _tryRender() {
        // Only render when at least the core doc has loaded
        if (_mergedData._coreLoaded) {
            if (_renderTimer) clearTimeout(_renderTimer);
            _renderTimer = setTimeout(() => {
                window.rawDashboardData = Object.assign({}, _mergedData);
                if (typeof window.applyDashboardFilterAndRender === 'function') {
                    window.applyDashboardFilterAndRender();
                }
            }, 300);
        }
    }

    db.collection('dashboard_data').doc('latest').onSnapshot((snap) => {
        if (snap.exists) {
            Object.assign(_mergedData, snap.data());
            _mergedData._coreLoaded = true;
            _tryRender();
        }
    });
    db.collection('dashboard_data').doc('latest_violations').onSnapshot((snap) => {
        if (snap.exists) { Object.assign(_mergedData, snap.data()); _tryRender(); }
    });
    db.collection('dashboard_data').doc('latest_eng').onSnapshot((snap) => {
        if (snap.exists) { Object.assign(_mergedData, snap.data()); _tryRender(); }
    });
    db.collection('dashboard_data').doc('latest_prod').onSnapshot((snap) => {
        if (snap.exists) { Object.assign(_mergedData, snap.data()); _tryRender(); }
    });
    db.collection('dashboard_data').doc('latest_parts_sales').onSnapshot((snap) => {
        if (snap.exists) { Object.assign(_mergedData, snap.data()); _tryRender(); }
    });
    db.collection('dashboard_data').doc('latest_so').onSnapshot((snap) => {
        if (snap.exists) {
            const soData = snap.data();
            if (soData && soData.soBillsByBranch) {
                _mergedData.soBillsByBranch = soData.soBillsByBranch;
                window.soBillsByBranchGlobal = soData.soBillsByBranch;
            }
            _tryRender();
        }
    });


    window.applyDashboardFilterAndRender = function() {
        if (!window.rawDashboardData) return;
        
        let data = JSON.parse(JSON.stringify(window.rawDashboardData));
        
        // --- COMPREHENSIVE AREA MANAGER FILTER ---
        if (window.currentUserBranches && window.currentUserBranches.length > 0) {
            const allowed = window.currentUserBranches;
            const ascMatch = (ascName) => {
                if (!ascName) return false;
                let upper = String(ascName).toUpperCase();
                return allowed.some(a => upper.includes(a));
            };

            if (Array.isArray(data.mpuList)) data.mpuList = data.mpuList.filter(s => ascMatch(s.asc || s.branch));
            if (Array.isArray(data.ubList)) data.ubList = data.ubList.filter(s => ascMatch(s.asc || s.branch));
            if (Array.isArray(data.shameList)) data.shameList = data.shameList.filter(s => ascMatch(s.asc || s.branch));
            if (Array.isArray(data.fameList)) data.fameList = data.fameList.filter(s => ascMatch(s.asc || s.branch));
            if (Array.isArray(data.redoItems)) data.redoItems = data.redoItems.filter(s => ascMatch(s.asc || s.branch));
            if (Array.isArray(data.dosaCabangOver7)) data.dosaCabangOver7 = data.dosaCabangOver7.filter(s => ascMatch(s.asc || s.branch));
            if (Array.isArray(data.partsSalesList)) data.partsSalesList = data.partsSalesList.filter(s => ascMatch(s.asc || s.branch));
            
            const filterObj = (obj) => {
                if (!obj) return obj;
                let newObj = {};
                for (let k in obj) if (ascMatch(k)) newObj[k] = obj[k];
                return newObj;
            };
            data.rcStats = filterObj(data.rcStats);
            data.branchStats = filterObj(data.branchStats);
            data.dosaCabangStats = filterObj(data.dosaCabangStats);
            data.dtsMxData = filterObj(data.dtsMxData);
            data.dtsIhData = filterObj(data.dtsIhData);
            data.gdDailyData = filterObj(data.gdDailyData);
            data.partsDailyData = filterObj(data.partsDailyData);
            data.soBillsByBranch = filterObj(data.soBillsByBranch);

            if (data.gdTrendData) {
                let newGd = {};
                for (let m in data.gdTrendData) {
                    newGd[m] = {};
                    for (let b in data.gdTrendData[m]) {
                        if (ascMatch(b)) newGd[m][b] = data.gdTrendData[m][b];
                    }
                }
                data.gdTrendData = newGd;
            }

            if (data.volInTrendData) {
                let newVolIn = {};
                for (let m in data.volInTrendData) {
                    newVolIn[m] = {};
                    for (let b in data.volInTrendData[m]) {
                        if (ascMatch(b)) newVolIn[m][b] = data.volInTrendData[m][b];
                    }
                }
                data.volInTrendData = newVolIn;
            }

            // Recalculate summary metrics for filtered branches
            let fTotal = 0, fLtp = 0, fExLtp = 0, fX09 = 0;
            for (let b in data.branchStats) {
                const bs = data.branchStats[b] || {};
                fTotal += (bs.total || 0);
                fLtp += (bs.ltp || 0);
                fExLtp += (bs.exLtp || 0);
                fX09 += (bs.x09 || 0);
            }
            const fMpu = Array.isArray(data.mpuList) ? data.mpuList.length : 0;
            const fUb = Array.isArray(data.ubList) ? data.ubList.length : 0;
            const fRedo = Array.isArray(data.redoItems) ? data.redoItems.length : (Array.isArray(data.redoList) ? data.redoList.length : 0);
            data.summary = Object.assign({}, data.summary || {}, {
                total: fTotal,
                ltp: fLtp,
                exLtp: fExLtp,
                mpuViolations: fMpu,
                ubViolations: fUb,
                x09Violations: fX09,
                redoCount: fRedo
            });
        }
        
        const syncStatusEl = document.getElementById('sync-status');
        const syncTimeEl = document.getElementById('sync-time');
        
        if (syncStatusEl) {
            syncStatusEl.style.display = 'inline-flex';
            syncStatusEl.classList.remove('hidden');
        }
        if (syncTimeEl && data.lastUpdated) {
            syncTimeEl.innerText = `${data.lastUpdated} (${data.scheduleSlot || 'AUTO'})`;
        }

        if (data.engineerStats) {
            window.prodData = data.engineerStats;
            window.engineerData = data.engineerStats;
        }
        if (data.dtsMxData) window.dtsMxData = data.dtsMxData;
        if (data.dtsIhData) window.dtsIhData = data.dtsIhData;
        if (data.dosaCabangOver7) window.dosaCabangData = data.dosaCabangOver7;
        if (data.dosaCabangStats) window.dosaCabangStatsGlobal = data.dosaCabangStats;
        if (data.rcStats) window.rcData = data.rcStats;
        if (data.shameList) window.shameData = data.shameList;
        if (data.mpuList) window.mpuData = data.mpuList;
        if (data.ubList) window.ubData = data.ubList;
        if (data.redoList) window.redoList = data.redoList;
        if (data.summary) window.dashboardSummary = data.summary;
        if (data.soBillsByBranch) {
            window.soBillsByBranchGlobal = data.soBillsByBranch;
            if (data.branchStats) {
                for (let b in data.branchStats) {
                    if (data.soBillsByBranch[b]) {
                        if (!data.branchStats[b].bills) data.branchStats[b].bills = {};
                        data.branchStats[b].bills.total = data.soBillsByBranch[b];
                    }
                }
            }
        }
        if (data.branchStats) window.branchData = data.branchStats;
        if (data.rcStats) window.rcData = data.rcStats;
        if (data.unknownModels) window.unknownModels = data.unknownModels;
        if (data.unknownReasons) window.unknownReasons = data.unknownReasons;
        if (typeof window.renderUnmappedSuggestions === 'function') {
            window.renderUnmappedSuggestions();
        }

        const renderData = () => {
            if (data.summary && typeof window.updateUI === 'function') {
                try {
                window.updateUI(
                    data.summary,
                    data.mpuList || [],
                    data.ubList || [],
                    data.branchStats || {},
                    data.shameList || [],
                    data.rcStats || {}
                );
                if (data.redoList && typeof window.renderRedoTable === 'function') {
                    window.renderRedoTable();
                } else if (data.redoItems && typeof window.renderRedoTable === 'function') {
                    window.renderRedoTable();
                }
                if (data.fameList && typeof window.renderFameTable === 'function') {
                    window.renderFameTable(data.fameList);
                }
                if (data.gdTrendData && typeof window.renderGdTrendChart === 'function') {
                    window.renderGdTrendChart(data.gdTrendData);
                }
                if (data.gdDailyData && typeof window.renderGdDailyTable === 'function') {
                    window.renderGdDailyTable(data.gdDailyData);
                }
                window.partsDailyDataGlobal = data.partsDailyData || {};
                window.partsSalesListGlobal = data.partsSalesList || [];
                if (typeof window.renderPartsSalesTable === 'function') {
                    window.renderPartsSalesTable(data.partsDailyData || {});
                }
                if (typeof window.renderVolInVsGdTable === 'function') {
                    window.renderVolInVsGdTable(data.volInTrendData || {}, data.gdTrendData || {});
                }
                if (typeof window.renderExecutiveSummaryTable === 'function') {
                    window.renderExecutiveSummaryTable();
                }
                } catch (err) {
                    console.error('Error in updateUI:', err);
                    const loadingOverlay = document.getElementById('loading-overlay');
                    const emptyState = document.getElementById('empty-state');
                    const dashboardContent = document.getElementById('dashboard-content');
                    if (loadingOverlay) loadingOverlay.classList.add('hidden');
                    if (emptyState) emptyState.classList.add('hidden');
                    if (dashboardContent) dashboardContent.classList.remove('hidden');
                }
            } else {
                setTimeout(renderData, 250);
            }
        };

        renderData();
    };

    // 2. Wire 'Fetch GSPN Now' Remote Button Click
    if (btnTriggerRpa) {
        btnTriggerRpa.addEventListener('click', async () => {
            try {
                btnTriggerRpa.disabled = true;
                btnTriggerRpa.innerHTML = '<i class="fa-solid fa-robot fa-bounce"></i> Running Bot...';

                // Try Direct Super Engine API first for instant local trigger
                fetch('http://127.0.0.1:3001/api/trigger-rpa', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot: 'WEB_DASHBOARD' })
                }).catch(() => {});

                // Also publish to Firestore trigger doc
                await db.collection('rpa_commands').doc('trigger').set({
                    command: 'RUN_NOW',
                    status: 'PENDING',
                    requestedAt: Date.now(),
                    slot: 'WEB_DASHBOARD',
                    requestedBy: (window.firebase && window.firebase.auth().currentUser ? window.firebase.auth().currentUser.email : 'Web User')
                }, { merge: true }).catch(() => {});

                if (window.showToastNotification) {
                    window.showToastNotification('⚡ Playwright GSPN Bot has started running!');
                }
            } catch (err) {
                console.error('Failed to send RPA command:', err);
                btnTriggerRpa.disabled = false;
                btnTriggerRpa.innerHTML = '<i class="fa-solid fa-bolt"></i> Fetch GSPN Now';
                if (window.showToastNotification) {
                    window.showToastNotification('❌ Failed to send command: ' + err.message);
                }
            }
        });

        // 3. Listen to live RPA execution status from Robot
        db.collection('rpa_commands').doc('trigger')
            .onSnapshot((snap) => {
                if (snap.exists) {
                    const statusData = snap.data();
                    if (statusData.status === 'RUNNING' || statusData.status === 'PENDING') {
                        btnTriggerRpa.disabled = true;
                        btnTriggerRpa.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                        btnTriggerRpa.style.minWidth = '260px';
                        btnTriggerRpa.style.flexDirection = 'column';
                        btnTriggerRpa.style.gap = '4px';
                        btnTriggerRpa.style.padding = '6px 14px';

                        const pct   = statusData.progressPct   || 0;
                        const cur   = statusData.progressCurrent || 0;
                        const tot   = statusData.progressTotal   || 0;
                        const prog  = statusData.status === 'PENDING'
                            ? '📡 Connecting to Bot...'
                            : (statusData.progress || 'Fetching GSPN Data...');

                        const barInner = tot > 0
                            ? `<div style="width:100%;background:rgba(0,0,0,0.2);border-radius:4px;height:5px;margin-top:3px;">
                                 <div style="width:${pct}%;background:#fff;border-radius:4px;height:5px;transition:width 0.4s;"></div>
                               </div>`
                            : '';

                        const label = tot > 0
                            ? `<span style="font-size:0.75rem;opacity:0.9;">${cur}/${tot} branches (${pct}%)</span>`
                            : '';

                        btnTriggerRpa.innerHTML = `
                            <div style="display:flex;align-items:center;gap:6px;">
                                <i class="fa-solid fa-robot fa-bounce"></i>
                                <span style="font-size:0.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">${prog}</span>
                            </div>
                            ${label}
                            ${barInner}
                        `;
                    } else if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED' || statusData.status === 'IDLE' || !statusData.status) {
                        btnTriggerRpa.disabled = false;
                        btnTriggerRpa.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                        btnTriggerRpa.style.minWidth = '';
                        btnTriggerRpa.style.flexDirection = '';
                        btnTriggerRpa.style.gap = '8px';
                        btnTriggerRpa.style.padding = '8px 16px';
                        btnTriggerRpa.innerHTML = '<i class="fa-solid fa-bolt"></i> Tarik GSPN Sekarang';
                    }
                }
            });
    }
}
