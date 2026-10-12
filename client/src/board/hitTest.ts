import { NOTE_HEIGHT, NOTE_WIDTH } from "./renderer";
import { toPixels } from "./geometry";
import type { BoardItem, Point } from "./types";

/** Topmost note containing the point (items later in the array paint on top). */
export function findNoteAt(
  items: BoardItem[],
  point: Point,
  boardWidth: number,
  boardHeight: number,
): BoardItem | null {
  const px = toPixels(point, boardWidth, boardHeight);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== "note") continue;
    const pos = toPixels({ x: item.x, y: item.y }, boardWidth, boardHeight);
    if (
      px.x >= pos.x &&
      px.x <= pos.x + NOTE_WIDTH &&
      px.y >= pos.y &&
      px.y <= pos.y + NOTE_HEIGHT
    ) {
      return item;
    }
  }
  return null;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Topmost stroke within `tolerancePx` of the point. Distance is measured in
 * pixels so the eraser feels the same at any board size.
 */
export function findStrokeNear(
  items: BoardItem[],
  point: Point,
  boardWidth: number,
  boardHeight: number,
  tolerancePx = 10,
): BoardItem | null {
  const px = toPixels(point, boardWidth, boardHeight);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== "stroke") continue;
    const pts = item.points.map((p) => toPixels(p, boardWidth, boardHeight));
    const radius = tolerancePx + item.width / 2;
    if (pts.length === 1) {
      if (Math.hypot(px.x - pts[0].x, px.y - pts[0].y) <= radius) return item;
      continue;
    }
    for (let s = 0; s < pts.length - 1; s++) {
      if (distToSegment(px, pts[s], pts[s + 1]) <= radius) return item;
    }
  }
  return null;
}

/** Notes first, then strokes — what the eraser (or a tap) should catch. */
export function findItemAt(
  items: BoardItem[],
  point: Point,
  boardWidth: number,
  boardHeight: number,
): BoardItem | null {
  return (
    findNoteAt(items, point, boardWidth, boardHeight) ??
    findStrokeNear(items, point, boardWidth, boardHeight)
  );
}
