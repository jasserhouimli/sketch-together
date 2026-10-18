import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from "@microsoft/signalr";
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
 * Cursors and drag previews ride the same connection but are ephemeral: they
 * are fire-and-forget and never a source of truth.
 */
export function useBoardSync(
  roomId: string,
  displayName: string,
  handlers: {
    onRemoteAction: (action: RemoteAction) => void;
    onJoined: (snapshot: JoinSnapshot) => void;
    onCursor: (cursor: unknown) => void;
    onPreview: (preview: unknown) => void;
  },
) {
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const connRef = useRef<HubConnection | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const handlersRef = useRef(handlers);
  const nameRef = useRef(displayName);
  // Latest handlers win: remote actions must see current board state.
  // Assigned during render (the standard use-latest pattern); the connection
  // effect below reads through this ref so it never needs to rebuild.
  handlersRef.current = handlers;
  nameRef.current = displayName;

  useEffect(() => {
    let cancelled = false;
    const connection = new HubConnectionBuilder()
      .withUrl("/hubs/board")
      .withAutomaticReconnect()
      .build();
    connRef.current = connection;

    // Rejoining also re-reads the board: the server assigns a new connection
    // id on reconnect, so both group membership and the roster must be rebuilt.
    const join = async () => {
      const snapshot = await connection.invoke<JoinSnapshot>(
        "JoinBoard",
        roomId,
        nameRef.current,
      );
      if (cancelled) return;
      setSelfId(typeof snapshot.selfId === "string" ? snapshot.selfId : null);
      setPeers(toRoster(snapshot.participants));
      handlersRef.current.onJoined(snapshot);
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
      connRef.current = null;
      void connection.stop();
    };
    // The connection reads handlers through handlersRef, so it must not
    // rebuild when they change identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const send = useCallback(
    (type: string, item: unknown): Promise<string | null> => {
      const conn = connRef.current;
      if (!conn || conn.state !== HubConnectionState.Connected) return Promise.resolve(null);
      const actionId = crypto.randomUUID();
      seenRef.current.add(actionId);
      // Resolves to the server save timestamp; null when offline or rejected.
      return conn
        .invoke<string>("SendAction", { boardId: roomId, actionId, type, item })
        .catch(() => null);
    },
    [roomId],
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

  return { status, peers, selfId, send, sendCursor, sendDragPreview };
}
