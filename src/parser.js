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
                const data = new Uint8Array(e.target.result);
                // Assume XLSX is globally available via CDN
                const workbook = window.XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = window.XLSX.utils.sheet_to_json(worksheet, {header: 1});
                resolve(rawData);
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
            showToast('Data kosong! Harap pastikan file .xls di-Save As menjadi .xlsx terlebih dahulu.');
            return;
        }
        
        // Pass to worker (We can add a separate event type for Productivity if needed, but the current worker handles everything in one go or we can split it. Wait, app.js analyzes productivity separately!)
        // In app.js, analyzeProductivity was called separately.
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
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = window.XLSX.utils.sheet_to_json(worksheet);
                resolve({ fileName: fileName, data: json });
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
        
        worker.postMessage({
            type: 'ANALYZE_DATA',
            data: baseData,
            customModels,
            customReasons
        });
    });
}
