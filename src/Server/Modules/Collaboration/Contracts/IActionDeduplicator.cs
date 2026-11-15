namespace SketchTogether.Server.Modules.Collaboration.Contracts;

/// <summary>
/// Deduplicates incoming client action IDs to prevent duplicate mutations during retries.
/// </summary>
public interface IActionDeduplicator
{
    /// <summary>
    /// Returns true if this action is new and tracked; false if it was already processed (duplicate).
    /// </summary>
    bool TryTrack(string boardId, string actionId);
}
