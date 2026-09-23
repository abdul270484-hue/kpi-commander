const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, collection } = require('firebase/firestore');
const config = require('./config');

// Initialize Firebase App, Auth & Firestore
const firebaseApp = initializeApp(config.FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let authPromise = null;
function ensureFirebaseAuth() {
    if (!authPromise) {
        authPromise = signInAnonymously(auth).then(cred => {
            console.log('  🔐 Firebase Auth Active:', cred.user.uid);
            return cred;
        }).catch(err => {
            console.warn('  ⚠️ Firebase Auth warning:', err.message);
        });
    }
    return authPromise;
}

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const { trackAgingStates } = require('./aging_tracker');

const DEFAULT_CUSTOM_MODELS = [
    { keyword: 'SM-', category: 'MX' },
    { keyword: 'GT-', category: 'MX' },
    { keyword: 'SGH-', category: 'MX' },
    { keyword: 'SCH-', category: 'MX' },
    { keyword: 'SPH-', category: 'MX' },
    { keyword: 'SHW-', category: 'MX' },
    { keyword: 'SG-', category: 'MX' },
    { keyword: 'EJ-', category: 'MX' },
    { keyword: 'EP-', category: 'MX' },
    { keyword: 'EE-', category: 'MX' },
    { keyword: 'GH', category: 'MX' },
    { keyword: 'UA', category: 'VD' },
    { keyword: 'QA', category: 'VD' },
    { keyword: 'QN', category: 'VD' },
    { keyword: 'UN', category: 'VD' },
    { keyword: 'LA', category: 'VD' },
    { keyword: 'VG', category: 'VD' },
    { keyword: 'HG', category: 'VD' },
    { keyword: 'LS', category: 'VD' },
    { keyword: 'SP', category: 'VD' },
    { keyword: 'HW', category: 'VD' },
    { keyword: 'RT', category: 'DA' },
    { keyword: 'RS', category: 'DA' },
    { keyword: 'RF', category: 'DA' },
    { keyword: 'RB', category: 'DA' },
    { keyword: 'RR', category: 'DA' },
    { keyword: 'RZ', category: 'DA' },
    { keyword: 'WW', category: 'DA' },
    { keyword: 'WA', category: 'DA' },
    { keyword: 'WD', category: 'DA' },
    { keyword: 'WF', category: 'DA' },
    { keyword: 'DV', category: 'DA' },
    { keyword: 'DF', category: 'DA' },
    { keyword: 'AR', category: 'DA' },
    { keyword: 'AQ', category: 'DA' },
    { keyword: 'AF', category: 'DA' },
    { keyword: 'AC', category: 'DA' },
    { keyword: 'AJ', category: 'DA' },
    { keyword: 'AM', category: 'DA' },
    { keyword: 'AP', category: 'DA' },
    { keyword: 'AX', category: 'DA' },
    { keyword: 'MS', category: 'DA' },
    { keyword: 'ME', category: 'DA' },
    { keyword: 'MG', category: 'DA' },
    { keyword: 'MC', category: 'DA' },
    { keyword: 'MW', category: 'DA' },
    { keyword: 'VC', category: 'DA' },
    { keyword: 'VR', category: 'DA' },
    { keyword: 'VS', category: 'DA' },
    { keyword: 'VW', category: 'DA' },
    { keyword: 'SS', category: 'DA' },
    { keyword: 'VP', category: 'DA' },
    { keyword: 'NZ', category: 'DA' },
    { keyword: 'NA', category: 'DA' }
];

const SEIN_REASONS = [
    'PARTS BACK ORDERED (SAMSUNG)',
    'PARTS IN TRANSIT (SAMSUNG)',
    'PARTS NOT AVAILABLE (ASC)',
    'PARTS DNA/SNA (ASC)',
    'PARTS P/O CANCELLATION',
    'PARTS ALLOCATED(SAMSUNG)',
    'WAITING FOR SAMSUNG CONFIRMATION',
    'WAITING CONFIRMATION FROM SAMSUNG',
    'APPROVAL PENDING',
    'WAITING FOR APPROVAL',
    'SPECIAL APPROVAL',
    'TECHNICAL SUPPORT',
    'SWAP REPAIR',
    'PROCESSING EXCHANGE',
    'SET EXCHANGE',
    'CREDIT REQUEST'
];

const AGING_REASONS = [
    'MONITORING/AGING OR NOT REPRODUCED',
    'RE-SCHEDULING BY ENG\'R OR ASC',
    'RE-SCHEDULING BY CUSTOMER',
    'WAITING FOR CONFIRMATION FROM CUSTOMER',
    'REPAIR IN PROGRESS AFTER PARTS RECEIVE',
    'WAITING FOR CONFIRMATION FROM SAMSUNG',
    'PROCESSING EXCHANGE',
    'PARTS ARRIVED BUT NO G/R YET(ASC)',
    'REQUEST TECH SUPPORT (TECHNICAL PROBLEM)',
    'PARTS ARRIVED',
    'PARTS AVAILABLE (ASC)',
    'PARTS ALLOCATED (ASC)',
    'ASSIGNED TO ENGINEER',
    'WAITING FOR QUOTATION CONFIRMATION FROM CUSTOMER',
    'WAITING FOR PAYMENT',
    'REPAIR IN PROGRESS',
    'REPAIR DELAYED',
    'TRANSPORTATION',
    'OTHERS (ASC)',
    'OTHERS'
];

function shortenASC(ascName, row = null, engineerName = null) {
    if (!ascName && !row) return 'Unknown ASC';

    // 1. Check Collection Center Name if row is provided (for splitting Cellular World & Planet Gadget from Denpasar)
    if (row && typeof row === 'object' && !Array.isArray(row)) {
        let ccName = '';
        for (let key in row) {
            let k = key.toLowerCase().replace(/[^a-z]/g, '');
            if (k.includes('collectioncenter') || k === 'ccname' || k === 'collectioncentername') {
                if (k.includes('name') || k === 'collectioncenter' || k === 'ccname') {
                    ccName = String(row[key] || '').toUpperCase().trim();
                    if (ccName && ccName !== 'NONE') break;
                }
            }
        }
        if (ccName.includes('CELLULAR WORLD') || ccName.includes('TEUKU')) {
            return 'DENPASAR - CELLULAR WORLD';
        }
        if (ccName.includes('PLANET GADGET') || ccName.includes('GATOT')) {
            return 'DENPASAR - PLANET GADGET';
        }
    }

    let name = String(ascName || '').trim();
    // Normalize known prefixes / wrappers
    name = name.replace(/PT\.?\s*BEKARYA\s+UGERTAMA\s+JAYA\s+MANDIRI\s*/gi, '')
               .replace(/SAMSUNG\s+SERVICE\s+CENTER\s*/gi, '')
               .replace(/UNICOM\s*/gi, '')
               .trim();

    const u = name.toUpperCase();
    let result = name || ascName || 'Unknown ASC';
    
    if (u.includes('CELLULAR WORLD') || u.includes('TEUKU')) result = 'DENPASAR - CELLULAR WORLD';
    else if (u.includes('PLANET GADGET') || u.includes('GATOT')) result = 'DENPASAR - PLANET GADGET';
    else if (u.includes('MAHENDRA') || u.includes('DENPASAR')) result = 'DENPASAR';
    else if (u.includes('KUPANG')) result = 'KUPANG';
    else if (u.includes('SINGARAJA')) result = 'SINGARAJA';

    // 2. HARDCODE MAPPING: Override based on Engineer Name or Code (because GD data lacks CC info)
    if (result === 'DENPASAR') {
        const eng = String(engineerName || '').toUpperCase();
        let rowStr = '';
        if (row) {
            if (Array.isArray(row)) rowStr = row.join(' ').toUpperCase();
            else if (typeof row === 'object') rowStr = Object.values(row).join(' ').toUpperCase();
        }
        if (eng.includes('SATRIA EKA ADITA') || eng.includes('SANI LASARO') || eng.includes('8386032710') || eng.includes('8386032420') || rowStr.includes('8386032710') || rowStr.includes('8386032420')) {
            return 'DENPASAR - CELLULAR WORLD';
        } else if (eng.includes('MOHHAMAT BAGAS DWI PRAYOGO') || eng.includes('BAGAS DWI') || eng.includes('8386032812') || rowStr.includes('8386032812')) {
            return 'DENPASAR - PLANET GADGET';
        }
    }

    return result;
}

function getCategory(model, customModels = []) {
    if (!model) return 'UNKNOWN';
    const m = String(model).toUpperCase().trim();
    for (let rule of customModels) {
        if (m.startsWith(rule.keyword)) return rule.category;
    }
    for (let rule of DEFAULT_CUSTOM_MODELS) {
        if (m.startsWith(rule.keyword)) return rule.category;
    }
    return 'UNKNOWN';
}

function isExpensivePart(desc, category) {
    if (!desc) return false;
    const d = String(desc).toUpperCase();
    if (category === 'VD') {
        return d.includes('PANEL') || d.includes('MODULE') || d.includes('ASSY BOARD P') || d.includes('ASSY PCB MAIN') || d.includes('OPEN CELL');
    } else if (category === 'MX') {
        if (d.includes('TAPE') || d.includes('KIT') || d.includes('SUB PBA') || d.includes('IF PBA')) return false;
        return d.includes('OCTA') || d.includes('PBA MAIN') || d.includes('PBA-MAIN') || d.includes('PBA_MAIN') || d.includes('MAIN PBA') || d.includes('SCREEN ASSY');
    } else if (category === 'DA') {
        return d.includes('COMPRESSOR') || d.includes('COMP') || d.includes('PCB MAIN') || d.includes('ASSY BOARD') || d.includes('MOTOR');
    }
    return false;
}

function isReasonMatched(reasonStr, predefinedList, customKeywords = []) {
    if (!reasonStr) return false;
    const rUpper = String(reasonStr).trim().toUpperCase();
    if (predefinedList.some(k => rUpper === k || rUpper.includes(k))) return true;
    for (let kw of customKeywords) {
        if (rUpper === kw.toUpperCase() || rUpper.includes(kw.toUpperCase())) return true;
    }
    return false;
}

function parseExcelDate(dateVal, formatHint = 'DD/MM/YYYY', applyCorruptionFix = false) {
    if (dateVal == null || dateVal === '') return null;
    let dateObj = null;
    
    if (typeof dateVal === 'number') {
        dateObj = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        if (applyCorruptionFix && formatHint === 'DD/MM/YYYY') {
            let m = dateObj.getMonth();
            let d = dateObj.getDate();
            let y = dateObj.getFullYear();
            if (m < 12 && d <= 12) {
                dateObj = new Date(y, d - 1, m + 1);
            }
        }
    } else if (typeof dateVal === 'string') {
        let str = dateVal.trim();
        if (str.match(/[a-zA-Z]/)) {
            dateObj = new Date(str);
        } else {
            const parts = str.split(/[-/ :.]/);
            if (parts.length >= 3) {
                if (parts[0].length === 4) {
                    let y = parts[0];
                    let m = parts[1].padStart(2, '0');
                    let d = parts[2].padStart(2, '0');
                    dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
                } else {
                    let p0 = parts[0].padStart(2, '0');
                    let p1 = parts[1].padStart(2, '0');
                    let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                    
                    if (formatHint === 'DD/MM/YYYY') {
                        dateObj = new Date(`${year}-${p1}-${p0}T00:00:00`);
                    } else if (formatHint === 'MM/DD/YYYY') {
                        dateObj = new Date(`${year}-${p0}-${p1}T00:00:00`);
                    } else {
                        if (parseInt(p0) > 12) {
                            dateObj = new Date(`${year}-${p1}-${p0}T00:00:00`);
                        } else {
                            dateObj = new Date(`${year}-${p0}-${p1}T00:00:00`);
                        }
                    }
                }
            } else {
                dateObj = new Date(str);
            }
        }
    }
    
    if (dateObj && isNaN(dateObj.getTime())) return null;
    return dateObj;
}

function isDateToday(dateVal, formatHint = 'DD/MM/YYYY', applyCorruptionFix = false) {
    let parsedDate = parseExcelDate(dateVal, formatHint, applyCorruptionFix);
    if (!parsedDate || isNaN(parsedDate.getTime())) return false;
    let today = new Date();
    return parsedDate.getDate() === today.getDate() &&
           parsedDate.getMonth() === today.getMonth() &&
           parsedDate.getFullYear() === today.getFullYear();
}

// ==========================================
// FAST HTML & EXCEL PARSER
// ==========================================
function parseExcelFile(filePath) {
    try {
        const fileData = fs.readFileSync(filePath);
        const textSample = fileData.toString('utf8', 0, Math.min(fileData.length, 3000));
        
        // If disguised HTML table from GSPN
        if (textSample.includes('<table') || textSample.includes('<tr') || textSample.includes('<html')) {
            const html = fileData.toString('utf8');
            return parseGspnHtmlTable(html);
        }

        // Standard Excel workbook
        const workbook = XLSX.read(fileData, { type: 'buffer', raw: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        let rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (!rawRows || rawRows.length === 0) return [];

        let headerIdx = -1;
        for (let i = 0; i < Math.min(10, rawRows.length); i++) {
            const r = rawRows[i];
            const joined = (r || []).join(' ').toLowerCase();
            if (joined.includes('service order') || joined.includes('tracking') || joined.includes('customer') || joined.includes('asc') || joined.includes('model') || joined.includes('repair code') || joined.includes('status')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) {
            return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        }

        const headers = (rawRows[headerIdx] || []).map(h => String(h || '').trim());
        const results = [];
        for (let i = headerIdx + 1; i < rawRows.length; i++) {
            const cells = rawRows[i];
            if (!cells || cells.length === 0) continue;
            const obj = {};
            headers.forEach((h, idx) => {
                if (h) obj[h] = cells[idx] !== undefined ? cells[idx] : '';
            });
            results.push(obj);
        }
        return results;
    } catch (err) {
        console.error(`  [PARSE ERROR] ${path.basename(filePath)}:`, err.message);
        return [];
    }
}

function parseGspnHtmlTable(html) {
    const rows = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    const rawRows = [];
    
    while ((trMatch = trRegex.exec(html)) !== null) {
        const trContent = trMatch[1];
        const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
        const rowCells = [];
        let cMatch;
        while ((cMatch = cellRegex.exec(trContent)) !== null) {
            let cellText = cMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
            rowCells.push(cellText);
        }
        if (rowCells.length > 0) {
            rawRows.push(rowCells);
        }
    }
    
    if (rawRows.length === 0) return [];
    
    // Find true header row: scan first 10 rows for recognizable column names or row with largest column count
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
        const row = rawRows[i];
        const joined = row.join(' ').toLowerCase();
        if (joined.includes('service order') || joined.includes('tracking') || joined.includes('customer') || joined.includes('asc') || joined.includes('model') || joined.includes('repair code') || joined.includes('status')) {
            headerIdx = i;
            break;
        }
    }
    
    if (headerIdx === -1) {
        let maxLen = 0;
        for (let i = 0; i < Math.min(10, rawRows.length); i++) {
            if (rawRows[i].length > maxLen) {
                maxLen = rawRows[i].length;
                headerIdx = i;
            }
        }
    }
    
    if (headerIdx === -1 || headerIdx >= rawRows.length) return [];
    
    const headers = rawRows[headerIdx].map(h => h.replace(/\s+/g, ' ').trim());
    
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const cells = rawRows[i];
        if (!cells || cells.length === 0) continue;
        const rowObj = {};
        headers.forEach((h, idx) => {
            if (h) {
                rowObj[h] = cells[idx] !== undefined ? cells[idx] : '';
            }
        });
        rows.push(rowObj);
    }
    return rows;
}

function parseGspnHtmlTableRaw(html) {
    const rows = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(html)) !== null) {
        const trContent = trMatch[1];
        const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
        const rowCells = [];
        let cMatch;
        while ((cMatch = cellRegex.exec(trContent)) !== null) {
            let cellText = cMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
            rowCells.push(cellText);
        }
        if (rowCells.length > 0) rows.push(rowCells);
    }
    return rows;
}

function parseProductivityFile(filePath) {
    try {
        const fileData = fs.readFileSync(filePath);
        const textSample = fileData.toString('utf8', 0, Math.min(fileData.length, 3000));
        if (textSample.includes('<table') || textSample.includes('<tr') || textSample.includes('<html')) {
            return parseGspnHtmlTableRaw(fileData.toString('utf8'));
        }
        const workbook = XLSX.read(fileData, { type: 'buffer', raw: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        let rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        return rawData;
    } catch (err) {
        console.error(`  [PARSE PROD ERROR] ${path.basename(filePath)}:`, err.message);
        return [];
    }
}

function analyzeProductivity(data, techMap = {}) {
    let prodStats = {};
    let invalidGdJobs = [];
    let uniqueWorkingDays = new Set();
    let gdTrendData = {};
    let gdDailyData = {};

    let col = {
        date: 4, branch: 5, eng: 7, labIW: 10, labOOW: 16
    };

    let engineerNameColFound = false;
    let bareEngineerCol = -1;
    for (let i = 0; i < 3 && i < data.length; i++) {
        const r = data[i];
        if (!r) continue;
        let foundAny = false;

        for (let j = 0; j < r.length; j++) {
            const h = String(r[j]).trim().toLowerCase();
            if (!h) continue;

            if (h === 'goods delivered date' || h === 'complete date') { col.date = j; foundAny = true; }
            else if ((h.includes('date') || h.includes('waktu') || h.includes('selesai')) && !h.includes('ticket') && !h.includes('receipt') && !h.includes('update') && !h.includes('billing') && col.date === 4) { col.date = j; foundAny = true; }

            if ((h.includes('asc name') || h === 'asc' || h === 'branch name') && col.branch === 5) { col.branch = j; foundAny = true; }

            if (h === 'engineer name') { col.eng = j; engineerNameColFound = true; foundAny = true; }
            else if (h === 'engineer' && bareEngineerCol === -1) { bareEngineerCol = j; foundAny = true; }

            if ((h === 'labor' || h.includes('labor iw') || h.includes('iw labor') || h.includes('in warranty')) && col.labIW === 10) { col.labIW = j; foundAny = true; }
        }
        if (!engineerNameColFound && bareEngineerCol !== -1) col.eng = bareEngineerCol;
        if (foundAny) break;
    }

    let engCol = col.eng;
    let isNumeric = true;
    let hasData = false;
    for (let i = 2; i < Math.min(10, data.length); i++) {
        const val = data[i] && data[i][engCol];
        if (val) {
            hasData = true;
            if (isNaN(Number(val))) { isNumeric = false; break; }
        }
    }

    if (isNumeric && hasData) {
        let candidates = [bareEngineerCol, engCol + 1, engCol - 1, engCol + 2];
        for (let c of candidates) {
            if (c === undefined || c < 0) continue;
            let hasText = false;
            let allEmpty = true;
            for (let i = 2; i < Math.min(10, data.length); i++) {
                const val = data[i] && data[i][c];
                if (!val) continue;
                allEmpty = false;
                const s = String(val).trim();
                if (s.length > 2 && /[a-zA-Z]/.test(s)) {
                    hasText = true;
                    break;
                }
            }
            if (hasText && !allEmpty) {
                col.eng = c;
                break;
            }
        }
    }

    let formatHint = 'DD/MM/YYYY'; 
    let hasStringDates = false;
    let hasNumberDates = false;

    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || row[col.date] == null) continue;

        const val = row[col.date];
        if (typeof val === 'number') {
            hasNumberDates = true;
        } else if (typeof val === 'string') {
            let sVal = val.trim();
            // Skip invalid strings that are obviously not dates
            if (sVal.match(/[a-zA-Z,]/) || sVal.startsWith('-')) continue;

            hasStringDates = true;
            const parts = sVal.split(/[-/ :.]/);
            if (parts.length >= 3 && parts[0].length !== 4) {
                let p0 = parseInt(parts[0], 10);
                let p1 = parseInt(parts[1], 10);
                if (!isNaN(p0) && !isNaN(p1)) {
                    if (p0 > 12 && p1 <= 12) {
                        formatHint = 'DD/MM/YYYY';
                    } else if (p1 > 12 && p0 <= 12) {
                        formatHint = 'MM/DD/YYYY';
                    }
                }
            }
        }
    }

    let applyCorruptionFix = (hasStringDates && hasNumberDates && formatHint === 'DD/MM/YYYY');

    let maxDate = 0;
    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue; 
        const gdDate = row[col.date];
        if (!gdDate) continue;
        const parsedGdDate = parseExcelDate(gdDate, formatHint, applyCorruptionFix);
        if (parsedGdDate && !isNaN(parsedGdDate.getTime())) {
            if (parsedGdDate.getTime() > maxDate) {
                maxDate = parsedGdDate.getTime();
            }
        }
    }

    const reportDate = new Date();
    const currMonth = reportDate.getMonth();
    const currYear = reportDate.getFullYear();

    let prevMonth = currMonth - 1;
    let prevYear = currYear;
    if (prevMonth < 0) {
        prevMonth = 11;
        prevYear--;
    }

    let prodJobs = [];

    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const gdDate = row[col.date];
        if (!gdDate) continue;

        let rawEng = row[col.eng];
        let engName = null;
        if (row[7] && typeof row[7] === 'string' && /[a-zA-Z]{2,}/.test(row[7]) && row[7].trim() !== 'Engineer' && !row[7].toLowerCase().includes('product')) {
            engName = row[7].trim().toUpperCase().replace(/^\d+\s+/, '');
        } else if (row[6] && typeof row[6] === 'string' && /[a-zA-Z]{2,}/.test(row[6]) && row[6].trim() !== 'Engineer') {
            engName = row[6].trim().toUpperCase().replace(/^\d+\s+/, '');
        } else if (rawEng) {
            engName = String(rawEng).trim().toUpperCase().replace(/^\d+\s+/, '');
        }

        if (engName) {
            const cleanCode = engName.replace(/\D/g, '');
            if (cleanCode && techMap[cleanCode]) {
                engName = techMap[cleanCode];
            }
        }
        if (!engName) continue;
        
        let branch = shortenASC(row[col.branch], row, engName);

        const laborIWStr = row[col.labIW] || "0";
        const laborOOWStr = row[col.labOOW] || "0";
        const laborIW = parseFloat(String(laborIWStr).replace(/,/g, '')) || 0;
        const laborOOW = parseFloat(String(laborOOWStr).replace(/,/g, '')) || 0;

        const parsedGdDate = parseExcelDate(gdDate, formatHint, applyCorruptionFix);

        if (!parsedGdDate || isNaN(parsedGdDate.getTime())) {
            if (String(gdDate).includes('00.00.0000')) {
                invalidGdJobs.push({ jobNo: row[0], engName: engName });
            }
            continue;
        }

        const gdMonth = parsedGdDate.getMonth();
        const gdYear = parsedGdDate.getFullYear();
        const gdDay = parsedGdDate.getDate();

        // Trend GD (semua bulan)
        const monthYearStr = `${gdYear}-${String(gdMonth + 1).padStart(2, '0')}`;
        
        // Strict 6-Month Filter
        const parsedTime = parsedGdDate.getTime();
        const sixMonthsAgo = new Date(currYear, currMonth - 5, 1).getTime();
        if (parsedTime >= sixMonthsAgo) {
            if (!gdTrendData[monthYearStr]) gdTrendData[monthYearStr] = {};
            if (!gdTrendData[monthYearStr][branch]) gdTrendData[monthYearStr][branch] = 0;
            gdTrendData[monthYearStr][branch]++;
        }

        // Harian GD (Bulan berjalan)
        if (gdMonth === currMonth && gdYear === currYear) {
            if (!gdDailyData[branch]) gdDailyData[branch] = {};
            if (!gdDailyData[branch][gdDay]) gdDailyData[branch][gdDay] = 0;
            gdDailyData[branch][gdDay]++;
        }

        let prodJobNo = null;
        for (let j = 0; j < 5; j++) {
            if (row[j] && String(row[j]).startsWith('4') && String(row[j]).length === 10) {
                prodJobNo = String(row[j]);
                break;
            }
        }

        if (prodJobNo && gdMonth === currMonth && gdYear === currYear) {
            prodJobs.push({
                jobNo: prodJobNo,
                engineer: engName,
                branch: branch
            });
        }

        if (gdMonth === prevMonth && gdYear === prevYear) {
            if (!prodStats[engName]) prodStats[engName] = { 
                asc: branch, gdCount: 0, gdPrevMonth: 0, gdRepair: 0, gdCancel: 0, 
                laborIW: 0, laborOOW: 0, dtsGd: 0, dtsIhGdVisits: 0, dtsIhTotalVisits: 0, 
                visitedJobs: new Set(), visitedGdJobs: new Set()
            };
            prodStats[engName].gdPrevMonth++;
            continue;
        }

        if (gdMonth !== currMonth || gdYear !== currYear) {
            continue;
        }

        if (!prodStats[engName]) prodStats[engName] = { 
            asc: branch, gdCount: 0, gdPrevMonth: 0, gdRepair: 0, gdCancel: 0, 
            laborIW: 0, laborOOW: 0, dtsGd: 0, dtsIhGdVisits: 0, dtsIhTotalVisits: 0, 
            visitedJobs: new Set(), visitedGdJobs: new Set()
        };
        uniqueWorkingDays.add(gdDate);

        prodStats[engName].gdCount++;
        prodStats[engName].laborIW += laborIW;
        prodStats[engName].laborOOW += laborOOW;

        if (laborIW > 0) prodStats[engName].gdRepair++;
        else if (laborOOW > 0 && laborOOW < 80000) prodStats[engName].gdCancel++;
        else prodStats[engName].gdRepair++;

        if (isDateToday(gdDate, formatHint, applyCorruptionFix)) {
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
        const item = { engineer: eng, resolvedBranch: prodStats[eng].asc, avgGd: avgGd, ...prodStats[eng] };
        delete item.visitedJobs;
        delete item.visitedGdJobs;
        return item;
    });

    fameList.sort((a, b) => {
        let cmp = (a.resolvedBranch || '').localeCompare(b.resolvedBranch || '');
        if (cmp !== 0) return cmp;
        return b.gdCount - a.gdCount;
    });

    return { fameList, gdTrendData, gdDailyData, prodJobs };
}

// ==========================================
// COMPREHENSIVE ANALYTICS ENGINE (WORKER PARITY)
// ==========================================
function calculateAnalytics(baseData, customModels = [], customReasons = []) {
    let stats = {
        total: baseData.length,
        ltp: 0,
        exLtp: 0,
        mpuViolations: 0,
        x09Violations: 0,
        ubViolations: 0,
        breakdownLtp: { MX: 0, VD: 0, DA: 0 },
        breakdownExLtp: { MX: 0, VD: 0, DA: 0 },
        totalCat: { MX: 0, VD: 0, DA: 0 },
        responsibility: { AGING: 0, SEIN: 0, OTHER: 0 }
    };

    let mpuList = [], x09List = [], ubList = [], dosaCabangOver7 = [];
    let unknownModels = new Set(), unknownReasons = new Set();
    let branchStats = {}, engineerStats = {}, rcStats = {};
    let dtsMxData = {}, dtsIhData = {};
    let dosaCabangBills = [];

    const customSeinKws = customReasons.filter(r => r.category === 'SEIN').map(r => r.keyword);
    const customAgingKws = customReasons.filter(r => r.category === 'AGING').map(r => r.keyword);

    // Detect formatHint
    let formatHint = 'DD/MM/YYYY';
    let hasStringDates = false;
    let hasNumberDates = false;

    for (let i = 0; i < Math.min(100, baseData.length); i++) {
        const row = baseData[i];
        if (!row || row['Request Date'] == null) continue;
        const dVal = row['Request Date'];
        if (typeof dVal === 'number') {
            hasNumberDates = true;
        } else if (typeof dVal === 'string') {
            let sVal = dVal.trim();
            if (sVal.match(/[a-zA-Z,]/) || sVal.startsWith('-')) continue;

            hasStringDates = true;
            const parts = sVal.split(/[-/ :.]/);
            if (parts.length >= 3 && parts[0].length !== 4) {
                let p0 = parseInt(parts[0], 10);
                let p1 = parseInt(parts[1], 10);
                if (!isNaN(p0) && !isNaN(p1)) {
                    if (p0 > 12 && p1 <= 12) formatHint = 'DD/MM/YYYY';
                    else if (p1 > 12 && p0 <= 12) formatHint = 'MM/DD/YYYY';
                }
            }
        }
    }
    let applyCorruptionFix = (hasStringDates && hasNumberDates && formatHint === 'DD/MM/YYYY');

    baseData.forEach(row => {
        const model = row['Model'] || row['Model Code'] || '-';
        let category = getCategory(model, customModels);

        if (category === 'UNKNOWN') {
            if (model && model !== '-') unknownModels.add(model);
            category = 'MX';
        }

        let warranty = '';
        for (let k in row) {
            let kLow = k.toLowerCase().replace(/[^a-z]/g, '');
            if (kLow.includes('warranty') || kLow === 'inoutwarrantyflag' || kLow === 'inoutflag' || kLow === 'wty' || kLow === 'iwow') {
                if (row[k]) { warranty = String(row[k]).trim().toUpperCase(); break; }
            }
        }
        const isIW = (warranty === 'IW' || warranty === 'LP' || warranty === 'L' || warranty.startsWith('IN') || warranty === 'IN WARRANTY');

        if (isIW) stats.totalCat[category]++;

        const status = (row['Status'] || row['Job Status'] || '').toString().trim();
        const reason = (row['Reason'] || row['Pending Reason'] || '').toString().trim();
        const agingDaysStr = row['Pending aging Days'];
        let agingDays = agingDaysStr ? parseInt(agingDaysStr) : 0;

        if (status === 'Repair Completed' || status.includes('Completed')) {
            const reqDateVal = row['Request Date'];
            if (reqDateVal) {
                let reqDateObj = parseExcelDate(reqDateVal, formatHint, applyCorruptionFix);
                if (reqDateObj && !isNaN(reqDateObj.getTime())) {
                    const reqMidnight = new Date(reqDateObj.getFullYear(), reqDateObj.getMonth(), reqDateObj.getDate());
                    const todayMidnight = new Date();
                    todayMidnight.setHours(0, 0, 0, 0);
                    const diffTime = todayMidnight.getTime() - reqMidnight.getTime();
                    agingDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                }
            }
        }

        let ascName = shortenASC(row['ASC Name'] || row['ASC'] || row['Service Center'], row);

        let jobNo = 'N/A';
        for (let key in row) {
            let k = key.toLowerCase().trim();
            if (k.includes('job') || k.includes('order') || k.includes('ticket') || k === 'so' || k === 'so no' || k === 'so.') {
                if (row[key] && row[key].toString().trim() !== '') {
                    jobNo = row[key].toString().trim();
                    break;
                }
            }
        }
        if (jobNo === 'N/A') {
            for (let key in row) {
                if (row[key]) {
                    let sVal = String(row[key]).trim();
                    if (/^4\d{9}$/.test(sVal.replace(/\D/g, ''))) {
                        jobNo = sVal;
                        break;
                    }
                }
            }
        }

        const repairCode = row['Repair Code'] || '';
        let engineer = row['Engineer Name'] ? row['Engineer Name'].toString().trim().toUpperCase().replace(/^\d+\s+/, '') : null;
        if (!engineer || /^\d+$/.test(engineer)) {
            let backup = row['Engineer'] ? row['Engineer'].toString().trim().toUpperCase().replace(/^\d+\s+/, '') : null;
            if (backup && /[a-zA-Z]/.test(backup)) {
                engineer = backup;
            } else {
                engineer = engineer || 'UNKNOWN ENGINEER';
            }
        }

        if (status.includes('Assigned to Service Center') || status.includes('Acknowledge')) {
            engineer = `PIC ${ascName}`;
        } else if (reason && (reason.trim().toUpperCase() === 'WAITING FOR CONFIRMATION FROM SAMSUNG' || reason.trim().toUpperCase() === 'PROCESSING EXCHANGE')) {
            engineer = `PIC ${ascName}`;
        }
        
        ascName = shortenASC(ascName, row, engineer);

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
        const billInfo = { jobNo, model, customer: customerName, pendingDays: agingDays, reason, category, engineer, status, asc: ascName };

        branchStats[ascName].total++;

        if (status === 'Repair Completed' || status.includes('Completed')) {
            let rcPendingDays = agingDays;
            const rcBillInfo = { ...billInfo, pendingDays: rcPendingDays };
            if (!rcStats[ascName]) rcStats[ascName] = { count: 0, bills: [] };
            rcStats[ascName].count++;
            rcStats[ascName].bills.push(rcBillInfo);
        }

        if (!engineerStats[engineer]) {
            engineerStats[engineer] = { asc: ascName, ascCounts: {}, mxAging: 0, vdAging: 0, daAging: 0, bills: [] };
        }
        if (!engineerStats[engineer].ascCounts) engineerStats[engineer].ascCounts = {};
        engineerStats[engineer].ascCounts[ascName] = (engineerStats[engineer].ascCounts[ascName] || 0) + 1;
        // Prioritize specific sub-branch/CC if technician handles CC jobs
        if (ascName.includes(' - ') || !engineerStats[engineer].asc || engineerStats[engineer].asc === 'DENPASAR') {
            engineerStats[engineer].asc = ascName;
        }

        let partsUsedCount = 0;
        let expensivePartsFound = [];
        let hasOcta = false;
        let ubPartsFound = [];

        // Scan standard numbered keys (1 to 20) as well as any key containing part/part description
        const visitedPartKeys = new Set();
        for (let i = 1; i <= 20; i++) {
            const padI = i.toString().padStart(2, '0');
            const descKeys = [
                `Parts description ${padI}`,
                `Parts Description ${padI}`,
                `Part description ${padI}`,
                `Part Description ${padI}`,
                `Parts description ${i}`,
                `Part description ${i}`,
                `Parts Description ${i}`,
                `Part Description ${i}`
            ];
            const noKeys = [
                `Parts No ${padI}`,
                `Parts No ${i}`,
                `Part No ${padI}`,
                `Part No ${i}`,
                `Parts Code ${padI}`,
                `Part Code ${padI}`
            ];

            let partDesc = null;
            let partNo = null;

            for (let k of descKeys) {
                if (row[k]) { partDesc = String(row[k]).trim(); visitedPartKeys.add(k); break; }
            }
            for (let k of noKeys) {
                if (row[k]) { partNo = String(row[k]).trim(); visitedPartKeys.add(k); break; }
            }

            if (partDesc || partNo) {
                const effectiveDesc = partDesc || partNo;
                const effectiveNo = partNo || partDesc;
                const partDescUpper = effectiveDesc.toUpperCase();
                const isRealOcta = partDescUpper.includes('OCTA') && !partDescUpper.includes('TAPE') && !partDescUpper.includes('KIT');

                partsUsedCount++;
                if (isExpensivePart(effectiveDesc, category) && !expensivePartsFound.includes(effectiveNo)) {
                    expensivePartsFound.push(effectiveNo);
                }
                if (isRealOcta) {
                    hasOcta = true;
                    if (!ubPartsFound.includes(effectiveNo)) ubPartsFound.push(effectiveNo);
                }
            }
        }

        // Catch-all dynamic loop for other column naming variations
        for (let key in row) {
            if (visitedPartKeys.has(key)) continue;
            const kLow = key.toLowerCase();
            if ((kLow.includes('part') && (kLow.includes('desc') || kLow.includes('nama') || kLow.includes('name'))) || kLow.includes('parts description')) {
                const val = row[key] ? String(row[key]).trim() : '';
                if (val && val !== '-' && val !== 'N/A') {
                    const valUpper = val.toUpperCase();
                    const isRealOcta = valUpper.includes('OCTA') && !valUpper.includes('TAPE') && !valUpper.includes('KIT');
                    partsUsedCount++;
                    if (isExpensivePart(val, category) && !expensivePartsFound.includes(val)) {
                        expensivePartsFound.push(val);
                    }
                    if (isRealOcta) {
                        hasOcta = true;
                        if (!ubPartsFound.includes(val)) ubPartsFound.push(val);
                    }
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
                    if (reason && reason.trim() !== '') {
                        unknownReasons.add(reason);
                    } else {
                        unknownReasons.add("[KOSONG / TIDAK ADA ALASAN]");
                    }
                    stats.responsibility.OTHER++;
                }
            }
        }

        if (isAging) {
            engineerStats[engineer].bills.push(billInfo);
            if (category === 'MX') engineerStats[engineer].mxAging++;
            else if (category === 'VD') engineerStats[engineer].vdAging++;
            else if (category === 'DA') engineerStats[engineer].daAging++;

            dosaCabangBills.push(billInfo);

            if (agingDays > 7) {
                dosaCabangOver7.push({ ...billInfo, asc: ascName });
            }
        }

        // DTS Logic MX
        if (category === 'MX' && !engineer.startsWith('PIC ')) {
            if (!dtsMxData[engineer]) {
                dtsMxData[engineer] = { volIn: 0, rc: 0, gd: 0, aging: 0, cust: 0, sein: 0, name: engineer, asc: ascName };
            }
            if (isDateToday(row['Request Date'], formatHint, applyCorruptionFix)) dtsMxData[engineer].volIn++;
            if ((status === 'Repair Completed' || status.includes('Completed')) && isDateToday(row['Repair Completed'], formatHint, applyCorruptionFix)) dtsMxData[engineer].rc++;
            if (reason === 'Re-scheduling by Customer' || reason === 'Waiting for confirmation from customer') dtsMxData[engineer].cust++;
            if (isSein) dtsMxData[engineer].sein++;
            if (isAging && reason !== 'Re-scheduling by Customer' && reason !== 'Waiting for confirmation from customer') dtsMxData[engineer].aging++;
        }

        // DTS Logic IH
        if ((category === 'VD' || category === 'DA') && !engineer.startsWith('PIC ')) {
            if (!dtsIhData[engineer]) {
                dtsIhData[engineer] = { name: engineer, asc: ascName, totalVisits: 0, rcVisits: 0, gdVisits: 0, pendingVisits: 0, totalAging: 0, _visitedJobs: [] };
            }
            if (isAging) dtsIhData[engineer].totalAging++;

            let isVisitedToday = false;
            let changeDateVal = null;
            for (let key in row) {
                let k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (k === 'changedate') { changeDateVal = row[key]; break; }
            }
            if (isDateToday(changeDateVal, formatHint, applyCorruptionFix)) {
                const upperReason = reason.trim().toUpperCase();
                const pendingReasons = ['PARTS NOT AVAILABLE (ASC)', 'PARTS IN TRANSIT (SAMSUNG)', 'PARTS ALLOCATED(SAMSUNG)', 'PARTS P/O CANCELLATION', 'PARTS DNA/SNA (ASC)', 'PARTS BACK ORDERED (SAMSUNG)', 'MONITORING/AGING OR NOT REPRODUCED'];
                if (pendingReasons.includes(upperReason)) {
                    isVisitedToday = true;
                    if (!dtsIhData[engineer]._visitedJobs.includes(jobNo)) dtsIhData[engineer].pendingVisits++;
                }
            }
            if ((status === 'Repair Completed' || status.includes('Completed')) && isDateToday(row['Repair Completed'], formatHint, applyCorruptionFix)) {
                isVisitedToday = true;
                if (!dtsIhData[engineer]._visitedJobs.includes(jobNo)) dtsIhData[engineer].rcVisits++;
            }
            if (isVisitedToday && !dtsIhData[engineer]._visitedJobs.includes(jobNo)) {
                dtsIhData[engineer].totalVisits++;
                dtsIhData[engineer]._visitedJobs.push(jobNo);
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

        if (expensivePartsFound.length > 1) {
            stats.mpuViolations++; branchStats[ascName].mpu++; branchStats[ascName].bills.mpu.push(billInfo);
            mpuList.push({ jobNo, asc: ascName, model, parts: expensivePartsFound.join(" + "), category, status, engineer });
        }
        if (model && String(model).toUpperCase().startsWith('SM-F') && hasOcta) {
            stats.ubViolations++; branchStats[ascName].ub++; branchStats[ascName].bills.ub.push(billInfo);
            ubList.push({ jobNo, asc: ascName, model, parts: ubPartsFound.join(" + "), status, engineer });
        }
    });

    let shameList = [];
    for (let eng in engineerStats) {
        let es = engineerStats[eng];
        let totalDosa = es.mxAging + es.vdAging + es.daAging;
        if (totalDosa > 0) {
            shameList.push({
                engineer: eng,
                asc: es.asc,
                count: totalDosa,
                detail: `MX:${es.mxAging} VD:${es.vdAging} DA:${es.daAging}`,
                bills: es.bills
            });
        }
    }
    // Sort: 1. Branch A-Z, 2. Aging Units DESC
    shameList.sort((a, b) => {
        const comp = (a.asc || '').localeCompare(b.asc || '');
        if (comp !== 0) return comp;
        return b.count - a.count;
    });

    // Sort: 1. Branch A-Z, 2. Pending Days DESC
    dosaCabangOver7.sort((a, b) => {
        const comp = (a.asc || '').localeCompare(b.asc || '');
        if (comp !== 0) return comp;
        return b.pendingDays - a.pendingDays;
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
        dosaCabangBills,
        unknownModels: Array.from(unknownModels),
        unknownReasons: Array.from(unknownReasons),
        totalRawRows: baseData.length
    };
}

const { DataValidator } = require('./intelligence/data_validator');

// ==========================================
// MAIN SYNC TO FIREBASE
// ==========================================
async function processAndSyncToFirebase(downloadedFiles, scheduleSlot = 'MANUAL') {
    console.log('==============================================');
    console.log('  🔄 GSPN TO FIREBASE CLOUD SYNC');
    console.log(`  Jadwal Slot: ${scheduleSlot}`);
    console.log('==============================================');

    // BAD DATA PROTECTION: Validate downloaded files before parsing
    const validationReport = DataValidator.validateBatch(downloadedFiles);
    if (!validationReport.canProceed) {
        console.error('❌ BAD DATA PROTECTION AKTIF: Sinkronisasi dibatalkan untuk mencegah hilangnya data lama yang valid.');
        console.error('Issues:', validationReport.issues);
        throw new Error('All SO files corrupted or missing. Data protection prevented sync.');
    } else {
        console.log(`✅ Validasi File: ${validationReport.soValid} SO OK, ${validationReport.gdValid} GD OK.`);
        if (validationReport.issues.length > 0) {
            console.warn(`⚠️ Peringatan File Validasi:`, validationReport.issues);
        }
    }

    let baseData = [];
    let statusData = [];
    let prodData = [];

    // Parse SO files
    (downloadedFiles.soFiles || []).forEach(f => {
        const rows = parseExcelFile(f.path);
        baseData = baseData.concat(rows);
    });

    // Deduplicate baseData by Service Order No to prevent overlapping files causing overcount
    const seenSo = new Set();
    baseData = baseData.filter(row => {
        let soNo = row['Service Order No.'] || row['Service Order No'] || row['Job No'] || row['Order No'];
        soNo = soNo ? String(soNo).trim() : null;
        if (!soNo) return true;
        if (seenSo.has(soNo)) return false;
        seenSo.add(soNo);
        return true;
    });

    // Parse Status files
    (downloadedFiles.statusFiles || []).forEach(f => {
        const rows = parseExcelFile(f.path);
        statusData = statusData.concat(rows);
    });

    // Extract valid tracking numbers from statusData to sync baseData length with statusData length (1974 rows)
    if (statusData.length > 0) {
        const validStatusTrackingNos = new Set();
        statusData.forEach(row => {
            let trackingNo = null;
            for (let k in row) {
                let kLow = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (kLow.includes('tracking') || kLow.includes('serviceorder') || kLow.includes('orderno') || kLow === 'so' || kLow === 'sono') {
                    if (row[k] && String(row[k]).trim() !== '') trackingNo = row[k];
                }
            }
            if (!trackingNo) {
                for (let k in row) {
                    let sVal = String(row[k]).trim();
                    if (/^4\d{9}$/.test(sVal.replace(/\D/g, ''))) { trackingNo = sVal; break; }
                }
            }
            if (trackingNo) {
                const cleanKey = String(trackingNo).trim().replace(/\D/g, '');
                if (cleanKey) validStatusTrackingNos.add(cleanKey);
            }
        });

        // Filter baseData to ONLY include tickets that are actively monitored in statusData
        baseData = baseData.filter(row => {
            let soNo = row['Service Order No.'] || row['Service Order No'] || row['Job No'] || row['Order No'];
            soNo = soNo ? String(soNo).trim().replace(/\D/g, '') : null;
            if (!soNo) return false;
            return validStatusTrackingNos.has(soNo);
        });
    }

    // Parse GD Productivity files
    (downloadedFiles.gdFiles || []).forEach(f => {
        const rows = parseProductivityFile(f.path);
        prodData = prodData.concat(rows);
    });

    // Auto-VLOOKUP Customer Name
    if (statusData.length > 0) {
        let customerMap = {};
        statusData.forEach(row => {
            let trackingNo = null;
            let customerName = null;

            for (let k in row) {
                let kLow = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (kLow.includes('tracking') || kLow.includes('serviceorder') || kLow.includes('orderno') || kLow === 'so' || kLow === 'sono') {
                    if (row[k] && String(row[k]).trim() !== '') {
                        trackingNo = row[k];
                    }
                }
                if (kLow.includes('customer') || kLow.includes('konsumen') || kLow.includes('custname') || kLow.includes('pelanggan')) {
                    if (row[k] && String(row[k]).trim() !== '') {
                        customerName = row[k];
                    }
                }
            }

            if (!trackingNo) {
                for (let k in row) {
                    let sVal = String(row[k]).trim();
                    if (/^4\d{9}$/.test(sVal.replace(/\D/g, ''))) {
                        trackingNo = sVal;
                        break;
                    }
                }
            }

            if (trackingNo && customerName && String(customerName).trim() !== '') {
                const cleanKey = String(trackingNo).trim().replace(/\D/g, '');
                if (cleanKey) customerMap[cleanKey] = String(customerName).trim();
            }
        });

        let matchedCount = 0;
        baseData.forEach(row => {
            let soNo = row['Service Order No.'] || row['Service Order No'] || row['Job No'] || row['Order No'];
            if (!soNo) {
                for (let k in row) {
                    let sVal = String(row[k]).trim();
                    if (/^4\d{9}$/.test(sVal.replace(/\D/g, ''))) {
                        soNo = sVal;
                        break;
                    }
                }
            }
            if (soNo) {
                const cleanKey = String(soNo).trim().replace(/\D/g, '');
                if (cleanKey && customerMap[cleanKey]) {
                    row['Customer Name'] = customerMap[cleanKey];
                    matchedCount++;
                }
            }
        });
        console.log(`  🔗 VLOOKUP Customer Name: Berhasil memetakan ${matchedCount} / ${baseData.length} baris data konsumen.`);
    }

    console.log(`\n📊 Data Parsed: ${baseData.length} SO rows | ${prodData.length} GD rows`);

    // Ensure authenticated session
    await ensureFirebaseAuth();

    // Fetch custom rules from Firestore if available
    let customModels = [];
    let customReasons = [];
    try {
        const rulesDoc = await getDoc(doc(db, 'config', 'rules'));
        if (rulesDoc.exists()) {
            customModels = rulesDoc.data().models || [];
            customReasons = rulesDoc.data().reasons || [];
        }
    } catch (e) { console.error('FIREBASE RULES FETCH ERROR:', e); }

    // Run Analytics
    const analytics = calculateAnalytics(baseData, customModels, customReasons);
    
    // TAHAP 1 AGING COMMANDER: Menjalankan State Tracker
    await trackAgingStates(db, baseData);
    
    // ==========================================
    // AGING SUPERVISOR INTELLIGENCE
    // ==========================================
    console.log(`\n🧠 Menjalankan AGING SUPERVISOR INTELLIGENCE...`);
    const AgingIntelligenceFacade = require('./intelligence/aging_intelligence_facade');
    const NotificationEngine = require('./intelligence/notification_engine');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const snapshotId = `${dateStr}_${timeStr.replace(/:/g, '')}`;

    // Optimize payload size for Firestore document limit (1MB max):
    // 1. Remove raw branchStats.bills.total
    for (let b in analytics.branchStats) {
        if (analytics.branchStats[b].bills) {
            delete analytics.branchStats[b].bills.total;
        }
    }

    // 2. Compact shameList and engineerStats (engineerStats provides summary stats; shameList contains bills for modal)
    const compactBill = (bill) => {
        if (!bill) return null;
        return {
            jobNo: bill.jobNo || bill['Job No'] || bill['Service Order No.'] || '-',
            customer: bill.customer || bill['Customer Name'] || '-',
            model: bill.model || bill['Model'] || '-',
            reason: bill.reason || bill['Reason For Pending / Transfer'] || '-',
            pendingDays: bill.pendingDays || bill['Pending Days'] || 0,
            status: bill.status || bill['Status'] || '-',
            engineer: bill.engineer || '-'
        };
    };

    if (analytics.shameList) {
        analytics.shameList.forEach(item => {
            if (Array.isArray(item.bills)) {
                item.bills = item.bills.map(compactBill);
            }
        });
    }

    // Remove redundant full bills from engineerStats map to save ~600KB
    if (analytics.engineerStats) {
        for (let eng in analytics.engineerStats) {
            delete analytics.engineerStats[eng].bills;
        }
    }

    if (analytics.dosaCabangOver7) {
        analytics.dosaCabangOver7 = analytics.dosaCabangOver7.map(item => ({
            ...compactBill(item),
            asc: item.asc
        }));
    }

    if (analytics.dosaCabangStats) {
        for (let b in analytics.dosaCabangStats) {
            if (Array.isArray(analytics.dosaCabangStats[b].bills)) {
                analytics.dosaCabangStats[b].bills = analytics.dosaCabangStats[b].bills.map(compactBill);
            }
        }
    }

    // Evaluate intelligence for jobs taking > 7 days (AFTER compacting, applied to dosaCabangStats for UI)
    let aiAlertsSent = 0;
    if (analytics.dosaCabangStats) {
        for (let branch in analytics.dosaCabangStats) {
            if (analytics.dosaCabangStats[branch].bills) {
                for (let item of analytics.dosaCabangStats[branch].bills) {
                    const jobData = {
                        trackingNo: item.jobNo || '-',
                        branch: branch || 'Unknown',
                        engineer: item.engineer || 'Unknown',
                        agingDays: item.pendingDays || 0,
                        status: item.status || '-',
                        reason: item.reason || '-'
                    };
                    
                    const intelligenceResult = AgingIntelligenceFacade.evaluate(jobData, null);
                    
                    item.ai_priority = intelligenceResult.priority;
                    item.ai_action = intelligenceResult.action;
                    item.ai_riskScore = intelligenceResult.riskScore ? intelligenceResult.riskScore.riskScore : 0;
                    
                    // Trigger alerts for Critical/High issues
                    try {
                        const alertRes = await NotificationEngine.triggerAlert(db, jobData, intelligenceResult);
                        if (alertRes && alertRes.status === 'ALERT_CREATED') aiAlertsSent++;
                    } catch (e) { console.error('FIREBASE RULES FETCH ERROR:', e); }
                }
            }
        }
    }


    // Clean internal tracking caches before sending to Firestore
    if (analytics.dtsIhData) {
        for (let k in analytics.dtsIhData) {
            delete analytics.dtsIhData[k]._visitedJobs;
        }
    }

    // Process Scraped Redo Orders
    let redoList = [];
    if (downloadedFiles.redoItems && downloadedFiles.redoItems.length > 0) {
        console.log(`\n🔄 Memetakan ${downloadedFiles.redoItems.length} hasil tangkapan REDO langsung dari GSPN...`);
        downloadedFiles.redoItems.forEach(item => {
            const cleanJobNo = String(item.jobNo).trim();
            // Cek di baseData untuk mendapatkan nama teknisi asli jika ada
            const matchedRow = baseData.find(r => {
                const so = r['Service Order No.'] || r['Service Order No'] || r['Job No'];
                return so && String(so).trim() === cleanJobNo;
            });

            let asc = shortenASC(item.asc);
            let engineer = item.engineer;
            let model = item.model;

            if (matchedRow) {
                if (matchedRow['Engineer Name']) engineer = String(matchedRow['Engineer Name']).trim().toUpperCase().replace(/^\d+\s+/, '');
                if (matchedRow['Model']) model = matchedRow['Model'];
                if (matchedRow['ASC Name']) asc = shortenASC(matchedRow['ASC Name'], matchedRow, engineer);
            }

            if (!engineer || engineer.startsWith('PIC ')) {
                engineer = `PIC ${asc}`;
            }

            asc = shortenASC(asc, null, engineer);

            redoList.push({
                jobNo: cleanJobNo,
                asc: asc,
                engineer: engineer,
                model: model || item.model || 'REDO Item',
                customer: item.customer || '-',
                category: item.category || 'MX',
                status: 'REDO'
            });
        });
    }

    // Build techCodeToNameMap from baseData (SO files)
    const techCodeToNameMap = {};
    baseData.forEach(r => {
        let code = r['Engineer Code'] || r['EngineerCode'] || r['Eng Code'];
        let name = r['Engineer Name'] || r['EngineerName'] || r['Engineer'];
        if (code && name && typeof name === 'string' && /[a-zA-Z]{2,}/.test(name)) {
            const cleanC = String(code).trim().replace(/\D/g, '');
            const cleanN = String(name).trim().toUpperCase().replace(/^\d+\s+/, '');
            if (cleanC && cleanN && !cleanN.startsWith('PIC ')) {
                techCodeToNameMap[cleanC] = cleanN;
            }
        }
    });

    // Run Productivity Analytics if GD files were provided
    let prodAnalytics = { fameList: [], gdTrendData: {}, gdDailyData: {}, prodJobs: [] };
    if (prodData.length > 0) {
        console.log(`\n⚙️ Menjalankan Productivity Engine untuk ${prodData.length} baris GD...`);
        prodAnalytics = analyzeProductivity(prodData, techCodeToNameMap);
        console.log(`  🏆 Wall of Fame: ${prodAnalytics.fameList.length} teknisi dihitung.`);
        console.log(`  📈 GD Trend: ${Object.keys(prodAnalytics.gdTrendData).length} periode bulan terpetakan.`);
    }

    // ============================================================
    // SPLIT PAYLOAD: Firestore max doc size = 1MB
    // We split into 4 sub-documents under dashboard_data/
    // ============================================================

    // DOC 1: Core summary + branch stats + shame/dosa (small)
    const payloadCore = {
        lastUpdated: `${dateStr} ${timeStr} WIB`,
        timestamp: Date.now(),
        scheduleSlot: scheduleSlot,
        summary: {
            ...analytics.stats,
            redoCount: redoList.length
        },
        branchStats: analytics.branchStats,
        shameList: analytics.shameList,
        dosaCabangOver7: analytics.dosaCabangOver7,
        dosaCabangStats: analytics.dosaCabangStats,
        unknownModels: analytics.unknownModels,
        unknownReasons: analytics.unknownReasons,
        totalRawRows: analytics.totalRawRows,
        status: 'SUCCESS'
    };

    // DOC 2: Violations lists (mpuList, ubList, x09List, redoList)
    const payloadViolations = {
        lastUpdated: `${dateStr} ${timeStr} WIB`,
        timestamp: Date.now(),
        mpuList: analytics.mpuList,
        ubList: analytics.ubList,
        x09List: analytics.x09List,
        redoList: redoList,
    };

    // DOC 3: Engineer stats + DTS data + rcStats
    const payloadEng = {
        lastUpdated: `${dateStr} ${timeStr} WIB`,
        timestamp: Date.now(),
        engineerStats: analytics.engineerStats,
        rcStats: analytics.rcStats,
        dtsMxData: analytics.dtsMxData,
        dtsIhData: analytics.dtsIhData,
    };

    
    // DOC 4: Productivity (GD fame, trend, daily, prodJobs)
    let existingProd = null;
    try {
        const prodDocSnap = await getDoc(doc(db, 'dashboard_data', 'latest_prod'));
        if (prodDocSnap.exists()) {
            existingProd = prodDocSnap.data();
        }
    } catch (e) {
        console.warn('Gagal mengambil data Productivity lama dari Firestore:', e);
    }

    if (existingProd) {
        // Merge gdTrendData (retain past 5 months, overwrite current month)
        if (existingProd.gdTrendData) {
            prodAnalytics.gdTrendData = { ...existingProd.gdTrendData, ...prodAnalytics.gdTrendData };
        }
        
        // Merge fameList (Inject GD Prev Month if possible)
        // Since we only scrape 1 month, gdCount is actually the current month's GD!
        // We can look at existingProd.fameList to see what they had previously.
        if (existingProd.fameList) {
            const oldFameMap = {};
            existingProd.fameList.forEach(f => {
                oldFameMap[f.engineer] = f.gdCount || 0; // previously total
            });
            
            prodAnalytics.fameList.forEach(f => {
                // Wait! If they only scraped 1 month, then f.gdCount is CURRENT month!
                // So previous month is in existingProd? Not exactly, existingProd had a 6-month total!
                // Wait, if existingProd had a 6-month total, we can't extract exactly "last month".
                // Actually, if we just keep gdTrendData intact, the FRONTEND can calculate it!
            });
        }
    }

    const payloadProd = {
        lastUpdated: `${dateStr} ${timeStr} WIB`,
        timestamp: Date.now(),
        fameList: prodAnalytics.fameList,
        gdTrendData: prodAnalytics.gdTrendData,
        gdDailyData: prodAnalytics.gdDailyData,
        prodJobs: prodAnalytics.prodJobs,
    };

    console.log('\n☁️ Mengunggah snapshot ke Firebase Firestore (4 dokumen)...');
    console.log(`   Core: ~${(JSON.stringify(payloadCore).length/1024).toFixed(0)}KB`);
    console.log(`   Violations: ~${(JSON.stringify(payloadViolations).length/1024).toFixed(0)}KB`);
    console.log(`   Engineering: ~${(JSON.stringify(payloadEng).length/1024).toFixed(0)}KB`);
    console.log(`   Productivity: ~${(JSON.stringify(payloadProd).length/1024).toFixed(0)}KB`);

    try {
        // Upload 4 docs in parallel for speed
        await Promise.all([
            setDoc(doc(db, 'dashboard_data', 'latest'), payloadCore),
            setDoc(doc(db, 'dashboard_data', 'latest_violations'), payloadViolations),
            setDoc(doc(db, 'dashboard_data', 'latest_eng'), payloadEng),
            setDoc(doc(db, 'dashboard_data', 'latest_prod'), payloadProd),
        ]);
        console.log('  ✅ [LATEST] Semua 4 dokumen dashboard_data berhasil diperbarui!');

        // Archive minimal summary to history (avoid 1MB limit on history too)
        const historyDocRef = doc(db, 'dashboard_history', snapshotId);
        await setDoc(historyDocRef, {
            ...payloadCore,
            archivedAt: dateStr
        });
        console.log(`  ✅ [ARCHIVE] dashboard_history/${snapshotId} tersimpan.`);

        // Clean up temporary downloaded files
        console.log('\n🧹 Membersihkan file temporary downloads...');
        [...downloadedFiles.soFiles, ...downloadedFiles.gdFiles, ...(downloadedFiles.statusFiles || [])].forEach(f => {
            try { 
                const fs = require('fs');
                fs.unlinkSync(f.path); 
            } catch (e) { console.error('FIREBASE RULES FETCH ERROR:', e); }
        });

        console.log('==============================================');
        console.log('  🎉 SINKRONISASI FIREBASE BERHASIL!');
        console.log('==============================================\n');

        return {
            success: true,
            analytics: analytics,
            dateStr: dateStr,
            timeStr: timeStr,
            scheduleSlot: scheduleSlot,
            alertsSent: aiAlertsSent,
            totalRecords: baseData.length
        };
    } catch (err) {
        console.error('❌ FATAL FIREBASE SYNC ERROR:', err);
        throw err;
    }
}

module.exports = { processAndSyncToFirebase, calculateAnalytics, analyzeProductivity, shortenASC, parseExcelFile, parseProductivityFile };
