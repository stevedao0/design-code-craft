param(
  [switch]$AutoKill
)

$ErrorActionPreference = 'Stop'

# Patterns that identify a uvicorn process belonging to F:\APPs (NEW APP backend).
# Matched against Process CommandLine via PowerShell -like (wildcards: * = any chars, ? = single char).
#
# Case A: "F:\APPs\.venv\Scripts\uvicorn.exe" app.main:app --port 8000
# Case B: python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Case C: python.exe "F:\APPs\.venv\Scripts\uvicorn.exe" app.main:app --port 8000
# Case D: any uvicorn + app.main:app + --port 8000 combination
$safeMarkers = @(
  '*F:\APPs\.venv\Scripts\uvicorn.exe*',
  '*-m*uvicorn*app.main:app*--port*8000*',
  '*uvicorn.exe*app.main:app*--port*8000*',
  '*uvicorn*app.main:app*--port*8000*'
)

$lines = netstat -ano -p tcp | Select-String -Pattern ':8000\s+.*LISTENING\s+\d+'
if (-not $lines) {
  Write-Host '[port:8000] Port 8000 dang trong.'
  exit 0
}

$targetPid = $null
foreach ($line in $lines) {
  $text = $line.ToString().Trim()
  if ($text -match 'LISTENING\s+(\d+)$') {
    $targetPid = [int]$Matches[1]
    break
  }
}

if (-not $targetPid) {
  Write-Host '[port:8000] Khong parse duoc PID tu netstat. Dung lai de an toan.'
  exit 10
}

$proc = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid"
if (-not $proc) {
  Write-Host "[port:8000] PID $targetPid khong ton tai nua."
  exit 0
}

$cmdLine = [string]$proc.CommandLine
$exePath = [string]$proc.ExecutablePath
$procName = [string]$proc.Name

Write-Host "[port:8000] Dang bi chiem boi PID $targetPid ($procName)"
if ($cmdLine) {
  Write-Host "[port:8000] CommandLine: $cmdLine"
}

$ownedByNewApp = $false
$matchedMarker = $null
foreach ($marker in $safeMarkers) {
  if ($cmdLine -like $marker) {
    $ownedByNewApp = $true
    $matchedMarker = $marker
    break
  }
}

if (-not $ownedByNewApp) {
  Write-Host "[port:8000] Process khong ro thuoc NEW APP. KHONG kill tu dong."
  exit 20
}

# At this point we know it's our process and AutoKill is set
Write-Host "[port:8000] Phat hien NEW APP backend dang chay tren port 8000 (PID $targetPid)."
Write-Host "[port:8000] Stopping existing NEW APP backend PID $targetPid..."
Stop-Process -Id $targetPid -Force
Start-Sleep -Milliseconds 500
Write-Host "[port:8000] Da giai phong port 8000."
exit 0
