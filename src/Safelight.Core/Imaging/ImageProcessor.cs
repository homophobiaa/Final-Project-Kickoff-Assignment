using Safelight.Core.Concurrency;
using Safelight.Core.Engine;
using SkiaSharp;

namespace Safelight.Core.Imaging;

public sealed record ProcessedImage(string OutputPath, int SourceWidth, int SourceHeight, int OutputWidth, int OutputHeight, long OutputBytes);

/// <summary>
/// Resizes one image in four observable stages. Stateless, so a single instance is shared by all workers.
/// </summary>
public sealed class ImageProcessor
{
    private const int LatencySliceMs = 30;

    private static readonly SKSamplingOptions Sampling = new(SKCubicResampler.Mitchell);

    /// <summary>Share of a job's progress bar owned by each stage.</summary>
    private static (double From, double To) Range(JobStage stage) => stage switch
    {
        JobStage.Decoding => (0.00, 0.40),
        JobStage.Resizing => (0.40, 0.70),
        JobStage.Encoding => (0.70, 0.92),
        JobStage.Writing => (0.92, 1.00),
        _ => (0, 0),
    };

    public ProcessedImage Process(
        ResizeJob job,
        string outputRoot,
        ResizeOptions options,
        OutputPathRegistry outputPaths,
        IJobObserver observer,
        int simulatedLatencyMs,
        CancellationToken cancellationToken)
    {
        SKBitmap? bitmap = null;
        SKData? encoded = null;
        string? tempPath = null;

        try
        {
            var sourceFormat = SKEncodedImageFormat.Png;
            int sourceWidth = 0, sourceHeight = 0, width = 0, height = 0;

            RunStage(JobStage.Decoding, () =>
            {
                using var codec = SKCodec.Create(job.SourcePath) ?? throw new InvalidDataException("Not a readable image.");
                sourceFormat = codec.EncodedFormat;

                var origin = codec.EncodedOrigin;
                var swapsAxes = SwapsAxes(origin);
                (sourceWidth, sourceHeight) = swapsAxes ? (codec.Info.Height, codec.Info.Width) : (codec.Info.Width, codec.Info.Height);
                (width, height) = SizeCalculator.Fit(sourceWidth, sourceHeight, options);

                bitmap = Orient(Decode(codec, width, height, swapsAxes), origin);
            });

            RunStage(JobStage.Resizing, () =>
            {
                if (bitmap!.Width == width && bitmap.Height == height) return;

                var resized = bitmap.Resize(new SKImageInfo(width, height, bitmap.ColorType, bitmap.AlphaType), Sampling)
                    ?? throw new InvalidOperationException("Resizing failed.");
                bitmap.Dispose();
                bitmap = resized;
            });

            var (format, extension) = ChooseFormat(job.SourcePath, sourceFormat, options.Format);

            RunStage(JobStage.Encoding, () =>
            {
                encoded = bitmap!.Encode(format, Math.Clamp(options.Quality, 1, 100))
                    ?? throw new InvalidOperationException($"Encoding to {format} failed.");
                bitmap.Dispose();
                bitmap = null;
            });

            var desired = Path.Combine(outputRoot, Path.ChangeExtension(job.RelativePath, extension));
            var outputPath = outputPaths.Claim(desired);

            RunStage(JobStage.Writing, () =>
            {
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

                // Write next to the target, then rename: a Stop never leaves a half-written image behind.
                tempPath = outputPath + ".part";
                using (var stream = File.Create(tempPath))
                {
                    encoded!.SaveTo(stream);
                }

                File.Move(tempPath, outputPath, overwrite: true);
                tempPath = null;
            });

            return new ProcessedImage(outputPath, sourceWidth, sourceHeight, width, height, encoded!.Size);
        }
        finally
        {
            bitmap?.Dispose();
            encoded?.Dispose();
            if (tempPath is not null) TryDelete(tempPath);
        }

        void RunStage(JobStage stage, Action work)
        {
            var (from, to) = Range(stage);
            observer.Checkpoint();
            observer.Report(stage, from);
            work();

            // Optional artificial latency so the parallelism is easy to watch on fast machines.
            // Counted in slices rather than wall time, so time spent paused is not "used up".
            var budget = (int)(simulatedLatencyMs * (to - from));
            for (var spent = 0; spent < budget; spent += LatencySliceMs)
            {
                observer.Checkpoint();
                if (cancellationToken.WaitHandle.WaitOne(Math.Min(LatencySliceMs, budget - spent)))
                {
                    cancellationToken.ThrowIfCancellationRequested();
                }

                observer.Report(stage, from + (to - from) * Math.Min(1d, (spent + LatencySliceMs) / (double)budget));
            }

            observer.Report(stage, to);
        }
    }

    /// <summary>Renders a small upright JPEG preview that fits inside <paramref name="maxEdge"/> x <paramref name="maxEdge"/>.</summary>
    public static byte[] RenderThumbnail(string path, int maxEdge, int quality = 82)
    {
        using var codec = SKCodec.Create(path) ?? throw new InvalidDataException("Not a readable image.");
        var origin = codec.EncodedOrigin;
        var swapsAxes = SwapsAxes(origin);
        var (sourceWidth, sourceHeight) = swapsAxes ? (codec.Info.Height, codec.Info.Width) : (codec.Info.Width, codec.Info.Height);
        var (width, height) = SizeCalculator.Fit(sourceWidth, sourceHeight, new ResizeOptions { Width = maxEdge, Height = maxEdge });

        using var oriented = Orient(Decode(codec, width, height, swapsAxes), origin);
        using var resized = oriented.Width == width && oriented.Height == height
            ? oriented.Copy()
            : oriented.Resize(new SKImageInfo(width, height, oriented.ColorType, oriented.AlphaType), Sampling);
        using var data = resized.Encode(SKEncodedImageFormat.Jpeg, quality);
        return data.ToArray();
    }

    /// <summary>
    /// Decodes the image, letting the codec downscale during decoding when the target is much smaller
    /// (JPEG can decode at 1/2, 1/4, 1/8 size almost for free). Never decodes below the target size.
    /// </summary>
    private static SKBitmap Decode(SKCodec codec, int targetWidth, int targetHeight, bool swapsAxes)
    {
        var (needWidth, needHeight) = swapsAxes ? (targetHeight, targetWidth) : (targetWidth, targetHeight);
        var full = codec.Info;
        var scale = Math.Max((float)needWidth / full.Width, (float)needHeight / full.Height);

        var size = full.Size;
        if (scale < 1f)
        {
            var scaled = codec.GetScaledDimensions(scale);
            if (scaled.Width >= needWidth && scaled.Height >= needHeight) size = scaled;
        }

        var info = new SKImageInfo(size.Width, size.Height, SKImageInfo.PlatformColorType, SKAlphaType.Premul);
        var bitmap = new SKBitmap(info);
        var result = codec.GetPixels(info, bitmap.GetPixels());
        if (result is not (SKCodecResult.Success or SKCodecResult.IncompleteInput))
        {
            bitmap.Dispose();
            throw new InvalidDataException($"Could not decode image ({result}).");
        }

        return bitmap;
    }

    private static bool SwapsAxes(SKEncodedOrigin origin) =>
        origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;

    /// <summary>Applies the EXIF orientation so portrait phone photos come out upright.</summary>
    private static SKBitmap Orient(SKBitmap source, SKEncodedOrigin origin)
    {
        if (origin is SKEncodedOrigin.TopLeft) return source;

        var (w, h) = (source.Width, source.Height);
        var info = SwapsAxes(origin) ? source.Info.WithSize(h, w) : source.Info;
        var oriented = new SKBitmap(info);

        using (var canvas = new SKCanvas(oriented))
        {
            switch (origin)
            {
                case SKEncodedOrigin.TopRight: canvas.Translate(w, 0); canvas.Scale(-1, 1); break;
                case SKEncodedOrigin.BottomRight: canvas.Translate(w, h); canvas.RotateDegrees(180); break;
                case SKEncodedOrigin.BottomLeft: canvas.Translate(0, h); canvas.Scale(1, -1); break;
                case SKEncodedOrigin.LeftTop: canvas.RotateDegrees(90); canvas.Scale(1, -1); break;
                case SKEncodedOrigin.RightTop: canvas.Translate(h, 0); canvas.RotateDegrees(90); break;
                case SKEncodedOrigin.RightBottom: canvas.Translate(h, w); canvas.RotateDegrees(270); canvas.Scale(1, -1); break;
                case SKEncodedOrigin.LeftBottom: canvas.Translate(0, w); canvas.RotateDegrees(270); break;
            }

            canvas.DrawBitmap(source, 0, 0, SKSamplingOptions.Default, null);
        }

        source.Dispose();
        return oriented;
    }

    private static (SKEncodedImageFormat Format, string Extension) ChooseFormat(string sourcePath, SKEncodedImageFormat sourceFormat, OutputFormat requested) =>
        requested switch
        {
            OutputFormat.Jpeg => (SKEncodedImageFormat.Jpeg, ".jpg"),
            OutputFormat.Png => (SKEncodedImageFormat.Png, ".png"),
            OutputFormat.Webp => (SKEncodedImageFormat.Webp, ".webp"),

            // Skia can only encode JPEG, PNG and WebP; anything else (GIF, BMP, ...) is kept lossless as PNG.
            _ => sourceFormat switch
            {
                SKEncodedImageFormat.Jpeg or SKEncodedImageFormat.Png or SKEncodedImageFormat.Webp => (sourceFormat, Path.GetExtension(sourcePath)),
                _ => (SKEncodedImageFormat.Png, ".png"),
            },
        };

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
