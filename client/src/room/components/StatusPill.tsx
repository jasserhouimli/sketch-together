import { statusLabel, statusTitle } from "../status";
import type { SyncStatus } from "../sync";

export function StatusPill({
  status,
  participants,
  readOnly,
}: {
  status: SyncStatus;
  participants: number;
  readOnly: boolean;
}) {
  const label = statusLabel(status, participants);
  const title = statusTitle(status, participants, readOnly);
  return (
    <span className={`status-pill status-${status}`} title={title} role="status">
      <span className="status-dot" aria-hidden />
      {label}
    </span>
  );
}
