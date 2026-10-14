# GSPN SCRAPING GOLDEN RULES (JANGAN DILANGGAR)
Dokumen ini dibuat dari hasil trial-and-error panjang. Jika ada AI/Agent di masa depan yang ingin mengupgrade kode ini, WAJIB mematuhi aturan berikut agar sistem tidak hancur (regression).

## 1. CUSTOMER NAME LOOKUP (Service Order Monitoring by Status)
- **MASALAH LAMA:** GSPN secara default menyembunyikan 'Customer Name' di laporan 'Service Order Excel Download'. Satu-satunya cara mendapatkan nama konsumen adalah dari menu 'Monitoring by Status'.
- **KESALAHAN FATAL SEBELUMNYA:** Jangan pernah mencoba merubah field tanggal (#req_dt_from, #req_dt_to) menjadi mundur 5 bulan. Melakukan ini untuk pencarian skala Nasional (ALL branches) akan membuat server GSPN **crash/timeout** karena ukuran data historis yang terlalu raksasa.
- **KESALAHAN FATAL KEDUA:** Jangan biarkan robot mengeklik tombol "Search" jika form tanggal tidak diubah (default 14 hari). Mengeklik "Search" akan memfilter tabel summary menjadi hanya 30 baris.
- **SOLUSI EMAS (YANG SEDANG BERJALAN):**
  1. Pilih -ALL- pada dropdown ASC_CODE.
  2. **JANGAN KLIK SEARCH.**
  3. Langsung panggil fungsi JS bawaan GSPN: goSVCList('ALL', '', 'ALL', 'TOTAL', '999999');. Ini sama dengan mengeklik angka TOTAL berwarna biru di tabel summary.
  4. Cara ini akan mem-bypass filter tanggal secara otomatis dan menarik seluruh data PENDING yang aktif secara instan tanpa membuat server GSPN hang.

## 2. URUTAN TARIKAN (SCRAPING ORDER)
Untuk mencegah bentrok dan error alokasi memory/browser context, urutan eksekusi harus selalu seperti ini:
1. Tarik Data SO Utama (Service Order Excel Download) - Fast Loop.
2. Tarik Status ALL (Monitoring by Status) - Single 'ALL' (sesuai aturan #1).
3. Tarik REDO (Service Order Management Light).
4. Tarik GD (Productivity) - **PARALLEL BATCH**.
5. Tarik Penjualan Aksesoris (Parts Sales) - **PARALLEL BATCH**.

## 3. BROWSER CLOSING
- JANGAN PERNAH menaruh perintah wait browser.close() sebelum proses Parallel GD atau Parallel Parts Sales selesai dieksekusi. rowser.close() harus menjadi baris paling akhir sebelum eturn downloadedFiles;.
