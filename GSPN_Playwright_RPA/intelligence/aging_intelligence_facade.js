const { StagnationDetector } = require('./stagnation_detector');
const { SlaEngine } = require('./sla_engine');
const { RootCauseEngine } = require('./root_cause_engine');
const { RiskEngine } = require('./risk_engine');
const PriorityEngine = require('./priority_engine');
const ActionEngine = require('./action_engine');
const AnomalyDetector = require('./anomaly_detector');
const PredictiveEngine = require('./predictive_engine');
const ClosureEngine = require('./closure_engine');

class AgingIntelligenceFacade {
    /**
     * Evaluates a single job by running it through all intelligence engines.
     * This acts as the brain for the "AGING SUPERVISOR ROBOT".
     * 
     * @param {Object} jobData - Parsed and cleaned job data from GSPN
     * @param {Object} memoryResult - Output from MemoryEngine.recall()
     * @returns {Object} Comprehensive intelligence evaluation
     */
    static evaluate(jobData, memoryResult) {
        // 1. Is it closed?
        const closure = ClosureEngine.verifyClosure(jobData);
        if (closure.isClosed) {
            return {
                isClosed: true,
                closureType: closure.closureType,
                message: 'Kasus sudah selesai.'
            };
        }

        // 2. Calculate Stagnation & SLA
        const stagnationResult = StagnationDetector.analyze(jobData);
        const idleDays = stagnationResult.idleDays || 0;
        const sla = SlaEngine.evaluate(jobData.agingDays, jobData.category);
        
        // 3. Determine Root Cause
        const rootCause = RootCauseEngine.classify(jobData);

        // 4. Calculate Risk Score
        const riskScore = RiskEngine.calculateScore(jobData, idleDays, rootCause, sla.isBreached);

        // 5. Determine Priority Rank
        const priority = PriorityEngine.calculatePriority(riskScore, sla.isBreached, idleDays);

        // 6. Recommend Action
        const action = ActionEngine.recommendAction(rootCause, priority.level, jobData.status);

        // 7. Detect Anomalies
        const anomaly = AnomalyDetector.detectAnomaly(jobData, idleDays);

        // 8. Predict Trajectory
        const prediction = PredictiveEngine.predictAgingRisk(jobData, riskScore);

        return {
            isClosed: false,
            idleDays,
            sla,
            rootCause,
            riskScore,
            priority,
            action,
            anomaly,
            prediction,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = AgingIntelligenceFacade;
