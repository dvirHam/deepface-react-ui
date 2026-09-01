# Start HebrewScribe Voice API (sibling repo on port 5006).
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-paths.ps1")

$VoiceScript = Join-Path $Script:VoiceApiRoot "scripts\start-api.ps1"
if (-not (Test-Path $VoiceScript)) {
    Write-Error "Voice API not found at $Script:VoiceApiRoot. Clone or create hebrewscribe-voice-api beside deepface-react-ui."
}

Write-Host "Starting Voice API at http://localhost:$($Script:VoiceApiPort) ..."
& $VoiceScript
