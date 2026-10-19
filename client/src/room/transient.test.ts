import { describe, expect, it } from "vitest";
import type { Peer } from "./presence";
import {
  CURSOR_TTL_MS,
  DRAG_PREVIEW_TTL_MS,
  dropPreview,
  isCursorUpdate,
  isPreviewUpdate,
  keepPreviewsFrom,
  pruneCursors,
  prunePreviews,
  retargetPreview,
  toCursor,
  toPreview,
  upsertCursor,
  upsertPreview,
  type DragPreview,
  type RemoteCursor,
} from "./transient";

const cursor = (over: Partial<RemoteCursor> = {}): RemoteCursor => ({
  id: "c1",
  name: "Alice",
  color: "#e8590c",
  point: { x: 0.5, y: 0.5 },
  at: 1_000,
  ...over,
});

const preview = (over: Partial<DragPreview> = {}): DragPreview => ({
  id: "c1",
  noteId: "n1",
  point: { x: 0.25, y: 0.25 },
  at: 1_000,
  ...over,
});

const peer = (id: string): Peer => ({ id, name: "Peer", color: "#1971c2" });

describe("wire guards", () => {
  it("accepts a cursor inside the board", () => {
    expect(isCursorUpdate({ id: "c1", x: 0, y: 1 })).toBe(true);
  });

  it("rejects malformed cursors", () => {
    expect(isCursorUpdate(null)).toBe(false);
    expect(isCursorUpdate({ x: 0.5, y: 0.5 })).toBe(false);
    expect(isCursorUpdate({ id: "c1", x: -0.1, y: 0.5 })).toBe(false);
    expect(isCursorUpdate({ id: "c1", x: 0.5, y: 1.5 })).toBe(false);
    expect(isCursorUpdate({ id: "c1", x: Number.NaN, y: 0.5 })).toBe(false);
  });

  it("requires a note id on a preview", () => {
    expect(isPreviewUpdate({ id: "c1", noteId: "n1", x: 0.5, y: 0.5 })).toBe(true);
    expect(isPreviewUpdate({ id: "c1", x: 0.5, y: 0.5 })).toBe(false);
  });
});

describe("normalizing wire updates", () => {
  it("sanitizes the name and keeps a good color", () => {
    const result = toCursor(
      { id: "c1", name: "  Bob  ", color: "#1971c2", x: 0.2, y: 0.3 },
      5_000,
    );

    expect(result).toEqual({
      id: "c1",
      name: "Bob",
      color: "#1971c2",
      point: { x: 0.2, y: 0.3 },
      at: 5_000,
    });
  });

  it("falls back for a missing name and a bad color", () => {
    const result = toCursor({ id: "c1", color: "red", x: 0.2, y: 0.3 }, 0);

    expect(result.name).toBe("Guest");
    expect(result.color).toBe("#495057");
  });

  it("maps a preview to relative coords", () => {
    expect(toPreview({ id: "c1", noteId: "n1", x: 0.4, y: 0.6 }, 0)).toEqual({
      id: "c1",
      noteId: "n1",
      point: { x: 0.4, y: 0.6 },
      at: 0,
    });
  });
});

describe("upsert", () => {
  it("keeps the newest cursor per connection without mutating the input", () => {
    const cursors = new Map([["c1", cursor()]]);

    const next = upsertCursor(cursors, cursor({ point: { x: 0.9, y: 0.9 }, at: 2_000 }));

    expect(next.get("c1")?.at).toBe(2_000);
    expect(cursors.get("c1")?.at).toBe(1_000);
    expect(next).not.toBe(cursors);
  });

  it("keys previews by note so a moving note has one preview", () => {
    const previews = new Map([["n1", preview()]]);

    const next = upsertPreview(previews, preview({ id: "c2", point: { x: 0.8, y: 0.8 } }));

    expect(next.size).toBe(1);
    expect(next.get("n1")?.id).toBe("c2");
  });
});

describe("pruning", () => {
  it("drops expired cursors", () => {
    const cursors = new Map([["c1", cursor()]]);

    const next = pruneCursors(cursors, 1_000 + CURSOR_TTL_MS, CURSOR_TTL_MS);

    expect(next.size).toBe(0);
  });

  it("keeps a fresh cursor and returns the same map when nothing changed", () => {
    const cursors = new Map([["c1", cursor()]]);

    const next = pruneCursors(cursors, 1_000 + CURSOR_TTL_MS - 1, CURSOR_TTL_MS);

    expect(next).toBe(cursors);
  });

  it("drops expired previews", () => {
    const previews = new Map([["n1", preview()]]);

    expect(prunePreviews(previews, 1_000 + DRAG_PREVIEW_TTL_MS, DRAG_PREVIEW_TTL_MS).size).toBe(0);
  });
});

describe("retargeting previews", () => {
  it("points a note's preview at the committed position", () => {
    const previews = new Map([["n1", preview()]]);

    const next = retargetPreview(previews, "n1", { x: 0.8, y: 0.9 }, 4_000);

    expect(next.get("n1")).toEqual({
      id: "c1",
      noteId: "n1",
      point: { x: 0.8, y: 0.9 },
      at: 4_000,
    });
    expect(previews.get("n1")?.point).toEqual({ x: 0.25, y: 0.25 });
    expect(next).not.toBe(previews);
  });

  it("does nothing when the note has no preview", () => {
    const previews = new Map([["n1", preview()]]);

    expect(retargetPreview(previews, "n2", { x: 0.1, y: 0.1 }, 4_000)).toBe(previews);
  });
});

describe("dropping previews", () => {
  it("removes a note's preview", () => {
    const previews = new Map([["n1", preview()]]);

    expect(dropPreview(previews, "n1").size).toBe(0);
  });

  it("returns the same map when the note has no preview", () => {
    const previews = new Map([["n1", preview()]]);

    expect(dropPreview(previews, "n2")).toBe(previews);
  });

  it("drops previews from peers that left", () => {
    const previews = new Map([
      ["n1", preview({ id: "c1" })],
      ["n2", preview({ id: "gone", noteId: "n2" })],
    ]);

    const next = keepPreviewsFrom(previews, [peer("c1")]);

    expect([...next.keys()]).toEqual(["n1"]);
  });

  it("returns the same map when every peer is still present", () => {
    const previews = new Map([["n1", preview({ id: "c1" })]]);

    expect(keepPreviewsFrom(previews, [peer("c1")])).toBe(previews);
  });
});
