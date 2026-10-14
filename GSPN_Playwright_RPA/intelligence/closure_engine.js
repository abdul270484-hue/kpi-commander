class ClosureEngine {
    /**
     * Verifies if a job has been genuinely closed/completed.
     * @param {Object} jobData - Cleaned job data
     * @returns {Object} Closure verification result
     */
    static verifyClosure(jobData) {
        const { status, reason } = jobData;
        const lowerStatus = (status || '').toLowerCase();
        
        let isClosed = false;
        let closureType = null; // 'SUCCESS' or 'CANCELLED'

        if (lowerStatus.includes('close') || lowerStatus.includes('closed')) {
            isClosed = true;
            closureType = 'SUCCESS';
        } else if (lowerStatus.includes('cancel') && lowerStatus.includes('closed')) {
            // Some systems might have "Closed (Canceled)"
            isClosed = true;
            closureType = 'CANCELLED';
        }

        return {
            isClosed,
            closureType
        };
    }
}

module.exports = ClosureEngine;
