param(
    [string]$Query = "",
    [int]$Limit = 5
)

try {
    if (-not $Query) {
        @{ status = "ERROR"; message = "Kata kunci pencarian kosong." } | ConvertTo-Json -Compress
        exit 0
    }

    $paths = @(
        (Join-Path $env:USERPROFILE "Desktop"),
        (Join-Path $env:USERPROFILE "Downloads"),
        (Join-Path $env:USERPROFILE "Documents"),
        "C:\Users\unicom\KERJAAN"
    ) | Where-Object { Test-Path $_ }

    $found = Get-ChildItem -Path $paths -Recurse -Depth 2 -Filter "*$Query*" -ErrorAction SilentlyContinue |
             Select-Object -First $Limit |
             ForEach-Object {
                 [PSCustomObject]@{
                     Name = $_.Name
                     FullName = $_.FullName
                     SizeKB = if ($_.Length) { [Math]::Round($_.Length / 1KB, 1) } else { 0 }
                     IsDirectory = $_.PSIsContainer
                     LastModified = $_.LastWriteTime.ToString("dd/MM/yyyy HH:mm")
                 }
             }

    $list = @($found)
    @{
        status = "OK"
        query = $Query
        count = $list.Count
        files = $list
    } | ConvertTo-Json -Compress
} catch {
    @{
        status = "ERROR"
        message = $_.Exception.Message
    } | ConvertTo-Json -Compress
}
