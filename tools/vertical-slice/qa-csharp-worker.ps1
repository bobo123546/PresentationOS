$ErrorActionPreference = "Stop"
$env:DOTNET_ROOT = "C:\Users\29903\AppData\Local\Microsoft\dotnet"
$dotnet = "C:\Users\29903\AppData\Local\Microsoft\dotnet\dotnet.exe"
$exe = "D:\PresentationOS\workers\powerpoint-dotnet\src\PresentationOS.PowerPoint\bin\Release\net8.0\PresentationOS.PowerPoint.Worker.exe"
if (-not (Test-Path $exe)) { Write-Output "EXE_NOT_FOUND"; exit 1 }
$pptx = "D:\PresentationOSData\projects\vs-demo\deck.pptx"
$pdf = "D:\PresentationOSData\projects\vs-demo\qa\deck-csharp.pdf"
$job = @{
  type = "job_request"
  jobId = "csharp-it-1"
  traceId = "trc-csharp-it"
  capabilityId = "powerpoint.qa"
  input = @{ pptxPath = $pptx; pdfPath = $pdf }
} | ConvertTo-Json -Compress
$out = $job | & $exe
Write-Output "---worker output---"
Write-Output $out
$out | Out-File "D:\PresentationOSData\projects\vs-demo\qa\csharp-worker-out.txt" -Encoding utf8
Write-Output "PDF exists: $(Test-Path $pdf)"
if (Test-Path $pdf) { Write-Output "PDF size: $((Get-Item $pdf).Length)" }
