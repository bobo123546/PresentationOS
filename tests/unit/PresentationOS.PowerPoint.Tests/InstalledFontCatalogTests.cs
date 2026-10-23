using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace PresentationOS.PowerPoint.Tests;

public sealed class InstalledFontCatalogTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "presentationos-font-catalog-" + Guid.NewGuid().ToString("N"));
    public InstalledFontCatalogTests() => Directory.CreateDirectory(_directory);
    public void Dispose() => Directory.Delete(_directory, recursive: true);
    private sealed record Name(string Text, ushort Id = 1, ushort Platform = 3, ushort Encoding = 1, ushort Language = 0x0409);
    private static void W16(byte[] bytes, int offset, int value) => BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(offset, 2), checked((ushort)value));
    private static void W32(byte[] bytes, int offset, uint value) => BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(offset, 4), value);

    private static byte[] NameTable(Name[] names, bool languageTag = false)
    {
        var strings = names.Select(name => Encoding.BigEndianUnicode.GetBytes(name.Text)).ToArray();
        var storage = 6 + names.Length * 12 + (languageTag ? 6 : 0);
        var tag = languageTag ? Encoding.BigEndianUnicode.GetBytes("zh-Hans") : Array.Empty<byte>();
        var bytes = new byte[storage + strings.Sum(text => text.Length) + tag.Length];
        W16(bytes, 0, languageTag ? 1 : 0); W16(bytes, 2, names.Length); W16(bytes, 4, storage);
        var cursor = 0;
        for (var index = 0; index < names.Length; index++)
        {
            var record = 6 + index * 12; var name = names[index];
            W16(bytes, record, name.Platform); W16(bytes, record + 2, name.Encoding); W16(bytes, record + 4, name.Language);
            W16(bytes, record + 6, name.Id); W16(bytes, record + 8, strings[index].Length); W16(bytes, record + 10, cursor);
            strings[index].CopyTo(bytes, storage + cursor); cursor += strings[index].Length;
        }
        if (languageTag)
        {
            W16(bytes, 6 + names.Length * 12, 1);
            W16(bytes, 8 + names.Length * 12, tag.Length); W16(bytes, 10 + names.Length * 12, cursor);
            tag.CopyTo(bytes, storage + cursor);
        }
        return bytes;
    }

    private static byte[] Font(Name[] names, bool languageTag = false)
    {
        var table = NameTable(names, languageTag); var bytes = new byte[28 + table.Length];
        Face(bytes, 0, 28, table); return bytes;
    }
    private static void Face(byte[] bytes, int offset, int nameOffset, byte[] nameTable)
    {
        W32(bytes, offset, 0x00010000); W16(bytes, offset + 4, 1);
        Encoding.ASCII.GetBytes("name").CopyTo(bytes, offset + 12); W32(bytes, offset + 20, checked((uint)nameOffset));
        W32(bytes, offset + 24, checked((uint)nameTable.Length)); nameTable.CopyTo(bytes, nameOffset);
    }
    private static IReadOnlyList<FontFamilyName> Parse(byte[] bytes) { using var stream = new MemoryStream(bytes); return InstalledFontCatalog.ReadFamilyNames(stream); }
    private string Write(byte[] bytes) { var path = Path.Combine(_directory, Guid.NewGuid().ToString("N") + ".ttf"); File.WriteAllBytes(path, bytes); return path; }

    [Fact]
    public void ReadsLocalizedFamilyAndTypographicFamilyWithoutHardcodedAliases()
    {
        var names = Parse(Font(new[] { new Name("Example Family"), new Name("示例字体", Language: 0x0804),
            new Name("Example Typography", 16), new Name("Do not accept full font name", 4),
            new Name("Unicode Family", Platform: 0, Encoding: 4, Language: 0) }));
        Assert.Equal(4, names.Count);
        var chinese = Assert.Single(names, name => name.Name == "示例字体");
        Assert.Equal(0x0804, chinese.LanguageId); Assert.Equal(1, chinese.NameId);
        Assert.Contains(names, name => name.NameId == 16 && name.Name == "Example Typography");
        Assert.DoesNotContain(names, name => name.Name.Contains("full font"));
    }

    [Fact]
    public void ReadsBothTtcFacesUsingAbsoluteFileOffsets()
    {
        var first = NameTable(new[] { new Name("Family One"), new Name("字体一", Language: 0x0804) });
        var second = NameTable(new[] { new Name("Family Two"), new Name("字体二", Language: 0x0804) });
        var bytes = new byte[76 + first.Length + second.Length];
        Encoding.ASCII.GetBytes("ttcf").CopyTo(bytes, 0); W32(bytes, 4, 0x00010000); W32(bytes, 8, 2);
        W32(bytes, 12, 20); W32(bytes, 16, 48); Face(bytes, 20, 76, first); Face(bytes, 48, 76 + first.Length, second);
        var names = Parse(bytes);
        Assert.Contains(names, name => name.FaceIndex == 0 && name.Name == "字体一");
        Assert.Contains(names, name => name.FaceIndex == 1 && name.Name == "字体二");
    }

    [Fact]
    public void ExactNamesOnlyAndEveryMatchContainsFileAndNameRecordEvidence()
    {
        var bytes = Font(new[] { new Name("Example Family"), new Name("示例字体", Language: 0x0804) });
        var path = Write(bytes);
        var result = InstalledFontCatalog.VerifyRegisteredFiles(new[] { "示例字体", "example family", "Example", "Example Family Bold", "Unknown Font" }, new[] { new RegisteredFontFile(path, "test registry entry") });
        Assert.False(result.Passed);
        Assert.Equal(new[] { "Example", "Example Family Bold", "Unknown Font" }, result.Missing);
        Assert.Equal(2, result.Matches.Count);
        Assert.All(result.Matches, match => { Assert.Equal(path, match.FilePath); Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), match.FileSha256); Assert.Equal("test registry entry", match.Registration); Assert.Equal(3, match.PlatformId); });
    }

    [Fact]
    public void MissingAndMalformedFilesNeverSatisfyRequestedNames()
    {
        var path = Write(Encoding.UTF8.GetBytes("not a font"));
        var report = InstalledFontCatalog.VerifyRegisteredFiles(new[] { "Registered display name" }, new[] {
            new RegisteredFontFile(path, "Registered display name (TrueType)"), new RegisteredFontFile(Path.Combine(_directory, "missing.ttf"), "Registered display name") });
        Assert.False(report.Passed); Assert.Empty(report.Matches); Assert.Single(report.Missing); Assert.Equal(2, report.Diagnostics.Count);
    }

    [Fact]
    public void UnknownPlatformEncodingIsNotGuessedFromBytes()
    {
        var names = Parse(Font(new[] { new Name("Wrong Encoding", Encoding: 3), new Name("Macintosh Name", Platform: 1, Encoding: 0), new Name("Valid Unicode", Encoding: 10) }));
        Assert.Equal("Valid Unicode", Assert.Single(names).Name);
    }

    [Fact]
    public void FormatOneLanguageTagRecordsAreBoundedAndTheirReferenceIsRecorded()
    {
        var names = Parse(Font(new[] { new Name("国际字体", Language: 0x8000) }, languageTag: true));
        Assert.Equal(0x8000, Assert.Single(names).LanguageId);
        var invalid = Font(new[] { new Name("国际字体", Language: 0x8001) }, languageTag: true);
        Assert.Throws<InvalidDataException>(() => Parse(invalid));
    }

    [Fact]
    public void TruncatedDirectoriesAndStringRangesAreRejected()
    {
        var original = Font(new[] { new Name("Example Family") });
        foreach (var length in new[] { 0, 4, 11, 20, 27, original.Length - 1 }) Assert.Throws<InvalidDataException>(() => Parse(original[..length]));
        var pastTable = original.ToArray(); W16(pastTable, 28 + 6 + 10, 65535);
        Assert.Throws<InvalidDataException>(() => Parse(pastTable));
        var overlap = original.ToArray(); W16(overlap, 28 + 4, 6);
        Assert.Throws<InvalidDataException>(() => Parse(overlap));
        var hugeOffset = original.ToArray(); W32(hugeOffset, 20, uint.MaxValue);
        Assert.Throws<InvalidDataException>(() => Parse(hugeOffset));
    }

    [Fact]
    public void InvalidUtf16AndControlCharactersAreRejected()
    {
        var odd = Font(new[] { new Name("Family") }); W16(odd, 28 + 6 + 8, 1);
        Assert.Throws<InvalidDataException>(() => Parse(odd));
        var surrogate = Font(new[] { new Name("AB") }); surrogate[^4] = 0xD8; surrogate[^3] = 0;
        Assert.Throws<DecoderFallbackException>(() => Parse(surrogate));
        Assert.Throws<InvalidDataException>(() => Parse(Font(new[] { new Name("Bad\0Name") })));
    }

    [Fact]
    public void InvalidCollectionAndMissingNameTableAreRejected()
    {
        var bytes = new byte[20]; Encoding.ASCII.GetBytes("ttcf").CopyTo(bytes, 0); W32(bytes, 4, 0x00010000); W32(bytes, 8, uint.MaxValue);
        Assert.Throws<InvalidDataException>(() => Parse(bytes));
        var missing = Font(new[] { new Name("Family") }); Encoding.ASCII.GetBytes("head").CopyTo(missing, 12);
        Assert.Throws<InvalidDataException>(() => Parse(missing));
    }
}
