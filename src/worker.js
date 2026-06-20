import { 
    getCategory, parseExcelDate, isDateToday,
    isExpensivePart, isReasonMatched, SEIN_REASONS, AGING_REASONS 
} from './analytics.js';
import { shortenASC } from './config.js';

self.onmessage = function(e) {
    const { type, data, customModels, customReasons } = e.data;
    
    if (type === 'ANALYZE_DATA') {
        try {
            const result = performAnalysis(data, customModels, customReasons);
            self.postMessage({ type: 'ANALYZE_DONE', payload: result });
        } catch (error) {
            self.postMessage({ type: 'ANALYZE_ERROR', error: error.message });
        }
    } else if (type === 'ANALYZE_PRODUCTIVITY') {
        try {
            const result = analyzeProductivity(data);
            self.postMessage({ type: 'PRODUCTIVITY_DONE', payload: result });
        } catch (error) {
            self.postMessage({ type: 'ANALYZE_ERROR', error: error.message });
        }
    }
};

function analyzeProductivity(data) {
    let prodStats = {};
    let uniqueWorkingDays = new Set();
    
    // Step 0: Find dynamic column indices
    let col = {
        date: 4, branch: 5, eng: 7, labIW: 10, labOOW: 16
    };
    
    // Check first 3 rows for headers
    for (let i = 0; i < 3 && i < data.length; i++) {
        const r = data[i];
        if (!r) continue;
        let foundAny = false;
        for (let j = 0; j < r.length; j++) {
            const h = String(r[j]).trim().toLowerCase();
            if (!h) continue;
            if (h.includes('complete date') || h === 'date') { col.date = j; foundAny = true; }
            if (h.includes('asc name') || h === 'asc') { col.branch = j; foundAny = true; }
            if (h.includes('engineer')) { col.eng = j; foundAny = true; }
            // Labor columns can be tricky, if we find 'labor' we can guess. But usually IW is first labor col.
            if (h === 'labor' || h.includes('labor iw') || h.includes('iw labor')) { 
                if (!foundAny || col.labIW === 10) { col.labIW = j; foundAny = true; }
            }
        }
        if (foundAny) break;
    }

    // Step 0.5: Detect Date Format for strings
    let formatHint = 'MM/DD/YYYY'; // Default to MM/DD/YYYY
    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[col.date]) continue;
        if (typeof row[col.date] === 'string') {
            const parts = row[col.date].split(/[-/ :.]/);
            if (parts.length >= 3) {
                const p0 = parseInt(parts[0], 10);
                const p1 = parseInt(parts[1], 10);
                if (p0 > 12) {
                    formatHint = 'DD/MM/YYYY';
                    break;
                } else if (p1 > 12) {
                    formatHint = 'MM/DD/YYYY';
                    break;
                }
            }
        }
    }
    
    // Step 1: Find the most recent date in the dataset to act as the "Current Month" reference
    let maxDate = 0;
    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0 || !row[0]) continue;
        const gdDate = row[col.date];
        if (!gdDate) continue;
        const parsedGdDate = parseExcelDate(gdDate, formatHint);
        if (parsedGdDate && !isNaN(parsedGdDate.getTime())) {
            if (parsedGdDate.getTime() > maxDate) {
                maxDate = parsedGdDate.getTime();
            }
        }
    }
    
    const reportDate = maxDate > 0 ? new Date(maxDate) : new Date();
    const currMonth = reportDate.getMonth();
    const currYear = reportDate.getFullYear();
    
    let prevMonth = currMonth - 1;
    let prevYear = currYear;
    if (prevMonth < 0) {
        prevMonth = 11;
        prevYear--;
    }

    // Step 2: Calculate stats
    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0 || !row[0]) continue;
        
        const gdDate = row[col.date];
        if (!gdDate) continue;
        
        const branch = shortenASC(row[col.branch]);
        let engName = row[col.eng] ? String(row[col.eng]).trim().toUpperCase() : null;
        if (!engName) continue;
        
        const laborIWStr = row[col.labIW] || "0";
        const laborOOWStr = row[col.labOOW] || "0";
        const laborIW = parseFloat(String(laborIWStr).replace(/,/g, '')) || 0;
        const laborOOW = parseFloat(String(laborOOWStr).replace(/,/g, '')) || 0;
        
        if (!prodStats[engName]) prodStats[engName] = { 
            asc: branch, gdCount: 0, gdPrevMonth: 0, gdRepair: 0, gdCancel: 0, 
            laborIW: 0, laborOOW: 0, dtsGd: 0, dtsIhGdVisits: 0, dtsIhTotalVisits: 0, 
            visitedJobs: new Set(), visitedGdJobs: new Set() 
        };
        
        const parsedGdDate = parseExcelDate(gdDate, formatHint);
        if (!parsedGdDate || isNaN(parsedGdDate.getTime())) continue;

        const gdMonth = parsedGdDate.getMonth();
        const gdYear = parsedGdDate.getFullYear();

        let prodJobNo = null;
        for (let j = 0; j < 5; j++) {
            if (row[j] && String(row[j]).startsWith('4') && String(row[j]).length === 10) {
                prodJobNo = String(row[j]);
                break;
            }
        }

        if (gdMonth === prevMonth && gdYear === prevYear) {
            prodStats[engName].gdPrevMonth++;
            continue; // Stop processing this row for current month stats
        }

        if (gdMonth !== currMonth || gdYear !== currYear) {
            continue; // Ignore data from other months entirely
        }

        // --- HANYA UNTUK BULAN INI ---
        uniqueWorkingDays.add(gdDate);
        
        prodStats[engName].gdCount++;
        
        prodStats[engName].laborIW += laborIW;
        prodStats[engName].laborOOW += laborOOW;
        
        if (laborIW > 0) prodStats[engName].gdRepair++;
        else if (laborOOW > 0 && laborOOW < 100000) prodStats[engName].gdCancel++;
        else prodStats[engName].gdRepair++;
        
        if (isDateToday(gdDate, formatHint)) {
            prodStats[engName].dtsGd++;
            
            if (!prodJobNo || !prodStats[engName].visitedJobs.has(prodJobNo)) {
                prodStats[engName].dtsIhGdVisits++;
                prodStats[engName].dtsIhTotalVisits++;
                if (prodJobNo) prodStats[engName].visitedJobs.add(prodJobNo);
            }
        }
    }
    
    let workingDaysCount = Math.max(1, uniqueWorkingDays.size);
    let fameList = Object.keys(prodStats).map(eng => {
        let avgGd = (prodStats[eng].gdCount / workingDaysCount).toFixed(1);
        return { engineer: eng, resolvedBranch: prodStats[eng].asc, avgGd: avgGd, ...prodStats[eng] };
    });
    
    fameList.sort((a, b) => {
        let cmp = a.resolvedBranch.localeCompare(b.resolvedBranch);
        if (cmp !== 0) return cmp;
        return b.gdCount - a.gdCount;
    });
    
    return fameList;
}

function performAnalysis(data, customModels, customReasons) {
    let stats = {
        total: data.length, ltp: 0, exLtp: 0, mpuViolations: 0, x09Violations: 0, ubViolations: 0,
        breakdownLtp: { MX: 0, VD: 0, DA: 0 },
        breakdownExLtp: { MX: 0, VD: 0, DA: 0 },
        totalCat: { MX: 0, VD: 0, DA: 0 },
        responsibility: { AGING: 0, SEIN: 0, OTHER: 0 }
    };
    
    let mpuList = [], x09List = [], ubList = [], dosaCabangOver7 = [];
    let unknownModels = new Set(), unknownReasons = new Set();
    let branchStats = {}, engineerStats = {}, rcStats = {};
    let dtsMxData = {}, dtsIhData = {};

    const customSeinKws = customReasons.filter(r => r.category === 'SEIN').map(r => r.keyword);
    const customAgingKws = customReasons.filter(r => r.category === 'AGING').map(r => r.keyword);

    data.forEach(row => {
        const model = row['Model'];
        let category = getCategory(model, customModels);
        
        if (category === 'UNKNOWN') {
            if (model) unknownModels.add(model);
            category = 'MX'; 
        }
        
        let warranty = row['In Out Warranty Flag'] || '';
        if (typeof warranty === 'string') warranty = warranty.trim().toUpperCase();
        const isIW = (warranty === 'IW' || warranty === 'LP' || warranty === 'L');

        if (isIW) stats.totalCat[category]++;
        
        const status = row['Status'] || '';
        const reason = row['Reason'] || '';
        const agingDaysStr = row['Pending aging Days'];
        let agingDays = agingDaysStr ? parseInt(agingDaysStr) : 0;
        
        if (status === 'Repair Completed' || status.includes('Completed')) {
            const reqDateVal = row['Request Date'];
            const rcDateVal = row['Repair Completed']; 
            if (reqDateVal && rcDateVal) {
                let reqDateObj = parseExcelDate(reqDateVal);
                let rcDateObj = parseExcelDate(rcDateVal);
                if (reqDateObj && rcDateObj && !isNaN(reqDateObj.getTime()) && !isNaN(rcDateObj.getTime())) {
                    const reqMidnight = new Date(reqDateObj.getFullYear(), reqDateObj.getMonth(), reqDateObj.getDate());
                    const rcMidnight = new Date(rcDateObj.getFullYear(), rcDateObj.getMonth(), rcDateObj.getDate());
                    const diffTime = rcMidnight.getTime() - reqMidnight.getTime();
                    agingDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                }
            }
        }
        
        let ascName = shortenASC(row['ASC Name']);
        const jobNo = row['ASC Job No'] || row['Service Order No.'] || 'N/A';
        const repairCode = row['Repair Code'] || '';
        let engineer = row['Engineer Name'] ? row['Engineer Name'].toString().trim().toUpperCase() : 'UNKNOWN ENGINEER';
        
        if (engineer === 'MOHHAMAT BAGAS DWI PRAYOGO') ascName = 'DPG';
        else if (engineer === 'SATRIA EKA ADITA' || engineer === 'SANI LASARO') ascName = 'DCW';
        
        if (status.includes('Assigned to Service Center') || status.includes('Acknowledge')) {
            engineer = `PIC ${ascName}`;
        } else if (reason && (reason.trim().toUpperCase() === 'WAITING FOR CONFIRMATION FROM SAMSUNG' || reason.trim().toUpperCase() === 'PROCESSING EXCHANGE')) {
            engineer = `PIC ${ascName}`;
        }

        if (!branchStats[ascName]) {
            branchStats[ascName] = { 
                total: 0, ltp: 0, exLtp: 0, mpu: 0, x09: 0, ub: 0,
                bills: { total: [], ltp: [], exLtp: [], mpu: [], x09: [], ub: [] }
            };
        }
        
        let customerName = 'Unknown Customer';
        for (let key in row) {
            let k = key.toLowerCase().trim();
            if (k === 'customer name' || k === 'nama konsumen' || k === 'customer' || k === 'cust name' || k === 'cust. name' || k === 'nama pelanggan' || k === 'konsumen' || k === 'unit location' || k === 'customer_name') {
                if (row[key] && row[key].toString().trim() !== '') {
                    customerName = row[key];
                    break;
                }
            }
        }
        
        let defectDesc = row['Defect Description'] || row['Symptom'] || '-';
        
        const billInfo = { jobNo, model, customer: customerName, pendingDays: agingDays, reason: reason, category: category, engineer: engineer, defect: defectDesc, status: status };
        
        branchStats[ascName].total++;
        branchStats[ascName].bills.total.push(billInfo);
        
        if (status === 'Repair Completed' || status.includes('Completed')) {
            let rcPendingDays = agingDays;
            const rcBillInfo = { ...billInfo, pendingDays: rcPendingDays };
            if (!rcStats[ascName]) rcStats[ascName] = { count: 0, bills: [] };
            rcStats[ascName].count++;
            rcStats[ascName].bills.push(rcBillInfo);
        }

        if (!engineerStats[engineer]) {
            engineerStats[engineer] = { asc: ascName, mxAging: 0, vdAging: 0, daAging: 0, bills: [] };
        }

        let partsUsedCount = 0;
        let expensivePartsFound = [];
        let hasOcta = false;
        let ubPartsFound = [];
        
        for (let i = 1; i <= 10; i++) {
            let descKey = `Parts description ${i.toString().padStart(2, '0')}`;
            let noKey = `Parts No ${i.toString().padStart(2, '0')}`;
            let partDesc = row[descKey];
            let partNo = row[noKey] || partDesc; 
            
            if (partDesc) {
                partsUsedCount++;
                if (isExpensivePart(partDesc, category) && !expensivePartsFound.includes(partNo)) {
                    expensivePartsFound.push(partNo);
                }
                if (String(partDesc).toUpperCase().includes('OCTA')) {
                    hasOcta = true;
                    if (!ubPartsFound.includes(partNo)) ubPartsFound.push(partNo);
                }
            }
        }

        if (repairCode.includes('X09') && partsUsedCount > 0 && (status === 'Repair Completed' || status.includes('Completed'))) {
            stats.x09Violations++;
            branchStats[ascName].x09++;
            branchStats[ascName].bills.x09.push(billInfo);
            x09List.push({ jobNo, asc: ascName, engineer, model, partsCount: partsUsedCount });
        }

        let isAging = false;
        let isSein = false;
        
        if (status === 'Engineer Assigned' || status.includes('Assigned to Service Center') || status.includes('Acknowledge')) {
            isAging = true; 
            stats.responsibility.AGING++;
        } else if (status === 'Pending' || status === 'Repair Completed' || status.includes('Completed')) {
            if (isReasonMatched(reason, SEIN_REASONS, customSeinKws)) {
                isSein = true;
                stats.responsibility.SEIN++;
            } else if (isReasonMatched(reason, AGING_REASONS, customAgingKws)) {
                isAging = true;
                stats.responsibility.AGING++;
            } else {
                if (status === 'Pending') {
                    if (reason && reason.trim() !== '') unknownReasons.add(reason);
                    stats.responsibility.OTHER++;
                }
            }
        }
        
        if (isAging) {
            engineerStats[engineer].bills.push(billInfo);
            if (category === 'MX') engineerStats[engineer].mxAging++;
            else if (category === 'VD') engineerStats[engineer].vdAging++;
            else if (category === 'DA') engineerStats[engineer].daAging++;
            
            if (agingDays > 7) {
                dosaCabangOver7.push({ ...billInfo, asc: ascName });
            }
        }

        // DTS Logic MX
        if (category === 'MX' && !engineer.startsWith('PIC ')) {
            if (!dtsMxData[engineer]) {
                dtsMxData[engineer] = { volIn: 0, rc: 0, gd: 0, aging: 0, cust: 0, sein: 0, name: engineer, asc: ascName };
            }
            if (isDateToday(row['Request Date'])) dtsMxData[engineer].volIn++;
            if ((status === 'Repair Completed' || status.includes('Completed')) && isDateToday(row['Repair Completed'])) dtsMxData[engineer].rc++;
            if (reason === 'Re-scheduling by Customer' || reason === 'Waiting for confirmation from customer') dtsMxData[engineer].cust++;
            if (isSein) dtsMxData[engineer].sein++;
            if (isAging && reason !== 'Re-scheduling by Customer' && reason !== 'Waiting for confirmation from customer') dtsMxData[engineer].aging++;
        }

        // DTS Logic IH
        if ((category === 'VD' || category === 'DA') && !engineer.startsWith('PIC ')) {
            if (!dtsIhData[engineer]) {
                dtsIhData[engineer] = { name: engineer, asc: ascName, totalVisits: 0, rcVisits: 0, gdVisits: 0, pendingVisits: 0, totalAging: 0, _visitedJobs: new Set() };
            }
            if (isAging) dtsIhData[engineer].totalAging++;
            
            let isVisitedToday = false;
            let changeDateVal = null;
            for (let key in row) {
                let k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (k === 'changedate') { changeDateVal = row[key]; break; }
            }
            if (isDateToday(changeDateVal)) {
                const upperReason = reason.trim().toUpperCase();
                const pendingReasons = ['PARTS NOT AVAILABLE (ASC)', 'PARTS IN TRANSIT (SAMSUNG)', 'PARTS ALLOCATED(SAMSUNG)', 'PARTS P/O CANCELLATION', 'PARTS DNA/SNA (ASC)', 'PARTS BACK ORDERED (SAMSUNG)', 'MONITORING/AGING OR NOT REPRODUCED'];
                if (pendingReasons.includes(upperReason)) {
                    isVisitedToday = true;
                    if (!dtsIhData[engineer]._visitedJobs.has(jobNo)) dtsIhData[engineer].pendingVisits++;
                }
            }
            if ((status === 'Repair Completed' || status.includes('Completed')) && isDateToday(row['Repair Completed'])) {
                isVisitedToday = true;
                if (!dtsIhData[engineer]._visitedJobs.has(jobNo)) dtsIhData[engineer].rcVisits++;
            }
            if (isVisitedToday && !dtsIhData[engineer]._visitedJobs.has(jobNo)) {
                dtsIhData[engineer].totalVisits++;
                dtsIhData[engineer]._visitedJobs.add(jobNo);
            }
        }

        let serviceType = (row['Service Type'] || '').toString().trim().toUpperCase();
        let isValidServiceType = ['CI', 'IH', 'AD', 'PS'].includes(serviceType);
        
        if (isAging && agingDays > 0 && isIW && isValidServiceType) {
            let isLtp = false;
            let isExLtp = false;

            if (category === 'MX') {
                if (agingDays >= 7) isExLtp = true;
                else if (agingDays >= 3) isLtp = true;
            } else if (category === 'VD') {
                if (agingDays >= 14) isExLtp = true;
                else if (agingDays >= 7) isLtp = true;
            } else if (category === 'DA') {
                if (agingDays >= 14) isExLtp = true;
                else if (agingDays >= 5) isLtp = true;
            }

            if (isExLtp) {
                stats.exLtp++; stats.breakdownExLtp[category]++;
                branchStats[ascName].exLtp++; branchStats[ascName].bills.exLtp.push(billInfo);
            } else if (isLtp) {
                stats.ltp++; stats.breakdownLtp[category]++;
                branchStats[ascName].ltp++; branchStats[ascName].bills.ltp.push(billInfo);
            }
        }

        if (isIW) {
            if (expensivePartsFound.length > 1) {
                stats.mpuViolations++; branchStats[ascName].mpu++; branchStats[ascName].bills.mpu.push(billInfo);
                mpuList.push({ jobNo, asc: ascName, model, parts: expensivePartsFound.join(" + "), category, status, engineer });
            }
            if (model && String(model).toUpperCase().startsWith('SM-F') && hasOcta) {
                stats.ubViolations++; branchStats[ascName].ub++; branchStats[ascName].bills.ub.push(billInfo);
                ubList.push({ jobNo, asc: ascName, model, parts: ubPartsFound.join(" + "), status, engineer });
            }
        }
    });

    let shameList = [];
    for (let eng in engineerStats) {
        let es = engineerStats[eng];
        let totalDosa = es.mxAging + es.vdAging + es.daAging;
        if (totalDosa > 0) {
            shameList.push({ engineer: eng, asc: es.asc, count: totalDosa, detail: `MX:${es.mxAging} VD:${es.vdAging} DA:${es.daAging}` });
        }
    }
    shameList.sort((a, b) => a.asc.localeCompare(b.asc));

    dosaCabangOver7.sort((a, b) => {
        if (b.pendingDays !== a.pendingDays) return b.pendingDays - a.pendingDays;
        return a.asc.localeCompare(b.asc);
    });

    let dosaCabangStats = {};
    dosaCabangOver7.forEach(item => {
        const asc = item.asc;
        if (!dosaCabangStats[asc]) dosaCabangStats[asc] = { count: 0, bills: [] };
        dosaCabangStats[asc].count++;
        dosaCabangStats[asc].bills.push(item);
    });

    return {
        stats,
        mpuList,
        ubList,
        x09List,
        branchStats,
        shameList,
        rcStats,
        dosaCabangOver7,
        dosaCabangStats,
        engineerStats,
        dtsMxData,
        dtsIhData,
        unknownModels: Array.from(unknownModels),
        unknownReasons: Array.from(unknownReasons)
    };
}
