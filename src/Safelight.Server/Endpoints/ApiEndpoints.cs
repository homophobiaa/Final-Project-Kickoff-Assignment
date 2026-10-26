using System.Diagnostics;
using Safelight.Core.Engine;
using Safelight.Core.Imaging;
using Safelight.Server.Services;

namespace Safelight.Server.Endpoints;

public static class ApiEndpoints
{
    private static readonly SemaphoreSlim SampleGeneration = new(1, 1);

    public sealed record FolderEntry(string Name, string Path, string Kind);

    public sealed record FolderListing(string? Path, string? Parent, IReadOnlyList<FolderEntry> Entries, int ImageCount);

    public sealed record SampleRequest(int Count = 48);

    public sealed record RevealRequest(string Path);

    public static void MapApi(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/defaults", () => new
        {
            SampleFolder = AppPaths.SampleRoll,
            OutputFolder = AppPaths.DefaultOutput,
            Environment.ProcessorCount,
            RunSettings.MaxWorkers,
            RunSettings.MaxSimulatedLatencyMs,
            SampleRollReady = Directory.Exists(AppPaths.SampleRoll) && Directory.EnumerateFiles(AppPaths.SampleRoll, "*", SearchOption.AllDirectories).Any(),
        });

        api.MapGet("/fs", ListFolder);
        api.MapGet("/image", ServeImage);
        api.MapGet("/thumb", ServeThumbnail);
        api.MapPost("/samples", GenerateSamples);
        api.MapPost("/reveal", Reveal);
    }

    private static IResult ListFolder(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            var places = new (string Name, Environment.SpecialFolder Folder)[]
            {
                ("Pictures", Environment.SpecialFolder.MyPictures),
                ("Desktop", Environment.SpecialFolder.Desktop),
                ("Documents", Environment.SpecialFolder.MyDocuments),
                ("Home", Environment.SpecialFolder.UserProfile),
            };

            var entries = places
                .Select(p => (p.Name, Path: Environment.GetFolderPath(p.Folder)))
                .Where(p => p.Path.Length > 0 && Directory.Exists(p.Path))
                .Select(p => new FolderEntry(p.Name, p.Path, "place"))
                .Append(new FolderEntry("Safelight", AppPaths.Home, "place"))
                .Concat(DriveInfo.GetDrives().Where(d => d.IsReady).Select(d => new FolderEntry(d.Name.TrimEnd('\\', '/'), d.RootDirectory.FullName, "drive")))
                .ToList();

            return Results.Ok(new FolderListing(null, null, entries, 0));
        }

        string full;
        try
        {
            full = Path.GetFullPath(path);
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return Results.BadRequest(new { error = "That is not a valid path." });
        }

        if (!Directory.Exists(full)) return Results.NotFound(new { error = "Folder not found." });

        var options = new EnumerationOptions { IgnoreInaccessible = true, AttributesToSkip = FileAttributes.Hidden | FileAttributes.System };
        var folders = Directory.EnumerateDirectories(full, "*", options)
            .Select(d => new FolderEntry(Path.GetFileName(d), d, "folder"))
            .OrderBy(e => e.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        var images = Directory.EnumerateFiles(full, "*", options).Where(ImageFiles.IsSupported).Take(10_000).Count();

        return Results.Ok(new FolderListing(full, Directory.GetParent(full)?.FullName, folders, images));
    }

    private static IResult ServeImage(string path, ResizeEngine engine)
    {
        if (!IsReadable(path, engine)) return Results.NotFound();
        var file = new FileInfo(path);
        return Results.File(file.FullName, ImageFiles.ContentType(path), lastModified: file.LastWriteTimeUtc, enableRangeProcessing: true);
    }

    private static async Task<IResult> ServeThumbnail(string path, int? size, ResizeEngine engine, ThumbnailService thumbnails, HttpContext context)
    {
        if (!IsReadable(path, engine)) return Results.NotFound();

        try
        {
            var bytes = await thumbnails.GetAsync(path, Math.Clamp(size ?? 360, 64, 1024), context.RequestAborted);
            if (bytes is null) return Results.NotFound();

            context.Response.Headers.CacheControl = "private, max-age=3600";
            return Results.Bytes(bytes, "image/jpeg");
        }
        catch (InvalidDataException)
        {
            return Results.UnprocessableEntity();
        }
    }

    private static async Task<IResult> GenerateSamples(SampleRequest request, ResizeEngine engine, CancellationToken cancellationToken)
    {
        var settings = engine.CurrentSettings;
        if ((engine.Status is EngineStatus.Running or EngineStatus.Paused or EngineStatus.Stopping) &&
            settings is not null && ImageFiles.IsUnder(settings.SourceFolder, AppPaths.SampleRoll))
        {
            return Results.Conflict(new { error = "The sample roll is being processed right now." });
        }

        if (!await SampleGeneration.WaitAsync(0, cancellationToken))
        {
            return Results.Conflict(new { error = "A sample roll is already being generated." });
        }

        try
        {
            var stopwatch = Stopwatch.StartNew();
            if (Directory.Exists(AppPaths.SampleRoll)) Directory.Delete(AppPaths.SampleRoll, recursive: true);

            var count = Math.Clamp(request.Count, 1, 400);
            var files = await Task.Run(() => SampleRollGenerator.Generate(AppPaths.SampleRoll, count, cancellationToken), cancellationToken);
            return Results.Ok(new { Folder = AppPaths.SampleRoll, Files = files, ElapsedMs = stopwatch.ElapsedMilliseconds });
        }
        finally
        {
            SampleGeneration.Release();
        }
    }

    private static IResult Reveal(RevealRequest request)
    {
        if (!OperatingSystem.IsWindows()) return Results.StatusCode(StatusCodes.Status501NotImplemented);

        var path = Path.GetFullPath(request.Path);
        if (File.Exists(path)) Process.Start("explorer.exe", $"/select,\"{path}\"");
        else if (Directory.Exists(path)) Process.Start("explorer.exe", $"\"{path}\"");
        else return Results.NotFound();

        return Results.NoContent();
    }

    /// <summary>The UI may only read images inside the current run's folders or Safelight's own folder.</summary>
    private static bool IsReadable(string path, ResizeEngine engine)
    {
        if (string.IsNullOrWhiteSpace(path) || !ImageFiles.IsSupported(path)) return false;

        var settings = engine.CurrentSettings;
        string?[] roots = [AppPaths.Home, settings?.SourceFolder, settings?.OutputFolder];
        return roots.Any(root => root is not null && ImageFiles.IsUnder(path, root)) && File.Exists(path);
    }
}
