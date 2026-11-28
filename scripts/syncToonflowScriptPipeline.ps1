$ErrorActionPreference = "Stop"

$repoDirectory = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $repoDirectory "skillPackages\toonflowScriptPipeline"
$skillRoot = if ($env:TOONFLOW_CODEX_SKILLS_DIR) {
  $env:TOONFLOW_CODEX_SKILLS_DIR
} else {
  Join-Path $env:USERPROFILE ".agents\skills"
}
$targetDirectory = Join-Path $skillRoot "toonflow-script-pipeline"
$requiredFiles = @(
  "SKILL.md",
  "agents\openai.yaml",
  "references\workflowRouting.md",
  "references\toonflowMcp.md",
  "references\h3Planning.md",
  "references\promptReferenceBinding.md",
  "references\approvalGates.md",
  "references\resumeRecoveryAcceptance.md"
)
$dependencySkills = @(
  "short-drama",
  "short-drama-develop",
  "short-drama-write",
  "short-drama-review",
  "short-drama-assets",
  "short-drama-storyboard",
  "short-drama-image-prompts",
  "short-drama-video-prompts",
  "short-drama-novel-analyze",
  "short-drama-breakdown",
  "short-drama-produce",
  "short-drama-edit",
  "h3-storyboard",
  "h3-prompt-writing"
)

foreach ($relativePath in $requiredFiles) {
  $sourcePath = Join-Path $sourceDirectory $relativePath
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Pipeline Skill 文件缺失：$sourcePath"
  }
}

New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
Get-ChildItem -LiteralPath $sourceDirectory -Force | Copy-Item -Destination $targetDirectory -Recurse -Force
Write-Output "Pipeline Skill 已同步到：$targetDirectory"

$missingSkills = @(
  foreach ($skillName in $dependencySkills) {
    $skillManifest = Join-Path (Join-Path $skillRoot $skillName) "SKILL.md"
    if (-not (Test-Path -LiteralPath $skillManifest -PathType Leaf)) {
      $skillName
    }
  }
)

if ($missingSkills.Count -eq 0) {
  Write-Output "14 个依赖 Skill 均已安装。"
} else {
  Write-Warning "缺少以下依赖 Skill：$($missingSkills -join ', ')"
  Write-Output "安装来源与命令见 docs\toonflowSkillDependencies.md。"
}
