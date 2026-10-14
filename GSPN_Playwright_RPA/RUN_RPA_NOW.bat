@echo off
title GSPN PLAYWRIGHT RPA - RUN NOW
cd /d "%~dp0"
echo ========================================================
echo  MENJALANKAN GSPN PLAYWRIGHT RPA (TARIKAN INSTAN)
echo ========================================================
echo.
node scheduler.js --now=MANUAL
echo.
pause
