import { describe, expect, it } from "vitest";
import {
  MAX_OUTBOX_ACTIONS,
  MAX_OUTBOX_BYTES,
  Outbox,
  loadOutbox,
  outboxKey,
  parseOutbox,
  saveOutbox,
  type OutboxStorage,
  type OutgoingAction,
} from "./outbox";

const action = (id: string): OutgoingAction => ({
  actionId: id,
  type: "item.delete",
  item: { id: "note-1" },
});

function memoryStorage(initial: Record<string, string> = {}): OutboxStorage {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe("Outbox", () => {
  it("starts empty", () => {
    const outbox = new Outbox();
    expect(outbox.size).toBe(0);
    expect(outbox.peek()).toBeUndefined();
    expect(outbox.all).toEqual([]);
  });

  it("keeps enqueue order", () => {
    const outbox = new Outbox();
    outbox.enqueue(action("a"));
    outbox.enqueue(action("b"));

    expect(outbox.all.map((a) => a.actionId)).toEqual(["a", "b"]);
    expect(outbox.peek()?.actionId).toBe("a");
  });

  it("acks the head by id and exposes the next action", () => {
    const outbox = new Outbox();
    outbox.enqueue(action("a"));
    outbox.enqueue(action("b"));

    expect(outbox.ack("a")).toBe(true);
    expect(outbox.peek()?.actionId).toBe("b");
    expect(outbox.size).toBe(1);
  });

  it("ignores an ack for an action it no longer holds", () => {
    const outbox = new Outbox();
    outbox.enqueue(action("a"));

    expect(outbox.ack("missing")).toBe(false);
    expect(outbox.ack("a")).toBe(true);
    expect(outbox.ack("a")).toBe(false);
    expect(outbox.size).toBe(0);
  });

  it("drops the oldest actions past the cap", () => {
    const outbox = new Outbox();
    for (let i = 0; i < MAX_OUTBOX_ACTIONS; i++) outbox.enqueue(action(`a${i}`));

    expect(outbox.enqueue(action("new"))).toBe(1);
    expect(outbox.size).toBe(MAX_OUTBOX_ACTIONS);
    expect(outbox.peek()?.actionId).toBe("a1");
    expect(outbox.all.at(-1)?.actionId).toBe("new");
  });
});

describe("parseOutbox", () => {
  it("returns nothing for missing or unusable input", () => {
    expect(parseOutbox(null)).toEqual([]);
    expect(parseOutbox("")).toEqual([]);
    expect(parseOutbox("not json")).toEqual([]);
    expect(parseOutbox("{}")).toEqual([]);
    expect(parseOutbox("null")).toEqual([]);
  });

  it("drops malformed entries and keeps valid ones", () => {
    const raw = JSON.stringify([
      null,
      "nope",
      {},
      { actionId: "", type: "item.delete", item: {} },
      { actionId: "a", type: "", item: {} },
      { actionId: "b", type: "item.delete", item: null },
      { actionId: "c", type: "item.delete", item: [] },
      action("d"),
    ]);

    expect(parseOutbox(raw)).toEqual([action("d")]);
  });

  it("keeps the newest actions when the stored array is over the cap", () => {
    const raw = JSON.stringify(
      Array.from({ length: MAX_OUTBOX_ACTIONS + 5 }, (_, i) => action(`a${i}`)),
    );

    const parsed = parseOutbox(raw);
    expect(parsed).toHaveLength(MAX_OUTBOX_ACTIONS);
    expect(parsed[0].actionId).toBe("a5");
    expect(parsed.at(-1)?.actionId).toBe(`a${MAX_OUTBOX_ACTIONS + 4}`);
  });

  it("ignores an oversized payload instead of parsing it", () => {
    expect(parseOutbox("x".repeat(MAX_OUTBOX_BYTES + 1))).toEqual([]);
  });
});

describe("loadOutbox and saveOutbox", () => {
  it("round-trips a queue under the room's key", () => {
    const storage = memoryStorage();
    saveOutbox(storage, "abcd", [action("a"), action("b")]);

    expect(storage.getItem(outboxKey("abcd"))).not.toBeNull();
    expect(loadOutbox(storage, "abcd").all.map((a) => a.actionId)).toEqual(["a", "b"]);
  });

  it("keeps rooms separate", () => {
    const storage = memoryStorage();
    saveOutbox(storage, "room1", [action("one")]);
    saveOutbox(storage, "room2", [action("two")]);

    expect(loadOutbox(storage, "room1").all.map((a) => a.actionId)).toEqual(["one"]);
    expect(loadOutbox(storage, "room2").all.map((a) => a.actionId)).toEqual(["two"]);
  });

  it("treats a missing or throwing store as empty", () => {
    expect(loadOutbox(null, "abcd").size).toBe(0);
    const hostile: OutboxStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(loadOutbox(hostile, "abcd").size).toBe(0);
    expect(() => saveOutbox(hostile, "abcd", [action("a")])).not.toThrow();
  });

  it("drops the oldest actions when the payload would exceed the byte cap", () => {
    const storage = memoryStorage();
    const big = (id: string): OutgoingAction => ({
      actionId: id,
      type: "note.update",
      item: { id: "n1", text: "x".repeat(300_000) },
    });

    saveOutbox(storage, "abcd", [big("a"), big("b"), big("c"), big("d")]);

    const stored = JSON.parse(storage.getItem(outboxKey("abcd"))!) as OutgoingAction[];
    expect(stored.length).toBeLessThan(4);
    expect(stored.at(-1)?.actionId).toBe("d");
    expect(storage.getItem(outboxKey("abcd"))!.length).toBeLessThanOrEqual(MAX_OUTBOX_BYTES);
  });
});
