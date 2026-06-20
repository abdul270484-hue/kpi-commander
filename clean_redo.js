const fs = require('fs');
let js = fs.readFileSync('main.js', 'utf8');

// The block to replace starts at "// --- REDO OCR SCANNER LOGIC ---"
// and ends right before "function renderRedoTable()"

const startMarker = "// --- REDO OCR SCANNER LOGIC ---";
const endMarker = "function renderRedoTable() {";

const startIndex = js.indexOf(startMarker);
const endIndex = js.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find markers!");
    process.exit(1);
}

const cleanBlock = `// --- REDO OCR SCANNER LOGIC ---
const redoDropZone = document.getElementById('redo-drop-zone');
const redoFileInput = document.getElementById('redo-file-input');

if (redoDropZone && redoFileInput) {
    redoDropZone.addEventListener('click', () => redoFileInput.click());

    redoDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        redoDropZone.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.8)';
    });

    redoDropZone.addEventListener('dragleave', () => {
        redoDropZone.style.backgroundColor = 'transparent';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    });

    async function processMultipleRedoFiles(files) {
        if (!files.length) return;
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
        showToastNotification(\`Memulai pemindaian AI pada \${files.length} gambar... Mohon tunggu.\`);
        
        for (let i = 0; i < files.length; i++) {
            if (files.length > 1) {
                showToastNotification(\`Memindai gambar \${i+1} dari \${files.length}...\`);
            }
            await handleRedoImage(files[i]);
        }
        
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        showToastNotification('Scan OCR Selesai! Tabel Redo telah diperbarui.');
        renderRedoTable();
    }

    redoDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        redoDropZone.style.backgroundColor = 'transparent';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        if (e.dataTransfer.files.length) {
            processMultipleRedoFiles(Array.from(e.dataTransfer.files));
        }
    });

    redoFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            processMultipleRedoFiles(Array.from(e.target.files));
        }
    });
}

function handleRedoImage(file) {
    if (!file.type.startsWith('image/')) {
        showToastNotification('File harus berupa gambar (Screenshot)!');
        return Promise.resolve();
    }
    
    if (!window.branchData) {
        showToastNotification('Tolong upload file Excel harian (Service Order List) terlebih dahulu sebagai database pencocokan!');
        return Promise.resolve();
    }

    return Tesseract.recognize(
        file,
        'eng',
        { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
        console.log('OCR Result:', text);
        
        // Find 10-digit numbers starting with 4
        const regex = /\\b4\\d{9}\\b/g;
        const matches = text.match(regex);
        
        if (!matches || matches.length === 0) {
            console.log('Tidak ditemukan Service Order No di gambar tersebut!');
            return;
        }

        // Deduplicate
        const uniqueJobs = [...new Set(matches)];
        console.log('Detected Job Numbers:', uniqueJobs);
        
        // Cross Reference
        window.redoList = window.redoList || [];
        
        uniqueJobs.forEach(jobNo => {
            // Check if already in redo list
            if (window.redoList.find(r => r.jobNo === jobNo)) return;
            
            // Search in branchData
            let matchedBill = null;
            let matchedAsc = null;
            
            for (const asc in window.branchData) {
                const bills = window.branchData[asc].bills.total;
                const found = bills.find(b => b.jobNo === jobNo);
                if (found) {
                    matchedBill = found;
                    matchedAsc = asc;
                    break;
                }
            }
            
            if (matchedBill) {
                window.redoList.push({
                    asc: matchedAsc,
                    jobNo: matchedBill.jobNo,
                    engineer: matchedBill.engineer,
                    model: matchedBill.model,
                    customer: matchedBill.customer,
                    category: matchedBill.category,
                    status: matchedBill.status
                });
            }
        });
        
    }).catch(err => {
        console.error(err);
    });
}

`;

const newJs = js.substring(0, startIndex) + cleanBlock + js.substring(endIndex);
fs.writeFileSync('main.js', newJs);
console.log("REDO Block cleaned up successfully!");
