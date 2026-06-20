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

export function parseExcelDate(dateVal, formatHint = null, applyCorruptionFix = false) {
    if (dateVal == null) return null;
    let dateObj = null;
    
    if (typeof dateVal === 'number') {
        dateObj = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        
        // Anti-Corruption logic: Excel may have swapped day and month when reading DD/MM/YYYY
        if (applyCorruptionFix && formatHint === 'DD/MM/YYYY') {
            let m = dateObj.getMonth(); // 0-11
            let d = dateObj.getDate(); // 1-31
            let y = dateObj.getFullYear();
            
            // Only swap if day <= 12, because these are the only dates Excel could successfully misinterpret
            if (m < 12 && d <= 12) {
                // E.g., original 02/06/2026 (June 2) -> Excel parses as Feb 6 (m=1, d=6).
                // We want to reconstruct June 2. New month = d - 1. New day = m + 1.
                dateObj = new Date(y, d - 1, m + 1);
            }
        }
    } else if (typeof dateVal === 'string') {
        let str = dateVal.trim();
        // If it contains letters (like "Jun"), native parsing handles it best
        if (str.match(/[a-zA-Z]/)) {
            dateObj = new Date(str);
        } else {
            const parts = str.split(/[-/ :.]/);
            if (parts.length >= 3) {
                // If year is first (YYYY-MM-DD)
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
                        // Autodetect
                        if (parseInt(p0) > 12) {
                            dateObj = new Date(`${year}-${p1}-${p0}T00:00:00`);
                        } else if (parseInt(p1) > 12) {
                            dateObj = new Date(`${year}-${p0}-${p1}T00:00:00`);
                        } else {
                            dateObj = new Date(`${year}-${p0}-${p1}T00:00:00`); // Fallback MM/DD/YYYY
                        }
                    }
                }
            } else {
                dateObj = new Date(str);
            }
        }
    }
    
    // Validate the date
    if (dateObj && isNaN(dateObj.getTime())) {
        return null;
    }
    
    return dateObj;
}

export function isDateToday(dateVal, formatHint = null, applyCorruptionFix = false) {
    let parsedDate = parseExcelDate(dateVal, formatHint, applyCorruptionFix);
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
