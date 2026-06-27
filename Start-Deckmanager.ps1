$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $scriptDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found on PATH." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "Starting Deckmanager..." -ForegroundColor Cyan
Write-Host "Keep this window open while Tabletop Simulator imports generated sheets." -ForegroundColor Gray
Write-Host ""

$port = if ($env:DECKMANAGER_PORT) { $env:DECKMANAGER_PORT } else { "17778" }
node .\app\server.mjs --port $port

Write-Host ""
Write-Host "Deckmanager stopped." -ForegroundColor Yellow
Read-Host "Press Enter to close"
