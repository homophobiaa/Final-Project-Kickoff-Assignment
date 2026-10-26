using Safelight.Core.Engine;
using Safelight.Core.Imaging;
using SkiaSharp;

namespace Safelight.Core.Tests;

public sealed class ResizeEngineTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "safelight-tests", Guid.NewGuid().ToString("N"));
    private readonly string _source;
    private readonly string _output;
    private readonly ResizeEngine _engine = new();

    public ResizeEngineTests()
    {
        _source = Path.Combine(_root, "source");
        _output = Path.Combine(_root, "output");

        WriteImage("a.jpg", 1200, 800);
        WriteImage("b.png", 800, 1200);
        WriteImage(Path.Combine("nested", "c.jpg"), 1600, 900);
        WriteImage(Path.Combine("nested", "deeper", "d.jpg"), 640, 480);
        WriteImage(Path.Combine("nested", "deeper", "e.webp"), 2000, 2000);
        File.WriteAllText(Path.Combine(_source, "broken.jpg"), "definitely not a jpeg");
        File.WriteAllText(Path.Combine(_source, "notes.txt"), "ignored");
    }

    [Fact]
    public void Run_resizes_everything_and_mirrors_the_folder_structure()
    {
        _engine.Start(Settings(workers: 3));
        var snapshot = WaitFor(s => s.Status == EngineStatus.Completed);

        Assert.Equal(6, snapshot.Stats.Discovered);
        Assert.Equal(5, snapshot.Stats.Succeeded);
        Assert.Equal(1, snapshot.Stats.Failed);
        Assert.Equal(6, snapshot.ResultCount);
        Assert.True(File.Exists(Path.Combine(_output, "nested", "deeper", "d.jpg")));
        Assert.True(File.Exists(Path.Combine(_output, "nested", "deeper", "e.webp")));

        var c = snapshot.Results.Single(r => r.RelativePath.EndsWith("c.jpg"));
        Assert.Equal((400, 225), (c.OutputWidth, c.OutputHeight));
        using var codec = SKCodec.Create(c.OutputPath!);
        Assert.Equal(400, codec.Info.Width);

        Assert.Contains(snapshot.Results, r => r.Outcome == JobOutcome.Failed && r.RelativePath == "broken.jpg");
        Assert.All(snapshot.Workers, w => Assert.Equal(WorkerState.Finished, w.State));
    }

    [Fact]
    public void Pause_freezes_progress_and_resume_continues()
    {
        _engine.Start(Settings(workers: 2, latencyMs: 400));
        WaitFor(s => s.Workers.Any(w => w.State == WorkerState.Working));

        Assert.True(_engine.Pause());
        Thread.Sleep(150); // let workers reach their next checkpoint
        var frozen = _engine.GetSnapshot();
        Thread.Sleep(600);
        var later = _engine.GetSnapshot();

        Assert.Equal(EngineStatus.Paused, later.Status);
        Assert.Equal(frozen.ResultCount, later.ResultCount);
        Assert.Equal(frozen.Workers.Select(w => w.Progress), later.Workers.Select(w => w.Progress));

        Assert.True(_engine.Resume());
        var done = WaitFor(s => s.Status == EngineStatus.Completed);
        Assert.Equal(6, done.ResultCount);
        Assert.Single(done.Pauses);
        Assert.NotNull(done.Pauses[0].EndMs);
    }

    [Fact]
    public void Stop_cancels_pending_work_and_leaves_no_partial_files()
    {
        _engine.Start(Settings(workers: 2, latencyMs: 2000));
        WaitFor(s => s.Workers.Any(w => w.State == WorkerState.Working) && s.Stats.Discovered == 6);

        Assert.True(_engine.Stop());
        var stopped = WaitFor(s => s.Status == EngineStatus.Stopped);

        Assert.Equal(6, stopped.Stats.Succeeded + stopped.Stats.Failed + stopped.Stats.Cancelled);
        Assert.True(stopped.Stats.Cancelled >= 4);
        Assert.Empty(Directory.Exists(_output) ? Directory.GetFiles(_output, "*.part", SearchOption.AllDirectories) : []);
    }

    [Fact]
    public void A_second_start_while_running_is_rejected()
    {
        _engine.Start(Settings(workers: 1, latencyMs: 1000));

        Assert.Throws<InvalidOperationException>(() => _engine.Start(Settings(workers: 1)));
    }

    [Fact]
    public void Output_inside_source_is_rejected()
    {
        var settings = Settings(workers: 1) with { OutputFolder = Path.Combine(_source, "out") };

        Assert.Throws<ArgumentException>(() => _engine.Start(settings));
    }

    private RunSettings Settings(int workers, int latencyMs = 0) => new()
    {
        SourceFolder = _source,
        OutputFolder = _output,
        WorkerCount = workers,
        SimulatedLatencyMs = latencyMs,
        Resize = new ResizeOptions { Width = 400, Height = 300 },
    };

    private EngineSnapshot WaitFor(Func<EngineSnapshot, bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (DateTime.UtcNow < deadline)
        {
            var snapshot = _engine.GetSnapshot();
            if (condition(snapshot)) return snapshot;
            Thread.Sleep(20);
        }

        throw new TimeoutException($"Engine never reached the expected state (status {_engine.Status}).");
    }

    private void WriteImage(string relativePath, int width, int height)
    {
        var path = Path.Combine(_source, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap)) canvas.Clear(new SKColor((byte)(width % 255), 90, 140));

        var format = Path.GetExtension(path) switch
        {
            ".png" => SKEncodedImageFormat.Png,
            ".webp" => SKEncodedImageFormat.Webp,
            _ => SKEncodedImageFormat.Jpeg,
        };
        using var data = bitmap.Encode(format, 90);
        using var stream = File.Create(path);
        data.SaveTo(stream);
    }

    public void Dispose()
    {
        _engine.Dispose();
        Thread.Sleep(100);
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
        }
    }
}
