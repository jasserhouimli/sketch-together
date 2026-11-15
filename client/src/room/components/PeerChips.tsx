import { useRef, useState } from "react";
import { DISPLAY_NAME_MAX, type Peer } from "../presence";

/**
 * Who is here, with the same colors their cursors use. Your own chip is the
 * rename control: click it, type, then Enter or click away to keep the name,
 * Escape to drop the edit.
 */
export function PeerChips({
  peers,
  selfId,
  onRename,
}: {
  peers: Peer[];
  selfId: string | null;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Enter, Escape and blur can all end the same edit; only the first counts.
  const finishingRef = useRef(false);

  if (peers.length === 0) return null;
  const shown = peers.slice(0, 4);
  const hidden = peers.length - shown.length;

  const startEdit = (name: string) => {
    finishingRef.current = false;
    setDraft(name);
  };

  const finishEdit = (keep: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const value = draft;
    setDraft(null);
    if (keep && value !== null) onRename(value);
  };

  return (
    <span className="peer-chips" role="list" aria-label="People in this room">
      {shown.map((peer) => {
        const you = peer.id === selfId;
        return (
          <span
            key={peer.id}
            role="listitem"
            className={`peer-chip${you ? " peer-chip-self" : ""}`}
            title={you ? `${peer.name} (you) — click to rename` : peer.name}
          >
            <span className="peer-dot" style={{ backgroundColor: peer.color }} aria-hidden />
            {you && draft !== null ? (
              <input
                className="peer-name-input"
                value={draft}
                autoFocus
                maxLength={DISPLAY_NAME_MAX}
                aria-label="Your display name"
                spellCheck={false}
                autoComplete="off"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => finishEdit(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    finishEdit(true);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    finishEdit(false);
                  }
                }}
              />
            ) : you ? (
              <button
                type="button"
                className="peer-name peer-name-edit"
                onClick={() => startEdit(peer.name)}
                aria-label={`Change your name (currently ${peer.name})`}
                title="Change your name"
              >
                {peer.name} (you)
              </button>
            ) : (
              <span className="peer-name">{peer.name}</span>
            )}
          </span>
        );
      })}
      {hidden > 0 && <span className="peer-chip">+{hidden}</span>}
    </span>
  );
}
