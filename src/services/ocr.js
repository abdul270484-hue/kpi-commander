// ============================================
// OCR SERVICE (Persistent Tesseract Worker)
// ============================================

let ocrWorker = null;
let ocrInitPromise = null;

/**
 * Inisialisasi Tesseract Worker secara asinkron di latar belakang
 * agar saat pengguna mengunggah gambar, mesin sudah siap dan tidak perlu loading ulang.
 */
export async function initTesseract() {
    if (!ocrInitPromise) {
        ocrInitPromise = (async () => {
            try {
                ocrWorker = await Tesseract.createWorker('eng', 1, {
                    logger: m => {
                        // Optional: bisa uncomment jika ingin melihat progress di console
                        // console.log(m);
                    }
                });
                console.log("✅ Tesseract Persistent Worker Initialized!");
            } catch (err) {
                console.error("Gagal menginisialisasi Tesseract:", err);
            }
        })();
    }
    return ocrInitPromise;
}

/**
 * Memindai gambar menggunakan OCR untuk menemukan Service Order No.
 * @param {File} file - Gambar screenshot REDO
 * @returns {Promise<{success: boolean, uniqueJobs?: string[], error?: string}>}
 */
export async function scanRedoImage(file) {
    if (!file.type.startsWith('image/')) {
        return { error: 'File harus berupa gambar (Screenshot)!' };
    }
    
    // Pastikan worker sudah siap
    if (!ocrWorker) {
        await initTesseract();
    }

    try {
        const { data: { text } } = await ocrWorker.recognize(file);
        
        // Cari angka 10 digit yang berawalan angka 4
        const regex = /\b4\d{9}\b/g;
        const matches = text.match(regex);
        
        if (!matches || matches.length === 0) {
            return { success: true, uniqueJobs: [] };
        }

        // Hapus duplikat job number
        const uniqueJobs = [...new Set(matches)];
        return { success: true, uniqueJobs };
    } catch (err) {
        console.error("OCR Error:", err);
        return { error: 'Terjadi kesalahan saat memproses gambar OCR.' };
    }
}
