const XLSX = require('xlsx');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const agingConfig = {
  apiKey: "AIzaSyBLbVbEAZ_jvfkBD0YL_lXpVvIQAz0ZCLM",
  authDomain: "aging-commander.firebaseapp.com",
  projectId: "aging-commander"
};

const app = initializeApp(agingConfig);
const db = getFirestore(app);

async function main() {
    const wb = XLSX.readFile('DATA_KONTAK_WA_CABANG_DAN_TEKNISI_BUJM (4).xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    const managerMap = {};
    
    for (let row of data) {
        const manager = (row['AREA MANAGER'] || '').trim().toUpperCase();
        let branch = (row['KODE / NAMA CABANG (ASC)'] || '').trim().toUpperCase();
        
        if (!manager || !branch || manager === '-' || manager.includes('MANAGER')) continue;
        
        // Fix up branch names to make them standard
        if (branch.includes('DENPASAR')) branch = 'DENPASAR';
        
        if (!managerMap[manager]) {
            managerMap[manager] = new Set();
        }
        managerMap[manager].add(branch);
    }
    
    const kelolaUsers = [];
    for (const [manager, branches] of Object.entries(managerMap)) {
        kelolaUsers.push({
            nama: manager,
            branches: Array.from(branches)
        });
    }
    
    console.log('Managers found:', kelolaUsers.map(k => k.nama).join(', '));
    
    await setDoc(doc(db, 'config', 'kelola_user'), {
        users: kelolaUsers
    });
    
    console.log('Successfully uploaded kelola_user to Firebase!');
    process.exit(0);
}

main().catch(console.error);
