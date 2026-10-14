const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const config = require('./config');

const app = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(app);

const dir = path.join(__dirname, 'temp_vol_in');
const months = ['2026-07', '2026-08', '2026-09', '2026-10'];

// Buat template counts untuk setiap bulan dan setiap cabang
const results = {};
months.forEach(m => {
    results[m] = {};
    config.ASC_CODES.forEach(b => {
        if (b.short === 'DENPASAR') {
            results[m]['DENPASAR'] = 0;
            results[m]['DENPASAR - CELLULAR WORLD'] = 0;
            results[m]['DENPASAR - PLANET GADGET'] = 0;
        } else {
            results[m][b.short] = 0;
        }
    });
});

function getDenpasarBranch(row) {
    const cc = String(row['Collection Center Name'] || '').toUpperCase();
    if (cc.includes('CELLULAR WORLD') || cc.includes('TEUKU')) {
        return 'DENPASAR - CELLULAR WORLD';
    }
    if (cc.includes('PLANET GADGET') || cc.includes('GATOT')) {
        return 'DENPASAR - PLANET GADGET';
    }
    return 'DENPASAR';
}

console.log('🔄 Memproses seluruh file Excel di temp_vol_in...');
const allFiles = fs.readdirSync(dir);

months.forEach(month => {
    const monthFiles = allFiles.filter(f => f.includes(month) && f.endsWith('.xls'));
    const monthSeenSOs = {}; // branch -> Set(so)

    monthFiles.forEach(fileName => {
        const filePath = path.join(dir, fileName);
        const stat = fs.statSync(filePath);
        if (stat.size < 200) return; // Skip empty files

        // Cari cabang pemilik file
        let matchedBranch = null;
        for (const b of config.ASC_CODES) {
            if (fileName.includes(b.short) || fileName.includes(b.code)) {
                matchedBranch = b.short;
                break;
            }
        }
        if (!matchedBranch) return;

        if (!monthSeenSOs[matchedBranch]) monthSeenSOs[matchedBranch] = new Set();

        try {
            const wb = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false, cellText: false });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet);

            data.forEach(r => {
                const so = r['Service Order No.'] || r['ASC Job No'] || r['No'];
                if (!so || monthSeenSOs[matchedBranch].has(so)) return;
                monthSeenSOs[matchedBranch].add(so);

                let targetBranch = matchedBranch;
                if (matchedBranch === 'DENPASAR') {
                    targetBranch = getDenpasarBranch(r);
                }

                results[month][targetBranch] = (results[month][targetBranch] || 0) + 1;
            });
        } catch (err) {
            console.warn(`[WARN] Gagal membaca ${fileName}:`, err.message);
        }
    });
});

console.log('\n--- HASIL REKAP VOL IN MTD 2026-10 (TGL 01 s/d 13) AREA UTAMA ---');
const priority = ['DENPASAR', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET', 'KUPANG', 'MANADO', 'SINGARAJA', 'MAKASSAR', 'SERPONG', 'BANJARMASIN'];
priority.forEach(b => {
    console.log(`  ${b.padEnd(30)} : ${results['2026-10'][b]}`);
});

async function saveToFirestore() {
    console.log('\n📡 Menyimpan data lengkap VOL IN ke Firestore (dashboard_data/latest_prod)...');
    const docRef = doc(db, 'dashboard_data', 'latest_prod');
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
        console.error('Document latest_prod not found!');
        return;
    }
    const current = snap.data();
    const existingVolIn = current.volInTrendData || {};

    for (const m of months) {
        existingVolIn[m] = {
            ...(existingVolIn[m] || {}),
            ...results[m]
        };
    }

    // Set base MTD & last locked date agar konsisten
    const updatePayload = {
        volInTrendData: existingVolIn,
        volInLastUpdated: new Date().toISOString()
    };

    await updateDoc(docRef, updatePayload);
    console.log('✅ SUKSES: Firestore latest_prod.volInTrendData berhasil diperbarui untuk seluruh cabang!');
}

saveToFirestore().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
