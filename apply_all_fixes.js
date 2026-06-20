const fs = require('fs');
let js = fs.readFileSync('main.js', 'utf8');

// 1. Restore normalizePhone import
js = js.replace("import { initAuth, isAdmin } from './src/auth.js';", "import { initAuth, isAdmin, normalizePhone } from './src/auth.js';");

// 2. Restore REDO WA text
const oldRedoWA = "`*REPORT PELANGGARAN REDO*\\nLarangan Keras! Ditemukan perbaikan recall, cek agar tidak merusak KPI\\n\\n`";
const newRedoWA = "`*REPORT PELANGGARAN REDO*\\nLarangan Keras! Ditemukan perbaikan recall, cek agar tidak merusak KPI\\nkoordinasikan dengan TS jika bill *IW*\\n\\n`";
js = js.replace(oldRedoWA, newRedoWA);

// 3. Patch PRODUCTIVITY_DONE
const prodOld = `    } else if (type === 'PRODUCTIVITY_DONE') {
        const fameList = payload;
        window.prodData = {}; 
        renderFameTable(fameList);`;

const prodNew = `    } else if (type === 'PRODUCTIVITY_DONE') {
        const fameList = payload;
        window.prodData = fameList; 
        renderFameTable(fameList);
        if (typeof renderDtsIhTable === 'function') renderDtsIhTable();
        if (typeof renderDtsMxTable === 'function') renderDtsMxTable();`;
js = js.replace(prodOld, prodNew);

// 4. Inject GD merge logic for DTS IH (fuzzy match)
const ihOld = `        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            tbodyDtsIh.innerHTML = \`<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data CE hari ini</td></tr>\`;
        } else {
            let list = Object.values(window.dtsIhData);`;

const ihNew = `        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            tbodyDtsIh.innerHTML = \`<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data CE hari ini</td></tr>\`;
        } else {
            if (window.prodData && Array.isArray(window.prodData)) {
                window.prodData.forEach(prod => {
                    const normEng = prod.engineer ? prod.engineer.trim().toUpperCase() : '';
                    if (!normEng) return;
                    for (let key in window.dtsIhData) {
                        const normKey = key.trim().toUpperCase();
                        if (normKey === normEng || normKey.includes(normEng) || normEng.includes(normKey)) {
                            window.dtsIhData[key].gdVisits = prod.dtsIhGdVisits || 0;
                        }
                    }
                });
            }
            let list = Object.values(window.dtsIhData);`;
js = js.replace(ihOld, ihNew);

// 5. Inject GD merge logic for DTS MX (fuzzy match)
const mxOld = `        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            tbodyDtsMx.innerHTML = \`<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data MX hari ini</td></tr>\`;
        } else {
            const sortedDts = Object.values(window.dtsMxData).sort((a, b) => a.asc.localeCompare(b.asc));`;

const mxNew = `        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            tbodyDtsMx.innerHTML = \`<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data MX hari ini</td></tr>\`;
        } else {
            if (window.prodData && Array.isArray(window.prodData)) {
                window.prodData.forEach(prod => {
                    const normEng = prod.engineer ? prod.engineer.trim().toUpperCase() : '';
                    if (!normEng) return;
                    for (let key in window.dtsMxData) {
                        const normKey = key.trim().toUpperCase();
                        if (normKey === normEng || normKey.includes(normEng) || normEng.includes(normKey)) {
                            window.dtsMxData[key].gd = prod.dtsGd || 0;
                        }
                    }
                });
            }
            const sortedDts = Object.values(window.dtsMxData).sort((a, b) => a.asc.localeCompare(b.asc));`;
js = js.replace(mxOld, mxNew);

// 6. Fix Multiple Redo files processing
const regexHandle = /function handleRedoImage\(file\) \{[\s\S]*?\}\s*(?=\nfunction renderRedoTable)/;
const newHandleFunc = `function handleRedoImage(file) {
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
js = js.replace(regexHandle, newHandleFunc + '\n');

const oldDrop = `    redoDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        redoDropZone.style.backgroundColor = 'transparent';
        redoDropZone.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        if (e.dataTransfer.files.length) {
            handleRedoImage(e.dataTransfer.files[0]);
        }
    });

    redoFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleRedoImage(e.target.files[0]);
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
console.log('All missing fixes applied successfully!');
