using System;
using System.IO;
using System.Text.Json;
using System.Threading;

namespace PresentationOS.PowerPoint;

/// <summary>
/// PowerPoint Native Worker：stdio JSON Lines（pres-worker/1）。
/// 读入 JobRequest → 执行 capability（当前支持 powerpoint.qa）→ 输出 JobResponse。
/// 用法：PresentationOS.PowerPoint.Worker.exe
/// </summary>
public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--native-probe") {
            if (!OperatingSystem.IsWindows()) return 1;
            return NativeProbe.Run(args[1]);
        }
        return Run(Console.In, Console.Out);
    }

    public static int Run(TextReader reader, TextWriter writer)
    {
        var workerId = Environment.GetEnvironmentVariable("PRES_WORKER_ID") ?? $"pptx-worker-{Environment.ProcessId}";
        // handshake
        writer.WriteLine(JsonSerializer.Serialize(new
        {
            type = "handshake",
            workerId,
            capabilities = new[] { new { capabilityId = "powerpoint.qa", version = "0.1.0" } },
            protocolVersion = "0.1.0",
            runtime = "dotnet-" + Environment.Version,
            pid = Environment.ProcessId,
        }));

        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            // 兼容 PowerShell 管道等来源可能附加的 UTF-8 BOM
            if (line.Length > 0 && line[0] == '\uFEFF') line = line[1..];
            try
            {
                using var doc = JsonDocument.Parse(line);
                if (doc.RootElement.TryGetProperty("type", out var t) && t.GetString() == "job_request")
                {
                    HandleJob(writer, doc.RootElement);
                }
            }
            catch (Exception ex)
            {
                writer.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "job_response",
                    jobId = "unknown",
                    ok = false,
                    output = (string?)null,
                    errorType = "BAD_REQUEST",
                    errorMessage = ex.Message,
                    durationMs = 0L,
                    artifactRefs = Array.Empty<string>(),
                }));
            }
        }
        return 0;
    }

    private static void HandleJob(TextWriter writer, JsonElement root)
    {
        var started = Environment.TickCount64;
        var jobId = root.TryGetProperty("jobId", out var j) ? j.GetString() ?? "unknown" : "unknown";
        var capability = root.TryGetProperty("capabilityId", out var c) ? c.GetString() ?? string.Empty : string.Empty;
        try
        {
            switch (capability)
            {
                case "powerpoint.qa":
                {
                    var input = root.TryGetProperty("input", out var inp) ? inp : default;
                    var pptx = GetString(input, "pptxPath");
                    var pdf = GetString(input, "pdfPath");
                    if (string.IsNullOrWhiteSpace(pptx) || string.IsNullOrWhiteSpace(pdf))
                        throw new ArgumentException("input requires pptxPath and pdfPath");

                    var paths = NativePaths.ExportPaths(pptx, pdf);

                    if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("PowerPoint COM requires Windows");

                    var native = new PowerPointNative();
                    PowerPointNative.QaResult r;
                    try { r = native.OpenAndExportPdf(paths.Pptx, paths.Pdf); }
                    finally { native.Quit(); }
                    {
                        writer.WriteLine(JsonSerializer.Serialize(new
                        {
                            type = "job_response",
                            jobId,
                            ok = r.SlideCount > 0 && r.PdfSize > 0,
                            output = new { slideCount = r.SlideCount, pdfPath = r.PdfPath, pdfSize = r.PdfSize },
                            errorType = (string?)null,
                            errorMessage = (string?)null,
                            durationMs = Environment.TickCount64 - started,
                            artifactRefs = new[] { pdf },
                        }));
                    }

                    break;
                }
                default:
                    writer.WriteLine(JsonSerializer.Serialize(new
                    {
                        type = "job_response",
                        jobId,
                        ok = false,
                        output = (string?)null,
                        errorType = "CAPABILITY_NOT_FOUND",
                        errorMessage = $"no such capability: {capability}",
                        durationMs = Environment.TickCount64 - started,
                        artifactRefs = Array.Empty<string>(),
                    }));
                    break;
            }
        }
        catch (Exception ex)
        {
            writer.WriteLine(JsonSerializer.Serialize(new
            {
                type = "job_response",
                jobId,
                ok = false,
                output = (string?)null,
                errorType = "WORKER_EXCEPTION",
                errorMessage = ex.Message,
                durationMs = Environment.TickCount64 - started,
                artifactRefs = Array.Empty<string>(),
            }));
        }
    }

    private static string? GetString(JsonElement obj, string name)
    {
        return obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out var v)
            ? v.GetString()
            : null;
    }
}
