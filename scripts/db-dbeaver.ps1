# Open DBeaver with a connected Postgres SQL console and the DeepFace setup script.
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

$Dbeaver = Join-Path $env:LOCALAPPDATA "DBeaver\dbeaver.exe"
if (-not (Test-Path $Dbeaver)) {
    Write-Error "DBeaver not found at $Dbeaver"
}

$SqlFile = Join-Path $PSScriptRoot "setup-deepface-db-pgadmin.sql"
$SecurePassword = Read-Host "PostgreSQL password for user 'postgres'" -AsSecureString
$Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
try {
    $PostgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($Bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
}

if ($PostgresPassword -match '\|') {
    Write-Error "Password contains '|' which breaks DBeaver CLI. Set the password in DBeaver UI instead (Edit Connection)."
}

$Con = @(
    "driver=postgresql"
    "host=localhost"
    "port=5432"
    "database=postgres"
    "user=postgres"
    "password=$PostgresPassword"
    "name=Postgres Setup"
    "openConsole=true"
    "connect=true"
    "create=true"
    "save=true"
    "savePassword=true"
) -join "|"

Write-Host "Opening DBeaver with Postgres connection and setup SQL ..."
Start-Process -FilePath $Dbeaver -ArgumentList @(
    "-bringToFront=true"
    "-con", $Con
    "-f", $SqlFile
)

Write-Host ""
Write-Host "In DBeaver:"
Write-Host "  1. Confirm the SQL editor connection is 'Postgres Setup' (not <none>)"
Write-Host "  2. Select all (Ctrl+A) and execute (Ctrl+Enter)"
Write-Host ""
