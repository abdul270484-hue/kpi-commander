param(
    [string]$Target = ""
)

try {
    if (-not $Target) {
        @{ status = "ERROR"; message = "Target klik/buka kosong." } | ConvertTo-Json -Compress
        exit 0
    }

    $cleanTarget = $Target.Trim()
    $matchedUrl = $null
    $matchedTitle = $null

    # 1. Known / Popular shortcuts first for instant speed
    $tLower = $cleanTarget.ToLower()
    if ($tLower -like '*barokah*') {
        $matchedUrl = "https://barokahps-b2d58.web.app/"
        $matchedTitle = "BAROKAH PS"
    } elseif ($tLower -like '*coretax*' -or $tLower -like '*pajak*') {
        $matchedUrl = "https://coretaxdjp.pajak.go.id/identityproviderportal/Account/Login"
        $matchedTitle = "CORETAX DJP"
    } elseif ($tLower -like '*bujm*' -or $tLower -like '*dashboard*' -or $tLower -like '*management*') {
        $matchedUrl = "https://management-bujm-dashboard.web.app"
        $matchedTitle = "Dashboard BUJM (MANAGEMENT)"
    } elseif ($tLower -like '*gspn*') {
        $matchedUrl = "https://gspn2.samsungcsportal.com"
        $matchedTitle = "Portal GSPN"
    } elseif ($tLower -like '*youtube*') {
        $matchedUrl = "https://www.youtube.com"
        $matchedTitle = "YouTube"
    } elseif ($tLower -like '*gmail*') {
        $matchedUrl = "https://mail.google.com"
        $matchedTitle = "Gmail"
    }

    # 2. Check Bookmarks
    if (-not $matchedUrl) {
        $bmPaths = @(
            (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Profile 1\Bookmarks'),
            (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Default\Bookmarks')
        ) | Where-Object { Test-Path $_ }

        foreach ($bmp in $bmPaths) {
            try {
                $bmJson = Get-Content $bmp -Raw -Encoding UTF8 | ConvertFrom-Json
                function Find-Bm($node) {
                    if ($node.children) {
                        foreach ($c in $node.children) { Find-Bm $c }
                    }
                    if ($node.name -and $node.url) {
                        if ($node.name -like "*$cleanTarget*" -or $node.url -like "*$cleanTarget*") {
                            $script:matchedUrl = $node.url
                            $script:matchedTitle = $node.name
                        }
                    }
                }
                Find-Bm $bmJson.roots.bookmark_bar
                Find-Bm $bmJson.roots.other
            } catch {}
            if ($matchedUrl) { break }
        }
    }

    # 3. Direct URL or Google Search
    if (-not $matchedUrl) {
        if ($cleanTarget.Contains('.') -or $cleanTarget.StartsWith('http')) {
            $matchedUrl = if ($cleanTarget.StartsWith('http')) { $cleanTarget } else { "https://$cleanTarget" }
            $matchedTitle = $cleanTarget
        } else {
            $enc = [System.Uri]::EscapeDataString($cleanTarget)
            $matchedUrl = "https://www.google.com/search?q=$enc"
            $matchedTitle = "Google Search: $cleanTarget"
        }
    }

    # 4. Open in Chrome
    Start-Process chrome.exe -ArgumentList "`"$matchedUrl`""

    # Wait 2 seconds for rendering
    Start-Sleep -Seconds 2

    # 5. Take fresh screenshot of the result
    $screenScript = Join-Path $PSScriptRoot "take_screenshot.ps1"
    $shotData = $null
    if (Test-Path $screenScript) {
        try {
            $shotRaw = powershell -NoProfile -ExecutionPolicy Bypass -File "$screenScript"
            $shotData = $shotRaw | ConvertFrom-Json
        } catch {}
    }

    @{
        status = "OK"
        target = $cleanTarget
        title = $matchedTitle
        url = $matchedUrl
        screenshot = if ($shotData -and $shotData.status -eq "OK") { $shotData.base64 } else { $null }
    } | ConvertTo-Json -Compress

} catch {
    @{
        status = "ERROR"
        message = $_.Exception.Message
    } | ConvertTo-Json -Compress
}
