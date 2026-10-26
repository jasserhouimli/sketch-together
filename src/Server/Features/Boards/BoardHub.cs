using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace SketchTogether.Server.Features.Boards;

/// <summary>
/// One room per board. Clients join, send validated actions, and receive
/// accepted actions from others. Server order is the order: a per-board lock
/// serializes load-apply-save-broadcast; actionIds dedupe redeliveries.
///
/// Two channels share the connection:
/// - durable: <see cref="SendAction"/>, validated and persisted, then broadcast;
/// - ephemeral: cursors and drag previews, relayed to the room and never stored;
///   display names are presence only, so a rename never touches the board row.
///   Losing one is invisible; the durable action on release is the truth.
/// </summary>
public sealed class BoardHub(BoardsDbContext db) : Hub
{
    /// <summary>Longest note id we will relay a drag preview for.</summary>
    private const int MaxRelayedIdLength = 100;

    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new();
    private static readonly BoardPresence Presence = new();
    private static readonly object SeenLock = new();
    private static readonly Dictionary<string, HashSet<string>> SeenActions = new();

    /// <summary>
    /// Join result: current items, the caller's id, the roster, and whether the
    /// connection may change the board. The view link joins read-only; editing
    /// needs the key from the edit link.
    /// </summary>
    public async Task<JoinResult> JoinBoard(string boardId, string? displayName, string? editKey)
    {
        if (!BoardIds.IsValid(boardId))
            throw new HubException("Board id must be 12 lowercase letters/digits.");

        var row = await db.Boards.FindAsync([boardId]);
        if (row is null) throw new HubException("No board with that link.");

        var access = BoardAccess.CheckEditKey(row, editKey);
        // A link that carries a bad key is an error rather than a silent
        // downgrade to viewing, so a truncated/edited link is obvious.
        if (access is BoardEditAccess.Invalid)
            throw new HubException("That edit link is not valid.");
        var canEdit = access is BoardEditAccess.LegacyOpen or BoardEditAccess.Granted;

        await Groups.AddToGroupAsync(Context.ConnectionId, Room(boardId));
        Presence.Join(boardId, Context.ConnectionId, displayName, canEdit);
        await BroadcastRosterAsync(boardId);

        return new JoinResult(
            row.ItemsJson, Context.ConnectionId, RosterDto(boardId), canEdit);
    }

    /// <summary>
    /// Changes the caller's display name and re-broadcasts the roster, so the
    /// room and its cursors pick it up. Names are cosmetic: sanitized like a
    /// join, never persisted, and no other participant's state is touched.
    /// </summary>
    public async Task Rename(string? displayName)
    {
        var boardId = Presence.Rename(Context.ConnectionId, displayName);
        if (boardId is not null) await BroadcastRosterAsync(boardId);
    }

    /// <summary>Applies one action; returns the save timestamp as the ack.</summary>
    public async Task<DateTimeOffset> SendAction(BoardActionEnvelope envelope)
    {
        var membership = Presence.Find(Context.ConnectionId)
            ?? throw new HubException("Join a board before sending actions.");
        if (!membership.Participant.CanEdit)
            throw new HubException("This board is view-only; open its edit link to make changes.");

        var boardId = membership.BoardId;
        var gate = await Locks.GetOrAdd(boardId, _ => new SemaphoreSlim(1, 1))
            .WaitAsync(TimeSpan.FromSeconds(10));
        if (!gate) throw new HubException("Server is busy; retry the action.");
        try
        {
            return await ApplyAsync(envelope, boardId);
        }
        finally
        {
            Locks[boardId].Release();
        }
    }

    /// <summary>
    /// Relays the caller's cursor to the rest of the room. Ephemeral: a dropped
    /// frame is invisible, so out-of-range input is ignored rather than thrown.
    /// </summary>
    public async Task UpdateCursor(double x, double y)
    {
        if (!TryMembership(out var membership)) return;
        if (!BoardValues.IsUnit(x) || !BoardValues.IsUnit(y)) return;

        var who = membership.Participant;
        await Clients.OthersInGroup(Room(membership.BoardId)).SendAsync("CursorMoved", new
        {
            id = who.ConnectionId,
            name = who.Name,
            color = who.Color,
            x,
            y,
        });
    }

    /// <summary>
    /// Relays an in-progress note drag. Ephemeral on purpose: intermediate
    /// positions are not worth persisting, so a crash mid-drag leaves the note
    /// where it was and the release sends the one durable item.move.
    /// </summary>
    public async Task DragPreview(string noteId, double x, double y)
    {
        if (!TryMembership(out var membership)) return;
        if (string.IsNullOrEmpty(noteId) || noteId.Length > MaxRelayedIdLength) return;
        if (!BoardValues.IsUnit(x) || !BoardValues.IsUnit(y)) return;

        await Clients.OthersInGroup(Room(membership.BoardId)).SendAsync("DragPreviewMoved", new
        {
            id = membership.Participant.ConnectionId,
            noteId,
            x,
            y,
        });
    }

    private async Task<DateTimeOffset> ApplyAsync(BoardActionEnvelope envelope, string boardId)
    {
        var check = BoardActionValidator.Validate(boardId, envelope);
        if (!check.IsSuccess) throw new HubException(check.Error!);

        bool duplicate;
        lock (SeenLock)
        {
            if (!SeenActions.TryGetValue(boardId, out var seen))
                SeenActions[boardId] = seen = [];
            duplicate = !seen.Add(envelope.ActionId);
            if (!duplicate && seen.Count > 5000) seen.Clear(); // bounded memory; refresh heals gaps
        }
        if (duplicate)
        {
            // Redelivery: already applied — ack with the current save time.
            return await db.Boards.Where(b => b.Id == boardId)
                .Select(b => b.UpdatedAt).FirstOrDefaultAsync();
        }

        var row = await db.Boards.FindAsync([boardId]);
        if (row is null) throw new HubException("Board no longer exists.");
        JsonArray items;
        try
        {
            items = JsonNode.Parse(row.ItemsJson)?.AsArray() ?? new JsonArray();
        }
        catch (Exception)
        {
            items = new JsonArray(); // corrupt row heals to empty rather than 500
        }
        row.ItemsJson = BoardActionApplier.Apply(items, check.Value!).ToJsonString();
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        await Clients.OthersInGroup(Room(boardId)).SendAsync("ReceiveAction", new
        {
            actionId = envelope.ActionId,
            type = check.Value!.Type,
            item = check.Value.Item,
        });
        return row.UpdatedAt;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var boardId = Presence.Leave(Context.ConnectionId);
        if (boardId is not null) await BroadcastRosterAsync(boardId);
        await base.OnDisconnectedAsync(exception);
    }

    private bool TryMembership(out Membership membership)
    {
        var found = Presence.Find(Context.ConnectionId);
        membership = found!;
        return found is not null;
    }

    private Task BroadcastRosterAsync(string boardId) =>
        Clients.Group(Room(boardId)).SendAsync("PresenceChanged", RosterDto(boardId));

    private static object[] RosterDto(string boardId) =>
        Presence.Roster(boardId)
            .Select(p => new { id = p.ConnectionId, name = p.Name, color = p.Color })
            .ToArray();

    private static string Room(string boardId) => $"board:{boardId}";

    public sealed record JoinResult(
        string ItemsJson, string SelfId, object[] Participants, bool CanEdit);
}
