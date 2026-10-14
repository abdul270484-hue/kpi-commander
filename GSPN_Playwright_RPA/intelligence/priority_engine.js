class PriorityEngine {
    /**
     * Determines priority rank based on risk score, SLA breach, and stagnation.
     * @param {number} riskScore - 0 to 100
     * @param {boolean} isSlaBreached - true if SLA breached
     * @param {number} idleDays - Days without movement
     * @returns {Object} Priority object { level: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", rank: number }
     */
    static calculatePriority(riskScore, isSlaBreached, idleDays) {
        let level = 'LOW';
        let rank = 4; // 1 is highest priority

        if (riskScore >= 80 || isSlaBreached || idleDays > 7) {
            level = 'CRITICAL';
            rank = 1;
        } else if (riskScore >= 50 || idleDays > 3) {
            level = 'HIGH';
            rank = 2;
        } else if (riskScore >= 20 || idleDays > 1) {
            level = 'MEDIUM';
            rank = 3;
        }

        return { level, rank };
    }
}

module.exports = PriorityEngine;
