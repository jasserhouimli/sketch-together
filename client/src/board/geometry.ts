import type { Point } from "./types";

/** Relative (0..1) point to device pixels. */
export function toPixels(p: Point, width: number, height: number): Point {
  return { x: p.x * width, y: p.y * height };
}

/** Device pixels to relative coords, clamped into 0..1. */
export function toRelative(x: number, y: number, width: number, height: number): Point {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(x / width), y: clamp(y / height) };
}
