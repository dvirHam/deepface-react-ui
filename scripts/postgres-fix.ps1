# Reset deepface_user and ensure the deepface database exists.
param(
    [string]$PostgresPassword = ""
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

Write-Host "Expected app connection:"
Write-Host "  $Script:DeepFacePostgresUri"
Write-Host ""

Initialize-DeepFacePostgres -PostgresPassword $PostgresPassword

Write-Host ""
Write-Host "Restart the API: .\start-backend.ps1"
