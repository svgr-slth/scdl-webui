param([string]$LogFile)
$lines = Get-Content $LogFile
$matches = $lines | Select-String "UPDATE sync_runs SET status=\?, finished_at" | Where-Object { $_.Line -match "'completed'|'failed'" }
foreach ($m in $matches) {
    $line = $m.Line
    # Extract status, source from the line
    Write-Host $line.Substring(0, [Math]::Min(300, $line.Length))
    Write-Host "---"
}
