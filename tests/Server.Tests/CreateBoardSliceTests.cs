using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Server.Tests;

public sealed class CreateBoardSliceTests : IAsyncLifetime
{
    private SqliteConnection _conn = null!;
    private BoardsDbContext _db = null!;
    private CreateBoardHandler _handler = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        await _conn.OpenAsync();
        _db = new BoardsDbContext(
            new DbContextOptionsBuilder<BoardsDbContext>().UseSqlite(_conn).Options);
        await _db.Database.EnsureCreatedAsync();
        _handler = new CreateBoardHandler(_db);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    [Fact]
    public async Task CreateBoard_Generates_Valid_Board_And_Secure_Edit_Key()
    {
        var result = await _handler.HandleAsync();

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.True(BoardIds.IsValid(result.Value.Id));
        Assert.True(BoardAccess.IsEditKey(result.Value.EditKey));

        var stored = await _db.Boards.FindAsync([result.Value.Id]);
        Assert.NotNull(stored);
        Assert.True(BoardAccess.Verify(result.Value.EditKey, stored.EditKeyHash));
    }
}
