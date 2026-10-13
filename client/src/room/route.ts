import { useEffect, useState } from "react";

/** Hash rooms (`#/b/{id}`): no router dependency, links stay shareable. */
export function roomIdFromHash(hash: string): string | null {
  const match = hash.match(/^#\/b\/([A-Za-z0-9]+)\/?$/);
  return match ? match[1] : null;
}

export function roomUrl(id: string): string {
  return `${window.location.origin}${window.location.pathname}#/b/${id}`;
}

export function useRoomId(): string | null {
  const [roomId, setRoomId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : roomIdFromHash(window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoomId(roomIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return roomId;
}
