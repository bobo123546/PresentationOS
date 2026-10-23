param([string]$SourceBundle = $PSScriptRoot, [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\PresentationOS'), [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'PresentationOS\data'))
$ErrorActionPreference = 'Stop'
$bundle = (Resolve-Path -LiteralPath $SourceBundle).Path
$target = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$data = [IO.Path]::GetFullPath($DataRoot).TrimEnd('\')
if ($target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\') -or $target -eq $bundle -or $target.StartsWith($bundle + '\', [StringComparison]::OrdinalIgnoreCase) -or $data -eq $target -or $data.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Install and data directories must be distinct, non-root locations outside the source bundle.' }
$manifestPath = Join-Path $bundle 'RELEASE_MANIFEST.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.name -ne 'PresentationOS' -or !$manifest.files -or $manifest.version -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$') { throw 'Invalid PresentationOS bundle manifest/version.' }
foreach ($entry in $manifest.files) {
  $file = [IO.Path]::GetFullPath((Join-Path $bundle $entry.path))
  if (!$file.StartsWith($bundle + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifest path escapes the bundle.' }
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Bundle checksum mismatch: $($entry.path)" }
}
$markerPath = Join-Path $target 'installation.json'
if ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Install directory must not be a filesystem link.' }
if ((Test-Path -LiteralPath $target) -and (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1) -and !(Test-Path -LiteralPath $markerPath)) { throw 'Refusing to overwrite a directory not installed by PresentationOS.' }
if (Test-Path -LiteralPath $markerPath) {
  $existing = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($existing.product -ne 'PresentationOS' -or $existing.dataRoot -ne $data) { throw 'Existing installation marker/data root mismatch.' }
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
$versionDirectory = Join-Path $target ('versions\' + $manifest.version + '-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $versionDirectory | Out-Null
foreach ($entry in $manifest.files) {
  $destination = Join-Path $versionDirectory $entry.path
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $bundle $entry.path) -Destination $destination
}
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $versionDirectory 'RELEASE_MANIFEST.json')
Copy-Item -LiteralPath (Join-Path $bundle 'SHA256SUMS.txt') -Destination (Join-Path $versionDirectory 'SHA256SUMS.txt')
New-Item -ItemType Directory -Path $data -Force | Out-Null
$record = @{ product = 'PresentationOS'; version = $manifest.version; activeBundle = $versionDirectory; dataRoot = $data; installedAt = [DateTime]::UtcNow.ToString('o') }
$temp = Join-Path $target 'installation.next.json'
$record | ConvertTo-Json | Set-Content -LiteralPath $temp -Encoding UTF8
Move-Item -LiteralPath $temp -Destination $markerPath -Force
$launcher = @'
$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'installation.json') -Raw | ConvertFrom-Json
$env:PRES_DATA_DIR = $settings.dataRoot
Start-Process -FilePath (Join-Path $settings.activeBundle 'PresentationOS.exe') -WorkingDirectory $settings.activeBundle
'@
$launcher | Set-Content -LiteralPath (Join-Path $target 'Launch-PresentationOS.ps1') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $bundle 'Uninstall.ps1') -Destination (Join-Path $target 'Uninstall.ps1') -Force
Write-Output "Installed $($manifest.version) at $versionDirectory. Data preserved at $data."
