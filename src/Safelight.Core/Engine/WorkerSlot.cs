namespace Safelight.Core.Engine;

public enum WorkerState
{
    Idle,
    Waiting,
    Working,
    Paused,
    Finished,
}

public sealed record WorkerSnapshot(
    int Id,
    WorkerState State,
    int? JobId,
    string? RelativePath,
    long JobStartedAtMs,
    JobStage Stage,
    double Progress,
    int Succeeded,
    int Failed,
    long BusyMs);

/// <summary>
/// Live status of one worker thread. Written only by its own worker, read by the UI broadcaster.
/// </summary>
/// <remarks>
/// The fields describe one logical state (which job, which stage, how far), so they are updated
/// and read together under a per-slot lock. Without it the UI could observe a torn state, such
/// as the new job's name with the previous job's 100% progress.
/// </remarks>
public sealed class WorkerSlot(int id)
{
    private readonly Lock _lock = new();
    private WorkerState _state = WorkerState.Idle;
    private ResizeJob? _job;
    private long _jobStartedAtMs;
    private JobStage _stage;
    private double _progress;
    private int _succeeded;
    private int _failed;
    private long _busyMs;

    public int Id { get; } = id;

    public void SetWaiting()
    {
        lock (_lock)
        {
            _state = WorkerState.Waiting;
            _job = null;
            _stage = JobStage.None;
            _progress = 0;
        }
    }

    public void BeginJob(ResizeJob job, long nowMs)
    {
        lock (_lock)
        {
            _state = WorkerState.Working;
            _job = job;
            _jobStartedAtMs = nowMs;
            _stage = JobStage.None;
            _progress = 0;
        }
    }

    public void Report(JobStage stage, double progress)
    {
        lock (_lock)
        {
            _stage = stage;
            _progress = progress;
        }
    }

    public void SetPaused(bool paused)
    {
        lock (_lock)
        {
            if (_state == WorkerState.Finished) return;
            _state = paused ? WorkerState.Paused : _job is null ? WorkerState.Waiting : WorkerState.Working;
        }
    }

    public void EndJob(bool succeeded, long durationMs)
    {
        lock (_lock)
        {
            if (succeeded) _succeeded++;
            else _failed++;
            _busyMs += durationMs;
            _job = null;
            _stage = JobStage.None;
            _progress = 0;
        }
    }

    public void SetFinished()
    {
        lock (_lock)
        {
            _state = WorkerState.Finished;
            _job = null;
            _stage = JobStage.None;
            _progress = 0;
        }
    }

    public WorkerSnapshot Snapshot()
    {
        lock (_lock)
        {
            return new WorkerSnapshot(Id, _state, _job?.Id, _job?.RelativePath, _jobStartedAtMs, _stage, _progress, _succeeded, _failed, _busyMs);
        }
    }
}
