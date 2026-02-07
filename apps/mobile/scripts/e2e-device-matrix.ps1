# =====================================================
# E2E Device Matrix Test Runner (Windows/PowerShell)
# =====================================================
# Runs E2E tests on Android emulators (iOS requires macOS)
# Usage: .\scripts\e2e-device-matrix.ps1

param(
    [switch]$AndroidOnly,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

$FlowDir = ".maestro\flows"
$ResultsDir = ".maestro\results"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# Create results directory
$ResultsPath = Join-Path $ResultsDir $Timestamp
New-Item -ItemType Directory -Force -Path $ResultsPath | Out-Null

# Android Devices (Windows can only run Android emulators)
$AndroidDevices = @(
    "Pixel_4a",
    "Pixel_6",
    "Pixel_7_Pro"
)

Write-Host "======================================"
Write-Host "Pick Rivals E2E Device Matrix Tests"
Write-Host "Timestamp: $Timestamp"
Write-Host "Platform: Windows (Android only)"
Write-Host "======================================"

# Check if Maestro is available
$MaestroPath = "$env:USERPROFILE\.maestro\bin\maestro.bat"
if (-not (Test-Path $MaestroPath)) {
    # Try global maestro
    try {
        $null = Get-Command maestro -ErrorAction Stop
        $MaestroCmd = "maestro"
    } catch {
        Write-Host "Error: Maestro CLI not found. Install with:"
        Write-Host "  iwr https://get.maestro.mobile.dev -UseBasicParsing | iex"
        exit 1
    }
} else {
    $MaestroCmd = $MaestroPath
}

# Track results
$FailedDevices = @()
$PassedDevices = @()

Write-Host ""
Write-Host "======================================"
Write-Host "Running Android Emulator Tests"
Write-Host "======================================"

foreach ($device in $AndroidDevices) {
    $safeName = $device -replace ' ', '_' -replace '[()]', '_'
    $outputFile = Join-Path $ResultsPath "android_$safeName.xml"
    $logFile = Join-Path $ResultsPath "android_$safeName.log"

    Write-Host ""
    Write-Host "Testing on: $device (android)"
    Write-Host "--------------------------------------"

    try {
        $output = & $MaestroCmd test --device "$device" --format junit --output "$outputFile" $FlowDir 2>&1
        $output | Out-File -FilePath $logFile -Encoding utf8

        if ($Verbose) {
            Write-Host $output
        }

        if ($LASTEXITCODE -eq 0) {
            Write-Host "PASSED: $device" -ForegroundColor Green
            $PassedDevices += "Android: $device"
        } else {
            Write-Host "FAILED: $device" -ForegroundColor Red
            $FailedDevices += "Android: $device"
        }
    } catch {
        Write-Host "ERROR: $device - $_" -ForegroundColor Red
        $FailedDevices += "Android: $device"
    }
}

# Summary
Write-Host ""
Write-Host "======================================"
Write-Host "Device Matrix Test Summary"
Write-Host "======================================"
Write-Host "Results saved to: $ResultsPath"
Write-Host ""
Write-Host "Passed: $($PassedDevices.Count)"
foreach ($device in $PassedDevices) {
    Write-Host "  [PASS] $device" -ForegroundColor Green
}
Write-Host ""
Write-Host "Failed: $($FailedDevices.Count)"
foreach ($device in $FailedDevices) {
    Write-Host "  [FAIL] $device" -ForegroundColor Red
}

if ($FailedDevices.Count -gt 0) {
    Write-Host ""
    Write-Host "Some tests failed. Check logs in $ResultsPath"
    exit 1
} else {
    Write-Host ""
    Write-Host "All device tests passed!" -ForegroundColor Green
    exit 0
}
