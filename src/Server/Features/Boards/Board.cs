namespace SketchTogether.Server.Features.Boards;

/// <summary>Board room row. Items are stored as a JSON array (see client board model).</summary>
public sealed class Board
{
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// SHA-256 hex of the edit key, or null for a board created before edit
    /// links (those remain open, because no key was ever issued).
    /// </summary>
    public string? EditKeyHash { get; set; }

    public string ItemsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
