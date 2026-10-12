import { useState } from "react";
import BoardView from "./board/BoardView";
import { emptyBoard, type Board } from "./board/types";
import "./App.css";

export const DEFAULT_COLOR = "#222222";
export const DEFAULT_WIDTH = 4;

function App() {
  const [board, setBoard] = useState<Board>(() => emptyBoard("local"));

  return (
    <main className="app">
      <BoardView board={board} onBoardChange={setBoard} color={DEFAULT_COLOR} width={DEFAULT_WIDTH} />
    </main>
  );
}

export default App;
