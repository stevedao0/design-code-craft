# dev-all.ps1 - Start backend + build/serve frontend in single-port 8000 mode
#
# Single entry: `npm run dev:all` from F:\APPs
# Architecture (single-URL):
#   - FastAPI owns port 8000 (127.0.0.1).
#   - Frontend production build (frontend/dist) is served by FastAPI as
#     static files + SPA fallback at "/".
#   - API endpoints live under /api (same origin, no CORS).
#   - Vite dev server is NOT started. Vite preview is NOT started.
#   - The optional `npm run dev:watch` runs the Vite build in watch mode
#     WITHOUT binding a port (vite build --watch), so we keep single-port.
# - Auto-detects LAN IPv4 (Ethernet/Wi-Fi only, no Docker/WSL/Hyper-V)
# - Cleans up only old dev processes that belong to F:\APPs (PID+CommandLine proof)
# - Waits for backend health + frontend index.html
# - Opens http://127.0.0.1:8000/ in default browser (once)
# - Ctrl+C stops the backend process tree cleanly
param(
  [switch]$SkipFrontendInstall,
  [switch]$SkipFrontendBuild,
  [switch]$StartFrontendWatcher
)

$ErrorActionPreference = 'Continue'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

$frontendDir  = Join-Path $root 'frontend'
$backendDir   = Join-Path $root 'backend'
$frontendNodeModules = Join-Path $frontendDir 'node_modules'
$venvPython   = Join-Path $root '.venv\Scripts\python.exe'
$appUrl       = 'http://127.0.0.1:8000/'
$backendHealth = "$appUrl/api/health"

# All ports this project has ever used (managed or test/preview)
$managedPorts = @(8000, 8001, 4178, 4180, 5199, 5780, 8014, 8278, 14832, 19436, 19956)
$protectedPorts = @(5432, 5433, 18000, 5434, 5435)

# ── Helpers ────────────────────────────────────────────────────────────────────
function Get-ProcessInfoSafe {
  param([int]$ProcessId)
  $result = [ordered]@{ ProcessId = $ProcessId; Name = ''; CommandLine = ''; Path = ''; ParentProcessId = 0 }
  try {
    $w = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if ($w) {
      $result.Name = $w.Name
      $result.CommandLine = $w.CommandLine
      $result.Path = $w.ExecutablePath
      $result.ParentProcessId = [int]$w.ParentProcessId
    }
  } catch { }
  return $result
}

function Test-IsAppsProcess {
  param([string]$CommandLine, [string]$Name, [string]$Path)
  $cmd  = if ($CommandLine) { $CommandLine.ToLower() } else { '' }
  $name = if ($Name)        { $Name.ToLower() }        else { '' }
  $path = if ($Path)        { $Path.ToLower() }        else { '' }

  # Owned by this project
  if ($cmd -match 'f:\\apps\\')                    { return $true }
  if ($path -match 'f:\\apps\\')                   { return $true }
  if ($cmd -match 'apps\\\\')                       { return $true }
  # Vite preview of this project's dist-luminous-phase1 etc.
  if ($cmd -match 'apps\\frontend\\dist-')         { return $true }
  # Playwright/test tools Cursor spawned for this app
  if ($cmd -match 'apps\\agent-tools\\')           { return $true }
  if ($cmd -match 'apps\\frontend\\src\\')         { return $true }
  if ($cmd -match 'apps\\backend\\')               { return $true }
  if ($cmd -match 'apps\\scripts\\')               { return $true }
  # Cursor-spawned dev:test:workspace-3xxxxx scripts
  if ($cmd -match 'dev:test:workspace')            { return $true }
  if ($cmd -match 'agents-bb-')                    { return $true }
  # explicit project name in script paths
  if ($cmd -match 'vcpmc-new-app-root')           { return $true }
  return $false
}

function Test-IsProtectedProcess {
  param([string]$Name, [string]$CommandLine)
  $name = if ($Name) { $Name.ToLower() } else { '' }
  $cmd  = if ($CommandLine) { $CommandLine.ToLower() } else { '' }
  $blocked = @(
    'postgres','pg_ctl','docker','dockerd','com.docker','cloudflared',
    'svchost','system','idle','lsass','csrss','smss','wininit','services',
    'taskhostw','explorer','dwm','conhost','msedge','chrome','firefox'
  )
  foreach ($b in $blocked) { if ($name -eq $b -or $name -like "$b*") { return $true } }
  if ($cmd -match 'f:\\apps\\.venv\\lib')        { return $false }  # venv is OK to kill
  return $false
}

function Stop-OwnedListener {
  param([int]$Port, [string]$AppsRoot)
  $rows = netstat -ano -p tcp | Select-String ":$Port\s" | ForEach-Object { $_.Line.Trim() -split '\s+' }
  foreach ($row in $rows) {
    if ($row.Length -lt 5) { continue }
    if ($row[3] -ne 'LISTENING') { continue }
    $pid = 0
    if (-not [int]::TryParse($row[4], [ref]$pid) -or $pid -le 0) { continue }
    if ($pid -eq $PID) { continue }
    $info = Get-ProcessInfoSafe -ProcessId $pid
    $owns = Test-IsAppsProcess -CommandLine $info.CommandLine -Name $info.Name -Path $info.Path
    $protected = Test-IsProtectedProcess -Name $info.Name -CommandLine $info.CommandLine
    if ($owns -and -not $protected) {
      Write-Host "  [CLEANUP] :$port -> PID=$pid Name=$($info.Name) belongs to F:\APPs, stopping tree" -ForegroundColor Yellow
      try { $null = & taskkill /T /F /PID $pid 2>&1 } catch { }
    } elseif ($protected) {
      Write-Host "  [CLEANUP] :$port -> PID=$pid Name=$($info.Name) protected (system/DB), leaving alone" -ForegroundColor Gray
    } else {
      Write-Host "  [CLEANUP] :$port -> PID=$pid Name=$($info.Name) NOT F:\APPs, leaving alone" -ForegroundColor DarkGray
    }
  }
}

function Wait-PortFree {
  param([int]$Port, [int]$TimeoutSec = 15)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $listening = netstat -ano -p tcp | Select-String ":$Port\s" | Where-Object { $_ -match 'LISTENING' }
    if (-not $listening) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Get-LanIPv4 {
  $blocked = @('127.','169.254.','172.16.','172.17.','172.18.','172.19.','172.20.','172.21.','172.22.','172.23.','172.24.','172.25.','172.26.','172.27.','172.28.','172.29.','172.30.','172.31.')
  $excludeAdapter = @('docker','vethernet','hyper-v','wsl','vpn','vmware','virtualbox','bluetooth')
  $candidates = @()
  $adapterOrder = @('Ethernet','Wi-Fi','Ethernet 2','Wi-Fi 2')
  foreach ($alias in $adapterOrder) {
    try {
      $rows = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias $alias -ErrorAction SilentlyContinue
      foreach ($r in $rows) {
        $ip = "$($r.IPAddress)"
        $ifAlias = "$($r.InterfaceAlias)".ToLower()
        $skip = $false
        foreach ($b in $blocked) { if ($ip.StartsWith($b)) { $skip = $true; break } }
        foreach ($x in $excludeAdapter) { if ($ifAlias -like "*$x*") { $skip = $true; break } }
        if (-not $skip) { $candidates += [pscustomobject]@{ Adapter = $alias; IP = $ip } }
      }
    } catch { }
  }
  if ($candidates.Count -gt 0) {
    return [pscustomobject]@{ IP = $candidates[0].IP; Adapter = $candidates[0].Adapter; Source = 'priority-ethernet/wifi' }
  }
  try {
    $rows = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress }
    foreach ($r in $rows) {
      $ip = "$($r.IPAddress)"
      $ifAlias = "$($r.InterfaceAlias)".ToLower()
      $skip = $false
      foreach ($b in $blocked) { if ($ip.StartsWith($b)) { $skip = $true; break } }
      foreach ($x in $excludeAdapter) { if ($ifAlias -like "*$x*") { $skip = $true; break } }
      if (-not $skip) {
        return [pscustomobject]@{ IP = $ip; Adapter = $r.InterfaceAlias; Source = 'fallback-scan' }
      }
    }
  } catch { }
  return [pscustomobject]@{ IP = '127.0.0.1'; Adapter = 'loopback'; Source = 'fallback-loopback' }
}

function Wait-HttpOk {
  param([string]$Url, [int]$TimeoutSec = 60, [string]$Needle = $null)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        if (-not $Needle) { return $true }
        $body = "$($resp.Content)"
        if ($body -match [regex]::Escape($Needle)) { return $true }
      }
    } catch { }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Stop-ProcessTreeSafe {
  param([System.Diagnostics.Process]$Proc, [string]$Label)
  if (-not $Proc -or $Proc.HasExited) { return }
  Write-Host "[$Label] Stopping tree PID=$($Proc.Id)..." -ForegroundColor Yellow
  try {
    # graceful first
    $null = & taskkill /PID $Proc.Id /T 2>&1
    Start-Sleep -Milliseconds 800
    if (-not $Proc.HasExited) {
      $null = & taskkill /F /PID $Proc.Id /T 2>&1
    }
  } catch { }
}

# ── Banner ─────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '[LAUNCHER] dev-all starting...' -ForegroundColor Green
Write-Host "  root:        $root" -ForegroundColor Gray
Write-Host "  frontendDir: $frontendDir" -ForegroundColor Gray
Write-Host "  backendDir:  $backendDir" -ForegroundColor Gray
Write-Host ''

if (-not (Test-Path $frontendDir)) { throw "Missing frontend directory: $frontendDir" }
if (-not (Test-Path $backendDir))  { throw "Missing backend directory: $backendDir" }
if (-not (Test-Path $venvPython))   { throw "Missing python venv: $venvPython" }

# ── 1. Auto-detect LAN IP ──────────────────────────────────────────────────────
$lan = Get-LanIPv4
Write-Host "[LAN] Detected: $($lan.IP) via '$($lan.Adapter)' ($($lan.Source))" -ForegroundColor Cyan

# ── 2. Cleanup old F:\APPs listeners on every known port ──────────────────────
Write-Host ''
Write-Host '[CLEANUP] Scanning managed ports for stale F:\APPs dev processes...' -ForegroundColor Yellow
foreach ($port in $managedPorts) {
  Stop-OwnedListener -Port $port -AppsRoot $root
}
Start-Sleep -Seconds 2
Write-Host '[CLEANUP] Verifying 8000 + 8001 are free...' -ForegroundColor Yellow
foreach ($port in @(8000, 8001)) {
  if (Wait-PortFree -Port $port -TimeoutSec 8) {
    Write-Host "  [CLEANUP] :$port free" -ForegroundColor Green
  } else {
    Write-Host "  [CLEANUP] :$port STILL BUSY - launcher will surface error below" -ForegroundColor Red
  }
}

# ── 3. Frontend deps ───────────────────────────────────────────────────────────
if (-not $SkipFrontendInstall) {
  if (-not (Test-Path $frontendNodeModules)) {
    Write-Host ''
    Write-Host '[FRONTEND] Installing dependencies...' -ForegroundColor Cyan
    npm --prefix $frontendDir install | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Frontend npm install failed.' }
  } else {
    Write-Host '[FRONTEND] node_modules present, skipping install.' -ForegroundColor DarkGray
  }
}

# ── 4. Env flags ──────────────────────────────────────────────────────────────
$env:UPDATE_CONTRACT_MAIN_DB_ENABLED = 'true'
$env:DELETE_CONTRACT_MAIN_DB_ENABLED = 'true'
$env:VCPMC_DISABLE_MIGRATIONS = '1'

# ── 5. Build frontend (production) into frontend/dist ──────────────────────────
$frontendDist = Join-Path $frontendDir 'dist'
$needsBuild = -not $SkipFrontendBuild
if (-not $needsBuild) {
  Write-Host '[FRONTEND] SkipFrontendBuild set; reusing existing dist/' -ForegroundColor DarkGray
} elseif (Test-Path (Join-Path $frontendDist 'index.html')) {
  Write-Host '[FRONTEND] dist/index.html exists; skipping rebuild. Use -SkipFrontendBuild false to force.' -ForegroundColor DarkGray
  $needsBuild = $false
}
if ($needsBuild) {
  Write-Host ''
  Write-Host '[FRONTEND] Building production bundle (frontend/dist)...' -ForegroundColor Cyan

  # Try to clean frontend/dist. If Windows still holds the handle (EPERM),
  # rename dist -> dist-locked-<timestamp> instead of failing the launcher.
  if (Test-Path $frontendDist) {
    Write-Host '  [FRONTEND] Removing existing dist...' -ForegroundColor DarkGray
    try {
      Remove-Item -LiteralPath $frontendDist -Recurse -Force -ErrorAction Stop
    } catch {
      $lockedName = "dist-locked-{0:yyyyMMdd-HHmmss}" -f (Get-Date)
      $lockedPath = Join-Path $frontendDir $lockedName
      Write-Host ("  [FRONTEND] dist is locked (EPERM). Renaming to '{0}' and rebuilding." -f $lockedName) -ForegroundColor Yellow
      try {
        Rename-Item -LiteralPath $frontendDist -NewName $lockedName -ErrorAction Stop
        Write-Host ("  [FRONTEND] Old build moved aside: {0}" -f $lockedPath) -ForegroundColor DarkGray
      } catch {
        $renameErr = $_.Exception.Message
        Write-Host "  [FRONTEND] Cannot rename locked dist: $renameErr" -ForegroundColor Red
        throw "Frontend dist is locked and cannot be renamed. Path: $frontendDist"
      }
    }
  }

  $build = Start-Process `
    -FilePath 'npm.cmd' `
    -ArgumentList 'run','build' `
    -WorkingDirectory $frontendDir `
    -NoNewWindow `
    -Wait `
    -PassThru
  if ($build.ExitCode -ne 0) {
    throw "Frontend build failed with exit code $($build.ExitCode)."
  }
  if (-not (Test-Path (Join-Path $frontendDist 'index.html'))) {
    throw "Frontend build did not produce dist/index.html."
  }
  Write-Host '  [FRONTEND] Build OK' -ForegroundColor Green
}

# ── 5b. Optional frontend watcher (vite build --watch, no port) ────────────────
$watcherProc = $null
if ($StartFrontendWatcher) {
  Write-Host '[FRONTEND] Starting vite watch (no port)...' -ForegroundColor Cyan
  $watcherProc = Start-Process `
    -FilePath 'npm.cmd' `
    -ArgumentList 'run','dev:watch' `
    -WorkingDirectory $frontendDir `
    -NoNewWindow `
    -PassThru
  Write-Host "[FRONTEND] watcher PID=$($watcherProc.Id)" -ForegroundColor Cyan
}

# ── 6. Banner ──────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host 'VCPMC APP DEV (single-port 8000)' -ForegroundColor Green
Write-Host "  Local:    http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "  Reports:  http://127.0.0.1:8000/bg/reports" -ForegroundColor Green
Write-Host "  LAN:      http://$($lan.IP):8000" -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''

# ── 7. Start backend (single-port 8000) ─────────────────────────────────────────
Write-Host '[BACKEND] Starting uvicorn on 0.0.0.0:8000 (serves frontend + /api)...' -ForegroundColor Cyan
$env:PYTHONPATH = $root
$env:PYTHONPATH = $root
$backendProc = Start-Process `
  -FilePath $venvPython `
  -ArgumentList '-m','uvicorn','app.main:app','--host','0.0.0.0','--port','8000','--reload' `
  -WorkingDirectory $backendDir `
  -NoNewWindow `
  -PassThru

Write-Host "[BACKEND] PID=$($backendProc.Id)" -ForegroundColor Cyan
# ── 8. Wait for ready (FastAPI serves frontend index + /api/health) ───────────
Write-Host ''
Write-Host '[LAUNCHER] Waiting for /api/health on port 8000...' -ForegroundColor Yellow
$backendReady = Wait-HttpOk -Url $backendHealth -TimeoutSec 90
if ($backendReady) {
  Write-Host "  [BACKEND] $backendHealth -> 200" -ForegroundColor Green
} else {
  Write-Host "  [BACKEND] $backendHealth did not respond within 90s" -ForegroundColor Red
}

Write-Host '[LAUNCHER] Waiting for frontend index.html on port 8000...' -ForegroundColor Yellow
$frontendReady = Wait-HttpOk -Url $appUrl -TimeoutSec 60 -Needle 'id="root"'
if ($frontendReady) {
  Write-Host '  [FRONTEND] http://127.0.0.1:8000/ serves SPA index.html' -ForegroundColor Green
} else {
  Write-Host '  [FRONTEND] http://127.0.0.1:8000/ did not return index.html within 60s' -ForegroundColor Red
}

Write-Host ''
if ($backendReady -and $frontendReady) {
  Write-Host "[LAUNCHER] App ready. Opening browser at $appUrl" -ForegroundColor Green
  try {
    Start-Process -FilePath $appUrl -ErrorAction Stop
    Write-Host '  [LAUNCHER] Browser launched.' -ForegroundColor Green
  } catch {
    Write-Host "  [LAUNCHER] Could not open browser automatically: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  [LAUNCHER] Open manually: $appUrl" -ForegroundColor Yellow
  }
} else {
  Write-Host '[LAUNCHER] Servers NOT fully ready - browser NOT opened to avoid false login screens.' -ForegroundColor Red
  if (-not $backendReady)  { Write-Host "  - Backend $backendHealth unreachable." -ForegroundColor Red }
  if (-not $frontendReady) { Write-Host '  - Frontend index.html not served.' -ForegroundColor Red }
}

Write-Host ''
Write-Host '[LAUNCHER] Running. Press Ctrl+C to stop.' -ForegroundColor Yellow
Write-Host ''

# ── 9. Lifecycle wait + cleanup ───────────────────────────────────────────────
$backendDied = $false
try {
  while ($true) {
    Start-Sleep -Milliseconds 700
    if (-not $backendDied -and $backendProc.HasExited) {
      $backendDied = $true
      Write-Host "[BACKEND] Exited (code=$($backendProc.ExitCode)). Stopping..." -ForegroundColor Red
    }
    if ($backendDied) { break }
  }
}
finally {
  Write-Host ''
  Write-Host '[LAUNCHER] Cleanup: stopping managed process trees...' -ForegroundColor Yellow
  Stop-ProcessTreeSafe -Proc $backendProc -Label 'BACKEND'
  if ($watcherProc) { Stop-ProcessTreeSafe -Proc $watcherProc -Label 'WATCHER' }
  Start-Sleep -Seconds 2

  foreach ($port in @(8000, 8001, 4178, 4180, 5199)) {
    Stop-OwnedListener -Port $port -AppsRoot $root
  }

  try { $backendProc.Dispose() } catch { }
  if ($watcherProc) { try { $watcherProc.Dispose() } catch { } }

  Write-Host '[LAUNCHER] Done.' -ForegroundColor Green
}
