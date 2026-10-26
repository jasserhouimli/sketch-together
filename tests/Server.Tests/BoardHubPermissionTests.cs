using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SketchTogether.Server.Features.Boards;

namespace Server.Tests;

/// <summary>
/// The hub is the write boundary: a view link must not reach persistence. These
/// tests drive the real hub methods with a minimal SignalR context, so the
/// permission check is exercised where it actually runs, not just in isolation.
/// </summary>
public sealed class BoardHubPermissionTests : IAsyncLifetime
{
    private readonly string _boardId = BoardIds.Generate();
    private readonly string _editKey = BoardAccess.GenerateEditKey();

    private SqliteConnection _conn = null!;
    private BoardsDbContext _db = null!;
    private BoardHub _hub = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        await _conn.OpenAsync();
        _db = new BoardsDbContext(
            new DbContextOptionsBuilder<BoardsDbContext>().UseSqlite(_conn).Options);
        await _db.Database.EnsureCreatedAsync();

        _db.Boards.Add(new Board
        {
            Id = _boardId,
            EditKeyHash = BoardAccess.HashEditKey(_editKey),
        });
        await _db.SaveChangesAsync();

        _hub = new BoardHub(_db)
        {
            Context = new TestContext($"conn-{Guid.NewGuid():N}"),
            Clients = new TestClients(),
            Groups = new TestGroups(),
        };
    }

    [Fact]
    public async Task A_view_connection_cannot_change_the_board()
    {
        var joined = await _hub.JoinBoard(_boardId, "Viewer", editKey: null);
        Assert.False(joined.CanEdit);

        var error = await Assert.ThrowsAsync<HubException>(() =>
            _hub.SendAction(AddNote("viewer-cannot-write")));

        Assert.Contains("view-only", error.Message);
        var row = await _db.Boards.AsNoTracking().SingleAsync(b => b.Id == _boardId);
        Assert.Equal("[]", row.ItemsJson);
    }

    [Fact]
    public async Task An_edit_connection_can_change_the_board()
    {
        var joined = await _hub.JoinBoard(_boardId, "Editor", _editKey);
        Assert.True(joined.CanEdit);

        await _hub.SendAction(AddNote("editor-can-write"));

        var row = await _db.Boards.AsNoTracking().SingleAsync(b => b.Id == _boardId);
        Assert.Contains("editor-note", row.ItemsJson);
    }

    private BoardActionEnvelope AddNote(string actionId) => new(
        _boardId,
        actionId,
        BoardActionTypes.NoteAdd,
        JsonSerializer.SerializeToElement(new
        {
            id = "editor-note",
            type = "note",
            x = 0.5,
            y = 0.5,
            text = "hi",
            color = "#ffffff",
        }));

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    private sealed class TestContext(string connectionId) : HubCallerContext
    {
        public override string ConnectionId { get; } = connectionId;
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User => null;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;

        public override void Abort() { }
    }

    private sealed class TestClients : IHubCallerClients
    {
        private static readonly IClientProxy Proxy = new TestClientProxy();

        public IClientProxy All => Proxy;
        public IClientProxy Caller => Proxy;
        public IClientProxy Others => Proxy;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => Proxy;
        public IClientProxy Client(string connectionId) => Proxy;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => Proxy;
        public IClientProxy Group(string groupName) => Proxy;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Proxy;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => Proxy;
        public IClientProxy OthersInGroup(string groupName) => Proxy;
        public IClientProxy User(string userId) => Proxy;
        public IClientProxy Users(IReadOnlyList<string> userIds) => Proxy;
    }

    private sealed class TestClientProxy : IClientProxy
    {
        public Task SendCoreAsync(
            string method,
            object?[] args,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class TestGroups : IGroupManager
    {
        public Task AddToGroupAsync(
            string connectionId,
            string groupName,
            CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task RemoveFromGroupAsync(
            string connectionId,
            string groupName,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
