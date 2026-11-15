namespace SketchTogether.Server.Modules.Collaboration.Contracts;

/// <summary>
/// Manages per-board mutual exclusion to serialize mutations and avoid data races.
/// </summary>
public interface IBoardLockManager
{
    /// <summary>
    /// Acquires an exclusive lock for the specified board, or returns null if timeout expired.
    /// Dispose the returned handle to release the lock.
    /// </summary>
    Task<IDisposable?> AcquireLockAsync(string boardId, TimeSpan timeout, CancellationToken ct = default);
}
