export function SaveState({
  pending,
  offline,
  failed,
  at,
}: {
  pending: number;
  offline: boolean;
  failed: boolean;
  at: string | null;
}) {
  if (pending > 0) {
    // Offline edits are queued, not lost: say how many are waiting to sync.
    return (
      <span
        className={`status-pill${offline ? " status-offline" : ""}`}
        role="status"
        title={
          offline
            ? "Edits stay on this device and sync in order when the connection returns"
            : "Sending edits to the server"
        }
      >
        {offline ? `${pending} queued` : "Saving…"}
      </span>
    );
  }
  if (failed) {
    return (
      <span className="status-pill status-offline" role="status" title="The edit stayed on this device">
        Couldn&apos;t save
      </span>
    );
  }
  if (!at) return null;
  let time = at;
  try {
    time = new Date(at).toLocaleTimeString();
  } catch {
    // Keep the raw timestamp.
  }
  return (
    <span className="status-pill" role="status" title={`Board saved on the server at ${at}`}>
      Saved {time}
    </span>
  );
}
