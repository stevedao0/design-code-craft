# =============================================================================
# start-backend-prod.ps1
#
# Purpose:
#   Start the VCPMC backend in production mode for the INTERNAL PILOT.
#   - No --reload (no auto-restart on file changes).
#   - No Vite / no dev server.
#   - Assumes the frontend dist has been built and is served by the backend
#     via the SPA fallback in backend/app/main.py.
#   - Binds 127.0.0.1 (loopback only -- LAN access not used for pilot).
#
# Differences from scripts/start-backend.ps1 (the DEV script):
#   - DEV:    uses --reload, no worker count, defaults to a single process.
#   - PROD:   no --reload, uses a small worker count, no file-watcher process.
#
# Pre-flight (caller is responsible):
#   - F:\APPs\frontend\dist\ must exist (run `npm --prefix F:\APPs\frontend run build` if not).
#   - F:\APPs\backend\.env must exist and contain DATABASE_URL.
#   - Docker container vcpmc_postgres must be running.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File F:\APPs\scripts\start-backend-prod.ps1
#
# Stop:
#   Ctrl+C in this terminal, OR:
#     powershell -ExecutionPolicy Bypass -File F:\APPs\scripts\stop-backend.ps1
#   (if no stop script exists, use Task Manager -> python.exe, or:
#     Get-Process python | Where-Object { $_.Path -like '*\uvicorn*' } | Stop-Process)
#
# =============================================================================

$ErrorActionPreference = 'Stop'

$Root          = 'F:\APPs'
$BackendDir    = Join-Path $Root 'backend'
$VenvPython    = Join-Path $Root '.venv\Scripts\python.exe'
$AppUrl        = 'http://127.0.0.1:8000'
$HealthUrl     = 'http://127.0.0.1:8000/api/health'
$BindHost      = '127.0.0.1'
$BindPort      = 8000
$Workers       = 1   # single worker is sufficient for internal pilot

# --- 1. Pre-flight checks -----------------------------------------------------
if (-not (Test-Path $VenvPython)) {
  throw "Python venv not found at $VenvPython. Run scripts\ensure-venv.ps1 first."
}
if (-not (Test-Path (Join-Path $Root 'frontend\dist\index.html'))) {
  throw ("Frontend build not found at F:\APPs\frontend\dist\index.html. " +
         "Run `npm --prefix F:\APPs\frontend run build` first.")
}
if (-not (Test-Path (Join-Path $BackendDir '.env'))) {
  throw "Backend .env not found at $BackendDir\.env"
}

# --- 2. Verify port 8000 is free ---------------------------------------------
$portInUse = Get-NetTCPConnection -LocalPort $BindPort -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
  $pids = ($portInUse | Select-Object -ExpandProperty OwningProcess -Unique) -join ','
  throw ("Port $BindPort is already in use (PIDs: $pids). " +
         "Stop the existing process first (e.g. scripts\start-backend.ps1 dev, " +
         "or `Get-Process -Id $pids | Stop-Process -Force`).")
}

# --- 3. Verify DB container reachable ----------------------------------------
$container = 'vcpmc_postgres'
try {
  $containerStatus = (docker inspect --format '{{.State.Status}}' $container 2>&1)
  if ($containerStatus -ne 'running') {
    throw "Container '$container' is not running (status: $containerStatus)"
  }
} catch {
  throw "Cannot reach docker container '$container': $_"
}

# --- 4. Load environment from .env (no echo of secrets) ----------------------
# We load .env into the current process env (so DATABASE_URL etc. flow into
# uvicorn) WITHOUT printing any value. This mirrors the dev script's behavior
# where .env is read by the backend's settings module at startup.
Write-Host "[start:env]  Loading $BackendDir\.env into process environment..."
Get-Content (Join-Path $BackendDir '.env') -ErrorAction SilentlyContinue |
  ForEach-Object {
    if ($_ -match '^\s*#') { return }
    if ($_ -match '^\s*([^=]+)=(.*)$') {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim()
      # Strip optional surrounding quotes
      if ($v -match '^"(.*)"$') { $v = $matches[1] }
      elseif ($v -match "^'(.*)'$") { $v = $matches[1] }
      [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
  }

# --- 5. Start uvicorn --------------------------------------------------------
Set-Location $BackendDir
Write-Host ""
Write-Host "================================================================"
Write-Host "  VCPMC App -- INTERNAL PILOT (PROD mode, no --reload)"
Write-Host "================================================================"
Write-Host "  App URL :  $AppUrl"
Write-Host "  Health  :  $HealthUrl"
Write-Host "  Bind    :  ${BindHost}:${BindPort}"
Write-Host "  Workers :  $Workers"
Write-Host "  Mode    :  PROD (no auto-reload, no file watcher)"
Write-Host "  CWD     :  $BackendDir"
Write-Host "  Python  :  $VenvPython"
Write-Host "  DB      :  $container (running)"
Write-Host "  Frontend:  F:\APPs\frontend\dist (built)"
Write-Host "  Stop    :  Ctrl+C in this window"
Write-Host "================================================================"
Write-Host ""

# IMPORTANT: NO --reload flag. Internal pilot is not a dev session.
& $VenvPython -m uvicorn app.main:app `
  --host $BindHost --port $BindPort `
  --workers $Workers `
  --no-access-log
