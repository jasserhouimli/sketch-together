import { describe, expect, it } from "vitest";
import { statusLabel, statusTitle } from "./status";

describe("sync status text", () => {
  it("shows the live participant count", () => {
    expect(statusLabel("live", 1)).toBe("Live · 1");
    expect(statusTitle("live", 1, false)).toBe("1 participant connected");
    expect(statusTitle("live", 3, true)).toBe("3 participants connected");
  });

  it("names each waiting state", () => {
    expect(statusLabel("connecting", 0)).toBe("Connecting…");
    expect(statusLabel("reconnecting", 0)).toBe("Reconnecting…");
    expect(statusLabel("offline", 0)).toBe("Offline");
  });

  it("reports a refused link separately from being offline", () => {
    expect(statusLabel("rejected", 0)).toBe("Link rejected");
    expect(statusTitle("rejected", 0, false)).toContain("rejected");
    expect(statusTitle("rejected", 0, true)).toContain("rejected");
  });

  it("only promises queued edits when this tab may edit", () => {
    expect(statusTitle("offline", 0, false)).toContain("Edits stay");
    expect(statusTitle("offline", 0, true)).toContain("catch up");
  });
});
