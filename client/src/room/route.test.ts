import { describe, expect, it, vi } from "vitest";
import { editRoomUrl, roomRouteFromHash, roomUrl } from "./route";

describe("room hash routing", () => {
  it("parses view links", () => {
    expect(roomRouteFromHash("#/b/abc123def456")).toEqual({
      roomId: "abc123def456",
      editKey: null,
    });
    expect(roomRouteFromHash("#/b/abc123def456/")).toEqual({
      roomId: "abc123def456",
      editKey: null,
    });
  });

  it("parses edit links without treating the key as part of the id", () => {
    expect(roomRouteFromHash("#/b/abc123def456/deadbeef")).toEqual({
      roomId: "abc123def456",
      editKey: "deadbeef",
    });
    expect(roomRouteFromHash("#/b/abc123def456/deadbeef/")).toEqual({
      roomId: "abc123def456",
      editKey: "deadbeef",
    });
  });

  it("rejects non-room hashes", () => {
    expect(roomRouteFromHash("")).toBeNull();
    expect(roomRouteFromHash("#/")).toBeNull();
    expect(roomRouteFromHash("#/b/")).toBeNull();
    expect(roomRouteFromHash("#/b/with space")).toBeNull();
    expect(roomRouteFromHash("#/b/abc123/not a key")).toBeNull();
  });

  it("builds distinct view and edit URLs", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://example.test", pathname: "/" },
    });
    try {
      expect(roomUrl("abc123")).toBe("https://example.test/#/b/abc123");
      expect(editRoomUrl("abc123", "key")).toBe("https://example.test/#/b/abc123/key");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
