$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $repoRoot "frontend"
$venvPython = Join-Path $repoRoot "myenv\Scripts\python.exe"
$logsDir = Join-Path $repoRoot "logs"

$backendPidFile = Join-Path $logsDir "backend.pid"
$frontendPidFile = Join-Path $logsDir "frontend.pid"
$backendLog = Join-Path $logsDir "backend.log"
$backendErrLog = Join-Path $logsDir "backend.err.log"
$frontendLog = Join-Path $logsDir "frontend.log"
$frontendErrLog = Join-Path $logsDir "frontend.err.log"

function Test-PortInUse {
    param([int]$Port)

    $listeners = netstat -ano -p tcp | Select-String ":$Port\s+.*LISTENING\s+"
    return $null -ne $listeners
}

function Stop-TrackedProcess {
    param(
        [string]$PidFile,
        [string]$Name
    )

    if (-not (Test-Path $PidFile)) {
        return
    }

    $pidValue = Get-Content $PidFile | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($pidValue)) {
        Remove-Item $PidFile -Force
        return
    }

    $existingProcess = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($existingProcess) {
        Stop-Process -Id $existingProcess.Id -Force
        Start-Sleep -Seconds 1
        Write-Host "Stopped existing $Name process ($($existingProcess.Id))."
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

Stop-TrackedProcess -PidFile $backendPidFile -Name "backend"
Stop-TrackedProcess -PidFile $frontendPidFile -Name "frontend"

if (-not (Test-Path $venvPython)) {
    throw "Python virtual environment not found at $venvPython"
}

if (Test-PortInUse -Port 8000) {
    throw "Port 8000 is already in use by another process. Free it or run .\stop-dev.ps1 first."
}

if (Test-PortInUse -Port 3000) {
    throw "Port 3000 is already in use by another process. Free it or run .\stop-dev.ps1 first."
}

Remove-Item $backendLog, $backendErrLog, $frontendLog, $frontendErrLog -Force -ErrorAction SilentlyContinue

$backend = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", "& { Set-Location '$repoRoot'; & '$venvPython' -m uvicorn server:app --host 127.0.0.1 --port 8000 }"
    ) `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErrLog `
    -PassThru `
    -WindowStyle Hidden

$frontend = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", "& { Set-Location '$frontendRoot'; $env:VITE_API_BASE='http://127.0.0.1:8000'; & 'npm.cmd' run dev -- --host 127.0.0.1 --port 3000 --strictPort }"
    ) `
    -RedirectStandardOutput $frontendLog `
    -RedirectStandardError $frontendErrLog `
    -PassThru `
    -WindowStyle Hidden

Set-Content -Path $backendPidFile -Value $backend.Id
Set-Content -Path $frontendPidFile -Value $frontend.Id

Write-Host "Backend starting on http://127.0.0.1:8000"
Write-Host "Frontend starting on http://127.0.0.1:3000"
Write-Host "Logs: $logsDir"
