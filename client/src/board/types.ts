// Board data model (v1). Coordinates are relative to board size (0..1) so
// boards scale across screen sizes. IDs are client-generated UUIDs.

export interface Point {
  x: number;
  y: number;
}

export interface StrokeItem {
  id: string;
  type: "stroke";
  color: string;
  width: number;
  points: Point[];
}

export interface NoteItem {
  id: string;
  type: "note";
  x: number;
  y: number;
  text: string;
  color: string;
}

export type BoardItem = StrokeItem | NoteItem;

export interface Board {
  id: string;
  items: BoardItem[];
}

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyBoard(id: string): Board {
  return { id, items: [] };
}

/** CSS hex color (#rgb or #rrggbb). */
export function isColor(value: unknown): value is string {
  return (
    typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
  );
}

export function inUnitRange(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isValidStroke(item: unknown): item is StrokeItem {
  if (typeof item !== "object" || item === null) return false;
  const s = item as Record<string, unknown>;
  return (
    s.type === "stroke" &&
    typeof s.id === "string" &&
    s.id.length > 0 &&
    isColor(s.color) &&
    typeof s.width === "number" &&
    Number.isFinite(s.width) &&
    s.width >= 1 &&
    s.width <= 64 &&
    Array.isArray(s.points) &&
    s.points.length >= 1 &&
    s.points.length <= 5000 &&
    s.points.every(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        inUnitRange((p as Record<string, unknown>).x) &&
        inUnitRange((p as Record<string, unknown>).y),
    )
  );
}

export function isValidNote(item: unknown): item is NoteItem {
  if (typeof item !== "object" || item === null) return false;
  const n = item as Record<string, unknown>;
  return (
    n.type === "note" &&
    typeof n.id === "string" &&
    n.id.length > 0 &&
    inUnitRange(n.x) &&
    inUnitRange(n.y) &&
    typeof n.text === "string" &&
    n.text.length <= 2000 &&
    isColor(n.color)
  );
}

export function isValidItem(item: unknown): item is BoardItem {
  if (typeof item !== "object" || item === null) return false;
  const type = (item as Record<string, unknown>).type;
  return type === "stroke" ? isValidStroke(item) : type === "note" ? isValidNote(item) : false;
}
