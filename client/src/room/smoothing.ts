// Smoothing for remote cursors and drag previews.
//
// Positions arrive from the network in 25-40ms steps, which reads as
// stair-steps on screen. Each incoming position is therefore a *target* that
// the rendered position chases with an exponential approach: frame-rate
// independent, never overshoots, and it needs no protocol change.
//
// The one exception is a jump: a target far from the previous one is not
// motion (the pointer was warped, the peer came back, a window changed), so it
// snaps instead of gliding across the board.

import type { Point } from "../board/types";

/** Time constant of the exponential follow, in milliseconds. */
export const SMOOTH_TAU_MS = 55;
/** A target this far from the previous one is a jump, not motion. */
export const SNAP_DISTANCE = 0.15;
/** Close enough to the target to count as arrived (board-relative units). */
export const SETTLE_DISTANCE = 0.0005;

export interface FollowState {
  /** What we draw. */
  rendered: Point;
  /** Where the newest update says it should be. */
  target: Point;
}

export interface SmoothOptions {
  tauMs?: number;
  snapDistance?: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Exponential approach: the same result whether it is called once with a big
 * step or twice with half of it, so motion does not depend on frame rate.
 */
export function approach(current: number, target: number, dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dtMs / tauMs));
}

export interface FollowResult {
  state: FollowState;
  /** True while the rendered position is still catching up. */
  moving: boolean;
}

export function followStep(
  previous: FollowState | undefined,
  target: Point,
  dtMs: number,
  options: SmoothOptions = {},
): FollowResult {
  // A new peer appears where it is, rather than sliding in from elsewhere.
  if (previous === undefined) return { state: { rendered: target, target }, moving: false };

  const snapDistance = options.snapDistance ?? SNAP_DISTANCE;
  if (distance(previous.target, target) >= snapDistance) {
    return { state: { rendered: target, target }, moving: false };
  }

  const tauMs = options.tauMs ?? SMOOTH_TAU_MS;
  const rendered = {
    x: approach(previous.rendered.x, target.x, dtMs, tauMs),
    y: approach(previous.rendered.y, target.y, dtMs, tauMs),
  };
  if (distance(rendered, target) <= SETTLE_DISTANCE) {
    return { state: { rendered: target, target }, moving: false };
  }
  return { state: { rendered, target }, moving: true };
}

/**
 * Advances every tracked position by one frame. Entries that are no longer
 * targeted are dropped, so a peer that leaves leaves nothing behind.
 */
export function stepFollow(
  states: ReadonlyMap<string, FollowState>,
  targets: Iterable<readonly [string, Point]>,
  dtMs: number,
  options: SmoothOptions = {},
): { states: Map<string, FollowState>; moving: boolean } {
  const next = new Map<string, FollowState>();
  let moving = false;
  for (const [id, target] of targets) {
    const result = followStep(states.get(id), target, dtMs, options);
    next.set(id, result.state);
    if (result.moving) moving = true;
  }
  return { states: next, moving };
}

/** What to draw right now, for each tracked id. */
export function renderedPositions(states: ReadonlyMap<string, FollowState>): Map<string, Point> {
  const positions = new Map<string, Point>();
  for (const [id, state] of states) positions.set(id, state.rendered);
  return positions;
}
