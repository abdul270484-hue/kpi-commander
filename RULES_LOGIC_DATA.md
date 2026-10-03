# ⚠️ DASHBOARD BUJM - ATURAN LOGIKA DATA (WAJIB BACA SEBELUM REVISI) ⚠️

Dokumen ini adalah **SOP WAJIB** bagi setiap AI / Agen / Developer yang akan melakukan modifikasi pada logika pengolahan data (Analytics, Productivity GD, SO, Parts, dll). 
Tujuannya adalah agar perbaikan pada satu bagian tidak merusak (regression) data atau cabang lain yang sudah berjalan normal.

## 1. GOLDEN RULE: "BACA KORELASI DATA SEBELUM REVISI"
Sebelum mengubah baris kode apa pun di src/worker.js, src/config.js, src/analytics.js, atau skrip sinkronisasi RPA:
- **Pahami Dampak Global:** Sadari bahwa satu fungsi (misal: shortenASC, parseExcelDate) digunakan secara paralel oleh BANYAK laporan sekaligus (GD Trend, GD Daily, Dosa Cabang, Parts Sales).
- **Isolasi Perbaikan Cabang:** Jika masalah dilaporkan HANYA pada SATU CABANG (misal Denpasar), pastikan *logic fix* yang ditulis **TIDAK MENYENTUH/MENGUBAH** hasil parsing untuk cabang lain (Manado, Kupang, Singaraja, Makassar). Gunakan kondisi spesifik / *override*.
- **Gunakan Fallback:** Saat mengubah pencocokan teks (.includes(), Regex), pastikan kondisi else atau nilai *return default*-nya tetap berfungsi persis seperti sebelumnya.

## 2. ATURAN LOGIKA GD (GOODS DELIVERED)
- **Tarikan 1 Bulan + Merge History:** Untuk mempercepat RPA GSPN, sistem HANYA menarik data GD bulan berjalan (tanggal 1 s/d hari ini). Data tren 6 bulan ke belakang **TIDAK DITARIK ULANG**, melainkan digabung (*merge*) menggunakan fungsi { ...existingProd.gdTrendData, ...prodAnalytics.gdTrendData } di sync.js yang menarik data lama dari Firebase. **JANGAN merombak logika merge ini.**
- **Pemisahan Cabang Denpasar:** Cabang Denpasar wajib dipisah menjadi 3 entitas (Denpasar Induk, Denpasar - Cellular World, Denpasar - Planet Gadget) secara spesifik berdasarkan **NAMA TEKNISI** (	echBranchOverride di worker.js). 
  - *Rule:* Pencocokan nama teknisi wajib menggunakan .includes() untuk mengantisipasi ketidakkonsistenan pengetikan nama di GSPN (misal: "MOHHAMAT BAGAS" atau sekadar "BAGAS").
  - *Rule:* Jika ASC Name dari GSPN tiba-tiba ter-strip hingga hanya tersisa "PT BEKARYA UGERTAMA JAYA MANDIRI" tanpa embel-embel kota, ia WAJIB jatuh secara *default* ke "DENPASAR" induk, bukan cabang baru.

## 3. ATURAN PENANGANAN TANGGAL (DATE PARSING)
- **Excel Date Corruption Fix:** Hati-hati pada fungsi parseExcelDate di src/analytics.js. Excel sering mengacak format DD/MM/YYYY menjadi MM/DD/YYYY HANYA untuk tanggal <= 12. Sistem sudah memiliki deteksi pplyCorruptionFix. Jangan mengubah *parser* tanggal tanpa mempertimbangkan efek samping pada data baris lain.

## 4. ATURAN PROTEKSI ERROR BATCH
- Setiap *loop* analisis data Excel wajib menggunakan perisai pengecekan *null* (seperti if (!row) continue;, if (!engName) continue;).
- Jika menemukan 1 baris Excel yang cacat, cukup buang baris tersebut (continue), **JANGAN** biarkan seluruh proses *worker crash*. Kesalahan pada 1 SPV/Teknisi tidak boleh membuat *dashboard* satu regional mati total.
