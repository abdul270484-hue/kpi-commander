const { initializeApp } = require('firebase/app');
const { getFirestore, doc, onSnapshot, collection, query, orderBy, limit, getDocs } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = initializeApp(config.FIREBASE_CONFIG);
const db = getFirestore(app);
const triggerRef = doc(db, 'rpa_commands', 'trigger');

console.log('>>> [WATCHER] Memulai pemantauan intensif siklus RPA GSPN...');
console.log('Waktu Mulai Watcher: ' + new Date().toLocaleString('id-ID'));

let initialExecutionId = null;
let lastHeartbeat = Date.now();
let lastStep = '';

const timeoutTimer = setTimeout(() => {
    console.error('⚠️ [TIMEOUT] Watcher mencapai batas waktu maksimal (25 menit). Menghentikan pemantauan.');
    process.exit(1);
}, 25 * 60 * 1000);

// Monitor perubahan dokumen trigger
onSnapshot(triggerRef, async (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();
    lastHeartbeat = data.heartbeatAt || Date.now();

    if (!initialExecutionId && data.executionId) {
        initialExecutionId = data.executionId;
        console.log(`[INFO] Terkunci pada Execution ID: ${initialExecutionId} (Started: ${data.startedAt || '-'}, Trigger: ${data.triggerType})`);
    }

    const stepInfo = `[${data.currentStep || data.status}] ${data.progress || ''}`;
    if (stepInfo !== lastStep) {
        lastStep = stepInfo;
        const now = new Date().toLocaleTimeString('id-ID');
        console.log(`[${now}] 🔄 Step: ${data.currentStep} (${data.progressPct || 0}%) | ${data.progress || '-'}`);
    }

    // Jika siklus telah selesai (COMPLETED / FAILED / IDLE setelah running)
    const isFinished = (data.status === 'COMPLETED' || data.status === 'FAILED') ||
                       (data.status === 'IDLE' && initialExecutionId && data.executionId !== initialExecutionId);

    if (isFinished) {
        clearTimeout(timeoutTimer);
        console.log('\n============================================================');
        console.log(`🏁 [FINISH DETECTED] Status Akhir: ${data.status}`);
        console.log(`Waktu Selesai: ${data.completedAt || new Date().toLocaleString('id-ID')}`);
        console.log('============================================================');

        // Tunggu 3 detik untuk final logging di history
        await new Promise(r => setTimeout(r, 3000));

        // Ambil riwayat eksekusi terbaru dari rpa_execution_history
        try {
            const histQ = query(collection(db, 'rpa_execution_history'), orderBy('timestamp', 'desc'), limit(1));
            const histSnap = await getDocs(histQ);
            if (!histSnap.empty) {
                const hData = histSnap.docs[0].data();
                console.log('\n--- RIWAYAT EKSEKUSI TERAKHIR ---');
                console.log(JSON.stringify(hData, null, 2));
            }
        } catch (e) {
            console.log('Warning saat ambil history:', e.message);
        }

        // Cek data file lokal jika ada
        const dlDir = config.DOWNLOAD_DIR;
        const volDir = path.join(__dirname, 'temp_vol_in');
        
        let soCount = 0, gdCount = 0, volInCount = 0;
        if (fs.existsSync(dlDir)) {
            const files = fs.readdirSync(dlDir);
            soCount = files.filter(f => f.startsWith('SO_')).length;
            gdCount = files.filter(f => f.startsWith('GD_')).length;
        }
        if (fs.existsSync(volDir)) {
            volInCount = fs.readdirSync(volDir).filter(f => f.startsWith('VOL_IN_')).length;
        }

        console.log('\n--- RINGKASAN FILE TERUNDUH ---');
        console.log(`SO Files     : ${soCount}`);
        console.log(`GD Files     : ${gdCount}`);
        console.log(`VOL IN Files : ${volInCount}`);
        console.log('-------------------------------\n');

        console.log('Execution Detail:');
        console.log(`- Execution ID      : ${data.executionId || initialExecutionId}`);
        console.log(`- Started At        : ${data.startedAt || '-'}`);
        console.log(`- Completed At      : ${data.completedAt || new Date().toLocaleString('id-ID')}`);
        console.log(`- Status            : ${data.status}`);
        console.log(`- Branches Success  : ${data.branchesSuccess || '-'}`);
        console.log(`- Branches Failed   : ${data.branchesFailed || 0}`);
        console.log(`- Records Processed : ${data.recordsProcessed || '-'}`);
        console.log(`- Final Error       : ${data.error || 'NIHIL (SUKSES PENUH)'}`);

        process.exit(0);
    }
}, (err) => {
    console.error('❌ Error watcher trigger:', err.message);
});
