$ErrorActionPreference = "Stop"
$env:TOONFLOW_GPT_IMAGE_POC_PORT = "3301"
Write-Host "Starting isolated Toonflow GPT Image POC at http://127.0.0.1:3301"
Write-Host "OAuth callback: http://localhost:1455/auth/callback"
bun run tools/gptImagePoc/server.ts
