// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================

export const CONFIG = {
    // Admin WhatsApp Number for Access Requests
    ADMIN_WA_NUMBER: '6285249946694',

    // Targets & Benchmarks
    TARGET_GD_MX: 6.4,
    TARGET_GD_CE: 2.4,

    // Default Custom Models mapping (Prefix -> Category)
    DEFAULT_CUSTOM_MODELS: [
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
        { keyword: 'AX', category: 'DA' },
        { keyword: 'VP', category: 'DA' },
        { keyword: 'NZ', category: 'DA' },
        { keyword: 'NA', category: 'DA' }
    ]
};

// ASC Formatting Logic
export function shortenASC(ascName) {
    if (!ascName) return 'Unknown ASC';
    const name = String(ascName).toUpperCase();
    if (name.includes('MAHENDRADATA')) return 'DPS';
    if (name.includes('KUPANG')) return 'KPG';
    if (name.includes('SINGARAJA')) return 'SGJ';
    
    // Fallback if there are others
    if (name.includes('SAMSUNG SERVICE CENTER')) {
        return name.replace('SAMSUNG SERVICE CENTER', '').trim();
    }
    if (name.includes('PT. BEKARYA UGERTAMA JAYA MANDIRI')) {
        return name.replace('PT. BEKARYA UGERTAMA JAYA MANDIRI', '').trim();
    }
    if (name.includes('PT BEKARYA UGERTAMA JAYA MANDIRI')) {
        return name.replace('PT BEKARYA UGERTAMA JAYA MANDIRI', '').trim();
    }
    return ascName;
}
