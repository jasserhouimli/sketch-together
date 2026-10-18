// Ephemeral room state: where everyone's cursor is and which note they are
// dragging right now. None of this is persisted — it is decoration on top of
// the durable action log, so a missed update only costs a frame of smoothness.
// Entries expire so a peer that goes away mid-gesture cannot leave a ghost.

import { inUnitRange, isColor, type Point } from "../board/types";
import { DEFAULT_PEER_COLOR, sanitizeName, type Peer } from "./presence";

/** A cursor is hidden this long after its last update. */
export const CURSOR_TTL_MS = 5000;
/** A drag preview is dropped this long after its last update. */
export const DRAG_PREVIEW_TTL_MS = 3000;

export interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  point: Point;
  at: number;
}

export interface DragPreview {
  id: string;
  noteId: string;
  point: Point;
  at: number;
}

export interface CursorUpdate {
  id: string;
  name?: unknown;
  color?: unknown;
  x: number;
  y: number;
}

export interface PreviewUpdate {
  id: string;
  noteId: string;
  x: number;
  y: number;
}

const DEFAULT_COLOR = DEFAULT_PEER_COLOR;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Wire guard: everything here arrives from another client via the server. */
export function isCursorUpdate(value: unknown): value is CursorUpdate {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    inUnitRange(value.x) &&
    inUnitRange(value.y)
  );
}

export function isPreviewUpdate(value: unknown): value is PreviewUpdate {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.noteId === "string" &&
    inUnitRange(value.x) &&
    inUnitRange(value.y)
  );
}

export function toCursor(update: CursorUpdate, now: number): RemoteCursor {
  return {
    id: update.id,
    name: sanitizeName(update.name),
    color: isColor(update.color) ? update.color : DEFAULT_COLOR,
    point: { x: update.x, y: update.y },
    at: now,
  };
}

export function toPreview(update: PreviewUpdate, now: number): DragPreview {
  return { id: update.id, noteId: update.noteId, point: { x: update.x, y: update.y }, at: now };
}

export function upsertCursor(
  cursors: ReadonlyMap<string, RemoteCursor>,
  cursor: RemoteCursor,
): Map<string, RemoteCursor> {
  const next = new Map(cursors);
  next.set(cursor.id, cursor);
  return next;
}

export function upsertPreview(
  previews: ReadonlyMap<string, DragPreview>,
  preview: DragPreview,
): Map<string, DragPreview> {
  const next = new Map(previews);
  next.set(preview.noteId, preview);
  return next;
}

/**
 * Drops expired entries. Returns the same map when nothing expired so callers
 * can skip a redraw by comparing identity.
 */
export function pruneCursors(
  cursors: ReadonlyMap<string, RemoteCursor>,
  now: number,
  ttlMs: number = CURSOR_TTL_MS,
): ReadonlyMap<string, RemoteCursor> {
  return prune(cursors, (cursor) => now - cursor.at < ttlMs);
}

export function prunePreviews(
  previews: ReadonlyMap<string, DragPreview>,
  now: number,
  ttlMs: number = DRAG_PREVIEW_TTL_MS,
): ReadonlyMap<string, DragPreview> {
  return prune(previews, (preview) => now - preview.at < ttlMs);
}

/** Drops a note's preview, e.g. once the durable item.move arrives. */
export function dropPreview(
  previews: ReadonlyMap<string, DragPreview>,
  noteId: string,
): ReadonlyMap<string, DragPreview> {
  if (!previews.has(noteId)) return previews;
  const next = new Map(previews);
  next.delete(noteId);
  return next;
}

/** Drops previews from peers that are no longer in the room. */
export function keepPreviewsFrom(
  previews: ReadonlyMap<string, DragPreview>,
  peers: readonly Peer[],
): ReadonlyMap<string, DragPreview> {
  const present = new Set(peers.map((peer) => peer.id));
  return prune(previews, (preview) => present.has(preview.id));
}

function prune<T>(entries: ReadonlyMap<string, T>, keep: (value: T) => boolean): ReadonlyMap<string, T> {
  let next: Map<string, T> | null = null;
  for (const [key, value] of entries) {
    if (keep(value)) continue;
    next ??= new Map(entries);
    next.delete(key);
  }
  return next ?? entries;
}
