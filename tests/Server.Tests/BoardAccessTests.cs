using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SketchTogether.Server.Features.Boards;

namespace Server.Tests;

public sealed class BoardAccessTests
{
    [Fact]
    public void Generates_distinct_lowercase_hex_keys()
    {
        var first = BoardAccess.GenerateEditKey();
        var second = BoardAccess.GenerateEditKey();

        Assert.NotEqual(first, second);
        Assert.Equal(BoardAccess.EditKeyLength, first.Length);
        Assert.True(BoardAccess.IsEditKey(first));
        Assert.All(first, c => Assert.True(char.IsAsciiHexDigitLower(c)));
    }

    [Fact]
    public void Hashes_deterministically_and_does_not_keep_the_key()
    {
        var key = BoardAccess.GenerateEditKey();
        var hash = BoardAccess.HashEditKey(key);

        Assert.Equal(BoardAccess.HashLength, hash.Length);
        Assert.NotEqual(key, hash);
        Assert.Equal(hash, BoardAccess.HashEditKey(key));
        Assert.True(BoardAccess.Verify(key, hash));
    }

    [Theory]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde")]
    [InlineData("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefa")]
    [InlineData("ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789")]
    [InlineData("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")]
    public void Rejects_malformed_keys(string key)
    {
        Assert.False(BoardAccess.IsEditKey(key));
        Assert.False(BoardAccess.Verify(key, BoardAccess.HashEditKey("valid")));
    }

    [Fact]
    public void Rejects_a_missing_or_malformed_stored_hash()
    {
        var key = BoardAccess.GenerateEditKey();

        Assert.False(BoardAccess.Verify(key, null));
        Assert.False(BoardAccess.Verify(key, ""));
        Assert.False(BoardAccess.Verify(key, "not-a-hash"));
        Assert.False(BoardAccess.Verify(key, new string('z', BoardAccess.HashLength)));
    }

    [Fact]
    public void Rejects_the_wrong_key()
    {
        var key = BoardAccess.GenerateEditKey();
        var other = BoardAccess.GenerateEditKey();

        Assert.False(BoardAccess.Verify(other, BoardAccess.HashEditKey(key)));
    }

    [Fact]
    public void CheckEditKey_classifies_access()
    {
        var key = BoardAccess.GenerateEditKey();
        var board = new Board { EditKeyHash = BoardAccess.HashEditKey(key) };

        Assert.Equal(BoardEditAccess.Granted, BoardAccess.CheckEditKey(board, key));
        Assert.Equal(BoardEditAccess.Missing, BoardAccess.CheckEditKey(board, null));
        Assert.Equal(BoardEditAccess.Invalid, BoardAccess.CheckEditKey(board, "not-a-key"));
        Assert.Equal(
            BoardEditAccess.Invalid,
            BoardAccess.CheckEditKey(board, BoardAccess.GenerateEditKey()));
    }

    [Fact]
    public void CheckEditKey_treats_a_board_without_a_hash_as_legacy_open()
    {
        var legacy = new Board();

        Assert.Equal(BoardEditAccess.LegacyOpen, BoardAccess.CheckEditKey(legacy, null));
        Assert.Equal(BoardEditAccess.LegacyOpen, BoardAccess.CheckEditKey(legacy, "anything"));
    }
}

public sealed class BoardSchemaTests : IAsyncLifetime
{
    private const string LegacyBoardId = "aaaaaaaaaaaa";
    private SqliteConnection _conn = null!;
    private BoardsDbContext _db = null!;

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        await _conn.OpenAsync();
        _db = new BoardsDbContext(
            new DbContextOptionsBuilder<BoardsDbContext>().UseSqlite(_conn).Options);

        // A database created before edit links existed: no EditKeyHash column.
        await _db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE "Boards" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Boards" PRIMARY KEY,
                "ItemsJson" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "UpdatedAt" TEXT NOT NULL
            );
            """);
        await _db.Database.ExecuteSqlRawAsync(
            $"INSERT INTO \"Boards\" (\"Id\", \"ItemsJson\", \"CreatedAt\", \"UpdatedAt\") " +
            $"VALUES ('{LegacyBoardId}', '[]', '2026-01-01 00:00:00+00:00', '2026-01-01 00:00:00+00:00');");
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _conn.DisposeAsync();
    }

    [Fact]
    public async Task Adds_the_column_to_a_legacy_database_and_is_idempotent()
    {
        Assert.False(await HasEditKeyColumnAsync());

        BoardSchema.EnsureEditKeyColumn(_db);
        BoardSchema.EnsureEditKeyColumn(_db);

        Assert.True(await HasEditKeyColumnAsync());
    }

    [Fact]
    public async Task Legacy_rows_read_as_open_with_their_items_intact()
    {
        BoardSchema.EnsureEditKeyColumn(_db);

        var row = await _db.Boards
            .Where(b => b.Id == LegacyBoardId)
            .Select(b => new { b.EditKeyHash, b.ItemsJson })
            .SingleAsync();

        Assert.Null(row.EditKeyHash);
        Assert.Equal("[]", row.ItemsJson);
    }

    private async Task<bool> HasEditKeyColumnAsync()
    {
        await using var check = _conn.CreateCommand();
        check.CommandText = "PRAGMA table_info(\"Boards\");";
        await using var reader = await check.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            if (string.Equals(reader.GetString(1), "EditKeyHash", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }
}
