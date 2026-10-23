import { describe, expect, it } from "vitest";
import { applyAction } from "./applyAction";
import type { BoardItem, NoteItem, StrokeItem } from "./types";

const note = (over: Partial<NoteItem> = {}): NoteItem => ({
  id: "n1",
  type: "note",
  x: 0.2,
  y: 0.3,
  text: "hello",
  color: "#ffd43b",
  ...over,
});

const stroke = (over: Partial<StrokeItem> = {}): StrokeItem => ({
  id: "s1",
  type: "stroke",
  color: "#1971c2",
  width: 2,
  points: [{ x: 0.1, y: 0.1 }],
  ...over,
});

describe("applyAction", () => {
  it("adds an item", () => {
    expect(applyAction([], { type: "note.add", item: note() })).toEqual([note()]);
  });

  it("replaces an existing item instead of duplicating it", () => {
    const updated = note({ text: "edited" });
    expect(applyAction([note()], { type: "note.update", item: updated })).toEqual([updated]);
  });

  it("rejects a malformed item", () => {
    expect(applyAction([], { type: "stroke.add", item: { id: "x" } })).toBeNull();
    expect(applyAction([], { type: "note.add", item: null })).toBeNull();
  });

  it("moves a note and leaves other items alone", () => {
    expect(applyAction([note(), stroke()], { type: "item.move", item: { id: "n1", x: 0.9, y: 0.8 } })).toEqual([
      note({ x: 0.9, y: 0.8 }),
      stroke(),
    ]);
  });

  it("ignores a move for a stroke or an unknown id", () => {
    expect(applyAction([stroke()], { type: "item.move", item: { id: "s1", x: 0.5, y: 0.5 } })).toEqual([
      stroke(),
    ]);
    expect(applyAction([note()], { type: "item.move", item: { id: "nope", x: 0.5, y: 0.5 } })).toEqual([
      note(),
    ]);
  });

  it("rejects a move without finite coordinates", () => {
    expect(applyAction([note()], { type: "item.move", item: { id: "n1", x: Number.NaN, y: 0 } })).toBeNull();
    expect(applyAction([note()], { type: "item.move", item: { id: "n1" } })).toBeNull();
  });

  it("deletes by id and tolerates a missing target", () => {
    expect(applyAction([note(), stroke()], { type: "item.delete", item: { id: "n1" } })).toEqual([stroke()]);
    expect(applyAction([note()], { type: "item.delete", item: { id: "gone" } })).toEqual([note()]);
  });

  it("clears the board", () => {
    expect(applyAction([note(), stroke()], { type: "board.clear", item: {} })).toEqual([]);
  });

  it("shows the same result when an action is replayed", () => {
    const once = applyAction([], { type: "note.add", item: note() });
    const twice = applyAction(once!, { type: "note.add", item: note() });
    expect(twice).toEqual(once);
  });

  it("returns null for an unknown action type", () => {
    expect(applyAction([note()], { type: "board.explode", item: {} })).toBeNull();
  });

  it("does not mutate the input list", () => {
    const items: BoardItem[] = [note()];
    applyAction(items, { type: "board.clear", item: {} });
    expect(items).toEqual([note()]);
  });
});
