// ==========================================
// FILE PARSING & DRAG-DROP HANDLER
// ==========================================

import { validateHeaders } from './analytics.js';

function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function showToast(msg) {
    if (window.showToastNotification) {
        window.showToastNotification(msg);
    } else {
        alert(msg);
    }
}

export function handleProductivityFiles(fileList, worker) {
    showLoading();
    let promises = [];
    
    for (let i = 0; i < fileList.length; i++) {
        let file = fileList[i];
        let promise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = window.XLSX.read(data, {type: 'array'});
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    let rawData = window.XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: ""});
                    
                    if (!rawData || rawData.length === 0) throw new Error("Empty Array");
                    resolve(rawData);
                } catch(err) {
                    // Fallback HTML Parse
                    const textReader = new FileReader();
                    textReader.onload = function(e2) {
                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(e2.target.result, 'text/html');
                            const table = doc.querySelector('table');
                            if (table) {
                                const wb = window.XLSX.utils.table_to_book(table);
                                const ws = wb.Sheets[wb.SheetNames[0]];
                                const rawData = window.XLSX.utils.sheet_to_json(ws, {header: 1, defval: ""});
                                resolve(rawData);
                            } else {
                                resolve([]);
                            }
                        } catch(e3) { resolve([]); }
                    };
                    textReader.readAsText(file);
                }
            };
            reader.readAsArrayBuffer(file);
        });
        promises.push(promise);
    }
    
    Promise.all(promises).then((results) => {
        let mergedData = [];
        results.forEach(rawData => {
            mergedData = mergedData.concat(rawData);
        });
        
        if (mergedData.length === 0) {
            hideLoading();
            showToast('Gagal membaca data! Pastikan file benar-benar berisi tabel.');
            return;
        }
        
        worker.postMessage({
            type: 'ANALYZE_PRODUCTIVITY',
            data: mergedData
        });
    });
}

export function handleFiles(fileList, worker, customModels, customReasons) {
    showLoading();
    let promises = [];
    
    for (let i = 0; i < fileList.length; i++) {
        let file = fileList[i];
        let fileName = file.name.toUpperCase();
        
        let promise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = window.XLSX.read(data, {type: 'array'});
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = window.XLSX.utils.sheet_to_json(worksheet, {defval: ""});
                    if (!json || json.length === 0) throw new Error("Empty");
                    resolve({ fileName: fileName, data: json });
                } catch(err) {
                    // Fallback HTML Parse
                    const textReader = new FileReader();
                    textReader.onload = function(e2) {
                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(e2.target.result, 'text/html');
                            const table = doc.querySelector('table');
                            if (table) {
                                const wb = window.XLSX.utils.table_to_book(table);
                                const ws = wb.Sheets[wb.SheetNames[0]];
                                const json = window.XLSX.utils.sheet_to_json(ws, {defval: ""});
                                resolve({ fileName: fileName, data: json });
                            } else {
                                resolve({ fileName: fileName, data: [] });
                            }
                        } catch(e3) { resolve({ fileName: fileName, data: [] }); }
                    };
                    textReader.readAsText(file);
                }
            };
            reader.readAsArrayBuffer(file);
        });
        promises.push(promise);
    }
    
    Promise.all(promises).then((results) => {
        let baseData = [];
        let statusData = [];
        
        results.forEach(result => {
            if (result.fileName.includes('STATUS')) {
                statusData = statusData.concat(result.data);
            } else {
                baseData = baseData.concat(result.data);
            }
        });
        
        // Auto-VLOOKUP
        if (statusData.length > 0) {
            let customerMap = {};
            statusData.forEach(row => {
                let trackingNo = row['Tracking No'];
                let customerName = row['Customer Name'];
                if (trackingNo && customerName) {
                    customerMap[trackingNo] = customerName;
                }
            });
            
            baseData.forEach(row => {
                let soNo = row['Service Order No.'];
                if (soNo && customerMap[soNo]) {
                    row['Customer Name'] = customerMap[soNo];
                }
            });
        }
        
        if (baseData.length === 0) {
            hideLoading();
            showToast('Data tidak terdeteksi! Jika menggunakan file .xls dari sistem, buka file tersebut di Excel dan lakukan "Save As" ke format .xlsx terlebih dahulu.');
            return;
        }

        // Header Validation (Try-Catch equivalent for robust data)
        if (baseData.length > 0) {
            const missingHeaders = validateHeaders(Object.keys(baseData[0]));
            if (missingHeaders.length > 0) {
                hideLoading();
                showToast(`<strong>Format Berubah!</strong><br>Kolom berikut hilang dari Excel: <b>${missingHeaders.join(', ')}</b>. Hubungi developer.`);
                return;
            }
        }
        
        window.globalRawSOList = baseData; // Save for DP Tracker reuse
        
        worker.postMessage({
            type: 'ANALYZE_DATA',
            data: baseData,
            customModels,
            customReasons
        });
    });
}
