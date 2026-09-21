using System;
using System.IO;

namespace PresentationOS.PowerPoint;

/// <summary>
/// PowerPoint Native QA（总方案 PHASE 10）：真实 Microsoft PowerPoint COM 操作。
/// 使用 dynamic + ProgID 避免引用互操作程序集；任何一步失败都会抛出带明确信息的异常。
/// </summary>
public sealed class PowerPointNative
{
    public sealed record QaResult(string PptxPath, string PdfPath, int SlideCount, long PdfSize);

    private readonly object _application;

    public PowerPointNative()
    {
        var type = Type.GetTypeFromProgID("PowerPoint.Application")
            ?? throw new InvalidOperationException("PowerPoint.Application COM type not registered. Microsoft PowerPoint is required.");
        _application = Activator.CreateInstance(type)
            ?? throw new InvalidOperationException("Failed to create PowerPoint.Application instance.");
    }

    public QaResult OpenAndExportPdf(string pptxPath, string pdfPath)
    {
        if (!File.Exists(pptxPath)) throw new FileNotFoundException("PPTX not found", pptxPath);
        dynamic app = _application;
        dynamic presentation = null;
        try
        {
            // Open(FileName, ReadOnly, Untitled, WithWindow)
            presentation = app.Presentations.Open(pptxPath, /*ReadOnly*/ true, /*Untitled*/ false, /*WithWindow*/ false);
            int slideCount = presentation.Slides.Count;
            // 32 = ppSaveAsPDF
            presentation.SaveAs(pdfPath, 32);
            presentation.Close();
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
            try { if (presentation != null) presentation.Close(); } catch { /* ignore */ }
        }
    }

    public void Quit()
    {
        try
        {
            dynamic app = _application;
            app.Quit();
        }
        catch { /* ignore COM teardown errors */ }
    }

    public static void Release(QaResult _) { }
}
