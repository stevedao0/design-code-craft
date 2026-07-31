# package-qr-extension.ps1
# Build and package VCPMC QR Portal Assistant extension for client deployment.
#
# What it does:
#   1. Validate all JS files parse correctly (node --check)
#   2. Build frontend (npm run build)
#   3. Copy extension files to F:\APPs\release\vcpmc-qr-portal-assistant\
#   4. Verify manifest.json exists in release folder
#   5. Report summary
#
# Usage:
#   .\package-qr-extension.ps1
#
# Requirements:
#   - Node.js (node.exe in PATH)
#   - npm (npm.cmd in PATH)
#   - Extension source at F:\APPs\browser-extension\vcpmc-qr-helper-v2\

param(
    [switch]$SkipBuild,
    [switch]$SkipSyntaxCheck
)

$ErrorActionPreference = "Stop"
$ExtensionSource = "F:\APPs\browser-extension\vcpmc-qr-helper-v2"
$ReleaseDir = "F:\APPs\release\vcpmc-qr-portal-assistant"
$FrontendDir = "F:\APPs\frontend"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Step {
    param([string]$Msg)
    $t = Get-Date -Format "HH:mm:ss"
    Write-Host "[$t] $Msg" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Msg)
    $t = Get-Date -Format "HH:mm:ss"
    Write-Host "[$t] PASS  $Msg" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Msg)
    $t = Get-Date -Format "HH:mm:ss"
    Write-Host "[$t] FAIL  $Msg" -ForegroundColor Red
}

function Write-Warn {
    param([string]$Msg)
    $t = Get-Date -Format "HH:mm:ss"
    Write-Host "[$t] WARN  $Msg" -ForegroundColor Yellow
}

function Invoke-SyntaxCheck {
    param([string]$FilePath)
    $null = Invoke-Expression "node --check `"$FilePath`" 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Syntax error in $FilePath"
        throw "Syntax check failed: $FilePath"
    }
    Write-Pass "Syntax OK: $(Split-Path $FilePath -Leaf)"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Gray
Write-Host " VCPMC QR Portal Assistant - Package" -ForegroundColor White
Write-Host " Started: $Timestamp" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Gray
Write-Host ""

# 1. Syntax check all JS files
if (-not $SkipSyntaxCheck) {
    Write-Step "Checking JS syntax (node --check)..."
    $jsFiles = @(
        "$ExtensionSource\background.js",
        "$ExtensionSource\content-app-bridge.js",
        "$ExtensionSource\content-portal-fill.js",
        "$ExtensionSource\popup.js"
    )
    foreach ($f in $jsFiles) {
        if (-not (Test-Path $f)) {
            Write-Warn "File not found, skipping: $f"
            continue
        }
        Invoke-SyntaxCheck -FilePath $f
    }
} else {
    Write-Warn "Skipping syntax check"
}

Write-Host ""

# 2. Build frontend
if (-not $SkipBuild) {
    Write-Step "Building frontend..."
    Push-Location $FrontendDir
    try {
        $null = npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Frontend build failed"
            throw "npm run build failed"
        }
        Write-Pass "Frontend built successfully"
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "Skipping frontend build"
}

Write-Host ""

# 3. Copy extension to release
Write-Step "Copying extension to release folder..."
if (-not (Test-Path $ExtensionSource)) {
    Write-Fail "Extension source not found: $ExtensionSource"
    throw "Extension source not found"
}

if (Test-Path $ReleaseDir) {
    Write-Step "Removing existing release folder..."
    Remove-Item -Path "$ReleaseDir\*" -Recurse -Force
}

$null = New-Item -ItemType Directory -Force -Path $ReleaseDir

$files = Get-ChildItem -Path $ExtensionSource -File
foreach ($f in $files) {
    Copy-Item -Path $f.FullName -Destination $ReleaseDir -Force
    Write-Pass "Copied: $($f.Name)"
}

Write-Host ""

# 4. Validate release
Write-Step "Validating release folder..."

$requiredFiles = @(
    "manifest.json",
    "background.js",
    "content-app-bridge.js",
    "content-portal-fill.js",
    "popup.html",
    "popup.js"
)

$allValid = $true
foreach ($fname in $requiredFiles) {
    $path = Join-Path $ReleaseDir $fname
    if (Test-Path $path) {
        Write-Pass "Found: $fname"
    } else {
        Write-Fail "Missing: $fname"
        $allValid = $false
    }
}

$manifestPath = Join-Path $ReleaseDir "manifest.json"
if (Test-Path $manifestPath) {
    try {
        $manifestContent = Get-Content $manifestPath -Raw
        $manifest = $manifestContent | ConvertFrom-Json
        Write-Pass "Manifest version: $($manifest.version)"
        Write-Pass "Manifest name: $($manifest.name)"
    } catch {
        Write-Warn "Could not parse manifest.json: $_"
    }
}

Write-Host ""

# 5. Summary
Write-Host "========================================" -ForegroundColor Gray
Write-Host " Package Summary" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Gray

if ($allValid) {
    Write-Pass "Release folder ready: $ReleaseDir"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. Share the release folder to client machines"
    Write-Host "  2. Client opens chrome://extensions"
    Write-Host "  3. Client enables Developer mode"
    Write-Host "  4. Client clicks Load unpacked and selects:"
    Write-Host "       $ReleaseDir"
    Write-Host "  5. Client pins the extension in Chrome toolbar"
    Write-Host ""
    Write-Host "See F:\APPs\docs\QR_EXTENSION_CLIENT_INSTALL.md for full install guide."
} else {
    Write-Fail "Release folder has missing files. Fix errors above."
    exit 1
}
