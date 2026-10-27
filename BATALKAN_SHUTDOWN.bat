@echo off
title BATALKAN AUTO SHUTDOWN BUJM
color 0C
echo ========================================================
echo   MEMBATALKAN AUTO SHUTDOWN KOMPUTER (BUJM SUPER ENGINE)
echo ========================================================
echo.
echo Mengirim perintah pembatalan ke Windows...
shutdown /a
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo   [BERHASIL] Auto shutdown BERHASIL DIBATALKAN!
    echo   Komputer akan tetap menyala normal.
    echo ========================================================
) else (
    echo.
    echo [INFO] Tidak ada jadwal shutdown aktif yang sedang berjalan.
)
echo.
pause
