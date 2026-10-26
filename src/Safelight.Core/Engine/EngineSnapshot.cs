namespace Safelight.Core.Engine;

public enum EngineStatus
{
    Idle,
    Running,
    Paused,
    Stopping,
    Completed,
    Stopped,
}

public sealed record PauseInterval(long StartMs, long? EndMs);

public sealed record QueueSnapshot(int Count, IReadOnlyList<ResizeJob> Head);

public sealed record RunStats(int Discovered, int Succeeded, int Failed, int Cancelled, long BytesIn, long BytesOut);

/// <summary>
/// Immutable picture of the engine at one moment. Results are paged: <see cref="Results"/> holds
/// the finished jobs starting at index <see cref="ResultsFrom"/>, so the UI can receive deltas.
/// </summary>
public sealed record EngineSnapshot(
    Guid? RunId,
    EngineStatus Status,
    bool IsScanning,
    long ElapsedMs,
    RunSettings? Settings,
    IReadOnlyList<WorkerSnapshot> Workers,
    QueueSnapshot Queue,
    RunStats Stats,
    IReadOnlyList<PauseInterval> Pauses,
    int ResultCount,
    int ResultsFrom,
    IReadOnlyList<JobResult> Results,
    string? ScanError)
{
    public static EngineSnapshot Idle { get; } = new(
        null, EngineStatus.Idle, false, 0, null, [], new QueueSnapshot(0, []), new RunStats(0, 0, 0, 0, 0, 0), [], 0, 0, [], null);
}
