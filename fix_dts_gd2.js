const fs = require('fs');
let js = fs.readFileSync('main.js', 'utf8');

// Patch 1: renderDtsIhTable
const ihOld = `        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            tbodyDtsIh.innerHTML = \`<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data CE hari ini</td></tr>\`;
        } else {
            let list = Object.values(window.dtsIhData);`;

const ihNew = `        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            tbodyDtsIh.innerHTML = \`<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data CE hari ini</td></tr>\`;
        } else {
            if (window.prodData && Array.isArray(window.prodData)) {
                window.prodData.forEach(prod => {
                    if (window.dtsIhData[prod.engineer]) {
                        window.dtsIhData[prod.engineer].gdVisits = prod.dtsIhGdVisits || 0;
                    }
                });
            }
            let list = Object.values(window.dtsIhData);`;

if (js.includes(ihOld)) {
    js = js.replace(ihOld, ihNew);
    console.log('Patched renderDtsIhTable successfully!');
} else {
    console.log('Failed to find target in renderDtsIhTable!');
}

// Patch 2: renderDtsMxTable
const mxOld = `        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            tbodyDtsMx.innerHTML = \`<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data MX hari ini</td></tr>\`;
        } else {
            const sortedDts = Object.values(window.dtsMxData).sort((a, b) => a.asc.localeCompare(b.asc));`;

const mxNew = `        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            tbodyDtsMx.innerHTML = \`<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data MX hari ini</td></tr>\`;
        } else {
            if (window.prodData && Array.isArray(window.prodData)) {
                window.prodData.forEach(prod => {
                    if (window.dtsMxData[prod.engineer]) {
                        window.dtsMxData[prod.engineer].gd = prod.dtsGd || 0;
                    }
                });
            }
            const sortedDts = Object.values(window.dtsMxData).sort((a, b) => a.asc.localeCompare(b.asc));`;

if (js.includes(mxOld)) {
    js = js.replace(mxOld, mxNew);
    console.log('Patched renderDtsMxTable successfully!');
} else {
    console.log('Failed to find target in renderDtsMxTable!');
}

// Write the result back
fs.writeFileSync('main.js', js);
