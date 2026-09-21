# Batch QA all bisect pptx files; output ok/error per file
param([string]$Dir)
$files = Get-ChildItem $Dir -Filter "bisect-*.pptx" | Sort-Object Name
$pp = New-Object -ComObject PowerPoint.Application
foreach ($f in $files) {
  $r = @{ name = $f.Name; ok = $false }
  try {
    $pres = $pp.Presentations.Open($f.FullName, $true, $false, $false)
    $r.slideCount = $pres.Slides.Count
    $pres.Close()
    $r.ok = $true
  } catch { $r.error = $_.Exception.Message }
  Write-Output ($r | ConvertTo-Json -Compress)
}
$pp.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($pp) | Out-Null
