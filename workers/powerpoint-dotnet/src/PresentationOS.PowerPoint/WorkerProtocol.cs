namespace PresentationOS.PowerPoint;

// Worker Protocol (pres-worker/1) 的 C# 侧类型与纯逻辑校验。
// 真实 PowerPoint COM 操作在后续 PHASE 10 实现；本类只做协议层纯逻辑，可单元测试。
public sealed record JobRequest(
    string Protocol,
    string JobId,
    string Capability,
    string? InputJson,
    IReadOnlyList<string> ArtifactRefs,
    int TimeoutMs)
{
    public const string SupportedProtocol = "pres-worker/1";

    public static JobRequest? Parse(string json)
    {
        // 最小 JSON 解析：仅支持协议字段（正式实现会用 System.Text.Json 或生成 Schema 校验）
        using var doc = ParseDocument(json);
        if (doc == null) return null;
        var root = doc.RootElement;
        if (root.ValueKind != System.Text.Json.JsonValueKind.Object) return null;
        if (!root.TryGetProperty("protocol", out var proto)) return null;
        if (!root.TryGetProperty("jobId", out var jobId)) return null;
        if (!root.TryGetProperty("capability", out var cap)) return null;
        if (!root.TryGetProperty("timeoutMs", out var tmo)) return null;
        var refs = new List<string>();
        if (root.TryGetProperty("artifactRefs", out var art) && art.ValueKind == System.Text.Json.JsonValueKind.Array)
        {
            foreach (var r in art.EnumerateArray()) refs.Add(r.GetString() ?? string.Empty);
        }
        return new JobRequest(
            proto.GetString() ?? string.Empty,
            jobId.GetString() ?? string.Empty,
            cap.GetString() ?? string.Empty,
            root.TryGetProperty("input", out var inp) ? inp.GetRawText() : null,
            refs,
            tmo.GetInt32());
    }

    private static System.Text.Json.JsonDocument? ParseDocument(string json)
    {
        try
        {
            return System.Text.Json.JsonDocument.Parse(json);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    public bool IsValid() =>
        Protocol == SupportedProtocol &&
        !string.IsNullOrWhiteSpace(JobId) &&
        !string.IsNullOrWhiteSpace(Capability) &&
        TimeoutMs > 0;
}

public sealed record JobResponse(
    string Status,
    string? OutputJson,
    IReadOnlyList<string> Artifacts,
    IReadOnlyList<string> Warnings,
    string? ErrorType,
    string? ErrorMessage,
    long DurationMs)
{
    public static JobResponse Success(string? outputJson, IReadOnlyList<string>? artifacts = null, long durationMs = 0) =>
        new("success", outputJson, artifacts ?? Array.Empty<string>(), Array.Empty<string>(), null, null, durationMs);

    public static JobResponse Failure(string errorType, string errorMessage, long durationMs = 0) =>
        new("failure", null, Array.Empty<string>(), Array.Empty<string>(), errorType, errorMessage, durationMs);
}
