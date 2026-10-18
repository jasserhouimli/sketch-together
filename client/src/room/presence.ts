// Display identity for a room. There are no accounts, so a name is cosmetic:
// the client picks one and stores it per tab, and the server sanitizes it again
// before broadcasting. Nothing here is authentication.

import { isColor } from "../board/types";

export const DISPLAY_NAME_MAX = 24;
export const FALLBACK_NAME = "Guest";
export const DEFAULT_PEER_COLOR = "#495057";

const STORAGE_KEY = "sketchtogether.display-name";

const ADJECTIVES = [
  "Amber",
  "Cobalt",
  "Coral",
  "Ember",
  "Indigo",
  "Jade",
  "Lilac",
  "Ochre",
  "Olive",
  "Rust",
  "Sage",
  "Slate",
  "Teal",
  "Violet",
];

const ANIMALS = [
  "Badger",
  "Crane",
  "Falcon",
  "Fox",
  "Gecko",
  "Heron",
  "Ibis",
  "Lynx",
  "Marten",
  "Otter",
  "Puffin",
  "Quokka",
  "Raven",
  "Wolf",
];

/** A participant in the room, as reported by the server roster. */
export interface Peer {
  id: string;
  name: string;
  color: string;
}

/** Mirrors the server rule: trim, drop control characters, cap the length. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_NAME;
  let cleaned = "";
  for (const ch of raw) {
    if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127) continue;
    if (/\s/.test(ch)) {
      if (cleaned.length > 0 && !cleaned.endsWith(" ")) cleaned += " ";
      continue;
    }
    cleaned += ch;
    if (cleaned.length === DISPLAY_NAME_MAX) break;
  }
  return cleaned.trim().length === 0 ? FALLBACK_NAME : cleaned.trim();
}

export function randomName(random: () => number = Math.random): string {
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(random() * ANIMALS.length)];
  return `${adjective} ${animal}`;
}

export function getStoredName(storage: Storage | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null; // storage can be disabled; a name is optional
  }
}

export function setStoredName(storage: Storage | null, name: string): void {
  try {
    storage?.setItem(STORAGE_KEY, name);
  } catch {
    // Ignore: the name still works for this session.
  }
}

/** Stored name if there is one, otherwise a fresh random one that gets stored. */
export function resolveDisplayName(
  storage: Storage | null,
  random: () => number = Math.random,
): string {
  const stored = getStoredName(storage);
  if (stored !== null) {
    const sanitized = sanitizeName(stored);
    if (sanitized !== FALLBACK_NAME) return sanitized;
  }
  const name = randomName(random);
  setStoredName(storage, name);
  return name;
}

/**
 * Normalizes a roster from the wire. Names and colors are treated as untrusted
 * even though the server sanitizes them; a malformed entry is dropped.
 */
export function toRoster(value: unknown): Peer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const peer = entry as Record<string, unknown>;
    if (typeof peer.id !== "string" || peer.id.length === 0) return [];
    return [
      {
        id: peer.id,
        name: sanitizeName(peer.name),
        color: isColor(peer.color) ? peer.color : DEFAULT_PEER_COLOR,
      },
    ];
  });
}

/** Roster minus ourselves, for the "others in this room" chips. */
export function peersExcept(peers: readonly Peer[], selfId: string | null): Peer[] {
  return peers.filter((peer) => peer.id !== selfId);
}
