import { useEffect, useRef } from "react";
import type { Tool } from "../../board/tools";

/** Bare-key tool switches, ignored while typing. */
const TOOL_SHORTCUTS: Record<string, Tool> = { p: "pen", n: "note", e: "eraser" };

interface UseShortcutsOptions {
  editable: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSelectTool: (tool: Tool) => void;
}

export function useShortcuts({
  editable,
  onUndo,
  onRedo,
  onSelectTool,
}: UseShortcutsOptions) {
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  const editableRef = useRef(editable);
  const onSelectToolRef = useRef(onSelectTool);

  useEffect(() => {
    onUndoRef.current = onUndo;
    onRedoRef.current = onRedo;
    editableRef.current = editable;
    onSelectToolRef.current = onSelectTool;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (!editableRef.current) return;

      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          onUndoRef.current();
        } else if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          onRedoRef.current();
        }
        return;
      }

      // Bare keys pick a tool, but never steal a modified shortcut.
      if (e.altKey || e.shiftKey) return;
      const shortcut = TOOL_SHORTCUTS[key];
      if (!shortcut) return;
      e.preventDefault();
      onSelectToolRef.current(shortcut);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
