$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$content = [System.IO.File]::ReadAllText("C:\Users\anje\Documents\Nova pastaaaa\index.js", $utf8NoBom)
[System.IO.File]::WriteAllText("C:\Users\anje\Documents\Nova pastaaaa\index.js", $content, $utf8NoBom)
Write-Host "Done"
