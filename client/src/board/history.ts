/**
 * Session-local undo/redo. Undoing applies the inverse as a brand-new action
 * (broadcast like any other edit), so all clients converge on server order.
 * Remote actions are never recorded here; any new action clears redo.
 * Capped so a long session cannot grow memory without bound.
 */
export interface Undoable {
  undo: { type: string; item: unknown };
  redo: { type: string; item: unknown };
}

export class EditHistory {
  private undoStack: Undoable[] = [];
  private redoStack: Undoable[] = [];
  private readonly cap: number;

  constructor(cap = 100) {
    this.cap = Math.max(1, cap);
  }

  record(entry: Undoable): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.cap) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  popUndo(): Undoable | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return entry;
  }

  popRedo(): Undoable | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    if (this.undoStack.length > this.cap) this.undoStack.shift();
    return entry;
  }

  /** A new local or remote action invalidates the redo path. */
  clearRedo(): void {
    this.redoStack = [];
  }

  get depth(): number {
    return this.undoStack.length;
  }
}
