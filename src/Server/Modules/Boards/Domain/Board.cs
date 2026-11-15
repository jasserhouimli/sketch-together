namespace SketchTogether.Server.Modules.Boards.Domain;

/// <summary>
/// Board room aggregate entity. Items are stored as a serialized JSON array.
/// </summary>
public sealed class Board
{
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// SHA-256 hex of the edit key, or null for legacy boards created before edit links.
    /// </summary>
    public string? EditKeyHash { get; set; }

    public string ItemsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
