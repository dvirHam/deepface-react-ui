# Start Postgres check + DeepFace API + Voice API + React UI (all non-Docker).
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

$DbScript = Join-Path $PSScriptRoot "start-db.ps1"
$BackendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$VoiceApiScript = Join-Path $PSScriptRoot "start-voice-api.ps1"
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

if (Test-Path (Join-Path $Script:VoiceApiRoot "scripts\start-api.ps1")) {
    Write-Host "Opening Voice API window (port $($Script:VoiceApiPort)) ..."
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $VoiceApiScript
    Start-Sleep -Seconds 2
} else {
    Write-Host "Voice API repo not found at $Script:VoiceApiRoot — skipping (optional)."
}

Write-Host "Opening React UI window (port 3000) ..."
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $UiScript

Write-Host ""
Write-Host "Done."
Write-Host "  Face API:  http://localhost:5005"
Write-Host "  Voice API: http://localhost:5006"
Write-Host "  UI:        http://localhost:3000"
Write-Host ""
