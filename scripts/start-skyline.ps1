# Skyline Career — start catalog + host in one window
param(
  [ValidateSet('simconnect', 'mock')]
  [string]$Mode = 'simconnect',
  [string]$Sdk = $env:MSFS_SDK,
  [string]$Port = '8080',
  [string]$Pipe = 'msfs-compat-simbridge'
)

$ErrorActionPreference = 'Stop'

# Works from repo (scripts/start-skyline.ps1) or portable bundle (./start.ps1)
$Root = $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  $Root = Split-Path -Parent $PSScriptRoot
}
if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  throw "Could not find package.json near $PSScriptRoot"
}

if (-not $Sdk) { $Sdk = 'C:\MSFS 2024 SDK' }

Write-Host "Skyline Career root: $Root"
Write-Host "Mode: $Mode"

$script = Join-Path $Root 'scripts\start-skyline.mjs'
$argsList = @($script, '--mode', $Mode, '--port', $Port, '--pipe', $Pipe)
if ($Mode -eq 'simconnect') {
  $argsList += @('--sdk', $Sdk)
}

& node @argsList
