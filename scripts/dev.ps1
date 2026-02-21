# scripts/dev.ps1
# Start the backend with verbose logging + Vite dev server for browser-based debugging.
# Usage: .\scripts\dev.ps1   (from project root)
# Then open http://localhost:5173 in any browser.
# Logs are written to logs/scdl-web_<timestamp>.log

$root = Split-Path $PSScriptRoot -Parent
$appDataEnv = "$env:LOCALAPPDATA\scdl-web\.env"
$venvPython = "$env:LOCALAPPDATA\scdl-web\venv\Scripts\python.exe"
$frontendDir = Join-Path $root "frontend"
$backendDir = Join-Path $root "backend"
$logsDir = Join-Path $root "logs"

# Tell the backend where to write log files (picked up by _setup_file_logging in main.py).
$env:LOG_DIR = $logsDir
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

if (-not (Test-Path $venvPython)) {
    Write-Error "Venv not found at $venvPython. Run the app at least once to set it up."
    exit 1
}

# Copy the production .env so pydantic-settings finds the real DB / music / archives paths.
if (Test-Path $appDataEnv) {
    Write-Host "Copying .env from AppData to backend/..."
    Copy-Item $appDataEnv (Join-Path $backendDir ".env") -Force
} else {
    Write-Warning "No .env found at $appDataEnv - backend will use default paths"
}

# Start Vite dev server in a separate window.
Write-Host "Starting Vite dev server..."
$viteCmd = "Set-Location '" + $frontendDir + "'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $viteCmd

Write-Host ""
Write-Host "Backend starting with DEBUG logging."
Write-Host "Logs: $logsDir\scdl-web_<timestamp>.log"
Write-Host "Open http://localhost:5173 in your browser."
Write-Host "Press Ctrl+C here to stop the backend."
Write-Host ""

Set-Location $backendDir
& $venvPython -m uvicorn app.main:app --reload --log-level debug --port 8000
