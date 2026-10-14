@echo off
echo ===================================================
echo   PLAYWRIGHT CODEGEN - PEREKAM ALUR KLIK GSPN
echo ===================================================
echo.
echo Browser dan Jendela Perekam (Playwright Inspector) akan terbuka.
echo Silakan lakukan login dan klik menu download sampai selesai.
echo Semua klik, frame, dan navigasi Anda akan terekam otomatis!
echo.
cd /d "%~dp0GSPN_Playwright_RPA"
npx playwright codegen https://gspn2.samsungcsportal.com --output recorded_flow.js
pause
