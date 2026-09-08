# Create or verify the local deepface Postgres user/database.
param(
    [string]$PostgresPassword = ""
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

Write-Host "Expected connection:"
Write-Host "  $Script:DeepFacePostgresUri"
Write-Host ""

if (Test-DeepFacePostgres) {
    Write-Host "Postgres already configured."
    exit 0
}

Write-LocalSetupHint
Initialize-DeepFacePostgres -PostgresPassword $PostgresPassword
Write-Host "Restart the API: .\start-backend.ps1"
