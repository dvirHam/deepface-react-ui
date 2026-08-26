# Shared paths and defaults for local (non-Docker) development.
$Script:DeepFacePostgresUri = "postgresql://deepface_user:deepface_pass@localhost:5432/deepface"
$Script:DeepFacePostgresHost = "localhost"
$Script:DeepFacePostgresPort = 5432
$Script:DeepFaceApiPort = 5005
$Script:UiPort = 3000
$Script:DeepFaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\deepface")).Path
$Script:UiRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-LocalPython {
    $Candidates = @(
        "C:\Users\Dvir\AppData\Local\Programs\Python\Python311\python.exe",
        (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    )
    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-Path $Candidate)) {
            return $Candidate
        }
    }
    return $null
}

function Get-PsqlPath {
    $Candidates = @(
        (Get-Command psql -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    )
    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-Path $Candidate)) {
            return $Candidate
        }
    }
    return $null
}

function Test-DeepFacePostgres {
    param([string]$Uri = $Script:DeepFacePostgresUri)

    $Python = Get-LocalPython
    if (-not $Python) {
        return $false
    }

    $TestScript = @"
import sys
try:
    import psycopg
    psycopg.connect('$Uri').close()
    sys.exit(0)
except Exception as exc:
    print(exc)
    sys.exit(1)
"@

    & $Python -c $TestScript
    return $LASTEXITCODE -eq 0
}

function Set-DeepFaceDatabaseEnv {
    $env:DEEPFACE_DATABASE_TYPE = "postgres"
    $env:DEEPFACE_CONNECTION_DETAILS = $Script:DeepFacePostgresUri
    $env:DEEPFACE_POSTGRES_URI = $Script:DeepFacePostgresUri
}

function Setup-NativePostgres {
    $Psql = Get-PsqlPath
    if (-not $Psql) {
        Write-Error "psql not found. Install PostgreSQL for Windows."
    }

    Write-Host "Creates user deepface_user, database deepface"
    $SuperUser = Read-Host "PostgreSQL superuser (default: postgres)"
    if (-not $SuperUser) {
        $SuperUser = "postgres"
    }

    $SetupSql = @'
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'deepface_user') THEN
        CREATE USER deepface_user WITH PASSWORD 'deepface_pass';
    ELSE
        ALTER USER deepface_user WITH PASSWORD 'deepface_pass';
    END IF;
END $$;

SELECT 'CREATE DATABASE deepface OWNER deepface_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'deepface')\gexec

GRANT ALL PRIVILEGES ON DATABASE deepface TO deepface_user;
'@

    $TempSql = Join-Path $env:TEMP "deepface-setup.sql"
    Set-Content -Path $TempSql -Value $SetupSql -Encoding UTF8
    & $Psql -U $SuperUser -h $Script:DeepFacePostgresHost -p $Script:DeepFacePostgresPort -f $TempSql
    Remove-Item $TempSql -ErrorAction SilentlyContinue

    if (-not (Test-DeepFacePostgres)) {
        Write-Error "Connection test failed."
    }

    Write-Host "Postgres is ready."
}

function Print-LocalHealthCheck {
    Write-Host "=== Local environment check ==="

    $Python = Get-LocalPython
    if ($Python) {
        Write-Host "[OK] Python: $Python"
        & $Python -c "import deepface" 2>$null
        if ($LASTEXITCODE -eq 0) { Write-Host "[OK] deepface" } else { Write-Host "[!!] run setup-local.ps1" }
        & $Python -c "import psycopg" 2>$null
        if ($LASTEXITCODE -eq 0) { Write-Host "[OK] psycopg" } else { Write-Host "[!!] run setup-local.ps1" }
    } else {
        Write-Host "[!!] Python not found"
    }

    $Psql = Get-PsqlPath
    if ($Psql) { Write-Host "[OK] psql: $Psql" } else { Write-Host "[!!] install PostgreSQL" }

    if (Test-Path (Join-Path $Script:UiRoot "node_modules")) {
        Write-Host "[OK] node_modules"
    } else {
        Write-Host "[!!] run setup-local.ps1"
    }

    if (Test-DeepFacePostgres) {
        Write-Host "[OK] Postgres: $Script:DeepFacePostgresUri"
    } else {
        Write-Host "[!!] run setup-local.ps1"
    }
}

function Write-LocalSetupHint {
    Write-Host ""
    Write-Host "Local Postgres not ready."
    Write-Host "  1. Install PostgreSQL (port 5432)"
    Write-Host "  2. Run .\setup-local.ps1"
    Write-Host "Docker optional: deepface\docker docker compose up -d postgres (port 5433)"
    Write-Host ""
}
