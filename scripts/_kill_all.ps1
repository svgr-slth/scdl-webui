Get-Process python* -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Killing python PID $($_.Id)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep 3
$r = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($r) {
    Write-Host "Still in use: $($r.OwningProcess -join ',')"
} else {
    Write-Host "Port 8000 free"
}
