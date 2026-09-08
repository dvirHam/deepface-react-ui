# One-time local setup: npm deps, DeepFace Python API, psycopg, optional Postgres DB.
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

Write-Host "=== DeepFace React UI - local (non-Docker) setup ==="
Write-Host ""

$Python = Get-LocalPython
if (-not $Python) {
    Write-Error "Python not found. Install Python 3.11+ and rerun this script."
}

Write-Host "[1/4] Installing React UI dependencies ..."
Set-Location $Script:UiRoot
if (-not (Test-Path (Join-Path $Script:UiRoot "node_modules"))) {
    npm install
} else {
    Write-Host "node_modules already exists - skipping npm install"
}

if (-not (Test-Path (Join-Path $Script:UiRoot ".env"))) {
    Copy-Item (Join-Path $Script:UiRoot ".env.example") (Join-Path $Script:UiRoot ".env")
    Write-Host "Created .env from .env.example"
}

Write-Host ""
Write-Host "[2/4] Installing DeepFace API (editable) + Postgres driver ..."
Set-Location $Script:DeepFaceRoot
& $Python -m pip install --upgrade pip
& $Python -m pip install -e .
& $Python -m pip install "psycopg[binary]"

Write-Host ""
Write-Host "[3/4] Checking Postgres ..."
if (Test-DeepFacePostgres) {
    Write-Host "Postgres connection OK: $Script:DeepFacePostgresUri"
} else {
    Write-Host "Postgres not reachable yet."
    $RunDbSetup = Read-Host "Create deepface database now? (y/N)"
    if ($RunDbSetup -eq "y" -or $RunDbSetup -eq "Y") {
        Setup-NativePostgres
    } else {
        Write-Host "Skipped DB setup. Rerun setup-local.ps1 before Register/Verify."
    }
}

Write-Host ""
Write-Host "[4/4] Health check ..."
Print-LocalHealthCheck

Write-Host ""
Write-Host "Done."
Write-Host ""
Write-Host "Start everything:  .\start-local.ps1"
Write-Host "  API only:        .\start-backend.ps1"
Write-Host "  UI only:         .\start-ui.ps1"
Write-Host ""
