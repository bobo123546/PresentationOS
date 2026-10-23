namespace PresentationOS.PowerPoint;

public sealed record NativeTextShape(int Slide, int Shape, string Text);

public sealed record NativeTextSnapshot(int SlideCount, IReadOnlyList<NativeTextShape> Shapes, IReadOnlyList<string> Fonts)
{
    public bool Matches(NativeTextSnapshot readback)
    {
        static string Normalize(string value) => value.Replace("\r\n", "\n").Replace('\r', '\n');
        return SlideCount == readback.SlideCount && Shapes.Count == readback.Shapes.Count &&
            Shapes.Zip(readback.Shapes).All(pair => pair.First.Slide == pair.Second.Slide &&
                pair.First.Shape == pair.Second.Shape && Normalize(pair.First.Text) == Normalize(pair.Second.Text));
    }
}
