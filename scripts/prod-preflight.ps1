param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$ExpectedBranch = "main",
  [string]$ExpectedProject = "his-system-prod",
  [string]$ExpectedRemote = "origin"
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

function Info([string]$Message) {
  Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "Git no esta disponible en PATH."
}

Push-Location $RepoPath
try {
  Info "Repositorio: $RepoPath"
  Info "Actualizando referencias remotas..."
  git fetch $ExpectedRemote --prune | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "No se pudo hacer fetch de $ExpectedRemote." }

  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { Fail "No se pudo leer la rama actual." }
  if ($branch -ne $ExpectedBranch) {
    Fail "Rama actual '$branch'. Debe ser '$ExpectedBranch'."
  }

  $dirty = git status --short
  if ($LASTEXITCODE -ne 0) { Fail "No se pudo leer git status." }
  if (-not [string]::IsNullOrWhiteSpace(($dirty -join "`n"))) {
    Fail "Hay cambios locales sin commitear. Ejecuta git status y limpia antes de deploy."
  }

  $countsRaw = (git rev-list --left-right --count "HEAD...$ExpectedRemote/$ExpectedBranch").Trim()
  if ($LASTEXITCODE -ne 0) { Fail "No se pudo comparar HEAD con $ExpectedRemote/$ExpectedBranch." }

  $parts = $countsRaw -split "\s+"
  if ($parts.Length -lt 2) {
    Fail "No se pudo interpretar ahead/behind: '$countsRaw'."
  }

  $ahead = [int]$parts[0]
  $behind = [int]$parts[1]

  if ($ahead -ne 0 -or $behind -ne 0) {
    Fail "HEAD no esta alineado con $ExpectedRemote/$ExpectedBranch (ahead=$ahead, behind=$behind)."
  }

  $localHash = (git rev-parse --short HEAD).Trim()
  $remoteHash = (git rev-parse --short "$ExpectedRemote/$ExpectedBranch").Trim()

  $projectJsonPath = Join-Path $RepoPath ".vercel\project.json"
  if (-not (Test-Path $projectJsonPath)) {
    Fail "No existe .vercel/project.json en esta carpeta."
  }

  $projectJson = Get-Content -Raw $projectJsonPath | ConvertFrom-Json
  $projectName = [string]$projectJson.projectName

  if ([string]::IsNullOrWhiteSpace($projectName)) {
    Fail "No se pudo leer projectName en .vercel/project.json."
  }

  if ($projectName -ne $ExpectedProject) {
    Fail "Esta carpeta esta linkeada a '$projectName' y debe estar linkeada a '$ExpectedProject'."
  }

  Write-Host "[OK] Preflight aprobado" -ForegroundColor Green
  Write-Host "      branch=$branch" -ForegroundColor Green
  Write-Host "      commit=$localHash" -ForegroundColor Green
  Write-Host "      remote=$remoteHash" -ForegroundColor Green
  Write-Host "      vercelProject=$projectName" -ForegroundColor Green
}
finally {
  Pop-Location
}
