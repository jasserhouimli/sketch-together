using System.Text.Json;

namespace SketchTogether.Server.Features.Boards;

/// <summary>
/// Wire envelope for every board mutation. The server orders accepted actions;
/// clients apply them in arrival order and ignore duplicate actionIds.
/// </summary>
public sealed record BoardActionEnvelope(string BoardId, string ActionId, string Type, JsonElement Item);

public static class BoardActionTypes
{
    public const string StrokeAdd = "stroke.add";
    public const string NoteAdd = "note.add";
    public const string NoteUpdate = "note.update";
    public const string ItemMove = "item.move";
    public const string ItemDelete = "item.delete";
    public const string BoardClear = "board.clear";

    public static readonly string[] All =
    [
        StrokeAdd, NoteAdd, NoteUpdate, ItemMove, ItemDelete, BoardClear,
    ];
}

/// <summary>Shape-checked action ready to apply. Item stays a JsonElement so the hub can persist it verbatim.</summary>
public sealed record ValidatedAction(string Type, string? ItemId, JsonElement Item);

public static class BoardActionValidator
{
    public static Result<ValidatedAction> Validate(string boardId, BoardActionEnvelope envelope)
    {
        if (!string.Equals(envelope.BoardId, boardId, StringComparison.Ordinal))
            return Result<ValidatedAction>.Fail("Action targets a different board.");
        if (string.IsNullOrWhiteSpace(envelope.ActionId) || envelope.ActionId.Length > 100)
            return Result<ValidatedAction>.Fail("actionId is required (max 100 chars).");

        return envelope.Type switch
        {
            BoardActionTypes.StrokeAdd => ValidateStroke(envelope.Item),
            BoardActionTypes.NoteAdd => ValidateNote(envelope.Type, envelope.Item),
            BoardActionTypes.NoteUpdate => ValidateNote(envelope.Type, envelope.Item),
            BoardActionTypes.ItemMove => ValidateMove(envelope.Item),
            BoardActionTypes.ItemDelete => ValidateDelete(envelope.Item),
            BoardActionTypes.BoardClear => Valid(BoardActionTypes.BoardClear, null, envelope.Item),
            _ => Result<ValidatedAction>.Fail($"Unknown action type '{envelope.Type}'."),
        };
    }

    private static Result<ValidatedAction> ValidateStroke(JsonElement item)
    {
        if (!TryGet(item, "id", out var id) || string.IsNullOrWhiteSpace(id))
            return Fail("stroke.add needs an item id.");
        if (!TryGet(item, "color", out var color) || !BoardValues.IsColor(color))
            return Fail("stroke.add needs a hex color.");
        if (!TryDouble(item, "width", out var width) || width < 1 || width > 64)
            return Fail("stroke.add width must be 1..64.");
        if (!item.TryGetProperty("points", out var points) || points.ValueKind != JsonValueKind.Array)
            return Fail("stroke.add needs points.");
        var count = 0;
        foreach (var p in points.EnumerateArray())
        {
            count++;
            if (count > 5000) return Fail("stroke.add allows at most 5000 points.");
            if (!IsPoint(p)) return Fail("stroke.add points must be 0..1 x/y pairs.");
        }
        if (count == 0) return Fail("stroke.add needs at least one point.");
        return Valid(BoardActionTypes.StrokeAdd, id, item);
    }

    private static Result<ValidatedAction> ValidateNote(string type, JsonElement item)
    {
        if (!TryGet(item, "id", out var id) || string.IsNullOrWhiteSpace(id))
            return Fail("note needs an item id.");
        if (!TryDouble(item, "x", out var x) || !BoardValues.IsUnit(x))
            return Fail("note x must be 0..1.");
        if (!TryDouble(item, "y", out var y) || !BoardValues.IsUnit(y))
            return Fail("note y must be 0..1.");
        if (!TryGet(item, "text", out var text) || text is null || text.Length > 2000)
            return Fail("note text must be at most 2000 chars.");
        if (!TryGet(item, "color", out var color) || !BoardValues.IsColor(color))
            return Fail("note needs a hex color.");
        return Valid(type, id, item);
    }

    private static Result<ValidatedAction> ValidateMove(JsonElement item)
    {
        // item.move carries only { id, x, y }; the stored item keeps its shape.
        if (item.ValueKind != JsonValueKind.Object)
            return Fail("item.move needs { id, x, y }.");
        if (!TryGet(item, "id", out var id) || string.IsNullOrWhiteSpace(id))
            return Fail("item.move needs an item id.");
        if (!TryDouble(item, "x", out var x) || !BoardValues.IsUnit(x))
            return Fail("item.move x must be 0..1.");
        if (!TryDouble(item, "y", out var y) || !BoardValues.IsUnit(y))
            return Fail("item.move y must be 0..1.");
        return Valid(BoardActionTypes.ItemMove, id, item);
    }

    private static Result<ValidatedAction> ValidateDelete(JsonElement item)
    {
        if (item.ValueKind != JsonValueKind.Object)
            return Fail("item.delete needs { id }.");
        if (!TryGet(item, "id", out var id) || string.IsNullOrWhiteSpace(id))
            return Fail("item.delete needs an item id.");
        return Valid(BoardActionTypes.ItemDelete, id, item);
    }

    private static bool IsPoint(JsonElement p) =>
        p.ValueKind == JsonValueKind.Object
        && TryDouble(p, "x", out var x) && BoardValues.IsUnit(x)
        && TryDouble(p, "y", out var y) && BoardValues.IsUnit(y);

    private static bool TryGet(JsonElement e, string name, out string? value)
    {
        value = null;
        if (e.ValueKind != JsonValueKind.Object) return false;
        if (!e.TryGetProperty(name, out var prop) || prop.ValueKind != JsonValueKind.String) return false;
        value = prop.GetString();
        return true;
    }

    private static bool TryDouble(JsonElement e, string name, out double value)
    {
        value = 0;
        if (e.ValueKind != JsonValueKind.Object) return false;
        if (!e.TryGetProperty(name, out var prop) || prop.ValueKind != JsonValueKind.Number) return false;
        value = prop.GetDouble();
        return double.IsFinite(value);
    }

    private static Result<ValidatedAction> Valid(string type, string? id, JsonElement item) =>
        Result<ValidatedAction>.Ok(new ValidatedAction(type, id, item));

    private static Result<ValidatedAction> Fail(string message) =>
        Result<ValidatedAction>.Fail(message);
}

public static class BoardValues
{
    public static bool IsColor(string? value) =>
        value is not null && value.Length is 4 or 7 && value[0] == '#'
        && value.Skip(1).All(c => char.IsAsciiHexDigit(c));

    public static bool IsUnit(double value) => value >= 0 && value <= 1;
}

/// <summary>Minimal Result without a shared-kernel dependency (one slice so far).</summary>
public sealed class Result<T>
{
    private Result(bool success, T? value, string? error)
    {
        IsSuccess = success;
        Value = value;
        Error = error;
    }

    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }

    public static Result<T> Ok(T value) => new(true, value, null);
    public static Result<T> Fail(string error) => new(false, default, error);
}
