# Restart NEW APP backend
$ErrorActionPreference = 'Stop'

$root = "F:\APPs"
$backendDir = Join-Path $root "backend"
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$appUrl = "http://127.0.0.1:8000"

Write-Host "[backend:start] Starting NEW APP backend on port 8000..."
Set-Location $backendDir

& $venvPython -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
