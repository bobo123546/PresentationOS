using System.Buffers.Binary;
using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace PresentationOS.PowerPoint;

public sealed record FontFamilyName(string Name, int FaceIndex, int NameId, int PlatformId, int EncodingId, int LanguageId);
public sealed record RegisteredFontFile(string Path, string Registration);
public sealed record InstalledFontMatch(string RequestedName, string FamilyName, string FilePath, string FileSha256,
    int FaceIndex, int NameId, int PlatformId, int EncodingId, int LanguageId, string Registration);
public sealed record InstalledFontReport(IReadOnlyList<string> Requested, IReadOnlyList<string> Missing,
    IReadOnlyList<InstalledFontMatch> Matches, IReadOnlyList<string> Diagnostics)
{
    public bool Passed => Requested.Count > 0 && Missing.Count == 0;
}

/// <summary>
/// Resolve exact installed family names from the actual registered SFNT/TTC name
/// tables. Localized aliases are evidence, not a hard-coded translation list.
/// https://learn.microsoft.com/en-us/typography/opentype/spec/name
/// https://learn.microsoft.com/en-us/typography/opentype/spec/otff
/// </summary>
public static class InstalledFontCatalog
{
    private static readonly UnicodeEncoding Utf16Be = new(bigEndian: true, byteOrderMark: false, throwOnInvalidBytes: true);
    private const long MaximumFontBytes = 512L * 1024 * 1024;

    [SupportedOSPlatform("windows")]
    public static InstalledFontReport CaptureWindows(IEnumerable<string> requested)
    {
        var files = new List<RegisteredFontFile>();
        var diagnostics = new List<string>();
        var machineFonts = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Fonts");
        var userFonts = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Windows", "Fonts");
        foreach (var (hive, label) in new[] { (Registry.LocalMachine, "HKLM"), (Registry.CurrentUser, "HKCU") })
        {
            try
            {
                using var key = hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts");
                foreach (var entry in key?.GetValueNames() ?? Array.Empty<string>())
                {
                    if (key!.GetValue(entry) is not string value || string.IsNullOrWhiteSpace(value)) continue;
                    var location = Environment.ExpandEnvironmentVariables(value);
                    var candidates = Path.IsPathRooted(location) ? new[] { location } :
                        label == "HKCU" ? new[] { Path.Combine(userFonts, location), Path.Combine(machineFonts, location) } :
                        new[] { Path.Combine(machineFonts, location) };
                    var path = candidates.FirstOrDefault(File.Exists);
                    if (path is null) { diagnostics.Add($"Registered font file is missing: {label}/{entry}"); continue; }
                    files.Add(new RegisteredFontFile(Path.GetFullPath(path), $"{label}/SOFTWARE/Microsoft/Windows NT/CurrentVersion/Fonts/{entry}"));
                }
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException)
            {
                diagnostics.Add($"Cannot read {label} font registry: {error.Message}");
            }
        }
        var report = VerifyRegisteredFiles(requested, files);
        return report with { Diagnostics = diagnostics.Concat(report.Diagnostics).ToArray() };
    }

    /// <summary>Registry-derived paths only in production. Reads and hashes each matching file under one read-only lock.</summary>
    public static InstalledFontReport VerifyRegisteredFiles(IEnumerable<string> requested, IEnumerable<RegisteredFontFile> files)
    {
        var names = requested.Where(name => !string.IsNullOrWhiteSpace(name)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var wanted = names.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var matches = new List<InstalledFontMatch>();
        var diagnostics = new List<string>();
        foreach (var group in files.GroupBy(file => Path.GetFullPath(file.Path), OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal))
        {
            try
            {
                // Deny writes/replacement while the parsed aliases and their file hash are captured.
                using var stream = new FileStream(group.Key, FileMode.Open, FileAccess.Read, FileShare.Read);
                var aliases = ReadFamilyNames(stream).Where(alias => wanted.Contains(alias.Name)).ToArray();
                if (aliases.Length == 0) continue;
                stream.Position = 0;
                var digest = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
                foreach (var alias in aliases)
                {
                    var request = names.First(name => name.Equals(alias.Name, StringComparison.OrdinalIgnoreCase));
                    matches.Add(new InstalledFontMatch(request, alias.Name, group.Key, digest, alias.FaceIndex, alias.NameId,
                        alias.PlatformId, alias.EncodingId, alias.LanguageId, string.Join("; ", group.Select(item => item.Registration).Distinct())));
                }
            }
            catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException or ArgumentException or DecoderFallbackException or OverflowException)
            {
                diagnostics.Add($"Font file not accepted: {group.Key}: {error.Message}");
            }
        }
        var found = matches.Select(match => match.RequestedName).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return new InstalledFontReport(names, names.Where(name => !found.Contains(name)).ToArray(), matches, diagnostics);
    }

    /// <summary>Bounded SFNT/TTC family-name parser; Unicode name IDs 1 and 16 only.</summary>
    public static IReadOnlyList<FontFamilyName> ReadFamilyNames(Stream stream)
    {
        if (!stream.CanRead || !stream.CanSeek || stream.Length < 12 || stream.Length > MaximumFontBytes)
            throw new InvalidDataException("Unsupported font stream size or access mode");
        var header = Read(stream, 0, 12);
        var faces = new List<long>();
        if (Tag(header, 0) == "ttcf")
        {
            var version = U32(header, 4);
            if (version is not 0x00010000 and not 0x00020000) throw new InvalidDataException("Unsupported TTC version");
            var count = U32(header, 8);
            if (count < 1 || count > 4096) throw new InvalidDataException("Invalid TTC face count");
            var offsets = Read(stream, 12, checked((int)count * 4 + (version == 0x00020000 ? 12 : 0)));
            for (var index = 0; index < count; index++) faces.Add(U32(offsets, index * 4));
        }
        else faces.Add(0);
        var result = new List<FontFamilyName>();
        for (var face = 0; face < faces.Count; face++) ReadFace(stream, faces[face], face, result);
        return result.Distinct().ToArray();
    }

    private static void ReadFace(Stream stream, long offset, int face, List<FontFamilyName> output)
    {
        var header = Read(stream, offset, 12);
        var signature = U32(header, 0);
        if (signature is not 0x00010000 and not 0x4F54544F and not 0x74727565)
            throw new InvalidDataException("Unsupported SFNT signature");
        var count = U16(header, 4);
        if (count < 1 || count > 4096) throw new InvalidDataException("Invalid SFNT table count");
        var directory = Read(stream, offset + 12, count * 16);
        long? nameOffset = null;
        var nameLength = 0;
        var tags = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < count; index++)
        {
            var start = index * 16;
            var tag = Tag(directory, start);
            if (!tags.Add(tag)) throw new InvalidDataException("Duplicate SFNT table tag");
            var tableOffset = U32(directory, start + 8);
            var length = U32(directory, start + 12);
            RequireRange(stream.Length, tableOffset, length);
            if (tag != "name") continue;
            if (length < 6 || length > 4 * 1024 * 1024) throw new InvalidDataException("Invalid name table length");
            nameOffset = tableOffset; nameLength = checked((int)length);
        }
        if (!nameOffset.HasValue) throw new InvalidDataException("Font has no name table");
        var table = Read(stream, nameOffset.Value, nameLength);
        var format = U16(table, 0); var records = U16(table, 2); var storage = U16(table, 4);
        if (format > 1) throw new InvalidDataException("Unsupported name table format");
        var recordEnd = checked(6 + records * 12);
        RequireRange(table.Length, 6, records * 12L);
        var languageCount = 0;
        if (format == 1)
        {
            RequireRange(table.Length, recordEnd, 2);
            languageCount = U16(table, recordEnd);
            RequireRange(table.Length, recordEnd + 2, languageCount * 4L);
            for (var index = 0; index < languageCount; index++)
            {
                var start = recordEnd + 2 + index * 4;
                RequireRange(table.Length, storage + (long)U16(table, start + 2), U16(table, start));
            }
            recordEnd += 2 + languageCount * 4;
        }
        if (storage < recordEnd || storage > table.Length) throw new InvalidDataException("Name strings overlap record directory");
        for (var index = 0; index < records; index++)
        {
            var start = 6 + index * 12;
            var platform = U16(table, start); var encoding = U16(table, start + 2); var language = U16(table, start + 4);
            var id = U16(table, start + 6); var length = U16(table, start + 8); var stringOffset = storage + (long)U16(table, start + 10);
            RequireRange(table.Length, stringOffset, length);
            if (language >= 0x8000 && (format != 1 || language - 0x8000 >= languageCount)) throw new InvalidDataException("Invalid name language-tag reference");
            // Legacy code-page/Macintosh names are not guessed as Unicode.
            if (id is not 1 and not 16 || !(platform == 0 || platform == 3 && encoding is 0 or 1 or 10)) continue;
            if (length % 2 != 0) throw new InvalidDataException("Odd UTF-16 name length");
            var name = Utf16Be.GetString(table, checked((int)stringOffset), length);
            if (name.Length == 0 || name.Any(char.IsControl)) throw new InvalidDataException("Invalid family-name characters");
            output.Add(new FontFamilyName(name, face, id, platform, encoding, language));
        }
    }

    private static byte[] Read(Stream stream, long offset, int count)
    {
        RequireRange(stream.Length, offset, count); var bytes = new byte[count];
        stream.Position = offset; stream.ReadExactly(bytes); return bytes;
    }
    private static void RequireRange(long length, long offset, long count)
    {
        if (offset < 0 || count < 0 || offset > length || count > length - offset) throw new InvalidDataException("Font offset/length exceeds file or table boundary");
    }
    private static ushort U16(byte[] bytes, int offset) => BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(offset, 2));
    private static uint U32(byte[] bytes, int offset) => BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
    private static string Tag(byte[] bytes, int offset) => Encoding.ASCII.GetString(bytes, offset, 4);
}
