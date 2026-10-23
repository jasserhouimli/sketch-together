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
