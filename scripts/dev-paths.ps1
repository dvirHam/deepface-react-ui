# Shared paths and defaults for local (non-Docker) development.
$Script:DeepFacePostgresUri = "postgresql://deepface_user:deepface_pass@localhost:5432/deepface"
$Script:DeepFacePostgresHost = "localhost"
$Script:DeepFacePostgresPort = 5432
$Script:DeepFaceApiPort = 5005
$Script:VoiceApiPort = 5006
$Script:UiPort = 3000
$Script:DeepFaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\deepface")).Path
$Script:UiRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VoiceApiCandidate = Join-Path $PSScriptRoot "..\..\hebrewscribe-voice-api"
if (Test-Path $VoiceApiCandidate) {
    $Script:VoiceApiRoot = (Resolve-Path $VoiceApiCandidate).Path
} else {
    $Script:VoiceApiRoot = $VoiceApiCandidate
}

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
        "C:\Program Files\PostgreSQL\18\bin\psql.exe",
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
    $Psql = Get-PsqlPath
    if (-not $Psql) {
        return $false
    }

    $PreviousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = "deepface_pass"
    try {
        & $Psql -U deepface_user -h $Script:DeepFacePostgresHost -p $Script:DeepFacePostgresPort -d deepface -c "SELECT 1;" *> $null
        return $LASTEXITCODE -eq 0
    } finally {
        if ($null -ne $PreviousPassword) {
            $env:PGPASSWORD = $PreviousPassword
        } else {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
    }
}

function Set-DeepFaceDatabaseEnv {
    $env:DEEPFACE_DATABASE_TYPE = "postgres"
    $env:DEEPFACE_CONNECTION_DETAILS = $Script:DeepFacePostgresUri
    $env:DEEPFACE_POSTGRES_URI = $Script:DeepFacePostgresUri
}

function Initialize-DeepFacePostgres {
    param([string]$PostgresPassword = "")

    $Python = Get-LocalPython
    if (-not $Python) {
        Write-Error "Python not found."
    }

    $SetupScript = Join-Path $PSScriptRoot "create_deepface_db.py"
    if ($PostgresPassword) {
        & $Python $SetupScript $PostgresPassword
    } else {
        & $Python $SetupScript
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database setup failed."
    }

    if (-not (Test-DeepFacePostgres)) {
        Write-Error "Connection test failed after setup."
    }

    Write-Host "Postgres is ready."
}

function Write-LocalSetupHint {
    Write-Host ""
    Write-Host "deepface_user does not exist yet in Postgres."
    Write-Host "  Run: .\start-db.ps1"
    Write-Host "  Or in pgAdmin run: scripts\setup-deepface-db-pgadmin.sql"
    Write-Host ""
}
