using Microsoft.AspNetCore.SignalR;
using Safelight.Core.Engine;
using Safelight.Server.Hubs;

namespace Safelight.Server.Services;

/// <summary>
/// Samples the engine on a fixed beat and pushes one snapshot to every browser.
/// </summary>
/// <remarks>
/// Workers never talk to the UI directly. Sending an event per progress tick from 16 threads would flood
/// the socket and the browser's main thread; sampling at 10 Hz bounds the UI's work no matter how many
/// workers run or how fast they go. That is what keeps the page responsive. Finished jobs are sent as
/// deltas (from a cursor) so each one crosses the wire once.
/// </remarks>
public sealed class SnapshotBroadcaster(ResizeEngine engine, IHubContext<EngineHub> hub, ILogger<SnapshotBroadcaster> logger) : BackgroundService
{
    private static readonly TimeSpan Beat = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan IdleBeat = TimeSpan.FromSeconds(1);
    private const int MaxResultsPerSnapshot = 400;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Beat);
        Guid? runId = null;
        var cursor = 0;
        var lastStatus = EngineStatus.Idle;
        var lastSent = DateTime.MinValue;

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var snapshot = engine.GetSnapshot(cursor, MaxResultsPerSnapshot);
            if (snapshot.RunId != runId)
            {
                runId = snapshot.RunId;
                snapshot = engine.GetSnapshot(0, MaxResultsPerSnapshot);
            }

            cursor = snapshot.ResultsFrom + snapshot.Results.Count;

            var busy = snapshot.Status is EngineStatus.Running or EngineStatus.Paused or EngineStatus.Stopping;
            var changed = snapshot.Status != lastStatus || snapshot.Results.Count > 0;
            if (!busy && !changed && DateTime.UtcNow - lastSent < IdleBeat) continue;

            try
            {
                await hub.Clients.All.SendAsync("snapshot", snapshot, stoppingToken);
                lastStatus = snapshot.Status;
                lastSent = DateTime.UtcNow;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Failed to broadcast engine snapshot");
            }
        }
    }
}
