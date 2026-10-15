import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from "@microsoft/signalr";

export type SyncStatus = "connecting" | "live" | "reconnecting" | "offline";

export interface RemoteAction {
  actionId: string;
  type: string;
  item: unknown;
}

export interface JoinSnapshot {
  itemsJson: string;
  participantCount: number;
}

/**
 * One SignalR connection per room. Sends local actions, applies accepted
 * remote actions through `onRemoteAction`, and tracks presence. Seen action
 * IDs suppress our own echoes and redeliveries; the set is bounded and a
 * refresh re-syncs full state anyway.
 */
export function useBoardSync(
  roomId: string,
  handlers: {
    onRemoteAction: (action: RemoteAction) => void;
    onJoined: (snapshot: JoinSnapshot) => void;
  },
) {
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [participants, setParticipants] = useState(1);
  const connRef = useRef<HubConnection | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const handlersRef = useRef(handlers);

  useEffect(() => {
    let cancelled = false;
    handlersRef.current = handlers;
    const connection = new HubConnectionBuilder()
      .withUrl("/hubs/board")
      .withAutomaticReconnect()
      .build();
    connRef.current = connection;

    connection.on("ReceiveAction", (action: RemoteAction) => {
      if (!action || typeof action.actionId !== "string") return;
      if (seenRef.current.has(action.actionId)) return;
      seenRef.current.add(action.actionId);
      if (seenRef.current.size > 2000) seenRef.current.clear();
      handlersRef.current.onRemoteAction(action);
    });
    connection.on("PresenceChanged", (count: unknown) => {
      if (typeof count === "number") setParticipants(count);
    });
    connection.onreconnecting(() => setStatus("reconnecting"));
    connection.onreconnected(() => setStatus("live"));
    connection.onclose(() => setStatus("offline"));

    connection
      .start()
      .then(() => connection.invoke<JoinSnapshot>("JoinBoard", roomId))
      .then((snapshot) => {
        if (cancelled) return;
        setStatus("live");
        setParticipants(snapshot.participantCount);
        handlersRef.current.onJoined(snapshot);
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      });

    return () => {
      cancelled = true;
      connRef.current = null;
      void connection.stop();
    };
    // Handlers ride handlersRef (latest wins); the connection must not rebuild per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const send = useCallback(
    (type: string, item: unknown) => {
      const conn = connRef.current;
      if (!conn || conn.state !== HubConnectionState.Connected) return;
      const actionId = crypto.randomUUID();
      seenRef.current.add(actionId);
      void conn
        .invoke("SendAction", { boardId: roomId, actionId, type, item })
        .catch(() => {
          // Offline-first v1: the action stays local; refresh re-syncs.
        });
    },
    [roomId],
  );

  return { status, participants, send };
}
