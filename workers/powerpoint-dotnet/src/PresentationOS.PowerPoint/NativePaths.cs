namespace PresentationOS.PowerPoint;

/// <summary>Validate file boundaries before activating Office.</summary>
public static class NativePaths
{
    public static string InputFile(string path, string extension)
    {
        var full = Canonical(path, extension);
        RejectLinks(full);
        if (!File.Exists(full)) throw new FileNotFoundException("Input file does not exist", full);
        return full;
    }

    public static string NewOutput(string path, string extension)
    {
        var full = Canonical(path, extension);
        RejectLinks(full);
        if (File.Exists(full) || Directory.Exists(full)) throw new IOException("Output already exists: " + full);
        if (!Directory.Exists(Path.GetDirectoryName(full))) throw new DirectoryNotFoundException("Output parent directory does not exist");
        return full;
    }

    public static (string Pptx, string Pdf) ExportPaths(string pptx, string pdf)
    {
        // Protect input aliases before extension validation, too.
        var source = Path.GetFullPath(pptx);
        var target = Path.GetFullPath(pdf);
        if (string.Equals(source, target, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
            throw new ArgumentException("Input and output paths must differ");
        return (InputFile(source, ".pptx"), NewOutput(target, ".pdf"));
    }

    public static string ProbeDirectory(string path, string requestPath)
    {
        var full = Path.GetFullPath(path);
        RejectLinks(full);
        if (!Directory.Exists(full)) throw new DirectoryNotFoundException("Native evidence directory does not exist");
        var request = InputFile(requestPath, ".json");
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (!string.Equals(Path.GetDirectoryName(request), full.TrimEnd(Path.DirectorySeparatorChar), comparison) ||
            Path.GetFileName(request) != "request.json")
            throw new ArgumentException("Native request must be request.json inside its evidence directory");
        if (Directory.EnumerateFileSystemEntries(full).Any(entry => !string.Equals(Path.GetFullPath(entry), request, comparison)))
            throw new IOException("Native evidence directory must contain only its new request.json");
        return full;
    }

    public static void RejectLinks(string path)
    {
        for (string? current = Path.GetFullPath(path); !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
        {
            var info = new FileInfo(current);
            if (info.LinkTarget is not null || (info.Exists && (info.Attributes & FileAttributes.ReparsePoint) != 0))
                throw new IOException("Linked paths are not allowed for native verification: " + current);
            var directory = new DirectoryInfo(current);
            if (directory.LinkTarget is not null || (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0))
                throw new IOException("Linked directories are not allowed for native verification: " + current);
        }
    }

    private static string Canonical(string path, string extension)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("A file path is required");
        var full = Path.GetFullPath(path);
        if (!string.Equals(Path.GetExtension(full), extension, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Expected file extension " + extension);
        if (OperatingSystem.IsWindows() && full[Path.GetPathRoot(full)!.Length..].Contains(':'))
            throw new ArgumentException("Alternate data streams are not supported");
        return full;
    }
}
