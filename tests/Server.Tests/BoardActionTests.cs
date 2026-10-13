using System.Text.Json;
using System.Text.Json.Nodes;
using SketchTogether.Server.Features.Boards;

namespace Server.Tests;

public sealed class BoardActionValidationTests
{
    private static JsonElement Json(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    private static BoardActionEnvelope Env(string type, string itemJson, string board = "board1") =>
        new(board, "action-1", type, Json(itemJson));

    [Fact]
    public void Accepts_spec_shaped_stroke_add()
    {
        var r = BoardActionValidator.Validate("board1", Env("stroke.add",
            """{"id":"stroke-id","color":"#222222","width":4,"points":[{"x":0.15,"y":0.22},{"x":0.16,"y":0.23}]}"""));
        Assert.True(r.IsSuccess);
        Assert.Equal("stroke.add", r.Value!.Type);
        Assert.Equal("stroke-id", r.Value.ItemId);
    }

    [Fact]
    public void Note_add_keeps_its_type()
    {
        var r = BoardActionValidator.Validate("board1", Env("note.add",
            """{"id":"note-id","x":0.35,"y":0.28,"text":"Project idea","color":"#fff2a8"}"""));
        Assert.True(r.IsSuccess);
        Assert.Equal("note.add", r.Value!.Type);
    }

    [Theory]
    [InlineData("nope.unknown")]
    [InlineData("")]
    [InlineData("stroke.Add")]
    public void Rejects_unknown_types(string type)
    {
        var r = BoardActionValidator.Validate("board1", Env(type, "{}"));
        Assert.False(r.IsSuccess);
    }

    [Fact]
    public void Rejects_wrong_board()
    {
        var r = BoardActionValidator.Validate("other", Env("board.clear", "{}"));
        Assert.False(r.IsSuccess);
    }

    [Theory]
    [InlineData("""{"id":"s","color":"red","width":4,"points":[{"x":0.5,"y":0.5}]}""")]
    [InlineData("""{"id":"s","color":"#fff","width":0,"points":[{"x":0.5,"y":0.5}]}""")]
    [InlineData("""{"id":"s","color":"#fff","width":4,"points":[]}""")]
    [InlineData("""{"id":"s","color":"#fff","width":4,"points":[{"x":2,"y":0.5}]}""")]
    public void Rejects_bad_strokes(string item)
    {
        Assert.False(BoardActionValidator.Validate("board1", Env("stroke.add", item)).IsSuccess);
    }

    [Theory]
    [InlineData("""{"id":"a","x":0.1,"y":0.2}""")] // move carries coordinates only
    public void Accepts_move(string item)
    {
        var r = BoardActionValidator.Validate("board1", Env("item.move", item));
        Assert.True(r.IsSuccess);
        Assert.Equal("a", r.Value!.ItemId);
    }

    [Theory]
    [InlineData("""{"id":"","x":0.1,"y":0.2}""")]
    [InlineData("""{"id":"a","x":-0.1,"y":0.2}""")]
    [InlineData("""{"x":0.1,"y":0.2}""")]
    public void Rejects_bad_moves(string item)
    {
        Assert.False(BoardActionValidator.Validate("board1", Env("item.move", item)).IsSuccess);
    }

    [Fact]
    public void Delete_needs_only_an_id()
    {
        Assert.True(BoardActionValidator.Validate("board1", Env("item.delete", """{"id":"a"}""")).IsSuccess);
        Assert.False(BoardActionValidator.Validate("board1", Env("item.delete", "{}")).IsSuccess);
    }

    [Fact]
    public void Clear_accepts_any_item()
    {
        Assert.True(BoardActionValidator.Validate("board1", Env("board.clear", "{}")).IsSuccess);
    }
}

public sealed class BoardActionApplierTests
{
    private static JsonArray Items(string raw) => (JsonArray)JsonNode.Parse(raw)!;

    private static ValidatedAction Act(string type, string itemJson, string? id = null) =>
        new(type, id, Json(itemJson));

    private static JsonElement Json(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Add_appends_and_readd_replaces()
    {
        var items = Items("[]");
        var stroke = """{"id":"s1","type":"stroke","color":"#222","width":4,"points":[{"x":0.1,"y":0.1}]}""";
        var once = BoardActionApplier.Apply(items, Act("stroke.add", stroke, "s1"));
        Assert.Single(once);
        Assert.Empty(items); // input untouched
        var twice = BoardActionApplier.Apply(once, Act("stroke.add", stroke, "s1"));
        Assert.Single(twice);
    }

    [Fact]
    public void Move_repositions_note_only()
    {
        var items = Items("""[{"id":"n1","type":"note","x":0.1,"y":0.1,"text":"t","color":"#fff2a8"},{"id":"s1","type":"stroke","color":"#222","width":4,"points":[{"x":0.3,"y":0.3}]}]""");
        var moved = BoardActionApplier.Apply(items, Act("item.move", """{"id":"n1","x":0.5,"y":0.5}""", "n1"));
        Assert.Equal(0.5, moved[0]!["x"]!.GetValue<double>());
        var strokeMove = BoardActionApplier.Apply(moved, Act("item.move", """{"id":"s1","x":0.9,"y":0.9}""", "s1"));
        Assert.Equal(2, strokeMove.Count); // stroke untouched, nothing crashes
        var missing = BoardActionApplier.Apply(moved, Act("item.move", """{"id":"ghost","x":0.9,"y":0.9}""", "ghost"));
        Assert.Equal(2, missing.Count);
    }

    [Fact]
    public void Delete_removes_and_clear_empties()
    {
        var items = Items("""[{"id":"a","type":"note","x":0.1,"y":0.1,"text":"t","color":"#fff2a8"},{"id":"b","type":"note","x":0.2,"y":0.2,"text":"u","color":"#fff2a8"}]""");
        var one = BoardActionApplier.Apply(items, Act("item.delete", """{"id":"a"}""", "a"));
        Assert.Single(one);
        var cleared = BoardActionApplier.Apply(one, Act("board.clear", "{}"));
        Assert.Empty(cleared);
        var missing = BoardActionApplier.Apply(cleared, Act("item.delete", """{"id":"ghost"}""", "ghost"));
        Assert.Empty(missing);
    }
}
