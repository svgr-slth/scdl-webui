param([string]$BackendDir, [string]$Python, [string]$LogDir)

# Kill everything on port 8000
$conns = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
$pids = ($conns | Where-Object { $_.State -ne 'TimeWait' }).OwningProcess | Sort-Object -Unique
foreach ($procId in $pids) {
    if ($procId -gt 0) {
        Write-Host "Killing PID $procId"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

# Also kill any venv python processes
$venvPython = "$env:LOCALAPPDATA\scdl-web\venv\Scripts\python.exe"
$procs = Get-WmiObject Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -eq $venvPython }
foreach ($proc in $procs) {
    Write-Host "Killing venv python PID $($proc.ProcessId)"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep 3

$remaining = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($remaining) {
    Write-Warning "Port 8000 still held by PID $($remaining.OwningProcess)"
} else {
    Write-Host "Port 8000 free — starting backend..."
    $env:LOG_DIR = $LogDir
    Set-Location $BackendDir
    & $Python -m uvicorn app.main:app --reload --log-level debug --port 8000
}
