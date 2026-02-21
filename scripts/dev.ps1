# scripts/dev.ps1
# Start the backend with verbose logging + Vite dev server for browser-based debugging.
# Usage: .\scripts\dev.ps1   (from project root)
# Then open http://localhost:5173 in any browser.

$root = Split-Path $PSScriptRoot -Parent
$appDataEnv = "$env:LOCALAPPDATA\scdl-web\.env"
$venvPython = "$env:LOCALAPPDATA\scdl-web\venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Error "Venv not found at $venvPython. Run the app at least once to set it up."
    exit 1
}

# Copy the production .env so pydantic-settings finds the real DB / music / archives paths.
if (Test-Path $appDataEnv) {
    Write-Host "Copying .env from AppData to backend/..."
    Copy-Item $appDataEnv "$root\backend\.env" -Force
} else {
    Write-Warning "No .env found at $appDataEnv — backend will use default paths"
}

# Start Vite dev server in a separate window (stays open on its own).
Write-Host "Starting Vite dev server..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "Backend starting with DEBUG logging."
Write-Host "Open http://localhost:5173 in your browser."
Write-Host "Press Ctrl+C here to stop the backend."
Write-Host ""

Set-Location "$root\backend"
& $venvPython -m uvicorn app.main:app --reload --log-level debug --port 8000
