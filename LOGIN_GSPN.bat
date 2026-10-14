@echo off
echo ===================================================
echo   GSPN PLAYWRIGHT - TEST LOGIN & SIMPAN SESI
echo ===================================================
echo.
cd /d "%~dp0GSPN_Playwright_RPA"
node auth.js
pause
