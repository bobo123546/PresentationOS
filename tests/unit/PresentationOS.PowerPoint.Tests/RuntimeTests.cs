using System.Text.Json;
using Xunit;

namespace PresentationOS.PowerPoint.Tests;

public class RuntimeTests
{
    [Fact]
    public void ActualWorkerLoop_RejectsUnknownCapabilityAndMalformedInput()
    {
        using var input = new StringReader("{\"type\":\"job_request\",\"jobId\":\"j1\",\"capabilityId\":\"missing\"}\nnot-json\n");
        using var output = new StringWriter();
        Assert.Equal(0, Program.Run(input, output));
        var lines = output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries);
        using var handshake = JsonDocument.Parse(lines[0]);
        Assert.Equal("handshake", handshake.RootElement.GetProperty("type").GetString());
        using var unknown = JsonDocument.Parse(lines[1]);
        Assert.Equal("j1", unknown.RootElement.GetProperty("jobId").GetString());
        Assert.Equal("CAPABILITY_NOT_FOUND", unknown.RootElement.GetProperty("errorType").GetString());
        using var invalid = JsonDocument.Parse(lines[2]);
        Assert.Equal("BAD_REQUEST", invalid.RootElement.GetProperty("errorType").GetString());
    }

    [Fact]
    public void ActualWorkerLoop_RejectsIncompleteNativeJobWithoutStartingOffice()
    {
        using var input = new StringReader("{\"type\":\"job_request\",\"jobId\":\"j2\",\"capabilityId\":\"powerpoint.qa\",\"input\":{}}\n");
        using var output = new StringWriter();
        Program.Run(input, output);
        using var response = JsonDocument.Parse(output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries)[1]);
        Assert.False(response.RootElement.GetProperty("ok").GetBoolean());
    }
}
