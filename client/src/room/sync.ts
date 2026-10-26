import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from "@microsoft/signalr";
import { loadOutbox, saveOutbox, type OutgoingAction } from "./outbox";
import { toRoster, type Peer } from "./presence";

export type SyncStatus = "connecting" | "live" | "reconnecting" | "offline";

export interface RemoteAction {
  actionId: string;
  type: string;
  item: unknown;
}

export interface JoinSnapshot {
  itemsJson: string;
  selfId?: string;
  participants?: unknown;
  /** Whether this connection may change the board (edit link, not view link). */
  canEdit?: unknown;
}

/**
 * One SignalR connection per room. Sends local actions, applies accepted
 * remote actions through `onRemoteAction`, and tracks the participant roster.
 * Seen action IDs suppress our own echoes and redeliveries; the set is bounded
 * and a refresh re-syncs full state anyway.
 *
 * Durable actions go through an ordered outbox: one is in flight at a time and
 * anything sent while offline waits for the next connection. The server acks
 * with a save time; a rejected action is dropped so it cannot block the queue.
 *
 * Cursors and drag previews ride the same connection but are ephemeral: they
 * are fire-and-forget and never a source of truth.
 */
export function useBoardSync(
  roomId: string,
  displayName: string,
  editKey: string | null,
  handlers: {
    onRemoteAction: (action: RemoteAction) => void;
    onJoined: (snapshot: JoinSnapshot, pending: readonly OutgoingAction[]) => void;
    onCursor: (cursor: unknown) => void;
    onPreview: (preview: unknown) => void;
  },
) {
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  // null until the first join answers; kept across reconnects until they do.
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  // The queue survives a refresh in this tab, so load it before the first paint.
  const [outbox] = useState(() => loadOutbox(sessionStore(), roomId));
  const [pendingCount, setPendingCount] = useState(outbox.size);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const connRef = useRef<HubConnection | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const pumpingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const handlersRef = useRef(handlers);
  const nameRef = useRef(displayName);
  const canEditRef = useRef<boolean | null>(null);
  // Latest handlers win: remote actions must see current board state.
  // Assigned during render (the standard use-latest pattern); the connection
  // effect below reads through this ref so it never needs to rebuild.
  handlersRef.current = handlers;
  nameRef.current = displayName;

  /** Mirrors the queue to sessionStorage so a refresh keeps pending edits. */
  const persist = useCallback(() => {
    saveOutbox(sessionStore(), roomId, outbox.all);
  }, [outbox, roomId]);

  /**
   * Sends queued actions in order, one at a time, until the queue is empty or
   * the connection drops. A dropped connection keeps the queue for the next
   * attempt; a server rejection drops that action so later edits are not stuck
   * behind it.
   */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    // View-only connections keep their queue untouched: opening the edit link
    // in this tab can still flush edits queued while this tab was an editor.
    if (canEditRef.current !== true) return;
    const conn = connRef.current;
    if (!conn || conn.state !== HubConnectionState.Connected) return;
    pumpingRef.current = true;
    try {
      while (outbox.size > 0) {
        const action = outbox.peek();
        if (!action) break;
        const envelope = {
          boardId: roomId,
          actionId: action.actionId,
          type: action.type,
          item: action.item,
        };
        try {
          const savedAt = await conn.invoke<string>("SendAction", envelope);
          outbox.ack(action.actionId);
          persist();
          setLastSavedAt(savedAt);
          setSaveFailed(false);
        } catch (error) {
          setSaveFailed(true);
          if (conn.state !== HubConnectionState.Connected) break;
          // The per-board lock has a short wait; a valid edit can hit it under
          // contention, so keep it queued and try again shortly.
          if (error instanceof Error && /busy/i.test(error.message)) {
            retryTimerRef.current ??= window.setTimeout(() => {
              retryTimerRef.current = null;
              void pump();
            }, 1000);
            break;
          }
          outbox.ack(action.actionId);
          persist();
        }
        setPendingCount(outbox.size);
      }
    } finally {
      pumpingRef.current = false;
      setPendingCount(outbox.size);
    }
  }, [outbox, persist, roomId]);

  useEffect(() => {
    let cancelled = false;
    const connection = new HubConnectionBuilder()
      .withUrl("/hubs/board")
      .withAutomaticReconnect()
      .build();
    connRef.current = connection;

    // Rejoining also re-reads the board: the server assigns a new connection
    // id on reconnect, so both group membership and the roster must be rebuilt.
    // Pending actions are replayed onto that snapshot so a reconnect does not
    // roll back edits the server has not seen yet.
    const join = async () => {
      let snapshot: JoinSnapshot;
      try {
        snapshot = await connection.invoke<JoinSnapshot>(
          "JoinBoard",
          roomId,
          nameRef.current,
          editKey,
        );
      } catch (error) {
        // A bad edit key must be visible, not a silent downgrade to viewing.
        // A hub rejection means the server refused (so this tab is read-only);
        // a transport failure leaves permission unknown.
        if (!cancelled) {
          setJoinError(hubMessage(error));
          if (isHubRejection(error)) {
            canEditRef.current = false;
            setCanEdit(false);
          }
        }
        throw error;
      }
      if (cancelled) return;
      setJoinError(null);
      const allowed = snapshot.canEdit === true;
      canEditRef.current = allowed;
      setCanEdit(allowed);
      setSelfId(typeof snapshot.selfId === "string" ? snapshot.selfId : null);
      setPeers(toRoster(snapshot.participants));
      handlersRef.current.onJoined(snapshot, outbox.all);
      void pump();
    };

    connection.on("ReceiveAction", (action: RemoteAction) => {
      if (!action || typeof action.actionId !== "string") return;
      if (seenRef.current.has(action.actionId)) return;
      seenRef.current.add(action.actionId);
      if (seenRef.current.size > 2000) seenRef.current.clear();
      handlersRef.current.onRemoteAction(action);
    });
    connection.on("PresenceChanged", (roster: unknown) => {
      setPeers(toRoster(roster));
    });
    connection.on("CursorMoved", (cursor: unknown) => {
      handlersRef.current.onCursor(cursor);
    });
    connection.on("DragPreviewMoved", (preview: unknown) => {
      handlersRef.current.onPreview(preview);
    });
    connection.onreconnecting(() => setStatus("reconnecting"));
    connection.onreconnected(() => {
      setStatus("live");
      void join().catch(() => {});
    });
    connection.onclose(() => {
      setStatus("offline");
      setPeers([]);
      setSelfId(null);
    });

    connection
      .start()
      .then(join)
      .then(() => {
        if (!cancelled) setStatus("live");
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      });

    return () => {
      cancelled = true;
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      connRef.current = null;
      void connection.stop();
    };
    // The connection reads handlers through handlersRef, so it must not
    // rebuild when they change identity each render. The edit key is part of
    // identity: it decides whether this connection may write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, editKey]);

  /**
   * Queues one durable action and starts sending. The action is applied to the
   * local board by the caller; this only owns delivery.
   */
  const send = useCallback(
    (type: string, item: unknown): void => {
      const action: OutgoingAction = { actionId: crypto.randomUUID(), type, item };
      if (outbox.enqueue(action) > 0) setSaveFailed(true);
      persist();
      setPendingCount(outbox.size);
      void pump();
    },
    [outbox, persist, pump],
  );

  // Ephemeral sends are dropped when the connection is down: the next pointer
  // move re-sends, so there is nothing to queue.
  const sendCursor = useCallback((x: number, y: number) => {
    const conn = connRef.current;
    if (!conn || conn.state !== HubConnectionState.Connected) return;
    void conn.invoke("UpdateCursor", x, y).catch(() => {});
  }, []);

  const sendDragPreview = useCallback((noteId: string, x: number, y: number) => {
    const conn = connRef.current;
    if (!conn || conn.state !== HubConnectionState.Connected) return;
    void conn.invoke("DragPreview", noteId, x, y).catch(() => {});
  }, []);

  // Presence only: the server re-broadcasts the roster, so nothing durable
  // changes. Offline the name still updates locally and the next join sends it.
  const rename = useCallback((name: string) => {
    const conn = connRef.current;
    if (!conn || conn.state !== HubConnectionState.Connected) return;
    void conn.invoke("Rename", name).catch(() => {});
  }, []);

  return {
    status,
    peers,
    selfId,
    canEdit,
    joinError,
    send,
    sendCursor,
    sendDragPreview,
    rename,
    pendingCount,
    lastSavedAt,
    saveFailed,
  };
}

/** SignalR wraps a HubException as "… HubException: <message>". */
function isHubRejection(error: unknown): boolean {
  return error instanceof Error && /HubException:/.test(error.message);
}

function hubMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) return "Could not join the board.";
  const wrapped = error.message.match(/HubException:\s*([\s\S]+)$/);
  return wrapped ? wrapped[1].trim() : error.message;
}

/** Session storage can be unavailable (sandboxed frames, private mode). */
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
