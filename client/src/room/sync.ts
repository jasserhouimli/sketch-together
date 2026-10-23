import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from "@microsoft/signalr";
import { Outbox, type OutgoingAction } from "./outbox";
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
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const connRef = useRef<HubConnection | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const outboxRef = useRef(new Outbox());
  const pumpingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const handlersRef = useRef(handlers);
  const nameRef = useRef(displayName);
  // Latest handlers win: remote actions must see current board state.
  // Assigned during render (the standard use-latest pattern); the connection
  // effect below reads through this ref so it never needs to rebuild.
  handlersRef.current = handlers;
  nameRef.current = displayName;

  /**
   * Sends queued actions in order, one at a time, until the queue is empty or
   * the connection drops. A dropped connection keeps the queue for the next
   * attempt; a server rejection drops that action so later edits are not stuck
   * behind it.
   */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    const conn = connRef.current;
    if (!conn || conn.state !== HubConnectionState.Connected) return;
    pumpingRef.current = true;
    try {
      while (outboxRef.current.size > 0) {
        const action = outboxRef.current.peek();
        if (!action) break;
        const envelope = {
          boardId: roomId,
          actionId: action.actionId,
          type: action.type,
          item: action.item,
        };
        try {
          const savedAt = await conn.invoke<string>("SendAction", envelope);
          outboxRef.current.ack(action.actionId);
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
          outboxRef.current.ack(action.actionId);
        }
        setPendingCount(outboxRef.current.size);
      }
    } finally {
      pumpingRef.current = false;
      setPendingCount(outboxRef.current.size);
    }
  }, [roomId]);

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
      const snapshot = await connection.invoke<JoinSnapshot>(
        "JoinBoard",
        roomId,
        nameRef.current,
      );
      if (cancelled) return;
      setSelfId(typeof snapshot.selfId === "string" ? snapshot.selfId : null);
      setPeers(toRoster(snapshot.participants));
      handlersRef.current.onJoined(snapshot, outboxRef.current.all);
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
    // rebuild when they change identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  /**
   * Queues one durable action and starts sending. The action is applied to the
   * local board by the caller; this only owns delivery.
   */
  const send = useCallback(
    (type: string, item: unknown): void => {
      const action: OutgoingAction = { actionId: crypto.randomUUID(), type, item };
      if (outboxRef.current.enqueue(action) > 0) setSaveFailed(true);
      setPendingCount(outboxRef.current.size);
      void pump();
    },
    [pump],
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
    send,
    sendCursor,
    sendDragPreview,
    rename,
    pendingCount,
    lastSavedAt,
    saveFailed,
  };
}
