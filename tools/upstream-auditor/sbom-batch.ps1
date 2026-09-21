$ErrorActionPreference = "Continue"
$src = "H:\ppt"
$out = "D:\PresentationOS\upstream\audits"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$dirs = Get-ChildItem $src -Directory | Sort-Object Name
$done = 0; $fail = 0
foreach ($d in $dirs) {
  $sbomPath = Join-Path $out ($d.Name + "-sbom.json")
  $grypePath = Join-Path $out ($d.Name + "-grype.json")
  if (Test-Path $sbomPath) { $done++; continue }
  try {
    & syft "dir:$($d.FullName)" -o syft-json -q 2>"$out\$($d.Name)-sbom.err" | Out-File -FilePath $sbomPath -Encoding utf8
    if ($LASTEXITCODE -eq 0) { $done++ } else { $fail++; Write-Output ("[fail-syft] " + $d.Name) }
  } catch { $fail++; Write-Output ("[err-syft] " + $d.Name + " : " + $_.Exception.Message) }
  if (Test-Path $sbomPath) {
    try {
      & grype "dir:$($d.FullName)" -o json -q 2>"$out\$($d.Name)-grype.err" | Out-File -FilePath $grypePath -Encoding utf8
      if ($LASTEXITCODE -ne 0) { Write-Output ("[fail-grype] " + $d.Name) }
    } catch { Write-Output ("[err-grype] " + $d.Name) }
  }
  Write-Output ("[progress] " + $done + "/" + $dirs.Count + " " + $d.Name)
}
Write-Output ("===SBOM DONE: ok=" + $done + " fail=" + $fail + "/" + $dirs.Count)
