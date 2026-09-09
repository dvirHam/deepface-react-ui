# Stop DeepFace API, Voice API, and React UI started for local dev.
# Postgres is intentionally left running.
param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

if (-not $Quiet) {
    Write-Host "=== Stopping local dev services ==="
    Write-Host ""
}

$Ports = Get-LocalDevServicePorts
$StoppedAll = @()

foreach ($Port in $Ports) {
    $Stopped = Stop-ListenersOnPort -Port $Port
    foreach ($Item in $Stopped) {
        $StoppedAll += $Item
        if (-not $Quiet) {
            Write-Host "Stopped $($Item.ProcessName) (PID $($Item.ProcessId)) on port $($Item.Port)"
        }
    }
}

if (-not $Quiet) {
    if ($StoppedAll.Count -eq 0) {
        Write-Host "No listeners found on ports $($Ports -join ', ')."
    } else {
        Write-Host ""
        Write-Host "Stopped $($StoppedAll.Count) process(es)."
    }

    Write-Host "Postgres (port $($Script:DeepFacePostgresPort)) was not stopped."
    Write-Host ""
}
