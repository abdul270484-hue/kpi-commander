# ⚠️ BUJM SYSTEM MASTER RULES (WAJIB BACA SEBELUM REVISI) ⚠️

Dokumen ini adalah **SOP MULTAK** dan **CETAK BIRU (BLUEPRINT) LOGIKA DATA** bagi setiap AI / Agen / Developer yang akan melakukan modifikasi pada sistem BUJM Dashboard maupun Aging Commander. 

**TUJUAN UTAMA:** Mencegah REGRESI (Kesalahan berulang). Semua logika asal-usul data yang tampil di layar wajib mematuhi aturan di bawah ini. JANGAN merusak rantai ekosistem data yang sudah berjalan!

---

## BAB 1: ATURAN SUMBER DATA & PENGGABUNGAN (ANTI-UNKNOWN CUSTOMER)
Semua data visual di Dashboard dan Aging Commander berasal dari penggabungan (merging) beberapa tarikan GSPN. Dilarang merusak relasi antar data ini:
- **Rule 1.1 - Nama Customer (Anti-Unknown Customer):** Laporan 'Service Order Excel Download' bawaan GSPN **TIDAK MEMILIKI** kolom Nama Customer. Nama Customer **HANYA BISA DIDAPAT** dari tarikan 'Monitoring by Status'. 
  - *Larangan Keras:* Jangan pernah menghapus atau melompati proses tarikan Status ALL di RPA. Jika tarikan ini gagal/terlewat, maka semua *Job No* di Dashboard dan Aging Commander akan berubah menjadi "Unknown Customer".
  - *Logic Wajib:* Script worker.js dan sync.js harus selalu melakukan *mapping/lookup* Job No -> Customer Name dari data Status sebelum merender tabel antrean.
- **Rule 1.2 - Data REDO (Claim Ditolak):** Indikator REDO ditarik dari menu 'Service Order Management Light'. Data ini dilebur ke dalam daftar dosa (Violations). Dilarang memutus rantai pengecekan *Job No* REDO terhadap daftar teknisi di tabel Wall of Fame.
- **Rule 1.3 - Data Suku Cadang (Parts Sales):** Terdiri dari 2 parameter: Kategori Part (VD, MX, DA) dan Harga/Jenis (Expensive vs Accessories). Ekstraksi harus hati-hati dalam mem-parsing kolom Deskripsi untuk membedakan antara servis gratis (IW) dan penjualan berbayar (OOW).

## BAB 2: ATURAN ENGINE RPA (PLAYWRIGHT & GSPN SCRAPER)
Engine RPA (scraper.js) beroperasi di batas limit server GSPN. **DILARANG KERAS** mengubah alur ini:
- **Rule 2.1 - Trik Tarikan Data PENDING (Bypass Filter Tanggal):** 
  - *Kesalahan Masa Lalu:* Jangan pernah memundurkan form tanggal eq_dt_from hingga 5 bulan ke belakang untuk pencarian ALL Branches. Server GSPN akan **CRASH/TIMEOUT**.
  - *Solusi Emas (Wajib Dipertahankan):* Pilih -ALL- di ASC_CODE -> **JANGAN KLIK SEARCH** -> Langsung panggil *native JS* GSPN goSVCList('ALL', '', 'ALL', 'TOTAL', '999999');. Ini mem-*bypass* batasan 30 baris dan mem-bypass *date filter*, menarik semua data secara instan.
- **Rule 2.2 - Urutan Tarikan Wajib (Memory Allocation):** Eksekusi harus berurutan: (1) SO Utama, (2) Status ALL, (3) REDO, (4) GD Parallel Batch, (5) Parts Sales Parallel Batch. Jangan diubah!
- **Rule 2.3 - Browser Closing:** wait browser.close() WAJIB berada di ujung paling akhir skrip, setelah semua proses *Parallel Promise* selesai.

## BAB 3: ATURAN LOGIKA TAMPILAN DASHBOARD (ANALYTICS & KPI)
Data yang dirender ke UI memiliki aturan perhitungan khusus:
- **Rule 3.1 - GD Trend & Productivity (Tarikan 1 Bulan + Merge History):** 
  - Untuk mempercepat RPA, sistem HANYA menarik data GD bulan berjalan (tanggal 1 s/d hari ini). 
  - Data tren 6 bulan ke belakang **TIDAK DITARIK ULANG**, melainkan digabung (*merge*) menggunakan fungsi { ...existingProd.gdTrendData } di sync.js. **JANGAN merombak logika merge ini.**
- **Rule 3.2 - Pemisahan Cabang Denpasar:** Cabang Denpasar wajib dipisah menjadi 3 entitas (Induk, Cellular World, Planet Gadget) spesifik berdasarkan NAMA TEKNISI (	echBranchOverride). Pencocokan teks WAJIB memakai .includes(). Jika ASC Name mentah hanya berisi "PT BEKARYA UGERTAMA JAYA MANDIRI", secara *default* jatuhkan ke cabang "DENPASAR" induk.
- **Rule 3.3 - Perhitungan "Dosa Cabang":** Dosa dihitung dari unit yang mengendap melebihi 7 hari (LTP) atau melakukan pelanggaran (X09, MPU, UB). Jangan merubah ambang batas hari (SLA) tanpa persetujuan, karena akan merusak warna indikator peringatan KPI.

## BAB 4: ATURAN AGING COMMANDER & FIREBASE
- **Rule 4.1 - Proteksi Kuota Firebase (Limit 50K Reads):** Dilarang keras membuat logika *loop* yang me-*read/write* ke Firestore untuk setiap 1 dokumen SO secara individual. Semua sinkronisasi data *Aging* WAJIB menggunakan metode *Batching* atau membaca/menulis ke 1 Mega-Dokumen raksasa.
- **Rule 4.2 - Validasi Status UI (Warna Baris):** Status SO di *Aging Commander* ("WAITING PART", "PENDING ASSIGN", "REPAIRING", dll) dikaitkan langsung dengan logika CSS (*red, yellow, green*). Mengubah *string* status tanpa menyesuaikan aturan CSS akan membuat tabel menjadi abu-abu/hilang warnanya.

## BAB 5: ATURAN ENGINE WHATSAPP (JARVIS & BLASTER)
- **Rule 5.1 - Logika Dual-Mode & Desentralisasi Pengiriman WA Asmen (MANDAT RESMI BOS):** 
  - *Bot Server Background (Khusus Laptop BOS - Pak Abdul Khoir):* Mengeksekusi pesan secara otomatis di jam operasional (**09:15, 12:15, 15:15 WIB**) khusus untuk cabang binaan Area BOS (Denpasar Induk, DCW, DPG, Singaraja, Kupang, Manado) serta Laporan Eksekutif Area ke HOM pada pukul **09:15 WIB** menggunakan nomor WhatsApp BOS via Node.js Super Engine.
  - *Asmen / Area Lain (Bu Susan, Pak Erik, Pak Riis, Bu Sadawani, Pak Ivan):* Pengiriman pesan ke PIC/Leader cabang area masing-masing dikirim langsung oleh Asmen yang bersangkutan saat mereka membuka sistem `BUJM DASHBOARD` (via tombol Blast All / Tombol WA PIC per cabang). Sistem otomatis menggunakan mode *Fallback* `wa.me` (tab WhatsApp Web) agar pesan resmi terkirim dari nomor WhatsApp pribadi/kerja Asmen penanggung jawab masing-masing ke PIC cabangnya.
  - *Integritas Flag:* Dilarang merusak flag `isLocal` / `isJarvisOnline` / `getAllowedBranches()` yang membedakan mekanisme ini.
- **Rule 5.2 - Autostart Bot:** Skrip .vbs dan .bat berjalan otomatis (*invisible*). Dilarang menyisipkan pause atau interaksi CLI yang akan membuat *bot* ter-jeda/nyangkut saat PC *restart*.
- **Rule 5.3 - Target Penerima Wajib (MANDAT MUTLAK BOS):** 
  - **DILARANG KERAS (DEPRECATED TOTAL):** Dilarang mengirim WA Blast ke masing-masing teknisi secara individual.
  - **WAJIB (MANDAT RESMI):** Seluruh pesan monitoring aging / dosa cabang WAJIB dikelompokkan per cabang dan dikirim **HANYA ke PIC / LEADER CABANG**. PIC/Leader yang bertanggung jawab mengawal, membagi, dan menegur teknisi di bawah naungannya.
- **Rule 5.4 - Jadwal Tembak & Template Resmi (Schedule Logic Wajib):** 
  - **09:15 WIB (Sesi Pagi):** 
    - *Pesan 1:* `📋 MONITORING AGING UNIT PER TEKNISI` ke PIC/Leader (rekap per teknisi & total unit tertahan di cabang).
    - *Pesan 2:* `🚨 WARNING PENDING DELIVERY (RC)` ke PIC/Leader (daftar unit selesai reparasi yang harus segera dipush D2D/pickup).
    - *Pesan 3:* `📊 Daily Operational Report Area` ke **HOM (Head Operational Manager)** khusus pukul **09:15 WIB**.
  - **12:15 WIB (Sesi Siang):** 
    - *Pesan:* `🚨 CRITICAL ALERT — PUSH CLOSING CABANG` ke PIC/Leader (evaluasi unit cabang yang belum selesai / stagnan sejak pagi).
    - *Larangan:* Dilarang menyertakan *Pending Delivery (RC)* maupun laporan HOM di jam siang agar tidak spam.
  - **15:15 WIB (Sesi Sore / Closing):** 
    - *Pesan:* `🚨 CRITICAL ALERT — PUSH CLOSING CABANG` ke PIC/Leader (push closing deadline hari ini).
    - *Larangan:* Dilarang menyertakan *Pending Delivery (RC)* maupun laporan HOM di jam sore.
- **Rule 5.5 - Filter Cabang Area:** Bot di server Asmen HANYA menembak cabang di wilayah area kerjanya (Denpasar, DCW, DPG, Kupang, Singaraja, Manado). Dilarang menembak cabang di luar area.

## BAB 6: ATURAN PROTEKSI ERROR BATCH (FAIL-SAFE)
- Segala *loop* pemrosesan data (Excel/JSON) wajib memiliki proteksi *null/undefined* (if (!row) continue;).
- Kesalahan pada 1 baris Excel (misal: format tanggal kacau) cukup di-*bypass* (continue), BUKAN dibiarkan melempar *Exception* yang membuat 1 layar *dashboard* mati / *blank white screen*.
