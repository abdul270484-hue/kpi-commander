param(
    [string]$Sender = "",
    [string]$Query = "",
    [string]$ReplyText = "",
    [switch]$SendNow
)

try {
    if (-not $ReplyText) {
        @{ status = "ERROR"; message = "Pesan balasan email tidak boleh kosong." } | ConvertTo-Json -Compress
        exit 0
    }

    $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $mapi = $outlook.GetNameSpace('MAPI')
    $inbox = $mapi.GetDefaultFolder(6)
    $items = $inbox.Items
    $items.Sort("[ReceivedTime]", $true)

    $targetMail = $null
    # Pass 1: exact or startswith
    foreach ($m in $items) {
        if ($m.SenderName -like "$Sender*" -or $m.SenderName -eq $Sender) {
            $targetMail = $m
            break
        }
    }
    # Pass 2: substring
    if (-not $targetMail) {
        foreach ($m in $items) {
            if ($m.SenderName -like "*$Sender*" -or $m.SenderEmailAddress -like "*$Sender*") {
                $targetMail = $m
                break
            }
        }
    }

    if (-not $targetMail) {
        @{
            status = "NOT_FOUND"
            message = "Tidak ditemukan email tujuan dari '$Sender' perihal '$Query' untuk dibalas."
        } | ConvertTo-Json -Compress
        exit 0
    }

    $reply = $targetMail.Reply()
    $formattedBody = "$ReplyText`n`n--`nDikirim via PRIME Executive AI Assistant`n`n" + $reply.Body
    $reply.Body = $formattedBody

    if ($SendNow) {
        $reply.Send()
        $actionResult = "SENT"
    } else {
        $reply.Save()
        $actionResult = "DRAFT_SAVED"
    }

    @{
        status = "OK"
        action = $actionResult
        to = $targetMail.SenderName
        toEmail = $targetMail.SenderEmailAddress
        subject = $reply.Subject
        sentText = $ReplyText
        time = (Get-Date).ToString("dd/MM/yyyy HH:mm")
    } | ConvertTo-Json -Compress

} catch {
    @{
        status = "ERROR"
        message = $_.Exception.Message
    } | ConvertTo-Json -Compress
}
