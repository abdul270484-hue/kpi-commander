class ActionEngine {
    /**
     * Recommends operational actions based on root cause, priority, and current state.
     * @param {string} rootCauseCategory - Category from RootCauseEngine
     * @param {string} priorityLevel - "CRITICAL", "HIGH", "MEDIUM", "LOW"
     * @param {string} currentStatus - Raw GSPN status
     * @returns {Object} Action recommendation { actionCode: string, actionText: string }
     */
    static recommendAction(rootCauseCategory, priorityLevel, currentStatus) {
        let actionCode = 'MONITOR';
        let actionText = 'Monitor status perkembangan tiket.';

        if (priorityLevel === 'CRITICAL') {
            actionCode = 'ESCALATE_HQ';
            actionText = `ESKALASI KRITIS: Kasus ${rootCauseCategory.label} dengan risiko tinggi. Membutuhkan intervensi Manager / HQ hari ini.`;
        } else {
            switch(rootCauseCategory.code) {
                case 'WAITING_PART':
                    actionCode = 'FOLLOWUP_PART';
                    actionText = 'Cek estimasi kedatangan part (ETA). Jika delay, segera kabari customer untuk ekspektasi.';
                    break;
                case 'WAITING_CUSTOMER':
                    actionCode = 'FOLLOWUP_CUST';
                    actionText = 'Hubungi customer (WA/Telepon) untuk kepastian. Berikan batas waktu (deadline) persetujuan.';
                    break;
                case 'PENDING_REPAIR':
                    actionCode = 'PUSH_TECHNICIAN';
                    actionText = 'Unit sudah bisa dikerjakan. Dorong teknisi untuk segera menyelesaikan perbaikan hari ini.';
                    break;
                case 'PENDING_ADMIN':
                    actionCode = 'PUSH_ADMIN';
                    actionText = 'Status menggantung di sisi admin/sistem. Segera proses closing atau penagihan ke sistem pusat.';
                    break;
                default:
                    if (currentStatus.includes('Cancel') || currentStatus.includes('Closed')) {
                        actionCode = 'VERIFY_CLOSURE';
                        actionText = 'Pastikan unit sudah diserahkan kembali dan dokumen tertutup rapat di sistem.';
                    } else {
                        actionCode = 'REVIEW_MANUAL';
                        actionText = 'Review manual kondisi unit. Status tidak bergerak.';
                    }
            }
        }

        return { actionCode, actionText };
    }
}

module.exports = ActionEngine;
