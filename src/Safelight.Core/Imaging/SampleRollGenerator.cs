using SkiaSharp;

namespace Safelight.Core.Imaging;

/// <summary>
/// Paints a folder of large procedural landscape "photographs" so the resizer can be tried without real photos.
/// Includes nested folders, mixed formats and one deliberately corrupt file to exercise the error path.
/// </summary>
public static class SampleRollGenerator
{
    private sealed record Palette(string Name, SKColor SkyTop, SKColor SkyBottom, SKColor Sun, SKColor Far, SKColor Near);

    private static readonly Palette[] Palettes =
    [
        new("dawn", new(46, 52, 92), new(244, 170, 128), new(255, 226, 180), new(138, 108, 132), new(42, 34, 52)),
        new("dusk", new(28, 22, 48), new(220, 98, 74), new(255, 190, 120), new(110, 52, 70), new(26, 16, 28)),
        new("overcast", new(150, 158, 166), new(206, 208, 204), new(240, 238, 230), new(112, 120, 124), new(52, 58, 60)),
        new("alpine", new(64, 120, 186), new(190, 220, 236), new(255, 252, 236), new(120, 150, 172), new(34, 58, 64)),
        new("desert", new(118, 160, 204), new(246, 214, 168), new(255, 246, 214), new(196, 122, 82), new(112, 58, 40)),
        new("night", new(6, 10, 24), new(34, 46, 86), new(226, 230, 214), new(30, 38, 62), new(8, 10, 16)),
        new("safelight", new(30, 6, 6), new(150, 36, 22), new(255, 120, 80), new(70, 14, 12), new(16, 4, 4)),
    ];

    private static readonly (int Width, int Height)[] Sizes =
    [
        (6000, 4000), (4000, 6000), (5472, 3648), (3264, 2448), (2448, 3264), (4898, 3265), (3265, 4898),
        (4032, 3024), (3000, 3000), (2560, 1440), (1920, 1080), (1200, 1600), (640, 480),
    ];

    private static readonly string[] Folders =
    [
        "roll-01 coast", "roll-02 mountains", "roll-02 mountains/summit", "roll-03 desert", "roll-04 night walks",
        "roll-05 city edges", "roll-05 city edges/rooftops",
    ];

    /// <summary>Paints <paramref name="count"/> images in parallel. Returns the number of files written.</summary>
    public static int Generate(string folder, int count, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(folder);

        var options = new ParallelOptions { CancellationToken = cancellationToken, MaxDegreeOfParallelism = Environment.ProcessorCount };
        Parallel.For(0, count, options, i =>
        {
            var random = new Random(1337 + i * 7919);
            var subfolder = Path.Combine(folder, Folders[i % Folders.Length]);
            Directory.CreateDirectory(subfolder);

            var palette = Palettes[random.Next(Palettes.Length)];
            var (width, height) = Sizes[random.Next(Sizes.Length)];
            using var bitmap = Paint(width, height, palette, random);

            var asPng = i % 9 == 4;
            var path = Path.Combine(subfolder, $"frame-{i + 1:000}-{palette.Name}{(asPng ? ".png" : ".jpg")}");
            using var data = bitmap.Encode(asPng ? SKEncodedImageFormat.Png : SKEncodedImageFormat.Jpeg, 90);
            using var stream = File.Create(path);
            data.SaveTo(stream);
        });

        // A file with an image extension but garbage content: the workers must report it, not crash.
        var damaged = Path.Combine(folder, Folders[0], "frame-000-light-leak.jpg");
        File.WriteAllBytes(damaged, Enumerable.Range(0, 4096).Select(b => (byte)(b * 31 % 251)).ToArray());

        return count + 1;
    }

    private static SKBitmap Paint(int width, int height, Palette palette, Random random)
    {
        var bitmap = new SKBitmap(width, height, SKColorType.Rgba8888, SKAlphaType.Opaque);
        using var canvas = new SKCanvas(bitmap);
        using var paint = new SKPaint { IsAntialias = true };

        paint.Shader = SKShader.CreateLinearGradient(
            new SKPoint(0, 0), new SKPoint(0, height), [palette.SkyTop, palette.SkyBottom], [0f, 0.75f], SKShaderTileMode.Clamp);
        canvas.DrawRect(0, 0, width, height, paint);

        var sun = new SKPoint(width * (0.2f + random.NextSingle() * 0.6f), height * (0.22f + random.NextSingle() * 0.2f));
        var sunRadius = Math.Min(width, height) * (0.05f + random.NextSingle() * 0.05f);
        paint.Shader = SKShader.CreateRadialGradient(
            sun, sunRadius * 4, [palette.Sun.WithAlpha(150), palette.Sun.WithAlpha(0)], SKShaderTileMode.Clamp);
        canvas.DrawCircle(sun, sunRadius * 4, paint);
        paint.Shader = null;
        paint.Color = palette.Sun;
        canvas.DrawCircle(sun, sunRadius, paint);

        // Three ridges, far to near; distant ones are hazier (closer to the sky colour).
        for (var layer = 0; layer < 3; layer++)
        {
            var baseLine = height * (0.50f + layer * 0.12f + random.NextSingle() * 0.06f);
            var amplitude = height * (0.10f - layer * 0.025f);
            var (f1, f2, f3) = (random.NextSingle() * 3 + 1, random.NextSingle() * 7 + 3, random.NextSingle() * 23 + 9);
            var (p1, p2, p3) = (random.NextSingle() * MathF.Tau, random.NextSingle() * MathF.Tau, random.NextSingle() * MathF.Tau);

            using var builder = new SKPathBuilder();
            builder.MoveTo(0, height);
            for (var x = 0; x <= width; x += 4)
            {
                var t = x / (float)width * MathF.Tau;
                builder.LineTo(x, baseLine - amplitude * (0.6f * MathF.Sin(t * f1 + p1) + 0.3f * MathF.Sin(t * f2 + p2) + 0.1f * MathF.Sin(t * f3 + p3)));
            }

            builder.LineTo(width, height);
            builder.Close();
            using var ridge = builder.Detach();

            var color = Mix(Mix(palette.Far, palette.Near, layer / 2f), palette.SkyBottom, 0.35f - layer * 0.17f);
            paint.Shader = SKShader.CreateLinearGradient(
                new SKPoint(0, baseLine - amplitude), new SKPoint(0, height), [color, Mix(color, palette.Near, 0.6f)], SKShaderTileMode.Clamp);
            canvas.DrawPath(ridge, paint);
        }

        // Film grain.
        paint.Shader = SKShader.CreatePerlinNoiseFractalNoise(0.9f, 0.9f, 2, random.Next(1000));
        paint.BlendMode = SKBlendMode.Overlay;
        paint.Color = SKColors.White.WithAlpha(40);
        canvas.DrawRect(0, 0, width, height, paint);

        return bitmap;
    }

    private static SKColor Mix(SKColor a, SKColor b, float t)
    {
        t = Math.Clamp(t, 0f, 1f);
        return new SKColor(
            (byte)(a.Red + (b.Red - a.Red) * t),
            (byte)(a.Green + (b.Green - a.Green) * t),
            (byte)(a.Blue + (b.Blue - a.Blue) * t));
    }
}
