# Managed by PerfAgent - regenerated on every export, edit environments/ and config/ instead.
# Usage:  pwsh scripts/run-tests.ps1 [-Test all|<name>] [-Environment dev] [-Tier load|smoke] [-Validate]
#   -Validate runs `k6 inspect` on each test instead of running it (no traffic).
param(
  [string]$Test = "all",
  [string]$Environment = "dev",
  [string]$Tier = "",
  [switch]$Validate
)
# "Continue", not "Stop": Windows PowerShell 5.1 can turn a native program's stderr
# (k6 logs warnings there) into a terminating error under "Stop", e.g. inside Jenkins.
# Every failure below is checked explicitly and ends with an exit code instead.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

if ("$Test$Environment" -match '[\\/]|\.\.') { Write-Error "Invalid test or environment name"; exit 2 }
$envFile = "environments/$Environment.env"
if (-not (Test-Path $envFile)) { Write-Error "Environment file not found: $envFile"; exit 2 }

foreach ($line in Get-Content $envFile) {
  $line = $line.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { continue }
  $key, $value = $line -split "=", 2
  if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
  if (-not [Environment]::GetEnvironmentVariable($key)) {
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

if (-not $Tier) { $Tier = if ($env:PERF_TIER) { $env:PERF_TIER } else { "load" } }
if ($Tier -notmatch '^[A-Za-z0-9_-]+$') { Write-Error "Invalid tier: $Tier"; exit 2 }
$env:PERF_ENV = $Environment
$env:PERF_TIER = $Tier

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) { Write-Error "k6 is not on PATH"; exit 2 }
New-Item -ItemType Directory -Force -Path results | Out-Null

$tests = if ($Test -eq "all") { Get-ChildItem tests -Directory | ForEach-Object Name } else { @($Test) }
$status = 0
foreach ($t in $tests) {
  if (-not (Test-Path "tests/$t/loadtest.js")) { Write-Host "No such test: $t"; $status = 1; continue }
  $env:PERF_TEST = $t
  if ($Validate) {
    & k6 inspect --include-system-env-vars "tests/$t/loadtest.js" | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "VALID    $t" } else { Write-Host "INVALID  $t"; $status = 1 }
    continue
  }
  Write-Host "=== $t (environment: $Environment, tier: $Tier) ==="
  & k6 run --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)" --summary-export "results/$t-summary.json" "tests/$t/loadtest.js"
  switch ($LASTEXITCODE) {
    0  { Write-Host "PASS   $t" }
    99 { Write-Host "FAIL   $t - thresholds breached"; $status = 1 }
    default { Write-Host "ERROR  $t - k6 exited with code $LASTEXITCODE"; $status = 1 }
  }
}
exit $status
