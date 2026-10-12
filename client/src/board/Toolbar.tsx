import { PEN_COLORS, PEN_WIDTHS } from "./pen";

/** Pen toolbar: color swatches, stroke widths, and board clear. */
export default function Toolbar({
  color,
  width,
  onColorChange,
  onWidthChange,
  onClear,
}: {
  color: string;
  width: number;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Pen">
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
      <button type="button" className="clear-btn" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
