import { useCallback, useEffect, useRef, useState } from "react";
import { toPixels, toRelative } from "./geometry";
import { findItemAt, findNoteAt } from "./hitTest";
import { renderBoard, renderItem, type CursorView } from "./renderer";
import { renderedPositions, stepFollow, type FollowState } from "../room/smoothing";
import { DEFAULT_NOTE_TEXT } from "./notes";
import type { Tool } from "./tools";
import {
  isValidNote,
  isValidStroke,
  newId,
  type Board,
  type Point,
} from "./types";

const NO_CURSORS: readonly CursorView[] = [];

interface Editing {
  id: string;
  draft: string;
  left: number;
  top: number;
}

/**
 * Canvas board: pen draws, eraser deletes, note tool adds/moves/edits notes.
 * Every mutation goes through a callback so the parent can persist and
 * broadcast it; the board prop stays the single source of truth. Remote
 * cursors and in-flight note previews are drawn on top as ephemeral layers.
 */
export default function BoardView({
  board,
  tool,
  color,
  width,
  noteColor,
  cursors = NO_CURSORS,
  notePreviews,
  onPointerMovePos,
  onStrokeAdd,
  onNoteAdd,
  onNoteMove,
  onNoteMoveEnd,
  onNoteEdit,
  onDeleteItem,
  showEmptyHint,
}: {
  board: Board;
  tool: Tool;
  color: string;
  width: number;
  noteColor: string;
  cursors?: readonly CursorView[];
  notePreviews?: ReadonlyMap<string, Point>;
  onPointerMovePos?: (point: Point) => void;
  showEmptyHint: boolean;
  onStrokeAdd: (stroke: { id: string; color: string; width: number; points: Point[] }) => void;
  onNoteAdd: (note: { id: string; x: number; y: number; text: string; color: string }) => void;
  onNoteMove: (id: string, x: number, y: number) => void;
  onNoteMoveEnd: (id: string, startX: number, startY: number) => void;
  onNoteEdit: (id: string, text: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ id: string; points: Point[] } | null>(null);
  const moveRef = useRef<{ id: string; dx: number; dy: number; startX: number; startY: number } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  // Ephemeral layers are animated rather than painted at each network update.
  const layersRef = useRef<{ cursors: readonly CursorView[]; previews: ReadonlyMap<string, Point> | undefined }>({
    cursors,
    previews: notePreviews,
  });
  const cursorFollowRef = useRef(new Map<string, FollowState>());
  const previewFollowRef = useRef(new Map<string, FollowState>());
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  // Remote positions interpolate in; the local player's own drawing never does.
  const smoothCursors = useCallback((): readonly CursorView[] => {
    const positions = renderedPositions(cursorFollowRef.current);
    return layersRef.current.cursors.map((cursor) => {
      const point = positions.get(cursor.id);
      return point ? { ...cursor, point } : cursor;
    });
  }, []);

  const smoothPreviews = useCallback((): ReadonlyMap<string, Point> | undefined => {
    const previews = layersRef.current.previews;
    if (!previews) return undefined;
    const positions = renderedPositions(previewFollowRef.current);
    const smoothed = new Map<string, Point>();
    for (const [id, fallback] of previews) smoothed.set(id, positions.get(id) ?? fallback);
    return smoothed;
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;
    renderBoard(ctx, board, cssWidth, cssHeight, {
      notePreviews: smoothPreviews(),
      cursors: smoothCursors(),
    });
    const live = drawingRef.current?.points ?? null;
    if (live && live.length > 0) {
      renderItem(ctx, { id: "live", type: "stroke", color, width, points: live }, cssWidth, cssHeight);
    }
  }, [board, color, width, smoothCursors, smoothPreviews]);

  // Latest redraw wins: the resize observer must always paint current state.
  const redrawRef = useRef(redraw);

  // Where the network says things are, kept in a ref so that animation does
  // not depend on React having re-rendered.
  useEffect(() => {
    layersRef.current = { cursors, previews: notePreviews };
  }, [cursors, notePreviews]);

  // One frame at a time, and only while something is still catching up, so an
  // idle board costs nothing.
  const animate = useCallback((first: number) => {
    const run = (now: number) => {
      const dt = Math.min(64, Math.max(1, now - lastFrameRef.current));
      lastFrameRef.current = now;
      const targets = layersRef.current;
      const moved = stepFollow(
        cursorFollowRef.current,
        targets.cursors.map((cursor) => [cursor.id, cursor.point] as const),
        dt,
      );
      cursorFollowRef.current = moved.states;
      const dragged = stepFollow(previewFollowRef.current, targets.previews ?? [], dt);
      previewFollowRef.current = dragged.states;
      redrawRef.current();
      rafRef.current = moved.moving || dragged.moving ? requestAnimationFrame(run) : null;
    };
    run(first);
  }, []);

  useEffect(() => {
    if (rafRef.current !== null) return;
    if (cursors.length === 0 && !notePreviews?.size) return;
    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(animate);
  }, [cursors, notePreviews, animate]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  // Size the backing store once and on element resizes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      redrawRef.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Repaint whenever the board, cursors, or previews change.
  useEffect(() => {
    redrawRef.current = redraw;
    redraw();
  }, [redraw]);

  const eventPoint = (e: React.PointerEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return toRelative(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  };

  const eraseAt = (p: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hit = findItemAt(board.items, p, rect.width, rect.height);
    if (hit) onDeleteItem(hit.id);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (tool === "eraser") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = eventPoint(e);
      if (p) eraseAt(p);
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
        moveRef.current = { id: hit.id, dx: hit.x - p.x, dy: hit.y - p.y, startX: hit.x, startY: hit.y };
      } else {
        const note = {
          id: newId(),
          type: "note" as const,
          x: p.x,
          y: p.y,
          text: DEFAULT_NOTE_TEXT,
          color: noteColor,
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
    redrawRef.current();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = eventPoint(e);
    if (p) onPointerMovePos?.(p);
    if (tool === "eraser") {
      if (e.buttons === 0) return;
      if (p) eraseAt(p);
      return;
    }
    const move = moveRef.current;
    if (move) {
      if (!p) return;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      onNoteMove(move.id, clamp(p.x + move.dx), clamp(p.y + move.dy));
      return;
    }
    const drawing = drawingRef.current;
    if (!drawing || !p) return;
    const last = drawing.points[drawing.points.length - 1];
    // Drop duplicate samples to keep stroke payloads small.
    if (last.x === p.x && last.y === p.y) return;
    drawing.points.push(p);
    redrawRef.current();
  };

  const onPointerUp = () => {
    const move = moveRef.current;
    moveRef.current = null;
    if (move) {
      onNoteMoveEnd(move.id, move.startX, move.startY);
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
      {showEmptyHint && (
        <div className="empty-hint" aria-hidden>
          <p>Pick the pen and draw — or drop a note.</p>
          <p>Share the link to draw together.</p>
        </div>
      )}
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
