import { useCallback, useEffect, useRef, useState } from "react";
import BoardView from "./board/BoardView";
import Toolbar from "./board/Toolbar";
import { DEFAULT_COLOR, DEFAULT_WIDTH } from "./board/pen";
import { DEFAULT_NOTE_COLOR } from "./board/notes";
import type { Tool } from "./board/tools";
import { BoardApiError, fetchBoard } from "./room/api";
import { editRoomUrl, roomUrl } from "./room/route";
import { EditHistory } from "./board/history";
import { resolveDisplayName, sanitizeName, setStoredName } from "./room/presence";
import { useBoardSync, type JoinSnapshot, type RemoteAction } from "./room/sync";
import { applyAction } from "./board/applyAction";
import type { OutgoingAction } from "./room/outbox";
import {
  isValidItem,
  isValidNote,
  isValidStroke,
  type Board,
  type BoardItem,
  type NoteItem,
} from "./board/types";
import { PeerChips } from "./room/components/PeerChips";
import { StatusPill } from "./room/components/StatusPill";
import { SaveState } from "./room/components/SaveState";
import { useShortcuts } from "./room/hooks/useShortcuts";
import { useTransientPresence } from "./room/hooks/useTransientPresence";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; board: Board };

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * A shared room: loads once, edits live over SignalR, shows sync status.
 */
export default function RoomBoard({
  roomId,
  editKey,
}: {
  roomId: string;
  editKey: string | null;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [noteColor, setNoteColor] = useState<string>(DEFAULT_NOTE_COLOR);
  const [copied, setCopied] = useState<"view" | "edit" | null>(null);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [histState, setHistState] = useState({ undo: false, redo: false });
  const [displayName, setDisplayName] = useState(() => resolveDisplayName(sessionStore()));

  const itemsRef = useRef<BoardItem[]>([]);
  const editsRef = useRef<EditHistory | null>(null);
  const snapshotSeenRef = useRef(false);

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
  }, []);

  const retargetRef = useRef<(id: string, p: { x: number; y: number }) => void>(() => {});

  const applyRemote = useCallback(
    (action: RemoteAction) => {
      const next = applyAction(itemsRef.current, action);
      if (next === null) return;
      if (action.type === "item.move") {
        const move = action.item as { id?: unknown; x?: unknown; y?: unknown };
        if (
          typeof move.id === "string" &&
          typeof move.x === "number" &&
          typeof move.y === "number"
        ) {
          retargetRef.current(move.id, { x: move.x, y: move.y });
        }
      }
      setItems(next);
      edits().clearRedo();
      touchHist();
    },
    [setItems, touchHist],
  );

  const applySnapshot = useCallback(
    (snapshot: JoinSnapshot, pending: readonly OutgoingAction[]) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(snapshot.itemsJson);
      } catch {
        return;
      }
      let items = (Array.isArray(parsed) ? parsed.filter(isValidItem) : []) as BoardItem[];
      if (snapshot.canEdit === true) {
        for (const action of pending) {
          items = applyAction(items, action) ?? items;
        }
      }
      snapshotSeenRef.current = true;
      setItems(items);
    },
    [setItems],
  );

  const cursorHandlerRef = useRef<(raw: unknown) => void>(() => {});
  const previewHandlerRef = useRef<(raw: unknown) => void>(() => {});

  const {
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
  } = useBoardSync(roomId, displayName, editKey, {
    onRemoteAction: applyRemote,
    onJoined: applySnapshot,
    onCursor: (c) => cursorHandlerRef.current(c),
    onPreview: (p) => previewHandlerRef.current(p),
  });

  const {
    cursorViews,
    previewPositions,
    cursorThrottle,
    previewThrottle,
    onCursor,
    onPreview,
    handleRetargetPreview,
  } = useTransientPresence({
    peers,
    sendCursor,
    sendDragPreview,
  });

  useEffect(() => {
    cursorHandlerRef.current = onCursor;
    previewHandlerRef.current = onPreview;
    retargetRef.current = handleRetargetPreview;
  }, [onCursor, onPreview, handleRetargetPreview]);

  const editable = canEdit === true;

  const handleRename = (raw: string) => {
    if (raw.trim().length === 0) return;
    const name = sanitizeName(raw);
    setStoredName(sessionStore(), name);
    setDisplayName(name);
    rename(name);
  };

  useEffect(() => {
    let cancelled = false;
    fetchBoard(roomId).then(
      (board) => {
        if (!cancelled && !snapshotSeenRef.current) {
          itemsRef.current = board.items;
          setState({ status: "ready", board });
        }
      },
      (e) => {
        if (!cancelled && !snapshotSeenRef.current) {
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

  const applyLocalAndSend = (type: string, item: unknown) => {
    if (!editable) return;
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
    send(type, item);
  };

  const doUndo = () => {
    if (!editable) return;
    const entry = edits().popUndo();
    if (!entry) return;
    touchHist();
    applyLocalAndSend(entry.undo.type, entry.undo.item);
  };

  const doRedo = () => {
    if (!editable) return;
    const entry = edits().popRedo();
    if (!entry) return;
    touchHist();
    applyLocalAndSend(entry.redo.type, entry.redo.item);
  };

  useShortcuts({
    editable,
    onUndo: doUndo,
    onRedo: doRedo,
    onSelectTool: setTool,
  });

  const copyLink = async (which: "view" | "edit") => {
    const url = which === "edit" && editKey ? editRoomUrl(roomId, editKey) : roomUrl(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link:", url);
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
      {joinError && (
        <p className="room-error" role="alert">
          {joinError}
        </p>
      )}
      <Toolbar
        readOnly={!editable}
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
          if (!editable) return;
          setItems([]);
          send("board.clear", {});
        }}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={histState.undo}
        canRedo={histState.redo}
      />
      <div className="room-info">
        <PeerChips peers={peers} selfId={selfId} onRename={handleRename} />
        {canEdit === false && (
          <span
            className="status-pill"
            role="status"
            title="This is the view link. Open the edit link to change the board."
          >
            View only
          </span>
        )}
        <button type="button" className="clear-btn" onClick={() => copyLink("view")}>
          {copied === "view" ? "Copied!" : "Copy view link"}
        </button>
        {editable && editKey && (
          <button type="button" className="clear-btn" onClick={() => copyLink("edit")}>
            {copied === "edit" ? "Copied!" : "Copy edit link"}
          </button>
        )}
        <StatusPill status={status} participants={peers.length} readOnly={canEdit === false} />
        {canEdit !== false && (
          <SaveState
            pending={pendingCount}
            offline={status !== "live"}
            failed={saveFailed}
            at={lastSavedAt}
          />
        )}
      </div>
      <BoardView
        readOnly={!editable}
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
          send("stroke.add", stroke);
        }}
        onNoteAdd={(note) => {
          if (!isValidNote(note)) return;
          edits().record({
            undo: { type: "item.delete", item: { id: note.id } },
            redo: { type: "note.add", item: note },
          });
          touchHist();
          upsertLocal(note);
          send("note.add", note);
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
          send("item.move", { id, x: note.x, y: note.y });
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
          send("note.update", updated);
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
          send("item.delete", { id });
        }}
      />
    </main>
  );
}
