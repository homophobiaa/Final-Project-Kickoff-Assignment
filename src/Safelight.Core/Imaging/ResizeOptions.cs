namespace Safelight.Core.Imaging;

public enum OutputFormat
{
    Original,
    Jpeg,
    Png,
    Webp,
}

public sealed record ResizeOptions
{
    public int Width { get; init; } = 800;
    public int Height { get; init; } = 600;

    /// <summary>Fit inside Width x Height preserving the aspect ratio, instead of stretching to it.</summary>
    public bool KeepAspectRatio { get; init; } = true;

    /// <summary>When false, images already smaller than the target keep their size.</summary>
    public bool AllowUpscale { get; init; }

    public OutputFormat Format { get; init; } = OutputFormat.Original;

    /// <summary>Encoder quality (1-100) for lossy formats.</summary>
    public int Quality { get; init; } = 85;
}
