using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;

namespace PresentationOS.PowerPoint;

[SupportedOSPlatform("windows")]
public static class NativeProbe
{
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, IntPtr extra);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder name, int length);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    private delegate bool EnumWindow(IntPtr window, IntPtr extra);
    private static void Release(object? value) { if (value is not null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value); }

    public static int Run(string requestPath)
    {
        string directory, source;
        int expected;
        try
        {
            var requestFile = NativePaths.InputFile(requestPath, ".json");
            using var request = JsonDocument.Parse(File.ReadAllText(requestFile));
            var root = request.RootElement;
            directory = NativePaths.ProbeDirectory(root.GetProperty("directory").GetString()!, requestFile);
            source = NativePaths.InputFile(root.GetProperty("pptx").GetString()!, ".pptx");
            expected = root.GetProperty("expected_slides").GetInt32();
            if (expected < 1) throw new ArgumentException("expected_slides must be positive");
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Native request rejected before Office activation: " + error.Message);
            return 1;
        }
        var stages = new List<object>();
        var dialogs = new HashSet<long>();
        int? ownedPid = null;
        var result = new Dictionary<string, object?> {
            ["open"] = false, ["save_reopen"] = false, ["pdf"] = false,
            ["semantic"] = false, ["editability"] = false, ["fonts"] = false,
            ["stages"] = stages, ["dialogs"] = dialogs, ["operation_success"] = false
        };
        void Stage(string name)
        {
            if (ownedPid.HasValue)
            {
                EnumWindows((window, _) => {
                    GetWindowThreadProcessId(window, out var pid);
                    if (pid == ownedPid && IsWindowVisible(window)) {
                        var text = new StringBuilder(256); GetClassName(window, text, text.Capacity);
                        if (text.ToString() == "#32770") dialogs.Add(window.ToInt64());
                    }
                    return true;
                }, IntPtr.Zero);
                result["dialog_polls"] = Convert.ToInt32(result.GetValueOrDefault("dialog_polls", 0)) + 1;
            }
            stages.Add(new { stage = name, time = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0 });
            File.WriteAllText(Path.Combine(directory, "probe-progress.json"), JsonSerializer.Serialize(result));
        }
        dynamic? app = null, presentations = null, presentation = null;
        var before = Process.GetProcessesByName("POWERPNT").Select(p => p.Id).ToHashSet();
        result["office_available"] = before.Count > 0;
        try
        {
            if (before.Count > 0) throw new InvalidOperationException("Existing PowerPoint sessions are preserved; close them before native verification");
            Stage("create_application");
            var started = DateTime.UtcNow;
            var type = Type.GetTypeFromProgID("PowerPoint.Application") ?? throw new InvalidOperationException("PowerPoint is unavailable");
            result["office_available"] = true;
            app = Activator.CreateInstance(type) ?? throw new InvalidOperationException("COM activation failed");
            var candidates = Process.GetProcessesByName("POWERPNT").Where(p => !before.Contains(p.Id) && p.StartTime.ToUniversalTime() >= started.AddSeconds(-1)).ToArray();
            if (candidates.Length != 1) throw new InvalidOperationException("Cannot establish exclusive process ownership");
            ownedPid = candidates[0].Id;
            result["owned_pid"] = ownedPid;
            var created = new DateTimeOffset(candidates[0].StartTime.ToUniversalTime()).ToUnixTimeMilliseconds() / 1000.0;
            File.WriteAllText(Path.Combine(directory, "owned-process.json"), JsonSerializer.Serialize(new { pid = ownedPid, created }));
            app.DisplayAlerts = 2;
            result["office_version"] = Convert.ToString(app.Version);
            presentations = app.Presentations;
            Stage("open_original");
            presentation = presentations.Open(source, true, false, false);
            result["open"] = true;
            var original = ReadText((object)presentation);
            dynamic slides = presentation.Slides;
            int count = slides.Count; Release(slides);
            result["slide_count"] = count;
            var copy = Path.Combine(directory, "verified-copy.pptx");
            Stage("save_copy");
            presentation.SaveCopyAs(copy); presentation.Close(); Release(presentation); presentation = null;
            Stage("reopen_copy");
            presentation = presentations.Open(copy, false, false, false);
            var readback = ReadText((object)presentation);
            result["save_reopen"] = true;
            result["semantic"] = count == expected && original.Matches(readback);
            Stage("edit_save_reopen");
            var first = FirstText((object)presentation);
            dynamic firstShape = first.Shape;
            dynamic frame = firstShape.TextFrame;
            dynamic range = frame.TextRange;
            string previous = range.Text;
            const string marker = " [PRES_EDIT_CHECK]";
            range.Text = previous + marker;
            Release(range); Release(frame); Release(firstShape);
            presentation.Save(); presentation.Close(); Release(presentation); presentation = null;
            presentation = presentations.Open(copy, false, false, false);
            slides = presentation.Slides;
            dynamic slide = slides.Item(first.Slide);
            dynamic shapes = slide.Shapes;
            dynamic shape = shapes.Item(first.Index);
            Release(shapes); Release(slides);
            frame = shape.TextFrame; range = frame.TextRange;
            result["editability"] = (string)range.Text == previous + marker;
            range.Text = previous;
            Release(range); Release(frame); Release(shape); Release(slide);
            presentation.Save(); presentation.Close(); Release(presentation); presentation = null;
            presentation = presentations.Open(copy, true, false, false);
            var final = ReadText((object)presentation);
            result["semantic"] = (bool)result["semantic"]! && original.Matches(final);
            result["readback_text"] = final.Shapes.Select(shape => shape.Text).ToList();
            result["readback_shapes"] = final.Shapes;
            result["semantic_scope"] = "Slide count and ordered text-shape indices/text; only CRLF/CR newlines normalized";
            result["font_names"] = final.Fonts;
            result["font_scope"] = "Names read from all text shapes; substitution remains unverified";
            Stage("export_pdf");
            var pdf = Path.Combine(directory, "native.pdf"); presentation.SaveAs(pdf, 32);
            result["pdf"] = File.Exists(pdf) && new FileInfo(pdf).Length > 1000;
            Stage("export_all_png");
            var pngs = new List<string>();
            slides = presentation.Slides;
            for (int i = 1; i <= count; i++) {
                slide = slides.Item(i); var png = Path.Combine(directory, $"slide-{i}.png");
                slide.Export(png, "PNG", 1920, 1080); Release(slide);
                if (!File.Exists(png) || new FileInfo(png).Length < 100) throw new IOException($"Missing PNG {i}");
                pngs.Add(png);
            }
            Release(slides); result["pngs"] = pngs;
            Stage("close"); presentation.Close(); Release(presentation); presentation = null;
            Release(presentations); presentations = null;
            Stage("quit"); app.Quit(); Release(app); app = null;
            result["operation_success"] = new[] {"open","save_reopen","pdf","semantic","editability"}.All(key => (bool)result[key]!) && dialogs.Count == 0;
        }
        catch (Exception error) { result["error"] = error.ToString(); result["operation_success"] = false; }
        finally
        {
            if (presentation is not null) { try { presentation.Close(); } catch (Exception error) { result["close_error"] = error.Message; } Release(presentation); }
            Release(presentations);
            if (app is not null) {
                if (ownedPid.HasValue) { try { app.Quit(); } catch (Exception error) { result["quit_error"] = error.Message; } }
                Release(app);
            }
            GC.Collect(); GC.WaitForPendingFinalizers();
            Stage("finished");
            File.WriteAllText(Path.Combine(directory, "probe-result.json"), JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
        }
        return (bool)result["operation_success"]! ? 0 : 1;
    }

    private static NativeTextSnapshot ReadText(dynamic presentation)
    {
        var text = new List<NativeTextShape>(); var fonts = new HashSet<string>();
        dynamic slides = presentation.Slides;
        int count = slides.Count;
        try { for (int i = 1; i <= count; i++) {
            dynamic slide = slides.Item(i); dynamic shapes = slide.Shapes;
            try { for (int j = 1; j <= shapes.Count; j++) {
                dynamic shape = shapes.Item(j);
                try { if (shape.HasTextFrame != 0) {
                    dynamic frame = shape.TextFrame;
                    try { if (frame.HasText != 0) {
                        dynamic? range = null, font = null;
                        try { range = frame.TextRange; font = range.Font; text.Add(new NativeTextShape(i, j, (string)range.Text)); fonts.Add((string)font.Name); }
                        finally { Release(font); Release(range); }
                    } }
                    finally { Release(frame); }
                } } finally { Release(shape); }
            } } finally { Release(shapes); Release(slide); }
        } } finally { Release(slides); }
        return new NativeTextSnapshot(count, text, fonts.Order().ToList());
    }
    private static (int Slide, int Index, object Shape) FirstText(dynamic presentation)
    {
        dynamic slides = presentation.Slides;
        try { for (int i = 1; i <= slides.Count; i++) {
            dynamic slide = slides.Item(i); dynamic shapes = slide.Shapes;
            try { for (int j = 1; j <= shapes.Count; j++) {
                dynamic shape = shapes.Item(j);
                if (shape.HasTextFrame != 0) {
                    dynamic frame = shape.TextFrame; bool hasText = frame.HasText != 0; Release(frame);
                    if (hasText) return (i, j, (object)shape);
                }
                Release(shape);
            } } finally { Release(shapes); Release(slide); }
        } } finally { Release(slides); }
        throw new InvalidOperationException("No editable text shape found");
    }
}
