$client = New-Object System.Net.Sockets.TcpClient
$result = $client.BeginConnect("127.0.0.1", 5199, $null, $null)
$wait = $result.AsyncWaitHandle.WaitOne(3000)
if ($wait) {
    $client.EndConnect($result)
    Write-Host "TCP connected: $($client.Connected)"
}
$client.Close()

# Also try HTTP
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5199/api/dev/auth-token" -Method POST -ContentType "application/json" -TimeoutSec 5
    Write-Host "HTTP OK: $($resp.StatusCode)"
} catch {
    Write-Host "HTTP failed: $($_.Exception.Message)"
}
