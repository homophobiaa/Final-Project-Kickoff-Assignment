using System.Diagnostics.CodeAnalysis;

namespace Safelight.Core.Concurrency;

/// <summary>
/// Unbounded multi-producer / multi-consumer queue shared by the folder scanner and the workers.
/// </summary>
/// <remarks>
/// A <see cref="Lock"/> guards the underlying <see cref="Queue{T}"/>. Consumers never wait while
/// holding that lock: a <see cref="SemaphoreSlim"/> counts "reasons to wake up" (one permit per
/// enqueued item, plus one when adding is completed), so a worker blocks on the semaphore first and
/// only takes the lock for the few instructions it needs to dequeue.
/// <para>
/// Every permit holder either dequeues an item or observes "empty and completed". In the second case
/// it hands its permit on, so the completion signal cascades through all waiting workers and each of
/// them exits exactly once.
/// </para>
/// </remarks>
public sealed class JobQueue<T> : IDisposable
{
    private readonly Lock _lock = new();
    private readonly Queue<T> _items = new();
    private readonly SemaphoreSlim _available = new(0);
    private bool _addingCompleted;

    public int Count
    {
        get { lock (_lock) return _items.Count; }
    }

    public bool IsAddingCompleted
    {
        get { lock (_lock) return _addingCompleted; }
    }

    /// <summary>Adds an item. Returns false once the queue has been completed or drained.</summary>
    public bool TryEnqueue(T item)
    {
        lock (_lock)
        {
            if (_addingCompleted) return false;
            _items.Enqueue(item);
        }

        // Released outside the lock: a woken consumer immediately needs the lock we would still hold.
        _available.Release();
        return true;
    }

    /// <summary>Signals that no more items will be added. Consumers exit once the queue is empty.</summary>
    public void CompleteAdding()
    {
        lock (_lock)
        {
            if (_addingCompleted) return;
            _addingCompleted = true;
        }

        _available.Release();
    }

    /// <summary>
    /// Blocks until an item is available. Returns false when the queue is empty and completed.
    /// Throws <see cref="OperationCanceledException"/> if <paramref name="cancellationToken"/> fires while waiting.
    /// </summary>
    public bool TryTake([MaybeNullWhen(false)] out T item, CancellationToken cancellationToken)
    {
        while (true)
        {
            _available.Wait(cancellationToken);

            lock (_lock)
            {
                if (_items.TryDequeue(out item)) return true;

                if (_addingCompleted)
                {
                    _available.Release();
                    return false;
                }
            }
        }
    }

    /// <summary>Removes every pending item and completes the queue in one atomic step (used by Stop).</summary>
    public IReadOnlyList<T> Drain()
    {
        List<T> drained;
        bool wasCompleted;

        lock (_lock)
        {
            drained = [.. _items];
            _items.Clear();
            wasCompleted = _addingCompleted;
            _addingCompleted = true;
        }

        if (!wasCompleted) _available.Release();
        return drained;
    }

    /// <summary>Consistent view of the queue: the total count and the first <paramref name="max"/> items.</summary>
    public (int Count, T[] Head) Peek(int max)
    {
        lock (_lock)
        {
            return (_items.Count, _items.Take(max).ToArray());
        }
    }

    public void Dispose() => _available.Dispose();
}
