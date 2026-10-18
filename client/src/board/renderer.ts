import { toPixels } from "./geometry";
import type { Board, BoardItem, NoteItem, Point, StrokeItem } from "./types";

export const NOTE_WIDTH = 160;
export const NOTE_HEIGHT = 100;

/** A remote participant's cursor: relative coords plus how to label it. */
export interface CursorView {
  id: string;
  name: string;
  color: string;
  point: Point;
}

export interface RenderOptions {
  /**
   * Ephemeral note positions from peers who are dragging right now. The
   * durable item.move is the truth; these only smooth the gesture out.
   */
  notePreviews?: ReadonlyMap<string, Point>;
  cursors?: readonly CursorView[];
}

/** Draws a full board: strokes, notes, previewed note positions, cursors. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  board: Board,
  width: number,
  height: number,
  options: RenderOptions = {},
): void {
  ctx.clearRect(0, 0, width, height);
  for (const item of board.items) {
    const preview = item.type === "note" ? options.notePreviews?.get(item.id) : undefined;
    renderItem(ctx, preview ? { ...item, ...preview } : item, width, height, {
      ghost: preview !== undefined,
    });
  }
  for (const cursor of options.cursors ?? []) renderCursor(ctx, cursor, width, height);
}

export function renderItem(
  ctx: CanvasRenderingContext2D,
  item: BoardItem,
  width: number,
  height: number,
  options: { ghost?: boolean } = {},
): void {
  if (item.type === "stroke") renderStroke(ctx, item, width, height);
  else renderNote(ctx, item, width, height, options.ghost === true);
}

function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeItem,
  width: number,
  height: number,
): void {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const first = toPixels(stroke.points[0], width, height);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < stroke.points.length; i++) {
    const p = toPixels(stroke.points[i], width, height);
    ctx.lineTo(p.x, p.y);
  }
  // Single tap without movement still leaves a dot.
  if (stroke.points.length === 1) ctx.lineTo(first.x + 0.01, first.y + 0.01);
  ctx.stroke();
  ctx.restore();
}

function renderNote(
  ctx: CanvasRenderingContext2D,
  note: NoteItem,
  width: number,
  height: number,
  ghost: boolean,
): void {
  const pos = toPixels({ x: note.x, y: note.y }, width, height);
  ctx.save();
  // A ghost is a peer's in-flight drag: dashed outline so it reads as a
  // preview rather than the committed position.
  if (ghost) {
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([6, 4]);
  }
  ctx.fillStyle = note.color;
  ctx.strokeStyle = ghost ? "#495057" : "rgba(0,0,0,0.25)";
  ctx.lineWidth = ghost ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(pos.x, pos.y, NOTE_WIDTH, NOTE_HEIGHT, 6);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#333333";
  ctx.font = "14px system-ui, sans-serif";
  ctx.textBaseline = "top";
  wrapText(ctx, note.text, pos.x + 10, pos.y + 10, NOTE_WIDTH - 20, 18);
  ctx.restore();
}

/** A small arrow plus a name pill, drawn above everything else. */
function renderCursor(
  ctx: CanvasRenderingContext2D,
  cursor: CursorView,
  width: number,
  height: number,
): void {
  const pos = toPixels(cursor.point, width, height);
  ctx.save();
  ctx.fillStyle = cursor.color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(pos.x, pos.y + 16);
  ctx.lineTo(pos.x + 4.5, pos.y + 11.5);
  ctx.lineTo(pos.x + 11, pos.y + 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const label = cursor.name;
  const padX = 6;
  const pillHeight = 18;
  ctx.font = "12px system-ui, sans-serif";
  const pillWidth = Math.min(160, ctx.measureText(label).width + padX * 2);
  const pillX = pos.x + 12;
  const pillY = pos.y + 14;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 9);
  ctx.fillStyle = cursor.color;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, pillX + padX, pillY + pillHeight / 2 + 0.5, pillWidth - padX * 2);
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/);
  let line = "";
  let dy = 0;
  for (const word of words) {
    const trial = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(trial).width > maxWidth && line !== "") {
      ctx.fillText(line, x, y + dy);
      dy += lineHeight;
      line = word;
    } else {
      line = trial;
    }
  }
  if (line !== "") ctx.fillText(line, x, y + dy);
}
