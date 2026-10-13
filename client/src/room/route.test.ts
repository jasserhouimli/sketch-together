import { describe, expect, it } from "vitest";
import { roomIdFromHash } from "./route";

describe("room hash routing", () => {
  it("parses room links", () => {
    expect(roomIdFromHash("#/b/abc123def456")).toBe("abc123def456");
    expect(roomIdFromHash("#/b/abc123def456/")).toBe("abc123def456");
  });

  it("rejects non-room hashes", () => {
    expect(roomIdFromHash("")).toBeNull();
    expect(roomIdFromHash("#/")).toBeNull();
    expect(roomIdFromHash("#/b/")).toBeNull();
    expect(roomIdFromHash("#/b/with space")).toBeNull();
  });
});
