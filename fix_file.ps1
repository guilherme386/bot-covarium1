$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$content = [System.IO.File]::ReadAllText("C:\Users\anje\Documents\Nova pastaaaa\index.js", [System.Text.Encoding]::Default)
# Check if there's a BOM
$bytes = [System.Text.Encoding]::Default.GetBytes($content)
Write-Host "Default encoding gave $($bytes.Length) bytes"
# Write as UTF-8 without BOM
[System.IO.File]::WriteAllText("C:\Users\anje\Documents\Nova pastaaaa\index_fixed.js", $content, $utf8NoBom)
# Compare sizes
$origSize = (Get-Item "C:\Users\anje\Documents\Nova pastaaaa\index.js").Length
$newSize = (Get-Item "C:\Users\anje\Documents\Nova pastaaaa\index_fixed.js").Length
Write-Host "Original: $origSize bytes, New: $newSize bytes"
# Test if new file parses
$result = node --check "C:\Users\anje\Documents\Nova pastaaaa\index_fixed.js" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "New file parses OK!"
    Copy-Item "C:\Users\anje\Documents\Nova pastaaaa\index_fixed.js" "C:\Users\anje\Documents\Nova pastaaaa\index.js" -Force
} else {
    Write-Host "New file failed: $result"
}
Remove-Item "C:\Users\anje\Documents\Nova pastaaaa\index_fixed.js"
