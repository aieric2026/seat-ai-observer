[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$NodeExe,
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not (Test-Path -LiteralPath $NodeExe -PathType Leaf)) { throw 'The registered Node executable no longer exists.' }
$runner = Join-Path $project 'scripts\update.mjs'
$logs = Join-Path $project '.runtime\logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$log = Join-Path $logs "scheduled-$stamp.log"
Set-Location -LiteralPath $project
& $NodeExe $runner --scheduled *> $log
exit $LASTEXITCODE
