const xlsx = require('xlsx');
const config = require('./config');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

async function importContacts() {
    const wb = xlsx.readFile('DATA_KONTAK_WA_CABANG_DAN_TEKNISI_BUJM (4).xlsx');
    const sheetName = wb.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);
    
    let phones = {};
    let names = {};
    
    data.forEach(row => {
        const engName = row['NAMA KARYAWAN'];
        const phone = row['NOMOR WHATSAPP'];
        
        if (engName && phone) {
            let phoneStr = phone.toString().trim();
            let cleanedPhone = phoneStr.replace(/[^0-9]/g, '');
            if (cleanedPhone) {
                phones[engName] = cleanedPhone;
                names[engName] = engName;
            }
        }
    });
    
    console.log(`Found ${Object.keys(phones).length} valid contacts.`);
    
    const app = initializeApp(config.FIREBASE_CONFIG, 'contacts_import');
    const auth = getAuth(app);
    const db = getFirestore(app);
    
    await signInAnonymously(auth);
    
    await setDoc(doc(db, 'config', 'contacts'), {
        phones: phones,
        names: names
    }, { merge: true }); // Merge with existing
    
    console.log('Successfully saved to Firebase config/contacts!');
    process.exit(0);
}

importContacts().catch(console.error);
