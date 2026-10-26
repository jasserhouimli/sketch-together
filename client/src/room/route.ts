import { useEffect, useState } from "react";

/** A room URL: the id is the view link, the optional key comes from the edit link. */
export interface RoomRoute {
  roomId: string;
  editKey: string | null;
}

/**
 * Hash rooms (`#/b/{id}` for viewing, `#/b/{id}/{key}` for editing): no router
 * dependency, and the key stays in the fragment so it never reaches HTTP logs.
 */
export function roomRouteFromHash(hash: string): RoomRoute | null {
  const match = hash.match(/^#\/b\/([A-Za-z0-9]+)(?:\/([A-Za-z0-9_-]+))?\/?$/);
  if (!match) return null;
  return { roomId: match[1], editKey: match[2] ?? null };
}

function roomBase(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function roomUrl(id: string): string {
  return `${roomBase()}#/b/${id}`;
}

export function editRoomUrl(id: string, editKey: string): string {
  return `${roomBase()}#/b/${id}/${editKey}`;
}

export function useRoomRoute(): RoomRoute | null {
  const [route, setRoute] = useState<RoomRoute | null>(() =>
    typeof window === "undefined" ? null : roomRouteFromHash(window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoute(roomRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
