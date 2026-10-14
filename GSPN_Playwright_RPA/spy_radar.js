const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, onSnapshot, collection } = require('firebase/firestore');

// 1. Config BUJM
const bujmConfig = {
    projectId: "management-bujm-dashboard",
    appId: "1:686973979324:web:312ee50bb607be47621eb9",
    storageBucket: "management-bujm-dashboard.firebasestorage.app",
    apiKey: "AIzaSyDLKSMnHgiRE0v1KMW7S2iOOL4MjZ272pg",
    authDomain: "management-bujm-dashboard.firebaseapp.com",
    messagingSenderId: "686973979324"
};

// 2. Config Aging Commander
const agingConfig = {
    apiKey: "AIzaSyBLbVbEAZ_jvfkBD0YL_lXpVvIQAz0ZCLM",
    authDomain: "aging-commander.firebaseapp.com",
    projectId: "aging-commander",
    storageBucket: "aging-commander.firebasestorage.app",
    messagingSenderId: "286087165205",
    appId: "1:286087165205:web:07c7d7380b0c5a2ca8251c"
};

console.log('🕵️‍♂️ [SPY MODE ACTIVATED] Mengamati pergerakan RPA & Pipeline Real-time...\n');

async function main() {
    const bujmApp = initializeApp(bujmConfig, 'SpyBujm');
    const bujmAuth = getAuth(bujmApp);
    const bujmDb = getFirestore(bujmApp);

    const agingApp = initializeApp(agingConfig, 'SpyAging');
    const agingDb = getFirestore(agingApp);

    try {
        await signInAnonymously(bujmAuth);
        console.log('🔑 Auth Anonymous BUJM Berhasil.');
    } catch (e) {
        console.warn('⚠️ Auth Anonymous BUJM:', e.message);
    }

    // Monitor RPA Trigger & Status
    console.log('📡 [RADAR 1] Menempel pada rpa_commands/trigger (BUJM)...');
    onSnapshot(doc(bujmDb, 'rpa_commands', 'trigger'), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const time = new Date().toLocaleTimeString('id-ID');
        console.log(`\n🤖 [RPA EVENT @ ${time}] Status: ${d.status || 'N/A'} | ${d.progress || ''}`);
        if (d.progressPct !== undefined) {
            console.log(`   Progres: ${d.progressPct}% (${d.progressCurrent || 0}/${d.progressTotal || 0} cabang)`);
        }
    });

    // Monitor Latest BUJM Dashboard Data
    console.log('📡 [RADAR 2] Menempel pada dashboard_data/latest (BUJM Dashboard)...');
    let lastBujmUpdate = null;
    onSnapshot(doc(bujmDb, 'dashboard_data', 'latest'), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const ts = d.updatedAt || d.lastSync || 'Updated';
        if (ts !== lastBujmUpdate) {
            lastBujmUpdate = ts;
            console.log(`\n🎉 [BUJM DASHBOARD UPDATE] Data baru sukses mendarat di Dashboard BUJM!`);
            console.log(`   Total Service Orders : ${d.totalServiceOrders || d.totalOrders || 'N/A'}`);
            console.log(`   Total Aging          : ${d.totalAging || d.totalLtp || 'N/A'}`);
        }
    });

    // Monitor Aging Commander Collection
    console.log('📡 [RADAR 3] Menempel pada collection aging_tracking (Aging Commander)...');
    let initCountPassed = false;
    onSnapshot(collection(agingDb, 'aging_tracking'), (snap) => {
        const totalDocs = snap.size;
        const time = new Date().toLocaleTimeString('id-ID');
        if (!initCountPassed) {
            initCountPassed = true;
            console.log(`   [Baseline Aging Commander] Jumlah Job saat ini: ${totalDocs} dokumen.\n`);
            console.log('🎯 RADAR AKTIF & MENGINTAI! Sedang memantau proses download & sync...\n');
            return;
        }
        console.log(`\n⚡ [AGING COMMANDER SYNC @ ${time}] Snapshot terpantau!`);
        console.log(`   Total Active Jobs di Database Baru: ${totalDocs} dokumen`);
    });
}

main();
