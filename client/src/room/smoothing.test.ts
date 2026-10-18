import { describe, expect, it } from "vitest";
import {
  approach,
  distance,
  followStep,
  renderedPositions,
  stepFollow,
  type FollowState,
} from "./smoothing";

const P = (x: number, y: number) => ({ x, y });

describe("distance", () => {
  it("measures board-relative distance", () => {
    expect(distance(P(0, 0), P(3, 4))).toBe(5);
    expect(distance(P(0.25, 0.5), P(0.25, 0.5))).toBe(0);
  });
});

describe("approach", () => {
  it("moves partway toward the target", () => {
    const next = approach(0, 1, 16, 55);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("is frame-rate independent", () => {
    const once = approach(0, 1, 32, 55);
    const twice = approach(approach(0, 1, 16, 55), 1, 16, 55);
    expect(twice).toBeCloseTo(once, 10);
  });

  it("never overshoots, even with a long step", () => {
    expect(approach(0, 1, 5000, 55)).toBeLessThanOrEqual(1);
    expect(approach(1, 0, 5000, 55)).toBeGreaterThanOrEqual(0);
  });

  it("jumps straight to the target when the time constant is zero", () => {
    expect(approach(0, 1, 16, 0)).toBe(1);
  });
});

describe("followStep", () => {
  it("places a newly seen position where it is, without sliding in", () => {
    const result = followStep(undefined, P(0.4, 0.6), 16);
    expect(result.state).toEqual({ rendered: P(0.4, 0.6), target: P(0.4, 0.6) });
    expect(result.moving).toBe(false);
  });

  it("chases a nearby target over several frames and then settles exactly", () => {
    let state: FollowState | undefined = { rendered: P(0, 0), target: P(0, 0) };
    const target = P(0.1, 0);
    let moving = true;
    let frames = 0;
    while (moving && frames < 200) {
      const result = followStep(state, target, 16);
      state = result.state;
      moving = result.moving;
      frames += 1;
      expect(result.state.rendered.x).toBeLessThanOrEqual(0.1);
    }
    expect(frames).toBeLessThan(200);
    expect(state?.rendered).toEqual(target);
    expect(moving).toBe(false);
  });

  it("keeps moving while the pointer keeps moving", () => {
    const first = followStep({ rendered: P(0, 0), target: P(0, 0) }, P(0.05, 0), 16);
    expect(first.moving).toBe(true);
    const second = followStep(first.state, P(0.1, 0), 16);
    expect(second.moving).toBe(true);
    expect(second.state.target).toEqual(P(0.1, 0));
  });

  it("snaps instead of gliding when the target jumps", () => {
    const result = followStep({ rendered: P(0, 0), target: P(0, 0) }, P(0.5, 0.5), 16);
    expect(result.state.rendered).toEqual(P(0.5, 0.5));
    expect(result.moving).toBe(false);
  });

  it("follows rather than snaps for movement under the snap distance", () => {
    const result = followStep({ rendered: P(0, 0), target: P(0, 0) }, P(0.1, 0), 16);
    expect(result.state.rendered.x).toBeLessThan(0.1);
    expect(result.moving).toBe(true);
  });

  it("honours custom tuning", () => {
    const snapped = followStep({ rendered: P(0, 0), target: P(0, 0) }, P(0.02, 0), 16, {
      snapDistance: 0.01,
    });
    expect(snapped.state.rendered).toEqual(P(0.02, 0));

    const instant = followStep({ rendered: P(0, 0), target: P(0, 0) }, P(0.02, 0), 16, {
      tauMs: 0,
    });
    expect(instant.state.rendered).toEqual(P(0.02, 0));
  });
});

describe("stepFollow", () => {
  it("tracks each entry independently", () => {
    const { states, moving } = stepFollow(
      new Map([["a", { rendered: P(0, 0), target: P(0, 0) }]]),
      [
        ["a", P(0.1, 0)],
        ["b", P(0.5, 0.5)],
      ],
      16,
    );
    expect(moving).toBe(true);
    expect(states.get("a")?.rendered.x).toBeLessThan(0.1);
    expect(states.get("b")?.rendered).toEqual(P(0.5, 0.5));
  });

  it("drops entries that are no longer targeted", () => {
    const { states } = stepFollow(
      new Map([
        ["a", { rendered: P(0, 0), target: P(0, 0) }],
        ["gone", { rendered: P(0.2, 0.2), target: P(0.2, 0.2) }],
      ]),
      [["a", P(0, 0)]],
      16,
    );
    expect([...states.keys()]).toEqual(["a"]);
  });

  it("reports idle once everything has arrived", () => {
    const { states, moving } = stepFollow(
      new Map([["a", { rendered: P(0.3, 0.3), target: P(0.3, 0.3) }]]),
      [["a", P(0.3, 0.3)]],
      16,
    );
    expect(moving).toBe(false);
    expect(states.get("a")?.rendered).toEqual(P(0.3, 0.3));
  });

  it("starts idle when there is nothing to track", () => {
    const { states, moving } = stepFollow(new Map(), [], 16);
    expect(moving).toBe(false);
    expect(states.size).toBe(0);
  });
});

describe("renderedPositions", () => {
  it("exposes only the drawn positions", () => {
    const positions = renderedPositions(
      new Map([
        ["a", { rendered: P(0.1, 0.2), target: P(0.9, 0.9) }],
        ["b", { rendered: P(0.3, 0.4), target: P(0.3, 0.4) }],
      ]),
    );
    expect(positions.get("a")).toEqual(P(0.1, 0.2));
    expect(positions.get("b")).toEqual(P(0.3, 0.4));
  });
});
