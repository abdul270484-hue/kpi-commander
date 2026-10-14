param(
    [string]$Sender = "",
    [string]$Query = ""
)

try {
    $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $mapi = $outlook.GetNameSpace('MAPI')
    $inbox = $mapi.GetDefaultFolder(6)
    $items = $inbox.Items
    $items.Sort("[ReceivedTime]", $true)

    $targetMail = $null
    # Pass 1: exact or startswith
    foreach ($m in $items) {
        if ($Sender -and ($m.SenderName -like "$Sender*" -or $m.SenderName -eq $Sender)) {
            $targetMail = $m
            break
        }
    }
    # Pass 2: substring
    if (-not $targetMail) {
        foreach ($m in $items) {
            $sMatch = if ($Sender) { ($m.SenderName -like "*$Sender*" -or $m.SenderEmailAddress -like "*$Sender*") } else { $true }
            $qMatch = if ($Query) { ($m.Subject -like "*$Query*" -or $m.Body -like "*$Query*") } else { $true }
            if ($sMatch -and $qMatch) {
                $targetMail = $m
                break
            }
        }
    }

    if (-not $targetMail) {
        @{
            status = "NOT_FOUND"
            message = "Tidak ditemukan email yang sesuai untuk dirangkum."
        } | ConvertTo-Json -Compress
        exit 0
    }

    $rawBody = $targetMail.Body
    if (-not $rawBody) { $rawBody = "(Email tidak memiliki isi teks)" }

    # Clean out quoted text / previous reply chains
    $splitMarkers = @(
        "--------- Original Message ---------",
        "-----Original Message-----",
        "From:",
        "Sent:",
        "Dari:",
        "Dikirim:"
    )

    $freshText = $rawBody
    foreach ($marker in $splitMarkers) {
        $idx = $freshText.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase)
        if ($idx -gt 0) {
            $freshText = $freshText.Substring(0, $idx)
        }
    }

    $freshText = ($freshText -replace '\r\n\r\n+', "`n`n").Trim()
    if ($freshText.Length -gt 1000) {
        $freshText = $freshText.Substring(0, 1000) + "...(dipotong)..."
    }

    # Generate executive points
    $lines = $freshText -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    $points = @()
    $actionItems = @()

    foreach ($line in $lines) {
        if ($line -like "*Dear *" -or $line -like "*Halo *" -or $line -like "*Thanks *" -or $line -like "*Regards*") {
            continue
        }
        if ($line -like "*Note:*" -or $line -like "*Mohon *" -or $line -like "*Silakan *" -or $line -like "*Tolong *") {
            $actionItems += $line
        } elseif ($points.Count -lt 5) {
            $points += $line
        }
    }

    $spokenSummary = "Rangkuman email dari " + $targetMail.SenderName + ", Bos. Perihal " + ($targetMail.Subject -replace 'RE:\s*', '') + ". "
    if ($points.Count -gt 0) {
        $spokenSummary += ($points[0..([Math]::Min(1, $points.Count - 1))] -join ". ") + ". "
    }
    if ($actionItems.Count -gt 0) {
        $spokenSummary += "Catatan penting: " + $actionItems[0]
    }

    @{
        status = "OK"
        sender = $targetMail.SenderName
        senderEmail = $targetMail.SenderEmailAddress
        subject = $targetMail.Subject
        time = $targetMail.ReceivedTime.ToString("dd/MM/yyyy HH:mm")
        unread = $targetMail.UnRead
        freshContent = $freshText
        keyPoints = $points
        actionItems = $actionItems
        spokenSummary = $spokenSummary
    } | ConvertTo-Json -Compress

} catch {
    @{
        status = "ERROR"
        message = $_.Exception.Message
    } | ConvertTo-Json -Compress
}
