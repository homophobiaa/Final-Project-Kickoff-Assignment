using Safelight.Core.Imaging;

namespace Safelight.Core.Engine;

public sealed record RunSettings
{
    public const int MaxWorkers = 64;
    public const int MaxSimulatedLatencyMs = 5000;

    public string SourceFolder { get; init; } = string.Empty;
    public string OutputFolder { get; init; } = string.Empty;
    public int WorkerCount { get; init; } = 4;
    public ResizeOptions Resize { get; init; } = new();

    /// <summary>Extra time spread across each job's stages, to make the workers easy to follow on screen.</summary>
    public int SimulatedLatencyMs { get; init; }

    /// <summary>Validates the settings and returns a copy with absolute paths. Throws <see cref="ArgumentException"/>.</summary>
    public RunSettings Normalize()
    {
        if (string.IsNullOrWhiteSpace(SourceFolder)) throw new ArgumentException("Choose a source folder.");
        if (string.IsNullOrWhiteSpace(OutputFolder)) throw new ArgumentException("Choose an output folder.");

        var source = Path.TrimEndingDirectorySeparator(Path.GetFullPath(SourceFolder));
        var output = Path.TrimEndingDirectorySeparator(Path.GetFullPath(OutputFolder));

        if (!Directory.Exists(source)) throw new ArgumentException($"Source folder does not exist: {source}");

        // An output folder inside the source would be rescanned by later runs, and a source inside the
        // output would mix originals with results. Both are refused.
        if (ImageFiles.IsUnder(output, source)) throw new ArgumentException("The output folder cannot be the source folder or inside it.");
        if (ImageFiles.IsUnder(source, output)) throw new ArgumentException("The source folder cannot be inside the output folder.");

        if (WorkerCount is < 1 or > MaxWorkers) throw new ArgumentException($"Worker count must be between 1 and {MaxWorkers}.");
        if (Resize.Width is < 1 or > 20000 || Resize.Height is < 1 or > 20000) throw new ArgumentException("Target size must be between 1 and 20000 pixels.");
        if (SimulatedLatencyMs is < 0 or > MaxSimulatedLatencyMs) throw new ArgumentException($"Simulated latency must be between 0 and {MaxSimulatedLatencyMs} ms.");

        return this with { SourceFolder = source, OutputFolder = output };
    }
}
