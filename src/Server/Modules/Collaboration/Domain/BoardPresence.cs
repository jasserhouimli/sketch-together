using System.Text;
using SketchTogether.Server.Modules.Collaboration.Contracts;

namespace SketchTogether.Server.Modules.Collaboration.Domain;

/// <summary>
/// One participant per live connection: display name, cursor colour, and the
/// edit permission established at join. Permission is per connection, so a
/// reconnect re-checks the edit key.
/// </summary>
public sealed record Participant(string ConnectionId, string Name, string Color, bool CanEdit);

/// <summary>Which board a connection is in, with its participant record.</summary>
public sealed record Membership(string BoardId, Participant Participant);

/// <summary>
/// Ephemeral presence for live rooms: who is connected, their display name and
/// cursor colour. Nothing here is persisted — a restart drops presence and every
/// client re-joins.
/// </summary>
public sealed class BoardPresence : IBoardPresenceTracker
{
    public const int MaxNameLength = 24;
    public const string FallbackName = "Guest";

    /// <summary>Cursor colours, chosen to stay distinct from the pen palette.</summary>
    private static readonly string[] Colors =
    [
        "#1971c2", "#e03131", "#2f9e44", "#9c36b5",
        "#f08c00", "#0c8599", "#c2255c", "#495057",
    ];

    private readonly object _gate = new();
    private readonly Dictionary<string, List<Participant>> _rooms = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _boardByConnection = new(StringComparer.Ordinal);

    public Participant Join(string boardId, string connectionId, string? requestedName, bool canEdit)
    {
        var participant = new Participant(
            connectionId, SanitizeName(requestedName), ColorFor(connectionId), canEdit);
        lock (_gate)
        {
            RemoveLocked(connectionId);
            if (!_rooms.TryGetValue(boardId, out var members))
                _rooms[boardId] = members = [];
            members.Add(participant);
            _boardByConnection[connectionId] = boardId;
        }
        return participant;
    }

    public string? Rename(string connectionId, string? requestedName)
    {
        lock (_gate)
        {
            if (!_boardByConnection.TryGetValue(connectionId, out var boardId)) return null;
            if (!_rooms.TryGetValue(boardId, out var members)) return null;
            var index = members.FindIndex(m => m.ConnectionId == connectionId);
            if (index < 0) return null;
            members[index] = members[index] with { Name = SanitizeName(requestedName) };
            return boardId;
        }
    }

    public string? Leave(string connectionId)
    {
        lock (_gate)
        {
            var boardId = _boardByConnection.GetValueOrDefault(connectionId);
            RemoveLocked(connectionId);
            return boardId;
        }
    }

    public Membership? Find(string connectionId)
    {
        lock (_gate)
        {
            if (!_boardByConnection.TryGetValue(connectionId, out var boardId)) return null;
            var members = _rooms[boardId];
            var index = members.FindIndex(m => m.ConnectionId == connectionId);
            return index < 0 ? null : new Membership(boardId, members[index]);
        }
    }

    public IReadOnlyList<Participant> Roster(string boardId)
    {
        lock (_gate)
        {
            return _rooms.TryGetValue(boardId, out var members) ? members.ToArray() : [];
        }
    }

    public static string SanitizeName(string? requested)
    {
        if (string.IsNullOrWhiteSpace(requested)) return FallbackName;
        var cleaned = new StringBuilder(Math.Min(requested.Length, MaxNameLength));
        var pendingSpace = false;
        foreach (var ch in requested)
        {
            if (char.IsControl(ch)) continue;
            if (char.IsWhiteSpace(ch))
            {
                pendingSpace = cleaned.Length > 0;
                continue;
            }
            if (pendingSpace)
            {
                cleaned.Append(' ');
                pendingSpace = false;
            }
            cleaned.Append(ch);
            if (cleaned.Length == MaxNameLength) break;
        }
        var name = cleaned.ToString();
        return name.Length == 0 ? FallbackName : name;
    }

    public static string ColorFor(string connectionId)
    {
        var hash = 2166136261u;
        unchecked
        {
            foreach (var ch in connectionId) hash = (hash ^ ch) * 16777619u;
        }
        return Colors[(int)(hash % (uint)Colors.Length)];
    }

    private void RemoveLocked(string connectionId)
    {
        if (!_boardByConnection.Remove(connectionId, out var boardId)) return;
        if (!_rooms.TryGetValue(boardId, out var members)) return;
        members.RemoveAll(m => m.ConnectionId == connectionId);
        if (members.Count == 0) _rooms.Remove(boardId);
    }
}
