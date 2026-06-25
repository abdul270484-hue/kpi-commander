@echo off
echo ==================================================
echo INSTALASI MESIN JARVIS WA BLASTER
echo ==================================================
echo Pastikan komputer Anda sudah terinstal NodeJS.
echo Jika belum, download di https://nodejs.org/ dan instal.
echo.
pause
cd app
set PUPPETEER_SKIP_DOWNLOAD=true
echo Sedang mengunduh komponen mesin... Mohon tunggu (Butuh koneksi internet)...
npm install express whatsapp-web.js qrcode
echo.
echo INSTALASI SELESAI! Anda bisa menutup jendela ini.
pause
