const fs = require('fs');
const path = require('path');
const { doc, getDoc, setDoc, updateDoc, collection, addDoc } = require('firebase/firestore');

const STALE_TIMEOUT_MS = 15 * 60 * 1000; // 15 menit tanpa heartbeat = STALE

function generateExecutionId() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
    const hms = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `RPA-${ymd}-${hms}-${rand}`;
}

class ExecutionLockManager {
    constructor(db) {
        this.db = db;
        this.currentExecutionId = null;
        this.heartbeatTimer = null;
        this.lockDocRef = doc(db, 'rpa_commands', 'trigger');
        this.historyCollectionRef = collection(db, 'rpa_execution_history');
    }

    async acquireLock(triggerType = 'MANUAL', startedBy = 'System') {
        const snap = await getDoc(this.lockDocRef);
        const now = Date.now();
        const data = snap.exists() ? snap.data() : null;

        if (data && (data.status === 'RUNNING' || data.status === 'STARTING')) {
            const lastHeartbeat = data.heartbeatAt || data.requestedAt || 0;
            const ageMs = now - lastHeartbeat;

            if (ageMs < STALE_TIMEOUT_MS) {
                return {
                    success: false,
                    reason: 'LOCKED',
                    message: `RPA sedang berjalan (ID: ${data.executionId}, berjalan ${Math.round(ageMs/1000)}s lalu).`,
                    currentExecutionId: data.executionId,
                    startedAt: data.startedAt
                };
            } else {
                console.warn(`⚠️ [STALE DETECTED] Eksekusi ${data.executionId} tidak responsif selama ${Math.round(ageMs/60000)}m. Mengambil alih lock...`);
                // Catat riwayat eksekusi sebelumnya sebagai STALE
                await this.logHistory({
                    executionId: data.executionId || 'UNKNOWN',
                    status: 'STALE',
                    startedAt: data.startedAt,
                    completedAt: new Date().toLocaleString('id-ID'),
                    durationSec: Math.round(ageMs / 1000),
                    error: 'Execution timed out (no heartbeat).'
                }).catch(() => {});
            }
        }

        const executionId = generateExecutionId();
        this.currentExecutionId = executionId;
        const startedAtStr = new Date().toLocaleString('id-ID');

        await setDoc(this.lockDocRef, {
            status: 'STARTING',
            command: 'RUN_NOW',
            executionId: executionId,
            triggerType: triggerType,
            startedBy: startedBy,
            startedAt: startedAtStr,
            heartbeatAt: now,
            currentStep: 'STARTING',
            progress: 'Memulai mesin RPA...',
            progressCurrent: 0,
            progressTotal: 0,
            progressPct: 0,
            error: null
        }, { merge: true });

        // Mulai periodic local heartbeat
        this.startHeartbeatLoop(executionId);

        return {
            success: true,
            executionId: executionId,
            startedAt: startedAtStr
        };
    }

    startHeartbeatLoop(executionId) {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(async () => {
            if (this.currentExecutionId !== executionId) {
                clearInterval(this.heartbeatTimer);
                return;
            }
            try {
                await updateDoc(this.lockDocRef, {
                    heartbeatAt: Date.now()
                }).catch(() => {});
            } catch (_) {}
        }, 15000); // 15 detik heartbeat
    }

    async updateProgress(step, progressText, current = 0, total = 0, extra = {}) {
        if (!this.currentExecutionId) return;
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        await setDoc(this.lockDocRef, {
            status: 'RUNNING',
            currentStep: step,
            progress: progressText,
            progressCurrent: current,
            progressTotal: total,
            progressPct: pct,
            heartbeatAt: Date.now(),
            ...extra
        }, { merge: true }).catch(() => {});
    }

    async releaseLock(finalStatus = 'COMPLETED', summaryData = {}) {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        const executionId = this.currentExecutionId;
        const completedAtStr = new Date().toLocaleString('id-ID');

        await setDoc(this.lockDocRef, {
            status: finalStatus,
            completedAt: completedAtStr,
            heartbeatAt: Date.now(),
            progress: finalStatus === 'COMPLETED' ? 'Selesai! Data Dashboard terupdate.' : `Gagal: ${summaryData.error || ''}`,
            error: summaryData.error || null,
            branchesSuccess: summaryData.branchesSuccess || 0,
            branchesFailed: summaryData.branchesFailed || 0,
            recordsProcessed: summaryData.recordsProcessed || 0
        }, { merge: true }).catch(() => {});

        // Simpan ke rpa_execution_history
        await this.logHistory({
            executionId: executionId,
            status: finalStatus,
            startedAt: summaryData.startedAt || completedAtStr,
            completedAt: completedAtStr,
            triggerType: summaryData.triggerType || 'UNKNOWN',
            startedBy: summaryData.startedBy || 'System',
            branchesSuccess: summaryData.branchesSuccess || 0,
            branchesFailed: summaryData.branchesFailed || 0,
            recordsProcessed: summaryData.recordsProcessed || 0,
            alertsSent: summaryData.alertsSent || 0,
            error: summaryData.error || null,
            durationSec: summaryData.durationSec || 0
        }).catch(err => console.warn('Gagal mencatat rpa_execution_history:', err.message));

        this.currentExecutionId = null;
    }

    async logHistory(historyItem) {
        if (!this.db) return;
        const cleanDoc = {
            ...historyItem,
            timestamp: Date.now()
        };
        await addDoc(this.historyCollectionRef, cleanDoc);
    }
}

module.exports = {
    ExecutionLockManager,
    generateExecutionId,
    STALE_TIMEOUT_MS
};
