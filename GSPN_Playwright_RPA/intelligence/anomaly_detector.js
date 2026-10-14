class AnomalyDetector {
    /**
     * Detects anomalies like jobs that are completed but left unclosed for too long,
     * or parts ordered but not arriving way past standard ETA.
     * @param {Object} jobData - Cleaned job data object
     * @param {number} idleDays - Days without movement
     * @returns {Object|null} Anomaly data or null if normal
     */
    static detectAnomaly(jobData, idleDays) {
        const { status, reason } = jobData;
        const statusLower = (status || '').toLowerCase();
        const reasonLower = (reason || '').toLowerCase();

        // Anomaly 1: Repaired but not closed for > 3 days
        if (statusLower.includes('repaired') || statusLower.includes('complete')) {
            if (idleDays >= 3 && !statusLower.includes('close')) {
                return {
                    type: 'FORGOTTEN_CLOSURE',
                    description: 'Unit sudah selesai diperbaiki tapi tidak di-close/diserahkan selama lebih dari 3 hari.'
                };
            }
        }



        // Anomaly 3: Stuck in diagnosis for > 3 days
        if (statusLower.includes('diagnos') || (reasonLower.includes('diagnos'))) {
            if (idleDays >= 3) {
                return {
                    type: 'SLOW_DIAGNOSIS',
                    description: 'Proses diagnosa oleh teknisi memakan waktu lebih dari 3 hari.'
                };
            }
        }

        // Anomaly 4: No movement > 2 days for specific high-attention reasons
        const strictlyMonitoredReasons = [
            'repair in progress',
            "assign to eng'r after parts receive",
            "assign to eng'r after parts received",
            'monitoring/aging or not reproduced',
            "re-scheduling by eng'r or asc",
            're-scheduling by customer',
            'waiting for confirmation from customer',
            'repair in progress after parts receive'
        ];
        
        if (idleDays > 2) {
            for (let monitored of strictlyMonitoredReasons) {
                if (reasonLower.includes(monitored)) {
                    return {
                        type: 'STAGNANT_CRITICAL_REASON',
                        description: `Status stagnan > 2 hari pada tahap kritis: ${reason}. Wajib follow up!`
                    };
                }
            }
        }

        return null; // No anomaly detected
    }
}

module.exports = AnomalyDetector;
