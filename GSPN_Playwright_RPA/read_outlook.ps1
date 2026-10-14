param(
    [string]$Action = "RECENT", # "RECENT", "SEARCH", "READ_BODY"
    [string]$Query = "",
    [string]$Sender = "",
    [int]$Limit = 5,
    [switch]$OnlyUnread = $false
)

try {
    $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $mapi = $outlook.GetNameSpace('MAPI')
    $inbox = $mapi.GetDefaultFolder(6) # 6 = olFolderInbox
    $unreadCount = $inbox.UnReadItemCount
    $items = $inbox.Items
    $items.Sort("[ReceivedTime]", $true)

    if ($Action -eq "READ_BODY") {
        $targetMail = $null
        foreach ($m in $items) {
            $senderMatch = $true
            $queryMatch = $true
            if ($Sender) { $senderMatch = ($m.SenderName -like "*$Sender*") }
            if ($Query) { $queryMatch = ($m.Subject -like "*$Query*") }
            if ($senderMatch -and $queryMatch) {
                $targetMail = $m
                break
            }
        }

        if ($targetMail) {
            $bodyClean = ($targetMail.Body -replace '\r\n\r\n+', "`n`n").Trim()
            if ($bodyClean.Length -gt 1500) {
                $bodyClean = $bodyClean.Substring(0, 1500) + "`n...(dipotong karena terlalu panjang)..."
            }
            @{
                status = "OK"
                action = "READ_BODY"
                sender = $targetMail.SenderName
                subject = $targetMail.Subject
                time = $targetMail.ReceivedTime.ToString("dd/MM/yyyy HH:mm")
                body = $bodyClean
            } | ConvertTo-Json -Compress
        } else {
            @{
                status = "NOT_FOUND"
                action = "READ_BODY"
                message = "Tidak ditemukan email yang sesuai kriteria."
            } | ConvertTo-Json -Compress
        }
        exit 0
    }

    # RECENT or SEARCH
    $results = @()
    $scanCount = 0
    $maxScan = if ($Query -or $Sender -or $OnlyUnread) { 150 } else { 20 }

    foreach ($m in $items) {
        $scanCount++
        if ($scanCount -gt $maxScan) { break }
        if ($results.Count -ge $Limit) { break }

        if ($OnlyUnread -and (-not $m.UnRead)) { continue }

        $match = $true
        if ($Sender) {
            $sOk = ($m.SenderName -like "*$Sender*")
            if (-not $sOk -and $m.SenderEmailAddress) {
                $sOk = ($m.SenderEmailAddress -like "*$Sender*")
            }
            if (-not $sOk) { $match = $false }
        }
        if ($Query) {
            $subjMatch = ($m.Subject -like "*$Query*")
            $bodyPreviewMatch = $false
            if ($m.Body -and ($m.Body.Length -gt 0)) {
                $snippetCheck = $m.Body.Substring(0, [Math]::Min(300, $m.Body.Length))
                if ($snippetCheck -like "*$Query*") { $bodyPreviewMatch = $true }
            }
            if (-not ($subjMatch -or $bodyPreviewMatch)) { $match = $false }
        }

        if ($match) {
            $snippet = ""
            if ($m.Body) {
                $snippet = ($m.Body -replace '\s+', ' ').Trim()
                if ($snippet.Length -gt 140) { $snippet = $snippet.Substring(0, 140) + "..." }
            }

            $results += [PSCustomObject]@{
                sender = $m.SenderName
                subject = $m.Subject
                time = $m.ReceivedTime.ToString("HH:mm")
                date = $m.ReceivedTime.ToString("dd/MM")
                unread = $m.UnRead
                snippet = $snippet
            }
        }
    }

    @{
        status = "OK"
        action = $Action
        unread = $unreadCount
        count = $results.Count
        emails = $results
    } | ConvertTo-Json -Compress

} catch {
    @{
        status = "ERROR"
        message = $_.Exception.Message
    } | ConvertTo-Json -Compress
}
