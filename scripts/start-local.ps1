# Start Postgres check + DeepFace API + React UI (all non-Docker).
$ErrorActionPreference = "Stop"

$DbScript = Join-Path $PSScriptRoot "start-db.ps1"
$BackendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$UiScript = Join-Path $PSScriptRoot "start-ui.ps1"

Write-Host "=== Local dev (no Docker) ==="
Write-Host ""

& $DbScript
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Opening DeepFace API window (port 5005) ..."
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $BackendScript

Start-Sleep -Seconds 2

Write-Host "Opening React UI window (port 3000) ..."
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $UiScript

Write-Host ""
Write-Host "Done."
Write-Host "  API:  http://localhost:5005"
Write-Host "  UI:   http://localhost:3000"
Write-Host ""
