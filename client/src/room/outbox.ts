/**
 * Ordered queue of durable actions waiting for the server to acknowledge them.
 *
 * One entry is in flight at a time, so the queue preserves the order the user
 * made the edits in. Actions are idempotent on the server (upsert, move,
 * delete, clear) and carry an actionId, so replaying after a lost ack is safe.
 */
export interface OutgoingAction {
  actionId: string;
  type: string;
  item: unknown;
}

/**
 * Offline editing is bounded: beyond this many pending actions the oldest are
 * dropped. A single board would need a long outage to reach it.
 */
export const MAX_OUTBOX_ACTIONS = 500;

/** Hard cap on the persisted queue; a long offline drawing session hits it. */
export const MAX_OUTBOX_BYTES = 1_000_000;

const MAX_ACTION_ID_LENGTH = 100;
const MAX_TYPE_LENGTH = 50;

/** The subset of Storage this module needs, so tests can pass a fake. */
export interface OutboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class Outbox {
  private actions: OutgoingAction[] = [];

  get size(): number {
    return this.actions.length;
  }

  /** Snapshot of the pending actions, oldest first. */
  get all(): readonly OutgoingAction[] {
    return this.actions.slice();
  }

  /** The action to send next, or undefined when the queue is empty. */
  peek(): OutgoingAction | undefined {
    return this.actions[0];
  }

  /** Appends an action and returns how many old actions overflowed the cap. */
  enqueue(action: OutgoingAction): number {
    this.actions.push(action);
    let dropped = 0;
    while (this.actions.length > MAX_OUTBOX_ACTIONS) {
      this.actions.shift();
      dropped++;
    }
    return dropped;
  }

  /** Removes an acknowledged action; false when it was no longer queued. */
  ack(actionId: string): boolean {
    const index = this.actions.findIndex((a) => a.actionId === actionId);
    if (index < 0) return false;
    this.actions.splice(index, 1);
    return true;
  }
}

/** Per-room key. Room ids are validated route ids, so no escaping is needed. */
export function outboxKey(roomId: string): string {
  return `sketchtogether.outbox.${roomId}`;
}

/**
 * Parses a persisted queue. Storage is untrusted input: anything malformed,
 * oversized, or not shaped like an action is dropped rather than sent.
 */
export function parseOutbox(raw: string | null): OutgoingAction[] {
  if (!raw || raw.length > MAX_OUTBOX_BYTES) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isOutgoingAction).slice(-MAX_OUTBOX_ACTIONS);
}

/** Loads this room's queue; a missing or unreadable store means empty. */
export function loadOutbox(storage: OutboxStorage | null, roomId: string): Outbox {
  const outbox = new Outbox();
  if (!storage) return outbox;
  let raw: string | null = null;
  try {
    raw = storage.getItem(outboxKey(roomId));
  } catch {
    return outbox;
  }
  for (const action of parseOutbox(raw)) outbox.enqueue(action);
  return outbox;
}

/**
 * Saves the queue, dropping the oldest actions if the payload would exceed the
 * byte cap. Storage failures are ignored: the queue still works for this tab.
 */
export function saveOutbox(
  storage: OutboxStorage | null,
  roomId: string,
  actions: readonly OutgoingAction[],
): void {
  if (!storage) return;
  let kept = [...actions];
  let raw = JSON.stringify(kept);
  while (raw.length > MAX_OUTBOX_BYTES) {
    if (kept.length <= 1) {
      kept = [];
      raw = "[]";
      break;
    }
    kept = kept.slice(Math.ceil(kept.length / 2));
    raw = JSON.stringify(kept);
  }
  try {
    storage.setItem(outboxKey(roomId), raw);
  } catch {
    // Quota or privacy mode: keep working from memory.
  }
}

function isOutgoingAction(value: unknown): value is OutgoingAction {
  if (typeof value !== "object" || value === null) return false;
  const action = value as Record<string, unknown>;
  if (
    typeof action.actionId !== "string" ||
    action.actionId.length === 0 ||
    action.actionId.length > MAX_ACTION_ID_LENGTH
  ) {
    return false;
  }
  if (
    typeof action.type !== "string" ||
    action.type.length === 0 ||
    action.type.length > MAX_TYPE_LENGTH
  ) {
    return false;
  }
  // Every board action carries a JSON object; arrays and scalars are not one.
  return typeof action.item === "object" && action.item !== null && !Array.isArray(action.item);
}
