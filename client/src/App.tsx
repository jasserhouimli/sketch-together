import { useState } from "react";
import RoomBoard from "./RoomBoard";
import { BoardApiError, createBoard } from "./room/api";
import { editRoomUrl, useRoomRoute } from "./room/route";
import "./App.css";

function App() {
  const route = useRoomRoute();
  // Key remounts the room when the id or the edit/view mode changes.
  if (route) {
    return (
      <RoomBoard
        key={`${route.roomId}:${route.editKey ?? "view"}`}
        roomId={route.roomId}
        editKey={route.editKey}
      />
    );
  }
  return <Home />;
}

function Home() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const board = await createBoard();
      // Land on the edit link: the view link is what gets shared.
      window.location.href = editRoomUrl(board.id, board.editKey);
    } catch (e) {
      setError(e instanceof BoardApiError ? e.message : "Could not create a board.");
      setCreating(false);
    }
  };

  return (
    <main className="home">
      <section className="home-card">
        <svg className="home-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="0" y="0" width="32" height="32" rx="15" fill="#1971c2" />
          <path
            d="M7 21.5c3.5-8.5 7.5-11.5 11-10s-1 6.5-6.5 9"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <h1>SketchTogether</h1>
        <p className="home-lede">
          Draw and take notes together, live. Share the view link; keep the edit link to
          change the board.
        </p>
        <button type="button" className="create-btn" onClick={create} disabled={creating}>
          {creating ? "Creating…" : "New board"}
        </button>
        <ul className="home-points">
          <li>Live cursors</li>
          <li>Sticky notes</li>
          <li>View or edit links</li>
        </ul>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}. Is the server running?
        </p>
      )}
    </main>
  );
}

export default App;
