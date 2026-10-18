import { describe, expect, it } from "vitest";
import {
  DEFAULT_PEER_COLOR,
  DISPLAY_NAME_MAX,
  getStoredName,
  peersExcept,
  randomName,
  resolveDisplayName,
  sanitizeName,
  setStoredName,
  toRoster,
  type Peer,
} from "./presence";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(initial));
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

const peer = (over: Partial<Peer> = {}): Peer => ({
  id: "c1",
  name: "Alice",
  color: "#e8590c",
  ...over,
});

describe("sanitizeName", () => {
  it("keeps a plain name", () => {
    expect(sanitizeName("Alice")).toBe("Alice");
  });

  it("falls back for empty or non-string input", () => {
    expect(sanitizeName(null)).toBe("Guest");
    expect(sanitizeName(undefined)).toBe("Guest");
    expect(sanitizeName(42)).toBe("Guest");
    expect(sanitizeName("")).toBe("Guest");
    expect(sanitizeName("   ")).toBe("Guest");
    expect(sanitizeName("\u0001\u0002")).toBe("Guest");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeName("  Ada   Lovelace  ")).toBe("Ada Lovelace");
  });

  it("drops control characters", () => {
    expect(sanitizeName("Ada\u0000Lovelace")).toBe("AdaLovelace");
    expect(sanitizeName("Grace\nHopper")).toBe("GraceHopper");
  });

  it("keeps non-ASCII names", () => {
    expect(sanitizeName("Émile Zola")).toBe("Émile Zola");
  });

  it("caps the length", () => {
    expect(sanitizeName("a".repeat(200))).toBe("a".repeat(DISPLAY_NAME_MAX));
    expect(sanitizeName("é".repeat(200))).toHaveLength(DISPLAY_NAME_MAX);
  });
});

describe("randomName", () => {
  it("picks from the two word lists", () => {
    expect(randomName(() => 0)).toBe("Amber Badger");
    expect(randomName(() => 0.999)).toBe("Violet Wolf");
  });
});

describe("stored names", () => {
  it("returns null when there is no storage or no name", () => {
    expect(getStoredName(null)).toBeNull();
    expect(getStoredName(memoryStorage())).toBeNull();
  });

  it("round-trips a name", () => {
    const storage = memoryStorage();
    setStoredName(storage, "Ada");
    expect(getStoredName(storage)).toBe("Ada");
  });

  it("survives storage that throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;

    expect(getStoredName(hostile)).toBeNull();
    expect(() => setStoredName(hostile, "Ada")).not.toThrow();
  });

  it("generates and remembers a name on first visit", () => {
    const storage = memoryStorage();

    const first = resolveDisplayName(storage, () => 0);
    const second = resolveDisplayName(storage, () => 0.999);

    expect(first).toBe("Amber Badger");
    expect(second).toBe("Amber Badger");
  });

  it("replaces a stored name that sanitizes to nothing", () => {
    const storage = memoryStorage({ "sketchtogether.display-name": "   " });

    expect(resolveDisplayName(storage, () => 0)).toBe("Amber Badger");
  });
});

describe("toRoster", () => {
  it("ignores a non-array payload", () => {
    expect(toRoster(null)).toEqual([]);
    expect(toRoster("nope")).toEqual([]);
    expect(toRoster({ id: "c1" })).toEqual([]);
  });

  it("drops entries without an id and sanitizes the rest", () => {
    const roster = toRoster([
      null,
      "nope",
      {},
      { id: "" },
      { id: "c1" },
      { id: "c2", name: "  Bob  ", color: "#1971c2" },
      { id: "c3", name: 7, color: "red" },
    ]);

    expect(roster).toEqual([
      { id: "c1", name: "Guest", color: DEFAULT_PEER_COLOR },
      { id: "c2", name: "Bob", color: "#1971c2" },
      { id: "c3", name: "Guest", color: DEFAULT_PEER_COLOR },
    ]);
  });
});

describe("peersExcept", () => {
  it("drops ourselves", () => {
    const others = peersExcept([peer({ id: "c1" }), peer({ id: "c2", name: "Bob" })], "c1");

    expect(others.map((p) => p.id)).toEqual(["c2"]);
  });

  it("keeps everyone when we are not in the roster yet", () => {
    expect(peersExcept([peer()], null)).toHaveLength(1);
  });
});
