$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$lines = [System.IO.File]::ReadAllLines("C:\Users\anje\Documents\Nova pastaaaa\index.js", $utf8NoBom)
$line = $lines[431]
Write-Host "Line length: $($line.Length)"
$backtickCount = 0
for ($i = 0; $i -lt $line.Length; $i++) {
    $c = $line[$i]
    if ($c -eq [char]0x60) { $backtickCount++ }
}
Write-Host "Backtick count: $backtickCount"
# Check what's before 'Ola'
$idx = $line.IndexOf("Ola")
if ($idx -ge 0) {
    Write-Host "Ola at index $idx, prev char code: $([int][char]$line[$idx-1])" 
}
