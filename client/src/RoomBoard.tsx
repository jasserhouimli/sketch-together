import { useCallback, useEffect, useRef, useState } from "react";
import BoardView from "./board/BoardView";
import Toolbar from "./board/Toolbar";
import { DEFAULT_COLOR, DEFAULT_WIDTH } from "./board/pen";
import type { Tool } from "./board/tools";
import { BoardApiError, fetchBoard } from "./room/api";
import { roomUrl } from "./room/route";
import { useBoardSync, type JoinSnapshot, type RemoteAction, type SyncStatus } from "./room/sync";
import {
  isValidItem,
  isValidNote,
  isValidStroke,
  type Board,
  type BoardItem,
  type NoteItem,
} from "./board/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; board: Board };

/** A shared room: loads once, edits live over SignalR, shows sync status. */
export default function RoomBoard({ roomId }: { roomId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [copied, setCopied] = useState(false);
  const itemsRef = useRef<BoardItem[]>([]);

  const setBoard = useCallback((board: Board) => {
    itemsRef.current = board.items;
    setState({ status: "ready", board });
  }, []);

  const applyRemote = useCallback(
    (action: RemoteAction) => {
      if (state.status !== "ready") return;
      const board = { ...state.board, items: itemsRef.current };
      switch (action.type) {
        case "stroke.add":
        case "note.add":
        case "note.update": {
          if (!isValidItem(action.item)) return;
          const items = board.items.some((i) => i.id === (action.item as BoardItem).id)
            ? board.items.map((i) => (i.id === (action.item as BoardItem).id ? (action.item as BoardItem) : i))
            : [...board.items, action.item as BoardItem];
          setBoard({ ...board, items });
          break;
        }
        case "item.move": {
          const move = action.item as { id?: unknown; x?: unknown; y?: unknown };
          if (typeof move.id !== "string") return;
          setBoard({
            ...board,
            items: board.items.map((i) =>
              i.id === move.id && i.type === "note" && typeof move.x === "number" && typeof move.y === "number"
                ? { ...i, x: move.x, y: move.y }
                : i,
            ),
          });
          break;
        }
        case "item.delete": {
          const id = (action.item as { id?: unknown })?.id;
          if (typeof id !== "string") return;
          setBoard({ ...board, items: board.items.filter((i) => i.id !== id) });
          break;
        }
        case "board.clear":
          setBoard({ ...board, items: [] });
          break;
      }
    },
    [state, setBoard],
  );

  const applySnapshot = useCallback(
    (snapshot: JoinSnapshot) => {
      try {
        const parsed: unknown = JSON.parse(snapshot.itemsJson);
        const items = Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
        setBoard({ id: roomId, items: items as BoardItem[] });
      } catch {
        // Keep the REST-loaded board; the next refresh heals.
      }
    },
    [roomId, setBoard],
  );

  const { status, participants, send } = useBoardSync(roomId, {
    onRemoteAction: applyRemote,
    onJoined: applySnapshot,
  });

  const [pendingSaves, setPendingSaves] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const sendTracked = (type: string, item: unknown) => {
    setPendingSaves((n) => n + 1);
    void send(type, item).then((at) => {
      setPendingSaves((n) => Math.max(0, n - 1));
      // Null means offline or rejected: the edit stays local only.
      if (at) {
        setLastSavedAt(at);
        setSaveFailed(false);
      } else {
        setSaveFailed(true);
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    fetchBoard(roomId).then(
      (board) => {
        if (!cancelled) setBoard(board);
      },
      (e) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof BoardApiError ? e.message : "Could not open the board.",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [roomId, setBoard]);

  if (state.status === "loading") return <main className="app"><p className="notice">Opening board…</p></main>;
  if (state.status === "error") {
    return (
      <main className="app">
        <div className="notice">
          <p>{state.message}</p>
          <p>
            <a href={window.location.pathname}>Create a new board</a>
          </p>
        </div>
      </main>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(roomId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", roomUrl(roomId));
    }
  };

  const upsertLocal = (item: BoardItem) =>
    setBoard({
      ...state.board,
      items: state.board.items.some((i) => i.id === item.id)
        ? state.board.items.map((i) => (i.id === item.id ? item : i))
        : [...state.board.items, item],
    });

  const noteById = (id: string): NoteItem | undefined => {
    const found = itemsRef.current.find((i) => i.id === id);
    return found?.type === "note" ? found : undefined;
  };

  return (
    <main className="app">
      <Toolbar
        tool={tool}
        color={color}
        width={width}
        onToolChange={setTool}
        onColorChange={setColor}
        onWidthChange={setWidth}
        onClear={() => {
          setBoard({ ...state.board, items: [] });
          sendTracked("board.clear", {});
        }}
        extra={
          <>
            <button type="button" className="clear-btn" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link"}
            </button>
            <StatusPill status={status} participants={participants} />
            <SaveState pending={pendingSaves > 0} failed={saveFailed} at={lastSavedAt} />
          </>
        }
      />
      <BoardView
        board={state.board}
        tool={tool}
        color={color}
        width={width}
        onStrokeAdd={(stroke) => {
          if (!isValidStroke(stroke)) return;
          upsertLocal(stroke);
          sendTracked("stroke.add", stroke);
        }}
        onNoteAdd={(note) => {
          if (!isValidNote(note)) return;
          upsertLocal(note);
          sendTracked("note.add", note);
        }}
        onNoteMove={(id, x, y) =>
          setBoard({
            ...state.board,
            items: state.board.items.map((i) => (i.id === id && i.type === "note" ? { ...i, x, y } : i)),
          })
        }
        onNoteMoveEnd={(id) => {
          const note = noteById(id);
          if (note) sendTracked("item.move", { id, x: note.x, y: note.y });
        }}
        onNoteEdit={(id, text) => {
          const note = noteById(id);
          const updated = note ? { ...note, text: text.slice(0, 2000) } : null;
          if (!updated || !isValidNote(updated)) return;
          upsertLocal(updated);
          sendTracked("note.update", updated);
        }}
        onDeleteItem={(id) => {
          setBoard({ ...state.board, items: state.board.items.filter((i) => i.id !== id) });
          sendTracked("item.delete", { id });
        }}
      />
    </main>
  );
}

function StatusPill({ status, participants }: { status: SyncStatus; participants: number }) {  const label =
    status === "live"
      ? `Live · ${participants}`
      : status === "connecting"
        ? "Connecting…"
        : status === "reconnecting"
          ? "Reconnecting…"
          : "Offline";
  const title =
    status === "live"
      ? `${participants} participant${participants === 1 ? "" : "s"} connected`
      : "Edits stay on this device until the connection returns";
  return (
    <span className={`status-pill status-${status}`} title={title} role="status">
      <span className="status-dot" aria-hidden />
      {label}
    </span>
  );
}

function SaveState({ pending, failed, at }: { pending: boolean; failed: boolean; at: string | null }) {
  if (pending) {
    return (
      <span className="status-pill" role="status" title="Sending the edit to the server">
        Saving…
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
