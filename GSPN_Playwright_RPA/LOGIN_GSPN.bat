@echo off
title LOGIN GSPN & SIMPAN SESI
cd /d "%~dp0"
echo =============================================================
echo  MEMBUKA BROWSER GSPN UNTUK LOGIN & SIMPAN SESI
echo =============================================================
echo.
echo  1. Browser akan terbuka otomatis.
echo  2. Silakan ketik User ID, Password, dan selesaikan OTP di browser.
echo  3. Setelah berhasil masuk ke menu utama GSPN, sesi akan
echo     tersimpan otomatis dan jendela ini akan selesai.
echo.
node auth.js
echo.
pause
