# PowerPoint Native QA（总方案 PHASE 12/QA）：COM 打开 PPTX → 导出 PDF → 统计页数
# 用法：powershell -ExecutionPolicy Bypass -File qa-powerpoint.ps1 -Pptx 文件路径 -OutDir 输出目录
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir
)

$ErrorActionPreference = "Stop"
$result = @{ pptx = $Pptx; ok = $false }
$pp = $null
try {
  if (-not (Test-Path $Pptx)) { $result.error = "PPTX_NOT_FOUND"; throw "PPTX not found: $Pptx" }
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $pdf = Join-Path $OutDir ((Get-Item $Pptx).BaseName + ".pdf")
  $pp = New-Object -ComObject PowerPoint.Application
  $pres = $pp.Presentations.Open($Pptx, $true, $false, $false)  # ReadOnly, Untitled, WithWindow=false
  $slideCount = $pres.Slides.Count
  $result.slideCount = $slideCount
  $pres.SaveAs($pdf, 32)  # 32 = ppSaveAsPDF
  $pres.Close()
  if (-not (Test-Path $pdf)) { throw "PDF not produced" }
  $pdfSize = (Get-Item $pdf).Length
  $result.pdf = $pdf
  $result.pdfSize = $pdfSize
  $result.ok = ($slideCount -gt 0) -and ($pdfSize -gt 0)
} catch {
  $result.error = $_.Exception.Message
  $result.ok = $false
} finally {
  if ($pp) { try { $pp.Quit() } catch {} }
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pp) | Out-Null
}
$json = $result | ConvertTo-Json -Depth 4
$result
Write-Output $json
