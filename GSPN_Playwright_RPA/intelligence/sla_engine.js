/**
 * SLA Countdown Engine
 * Menghitung batas waktu penyelesaian, sisa waktu SLA, dan status pelanggaran (breach).
 */

class SlaEngine {
    static getSlaTargetDays(category = 'MX', serviceType = 'NORMAL') {
        const cat = String(category || 'MX').toUpperCase();
        if (cat === 'VD') return 4; // TV & Audio
        if (cat === 'DA') return 5; // Kulkas / Mesin Cuci
        return 3; // MX / Smartphone standard SLA = 3 hari
    }

    /**
     * @param {number} pendingDays 
     * @param {string} category 
     */
    static evaluate(pendingDays, category = 'MX') {
        const aging = parseInt(pendingDays || 0, 10);
        const slaTarget = this.getSlaTargetDays(category);
        const delta = aging - slaTarget; // > 0 berarti lewat SLA

        let slaStatus = 'SAFE'; // SAFE, WATCH, WARNING, CRITICAL, BREACH, ESCALATION
        let timeRemainingDesc = '';
        let slaScore = 0; // 0 - 35 point contribution to risk

        if (delta >= 4) {
            slaStatus = 'ESCALATION';
            timeRemainingDesc = `Breach +${delta} hari`;
            slaScore = 35;
        } else if (delta >= 1) {
            slaStatus = 'BREACH';
            timeRemainingDesc = `Breach +${delta} hari`;
            slaScore = 30;
        } else if (delta === 0) {
            slaStatus = 'CRITICAL';
            timeRemainingDesc = 'Jatuh tempo HARI INI (T-0)';
            slaScore = 25;
        } else if (delta === -1) {
            slaStatus = 'WARNING';
            timeRemainingDesc = 'Sisa 1 hari lagi (T-1)';
            slaScore = 15;
        } else if (delta === -2) {
            slaStatus = 'WATCH';
            timeRemainingDesc = 'Sisa 2 hari (T-2)';
            slaScore = 8;
        } else {
            slaStatus = 'SAFE';
            timeRemainingDesc = `Sisa ${Math.abs(delta)} hari`;
            slaScore = 0;
        }

        return {
            category,
            slaTargetDays: slaTarget,
            pendingDays: aging,
            delta,
            isBreached: delta > 0,
            slaStatus,
            timeRemainingDesc,
            slaScore
        };
    }
}

module.exports = { SlaEngine };
