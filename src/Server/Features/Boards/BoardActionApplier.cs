using System.Text.Json.Nodes;

namespace SketchTogether.Server.Features.Boards;

/// <summary>
/// Pure item-list transitions for validated actions. Operates on a clone so
/// callers never mutate a shared parse. Missing targets are no-ops (except
/// add/update, which upsert so a missed message still converges).
/// </summary>
public static class BoardActionApplier
{
    public static JsonArray Apply(JsonArray items, ValidatedAction action)
    {
        var next = (JsonArray)items.DeepClone();
        switch (action.Type)
        {
            case BoardActionTypes.StrokeAdd:
            case BoardActionTypes.NoteAdd:
            case BoardActionTypes.NoteUpdate:
                Upsert(next, action.ItemId!, action.Item);
                break;
            case BoardActionTypes.ItemMove:
                Move(next, action.Item);
                break;
            case BoardActionTypes.ItemDelete:
                Remove(next, action.ItemId!);
                break;
            case BoardActionTypes.BoardClear:
                next.Clear();
                break;
        }
        return next;
    }

    private static void Upsert(JsonArray items, string id, System.Text.Json.JsonElement item)
    {
        Remove(items, id);
        items.Add(JsonNode.Parse(item.GetRawText()));
    }

    private static void Remove(JsonArray items, string id)
    {
        for (var i = items.Count - 1; i >= 0; i--)
        {
            if (items[i] is JsonObject o && o["id"]?.GetValue<string>() == id)
                items.RemoveAt(i);
        }
    }

    private static void Move(JsonArray items, System.Text.Json.JsonElement move)
    {
        // Only notes carry x/y; moving anything else is a no-op.
        var x = move.GetProperty("x").GetDouble();
        var y = move.GetProperty("y").GetDouble();
        foreach (var node in items)
        {
            if (node is JsonObject o
                && o["id"]?.GetValue<string>() == move.GetProperty("id").GetString()
                && o["type"]?.GetValue<string>() == "note")
            {
                o["x"] = x;
                o["y"] = y;
            }
        }
    }
}
