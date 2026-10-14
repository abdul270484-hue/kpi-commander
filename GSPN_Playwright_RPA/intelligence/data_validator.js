const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

class DataValidator {
    static validateFile(filePath, expectedType = 'SO') {
        const result = {
            valid: false,
            filePath,
            fileName: path.basename(filePath),
            sizeBytes: 0,
            rowCount: 0,
            error: null,
            isErrorPage: false
        };

        if (!fs.existsSync(filePath)) {
            result.error = 'File does not exist on disk';
            return result;
        }

        const stats = fs.statSync(filePath);
        result.sizeBytes = stats.size;

        if (stats.size < 200) {
            result.error = `File size suspiciously small (${stats.size} bytes)`;
            return result;
        }

        try {
            const buffer = fs.readFileSync(filePath);
            const sampleText = buffer.toString('utf8', 0, Math.min(buffer.length, 2048));

            // Cek tanda-tanda halaman error / sesi mati GSPN
            const errorSignatures = [
                'GSPN system is not available',
                'System Error',
                'Session has expired',
                'Please login again',
                'Authentication required',
                'SaveToExcel.jsp'
            ];

            for (const sig of errorSignatures) {
                if (sampleText.includes(sig)) {
                    result.error = `GSPN error page detected: "${sig}"`;
                    result.isErrorPage = true;
                    return result;
                }
            }

            // Baca konten Excel / HTML Table
            if (sampleText.includes('<table') || sampleText.includes('<tr')) {
                // HTML table export
                const fullText = buffer.toString('utf8');
                const rowMatches = fullText.match(/<tr/gi);
                result.rowCount = rowMatches ? rowMatches.length : 0;
                if (result.rowCount < 2) {
                    result.error = 'HTML table has insufficient rows (< 2)';
                    return result;
                }
            } else {
                // Binary XLS / BIFF8
                const wb = XLSX.read(buffer, { type: 'buffer', header: 1 });
                if (!wb.SheetNames || wb.SheetNames.length === 0) {
                    result.error = 'No sheets found in Excel file';
                    return result;
                }
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                result.rowCount = rows.length;
                if (result.rowCount < 2) {
                    result.error = 'Excel sheet has insufficient rows (< 2)';
                    return result;
                }
            }

            result.valid = true;
            return result;
        } catch (err) {
            result.error = `Parse validation error: ${err.message}`;
            return result;
        }
    }

    static validateBatch(downloadedFiles, previousSummary = null) {
        const report = {
            canProceed: true,
            soValid: 0,
            soCorrupt: 0,
            gdValid: 0,
            gdCorrupt: 0,
            statusValid: 0,
            issues: []
        };

        (downloadedFiles.soFiles || []).forEach(f => {
            const v = this.validateFile(f.path, 'SO');
            if (v.valid) report.soValid++;
            else {
                report.soCorrupt++;
                report.issues.push(`SO [${f.path}]: ${v.error}`);
            }
        });

        (downloadedFiles.gdFiles || []).forEach(f => {
            const v = this.validateFile(f.path, 'GD');
            if (v.valid) report.gdValid++;
            else {
                report.gdCorrupt++;
                report.issues.push(`GD [${f.path}]: ${v.error}`);
            }
        });

        (downloadedFiles.statusFiles || []).forEach(f => {
            const v = this.validateFile(f.path, 'STATUS');
            if (v.valid) report.statusValid++;
            else {
                report.issues.push(`STATUS CUST: ${v.error}`);
            }
        });

        // BAD DATA PROTECTION:
        // Jika 0 SO valid padahal ada percobaan download, JANGAN OVERWRITE DATA FIREBASE!
        if ((downloadedFiles.soFiles || []).length > 0 && report.soValid === 0) {
            report.canProceed = false;
            report.issues.unshift('CRITICAL: Seluruh file SO gagal validasi / kosong. Proteksi bad-data aktif: Sinkronisasi dibatalkan!');
        }

        return report;
    }
}

module.exports = { DataValidator };
