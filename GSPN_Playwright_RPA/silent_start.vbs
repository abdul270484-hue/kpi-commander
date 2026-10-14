Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\unicom\KERJAAN\Dashboard_BUJM\GSPN_Playwright_RPA"
WshShell.Run "node super_engine.js", 0, False
