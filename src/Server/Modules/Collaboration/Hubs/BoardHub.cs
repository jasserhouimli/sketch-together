using System.Text.Json.Nodes;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SketchTogether.Server.Modules.Boards.Domain;
using SketchTogether.Server.Modules.Boards.Infrastructure;
using SketchTogether.Server.Modules.Collaboration.Contracts;
using SketchTogether.Server.Modules.Collaboration.Domain;
using SketchTogether.Server.Modules.Collaboration.Services;

namespace SketchTogether.Server.Modules.Collaboration.Hubs;

/// <summary>
/// Real-time gateway hub for collaborative boards.
/// Handles client connections, dispatches mutations to persistence,
/// and broadcasts events to board rooms.
/// </summary>
public sealed class BoardHub : Hub
{
    private const int MaxRelayedIdLength = 100;

    private readonly BoardsDbContext _db;
    private readonly IBoardLockManager _lockManager;
    private readonly IBoardPresenceTracker _presence;
    private readonly IActionDeduplicator _deduplicator;

    // Default shared singletons for backwards compatibility when instantiated directly in tests
    private static readonly IBoardLockManager SharedLockManager = new InMemoryBoardLockManager();
    private static readonly IBoardPresenceTracker SharedPresence = new BoardPresence();
    private static readonly IActionDeduplicator SharedDeduplicator = new InMemoryActionDeduplicator();

    public BoardHub(
        BoardsDbContext db,
        IBoardLockManager? lockManager = null,
        IBoardPresenceTracker? presence = null,
        IActionDeduplicator? deduplicator = null)
    {
        _db = db;
        _lockManager = lockManager ?? SharedLockManager;
        _presence = presence ?? SharedPresence;
        _deduplicator = deduplicator ?? SharedDeduplicator;
    }

    /// <summary>
    /// Join result: current items, caller id, participants, and edit permission.
    /// </summary>
    public async Task<JoinResult> JoinBoard(string boardId, string? displayName, string? editKey)
    {
        if (!BoardIds.IsValid(boardId))
            throw new HubException("Board id must be 12 lowercase letters/digits.");

        var row = await _db.Boards.FindAsync([boardId]);
        if (row is null) throw new HubException("No board with that link.");

        var access = BoardAccess.CheckEditKey(row, editKey);
        if (access is BoardEditAccess.Invalid)
            throw new HubException("That edit link is not valid.");

        var canEdit = access is BoardEditAccess.LegacyOpen or BoardEditAccess.Granted;

        await Groups.AddToGroupAsync(Context.ConnectionId, Room(boardId));
        _presence.Join(boardId, Context.ConnectionId, displayName, canEdit);
        await BroadcastRosterAsync(boardId);

        return new JoinResult(
            row.ItemsJson, Context.ConnectionId, RosterDto(boardId), canEdit);
    }

    /// <summary>
    /// Renames caller and updates the room roster.
    /// </summary>
    public async Task Rename(string? displayName)
    {
        var boardId = _presence.Rename(Context.ConnectionId, displayName);
        if (boardId is not null) await BroadcastRosterAsync(boardId);
    }

    /// <summary>
    /// Validates, serializes, persists, and broadcasts a board action.
    /// </summary>
    public async Task<DateTimeOffset> SendAction(BoardActionEnvelope envelope)
    {
        var membership = _presence.Find(Context.ConnectionId)
            ?? throw new HubException("Join a board before sending actions.");
        if (!membership.Participant.CanEdit)
            throw new HubException("This board is view-only; open its edit link to make changes.");

        var boardId = membership.BoardId;
        using var lockHandle = await _lockManager.AcquireLockAsync(boardId, TimeSpan.FromSeconds(10));
        if (lockHandle is null)
            throw new HubException("Server is busy; retry the action.");

        return await ApplyAsync(envelope, boardId);
    }

    /// <summary>
    /// Relays caller cursor coordinates to peers in the board room.
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
    /// Relays ephemeral note drag previews.
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
        if (!check.IsSuccess) throw new HubException(check.Error.Message);

        var isNewAction = _deduplicator.TryTrack(boardId, envelope.ActionId);
        if (!isNewAction)
        {
            // Duplicate delivery: already applied, return current timestamp
            return await _db.Boards.Where(b => b.Id == boardId)
                .Select(b => b.UpdatedAt).FirstOrDefaultAsync();
        }

        var row = await _db.Boards.FindAsync([boardId]);
        if (row is null) throw new HubException("Board no longer exists.");

        JsonArray items;
        try
        {
            items = JsonNode.Parse(row.ItemsJson)?.AsArray() ?? new JsonArray();
        }
        catch (Exception)
        {
            items = new JsonArray();
        }

        row.ItemsJson = BoardActionApplier.Apply(items, check.Value!).ToJsonString();
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

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
        var boardId = _presence.Leave(Context.ConnectionId);
        if (boardId is not null) await BroadcastRosterAsync(boardId);
        await base.OnDisconnectedAsync(exception);
    }

    private bool TryMembership(out Membership membership)
    {
        var found = _presence.Find(Context.ConnectionId);
        membership = found!;
        return found is not null;
    }

    private Task BroadcastRosterAsync(string boardId) =>
        Clients.Group(Room(boardId)).SendAsync("PresenceChanged", RosterDto(boardId));

    private object[] RosterDto(string boardId) =>
        _presence.Roster(boardId)
            .Select(p => new { id = p.ConnectionId, name = p.Name, color = p.Color })
            .ToArray();

    private static string Room(string boardId) => $"board:{boardId}";

    public sealed record JoinResult(
        string ItemsJson, string SelfId, object[] Participants, bool CanEdit);
}
