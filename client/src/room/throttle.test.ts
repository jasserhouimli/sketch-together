import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "./throttle";

describe("createThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs immediately on the leading edge", () => {
    const seen: number[] = [];
    const send = createThrottle((n: number) => seen.push(n), 50);

    send(1);

    expect(seen).toEqual([1]);
  });

  it("collapses a burst into the leading call plus the newest one", () => {
    const seen: number[] = [];
    const send = createThrottle((n: number) => seen.push(n), 50);

    send(1);
    send(2);
    send(3);
    send(4);

    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(50);
    expect(seen).toEqual([1, 4]);
  });

  it("forgets a trailing call that never arrived", () => {
    const seen: number[] = [];
    const send = createThrottle((n: number) => seen.push(n), 50);

    send(1);
    vi.advanceTimersByTime(50);
    send(2);

    expect(seen).toEqual([1, 2]);
  });

  it("runs again immediately once the interval has passed", () => {
    const seen: number[] = [];
    const send = createThrottle((n: number) => seen.push(n), 50);

    send(1);
    vi.advanceTimersByTime(50);
    send(2);

    expect(seen).toEqual([1, 2]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the newest arguments for the trailing call", () => {
    const seen: Array<[number, number]> = [];
    const send = createThrottle((x: number, y: number) => seen.push([x, y]), 40);

    send(0.1, 0.1);
    send(0.2, 0.2);
    send(0.3, 0.3);
    vi.advanceTimersByTime(40);

    expect(seen).toEqual([
      [0.1, 0.1],
      [0.3, 0.3],
    ]);
  });

  it("drops the pending call on cancel", () => {
    const seen: number[] = [];
    const send = createThrottle((n: number) => seen.push(n), 50);

    send(1);
    send(2);
    send.cancel();
    vi.advanceTimersByTime(200);

    expect(seen).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still runs after a cancel", () => {
    const seen: number[] = [];
    const send = createThrottle((n: number) => seen.push(n), 50);

    send(1);
    send.cancel();
    vi.advanceTimersByTime(50);
    send(2);

    expect(seen).toEqual([1, 2]);
  });
});
