# Kill all uvicorn/scdl-web processes and free port 8000
$venvPython = "$env:LOCALAPPDATA\scdl-web\venv\Scripts\python.exe"

# Get process info for port 8000
$connections = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
$procIds = $connections.OwningProcess | Sort-Object -Unique
foreach ($procId in $procIds) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    Write-Host "Port 8000: PID $procId ($($proc.ProcessName)) - attempting kill"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

# Also kill any process running the venv python
$procs = Get-WmiObject Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -eq $venvPython }
foreach ($proc in $procs) {
    Write-Host "Venv python: PID $($proc.ProcessId) - attempting kill"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep 3

$remaining = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($remaining) {
    $remProcIds = $remaining.OwningProcess | Sort-Object -Unique
    foreach ($procId in $remProcIds) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        Write-Warning "Port 8000 still held by PID $procId ($($proc.ProcessName))"
    }
} else {
    Write-Host "Port 8000 is now free."
}
