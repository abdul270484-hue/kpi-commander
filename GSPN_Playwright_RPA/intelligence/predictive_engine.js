class PredictiveEngine {
    /**
     * Predicts potential future risk based on current trajectory and historical patterns.
     * @param {Object} jobData - Job data
     * @param {number} riskScore - Current risk score
     * @returns {Object} Prediction result
     */
    static predictAgingRisk(jobData, riskScore) {
        const { reason, status } = jobData;
        const lowerReason = (reason || '').toLowerCase();
        const lowerStatus = (status || '').toLowerCase();

        let riskVector = 'STABLE';
        let predictionText = 'Risiko penuaan stabil.';

        // Prediction 1: Parts ordered but not yet shipped (based on typical patterns)
        if (lowerReason.includes('part') && (lowerReason.includes('order') || lowerStatus.includes('order'))) {
            riskVector = 'INCREASING';
            predictionText = 'Diprediksi akan menjadi aging tinggi jika part tidak tiba dalam 2 hari ke depan.';
        }

        // Prediction 2: Customer consideration phase usually delays things
        if (lowerReason.includes('consider') || lowerReason.includes('tunggu setuju')) {
            riskVector = 'HIGH_PROBABILITY_AGING';
            predictionText = 'Customer yang menunda persetujuan (consideration) rata-rata menyumbang 40% kasus aging > 14 hari. Butuh follow up ketat.';
        }

        // Prediction 3: Repeated repairs (redo) escalate quickly
        if (lowerReason.includes('redo') || lowerReason.includes('berulang')) {
            riskVector = 'CRITICAL_TRAJECTORY';
            predictionText = 'Kasus berulang/redo berpotensi tinggi memicu komplain berat jika melewati 7 hari.';
        }

        return { riskVector, predictionText };
    }
}

module.exports = PredictiveEngine;
