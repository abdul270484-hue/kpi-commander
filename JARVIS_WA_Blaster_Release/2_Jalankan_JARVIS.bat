@echo off
echo ==================================================
echo Membersihkan sisa proses siluman (jika ada)...
taskkill /F /IM node.exe /T >nul 2>&1
wmic process where "name='chrome.exe' and commandline like '%--headless%'" call terminate >nul 2>&1
echo ==================================================
echo.
echo Memulai Mesin JARVIS WA Blaster...
echo Mohon tunggu sebentar...
cd app
start http://localhost:3001
node server.js
pause
