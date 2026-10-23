param([Parameter(Mandatory = $true)][string]$RecordPath)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $RecordPath -PathType Leaf)) {
  @{ status = 'NO_OWNERSHIP_RECORD'; cleaned = $false } | ConvertTo-Json -Compress
  exit 0
}
$record = Get-Content -LiteralPath $RecordPath -Raw | ConvertFrom-Json
$ownedId = [int]$record.pid
$createdSeconds = [double]$record.created
if ($ownedId -lt 1 -or [double]::IsNaN($createdSeconds) -or [double]::IsInfinity($createdSeconds) -or $createdSeconds -lt 1) { throw 'Invalid process ownership record' }
$ownedProcess = Get-Process -Id $ownedId -ErrorAction SilentlyContinue
if ($null -eq $ownedProcess) {
  @{ status = 'ALREADY_EXITED'; cleaned = $true; pid = $ownedId } | ConvertTo-Json -Compress
  exit 0
}
$actualCreated = ([DateTimeOffset]$ownedProcess.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds() / 1000.0
if ($ownedProcess.ProcessName -ne 'POWERPNT' -or [IO.Path]::GetFileName($ownedProcess.Path) -ne 'POWERPNT.EXE' -or [Math]::Abs($actualCreated - $createdSeconds) -gt 0.002) {
  throw 'Process identity does not match the probe ownership record; preserved'
}
# Use the validated Process object, never a name-wide stop or taskkill tree.
$ownedProcess.Kill()
$exited = $ownedProcess.WaitForExit(5000)
@{ status = $(if ($exited) { 'OWNED_PROCESS_STOPPED' } else { 'OWNED_PROCESS_STILL_RUNNING' }); cleaned = $exited; pid = $ownedId; expectedCreated = $createdSeconds; actualCreated = $actualCreated } | ConvertTo-Json -Compress
if (-not $exited) { exit 1 }
