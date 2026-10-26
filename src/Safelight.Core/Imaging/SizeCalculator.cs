namespace Safelight.Core.Imaging;

public static class SizeCalculator
{
    /// <summary>
    /// Computes the output size for a source image.
    /// </summary>
    /// <remarks>
    /// Proportional sizing makes the larger relative dimension fit the target exactly and lets the
    /// other one fall short: 3265 x 4898 into 800 x 600 becomes 400 x 600.
    /// </remarks>
    public static (int Width, int Height) Fit(int sourceWidth, int sourceHeight, ResizeOptions options)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(sourceWidth);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(sourceHeight);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(options.Width);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(options.Height);

        if (!options.KeepAspectRatio)
        {
            return (options.Width, options.Height);
        }

        var scale = Math.Min((double)options.Width / sourceWidth, (double)options.Height / sourceHeight);
        if (!options.AllowUpscale)
        {
            scale = Math.Min(scale, 1d);
        }

        var width = Math.Max(1, (int)Math.Round(sourceWidth * scale));
        var height = Math.Max(1, (int)Math.Round(sourceHeight * scale));
        return (width, height);
    }
}
