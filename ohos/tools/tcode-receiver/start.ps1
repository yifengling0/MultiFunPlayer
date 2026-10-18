param(
  [int]$Tcp = 8000,
  [int]$Udp = 8001,
  [int]$Http = 8099
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host "Starting TCode receiver: TCP $Tcp / UDP $Udp / dashboard http://127.0.0.1:$Http/"
node .\receiver.mjs --tcp $Tcp --udp $Udp --http $Http
