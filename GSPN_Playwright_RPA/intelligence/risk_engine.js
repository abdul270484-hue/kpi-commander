/**
 * Aging Risk Engine
 * Menghitung skor risiko aging multi-faktor (0 - 100) secara deterministik dan terukur.
 */

class RiskEngine {
    /**
     * @param {Object} factors - { agingDays, slaScore, stagnationScore, isRedo, rootCauseSeverity }
     */
    static calculateScore(factors) {
        const {
            agingDays = 0,
            slaScore = 0,
            stagnationScore = 0,
            isRedo = false,
            rootCauseSeverity = 'LOW'
        } = factors;

        // 1. Komponen Aging Murni (Max 30 poin)
        // 1-3 hari: 5 poin, 4-7 hari: 15 poin, 8-14 hari: 25 poin, >14 hari: 30 poin
        let agingScore = 0;
        if (agingDays > 14) agingScore = 30;
        else if (agingDays > 7) agingScore = 25;
        else if (agingDays > 3) agingScore = 15;
        else if (agingDays > 0) agingScore = 5;

        // 2. Komponen SLA (Max 30 poin, dari SlaEngine: 0 - 35)
        const normalizedSla = Math.min(30, slaScore);

        // 3. Komponen Stagnasi (Max 20 poin, dari StagnationDetector: 0 - 30)
        const normalizedStagnation = Math.min(20, stagnationScore);

        // 4. Komponen REDO (Penalti 15 poin jika repair ulang)
        const redoScore = isRedo ? 15 : 0;

        // 5. Komponen Severity Root Cause (Max 5 poin)
        let causeScore = 0;
        if (rootCauseSeverity === 'CRITICAL') causeScore = 5;
        else if (rootCauseSeverity === 'HIGH') causeScore = 3;

        const totalScore = Math.min(100, Math.max(0, agingScore + normalizedSla + normalizedStagnation + redoScore + causeScore));

        let riskLevel = 'SAFE';
        let riskColor = '#10b981'; // green

        if (totalScore >= 81) {
            riskLevel = 'CRITICAL';
            riskColor = '#ef4444'; // red
        } else if (totalScore >= 61) {
            riskLevel = 'HIGH';
            riskColor = '#f97316'; // orange
        } else if (totalScore >= 41) {
            riskLevel = 'WARNING';
            riskColor = '#eab308'; // yellow
        } else if (totalScore >= 21) {
            riskLevel = 'WATCH';
            riskColor = '#3b82f6'; // blue
        } else {
            riskLevel = 'SAFE';
            riskColor = '#10b981';
        }

        return {
            riskScore: totalScore,
            riskLevel,
            riskColor,
            breakdown: {
                agingScore,
                slaScore: normalizedSla,
                stagnationScore: normalizedStagnation,
                redoScore,
                causeScore
            }
        };
    }
}

module.exports = { RiskEngine };
