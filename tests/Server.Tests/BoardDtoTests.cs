using System.Text.Json;
using SketchTogether.Server.Features.Boards;

namespace Server.Tests;

public sealed class BoardDtoTests
{
    [Fact]
    public void Parses_stored_items()
    {
        var dto = BoardDto.From(new Board { Id = "abc", ItemsJson = """[{"id":"s1"}]""" });
        Assert.Equal("abc", dto.Id);
        Assert.Equal(JsonValueKind.Array, dto.Items.ValueKind);
        Assert.Equal(1, dto.Items.GetArrayLength());
    }

    [Fact]
    public void Corrupt_rows_read_as_empty()
    {
        var dto = BoardDto.From(new Board { Id = "abc", ItemsJson = "not json{{{" });
        Assert.Equal(JsonValueKind.Array, dto.Items.ValueKind);
        Assert.Equal(0, dto.Items.GetArrayLength());
    }
}
