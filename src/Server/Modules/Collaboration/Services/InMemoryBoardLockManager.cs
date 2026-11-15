using System.Collections.Concurrent;
using SketchTogether.Server.Modules.Collaboration.Contracts;

namespace SketchTogether.Server.Modules.Collaboration.Services;

public sealed class InMemoryBoardLockManager : IBoardLockManager
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();

    public async Task<IDisposable?> AcquireLockAsync(string boardId, TimeSpan timeout, CancellationToken ct = default)
    {
        var semaphore = _locks.GetOrAdd(boardId, _ => new SemaphoreSlim(1, 1));
        var acquired = await semaphore.WaitAsync(timeout, ct);
        if (!acquired) return null;

        return new Releaser(semaphore);
    }

    private sealed class Releaser(SemaphoreSlim semaphore) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0)
            {
                semaphore.Release();
            }
        }
    }
}
