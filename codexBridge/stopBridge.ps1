$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$entry = Join-Path $bridgeDir 'server.mjs'
$pidFile = Join-Path $bridgeDir 'bridge.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'Bridge is not running'; exit 0 }
$savedPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
if ($process -and $process.CommandLine.Contains($entry)) {
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $savedPid" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'codex.*app-server' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
  Stop-Process -Id $savedPid
  Write-Output "Bridge stopped (PID $savedPid)"
}
Remove-Item -LiteralPath $pidFile
