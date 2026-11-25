$ErrorActionPreference = "Stop"

$repoDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoDirectory

$composeArgs = @("compose", "-f", "compose.yaml", "-f", "compose.production.override.yaml")

function invokeDocker {
  param([string[]]$dockerArgs)

  & docker @dockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($dockerArgs -join ' ') 执行失败，退出码：$LASTEXITCODE"
  }
}

invokeDocker ($composeArgs + @("build", "toonflow"))
invokeDocker ($composeArgs + @("up", "-d", "--no-build", "toonflow"))

$containerArgs = $composeArgs + @("ps", "-q", "toonflow")
$containerId = (& docker @containerArgs).Trim()
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
  throw "部署后没有找到 Toonflow 容器"
}

$activeImageId = (& docker inspect --format "{{.Image}}" $containerId).Trim()
if ($LASTEXITCODE -ne 0 -or -not $activeImageId) {
  throw "无法确认当前运行容器的镜像"
}

$containerRunning = (& docker inspect --format "{{.State.Running}}" $containerId).Trim()
if ($LASTEXITCODE -ne 0 -or $containerRunning -ne "true") {
  throw "新部署容器未处于运行状态，保留旧 Toonflow 镜像"
}

$imageRows = & docker image ls --no-trunc --format "{{.Repository}}|{{.ID}}"
if ($LASTEXITCODE -ne 0) {
  throw "无法读取 Docker 镜像列表"
}

$oldImageIds = $imageRows | ForEach-Object {
  $image = $_ -split "\|", 2
  if ($image.Count -eq 2 -and $image[0].StartsWith("toonflow", [StringComparison]::OrdinalIgnoreCase) -and $image[1] -ne $activeImageId) {
    $image[1]
  }
} | Sort-Object -Unique

foreach ($imageId in $oldImageIds) {
  $referenceArgs = @("ps", "--all", "--no-trunc", "--filter", "ancestor=$imageId", "--format", "{{.ID}}")
  $containerReferences = & docker @referenceArgs
  if ($LASTEXITCODE -ne 0) {
    throw "无法确认旧镜像 $imageId 是否仍被容器引用"
  }

  if ($containerReferences) {
    Write-Warning "旧 Toonflow 镜像仍被容器引用，保留镜像：$imageId"
    continue
  }

  invokeDocker (@("image", "rm", $imageId))
}

invokeDocker (@("image", "prune", "--force"))
