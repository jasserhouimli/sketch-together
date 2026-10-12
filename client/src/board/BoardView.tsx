import { useEffect, useRef, useState } from "react";
import { toRelative } from "./geometry";
import { findItemAt } from "./hitTest";
import { renderBoard, renderItem } from "./renderer";
import type { Tool } from "./tools";
import { isValidStroke, newId, type Board, type Point } from "./types";

/** Canvas board with pointer drawing. Committed strokes lift to `board` state. */
export default function BoardView({
  board,
  onBoardChange,
  onDeleteItem,
  tool,
  color,
  width,
}: {
  board: Board;
  onBoardChange: (board: Board) => void;
  onDeleteItem: (id: string) => void;
  tool: Tool;
  color: string;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ id: string; points: Point[] } | null>(null);
  const [, setLiveTick] = useState(0);

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

  const finishStroke = () => {
    const drawing = drawingRef.current;
    drawingRef.current = null;
    if (!drawing || drawing.points.length === 0) return;
    const stroke = { id: drawing.id, type: "stroke" as const, color, width, points: drawing.points };
    if (!isValidStroke(stroke)) return;
    onBoardChange({ ...board, items: [...board.items, stroke] });
  };

  return (
    <canvas
      ref={canvasRef}
      className={`board-canvas tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={() => (drawingRef.current = null)}
    />
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
