using SketchTogether.Server.Modules.Collaboration.Contracts;

namespace SketchTogether.Server.Modules.Collaboration.Services;

public sealed class InMemoryActionDeduplicator : IActionDeduplicator
{
    private const int MaxTrackedActionsPerBoard = 5000;
    private readonly object _gate = new();
    private readonly Dictionary<string, HashSet<string>> _seenActions = new(StringComparer.Ordinal);

    public bool TryTrack(string boardId, string actionId)
    {
        lock (_gate)
        {
            if (!_seenActions.TryGetValue(boardId, out var seen))
            {
                _seenActions[boardId] = seen = new HashSet<string>(StringComparer.Ordinal);
            }

            var isNew = seen.Add(actionId);
            if (isNew && seen.Count > MaxTrackedActionsPerBoard)
            {
                seen.Clear();
            }

            return isNew;
        }
    }
}
