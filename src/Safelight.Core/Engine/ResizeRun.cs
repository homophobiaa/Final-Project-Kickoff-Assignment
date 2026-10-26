using System.Diagnostics;
using Safelight.Core.Concurrency;
using Safelight.Core.Imaging;

namespace Safelight.Core.Engine;

/// <summary>
/// One execution of the resizer: a scanner thread producing jobs and N worker threads consuming them.
/// </summary>
/// <remarks>
/// Shared state and what protects it:
/// <list type="bullet">
/// <item><c>_queue</c>: <see cref="JobQueue{T}"/>, its own lock + semaphore.</item>
/// <item><c>_results</c>: <c>_resultsLock</c>. Workers append, the broadcaster reads pages.</item>
/// <item><c>_status</c>, <c>_pauses</c>, <c>_finishedAtMs</c>: <c>_stateLock</c>. Control commands and the last exiting worker.</item>
/// <item>Counters: <see cref="Interlocked"/>. Independent numbers that never need to change together.</item>
/// <item>Per-worker status: each <see cref="WorkerSlot"/> has its own lock.</item>
/// </list>
/// No code path holds two of these locks at once, so lock-ordering deadlocks are impossible by construction.
/// </remarks>
internal sealed class ResizeRun : IDisposable
{
    private const int QueuePreviewSize = 60;

    private readonly ImageProcessor _processor;
    private readonly JobQueue<ResizeJob> _queue = new();
    private readonly PauseGate _gate = new();
    private readonly CancellationTokenSource _cts = new();
    private readonly OutputPathRegistry _outputPaths = new();
    private readonly Stopwatch _clock = new();
    private readonly WorkerSlot[] _slots;
    private readonly Thread[] _workers;
    private readonly Thread _scanner;

    private readonly Lock _stateLock = new();
    private EngineStatus _status = EngineStatus.Idle;
    private readonly List<PauseInterval> _pauses = [];
    private long _finishedAtMs = -1;

    private readonly Lock _resultsLock = new();
    private readonly List<JobResult> _results = [];

    private int _activeWorkers;
    private int _nextJobId;
    private volatile bool _scanning;
    private volatile string? _scanError;
    private int _discovered;
    private int _succeeded;
    private int _failed;
    private int _cancelled;
    private long _bytesIn;
    private long _bytesOut;

    public ResizeRun(RunSettings settings, ImageProcessor processor)
    {
        Settings = settings;
        _processor = processor;
        _slots = Enumerable.Range(1, settings.WorkerCount).Select(id => new WorkerSlot(id)).ToArray();
        _workers = _slots
            .Select(slot => new Thread(WorkerLoop) { IsBackground = true, Name = $"Safelight worker {slot.Id}" })
            .ToArray();
        _scanner = new Thread(ScanLoop) { IsBackground = true, Name = "Safelight scanner" };
    }

    public Guid Id { get; } = Guid.NewGuid();

    public RunSettings Settings { get; }

    public EngineStatus Status
    {
        get { lock (_stateLock) return _status; }
    }

    public bool IsActive => Status is EngineStatus.Running or EngineStatus.Paused or EngineStatus.Stopping;

    private long Now => _clock.ElapsedMilliseconds;

    public void Start()
    {
        lock (_stateLock)
        {
            if (_status != EngineStatus.Idle) throw new InvalidOperationException("A run can only be started once.");
            _status = EngineStatus.Running;
        }

        _activeWorkers = _workers.Length;
        _scanning = true;
        _clock.Start();

        _scanner.Start();
        for (var i = 0; i < _workers.Length; i++)
        {
            _workers[i].Start(_slots[i]);
        }
    }

    public bool Pause()
    {
        lock (_stateLock)
        {
            if (_status != EngineStatus.Running) return false;
            _gate.Pause();
            _status = EngineStatus.Paused;
            _pauses.Add(new PauseInterval(Now, null));
            return true;
        }
    }

    public bool Resume()
    {
        lock (_stateLock)
        {
            if (_status != EngineStatus.Paused) return false;
            ClosePauseInterval();
            _status = EngineStatus.Running;
            _gate.Resume();
            return true;
        }
    }

    public bool Stop()
    {
        lock (_stateLock)
        {
            if (_status is not (EngineStatus.Running or EngineStatus.Paused)) return false;
            _status = EngineStatus.Stopping;
            ClosePauseInterval();
        }

        // Order matters: cancel first so workers released from the gate see the token,
        // then drop the pending jobs so nobody picks up new work.
        _cts.Cancel();
        var dropped = _queue.Drain();
        Interlocked.Add(ref _cancelled, dropped.Count);
        _gate.Resume();
        return true;
    }

    public EngineSnapshot Snapshot(int resultsFrom, int maxResults)
    {
        EngineStatus status;
        long elapsed;
        PauseInterval[] pauses;
        lock (_stateLock)
        {
            status = _status;
            elapsed = _finishedAtMs >= 0 ? _finishedAtMs : Now;
            pauses = [.. _pauses];
        }

        var workers = _slots.Select(slot => slot.Snapshot()).ToArray();
        var (queueCount, queueHead) = _queue.Peek(QueuePreviewSize);

        int resultCount;
        JobResult[] page;
        lock (_resultsLock)
        {
            resultCount = _results.Count;
            var from = Math.Clamp(resultsFrom, 0, resultCount);
            page = _results.GetRange(from, Math.Min(maxResults, resultCount - from)).ToArray();
        }

        var stats = new RunStats(
            Volatile.Read(ref _discovered),
            Volatile.Read(ref _succeeded),
            Volatile.Read(ref _failed),
            Volatile.Read(ref _cancelled),
            Interlocked.Read(ref _bytesIn),
            Interlocked.Read(ref _bytesOut));

        return new EngineSnapshot(
            Id, status, _scanning, elapsed, Settings, workers, new QueueSnapshot(queueCount, queueHead), stats, pauses,
            resultCount, Math.Clamp(resultsFrom, 0, resultCount), page, _scanError);
    }

    public JobResult? FindResult(Func<JobResult, bool> predicate)
    {
        lock (_resultsLock)
        {
            return _results.FirstOrDefault(predicate);
        }
    }

    /// <summary>Producer: walks the source tree and feeds the queue while workers are already consuming it.</summary>
    private void ScanLoop()
    {
        var token = _cts.Token;
        try
        {
            var options = new EnumerationOptions
            {
                RecurseSubdirectories = true,
                IgnoreInaccessible = true,
                AttributesToSkip = FileAttributes.Hidden | FileAttributes.System,
            };

            foreach (var path in Directory.EnumerateFiles(Settings.SourceFolder, "*", options))
            {
                token.ThrowIfCancellationRequested();
                _gate.WaitWhilePaused(token);

                if (!ImageFiles.IsSupported(path)) continue;

                long size;
                try
                {
                    size = new FileInfo(path).Length;
                }
                catch (IOException)
                {
                    continue;
                }

                var job = new ResizeJob(Interlocked.Increment(ref _nextJobId), path, Path.GetRelativePath(Settings.SourceFolder, path), size);
                if (!_queue.TryEnqueue(job)) break;
                Interlocked.Increment(ref _discovered);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            _scanError = ex.Message;
        }
        finally
        {
            _scanning = false;
            _queue.CompleteAdding();
        }
    }

    /// <summary>Consumer: one per thread. Pulls jobs until the queue is completed or the run is cancelled.</summary>
    private void WorkerLoop(object? state)
    {
        var slot = (WorkerSlot)state!;
        var token = _cts.Token;
        var observer = new SlotObserver(this, slot, token);

        try
        {
            while (true)
            {
                observer.Checkpoint();
                slot.SetWaiting();
                if (!_queue.TryTake(out var job, token)) break;
                Process(slot, job, observer, token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            slot.SetFinished();

            // Exactly one worker sees the counter reach zero; it closes the run.
            if (Interlocked.Decrement(ref _activeWorkers) == 0) Finish();
        }
    }

    private void Process(WorkerSlot slot, ResizeJob job, SlotObserver observer, CancellationToken token)
    {
        var startedAt = Now;
        slot.BeginJob(job, startedAt);

        try
        {
            var image = _processor.Process(
                job, Settings.OutputFolder, Settings.Resize, _outputPaths, observer, Settings.SimulatedLatencyMs, token);

            Interlocked.Increment(ref _succeeded);
            Interlocked.Add(ref _bytesIn, job.SourceBytes);
            Interlocked.Add(ref _bytesOut, image.OutputBytes);
            slot.EndJob(succeeded: true, Now - startedAt);
            Record(job, slot, startedAt, JobOutcome.Succeeded, image, null);
        }
        catch (OperationCanceledException)
        {
            Interlocked.Increment(ref _cancelled);
            slot.EndJob(succeeded: false, Now - startedAt);
            Record(job, slot, startedAt, JobOutcome.Cancelled, null, "Stopped before it finished.");
            throw;
        }
        catch (Exception ex)
        {
            Interlocked.Increment(ref _failed);
            slot.EndJob(succeeded: false, Now - startedAt);
            Record(job, slot, startedAt, JobOutcome.Failed, null, ex.Message);
        }
    }

    private void Record(ResizeJob job, WorkerSlot slot, long startedAt, JobOutcome outcome, ProcessedImage? image, string? error)
    {
        var result = new JobResult(
            job.Id, job.RelativePath, job.SourcePath, image?.OutputPath, outcome, slot.Id, startedAt, Now,
            job.SourceBytes, image?.OutputBytes ?? 0,
            image?.SourceWidth ?? 0, image?.SourceHeight ?? 0, image?.OutputWidth ?? 0, image?.OutputHeight ?? 0,
            error);

        lock (_resultsLock)
        {
            _results.Add(result);
        }
    }

    private void Finish()
    {
        // After a Stop the workers can drain out while the scanner is still inside a slow directory listing.
        // The run only counts as finished once every thread it started is gone. This cannot deadlock:
        // the scanner never waits for workers (the queue is unbounded) and it observes the same token.
        _scanner.Join();

        lock (_stateLock)
        {
            ClosePauseInterval();
            _finishedAtMs = Now;
            _clock.Stop();
            _status = _cts.IsCancellationRequested ? EngineStatus.Stopped : EngineStatus.Completed;
        }
    }

    /// <remarks>Caller must hold <c>_stateLock</c>.</remarks>
    private void ClosePauseInterval()
    {
        if (_pauses.Count > 0 && _pauses[^1].EndMs is null)
        {
            _pauses[^1] = _pauses[^1] with { EndMs = Now };
        }
    }

    /// <summary>Blocks until the scanner and all workers have exited.</summary>
    public bool WaitForExit(TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        foreach (var thread in _workers.Append(_scanner))
        {
            if (thread.ThreadState.HasFlag(System.Threading.ThreadState.Unstarted)) continue;
            var remaining = deadline - DateTime.UtcNow;
            if (remaining <= TimeSpan.Zero || !thread.Join(remaining)) return false;
        }

        return true;
    }

    /// <remarks>Only call once <see cref="WaitForExit"/> has returned true; threads still use these handles.</remarks>
    public void Dispose()
    {
        _cts.Dispose();
        _gate.Dispose();
        _queue.Dispose();
    }

    private sealed class SlotObserver(ResizeRun run, WorkerSlot slot, CancellationToken token) : IJobObserver
    {
        public void Report(JobStage stage, double progress) => slot.Report(stage, progress);

        public void Checkpoint()
        {
            token.ThrowIfCancellationRequested();
            if (!run._gate.IsPaused) return;

            slot.SetPaused(true);
            try
            {
                run._gate.WaitWhilePaused(token);
            }
            finally
            {
                slot.SetPaused(false);
            }
        }
    }
}
