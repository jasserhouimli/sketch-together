namespace SketchTogether.Server.Features.Boards;

/// <summary>Board room row. Items are stored as a JSON array (see client board model).</summary>
public sealed class Board
{
    public string Id { get; set; } = string.Empty;
    public string ItemsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
