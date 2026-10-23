using System.Text.Json;
using Xunit;

namespace PresentationOS.PowerPoint.Tests;

public sealed class NativeBoundaryTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "presentationos-native-boundary-" + Guid.NewGuid().ToString("N"));

    public NativeBoundaryTests() => Directory.CreateDirectory(_directory);
    public void Dispose() => Directory.Delete(_directory, recursive: true);

    [Theory]
    [InlineData("missing.pptx", "new.pdf", "Input file does not exist")]
    [InlineData("source.pptx", "source.pptx", "Input and output paths must differ")]
    [InlineData("source.pptx", "existing.pdf", "Output already exists")]
    [InlineData("source.pptx", "new.txt", "Expected file extension .pdf")]
    public void WorkerRejectsBadPathsBeforeActivatingOffice(string sourceName, string outputName, string message)
    {
        var source = Path.Combine(_directory, "source.pptx");
        var existing = Path.Combine(_directory, "existing.pdf");
        File.WriteAllText(source, "source sentinel");
        File.WriteAllText(existing, "user PDF sentinel");
        var job = JsonSerializer.Serialize(new { type = "job_request", jobId = "boundary", capabilityId = "powerpoint.qa", input = new { pptxPath = Path.Combine(_directory, sourceName), pdfPath = Path.Combine(_directory, outputName) } });
        using var input = new StringReader(job + "\n");
        using var output = new StringWriter();
        Program.Run(input, output);
        using var response = JsonDocument.Parse(output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries)[1]);
        Assert.False(response.RootElement.GetProperty("ok").GetBoolean());
        Assert.Contains(message, response.RootElement.GetProperty("errorMessage").GetString());
        Assert.Equal("source sentinel", File.ReadAllText(source));
        Assert.Equal("user PDF sentinel", File.ReadAllText(existing));
    }

    [Fact]
    public void ProbeDirectoryRejectsReusedEvidence()
    {
        var request = Path.Combine(_directory, "request.json");
        File.WriteAllText(request, "{}");
        Assert.Equal(_directory, NativePaths.ProbeDirectory(_directory, request));
        File.WriteAllText(Path.Combine(_directory, "native.pdf"), "previous evidence");
        Assert.Throws<IOException>(() => NativePaths.ProbeDirectory(_directory, request));
    }

    [Fact]
    public void SemanticReadbackKeepsPageShapeAndWhitespaceBoundaries()
    {
        static NativeTextSnapshot Snapshot(params NativeTextShape[] shapes) => new(2, shapes, Array.Empty<string>());
        var source = Snapshot(new(1, 1, "ab"), new(2, 1, "c"));
        Assert.False(source.Matches(Snapshot(new(1, 1, "a"), new(2, 1, "bc"))));
        Assert.False(source.Matches(Snapshot(new(1, 1, "ab"), new(1, 2, "c"))));
        Assert.False(source.Matches(Snapshot(new(1, 1, "a b"), new(2, 1, "c"))));
        Assert.False(source.Matches(Snapshot(new(1, 1, "ab\t"), new(2, 1, "c"))));
        Assert.False(source.Matches(new(3, source.Shapes, source.Fonts)));
        Assert.True(Snapshot(new NativeTextShape(1, 1, "a\r\nb\rc")).Matches(Snapshot(new NativeTextShape(1, 1, "a\nb\nc"))));
    }
}
