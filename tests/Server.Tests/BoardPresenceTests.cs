using SketchTogether.Server.Features.Boards;

namespace Server.Tests;

public sealed class BoardPresenceTests
{
    private const string Board = "boardone1234";
    private const string Other = "boardtwo1234";

    [Fact]
    public void Join_returns_a_named_participant_with_a_colour()
    {
        var presence = new BoardPresence();

        var alice = presence.Join(Board, "conn-1", "Alice");

        Assert.Equal("conn-1", alice.ConnectionId);
        Assert.Equal("Alice", alice.Name);
        Assert.StartsWith("#", alice.Color);
    }

    [Fact]
    public void Roster_lists_participants_in_join_order()
    {
        var presence = new BoardPresence();

        presence.Join(Board, "conn-1", "Alice");
        presence.Join(Board, "conn-2", "Bob");
        presence.Join(Board, "conn-3", "Cleo");

        Assert.Equal(new[] { "Alice", "Bob", "Cleo" }, presence.Roster(Board).Select(p => p.Name));
    }

    [Fact]
    public void Boards_keep_separate_rosters()
    {
        var presence = new BoardPresence();

        presence.Join(Board, "conn-1", "Alice");
        presence.Join(Other, "conn-2", "Bob");

        Assert.Equal(new[] { "Alice" }, presence.Roster(Board).Select(p => p.Name));
        Assert.Equal(new[] { "Bob" }, presence.Roster(Other).Select(p => p.Name));
        Assert.Empty(presence.Roster("nobodyhere12"));
    }

    [Fact]
    public void Joining_a_second_board_moves_the_connection()
    {
        var presence = new BoardPresence();

        presence.Join(Board, "conn-1", "Alice");
        presence.Join(Other, "conn-1", "Alice");

        Assert.Empty(presence.Roster(Board));
        Assert.Equal(new[] { "Alice" }, presence.Roster(Other).Select(p => p.Name));
        Assert.Equal(Other, presence.Find("conn-1")?.BoardId);
    }

    [Fact]
    public void Rejoining_the_same_board_does_not_duplicate()
    {
        var presence = new BoardPresence();

        presence.Join(Board, "conn-1", "Alice");
        presence.Join(Board, "conn-1", "Alice");

        Assert.Single(presence.Roster(Board));
    }

    [Fact]
    public void Leave_reports_the_board_once()
    {
        var presence = new BoardPresence();
        presence.Join(Board, "conn-1", "Alice");

        Assert.Equal(Board, presence.Leave("conn-1"));
        Assert.Null(presence.Leave("conn-1"));
        Assert.Empty(presence.Roster(Board));
        Assert.Null(presence.Find("conn-1"));
    }

    [Fact]
    public void Find_is_null_for_an_unknown_connection()
    {
        Assert.Null(new BoardPresence().Find("conn-1"));
    }

    [Fact]
    public void Rename_replaces_the_name_and_keeps_the_rest()
    {
        var presence = new BoardPresence();
        var before = presence.Join(Board, "conn-1", "Alice");

        Assert.Equal(Board, presence.Rename("conn-1", "Ada"));
        var after = Assert.Single(presence.Roster(Board));
        Assert.Equal("Ada", after.Name);
        Assert.Equal(before.ConnectionId, after.ConnectionId);
        Assert.Equal(before.Color, after.Color);
    }

    [Fact]
    public void Rename_keeps_the_roster_position()
    {
        var presence = new BoardPresence();
        presence.Join(Board, "conn-1", "Alice");
        presence.Join(Board, "conn-2", "Bob");

        presence.Rename("conn-1", "Ada");

        Assert.Equal(new[] { "Ada", "Bob" }, presence.Roster(Board).Select(p => p.Name));
    }

    [Fact]
    public void Rename_sanitizes_untrusted_input()
    {
        var presence = new BoardPresence();
        presence.Join(Board, "conn-1", "Alice");

        presence.Rename("conn-1", "  \u0001  ");

        Assert.Equal(BoardPresence.FallbackName, presence.Roster(Board)[0].Name);
    }

    [Fact]
    public void Rename_is_null_for_a_connection_that_never_joined()
    {
        var presence = new BoardPresence();

        Assert.Null(presence.Rename("conn-1", "Alice"));
        Assert.Empty(presence.Roster(Board));
    }

    [Theory]
    [InlineData(null, "Guest")]
    [InlineData("", "Guest")]
    [InlineData("   ", "Guest")]
    [InlineData("\u0001\u0002", "Guest")]
    [InlineData("Alice", "Alice")]
    [InlineData("  Ada   Lovelace  ", "Ada Lovelace")]
    [InlineData("Ada\u0000Lovelace", "AdaLovelace")]
    [InlineData("Grace\nHopper", "GraceHopper")]
    [InlineData("Émile Zola", "Émile Zola")]
    public void SanitizeName_cleans_untrusted_input(string? requested, string expected)
    {
        Assert.Equal(expected, BoardPresence.SanitizeName(requested));
    }

    [Fact]
    public void SanitizeName_caps_the_length()
    {
        Assert.Equal(BoardPresence.MaxNameLength, BoardPresence.SanitizeName(new string('a', 200)).Length);
        Assert.Equal(BoardPresence.MaxNameLength, BoardPresence.SanitizeName(new string('é', 200)).Length);
    }

    [Fact]
    public void SanitizeName_does_not_end_on_a_space_after_capping()
    {
        var requested = new string('a', BoardPresence.MaxNameLength) + " tail";

        var name = BoardPresence.SanitizeName(requested);

        Assert.Equal(new string('a', BoardPresence.MaxNameLength), name);
    }

    [Fact]
    public void ColorFor_is_stable_and_drawn_from_the_palette()
    {
        Assert.Equal(BoardPresence.ColorFor("conn-1"), BoardPresence.ColorFor("conn-1"));
        Assert.Matches("^#[0-9a-f]{6}$", BoardPresence.ColorFor("conn-1"));
    }

    [Fact]
    public void Colors_vary_across_connections()
    {
        var colors = Enumerable.Range(0, 24)
            .Select(i => BoardPresence.ColorFor($"conn-{i}"))
            .Distinct();

        Assert.True(colors.Count() > 1);
    }
}
