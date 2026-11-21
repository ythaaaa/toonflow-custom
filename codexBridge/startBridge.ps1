$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$entry = Join-Path $bridgeDir 'server.mjs'
$pidFile = Join-Path $bridgeDir 'bridge.pid'
$logDir = Join-Path $env:TEMP 'toonflow-codex-bridge'
$stdoutLog = Join-Path $logDir 'bridge.stdout.log'
$stderrLog = Join-Path $logDir 'bridge.stderr.log'
if (Test-Path -LiteralPath $pidFile) {
  $savedPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
  if ($existing -and $existing.CommandLine.Contains($entry)) { Write-Output "Bridge already running (PID $savedPid)"; exit 0 }
}
$null = New-Item -ItemType Directory -Path $logDir -Force
$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $node -ArgumentList @('"' + $entry + '"') -WorkingDirectory (Split-Path -Parent $bridgeDir) -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
Write-Output "Bridge started (PID $($process.Id))"
Write-Output "Bridge logs: $logDir"
