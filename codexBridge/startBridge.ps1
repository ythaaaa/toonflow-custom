$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$entry = Join-Path $bridgeDir 'server.mjs'
$pidFile = Join-Path $bridgeDir 'bridge.pid'
if (Test-Path -LiteralPath $pidFile) {
  $savedPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
  if ($existing -and $existing.CommandLine.Contains($entry)) { Write-Output "Bridge already running (PID $savedPid)"; exit 0 }
}
$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $node -ArgumentList @('"' + $entry + '"') -WorkingDirectory (Split-Path -Parent $bridgeDir) -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
Write-Output "Bridge started (PID $($process.Id))"
