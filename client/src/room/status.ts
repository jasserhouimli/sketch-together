import type { SyncStatus } from "./sync";

/** Short badge text for the room bar. */
export function statusLabel(status: SyncStatus, participants: number): string {
  switch (status) {
    case "live":
      return `Live · ${participants}`;
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "rejected":
      return "Link rejected";
    case "offline":
      return "Offline";
  }
}

/** Tooltip for the badge: what the state means for this tab's edits. */
export function statusTitle(
  status: SyncStatus,
  participants: number,
  readOnly: boolean,
): string {
  switch (status) {
    case "live":
      return `${participants} participant${participants === 1 ? "" : "s"} connected`;
    case "rejected":
      // The connection is up; retrying will not help until the right link is used.
      return "The server rejected this link, so the board will not update live";
    case "connecting":
    case "reconnecting":
    case "offline":
      return readOnly
        ? "The board will catch up when the connection returns"
        : "Edits stay on this device until the connection returns";
  }
}
