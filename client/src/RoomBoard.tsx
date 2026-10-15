import { useEffect, useState } from "react";
import BoardView from "./board/BoardView";
import Toolbar from "./board/Toolbar";
import { DEFAULT_COLOR, DEFAULT_WIDTH } from "./board/pen";
import type { Tool } from "./board/tools";
import { BoardApiError, fetchBoard } from "./room/api";
import { roomUrl } from "./room/route";
import { isValidNote, isValidStroke, type Board, type BoardItem, type NoteItem } from "./board/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; board: Board };

/** A shared room: loads items once, then edits locally (live sync is next). */
export default function RoomBoard({ roomId }: { roomId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBoard(roomId).then(
      (board) => {
        if (!cancelled) setState({ status: "ready", board });
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

  const setBoard = (board: Board) => setState({ status: "ready", board });

  const addItem = (item: BoardItem) =>
    setState((s) => (s.status === "ready" ? { ...s, board: { ...s.board, items: [...s.board.items, item] } } : s));

  const patchNote = (id: string, patch: Partial<NoteItem>) =>
    setState((s) =>
      s.status === "ready"
        ? {
            ...s,
            board: {
              ...s.board,
              items: s.board.items.map((i) => (i.id === id && i.type === "note" ? { ...i, ...patch } : i)),
            },
          }
        : s,
    );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(roomId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", roomUrl(roomId));
    }
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
        onClear={() => setBoard({ ...state.board, items: [] })}
        extra={
          <button type="button" className="clear-btn" onClick={copyLink}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        }
      />
      <BoardView
        board={state.board}
        tool={tool}
        color={color}
        width={width}
        onStrokeAdd={(stroke) => {
          if (isValidStroke(stroke)) addItem(stroke);
        }}
        onNoteAdd={(note) => {
          if (isValidNote(note)) addItem(note);
        }}
        onNoteMove={(id, x, y) => patchNote(id, { x, y })}
        onNoteMoveEnd={() => {}}
        onNoteEdit={(id, text) => patchNote(id, { text })}
        onDeleteItem={(id) =>
          setBoard({ ...state.board, items: state.board.items.filter((i) => i.id !== id) })
        }
      />
    </main>
  );
}
