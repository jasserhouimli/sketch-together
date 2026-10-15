using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace SketchTogether.Server.Features.Boards;

/// <summary>
/// One room per board. Clients join, send validated actions, and receive
/// accepted actions from others. Server order is the order: a per-board lock
/// serializes load-apply-save-broadcast; actionIds dedupe redeliveries.
/// Presence is connection counts per room (no names in v1).
/// </summary>
public sealed class BoardHub(BoardsDbContext db) : Hub
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new();
    private static readonly object PresenceLock = new();
    private static readonly Dictionary<string, HashSet<string>> Members = new();
    private static readonly Dictionary<string, HashSet<string>> SeenActions = new();

    /// <summary>Join result: current items plus participant count.</summary>
    public async Task<JoinResult> JoinBoard(string boardId)
    {
        if (!BoardIds.IsValid(boardId))
            throw new HubException("Board id must be 12 lowercase letters/digits.");
        if (!await db.Boards.AnyAsync(b => b.Id == boardId))
            throw new HubException("No board with that link.");

        await Groups.AddToGroupAsync(Context.ConnectionId, Room(boardId));
        lock (PresenceLock)
        {
            if (!Members.TryGetValue(boardId, out var set))
                Members[boardId] = set = [];
            set.Add(Context.ConnectionId);
        }
        await Clients.Group(Room(boardId)).SendAsync("PresenceChanged", Count(boardId));

        var row = await db.Boards.FindAsync([boardId]);
        return new JoinResult(BoardDto.From(row!).Items.GetRawText(), Count(boardId));
    }

    /// <summary>Applies one action; returns the save timestamp as the ack.</summary>
    public async Task<DateTimeOffset> SendAction(BoardActionEnvelope envelope)
    {
        var gate = await Locks.GetOrAdd(envelope.BoardId, _ => new SemaphoreSlim(1, 1))
            .WaitAsync(TimeSpan.FromSeconds(10));
        if (!gate) throw new HubException("Server is busy; retry the action.");
        try
        {
            return await ApplyAsync(envelope);
        }
        finally
        {
            Locks[envelope.BoardId].Release();
        }
    }

    private async Task<DateTimeOffset> ApplyAsync(BoardActionEnvelope envelope)
    {
        var check = BoardActionValidator.Validate(
            JoinedBoard() ?? throw new HubException("Join a board before sending actions."),
            envelope);
        if (!check.IsSuccess) throw new HubException(check.Error!);

        bool duplicate;
        lock (PresenceLock)
        {
            if (!SeenActions.TryGetValue(envelope.BoardId, out var seen))
                SeenActions[envelope.BoardId] = seen = [];
            duplicate = !seen.Add(envelope.ActionId);
            if (!duplicate && seen.Count > 5000) seen.Clear(); // bounded memory; refresh heals gaps
        }
        if (duplicate)
        {
            // Redelivery: already applied — ack with the current save time.
            return await db.Boards.Where(b => b.Id == envelope.BoardId)
                .Select(b => b.UpdatedAt).FirstOrDefaultAsync();
        }

        var row = await db.Boards.FindAsync([envelope.BoardId]);
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

        await Clients.OthersInGroup(Room(envelope.BoardId)).SendAsync("ReceiveAction", new
        {
            actionId = envelope.ActionId,
            type = check.Value!.Type,
            item = check.Value.Item,
        });
        return row.UpdatedAt;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        string? boardId = null;
        lock (PresenceLock)
        {
            foreach (var (room, members) in Members)
            {
                if (members.Remove(Context.ConnectionId))
                {
                    boardId = room;
                    break;
                }
            }
        }
        if (boardId is not null)
            await Clients.Group(Room(boardId)).SendAsync("PresenceChanged", Count(boardId));
        await base.OnDisconnectedAsync(exception);
    }

    private string? JoinedBoard()
    {
        lock (PresenceLock)
        {
            foreach (var (room, members) in Members)
            {
                if (members.Contains(Context.ConnectionId)) return room;
            }
            return null;
        }
    }

    private static int Count(string boardId)
    {
        lock (PresenceLock)
        {
            return Members.TryGetValue(boardId, out var set) ? set.Count : 0;
        }
    }

    private static string Room(string boardId) => $"board:{boardId}";

    public sealed record JoinResult(string ItemsJson, int ParticipantCount);
}
