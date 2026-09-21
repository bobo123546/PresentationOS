using PresentationOS.PowerPoint;
using Xunit;

namespace PresentationOS.PowerPoint.Tests;

public class WorkerProtocolTests
{
    [Fact]
    public void Parse_ValidRequest_ReturnsFields()
    {
        const string json = """
            {"protocol":"pres-worker/1","jobId":"job-001","capability":"pptx.render.native","input":{"x":1},"artifactRefs":["artifact://a"],"timeoutMs":120000}
            """;
        var req = JobRequest.Parse(json);
        Assert.NotNull(req);
        Assert.Equal("pres-worker/1", req!.Protocol);
        Assert.Equal("job-001", req.JobId);
        Assert.Equal("pptx.render.native", req.Capability);
        Assert.Single(req.ArtifactRefs);
        Assert.Equal(120000, req.TimeoutMs);
        Assert.True(req.IsValid());
    }

    [Fact]
    public void Parse_InvalidProtocol_IsNotValid()
    {
        const string json = """{"protocol":"pres-worker/9","jobId":"job-001","capability":"x","timeoutMs":1}""";
        var req = JobRequest.Parse(json);
        Assert.NotNull(req);
        Assert.False(req!.IsValid());
    }

    [Fact]
    public void Parse_InvalidJson_ReturnsNull()
    {
        Assert.Null(JobRequest.Parse("not-json{"));
    }

    [Fact]
    public void Response_Helpers_ProduceExpectedStatus()
    {
        var ok = JobResponse.Success("{}", new[] { "artifact://out" }, 42);
        Assert.Equal("success", ok.Status);
        Assert.Equal("{}", ok.OutputJson);
        Assert.Equal(42, ok.DurationMs);

        var fail = JobResponse.Failure("PPTX_FAILURE", "corrupt xml");
        Assert.Equal("failure", fail.Status);
        Assert.Equal("PPTX_FAILURE", fail.ErrorType);
    }
}
