# Checks that the downloaded release files are the original ones.
# Usage: put VERIFY.ps1, SHA256SUMS.txt and the downloaded files in the same folder, then in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\VERIFY.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sumsFile = Join-Path $here "SHA256SUMS.txt"
if (-not (Test-Path $sumsFile)) { Write-Host "SHA256SUMS.txt is missing from this folder." -ForegroundColor Red; exit 1 }

$ok = $true
$checked = 0
foreach ($line in Get-Content $sumsFile) {
    if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+)$') { continue }
    $expected = $Matches[1].ToLowerInvariant()
    $name = $Matches[2].Trim()
    $path = Join-Path $here $name
    if (-not (Test-Path $path)) { Write-Host "-  $name not downloaded (skipped)"; continue }
    $actual = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $checked++
    if ($actual -eq $expected) { Write-Host "OK $name" -ForegroundColor Green }
    else { Write-Host "NO ${name}: the hash does not match. Do not open it." -ForegroundColor Red; $ok = $false }
}

if ($checked -eq 0) { Write-Host "No files to check." -ForegroundColor Yellow; exit 1 }
if ($ok) { Write-Host "All good: the files are the original ones." -ForegroundColor Green; exit 0 }
exit 1
