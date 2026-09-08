# Start DeepFace API locally with Python + Flask (no Docker).
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:TF_ENABLE_ONEDNN_OPTS = "0"
$env:OMP_NUM_THREADS = "1"

Set-DeepFaceDatabaseEnv

$Python = Get-LocalPython
if (-not $Python) {
    Write-Error "Python not found. Run .\setup-local.ps1 first."
}

if (-not (Test-DeepFacePostgres)) {
    Write-LocalSetupHint
    Write-Error "Cannot start API without a working Postgres connection."
}

$Port = $Script:DeepFaceApiPort
$Existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Existing) {
    $Pids = $Existing.OwningProcess | Sort-Object -Unique
    Write-Host "Stopping existing process(es) on port ${Port}: $($Pids -join ', ')"
    foreach ($processId in $Pids) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Set-Location $Script:DeepFaceRoot

Write-Host "Using Python: $Python"
Write-Host "DeepFace root: $Script:DeepFaceRoot"
Write-Host "Database: $Script:DeepFacePostgresUri"
Write-Host "Starting API at http://localhost:${Port} ..."

& $Python -c "from deepface.api.src.app import create_app; app = create_app(); app.run(host='0.0.0.0', port=$Port, debug=False)"
