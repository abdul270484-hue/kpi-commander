Set WshShell = CreateObject("WScript.Shell")
' Ganti path ini jika lokasi berubah. Script ini menjalankan bat di folder yang sama.
WshShell.Run chr(34) & "2_Jalankan_JARVIS.bat" & Chr(34), 0
Set WshShell = Nothing
