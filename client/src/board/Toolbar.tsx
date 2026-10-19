import type { ReactNode } from "react";
import { NOTE_COLORS } from "./notes";
import { PEN_COLORS, PEN_WIDTHS } from "./pen";
import type { Tool } from "./tools";

/**
 * Tool rail: tool switch, palette for the active tool, undo/redo, clear. It is
 * docked to the left edge and collapsible — the toggle stays where it is while
 * the panel slides out, so the board gets the full width without the controls
 * vanishing. Tools are icons (the labels live in aria-label/title) to keep the
 * rail narrow; room-level status lives elsewhere.
 */
export default function Toolbar({
  tool,
  color,
  width,
  noteColor,
  open,
  onToggle,
  onToolChange,
  onColorChange,
  onWidthChange,
  onNoteColorChange,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  tool: Tool;
  color: string;
  width: number;
  noteColor: string;
  open: boolean;
  onToggle: () => void;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onNoteColorChange: (color: string) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const toolBtn = (t: Tool, label: string, key: string, icon: ReactNode) => (
    <button
      key={t}
      type="button"
      aria-pressed={tool === t}
      aria-label={`${label} tool`}
      title={`${label} (${key})`}
      className={`tool-btn${tool === t ? " selected" : ""}`}
      onClick={() => onToolChange(t)}
    >
      {icon}
    </button>
  );

  return (
    <div className={`toolbar-dock${open ? "" : " collapsed"}`}>
      <button
        type="button"
        className="toolbar-toggle"
        aria-expanded={open}
        aria-controls="board-toolbar"
        aria-label={open ? "Hide tools" : "Show tools"}
        title={open ? "Hide tools" : "Show tools"}
        onClick={onToggle}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M7.5 2.5 4 6l3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div
        id="board-toolbar"
        className="toolbar"
        role="toolbar"
        aria-label="Board tools"
        inert={!open}
      >
        <div className="toolbar-group" role="group" aria-label="Tool">
          {toolBtn("pen", "Pen", "P", <PenIcon />)}
          {toolBtn("note", "Note", "N", <NoteIcon />)}
          {toolBtn("eraser", "Eraser", "E", <EraserIcon />)}
        </div>
        {tool === "pen" && (
          <>
            <div className="toolbar-group" role="radiogroup" aria-label="Color">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  className={`swatch${color === c ? " selected" : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => onColorChange(c)}
                />
              ))}
            </div>
            <div className="toolbar-group" role="radiogroup" aria-label="Width">
              {PEN_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={width === w}
                  aria-label={`Width ${w}`}
                  className={`width-btn${width === w ? " selected" : ""}`}
                  onClick={() => onWidthChange(w)}
                >
                  <span style={{ height: w }} />
                </button>
              ))}
            </div>
          </>
        )}
        {tool === "note" && (
          <div className="toolbar-group" role="radiogroup" aria-label="Note color">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={noteColor === c}
                aria-label={`Note color ${c}`}
                className={`swatch${noteColor === c ? " selected" : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => onNoteColorChange(c)}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className="clear-btn"
          onClick={onClear}
          title="Remove every item from the board"
        >
          Clear
        </button>
        <div className="toolbar-group toolbar-group-row" role="group" aria-label="History">
          <button
            type="button"
            className="tool-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <RedoIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function PenIcon() {
  return (
    <Icon>
      <path d="M2.6 13.4l.9-3.1 7.4-7.4a1.7 1.7 0 0 1 2.4 2.4l-7.4 7.4-3.3 .7z" />
      <path d="M9.9 4.1l2 2" />
    </Icon>
  );
}

function NoteIcon() {
  return (
    <Icon>
      <path d="M3 3.2h7.3L13 5.9v6.9H3z" />
      <path d="M10.3 3.2v2.7H13" />
    </Icon>
  );
}

function EraserIcon() {
  return (
    <Icon>
      <path d="M6.6 12.4 3.1 8.9a1.4 1.4 0 0 1 0-2l3.8-3.8a1.4 1.4 0 0 1 2 0l3.4 3.4a1.4 1.4 0 0 1 0 2l-3.7 3.7z" />
      <path d="M2.4 13.2h11.2" />
    </Icon>
  );
}

function UndoIcon() {
  return (
    <Icon>
      <path d="M4 7.4h5.6a2.8 2.8 0 0 1 0 5.6H6.4" />
      <path d="M6.6 4.8 4 7.4l2.6 2.6" />
    </Icon>
  );
}

function RedoIcon() {
  return (
    <Icon>
      <path d="M12 7.4H6.4a2.8 2.8 0 0 0 0 5.6h3.2" />
      <path d="M9.4 4.8 12 7.4l-2.6 2.6" />
    </Icon>
  );
}
