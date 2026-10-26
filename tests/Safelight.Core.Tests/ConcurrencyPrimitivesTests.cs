using System.Collections.Concurrent;
using Safelight.Core.Concurrency;

namespace Safelight.Core.Tests;

public class ConcurrencyPrimitivesTests
{
    [Fact]
    public void Queue_delivers_every_item_exactly_once_to_concurrent_consumers()
    {
        const int producers = 4, perProducer = 5000, consumers = 8;
        using var queue = new JobQueue<int>();
        var taken = new ConcurrentBag<int>();

        var consumerThreads = Enumerable.Range(0, consumers).Select(_ => new Thread(() =>
        {
            while (queue.TryTake(out var item, CancellationToken.None)) taken.Add(item);
        })).ToArray();
        var producerThreads = Enumerable.Range(0, producers).Select(p => new Thread(() =>
        {
            for (var i = 0; i < perProducer; i++) queue.TryEnqueue(p * perProducer + i);
        })).ToArray();

        foreach (var t in consumerThreads.Concat(producerThreads)) t.Start();
        foreach (var t in producerThreads) t.Join();
        queue.CompleteAdding();

        // Every consumer must exit on its own once the queue is complete: a hang here is a lost wake-up.
        Assert.All(consumerThreads, t => Assert.True(t.Join(TimeSpan.FromSeconds(10))));
        Assert.Equal(producers * perProducer, taken.Count);
        Assert.Equal(producers * perProducer, taken.Distinct().Count());
    }

    [Fact]
    public void Drain_returns_pending_items_and_releases_waiting_consumers()
    {
        using var queue = new JobQueue<int>();
        foreach (var i in Enumerable.Range(1, 5)) queue.TryEnqueue(i);

        var drained = queue.Drain();
        var consumer = new Thread(() => queue.TryTake(out _, CancellationToken.None));
        consumer.Start();

        Assert.Equal([1, 2, 3, 4, 5], drained);
        Assert.True(consumer.Join(TimeSpan.FromSeconds(5)));
        Assert.False(queue.TryEnqueue(6));
    }

    [Fact]
    public void Cancellation_unblocks_a_waiting_consumer()
    {
        using var queue = new JobQueue<int>();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

        Assert.ThrowsAny<OperationCanceledException>(() => queue.TryTake(out _, cts.Token));
    }

    [Fact]
    public void Concurrent_claims_for_the_same_output_path_never_collide()
    {
        var registry = new OutputPathRegistry();
        var claimed = new ConcurrentBag<string>();

        Parallel.For(0, 200, _ => claimed.Add(registry.Claim(Path.Combine("out", "cat.jpg"))));

        Assert.Equal(200, claimed.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.Contains(Path.Combine("out", "cat.jpg"), claimed);
        Assert.Contains(Path.Combine("out", "cat (2).jpg"), claimed);
    }

    [Fact]
    public void Pause_gate_blocks_until_resumed()
    {
        using var gate = new PauseGate();
        gate.Pause();
        var passed = new ManualResetEventSlim();

        var worker = new Thread(() =>
        {
            gate.WaitWhilePaused(CancellationToken.None);
            passed.Set();
        });
        worker.Start();

        Assert.False(passed.Wait(200));
        gate.Resume();
        Assert.True(passed.Wait(TimeSpan.FromSeconds(5)));
    }
}
