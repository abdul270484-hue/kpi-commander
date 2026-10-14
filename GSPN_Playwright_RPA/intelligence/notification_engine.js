const { doc, getDoc, setDoc } = require('firebase/firestore');

// In-Memory cache deduplikasi agar tidak membuang ribuan read/write Firestore setiap 15 menit
const sentAlertKeysCache = new Set();

class NotificationEngine {
    /**
     * Creates and logs a notification request to be picked up by the Notification Dispatcher.
     * Implements anti-spam by checking if the exact same alert was already sent recently.
     * @param {Object} db - Firestore instance
     * @param {Object} jobData - Job data containing trackingNo, branch, etc.
     * @param {Object} intelligenceResult - The output from the AgingIntelligenceFacade
     */
    static async triggerAlert(db, jobData, intelligenceResult) {
        if (!intelligenceResult || !intelligenceResult.priority) return;

        // Only alert for Critical, High, or specific Anomaly cases
        const shouldAlert = 
            intelligenceResult.priority.level === 'CRITICAL' || 
            intelligenceResult.priority.level === 'HIGH' ||
            intelligenceResult.anomaly !== null;
            
        if (!shouldAlert) return;

        const alertKey = `${jobData.trackingNo}_${jobData.status}_${intelligenceResult.priority.level}`;

        // 1. Cek memory cache lokal (0 Reads Firestore!)
        if (sentAlertKeysCache.has(alertKey)) {
            return { status: 'SKIPPED_DUPLICATE', alertKey };
        }

        const alertRef = doc(db, 'bujm_robot_alerts', alertKey);

        try {
            sentAlertKeysCache.add(alertKey);
            const snapshot = await getDoc(alertRef);
            if (snapshot.exists()) {
                // Anti-spam: Already alerted for this exact state
                return { status: 'SKIPPED_DUPLICATE', alertKey };
            }

            const alertPayload = {
                trackingNo: jobData.trackingNo,
                branch: jobData.branch || 'UNKNOWN',
                engineer: jobData.engineer || 'Unknown',
                agingDays: jobData.agingDays || 0,
                status: jobData.status,
                reason: jobData.reason,
                priorityLevel: intelligenceResult.priority.level,
                actionRecommendation: intelligenceResult.action.actionText,
                riskScore: intelligenceResult.riskScore,
                anomaly: intelligenceResult.anomaly ? intelligenceResult.anomaly.type : null,
                createdAt: new Date().toISOString(),
                acknowledged: false, // Manager must acknowledge this in the UI
                escalated: false
            };

            await setDoc(alertRef, alertPayload);
            return { status: 'ALERT_CREATED', alertKey };
        } catch (error) {
            console.error(`[NotificationEngine] Failed to create alert for ${jobData.trackingNo}:`, error);
            return { status: 'ERROR', error: error.message };
        }
    }
}

module.exports = NotificationEngine;
