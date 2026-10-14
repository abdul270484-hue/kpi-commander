@echo off
echo MENGUNGGAH KE FIREBASE PRODUCTION...
echo Mohon tunggu, proses ini membutuhkan beberapa detik.
echo.
call firebase deploy --only hosting
echo.
echo ====================================================
echo SELESAI! Dasbor berhasil di-deploy ke Production.
echo ====================================================
pause
