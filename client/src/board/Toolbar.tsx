import { PEN_COLORS, PEN_WIDTHS } from "./pen";
import type { Tool } from "./tools";

/**
 * Tool rail: tool switch, pen color/width, undo/redo, clear. It is docked to the
 * left edge and collapsible — the toggle stays where it is while the panel
 * slides out, so the board gets the full width without the controls vanishing.
 * Room-level status lives elsewhere; this is only for making marks.
 */
export default function Toolbar({
  tool,
  color,
  width,
  open,
  onToggle,
  onToolChange,
  onColorChange,
  onWidthChange,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  tool: Tool;
  color: string;
  width: number;
  open: boolean;
  onToggle: () => void;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const toolBtn = (t: Tool, label: string) => (
    <button
      key={t}
      type="button"
      aria-pressed={tool === t}
      aria-label={`${label} tool`}
      className={`tool-btn${tool === t ? " selected" : ""}`}
      onClick={() => onToolChange(t)}
    >
      {label}
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
          {toolBtn("pen", "Pen")}
          {toolBtn("note", "Note")}
          {toolBtn("eraser", "Eraser")}
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
        <button type="button" className="clear-btn" onClick={onClear}>
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
            ↩
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            ↪
          </button>
        </div>
      </div>
    </div>
  );
}
