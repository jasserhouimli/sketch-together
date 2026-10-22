import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BoardView from "./board/BoardView";
import Toolbar from "./board/Toolbar";
import { DEFAULT_COLOR, DEFAULT_WIDTH } from "./board/pen";
import { DEFAULT_NOTE_COLOR } from "./board/notes";
import type { Tool } from "./board/tools";
import type { Point } from "./board/types";
import { BoardApiError, fetchBoard } from "./room/api";
import { roomUrl } from "./room/route";
import { EditHistory } from "./board/history";
import { resolveDisplayName, sanitizeName, setStoredName, DISPLAY_NAME_MAX, type Peer } from "./room/presence";
import { createThrottle } from "./room/throttle";
import {
  dropPreview,
  isCursorUpdate,
  isPreviewUpdate,
  keepPreviewsFrom,
  pruneCursors,
  prunePreviews,
  retargetPreview,
  toCursor,
  toPreview,
  upsertCursor,
  upsertPreview,
  type DragPreview,
  type RemoteCursor,
} from "./room/transient";
import { useBoardSync, type JoinSnapshot, type RemoteAction, type SyncStatus } from "./room/sync";
import {
  isValidItem,
  isValidNote,
  isValidStroke,
  type Board,
  type BoardItem,
  type NoteItem,
} from "./board/types";

/** Cursor updates are cheap but frequent; ~25/s looks smooth to a peer. */
const CURSOR_SEND_MS = 40;
/** Drag previews can be coarser: the release sends the exact position. */
const PREVIEW_SEND_MS = 60;
/** How often expired cursors/previews are swept out of state. */
const PRUNE_INTERVAL_MS = 500;
/**
 * A committed note move aims the peer's ghost at the final position; this is
 * how long it is given to glide there before the preview is dropped.
 */
const MOVE_SETTLE_MS = 260;

/** Bare-key tool switches, ignored while typing. */
const TOOL_SHORTCUTS: Record<string, Tool> = { p: "pen", n: "note", e: "eraser" };

const NO_CURSORS: ReadonlyMap<string, RemoteCursor> = new Map();
const NO_PREVIEWS: ReadonlyMap<string, DragPreview> = new Map();

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; board: Board };

/** Session storage can be unavailable (sandboxed frames, private mode). */
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** A shared room: loads once, edits live over SignalR, shows sync status. */
export default function RoomBoard({ roomId }: { roomId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [noteColor, setNoteColor] = useState<string>(DEFAULT_NOTE_COLOR);
  const [copied, setCopied] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [histState, setHistState] = useState({ undo: false, redo: false });
  // Names are cosmetic and per tab; the server sanitizes whatever we send.
  const [displayName, setDisplayName] = useState(() => resolveDisplayName(sessionStore()));
  const [cursors, setCursors] = useState(NO_CURSORS);
  const [previews, setPreviews] = useState(NO_PREVIEWS);
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

  // Ghosts that are gliding onto a committed position, keyed by note. The timer
  // is what finally drops them, so a peer that stops mid-drag still decays.
  const settleTimers = useRef(new Map<string, number>());

  const cancelPreviewDrop = useCallback((noteId: string) => {
    const timers = settleTimers.current;
    const pending = timers.get(noteId);
    if (pending === undefined) return;
    window.clearTimeout(pending);
    timers.delete(noteId);
  }, []);

  const schedulePreviewDrop = useCallback(
    (noteId: string) => {
      cancelPreviewDrop(noteId);
      const timers = settleTimers.current;
      timers.set(
        noteId,
        window.setTimeout(() => {
          timers.delete(noteId);
          setPreviews((prev) => dropPreview(prev, noteId));
        }, MOVE_SETTLE_MS),
      );
    },
    [cancelPreviewDrop],
  );

  useEffect(
    () => () => {
      for (const timer of settleTimers.current.values()) window.clearTimeout(timer);
      settleTimers.current.clear();
    },
    [],
  );

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
          if (typeof move.x !== "number" || typeof move.y !== "number") return;
          const id = move.id;
          const point = { x: move.x, y: move.y };
          // The committed position arrives: aim the in-flight ghost at it so it
          // glides the last few pixels instead of jumping, then let it go.
          setPreviews((prev) => retargetPreview(prev, id, point, Date.now()));
          schedulePreviewDrop(id);
          setItems(
            items.map((i) => (i.id === id && i.type === "note" ? { ...i, ...point } : i)),
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
    [setItems, touchHist, schedulePreviewDrop],
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

  const onCursor = useCallback((raw: unknown) => {
    if (!isCursorUpdate(raw)) return;
    const now = Date.now();
    setCursors((prev) => upsertCursor(prev, toCursor(raw, now)));
  }, []);

  const onPreview = useCallback(
    (raw: unknown) => {
      if (!isPreviewUpdate(raw)) return;
      const now = Date.now();
      // A fresh gesture supersedes any pending handoff for this note.
      cancelPreviewDrop(raw.noteId);
      setPreviews((prev) => upsertPreview(prev, toPreview(raw, now)));
    },
    [cancelPreviewDrop],
  );

  const { status, peers, selfId, send, sendCursor, sendDragPreview, rename } = useBoardSync(
    roomId,
    displayName,
    {
      onRemoteAction: applyRemote,
      onJoined: applySnapshot,
      onCursor,
      onPreview,
    },
  );

  /** Renames this tab: kept for the session, then announced to the room. */
  const handleRename = (raw: string) => {
    if (raw.trim().length === 0) return; // a blank edit keeps the current name
    const name = sanitizeName(raw);
    setStoredName(sessionStore(), name);
    setDisplayName(name);
    rename(name);
  };

  const participants = peers.length;

  // A peer that left takes its in-flight previews with it.
  useEffect(() => {
    setPreviews((prev) => keepPreviewsFrom(prev, peers));
  }, [peers]);

  // Sweep expired cursors and previews. Unchanged maps keep their identity, so
  // a quiet room does not re-render every tick.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => pruneCursors(prev, now));
      setPreviews((prev) => prunePreviews(prev, now));
    }, PRUNE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const cursorThrottle = useMemo(
    () => createThrottle((p: Point) => sendCursor(p.x, p.y), CURSOR_SEND_MS),
    [sendCursor],
  );
  const previewThrottle = useMemo(
    () =>
      createThrottle(
        (p: { noteId: string; x: number; y: number }) => sendDragPreview(p.noteId, p.x, p.y),
        PREVIEW_SEND_MS,
      ),
    [sendDragPreview],
  );
  useEffect(
    () => () => {
      cursorThrottle.cancel();
      previewThrottle.cancel();
    },
    [cursorThrottle, previewThrottle],
  );

  const cursorViews = useMemo(
    () => [...cursors.values()].map((c) => ({ id: c.id, name: c.name, color: c.color, point: c.point })),
    [cursors],
  );
  const previewPositions = useMemo(
    () => new Map([...previews.values()].map((p) => [p.noteId, p.point] as const)),
    [previews],
  );

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
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          doUndoRef.current();
        } else if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          doRedoRef.current();
        }
        return;
      }
      // Bare keys pick a tool, but never steal a modified shortcut.
      if (e.altKey || e.shiftKey) return;
      const shortcut = TOOL_SHORTCUTS[key];
      if (!shortcut) return;
      e.preventDefault();
      setTool(shortcut);
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
    <main className={`app${toolsOpen ? " tools-open" : ""}`}>
      <Toolbar
        tool={tool}
        color={color}
        width={width}
        noteColor={noteColor}
        open={toolsOpen}
        onToggle={() => setToolsOpen((open) => !open)}
        onToolChange={setTool}
        onColorChange={setColor}
        onWidthChange={setWidth}
        onNoteColorChange={setNoteColor}
        onClear={() => {
          // Clearing is not undoable in v1 (it would need a multi-action).
          setItems([]);
          sendTracked("board.clear", {});
        }}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={histState.undo}
        canRedo={histState.redo}
      />
      <div className="room-info">
        <PeerChips peers={peers} selfId={selfId} onRename={handleRename} />
        <button type="button" className="clear-btn" onClick={copyLink}>
          {copied ? "Copied!" : "Copy link"}
        </button>
        <StatusPill status={status} participants={participants} />
        <SaveState pending={pendingSaves > 0} failed={saveFailed} at={lastSavedAt} />
      </div>
      <BoardView
        board={state.board}
        tool={tool}
        color={color}
        width={width}
        noteColor={noteColor}
        cursors={cursorViews}
        notePreviews={previewPositions}
        onPointerMovePos={(p) => cursorThrottle(p)}
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
        onNoteMove={(id, x, y) => {
          setItems(
            itemsRef.current.map((i) => (i.id === id && i.type === "note" ? { ...i, x, y } : i)),
          );
          previewThrottle({ noteId: id, x, y });
        }}
        onNoteMoveEnd={(id, startX, startY) => {
          previewThrottle.cancel();
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

/**
 * Who is here, with the same colors their cursors use. Your own chip is the
 * rename control: click it, type, then Enter or click away to keep the name,
 * Escape to drop the edit.
 */
function PeerChips({
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
