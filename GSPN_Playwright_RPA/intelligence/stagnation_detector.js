/**
 * Stagnation Detector (Movement vs Idle)
 * Membedakan antara aging lama tapi sedang dikerjakan, dengan unit yang mangkrak tanpa pergerakan.
 */

class StagnationDetector {
    /**
     * @param {Object} bill - item pending
     * @param {Date} referenceDate - tanggal acuan (biasanya now)
     */
    static analyze(bill, referenceDate = new Date()) {
        const agingDays = parseInt(bill.pendingDays || bill['Pending aging Days'] || 0, 10);
        
        // Cari tanggal pergerakan terakhir dari data SO
        let lastMovementDate = null;
        const candidateDateFields = [
            bill['Change Date'],
            bill['Status comment Date'],
            bill['Part Received Date'],
            bill['1st Visit Date'],
            bill['ASC Last Appointment Date'],
            bill['Engineer Assigned Date'],
            bill['Request Date']
        ];

        for (const candidate of candidateDateFields) {
            if (!candidate) continue;
            const parsed = this.parseDate(candidate);
            if (parsed && !isNaN(parsed.getTime())) {
                if (!lastMovementDate || parsed.getTime() > lastMovementDate.getTime()) {
                    lastMovementDate = parsed;
                }
            }
        }

        let idleDays = 0;
        let idleHours = 0;
        if (lastMovementDate) {
            const diffMs = Math.max(0, referenceDate.getTime() - lastMovementDate.getTime());
            idleHours = Math.round(diffMs / (1000 * 3600));
            idleDays = Math.floor(idleHours / 24);
        } else {
            // Jika tidak ada data tanggal update, gunakan perkiraan dari pendingDays
            idleDays = agingDays;
            idleHours = agingDays * 24;
        }

        let isStagnant = false;
        let stagnationLevel = 'ACTIVE'; // ACTIVE, WATCH, STAGNANT, CRITICAL_STAGNANT
        let stagnationScore = 0; // 0 - 30 point contribution to risk

        if (idleDays >= 7) {
            isStagnant = true;
            stagnationLevel = 'CRITICAL_STAGNANT';
            stagnationScore = 30;
        } else if (idleDays >= 3) {
            isStagnant = true;
            stagnationLevel = 'STAGNANT';
            stagnationScore = 20;
        } else if (idleDays >= 2) {
            stagnationLevel = 'WATCH';
            stagnationScore = 10;
        } else {
            stagnationLevel = 'ACTIVE';
            stagnationScore = 0;
        }

        return {
            agingDays,
            idleDays,
            idleHours,
            lastMovementDate: lastMovementDate ? lastMovementDate.toISOString() : null,
            isStagnant,
            stagnationLevel,
            stagnationScore
        };
    }

    static parseDate(val) {
        if (!val) return null;
        if (val instanceof Date) return val;
        const s = String(val).trim();
        // Handle DD/MM/YYYY or YYYY-MM-DD or DD.MM.YYYY
        const dmyMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        if (dmyMatch) {
            return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
        }
        const parsed = new Date(s);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
}

module.exports = { StagnationDetector };
