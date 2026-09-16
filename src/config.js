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
export function shortenASC(ascName, row = null) {
    if (!ascName && !row) return 'Unknown ASC';

    // Check Collection Center Name if row is provided (for splitting Cellular World & Planet Gadget from Denpasar Mahendradatta)
    if (row && typeof row === 'object') {
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
    name = name.replace(/PT\.?\s*BEKARYA\s+UGERTAMA\s+JAYA\s+MANDIRI\s*/gi, '')
               .replace(/SAMSUNG\s+SERVICE\s+CENTER\s*/gi, '')
               .replace(/UNICOM\s*/gi, '')
               .trim();

    const u = name.toUpperCase();
    if (u.includes('CELLULAR WORLD') || u.includes('TEUKU')) return 'DENPASAR - CELLULAR WORLD';
    if (u.includes('PLANET GADGET') || u.includes('GATOT')) return 'DENPASAR - PLANET GADGET';
    if (u.includes('MAHENDRA') || u.includes('DENPASAR')) return 'DENPASAR';
    if (u.includes('KUPANG')) return 'KUPANG';
    if (u.includes('SINGARAJA')) return 'SINGARAJA';

    return name || ascName || 'Unknown ASC';
}
