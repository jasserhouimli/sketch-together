import { useCallback, useEffect, useRef, useState } from "react";
import BoardView from "./board/BoardView";
import Toolbar from "./board/Toolbar";
import { DEFAULT_COLOR, DEFAULT_WIDTH } from "./board/pen";
import type { Tool } from "./board/tools";
import { BoardApiError, fetchBoard } from "./room/api";
import { roomUrl } from "./room/route";
import { EditHistory } from "./board/history";
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
  const [histState, setHistState] = useState({ undo: false, redo: false });
  const itemsRef = useRef<BoardItem[]>([]);
  const editsRef = useRef<EditHistory | null>(null);

  // Session undo: inverses are new actions, so everyone converges. Created
  // lazily (never during render) and mirrored to state for the buttons.
  const edits = () => {
    if (!editsRef.current) editsRef.current = new EditHistory();
    return editsRef.current;
  };

  const setItems = useCallback(
    (items: BoardItem[]) => {
      itemsRef.current = items;
      setState({ status: "ready", board: { id: roomId, items } });
    },
    [roomId],
  );

  const touchHist = useCallback(() => {
    setHistState({ undo: edits().canUndo(), redo: edits().canRedo() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRemote = useCallback(
    (action: RemoteAction) => {
      const items = itemsRef.current;
      switch (action.type) {
        case "stroke.add":
        case "note.add":
        case "note.update": {
          if (!isValidItem(action.item)) return;
          const item = action.item as BoardItem;
          setItems(
            items.some((i) => i.id === item.id)
              ? items.map((i) => (i.id === item.id ? item : i))
              : [...items, item],
          );
          break;
        }
        case "item.move": {
          const move = action.item as { id?: unknown; x?: unknown; y?: unknown };
          if (typeof move.id !== "string") return;
          setItems(
            items.map((i) =>
              i.id === move.id && i.type === "note" && typeof move.x === "number" && typeof move.y === "number"
                ? { ...i, x: move.x, y: move.y }
                : i,
            ),
          );
          break;
        }
        case "item.delete": {
          const id = (action.item as { id?: unknown })?.id;
          if (typeof id !== "string") return;
          setItems(items.filter((i) => i.id !== id));
          break;
        }
        case "board.clear":
          setItems([]);
          break;
        default:
          return;
      }
      edits().clearRedo();
      touchHist();
    },
    [setItems, touchHist],
  );

  const applySnapshot = useCallback(
    (snapshot: JoinSnapshot) => {
      try {
        const parsed: unknown = JSON.parse(snapshot.itemsJson);
        const items = Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
        setItems(items as BoardItem[]);
      } catch {
        // Keep the REST-loaded board; the next refresh heals.
      }
    },
    [setItems],
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
        if (!cancelled) {
          itemsRef.current = board.items;
          setState({ status: "ready", board });
        }
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
  }, [roomId]);

  const upsertLocal = (item: BoardItem) =>
    setItems(
      itemsRef.current.some((i) => i.id === item.id)
        ? itemsRef.current.map((i) => (i.id === item.id ? item : i))
        : [...itemsRef.current, item],
    );

  const noteById = (id: string): NoteItem | undefined => {
    const found = itemsRef.current.find((i) => i.id === id);
    return found?.type === "note" ? found : undefined;
  };

  const itemById = (id: string): BoardItem | undefined =>
    itemsRef.current.find((i) => i.id === id);

  // Session undo: inverses are new actions, so everyone converges. Board
  // clears are intentionally not undoable (they would need a multi-action).

  /** Applies one action locally and broadcasts it. */
  const applyLocalAndSend = (type: string, item: unknown) => {
    if (type === "item.delete" && typeof (item as { id?: unknown })?.id === "string") {
      const id = (item as { id: string }).id;
      setItems(itemsRef.current.filter((i) => i.id !== id));
    } else if (
      (type === "stroke.add" || type === "note.add" || type === "note.update") &&
      isValidItem(item)
    ) {
      upsertLocal(item);
    } else if (type === "item.move") {
      const move = item as { id?: unknown; x?: unknown; y?: unknown };
      if (typeof move.id !== "string" || typeof move.x !== "number" || typeof move.y !== "number") return;
      const { id, x, y } = move;
      setItems(
        itemsRef.current.map((i) => (i.id === id && i.type === "note" ? { ...i, x, y } : i)),
      );
    } else if (type === "board.clear") {
      setItems([]);
    } else {
      return;
    }
    sendTracked(type, item);
  };

  const doUndo = () => {
    const entry = edits().popUndo();
    if (!entry) return;
    touchHist();
    applyLocalAndSend(entry.undo.type, entry.undo.item);
  };

  const doRedo = () => {
    const entry = edits().popRedo();
    if (!entry) return;
    touchHist();
    applyLocalAndSend(entry.redo.type, entry.redo.item);
  };

  const doUndoRef = useRef(doUndo);
  const doRedoRef = useRef(doRedo);
  useEffect(() => {
    doUndoRef.current = doUndo;
    doRedoRef.current = doRedo;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndoRef.current();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        doRedoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(roomId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", roomUrl(roomId));
    }
  };

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
          // Clearing is not undoable in v1 (it would need a multi-action).
          setItems([]);
          sendTracked("board.clear", {});
        }}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={histState.undo}
        canRedo={histState.redo}
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
        showEmptyHint={state.board.items.length === 0}
        onStrokeAdd={(stroke) => {
          if (!isValidStroke(stroke)) return;
          edits().record({
            undo: { type: "item.delete", item: { id: stroke.id } },
            redo: { type: "stroke.add", item: stroke },
          });
          touchHist();
          upsertLocal(stroke);
          sendTracked("stroke.add", stroke);
        }}
        onNoteAdd={(note) => {
          if (!isValidNote(note)) return;
          edits().record({
            undo: { type: "item.delete", item: { id: note.id } },
            redo: { type: "note.add", item: note },
          });
          touchHist();
          upsertLocal(note);
          sendTracked("note.add", note);
        }}
        onNoteMove={(id, x, y) =>
          setItems(
            itemsRef.current.map((i) => (i.id === id && i.type === "note" ? { ...i, x, y } : i)),
          )
        }
        onNoteMoveEnd={(id, startX, startY) => {
          const note = noteById(id);
          if (!note) return;
          edits().record({
            undo: { type: "item.move", item: { id, x: startX, y: startY } },
            redo: { type: "item.move", item: { id, x: note.x, y: note.y } },
          });
          touchHist();
          sendTracked("item.move", { id, x: note.x, y: note.y });
        }}
        onNoteEdit={(id, text) => {
          const note = noteById(id);
          const updated = note ? { ...note, text: text.slice(0, 2000) } : null;
          if (!updated || !isValidNote(updated)) return;
          edits().record({
            undo: { type: "note.update", item: note },
            redo: { type: "note.update", item: updated },
          });
          touchHist();
          upsertLocal(updated);
          sendTracked("note.update", updated);
        }}
        onDeleteItem={(id) => {
          const item = itemById(id);
          if (item) {
            edits().record({
              undo: {
                type: item.type === "stroke" ? "stroke.add" : "note.add",
                item,
              },
              redo: { type: "item.delete", item: { id } },
            });
            touchHist();
          }
          setItems(itemsRef.current.filter((i) => i.id !== id));
          sendTracked("item.delete", { id });
        }}
      />
    </main>
  );
}

function StatusPill({ status, participants }: { status: SyncStatus; participants: number }) {
  const label =
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
