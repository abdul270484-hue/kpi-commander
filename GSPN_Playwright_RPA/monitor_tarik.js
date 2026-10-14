const { initializeApp } = require('firebase/app');
const { getFirestore, doc, onSnapshot } = require('firebase/firestore');
const config = require('./config');

const app = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(app);
const triggerRef = doc(db, 'rpa_commands', 'trigger');

console.log('📡 [MONITOR RPA] Menghubungkan ke Firebase Firestore listener...');
console.log('Menunggu event auto tarik atau remote trigger...\n');

let lastState = '';

onSnapshot(triggerRef, (snap) => {
    if (!snap.exists()) {
        console.log(`[${new Date().toLocaleTimeString('id-ID')}] Dokumen trigger belum ada.`);
        return;
    }

    const data = snap.data();
    const currentState = `${data.status}|${data.currentStep}|${data.progress}|${data.progressCurrent}/${data.progressTotal}`;
    
    if (currentState === lastState) return;
    lastState = currentState;

    const time = new Date().toLocaleTimeString('id-ID');
    const status = data.status || 'UNKNOWN';
    const step = data.currentStep || '-';
    const progress = data.progress || '-';
    const current = data.progressCurrent || 0;
    const total = data.progressTotal || 0;
    const triggerType = data.triggerType || '-';
    const startedBy = data.startedBy || '-';

    console.log(`[${time}] ⚡ Status: ${status} | Trigger: ${triggerType} (${startedBy})`);
    console.log(`         📍 Step: ${step} [${current}/${total}]`);
    console.log(`         💬 Detail: ${progress}`);
    if (data.error) {
        console.log(`         ❌ Error: ${data.error}`);
    }
    console.log('------------------------------------------------------------');
}, (err) => {
    console.error('❌ Error listener:', err.message);
});
