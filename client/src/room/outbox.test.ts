import { describe, expect, it } from "vitest";
import { MAX_OUTBOX_ACTIONS, Outbox, type OutgoingAction } from "./outbox";

const action = (id: string): OutgoingAction => ({
  actionId: id,
  type: "item.delete",
  item: { id: "note-1" },
});

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
