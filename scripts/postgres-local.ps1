# Run setup-deepface-db.sql against local Postgres via psql.
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

$Psql = Get-PsqlPath
if (-not $Psql) {
    Write-Error "psql not found. Install PostgreSQL for Windows."
}

$SqlFile = Join-Path $PSScriptRoot "setup-deepface-db.sql"
if (-not (Test-Path $SqlFile)) {
    Write-Error "SQL file not found: $SqlFile"
}

$SuperUser = Read-Host "PostgreSQL superuser (default: postgres)"
if (-not $SuperUser) {
    $SuperUser = "postgres"
}

$SecurePassword = Read-Host "Password for '$SuperUser'" -AsSecureString
$Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
try {
    $PostgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($Bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
}

$PreviousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $PostgresPassword
try {
    & $Psql -U $SuperUser -h $Script:DeepFacePostgresHost -p $Script:DeepFacePostgresPort -d postgres -f $SqlFile
    if ($LASTEXITCODE -ne 0) {
        Write-Error "psql failed with exit code $LASTEXITCODE"
    }
} finally {
    if ($null -ne $PreviousPassword) {
        $env:PGPASSWORD = $PreviousPassword
    } else {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

if (Test-DeepFacePostgres) {
    Write-Host "Postgres OK: $Script:DeepFacePostgresUri"
} else {
    Write-Error "Connection test failed after setup."
}
