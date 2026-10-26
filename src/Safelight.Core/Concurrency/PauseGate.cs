namespace Safelight.Core.Concurrency;

/// <summary>
/// A gate every worker passes through at its checkpoints. Open = running, closed = paused.
/// </summary>
/// <remarks>
/// Built on <see cref="ManualResetEventSlim"/>: <c>Set</c> releases all waiting workers at once,
/// which is exactly the "resume everyone together" semantics we want. Waiting takes the run's
/// cancellation token so a Stop always wins over a Pause and no worker stays parked forever.
/// </remarks>
public sealed class PauseGate : IDisposable
{
    private readonly ManualResetEventSlim _open = new(initialState: true);

    public bool IsPaused => !_open.IsSet;

    public void Pause() => _open.Reset();

    public void Resume() => _open.Set();

    /// <summary>Blocks while the gate is closed. Returns true if the caller actually had to wait.</summary>
    public bool WaitWhilePaused(CancellationToken cancellationToken)
    {
        if (_open.IsSet) return false;
        _open.Wait(cancellationToken);
        return true;
    }

    public void Dispose() => _open.Dispose();
}
