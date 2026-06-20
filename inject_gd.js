const fs = require('fs');
let js = fs.readFileSync('main.js', 'utf8');

// Inject into renderDtsIhTable
const ihAnchor = "let list = Object.values(window.dtsIhData);";
const ihLogic = `
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
`;

if (js.includes(ihAnchor) && !js.includes("window.dtsIhData[key].gdVisits = prod.dtsIhGdVisits")) {
    js = js.replace(ihAnchor, ihLogic + "            " + ihAnchor);
    console.log("Injected GD logic into DTS IH");
} else {
    console.log("Failed or already injected IH!");
}


// Inject into renderDtsMxTable
const mxAnchor = "const sortedDts = Object.values(window.dtsMxData).sort((a, b) => a.asc.localeCompare(b.asc));";
const mxLogic = `
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
`;

if (js.includes(mxAnchor) && !js.includes("window.dtsMxData[key].gd = prod.dtsGd")) {
    js = js.replace(mxAnchor, mxLogic + "            " + mxAnchor);
    console.log("Injected GD logic into DTS MX");
} else {
    console.log("Failed or already injected MX!");
}

fs.writeFileSync('main.js', js);
