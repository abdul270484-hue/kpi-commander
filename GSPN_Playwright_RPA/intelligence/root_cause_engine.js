/**
 * Root Cause Engine
 * Menentukan akar penyebab deterministik dari pending/aging berdasarkan reason code, status, dan part state.
 */

class RootCauseEngine {
    static classify(bill, isRedo = false, isStagnant = false) {
        if (isRedo || bill.status === 'REDO' || (bill.category === 'REDO')) {
            return {
                code: 'REDO',
                label: 'REDO (Perbaikan Ulang)',
                severity: 'CRITICAL',
                responsibleParty: 'TECHNICIAN'
            };
        }

        const reason = String(bill.reason || bill['Reason'] || bill['Reason For Pending / Transfer'] || '').toUpperCase();
        const status = String(bill.status || bill['Status'] || '').toUpperCase();

        // 1. WAITING PICKUP / DELIVERY
        if (status.includes('COMPLETED') || status === 'RC' || reason.includes('PICK-UP') || reason.includes('PICKUP')) {
            return {
                code: 'WAITING_PICKUP',
                label: 'Menunggu Pengambilan / Delivery Unit',
                severity: 'WARNING',
                responsibleParty: 'FRONT_DESK_LOGISTICS'
            };
        }

        // 2. WAITING SPAREPART (SEIN / Supplier / Gudang)
        if (
            reason.includes('PARTS BACK ORDERED') ||
            reason.includes('PARTS IN TRANSIT') ||
            reason.includes('PARTS NOT AVAILABLE') ||
            reason.includes('PARTS DNA/SNA') ||
            reason.includes('PARTS P/O') ||
            reason.includes('PARTS ALLOCATED') ||
            reason.includes('PARTS ARRIVED BUT NO G/R') ||
            reason.includes('PART')
        ) {
            return {
                code: 'WAITING_SPAREPART',
                label: 'Menunggu Pasokan Sparepart (Part Pending)',
                severity: 'HIGH',
                responsibleParty: 'PARTS_LOGISTICS'
            };
        }

        // 3. WAITING APPROVAL (Samsung / Manajemen)
        if (
            reason.includes('CONFIRMATION FROM SAMSUNG') ||
            reason.includes('PROCESSING EXCHANGE') ||
            reason.includes('APPROVAL')
        ) {
            return {
                code: 'WAITING_APPROVAL',
                label: 'Menunggu Persetujuan Samsung / SEIN',
                severity: 'HIGH',
                responsibleParty: 'MANAGEMENT_SEIN'
            };
        }

        // 4. WAITING CUSTOMER
        if (
            reason.includes('CONFIRMATION FROM CUSTOMER') ||
            reason.includes('RE-SCHEDULING BY CUSTOMER') ||
            reason.includes('CUSTOMER') ||
            reason.includes('KONSUMEN')
        ) {
            return {
                code: 'WAITING_CUSTOMER',
                label: 'Menunggu Konfirmasi / Keputusan Konsumen',
                severity: 'MODERATE',
                responsibleParty: 'CUSTOMER_SERVICE'
            };
        }

        // 5. REPAIR IN PROGRESS
        if (
            reason.includes('REPAIR IN PROGRESS') ||
            status.includes('IN PROGRESS')
        ) {
            return {
                code: 'REPAIR_IN_PROGRESS',
                label: 'Proses Pengerjaan / Servis Sedang Berjalan',
                severity: 'MODERATE',
                responsibleParty: 'TECHNICIAN'
            };
        }

        // 6. WAITING ENGINEER
        if (
            reason.includes('ASSIGN TO ENG') ||
            reason.includes('MONITORING/AGING') ||
            reason.includes('TECHNICAL PROBLEM') ||
            reason.includes('RE-SCHEDULING BY ENG')
        ) {
            return {
                code: 'WAITING_ENGINEER',
                label: 'Kendala Teknis / Tindakan Teknisi',
                severity: 'HIGH',
                responsibleParty: 'TECHNICIAN'
            };
        }

        // 7. NO MOVEMENT / STAGNANT
        if (isStagnant) {
            return {
                code: 'NO_MOVEMENT',
                label: 'Tidak Ada Pergerakan (Stagnan)',
                severity: 'HIGH',
                responsibleParty: 'BRANCH_PIC'
            };
        }

        // 8. ADMINISTRATIVE HOLD
        if (reason.includes('BILLING') || reason.includes('INVOICE') || reason.includes('HOLD')) {
            return {
                code: 'ADMINISTRATIVE_HOLD',
                label: 'Tertahan Urusan Administrasi / Penagihan',
                severity: 'MODERATE',
                responsibleParty: 'ADMIN_BRANCH'
            };
        }

        return {
            code: 'UNKNOWN',
            label: 'Alasan Belum Teridentifikasi',
            severity: 'LOW',
            responsibleParty: 'BRANCH_PIC'
        };
    }
}

module.exports = { RootCauseEngine };
