const fs = require('fs');
let js = fs.readFileSync('main.js', 'utf8');

// 1. Fix PRODUCTIVITY_DONE to save fameList to window.prodData and trigger re-renders
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

// 2. Inject GD merge logic into renderDtsIhTable
const ihOld = `function renderDtsIhTable() {
    const tbodyDtsIh = document.querySelector('#dts-ih-table tbody');
    if (tbodyDtsIh) {
        tbodyDtsIh.innerHTML = '';
        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
            tbodyDtsIh.innerHTML = \`<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data CE hari ini</td></tr>\`;
        } else {
            let list = Object.values(window.dtsIhData);`;

const ihNew = `function renderDtsIhTable() {
    const tbodyDtsIh = document.querySelector('#dts-ih-table tbody');
    if (tbodyDtsIh) {
        tbodyDtsIh.innerHTML = '';
        if (!window.dtsIhData || Object.keys(window.dtsIhData).length === 0) {
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
js = js.replace(ihOld, ihNew);

// 3. Inject GD merge logic into renderDtsMxTable
const mxOld = `function renderDtsMxTable() {
    const tbodyDtsMx = document.querySelector('#dts-mx-table tbody');
    if (tbodyDtsMx) {
        tbodyDtsMx.innerHTML = '';
        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            tbodyDtsMx.innerHTML = \`<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data MX hari ini</td></tr>\`;
        } else {
            let list = Object.values(window.dtsMxData);`;

const mxNew = `function renderDtsMxTable() {
    const tbodyDtsMx = document.querySelector('#dts-mx-table tbody');
    if (tbodyDtsMx) {
        tbodyDtsMx.innerHTML = '';
        if (!window.dtsMxData || Object.keys(window.dtsMxData).length === 0) {
            tbodyDtsMx.innerHTML = \`<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data MX hari ini</td></tr>\`;
        } else {
            if (window.prodData && Array.isArray(window.prodData)) {
                window.prodData.forEach(prod => {
                    if (window.dtsMxData[prod.engineer]) {
                        window.dtsMxData[prod.engineer].gdCount = prod.dtsGd || 0;
                    }
                });
            }
            let list = Object.values(window.dtsMxData);`;
js = js.replace(mxOld, mxNew);

fs.writeFileSync('main.js', js);
console.log('GD merge logic for DTS IH and MX successfully injected.');
