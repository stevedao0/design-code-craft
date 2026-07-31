Get-Process -Name 'node' -ErrorAction SilentlyContinue | Select-Object Id, StartTime | Format-Table -AutoSize
Write-Host "---"
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess, State | Format-Table -AutoSize
