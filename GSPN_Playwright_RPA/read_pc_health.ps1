try {
    $battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
    $os = Get-CimInstance Win32_OperatingSystem
    $freeRamMB = [math]::Round($os.FreePhysicalMemory / 1024)
    $totalRamMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
    $ramPercent = [math]::Round((($totalRamMB - $freeRamMB) / $totalRamMB) * 100)
    
    $batPercent = if ($battery) { $battery.EstimatedChargeRemaining } else { 100 }
    $charging = if ($battery) { ($battery.BatteryStatus -eq 2) } else { $true }

    # Storage Drive C
    $driveC = Get-PSDrive C -ErrorAction SilentlyContinue
    $freeDiskGB = if ($driveC) { [math]::Round($driveC.Free / 1GB, 1) } else { 0 }
    $totalDiskGB = if ($driveC) { [math]::Round(($driveC.Used + $driveC.Free) / 1GB, 1) } else { 0 }

    # Top Running Key Apps
    $keyApps = @()
    $running = Get-Process | Where-Object { $_.ProcessName -in @('chrome', 'OUTLOOK', 'EXCEL', 'WhatsApp', 'notepad', 'msedge') } | Group-Object ProcessName
    foreach ($grp in $running) {
        $name = switch ($grp.Name.ToLower()) {
            'chrome' { 'Google Chrome' }
            'outlook' { 'Microsoft Outlook' }
            'excel' { 'Microsoft Excel' }
            'whatsapp' { 'WhatsApp' }
            'notepad' { 'Notepad' }
            'msedge' { 'Microsoft Edge' }
            default { $grp.Name }
        }
        $keyApps += $name
    }

    @{
        status = "OK"
        battery = $batPercent
        charging = $charging
        freeRamMB = $freeRamMB
        totalRamMB = $totalRamMB
        ramPercent = $ramPercent
        freeDiskGB = $freeDiskGB
        totalDiskGB = $totalDiskGB
        activeApps = $keyApps
    } | ConvertTo-Json -Compress
} catch {
    @{
        status = "ERROR"
        message = $_.Exception.Message
    } | ConvertTo-Json -Compress
}
