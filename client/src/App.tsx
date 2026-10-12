import { useState } from "react";
import BoardView from "./board/BoardView";
import Toolbar from "./board/Toolbar";
import type { Tool } from "./board/tools";
import { emptyBoard, type Board } from "./board/types";
import "./App.css";

export const DEFAULT_COLOR = "#222222";
export const DEFAULT_WIDTH = 4;

function App() {
  const [board, setBoard] = useLocalBoardState();
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);

  return (
    <main className="app">
      <Toolbar
        tool={tool}
        color={color}
        width={width}
        onToolChange={setTool}
        onColorChange={setColor}
        onWidthChange={setWidth}
        onClear={() => setBoard((b) => ({ ...b, items: [] }))}
      />
      <BoardView
        board={board}
        onBoardChange={setBoard}
        onDeleteItem={(id) => setBoard((b) => ({ ...b, items: b.items.filter((i) => i.id !== id) }))}
        tool={tool}
        color={color}
        width={width}
      />
    </main>
  );
}

function useLocalBoardState() {
  const [board, setBoard] = useState<Board>(() => emptyBoard("local"));
  return [board, setBoard] as const;
}

export default App;
