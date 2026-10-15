import { useEffect, useRef, useState } from "react";
import { toPixels, toRelative } from "./geometry";
import { findItemAt, findNoteAt } from "./hitTest";
import { renderBoard, renderItem } from "./renderer";
import type { Tool } from "./tools";
import {
  isValidNote,
  isValidStroke,
  newId,
  type Board,
  type Point,
} from "./types";

export const DEFAULT_NOTE_COLOR = "#fff2a8";
export const DEFAULT_NOTE_TEXT = "New note";

interface Editing {
  id: string;
  draft: string;
  left: number;
  top: number;
}

/**
 * Canvas board: pen draws, eraser deletes, note tool adds/moves/edits notes.
 * Every mutation goes through a callback so the parent can persist and
 * broadcast it; the board prop stays the single source of truth.
 */
export default function BoardView({
  board,
  tool,
  color,
  width,
  onStrokeAdd,
  onNoteAdd,
  onNoteMove,
  onNoteMoveEnd,
  onNoteEdit,
  onDeleteItem,
}: {
  board: Board;
  tool: Tool;
  color: string;
  width: number;
  onStrokeAdd: (stroke: { id: string; color: string; width: number; points: Point[] }) => void;
  onNoteAdd: (note: { id: string; x: number; y: number; text: string; color: string }) => void;
  onNoteMove: (id: string, x: number, y: number) => void;
  onNoteMoveEnd: (id: string) => void;
  onNoteEdit: (id: string, text: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ id: string; points: Point[] } | null>(null);
  const moveRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [, setLiveTick] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);

  // Redraw committed items whenever the board changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      draw(canvas, board, drawingRef.current?.points ?? null, color, width);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  const eventPoint = (e: React.PointerEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return toRelative(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  };

  const eraseAt = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const p = eventPoint(e);
    if (!p) return;
    const hit = findItemAt(board.items, p, rect.width, rect.height);
    if (hit) onDeleteItem(hit.id);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (tool === "eraser") {
      e.currentTarget.setPointerCapture(e.pointerId);
      eraseAt(e);
      return;
    }
    if (tool === "note") {
      const canvas = canvasRef.current;
      const p = eventPoint(e);
      if (!canvas || !p) return;
      const rect = canvas.getBoundingClientRect();
      const hit = findNoteAt(board.items, p, rect.width, rect.height);
      e.currentTarget.setPointerCapture(e.pointerId);
      if (hit && hit.type === "note") {
        // Grab the note: keep the offset so it doesn't jump to the cursor.
        moveRef.current = { id: hit.id, dx: hit.x - p.x, dy: hit.y - p.y };
      } else {
        const note = {
          id: newId(),
          type: "note" as const,
          x: p.x,
          y: p.y,
          text: DEFAULT_NOTE_TEXT,
          color: DEFAULT_NOTE_COLOR,
        };
        if (isValidNote(note)) onNoteAdd(note);
      }
      return;
    }
    if (tool !== "pen") return;
    const p = eventPoint(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = { id: newId(), points: [p] };
    setLiveTick((t) => t + 1);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === "eraser") {
      if (e.buttons === 0) return;
      eraseAt(e);
      return;
    }
    const move = moveRef.current;
    if (move) {
      const p = eventPoint(e);
      if (!p) return;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      onNoteMove(move.id, clamp(p.x + move.dx), clamp(p.y + move.dy));
      return;
    }
    const drawing = drawingRef.current;
    if (!drawing) return;
    const p = eventPoint(e);
    if (!p) return;
    const last = drawing.points[drawing.points.length - 1];
    // Drop duplicate samples to keep stroke payloads small.
    if (last.x === p.x && last.y === p.y) return;
    drawing.points.push(p);
    const canvas = canvasRef.current;
    if (canvas) draw(canvas, board, drawing.points, color, width);
  };

  const onPointerUp = () => {
    const move = moveRef.current;
    moveRef.current = null;
    if (move) {
      onNoteMoveEnd(move.id);
      return;
    }
    finishStroke();
  };

  const finishStroke = () => {
    const drawing = drawingRef.current;
    drawingRef.current = null;
    if (!drawing || drawing.points.length === 0) return;
    const stroke = { id: drawing.id, type: "stroke" as const, color, width, points: drawing.points };
    if (!isValidStroke(stroke)) return;
    onStrokeAdd(stroke);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const p = toRelative(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    const hit = findNoteAt(board.items, p, rect.width, rect.height);
    if (hit && hit.type === "note") {
      const pos = toPixels({ x: hit.x, y: hit.y }, rect.width, rect.height);
      setEditing({ id: hit.id, draft: hit.text, left: pos.x, top: pos.y });
    }
  };

  const commitEdit = () => {
    if (!editing) return;
    const draft = editing.draft.slice(0, 2000);
    const id = editing.id;
    setEditing(null);
    const current = board.items.find((i) => i.id === id);
    if (current?.type !== "note" || current.text === draft) return;
    onNoteEdit(id, draft);
  };

  return (
    <div className="board-wrap">
      <canvas
        ref={canvasRef}
        className={`board-canvas tool-${tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drawingRef.current = null;
          moveRef.current = null;
        }}
        onDoubleClick={onDoubleClick}
      />
      {editing && (
        <textarea
          className="note-editor"
          style={{ left: editing.left, top: editing.top }}
          autoFocus
          value={editing.draft}
          onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(null);
          }}
          aria-label="Edit note"
        />
      )}
    </div>
  );
}

function draw(
  canvas: HTMLCanvasElement,
  board: Board,
  live: Point[] | null,
  color: string,
  width: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;
  renderBoard(ctx, board, cssWidth, cssHeight);
  if (live && live.length > 0) {
    renderItem(
      ctx,
      { id: "live", type: "stroke", color, width, points: live },
      cssWidth,
      cssHeight,
    );
  }
}
