import { describe, expect, it } from "vitest";
import { findItemAt, findNoteAt, findStrokeNear } from "./hitTest";
import type { BoardItem } from "./types";

const W = 800;
const H = 600;

const stroke = (id: string, points: { x: number; y: number }[]): BoardItem => ({
  id,
  type: "stroke",
  color: "#222222",
  width: 4,
  points,
});

const note = (id: string, x: number, y: number): BoardItem => ({
  id,
  type: "note",
  x,
  y,
  text: "hi",
  color: "#fff2a8",
});

describe("findNoteAt", () => {
  // Note at rel (0.25, 0.25) on 800x600 => px (200, 150), 160x100 card.
  const items = [note("n1", 0.25, 0.25)];

  it("hits inside the card", () => {
    expect(findNoteAt(items, { x: 0.3, y: 0.3 }, W, H)?.id).toBe("n1");
  });

  it("misses outside the card", () => {
    expect(findNoteAt(items, { x: 0.1, y: 0.1 }, W, H)).toBeNull();
    expect(findNoteAt(items, { x: 0.5, y: 0.5 }, W, H)).toBeNull();
  });

  it("returns the topmost overlapping note", () => {
    const both = [note("back", 0.25, 0.25), note("front", 0.25, 0.25)];
    expect(findNoteAt(both, { x: 0.3, y: 0.3 }, W, H)?.id).toBe("front");
  });
});

describe("findStrokeNear", () => {
  // Diagonal from rel (0,0) to (1,1) => px (0,0) to (800,600).
  const items = [stroke("s1", [{ x: 0, y: 0 }, { x: 1, y: 1 }])];

  it("hits near the line", () => {
    // (0.5, 0.5) is on the line; (0.5125, 0.5) is ~10px off in x.
    expect(findStrokeNear(items, { x: 0.5, y: 0.5 }, W, H)?.id).toBe("s1");
    expect(findStrokeNear(items, { x: 0.5125, y: 0.5 }, W, H)?.id).toBe("s1");
  });

  it("misses far from the line", () => {
    expect(findStrokeNear(items, { x: 0.5, y: 0.1667 }, W, H)).toBeNull();
  });

  it("hits single-dot strokes", () => {
    const dot = [stroke("d1", [{ x: 0.5, y: 0.5 }])];
    expect(findStrokeNear(dot, { x: 0.5025, y: 0.5 }, W, H)?.id).toBe("d1");
    expect(findStrokeNear(dot, { x: 0.125, y: 0.1667 }, W, H)).toBeNull();
  });
});

describe("findItemAt", () => {
  it("prefers notes over strokes", () => {
    const items = [
      stroke("s1", [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }]),
      note("n1", 0.25, 0.25),
    ];
    expect(findItemAt(items, { x: 0.3125, y: 0.3333 }, W, H)?.id).toBe("n1");
  });

  it("falls back to strokes", () => {
    const items = [stroke("s1", [{ x: 0, y: 0 }, { x: 1, y: 1 }])];
    expect(findItemAt(items, { x: 0.5, y: 0.5 }, W, H)?.id).toBe("s1");
  });
});
