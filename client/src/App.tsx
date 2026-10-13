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
      <h1>SketchTogether</h1>
      <p>Draw and take notes together, live, through a shareable link.</p>
      <button type="button" className="create-btn" onClick={create} disabled={creating}>
        {creating ? "Creating…" : "New board"}
      </button>
      {error && <p className="error">{error}. Is the server running?</p>}
    </main>
  );
}

export default App;
