using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Server.Tests;

public sealed class GetBoardSliceTests : IAsyncLifetime
{
    private SqliteConnection _conn = null!;
    private BoardsDbContext _db = null!;
    private GetBoardHandler _handler = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        await _conn.OpenAsync();
        _db = new BoardsDbContext(
            new DbContextOptionsBuilder<BoardsDbContext>().UseSqlite(_conn).Options);
        await _db.Database.EnsureCreatedAsync();
        _handler = new GetBoardHandler(_db);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    [Fact]
    public async Task GetBoard_Returns_ValidationError_When_Id_Is_Invalid()
    {
        var result = await _handler.HandleAsync("invalid-id-!!!");

        Assert.True(result.IsFailure);
        Assert.Equal("Validation", result.Error.Code);
    }

    [Fact]
    public async Task GetBoard_Returns_NotFoundError_When_Board_Does_Not_Exist()
    {
        var result = await _handler.HandleAsync(BoardIds.Generate());

        Assert.True(result.IsFailure);
        Assert.Equal("NotFound", result.Error.Code);
    }

    [Fact]
    public async Task GetBoard_Returns_BoardDto_When_Board_Exists()
    {
        var id = BoardIds.Generate();
        _db.Boards.Add(new Board { Id = id, ItemsJson = """[{"id":"item-1","type":"note"}]""" });
        await _db.SaveChangesAsync();

        var result = await _handler.HandleAsync(id);

        Assert.True(result.IsSuccess);
        Assert.Equal(id, result.Value.Id);
        Assert.Equal(1, result.Value.Items.GetArrayLength());
    }
}
