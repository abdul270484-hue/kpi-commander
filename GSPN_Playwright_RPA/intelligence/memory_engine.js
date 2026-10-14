const admin = require('firebase-admin');

class MemoryEngine {
    /**
     * Compares current state with previous known state in DB to track changes and acknowledgments.
     * @param {Object} db - Firestore database instance
     * @param {string} branch - Branch name
     * @param {string} trackingNo - Job tracking number
     * @param {Object} currentJobData - The newly scraped data
     * @returns {Promise<Object>} Memory analysis result
     */
    static async recall(db, branch, trackingNo, currentJobData) {
        try {
            // Read previous state from Firestore
            const snapshot = await db.collection('bujm_dashboard_data')
                .doc(branch)
                .collection('service_orders')
                .doc(trackingNo)
                .get();

            let hasMoved = false;
            let previousState = null;
            let timeInCurrentStateDays = 0;

            if (snapshot.exists) {
                previousState = snapshot.data();
                
                // Has status or reason changed?
                if (previousState.status !== currentJobData.status || 
                    previousState.reason !== currentJobData.reason) {
                    hasMoved = true;
                }

                // If not moved, calculate how long it's been in this state (using lastUpdated)
                if (!hasMoved && previousState.lastUpdated) {
                    const lastUpdatedDate = previousState.lastUpdated.toDate ? previousState.lastUpdated.toDate() : new Date(previousState.lastUpdated);
                    const diffTime = Math.abs(new Date() - lastUpdatedDate);
                    timeInCurrentStateDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }
            } else {
                // New job, hasn't been seen before
                hasMoved = true; 
            }

            return {
                isNew: !snapshot.exists,
                hasMoved,
                previousState,
                timeInCurrentStateDays
            };
        } catch (error) {
            console.error(`[MemoryEngine] Error recalling memory for ${trackingNo}:`, error);
            return { error: true, isNew: true, hasMoved: true, timeInCurrentStateDays: 0 };
        }
    }
}

module.exports = MemoryEngine;
