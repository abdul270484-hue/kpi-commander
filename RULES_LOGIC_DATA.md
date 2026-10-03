# ⚠️ BUJM DASHBOARD & AGING COMMANDER - ATURAN LOGIKA DATA (WAJIB BACA SEBELUM REVISI) ⚠️

Dokumen ini adalah **SOP WAJIB** bagi setiap AI / Agen / Developer yang akan melakukan modifikasi pada logika pengolahan data (Analytics, Productivity GD, SO, Parts, serta sistem Aging Commander). 
Tujuannya adalah agar perbaikan pada satu bagian tidak merusak (regression) data, cabang lain, atau menghabiskan kuota database secara tidak sengaja.

## 1. GOLDEN RULE: "BACA KORELASI DATA SEBELUM REVISI"
Sebelum mengubah baris kode apa pun di src/worker.js, src/config.js, src/analytics.js, ging_commander.js, atau skrip sinkronisasi RPA:
- **Pahami Dampak Global:** Sadari bahwa satu fungsi digunakan secara paralel oleh BANYAK laporan sekaligus.
- **Isolasi Perbaikan Cabang:** Jika masalah dilaporkan HANYA pada SATU CABANG, pastikan *logic fix* yang ditulis **TIDAK MENYENTUH/MENGUBAH** hasil parsing untuk cabang lain. Gunakan kondisi spesifik / *override*.
- **Gunakan Fallback:** Saat mengubah pencocokan teks (.includes(), Regex), pastikan kondisi else atau nilai *return default*-nya tetap berfungsi persis seperti sebelumnya.

## 2. ATURAN KHUSUS AGING COMMANDER & FIREBASE
- **Proteksi Kuota Firebase (Wajib Diperhatikan):** Sistem Aging Commander sebelumnya pernah menabrak limit harian Firebase (50.000 *reads*). **DILARANG KERAS** membuat logika loop yang melakukan *read*/*write* ke Firestore untuk setiap 1 dokumen SO secara terpisah. Semua sinkronisasi Aging Commander WAJIB menggunakan metode *Batching* atau membaca/menulis ke 1 Mega-Dokumen besar.
- **Validasi Status SO:** Sebelum merevisi status di ging_commander.js, pahami bahwa perubahan *mapping* status (misal "WAITING PART" menjadi "PENDING") berdampak langsung pada warna baris, notifikasi peringatan, dan hitungan KPI SPV. Pastikan *mapping* yang baru tidak bertabrakan dengan *mapping* lama.
- **Tarikan Monitoring by Status:** Data mentah Aging ditarik melalui RPA "Monitoring by Status". Dilarang mengubah filter rentang waktu (mundur terlalu jauh) di GSPN untuk menu ini, karena akan menyebabkan *crash* pada *server* GSPN.

## 3. ATURAN LOGIKA GD (GOODS DELIVERED)
- **Tarikan 1 Bulan + Merge History:** Untuk mempercepat RPA GSPN, sistem HANYA menarik data GD bulan berjalan (tanggal 1 s/d hari ini). Data tren 6 bulan ke belakang **TIDAK DITARIK ULANG**, melainkan digabung (*merge*) menggunakan fungsi { ...existingProd.gdTrendData, ...prodAnalytics.gdTrendData } di sync.js. **JANGAN merombak logika merge ini.**
- **Pemisahan Cabang Denpasar:** Cabang Denpasar wajib dipisah menjadi 3 entitas (Denpasar Induk, Denpasar - Cellular World, Denpasar - Planet Gadget) secara spesifik berdasarkan **NAMA TEKNISI** (	echBranchOverride di worker.js). 
  - *Rule:* Pencocokan nama teknisi wajib menggunakan .includes().
  - *Rule:* Jika ASC Name dari GSPN tiba-tiba ter-strip hingga hanya tersisa "PT BEKARYA UGERTAMA JAYA MANDIRI", ia WAJIB jatuh secara *default* ke "DENPASAR" induk.

## 4. ATURAN PENANGANAN TANGGAL (DATE PARSING)
- **Excel Date Corruption Fix:** Hati-hati pada fungsi parseExcelDate di src/analytics.js. Excel sering mengacak format DD/MM/YYYY menjadi MM/DD/YYYY HANYA untuk tanggal <= 12. Sistem sudah memiliki deteksi pplyCorruptionFix. Jangan mengubah *parser* tanggal tanpa mempertimbangkan efek samping.

## 5. ATURAN PROTEKSI ERROR BATCH
- Setiap *loop* analisis data Excel wajib menggunakan perisai pengecekan *null* (seperti if (!row) continue;, if (!engName) continue;).
- Jika menemukan 1 baris Excel yang cacat, cukup buang baris tersebut (continue), **JANGAN** biarkan seluruh proses *worker crash*.
