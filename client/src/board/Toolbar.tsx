import { PEN_COLORS, PEN_WIDTHS } from "./pen";
import type { Tool } from "./tools";

/** Toolbar: tool switch, pen color/width, board clear, plus room extras. */
export default function Toolbar({
  tool,
  color,
  width,
  onToolChange,
  onColorChange,
  onWidthChange,
  onClear,
  extra,
}: {
  tool: Tool;
  color: string;
  width: number;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onClear: () => void;
  extra?: React.ReactNode;
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
    <div className="toolbar" role="toolbar" aria-label="Board tools">
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
      {extra}
    </div>
  );
}
