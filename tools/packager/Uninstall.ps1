param([string]$InstallRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
if ($target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\')) { throw 'Refusing to remove a volume root.' }
$marker = Join-Path $target 'installation.json'
if (!(Test-Path -LiteralPath $marker)) { throw 'Installation marker not found.' }
if ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Install directory must not be a filesystem link.' }
$settings = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
$data = [IO.Path]::GetFullPath($settings.dataRoot).TrimEnd('\')
if ($settings.product -ne 'PresentationOS' -or $data -eq $target -or $data.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe installation/data boundary.' }
$running = Get-Process -Name PresentationOS -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) }
if ($running) { throw 'Close this PresentationOS installation before uninstalling.' }
# Reparse points could redirect deletion outside the checked installation.
if (Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1) { throw 'Refusing to uninstall a directory containing links.' }
Remove-Item -LiteralPath $target -Recurse -Force
Write-Output "PresentationOS uninstalled. User data retained at $data."
