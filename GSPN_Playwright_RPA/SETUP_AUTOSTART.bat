@echo off
title SETUP JARVIS & RPA AUTOSTART
echo =============================================================
echo  MEMASANG AUTOSTART JARVIS DAN PLAYWRIGHT KE WINDOWS STARTUP
echo =============================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\JARVIS_Super_Engine.vbs"

copy /Y "C:\Users\unicom\KERJAAN\Dashboard_BUJM\GSPN_Playwright_RPA\silent_start.vbs" "%SHORTCUT_PATH%"

echo.
echo  [SUKSES] JARVIS Super Engine telah dipasang ke Windows Startup!
echo  Mulai sekarang, saat laptop dinyalakan:
echo   - JARVIS WA Blaster akan otomatis ONLINE
echo   - Playwright RPA akan otomatis AKTIF dan SIAP DITARIK DARI WEB
echo.
echo  Menjalankan layanan sekarang di latar belakang...
wscript "%SHORTCUT_PATH%"
echo.
echo  [SELESAI] Semua sistem sudah aktif!
echo =============================================================
pause
