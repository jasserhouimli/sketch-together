import { describe, expect, it } from "vitest";
import { toPixels, toRelative } from "./geometry";

describe("coordinate mapping", () => {
  it("scales relative points to pixels", () => {
    expect(toPixels({ x: 0.5, y: 0.25 }, 800, 600)).toEqual({ x: 400, y: 150 });
    expect(toPixels({ x: 0, y: 1 }, 800, 600)).toEqual({ x: 0, y: 600 });
  });

  it("converts pixels back to clamped relative coords", () => {
    expect(toRelative(400, 150, 800, 600)).toEqual({ x: 0.5, y: 0.25 });
    expect(toRelative(-10, 700, 800, 600)).toEqual({ x: 0, y: 1 });
  });

  it("round-trips within float tolerance", () => {
    const p = toRelative(123, 456, 800, 600);
    const back = toPixels(p, 800, 600);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });

  it("handles degenerate sizes", () => {
    expect(toRelative(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});
