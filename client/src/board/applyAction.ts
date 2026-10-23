import { isValidItem, type BoardItem } from "./types";

/** Shape of a durable board action, local or received from the server. */
export interface BoardActionLike {
  type: string;
  item: unknown;
}

/**
 * Folds one action into the item list and returns a new list, or null when the
 * action is unknown or malformed. Upserts make replay safe: applying the same
 * action twice (a lost ack, a redelivery) yields the same board.
 */
export function applyAction(
  items: BoardItem[],
  action: BoardActionLike,
): BoardItem[] | null {
  switch (action.type) {
    case "stroke.add":
    case "note.add":
    case "note.update": {
      if (!isValidItem(action.item)) return null;
      const item = action.item;
      return items.some((i) => i.id === item.id)
        ? items.map((i) => (i.id === item.id ? item : i))
        : [...items, item];
    }
    case "item.move": {
      const move = asMove(action.item);
      if (!move) return null;
      return items.map((i) =>
        i.id === move.id && i.type === "note" ? { ...i, x: move.x, y: move.y } : i,
      );
    }
    case "item.delete": {
      const id = asId(action.item);
      if (id === null) return null;
      return items.filter((i) => i.id !== id);
    }
    case "board.clear":
      return [];
    default:
      return null;
  }
}

function asId(item: unknown): string | null {
  if (typeof item !== "object" || item === null) return null;
  const id = (item as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function asMove(item: unknown): { id: string; x: number; y: number } | null {
  if (typeof item !== "object" || item === null) return null;
  const move = item as { id?: unknown; x?: unknown; y?: unknown };
  if (typeof move.id !== "string") return null;
  if (typeof move.x !== "number" || !Number.isFinite(move.x)) return null;
  if (typeof move.y !== "number" || !Number.isFinite(move.y)) return null;
  return { id: move.id, x: move.x, y: move.y };
}
