$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$logsDir = Join-Path $repoRoot "logs"

function Stop-TrackedProcess {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return $false
    }

    $pidValue = Get-Content $PidFile | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($pidValue)) {
        $existingProcess = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
        if ($existingProcess) {
            Stop-Process -Id $existingProcess.Id -Force
        }
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    return $true
}

$stoppedBackend = Stop-TrackedProcess -PidFile (Join-Path $logsDir "backend.pid")
$stoppedFrontend = Stop-TrackedProcess -PidFile (Join-Path $logsDir "frontend.pid")

if ($stoppedBackend -or $stoppedFrontend) {
    Write-Host "Stopped tracked dev services."
} else {
    Write-Host "No tracked dev services were running."
}
