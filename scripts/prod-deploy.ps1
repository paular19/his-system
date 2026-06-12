param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Project = "his-system-prod",
  [string]$Scope = "paular19s-projects",
  [string]$ExpectedBranch = "main",
  [switch]$SkipPreflight
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Fail "npx no esta disponible en PATH."
}

if (-not $SkipPreflight) {
  $preflight = Join-Path $PSScriptRoot "prod-preflight.ps1"
  & $preflight -RepoPath $RepoPath -ExpectedBranch $ExpectedBranch -ExpectedProject $Project
  if ($LASTEXITCODE -ne 0) {
    Fail "Preflight fallo. No se ejecuto deploy."
  }
}

Write-Host "[INFO] Deploy de produccion en curso..." -ForegroundColor Cyan
& npx --yes vercel@54.11.1 deploy $RepoPath --prod --yes --scope $Scope --project $Project
if ($LASTEXITCODE -ne 0) {
  Fail "Deploy fallo."
}

Write-Host "[OK] Deploy finalizado." -ForegroundColor Green
