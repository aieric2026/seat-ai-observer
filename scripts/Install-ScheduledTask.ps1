[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$NodeExe = '',
  [string]$TaskName = 'SeatAI-Daily-1000'
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $NodeExe) { $NodeExe = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $NodeExe -PathType Leaf)) { throw 'Node executable was not found.' }
if (-not (Test-Path -LiteralPath (Join-Path $project '.runtime\last-published.json'))) { throw 'A verified Pages deployment is required before installing the daily task.' }
$published = Get-Content -LiteralPath (Join-Path $project '.runtime\last-published.json') -Raw | ConvertFrom-Json
if (-not $published.ok -or -not $published.verifiedAt) { throw 'No successful deployment readback is recorded.' }
$collectionPath = Join-Path $project '.runtime\last-collection.json'
if (-not (Test-Path -LiteralPath $collectionPath)) { throw 'A real local collection is required before scheduling.' }
$collection = Get-Content -LiteralPath $collectionPath -Raw | ConvertFrom-Json
if (-not $collection.ok -or $collection.runId -ne $published.runId -or $collection.checkedSources -lt 3) { throw 'The latest verified Pages deployment does not match a sufficiently checked local collection.' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$zone = [TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
$chinaNow = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$zone)
$next = [DateTimeOffset]::new($chinaNow.Year,$chinaNow.Month,$chinaNow.Day,10,0,0,[TimeSpan]::FromHours(8))
if ($next -le $chinaNow) { $next = $next.AddDays(1) }
$boundary = $next.ToString('yyyy-MM-ddTHH:mm:sszzz')
$powershellExe = Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $powershellExe)) { $powershellExe = Join-Path $PSHOME 'powershell.exe' }
$runner = Join-Path $project 'scripts\Run-Daily.ps1'
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$runner`" -NodeExe `"$NodeExe`" -ProjectRoot `"$project`""
function Escape-Xml([string]$Value) { [Security.SecurityElement]::Escape($Value) }
$commandXml = Escape-Xml $powershellExe
$argumentsXml = Escape-Xml $arguments
$workingXml = Escape-Xml $project
$descriptionXml = Escape-Xml '汽车座椅AI资讯：每天北京时间10:00由本机采集、核验、生成并推送GitHub Pages；登录补跑；失败重试。必须保持官方Codex和GitHub登录有效。'
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$descriptionXml</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger><StartBoundary>$boundary</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
    <LogonTrigger><Enabled>true</Enabled><UserId>$sid</UserId><Delay>PT2M</Delay></LogonTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>$sid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>true</Hidden><WakeToRun>true</WakeToRun><ExecutionTimeLimit>PT1H30M</ExecutionTimeLimit><Priority>7</Priority><RestartOnFailure><Interval>PT15M</Interval><Count>3</Count></RestartOnFailure></Settings>
  <Actions Context="Author"><Exec><Command>$commandXml</Command><Arguments>$argumentsXml</Arguments><WorkingDirectory>$workingXml</WorkingDirectory></Exec></Actions>
</Task>
"@
if (-not $PSCmdlet.ShouldProcess($TaskName,"Register 10:00 Asia/Shanghai daily task at $project")) { return }
Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -Xml $xml -Force | Out-Null
$readback = Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction Stop
$readbackXml = Export-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction Stop
if ($readback.State -eq 'Disabled' -or -not $readbackXml.Contains($boundary) -or -not $readbackXml.Contains((Escape-Xml $runner))) { throw 'Task registration readback did not match the requested schedule/action.' }
$record = @{registered=$true;taskName=$TaskName;taskPath='\';time='10:00';timezone='Asia/Shanghai';startBoundary=$boundary;projectRoot=$project;registeredAt=[DateTimeOffset]::UtcNow.ToString('o');logonType='InteractiveToken';note='用户需保持Windows登录；锁屏可运行，关机不能准点执行，登录后补跑。睡眠唤醒受硬件与系统策略限制。'}
New-Item -ItemType Directory -Path (Join-Path $project '.runtime') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $project '.runtime\task-registration.json'),($record | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$record | ConvertTo-Json -Depth 8
