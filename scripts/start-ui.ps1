# Start React UI with npm (no Docker).
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "local-config.ps1")

Set-Location $Script:UiRoot

if (-not (Test-Path (Join-Path $Script:UiRoot ".env"))) {
    Copy-Item (Join-Path $Script:UiRoot ".env.example") (Join-Path $Script:UiRoot ".env")
    Write-Host "Created .env from .env.example"
}

Write-Host "Starting React UI at http://localhost:${Script:UiPort} ..."
npm start
