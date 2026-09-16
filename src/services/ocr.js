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
        console.log("Raw OCR Text:", text);

        // Preprocess text to fix common OCR misreadings for 10-digit numbers starting with 4
        // 1. Remove spaces or hyphens that split 10-digit numbers (e.g. 4436 455768 -> 4436455768)
        let cleanedText = text.replace(/(4\d{2,4})[\s\-]+(\d{4,7})/g, '$1$2');
        
        // 2. Fix common character confusions in 10-digit candidate strings (O/o->0, I/l/|->1, S/s->5, B->8, A/a->4)
        cleanedText = cleanedText.replace(/\b[4Aa][0-9OoSsIiLlBb|]{9}\b/g, m => {
            return m.replace(/[O|o]/g, '0')
                    .replace(/[I|l|i|\|]/g, '1')
                    .replace(/[S|s]/g, '5')
                    .replace(/B/g, '8')
                    .replace(/[A|a]/g, '4');
        });

        // 3. Match 10-digit job numbers starting with 4 (or 43/44/45/49 etc)
        const regex = /4\d{9}/g;
        const matchesRaw = text.match(regex) || [];
        const matchesCleaned = cleanedText.match(regex) || [];
        const combinedMatches = [...matchesRaw, ...matchesCleaned];
        
        if (combinedMatches.length === 0) {
            return { success: true, uniqueJobs: [] };
        }

        // Hapus duplikat job number
        const uniqueJobs = [...new Set(combinedMatches)];
        console.log("Extracted Job Numbers:", uniqueJobs);
        return { success: true, uniqueJobs };
    } catch (err) {
        console.error("OCR Error:", err);
        return { error: 'Terjadi kesalahan saat memproses gambar OCR.' };
    }
}
