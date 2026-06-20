const fs = require('fs');

let js = fs.readFileSync('main.js', 'utf8');

const newFunc = `function handleRedoImage(file) {
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
}`;

// We will use regex to replace the old handleRedoImage
const regexHandle = /function handleRedoImage\(file\) \{[\s\S]*?\}\s*(?=\nfunction renderRedoTable)/;
js = js.replace(regexHandle, newFunc + '\n');

// Now update the event listeners to manage the loading overlay and render
const oldDrop = `    redoDropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        redoDropZone.style.backgroundColor = 'transparent';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        if (e.dataTransfer.files.length) {
            const files = Array.from(e.dataTransfer.files);
            for (let i = 0; i < files.length; i++) {
                if (files.length > 1) {
                    showToastNotification(\`Memproses gambar \${i+1} dari \${files.length}...\`);
                }
                await handleRedoImage(files[i], i === files.length - 1);
            }
        }
    });

    redoFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length) {
            const files = Array.from(e.target.files);
            for (let i = 0; i < files.length; i++) {
                if (files.length > 1) {
                    showToastNotification(\`Memproses gambar \${i+1} dari \${files.length}...\`);
                }
                await handleRedoImage(files[i], i === files.length - 1);
            }
        }
    });`;

const newDrop = `    async function processMultipleRedoFiles(files) {
        if (!files.length) return;
        loadingOverlay.classList.remove('hidden');
        showToastNotification(\`Memulai pemindaian AI pada \${files.length} gambar... Mohon tunggu.\`);
        
        for (let i = 0; i < files.length; i++) {
            if (files.length > 1) {
                showToastNotification(\`Memindai gambar \${i+1} dari \${files.length}...\`);
            }
            await handleRedoImage(files[i]);
        }
        
        loadingOverlay.classList.add('hidden');
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
    });`;

js = js.replace(oldDrop, newDrop);

fs.writeFileSync('main.js', js);
console.log('REDO multiple file processing logic updated.');
