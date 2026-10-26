using Microsoft.Extensions.Caching.Memory;
using Safelight.Core.Imaging;

namespace Safelight.Server.Services;

/// <summary>
/// Renders and caches small previews for the contact sheet.
/// </summary>
/// <remarks>
/// A contact sheet can request hundreds of thumbnails at once while the workers are busy. A semaphore
/// caps how many are rendered in parallel so previews never starve the resize workers of CPU, and the
/// second cache lookup inside the semaphore stops two requests for the same image rendering it twice.
/// </remarks>
public sealed class ThumbnailService(IMemoryCache cache)
{
    private readonly SemaphoreSlim _renderSlots = new(Math.Max(2, Environment.ProcessorCount / 4));

    public async Task<byte[]?> GetAsync(string path, int maxEdge, CancellationToken cancellationToken)
    {
        var file = new FileInfo(path);
        if (!file.Exists) return null;

        var key = $"{file.FullName}|{maxEdge}|{file.LastWriteTimeUtc.Ticks}";
        if (cache.TryGetValue(key, out byte[]? cached)) return cached;

        await _renderSlots.WaitAsync(cancellationToken);
        try
        {
            if (cache.TryGetValue(key, out cached)) return cached;

            var bytes = await Task.Run(() => ImageProcessor.RenderThumbnail(file.FullName, maxEdge), cancellationToken);
            cache.Set(key, bytes, new MemoryCacheEntryOptions { Size = bytes.Length, SlidingExpiration = TimeSpan.FromMinutes(20) });
            return bytes;
        }
        finally
        {
            _renderSlots.Release();
        }
    }
}
