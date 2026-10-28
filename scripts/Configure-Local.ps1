[CmdletBinding()]
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$Repository = 'aieric2026/seat-ai-observer',
  [string]$PagesUrl = 'https://aieric2026.github.io/seat-ai-observer/',
  [string]$CodexExe = '',
  [string]$GitExe = '',
  [string]$TaskName = 'SeatAI-Daily-1000'
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $CodexExe) { $CodexExe = (Get-Command codex.exe -ErrorAction Stop).Source }
if (-not $GitExe) { $GitExe = (Get-Command git.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $CodexExe -PathType Leaf)) { throw 'Codex executable was not found.' }
if (-not (Test-Path -LiteralPath $GitExe -PathType Leaf)) { throw 'Git executable was not found.' }
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Invalid GitHub repository owner/name.' }
$uri = [Uri]$PagesUrl
if ($uri.Scheme -ne 'https' -or -not $uri.Host.EndsWith('.github.io')) { throw 'Expected the verified HTTPS github.io URL.' }
$runtime = Join-Path $project '.runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$configuration = @{ codexExe=$CodexExe;gitExe=$GitExe;repository=$Repository;pagesUrl=$PagesUrl;researchReasoningEffort='medium';taskName=$TaskName }
[IO.File]::WriteAllText((Join-Path $runtime 'local-config.json'),($configuration | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Output 'Local updater paths and repository configured. No credentials were copied; existing official Codex/Git credential storage is used.'
