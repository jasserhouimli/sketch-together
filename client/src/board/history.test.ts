import { describe, expect, it } from "vitest";
import { EditHistory, type Undoable } from "./history";

const entry = (id: string): Undoable => ({
  undo: { type: "item.delete", item: { id } },
  redo: { type: "note.add", item: { id } },
});

describe("EditHistory", () => {
  it("undoes then redoes in order", () => {
    const h = new EditHistory();
    expect(h.canUndo()).toBe(false);
    h.record(entry("a"));
    h.record(entry("b"));
    expect(h.popUndo()).toEqual(entry("b"));
    expect(h.popUndo()).toEqual(entry("a"));
    expect(h.popUndo()).toBeNull();
    expect(h.canRedo()).toBe(true);
    expect(h.popRedo()).toEqual(entry("a"));
    expect(h.popRedo()).toEqual(entry("b"));
    expect(h.popRedo()).toBeNull();
  });

  it("clears redo on new input", () => {
    const h = new EditHistory();
    h.record(entry("a"));
    h.popUndo();
    h.record(entry("b"));
    expect(h.canRedo()).toBe(false);
    expect(h.popUndo()).toEqual(entry("b"));
  });

  it("caps the undo stack", () => {
    const h = new EditHistory(3);
    h.record(entry("a"));
    h.record(entry("b"));
    h.record(entry("c"));
    h.record(entry("d"));
    expect(h.depth).toBe(3);
    expect(h.popUndo()).toEqual(entry("d"));
    expect(h.popUndo()).toEqual(entry("c"));
    expect(h.popUndo()).toEqual(entry("b"));
    expect(h.popUndo()).toBeNull();
  });

  it("explicit clearRedo drops the redo path", () => {
    const h = new EditHistory();
    h.record(entry("a"));
    h.popUndo();
    h.clearRedo();
    expect(h.canRedo()).toBe(false);
  });
});
