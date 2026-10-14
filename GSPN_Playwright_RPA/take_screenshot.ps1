Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
    
    $outPath = Join-Path $env:TEMP "prime_screen.jpg"
    $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $graphics.Dispose()
    $bitmap.Dispose()

    $bytes = [System.IO.File]::ReadAllBytes($outPath)
    $base64 = [Convert]::ToBase64String($bytes)
    @{ status = "OK"; path = $outPath; base64 = ("data:image/jpeg;base64," + $base64) } | ConvertTo-Json -Compress
} catch {
    @{ status = "ERROR"; message = $_.Exception.Message } | ConvertTo-Json -Compress
}
