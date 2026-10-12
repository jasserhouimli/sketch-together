import { useState } from "react";
import BoardView from "./board/BoardView";
import Toolbar from "./board/Toolbar";
import { emptyBoard, type Board } from "./board/types";
import "./App.css";

export const DEFAULT_COLOR = "#222222";
export const DEFAULT_WIDTH = 4;

function App() {
  const [board, setBoard] = useLocalBoardState();
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);

  return (
    <main className="app">
      <Toolbar
        color={color}
        width={width}
        onColorChange={setColor}
        onWidthChange={setWidth}
        onClear={() => setBoard((b) => ({ ...b, items: [] }))}
      />
      <BoardView board={board} onBoardChange={setBoard} color={color} width={width} />
    </main>
  );
}

function useLocalBoardState() {
  const [board, setBoard] = useState<Board>(() => emptyBoard("local"));
  return [board, setBoard] as const;
}

export default App;
