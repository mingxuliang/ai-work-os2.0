# Start AIWork-OS (in-tree QwenPaw 2.0 fork) — Windows
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

$EnvFile = Join-Path $PSScriptRoot ".env.qw2"
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $i = $line.IndexOf("=")
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    Set-Item -Path "Env:$k" -Value $v
  }
}

$env:AIWORK_KERNEL = "qwenpaw2"
$ConsoleDist = Join-Path $Root "console\dist"
if (Test-Path (Join-Path $ConsoleDist "index.html")) {
  $env:AIWORK_CONSOLE_STATIC_DIR = $ConsoleDist
  $env:QWENPAW_CONSOLE_STATIC_DIR = $ConsoleDist
  Write-Host "Using Console UI: $ConsoleDist"
} else {
  Write-Host "WARNING: console\dist missing — run: cd console; npm ci; npm run build"
}

Write-Host "Installing editable aiwork (in-tree fork)..."
python -m pip install -e "$Root" -q

Write-Host "Doctor check..."
python -c "from aiwork.app.enterprise_doctor import run_doctor; raise SystemExit(run_doctor(governance_test=True))"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Doctor reported issues — review above before production traffic."
}

Write-Host "Starting aiwork app..."
python -m aiwork app --host 127.0.0.1 --port 8088
