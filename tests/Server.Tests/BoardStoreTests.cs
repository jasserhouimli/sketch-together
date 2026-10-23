using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SketchTogether.Server.Features.Boards;

namespace Server.Tests;

public sealed class BoardStoreTests : IAsyncLifetime
{
    private SqliteConnection _conn = null!;
    private BoardsDbContext _db = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        await _conn.OpenAsync();
        _db = new BoardsDbContext(
            new DbContextOptionsBuilder<BoardsDbContext>().UseSqlite(_conn).Options);
        await _db.Database.EnsureCreatedAsync();
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    [Fact]
    public async Task Can_save_and_reload_items_json()
    {
        var id = BoardIds.Generate();
        _db.Boards.Add(new Board { Id = id, ItemsJson = """[{"id":"s1","type":"stroke"}]""" });
        await _db.SaveChangesAsync();

        await using var fresh = new BoardsDbContext(
            new DbContextOptionsBuilder<BoardsDbContext>().UseSqlite(_conn).Options);
        var row = await fresh.Boards.FindAsync([id]);
        Assert.NotNull(row);
        Assert.Contains("stroke", row.ItemsJson);
        Assert.True(row.CreatedAt <= DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task Stores_only_the_edit_key_hash()
    {
        var id = BoardIds.Generate();
        var editKey = BoardAccess.GenerateEditKey();
        _db.Boards.Add(new Board { Id = id, EditKeyHash = BoardAccess.HashEditKey(editKey) });
        await _db.SaveChangesAsync();

        await using var fresh = new BoardsDbContext(
            new DbContextOptionsBuilder<BoardsDbContext>().UseSqlite(_conn).Options);
        var row = await fresh.Boards.FindAsync([id]);

        Assert.NotNull(row);
        Assert.NotEqual(editKey, row.EditKeyHash);
        Assert.Equal(BoardAccess.HashEditKey(editKey), row.EditKeyHash);
        Assert.True(BoardAccess.Verify(editKey, row.EditKeyHash));
    }
}

public sealed class BoardIdTests
{
    [Fact]
    public void Generated_ids_are_valid_and_unique()
    {
        var a = BoardIds.Generate();
        var b = BoardIds.Generate();
        Assert.NotEqual(a, b);
        Assert.True(BoardIds.IsValid(a));
        Assert.Equal(12, a.Length);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("with space12")]
    [InlineData("UPPERCASE12ab")]
    [InlineData("012345678901")] // 0/1 excluded from the alphabet
    public void Rejects_bad_ids(string? id) => Assert.False(BoardIds.IsValid(id));
}
