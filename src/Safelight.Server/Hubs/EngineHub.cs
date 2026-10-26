using Microsoft.AspNetCore.SignalR;
using Safelight.Core.Engine;

namespace Safelight.Server.Hubs;

/// <summary>
/// Control channel for the UI. Commands return immediately; the effect shows up in the next broadcast snapshot.
/// </summary>
public sealed class EngineHub(ResizeEngine engine) : Hub
{
    /// <summary>Full state including every finished job, for a client that just connected.</summary>
    public EngineSnapshot Sync() => engine.GetSnapshot();

    public Guid Start(RunSettings settings)
    {
        try
        {
            return engine.Start(settings);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            throw new HubException(ex.Message);
        }
    }

    public bool Pause() => engine.Pause();

    public bool Resume() => engine.Resume();

    public bool Stop() => engine.Stop();
}
