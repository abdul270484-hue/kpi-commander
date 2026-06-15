// ==========================================
// CORE ANALYTICS & MATH FUNCTIONS
// ==========================================

import { CONFIG, shortenASC } from './config.js';

export const SEIN_REASONS = [
    "Parts Back Ordered (Samsung)",
    "Parts In Transit (Samsung)",
    "Parts not available (ASC)",
    "Parts DNA/SNA (ASC)",
    "Parts P/O Cancellation",
    "Parts Allocated(Samsung)"
];

export const AGING_REASONS = [
    "Monitoring/Aging or Not reproduced",
    "Re-scheduling by Eng'r or ASC",
    "Re-scheduling by Customer",
    "Waiting for confirmation from customer",
    "Repair In Progress After Parts Receive",
    "Waiting for confirmation from SAMSUNG",
    "Processing exchange",
    "Parts Arrived but no G/R yet(ASC)",
    "Request Tech support (Technical problem)"
];

export function getCategory(model, customModels = []) {
    if (!model) return 'UNKNOWN';
    const m = String(model).toUpperCase();

    // Check custom rules first
    for (let rule of customModels) {
        if (m.startsWith(rule.keyword)) return rule.category;
    }

    // Default Fallbacks from CONFIG
    for (let rule of CONFIG.DEFAULT_CUSTOM_MODELS) {
        if (m.startsWith(rule.keyword)) return rule.category;
    }

    return 'UNKNOWN';
}

export function parseExcelDate(dateVal) {
    if (!dateVal) return null;
    let dateObj = null;
    if (typeof dateVal === 'number') {
        let dateRaw = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        let dateSwapped = new Date(dateRaw.getFullYear(), dateRaw.getDate() - 1, dateRaw.getMonth() + 1);
        
        let diffRaw = Date.now() - dateRaw.getTime();
        let diffSwapped = Date.now() - dateSwapped.getTime();
        
        let validRaw = !isNaN(dateRaw.getTime()) && diffRaw >= -86400000;
        let validSwapped = !isNaN(dateSwapped.getTime()) && diffSwapped >= -86400000;
        
        if (validRaw && validSwapped) {
            dateObj = (diffRaw < diffSwapped) ? dateRaw : dateSwapped;
        } else if (validRaw) {
            dateObj = dateRaw;
        } else {
            dateObj = dateSwapped;
        }
    } else if (typeof dateVal === 'string') {
        const parts = dateVal.split(/[-/ :.]/);
        if (parts.length >= 3) {
            let p0 = parts[0].padStart(2, '0');
            let p1 = parts[1].padStart(2, '0');
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            
            let dateA = new Date(`${year}-${p1}-${p0}T00:00:00`);
            let dateB = new Date(`${year}-${p0}-${p1}T00:00:00`);
            
            let diffA = Date.now() - dateA.getTime();
            let diffB = Date.now() - dateB.getTime();
            
            let validA = !isNaN(dateA.getTime()) && diffA >= -86400000;
            let validB = !isNaN(dateB.getTime()) && diffB >= -86400000;
            
            if (validA && validB) {
                dateObj = (diffA < diffB) ? dateA : dateB;
            } else if (validA) {
                dateObj = dateA;
            } else {
                dateObj = dateB;
            }
        } else {
            dateObj = new Date(dateVal);
        }
    }
    return dateObj;
}

export function isDateToday(dateVal) {
    let parsedDate = parseExcelDate(dateVal);
    if (!parsedDate || isNaN(parsedDate.getTime())) return false;
    let today = new Date();
    return parsedDate.getDate() === today.getDate() &&
           parsedDate.getMonth() === today.getMonth() &&
           parsedDate.getFullYear() === today.getFullYear();
}

export function isExpensivePart(desc, category) {
    if (!desc) return false;
    const d = String(desc).toUpperCase();
    if (category === 'VD') {
        return d.includes('PANEL') || d.includes('MODULE') || d.includes('ASSY BOARD P') || d.includes('ASSY PCB MAIN');
    } else if (category === 'MX') {
        return d.includes('OCTA') || d.includes('PBA MAIN');
    } else if (category === 'DA') {
        return d.includes('COMPRESSOR') || d.includes('PCB MAIN') || d.includes('ASSY BOARD');
    }
    return false;
}

export function isReasonMatched(reasonStr, predefinedList, customKeywords) {
    if (!reasonStr) return false;
    if (predefinedList.includes(reasonStr)) return true;
    const rUpper = String(reasonStr).toUpperCase();
    for (let kw of customKeywords) {
        if (rUpper === kw) return true;
    }
    return false;
}

export function validateHeaders(headers) {
    const requiredHeaders = ['Service Order No.', 'ASC Name', 'Status', 'Model', 'Pending aging Days', 'In Out Warranty Flag'];
    const missing = [];
    
    // Check if the provided headers row has the required columns
    const headerRowString = headers.map(h => String(h).trim().toLowerCase());
    
    requiredHeaders.forEach(req => {
        if (!headerRowString.includes(req.toLowerCase())) {
            missing.push(req);
        }
    });
    
    return missing;
}
