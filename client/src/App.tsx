import { useState } from "react";
import RoomBoard from "./RoomBoard";
import { BoardApiError, createBoard } from "./room/api";
import { useRoomId } from "./room/route";
import "./App.css";

function App() {
  const roomId = useRoomId();
  // Key remounts the room on navigation so load state starts fresh.
  if (roomId) return <RoomBoard key={roomId} roomId={roomId} />;
  return <Home />;
}

function Home() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const id = await createBoard();
      window.location.hash = `#/b/${id}`;
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
          Draw and take notes together, live, through a shareable link.
        </p>
        <button type="button" className="create-btn" onClick={create} disabled={creating}>
          {creating ? "Creating…" : "New board"}
        </button>
        <ul className="home-points">
          <li>Live cursors</li>
          <li>Sticky notes</li>
          <li>Saved automatically</li>
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
