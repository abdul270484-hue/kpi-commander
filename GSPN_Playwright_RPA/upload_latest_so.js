const fs = require('fs');
const path = require('path');
const config = require('./config');
const { parseExcelFile, shortenASC } = require('./sync');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

// 1. Build Customer Name Map from STATUS_*.xls files
const statusFiles = fs.readdirSync(config.DOWNLOAD_DIR)
    .filter(f => f.startsWith('STATUS_') && f.endsWith('.xls'));

const customerMap = {};
statusFiles.forEach(f => {
    try {
        const rows = parseExcelFile(path.join(config.DOWNLOAD_DIR, f));
        rows.forEach(r => {
            let t = r['Tracking No'] || r['Tracking No.'] || r['Service Order No.'] || r['Job No'] || r['Order No'];
            let c = r['Customer Name'] || r['Nama Konsumen'] || r['Customer'] || r['Cust Name'];
            if (t && c && String(c).trim() && String(c).trim() !== '-') {
                customerMap[String(t).trim().replace(/\D/g, '')] = String(c).trim();
            }
        });
    } catch (e) {
        console.error('Error parsing status file:', f, e);
    }
});
console.log(`✅ Customer map built: ${Object.keys(customerMap).length} customer names mapped.`);

// 2. Select latest SO files per branch
const files = fs.readdirSync(config.DOWNLOAD_DIR)
    .filter(f => f.startsWith('SO_') && f.endsWith('.xls'));

const latestFiles = {};
files.forEach(f => {
    const parts = f.split('_');
    const ts = parseInt(parts[parts.length - 1].replace('.xls', '')) || 0;
    const prefix = parts.slice(0, parts.length - 1).join('_');
    if (!latestFiles[prefix] || latestFiles[prefix].ts < ts) {
        latestFiles[prefix] = { file: f, ts };
    }
});

const soBillsByBranch = {};
let totalMappedCustomers = 0;
let totalProcessedBills = 0;

for (let k in latestFiles) {
    const fPath = path.join(config.DOWNLOAD_DIR, latestFiles[k].file);
    let rows = [];
    try { rows = parseExcelFile(fPath); } catch (e) { continue; }
    for (let row of rows) {
        let jobNo = 'N/A';
        for (let key in row) {
            let kl = key.toLowerCase().trim();
            if (kl.includes('job') || kl.includes('order') || kl === 'so' || kl === 'so no' || kl === 'service order no.') {
                if (row[key]) { jobNo = String(row[key]).trim(); break; }
            }
        }
        let model = row['Model'] || '-';
        
        // Match Customer Name from customerMap first, then fallback to row keys
        let customer = 'Unknown Customer';
        const cleanJobNo = String(jobNo).trim().replace(/\D/g, '');
        if (cleanJobNo && customerMap[cleanJobNo]) {
            customer = customerMap[cleanJobNo];
            totalMappedCustomers++;
        } else {
            for (let key in row) {
                let kl = key.toLowerCase().trim();
                if (kl === 'customer name' || kl === 'nama konsumen' || kl === 'unit location' || kl === 'customer') {
                    if (row[key] && String(row[key]).trim()) { 
                        customer = String(row[key]).trim(); 
                        totalMappedCustomers++;
                        break; 
                    }
                }
            }
        }
        
        let aging = parseInt(row['Pending aging Days'] || row['Aging']) || 0;
        let reason = row['Reason'] || row['Reason For Pending / Transfer'] || '-';
        let status = row['Status'] || '-';
        let engineer = row['Engineer Name'] ? row['Engineer Name'].toString().trim().toUpperCase().replace(/^\d+\s+/, '') : '-';
        let ascName = shortenASC(row['ASC Name'] || row['ASC'] || row['Service Center'], row, engineer);

        if (!soBillsByBranch[ascName]) soBillsByBranch[ascName] = [];
        soBillsByBranch[ascName].push({
            jobNo, model, customer, pendingDays: aging, reason, status, engineer, asc: ascName
        });
        totalProcessedBills++;
    }
}

console.log(`📊 Total Bills: ${totalProcessedBills} | Customers Identified: ${totalMappedCustomers} (${((totalMappedCustomers/totalProcessedBills)*100).toFixed(1)}%)`);

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

const payloadSO = {
    lastUpdated: `${dateStr} ${timeStr} WIB`,
    timestamp: Date.now(),
    soBillsByBranch: soBillsByBranch
};

const app = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(app);

console.log('Uploading latest_so to Firestore...');
setDoc(doc(db, 'dashboard_data', 'latest_so'), payloadSO).then(() => {
    console.log('✅ latest_so successfully updated in Firestore with real Customer Names!');
    let bujmBranches = ['DENPASAR', 'MANADO', 'KUPANG', 'DENPASAR - CELLULAR WORLD', 'DENPASAR - PLANET GADGET', 'SINGARAJA'];
    bujmBranches.forEach(b => {
        let list = soBillsByBranch[b] || [];
        let identified = list.filter(x => x.customer !== 'Unknown Customer').length;
        console.log(` - ${b}: ${list.length} units (${identified} customers identified)`);
    });
    process.exit(0);
}).catch(err => {
    console.error('❌ Upload failed:', err);
    process.exit(1);
});
