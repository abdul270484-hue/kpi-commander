const XLSX = require('xlsx');

const workbook = XLSX.readFile('c:/Users/unicom/KERJAAN/Dashboard_BUJM/ServiceOrderList_Aging.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log("Found rows:", data.length);
for (let i=0; i<10; i++) {
    const r = data[i];
    console.log(`Job: ${r['ASC Job No']}, ReqDate: ${r['Request Date']} (${typeof r['Request Date']})`);
}

const specific = data.find(d => String(d['Service Order No.']).includes('4436455768') || String(d['ASC Job No']).includes('4436455768'));
if (specific) {
    console.log("Specific Job Request Date:", specific['Request Date'], typeof specific['Request Date']);
}
