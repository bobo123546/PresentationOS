using System;
using System.IO;
using System.Runtime.Versioning;
using System.Runtime.InteropServices;
using System.Diagnostics;

namespace PresentationOS.PowerPoint;

/// <summary>
/// PowerPoint Native QA（总方案 PHASE 10）：真实 Microsoft PowerPoint COM 操作。
/// 使用 dynamic + ProgID 避免引用互操作程序集；任何一步失败都会抛出带明确信息的异常。
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class PowerPointNative
{
    public sealed record QaResult(string PptxPath, string PdfPath, int SlideCount, long PdfSize);

    private readonly object _application;

    public PowerPointNative()
    {
        if (Process.GetProcessesByName("POWERPNT").Length > 0)
            throw new InvalidOperationException("Existing PowerPoint sessions are preserved; close them before native verification.");
        var type = Type.GetTypeFromProgID("PowerPoint.Application")
            ?? throw new InvalidOperationException("PowerPoint.Application COM type not registered. Microsoft PowerPoint is required.");
        _application = Activator.CreateInstance(type)
            ?? throw new InvalidOperationException("Failed to create PowerPoint.Application instance.");
    }

    public QaResult OpenAndExportPdf(string pptxPath, string pdfPath)
    {
        if (!File.Exists(pptxPath)) throw new FileNotFoundException("PPTX not found", pptxPath);
        dynamic app = _application;
        dynamic? presentation = null;
        dynamic? presentations = null;
        dynamic? slides = null;
        try
        {
            // Open(FileName, ReadOnly, Untitled, WithWindow)
            presentations = app.Presentations;
            presentation = presentations.Open(pptxPath, /*ReadOnly*/ true, /*Untitled*/ false, /*WithWindow*/ false);
            slides = presentation.Slides;
            int slideCount = slides.Count;
            // 32 = ppSaveAsPDF
            presentation.SaveAs(pdfPath, 32);
            presentation.Close();
            Marshal.FinalReleaseComObject(presentation);
            presentation = null;
            long pdfSize = File.Exists(pdfPath) ? new FileInfo(pdfPath).Length : 0;
            return new QaResult(pptxPath, pdfPath, slideCount, pdfSize);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"PowerPoint could not process {pptxPath}: {ex.Message}", ex);
        }
        finally
        {
            if (slides != null) Marshal.FinalReleaseComObject(slides);
            if (presentation != null) { try { presentation.Close(); } finally { Marshal.FinalReleaseComObject(presentation); } }
            if (presentations != null) Marshal.FinalReleaseComObject(presentations);
        }
    }

    public void Quit()
    {
        try
        {
            dynamic app = _application;
            app.Quit();
        }
        finally { if (Marshal.IsComObject(_application)) Marshal.FinalReleaseComObject(_application); }
    }

    public static void Release(QaResult _) { }
}
