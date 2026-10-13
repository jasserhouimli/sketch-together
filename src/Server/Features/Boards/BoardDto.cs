using System.Text.Json;

namespace SketchTogether.Server.Features.Boards;

/// <summary>Wire shape for GET /api/boards/{id}. Corrupt rows read as empty, never 500.</summary>
public sealed record BoardDto(string Id, JsonElement Items, DateTimeOffset UpdatedAt)
{
    public static BoardDto From(Board row)
    {
        try
        {
            using var doc = JsonDocument.Parse(row.ItemsJson);
            return new BoardDto(row.Id, doc.RootElement.Clone(), row.UpdatedAt);
        }
        catch (JsonException)
        {
            using var empty = JsonDocument.Parse("[]");
            return new BoardDto(row.Id, empty.RootElement.Clone(), row.UpdatedAt);
        }
    }
}
