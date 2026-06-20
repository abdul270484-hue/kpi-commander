const fs = require('fs');
let js = fs.readFileSync('main.js', 'utf8');

// Patch DTS IH
let targetIh = `        } else {
            let list = Object.values(window.dtsIhData);`;
let replaceIh = `        } else {
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
js = js.replace(targetIh, replaceIh);

// Patch DTS MX
let targetMx = `        } else {
            const sortedDts = Object.values(window.dtsMxData).sort((a, b) => a.asc.localeCompare(b.asc));`;
let replaceMx = `        } else {
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
js = js.replace(targetMx, replaceMx);

fs.writeFileSync('main.js', js);
console.log('GD Merge patched!');
