# Verify local Postgres is reachable (native install on port 5432). No Docker.
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "local-config.ps1")

Write-Host "Checking Postgres at ${Script:DeepFacePostgresHost}:${Script:DeepFacePostgresPort} ..."

if (Test-DeepFacePostgres) {
    Write-Host "Postgres OK: $Script:DeepFacePostgresUri"
    exit 0
}

Write-LocalSetupHint

$RunDbSetup = Read-Host "Create deepface database now? (y/N)"
if ($RunDbSetup -eq "y" -or $RunDbSetup -eq "Y") {
    Setup-NativePostgres
    if (Test-DeepFacePostgres) {
        Write-Host "Postgres OK: $Script:DeepFacePostgresUri"
        exit 0
    }
}

exit 1
