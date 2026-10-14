@echo off
title GSPN PLAYWRIGHT RPA - SCHEDULER ACTIVE (09:00, 12:00, 15:00, 17:00)
cd /d "%~dp0"
echo ========================================================
echo  GSPN PLAYWRIGHT RPA SCHEDULER AKTIF
echo  Jadwal: 09:00, 12:00, 15:00, 17:00 WIB
echo  Jangan tutup jendela ini agar scheduler terus berjalan.
echo ========================================================
echo.
node scheduler.js
pause
