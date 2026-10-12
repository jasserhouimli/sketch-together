import { toPixels } from "./geometry";
import type { Board, BoardItem, NoteItem, StrokeItem } from "./types";

export const NOTE_WIDTH = 160;
export const NOTE_HEIGHT = 100;

/** Draws a full board. Strokes are polylines; notes are filled cards with text. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  board: Board,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  for (const item of board.items) {
    renderItem(ctx, item, width, height);
  }
}

export function renderItem(
  ctx: CanvasRenderingContext2D,
  item: BoardItem,
  width: number,
  height: number,
): void {
  if (item.type === "stroke") renderStroke(ctx, item, width, height);
  else renderNote(ctx, item, width, height);
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
): void {
  const pos = toPixels({ x: note.x, y: note.y }, width, height);
  ctx.save();
  ctx.fillStyle = note.color;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pos.x, pos.y, NOTE_WIDTH, NOTE_HEIGHT, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#333333";
  ctx.font = "14px system-ui, sans-serif";
  ctx.textBaseline = "top";
  wrapText(ctx, note.text, pos.x + 10, pos.y + 10, NOTE_WIDTH - 20, 18);
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
