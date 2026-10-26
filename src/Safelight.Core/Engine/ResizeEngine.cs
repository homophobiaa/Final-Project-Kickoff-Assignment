using Safelight.Core.Imaging;

namespace Safelight.Core.Engine;

/// <summary>
/// Entry point used by the UI. Owns the current <see cref="ResizeRun"/> and serialises control commands.
/// </summary>
/// <remarks>
/// <c>_controlLock</c> only protects which run is current. It is always taken before a run's own locks
/// and never the other way round, so commands arriving from several browser tabs at once cannot deadlock.
/// </remarks>
public sealed class ResizeEngine : IDisposable
{
    private readonly Lock _controlLock = new();
    private readonly ImageProcessor _processor = new();
    private ResizeRun? _run;

    public EngineStatus Status
    {
        get
        {
            lock (_controlLock) return _run?.Status ?? EngineStatus.Idle;
        }
    }

    /// <summary>Starts a new run. Throws <see cref="ArgumentException"/> for bad settings and
    /// <see cref="InvalidOperationException"/> if a run is already active.</summary>
    public Guid Start(RunSettings settings)
    {
        var normalized = settings.Normalize();

        lock (_controlLock)
        {
            if (_run is { IsActive: true }) throw new InvalidOperationException("A run is already in progress. Stop it first.");

            // Not active means the last worker has run Finish, which joined the scanner; the join here
            // only covers that worker's final few instructions.
            if (_run is not null && _run.WaitForExit(TimeSpan.FromSeconds(5))) _run.Dispose();
            _run = new ResizeRun(normalized, _processor);
            _run.Start();
            return _run.Id;
        }
    }

    public bool Pause()
    {
        lock (_controlLock) return _run?.Pause() ?? false;
    }

    public bool Resume()
    {
        lock (_controlLock) return _run?.Resume() ?? false;
    }

    public bool Stop()
    {
        lock (_controlLock) return _run?.Stop() ?? false;
    }

    public EngineSnapshot GetSnapshot(int resultsFrom = 0, int maxResults = int.MaxValue)
    {
        ResizeRun? run;
        lock (_controlLock) run = _run;

        // Snapshotting takes the run's internal locks, so do it after releasing ours.
        return run?.Snapshot(resultsFrom, maxResults) ?? EngineSnapshot.Idle;
    }

    /// <summary>Settings of the current (or last) run, used to decide which files the UI may read.</summary>
    public RunSettings? CurrentSettings
    {
        get
        {
            lock (_controlLock) return _run?.Settings;
        }
    }

    public void Dispose()
    {
        lock (_controlLock)
        {
            if (_run is null) return;
            _run.Stop();
            if (_run.WaitForExit(TimeSpan.FromSeconds(10))) _run.Dispose();
            _run = null;
        }
    }
}
