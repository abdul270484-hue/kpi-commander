@echo off
title SUPER ENGINE (GSPN RPA & WA BLASTER)
color 0A
cd /d "%~dp0"

echo ========================================================
echo   MENYALAKAN SUPER ENGINE (RPA GSPN & WA BLASTER)
echo ========================================================
echo.

rem Tutup instance super_engine lama jika ada agar tidak bentrok
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*super_engine.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

rem Bersihkan proses Chrome wwebjs lama jika ada
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" | Where-Object { $_.CommandLine -like '*wwebjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

rem Hapus lockfile sesi lama jika ada
del /f /q "%~dp0.wwebjs_auth\session\lockfile" >nul 2>&1

echo Layanan sedang berjalan... (Jendela ini jangan ditutup)
echo.
node super_engine.js
pause
