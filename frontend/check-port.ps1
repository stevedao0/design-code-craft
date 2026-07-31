try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 8
    $ok = $r.Content -match 'B1dyN6t5'
    Write-Host "Port 8000 serves new bundle: $ok"
    if (-not $ok) { Write-Host "HTML preview: $($r.Content.Substring(0, 500))" }
} catch {
    Write-Host "Port 8000 error: $($_.Exception.Message)"
}
