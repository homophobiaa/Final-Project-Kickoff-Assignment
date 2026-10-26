namespace Safelight.Core.Engine;

/// <summary>One unit of work: resize a single source image.</summary>
public sealed record ResizeJob(int Id, string SourcePath, string RelativePath, long SourceBytes);

public enum JobStage
{
    None,
    Decoding,
    Resizing,
    Encoding,
    Writing,
}

public enum JobOutcome
{
    Succeeded,
    Failed,
    Cancelled,
}

/// <summary>A finished job. Times are milliseconds since the start of the run.</summary>
public sealed record JobResult(
    int JobId,
    string RelativePath,
    string SourcePath,
    string? OutputPath,
    JobOutcome Outcome,
    int WorkerId,
    long StartedAtMs,
    long FinishedAtMs,
    long SourceBytes,
    long OutputBytes,
    int SourceWidth,
    int SourceHeight,
    int OutputWidth,
    int OutputHeight,
    string? Error);

/// <summary>
/// Callbacks a job uses to talk to the worker running it: progress reports, and checkpoints
/// where the worker may block (Pause) or abort (Stop).
/// </summary>
public interface IJobObserver
{
    void Report(JobStage stage, double progress);

    void Checkpoint();
}
