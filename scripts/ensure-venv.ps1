param(
  [switch]$InstallRequirements
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venvPath = Join-Path $root '.venv'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
$backendRequirements = Join-Path $root 'backend\requirements.txt'

function New-LocalVenv {
  param([string]$TargetRoot)

  $pythonCreated = $false
  try {
    & python -m venv (Join-Path $TargetRoot '.venv')
    if ($LASTEXITCODE -eq 0) { $pythonCreated = $true }
  } catch {}

  if (-not $pythonCreated) {
    try {
      & py -3 -m venv (Join-Path $TargetRoot '.venv')
      if ($LASTEXITCODE -eq 0) { $pythonCreated = $true }
    } catch {}
  }

  if (-not $pythonCreated) {
    throw 'Khong tao duoc Python venv. Hay cai Python 3 truoc.'
  }
}

if (-not (Test-Path $venvPython)) {
  Write-Host '[backend:venv] Tao moi .venv tai F:\APPs\.venv'
  New-LocalVenv -TargetRoot $root
}

if (-not (Test-Path $venvPython)) {
  throw 'Khong tim thay F:\APPs\.venv\Scripts\python.exe sau khi tao venv.'
}

if ($InstallRequirements) {
  if (-not (Test-Path $backendRequirements)) {
    throw "Khong tim thay requirements: $backendRequirements"
  }

  Write-Host '[backend:install] Nang cap pip trong venv...'
  & $venvPython -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) {
    throw 'Nang cap pip that bai.'
  }

  Write-Host '[backend:install] Cai backend requirements...'
  & $venvPython -m pip install -r $backendRequirements
  if ($LASTEXITCODE -ne 0) {
    throw 'Cai backend requirements that bai.'
  }
}

Write-Host "[backend:venv] San sang: $venvPython"