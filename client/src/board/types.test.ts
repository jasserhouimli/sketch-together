import { describe, expect, it } from "vitest";
import {
  emptyBoard,
  inUnitRange,
  isColor,
  isValidItem,
  isValidNote,
  isValidStroke,
  newId,
  type NoteItem,
  type StrokeItem,
} from "./types";

const stroke = (over: Partial<StrokeItem> = {}): StrokeItem => ({
  id: "s1",
  type: "stroke",
  color: "#222222",
  width: 4,
  points: [
    { x: 0.15, y: 0.22 },
    { x: 0.16, y: 0.23 },
  ],
  ...over,
});

const note = (over: Partial<NoteItem> = {}): NoteItem => ({
  id: "n1",
  type: "note",
  x: 0.35,
  y: 0.28,
  text: "Project idea",
  color: "#fff2a8",
  ...over,
});

describe("ids and boards", () => {
  it("generates unique ids", () => {
    expect(newId()).not.toBe(newId());
  });

  it("starts empty", () => {
    expect(emptyBoard("b1")).toEqual({ id: "b1", items: [] });
  });
});

describe("validation", () => {
  it("accepts the spec examples", () => {
    expect(isValidStroke(stroke())).toBe(true);
    expect(isValidNote(note())).toBe(true);
    expect(isValidItem(stroke())).toBe(true);
    expect(isValidItem(note())).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isValidItem({ type: "circle" })).toBe(false);
    expect(isValidItem(null)).toBe(false);
  });

  it("rejects bad colors", () => {
    expect(isColor("#fff")).toBe(true);
    expect(isColor("#222222")).toBe(true);
    expect(isColor("red")).toBe(false);
    expect(isColor("#gggggg")).toBe(false);
    expect(isValidStroke(stroke({ color: "red" }))).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(inUnitRange(0)).toBe(true);
    expect(inUnitRange(1)).toBe(true);
    expect(inUnitRange(-0.1)).toBe(false);
    expect(inUnitRange(1.5)).toBe(false);
    expect(inUnitRange(NaN)).toBe(false);
    expect(isValidStroke(stroke({ points: [{ x: 2, y: 0.5 }] }))).toBe(false);
    expect(isValidNote(note({ x: 0.5, y: -1 }))).toBe(false);
  });

  it("rejects bad widths and empty strokes", () => {
    expect(isValidStroke(stroke({ width: 0 }))).toBe(false);
    expect(isValidStroke(stroke({ width: 100 }))).toBe(false);
    expect(isValidStroke(stroke({ points: [] }))).toBe(false);
  });

  it("caps note text length", () => {
    expect(isValidNote(note({ text: "x".repeat(2001) }))).toBe(false);
  });
});
