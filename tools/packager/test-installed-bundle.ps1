param([Parameter(Mandatory=$true)][string]$Bundle, [Parameter(Mandatory=$true)][string]$EvidenceRoot)
$ErrorActionPreference = 'Stop'
$bundleRoot = (Resolve-Path -LiteralPath $Bundle).Path
$evidence = [IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\')
if (Test-Path -LiteralPath $evidence) { throw 'Evidence already exists; choose a new directory.' }
New-Item -ItemType Directory -Path $evidence | Out-Null
$app = Join-Path $evidence 'installed-app'
$data = Join-Path $evidence 'user-data'
if (!$app.StartsWith($evidence + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Installation test target escaped its evidence root.' }
New-Item -ItemType Directory -Path $data | Out-Null
$sentinel = Join-Path $data 'sentinel.txt'
'preserve-user-data-through-local-install-20261023' | Set-Content -LiteralPath $sentinel -Encoding UTF8
$sentinelHash = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
$commands = [Collections.Generic.List[Object]]::new()
$oldData = $env:PRES_DATA_DIR; $oldReport = $env:PRES_BOOT_REPORT; $oldPath = $env:PATH
function Install-Version([string]$name) {
  $command = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $bundleRoot 'Install.ps1'),'-SourceBundle',$bundleRoot,'-InstallRoot',$app,'-DataRoot',$data)
  & powershell.exe @command 2>&1 | Out-File -LiteralPath (Join-Path $evidence ($name + '.log')) -Encoding UTF8
  $code = $LASTEXITCODE
  $commands.Add(@{ executable='powershell.exe'; arguments=$command; exitCode=$code })
  if ($code -ne 0) { throw "Install failed ($name): $code" }
  $settings = Get-Content -LiteralPath (Join-Path $app 'installation.json') -Raw | ConvertFrom-Json
  $settings | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence ($name + '.json')) -Encoding UTF8
  return $settings
}
function Test-Boot($settings, [string]$name) {
  $env:PRES_DATA_DIR = $data; $env:PRES_BOOT_REPORT = Join-Path $evidence ($name + '.json')
  $env:PATH = Join-Path $env:SystemRoot 'System32'
  $exe = Join-Path $settings.activeBundle 'PresentationOS.exe'
  $process = Start-Process -FilePath $exe -ArgumentList '--test-boot' -WindowStyle Hidden -Wait -PassThru
  $commands.Add(@{ executable=$exe; arguments=@('--test-boot'); exitCode=$process.ExitCode; PATH=$env:PATH })
  if ($process.ExitCode -ne 0) { throw "Installed boot failed ($name): $($process.ExitCode)" }
  $boot = Get-Content -LiteralPath $env:PRES_BOOT_REPORT -Raw | ConvertFrom-Json
  if (!$boot.bootstrapPassed -or $boot.dataRoot -ne $data) { throw 'Bootstrap reported the wrong data root or failure.' }
  if (Get-Process -Id $boot.ownedSidecarPid -ErrorAction SilentlyContinue) { throw 'Owned bootstrap sidecar remained running.' }
  $env:PATH = $oldPath
}
$result = @{ status='FAIL'; scope='Local per-user install/reinstall/bootstrap/uninstall/data retention'; cleanMachine='NOT_VERIFIED'; crossVersionUpgrade='NOT_VERIFIED (same version reinstall only)'; commands=$commands }
try {
  $first = Install-Version 'install-first'; Test-Boot $first 'boot-first'
  $second = Install-Version 'install-second'; Test-Boot $second 'boot-second'
  if ($first.activeBundle -eq $second.activeBundle -or !(Test-Path -LiteralPath $first.activeBundle)) { throw 'Version directory switch/old version retention failed.' }
  $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $bundleRoot 'Uninstall.ps1'),'-InstallRoot',$app)
  & powershell.exe @arguments 2>&1 | Out-File -LiteralPath (Join-Path $evidence 'uninstall.log') -Encoding UTF8
  $commands.Add(@{ executable='powershell.exe'; arguments=$arguments; exitCode=$LASTEXITCODE })
  if ($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $app)) { throw 'Uninstall failed or application directory remains.' }
  if ((Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash -ne $sentinelHash) { throw 'User data sentinel was changed or removed.' }
  $result.status='PASS_SCOPED'; $result.dataRetained=$true; $result.appRemoved=$true; $result.oldVersionRetainedBeforeUninstall=$true
  $result.firstBundle=$first.activeBundle; $result.secondBundle=$second.activeBundle; $result.sentinelSha256=$sentinelHash
} catch { $result.error=$_.Exception.Message; throw }
finally {
  $env:PRES_DATA_DIR=$oldData; $env:PRES_BOOT_REPORT=$oldReport; $env:PATH=$oldPath
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'result.json') -Encoding UTF8
}
$result | ConvertTo-Json -Depth 8
