# Start AIWork-OS Console backend on QwenPaw 2.0 kernel (Windows)
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

Write-Host "Installing QwenPaw 2.0 kernel + enterprise overlay..."
python -m pip install "qwenpaw==2.0.0.post3" -q
python -m pip install -e "$Root\packages\aiwork-enterprise[kernel]" -q
python -m pip install -e "$Root[qw2]" -q

Write-Host "Running migrate helper..."
python "$PSScriptRoot\migrate_qw2.py" --env-file $EnvFile --all

Write-Host "Starting aiwork app (QwenPaw 2.0)..."
python -m aiwork app --host 127.0.0.1 --port 8088
