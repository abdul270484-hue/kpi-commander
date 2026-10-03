# ⚠️ BUJM SYSTEM MASTER RULES (WAJIB BACA SEBELUM REVISI) ⚠️

Dokumen ini adalah **SOP MULTAK** bagi setiap AI / Agen / Developer yang akan melakukan modifikasi pada:
1. Logika Dashboard (Analytics, GD, Parts)
2. Sistem Aging Commander & Database Firebase
3. Engine RPA Playwright & WhatsApp Blaster (JARVIS)

Tujuannya adalah agar perbaikan di satu modul tidak merusak (regression) sistem lain yang saling terhubung erat.

---

## BAB 1: ATURAN ENGINE RPA (PLAYWRIGHT & GSPN SCRAPER)
Engine RPA (GSPN_Playwright_RPA/scraper.js) beroperasi di batas limit server GSPN. **DILARANG KERAS** mengubah alur ini tanpa persetujuan:
- **Metode Tarikan Data PENDING (Customer Name Lookup):** GSPN menyembunyikan *Customer Name* di laporan biasa, sehingga kita pakai menu *Monitoring by Status*.
  - *Rule Fatal 1:* Jangan pernah memundurkan tanggal eq_dt_from hingga 5 bulan ke belakang untuk pencarian ALL Branches. Server GSPN akan **CRASH/TIMEOUT**.
  - *Rule Fatal 2:* Jangan membiarkan bot mengeklik tombol "Search" biasa, karena akan memotong tabel *summary* menjadi 30 baris saja.
  - *Solusi Emas (Wajib Dipertahankan):* Pilih -ALL- di ASC_CODE -> **JANGAN KLIK SEARCH** -> Langsung panggil *native JS* GSPN goSVCList('ALL', '', 'ALL', 'TOTAL', '999999');. Ini mem-*bypass* filter waktu dan menarik semua data PENDING secara instan.
- **Urutan Tarikan Wajib (Scraping Order):** Untuk mencegah alokasi memori bocor (*browser context error*), urutan eksekusi **TIDAK BOLEH** diubah: (1) SO Utama, (2) Status ALL, (3) REDO, (4) GD Parallel Batch, (5) Parts Sales Parallel Batch.
- **Browser Closing:** Dilarang meletakkan wait browser.close() sebelum seluruh proses *Parallel* (GD & Parts) selesai. Baris ini wajib berada di ujung paling akhir skrip.

## BAB 2: ATURAN ENGINE WHATSAPP (JARVIS & BLASTER)
- **Logika Dual-Mode Blasting:** Fitur "Blast All" di *frontend* dirancang untuk 2 situasi:
  1. *Bot Server (Pusat):* Mengeksekusi API secara *background* jika *server Node.js* dijalankan di PC Pusat.
  2. *Fallback Chrome (Remote Manager):* Jika Manager membuka *dashboard* dari laptop lain, sistem WAJIB *fallback* menggunakan tautan wa.me berantai (membuka tab Chrome baru). Jangan menimpa *flag* isLocal / isJarvisOnline di *frontend* sedemikian rupa yang membuat Remote Manager tersangkut error Failed to fetch karena mencari localhost:3001.
- **Autostart JARVIS:** Engine berjalan secara *invisible* di *background* menggunakan .vbs dan .bat. Jangan menambahkan intervensi *prompt* (seperti Pause atau Input) di dalam skrip *booting* yang bisa memblokir autostart.

## BAB 3: ATURAN LOGIKA DATA DASHBOARD (GD & ANALYTICS)
- **Tarikan GD 1 Bulan + Merge History:** Untuk mempercepat RPA GSPN, sistem HANYA menarik data GD bulan berjalan (tanggal 1 s/d hari ini). Data tren 6 bulan ke belakang **TIDAK DITARIK ULANG**, melainkan digabung (*merge*) menggunakan fungsi { ...existingProd.gdTrendData } di sync.js. **JANGAN merombak logika merge ini.**
- **Pemisahan Cabang Denpasar:** Cabang Denpasar wajib dipisah menjadi 3 entitas (Induk, Cellular World, Planet Gadget) spesifik berdasarkan NAMA TEKNISI (	echBranchOverride). 
  - *Rule:* Pencocokan wajib memakai .includes() (bukan *exact match*).
  - *Rule:* Jika ASC Name mentah hanya berisi "PT BEKARYA UGERTAMA JAYA MANDIRI" tanpa kota, secara *default* jatuhkan ke cabang "DENPASAR".

## BAB 4: ATURAN AGING COMMANDER & FIREBASE
- **Proteksi Kuota Firebase (Limit 50K Reads):** Dilarang keras membuat logika *loop* yang me-read/write ke Firestore untuk setiap 1 dokumen SO secara individual. Semua sinkronisasi data *Aging* WAJIB menggunakan teknik *Batching* atau membaca/menulis ke 1 Mega-Dokumen besar untuk menghemat kuota.
- **Validasi Status SO:** Mengubah *mapping* status (misal "WAITING PART" menjadi kategori lain) berdampak sistemik pada warna UI, notifikasi WA, dan hitungan dosa. Jangan dilakukan tanpa membaca imbasnya di ging_commander.js.

## BAB 5: ATURAN PROTEKSI ERROR BATCH (FAIL-SAFE)
- Setiap *loop* pemrosesan data (Excel/JSON) wajib memiliki proteksi *null/undefined* (if (!row) continue;).
- Jika menemukan 1 data/baris yang rusak, sistem harus mengabaikan baris tersebut, BUKAN mengalami *crash* total yang membuat seluruh *dashboard* gagal *render*.
