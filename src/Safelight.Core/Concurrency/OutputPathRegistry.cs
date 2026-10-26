namespace Safelight.Core.Concurrency;

/// <summary>
/// Hands out unique output paths for one run.
/// </summary>
/// <remarks>
/// Two sources can map to the same output: <c>cat.png</c> and <c>cat.jpg</c> both become
/// <c>cat.jpg</c> when the output format is JPEG. Without coordination two workers would
/// check "does the file exist?" at the same moment, both see "no", and the slower one would
/// silently overwrite the faster one (a classic check-then-act race). Claiming a path is a
/// single atomic operation under a lock, so each output is owned by exactly one worker.
/// </remarks>
public sealed class OutputPathRegistry
{
    private readonly Lock _lock = new();
    private readonly HashSet<string> _claimed = new(OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);

    public string Claim(string desiredPath)
    {
        var directory = Path.GetDirectoryName(desiredPath) ?? string.Empty;
        var name = Path.GetFileNameWithoutExtension(desiredPath);
        var extension = Path.GetExtension(desiredPath);

        lock (_lock)
        {
            var candidate = desiredPath;
            for (var n = 2; !_claimed.Add(candidate); n++)
            {
                candidate = Path.Combine(directory, $"{name} ({n}){extension}");
            }

            return candidate;
        }
    }
}
