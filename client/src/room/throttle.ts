/**
 * Coalescing throttle for the high-frequency ephemeral channels (cursor moves,
 * note drag previews): run `fn` at most once per interval on the leading edge,
 * then once more on the trailing edge with the newest arguments. A fast pointer
 * therefore cannot flood the socket, and the last position always gets sent.
 */
export interface Throttle<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

export function createThrottle<A extends unknown[]>(
  fn: (...args: A) => void,
  intervalMs: number,
): Throttle<A> {
  let lastRun = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const invoke = (args: A) => {
    lastRun = Date.now();
    fn(...args);
  };

  const throttled = ((...args: A) => {
    const elapsed = Date.now() - lastRun;
    if (elapsed >= intervalMs) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        pending = null;
      }
      invoke(args);
      return;
    }
    pending = args; // only the newest call survives
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      const latest = pending;
      pending = null;
      if (latest) invoke(latest);
    }, intervalMs - elapsed);
  }) as Throttle<A>;

  throttled.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return throttled;
}
