# SketchTogether

A real-time collaborative whiteboard. Create a board, share the link, and draw
together — strokes and sticky notes sync live between everyone in the room, and
everything is saved so the board is still there when you come back.

![ci](https://github.com/jasserhouimli/sketch-together/actions/workflows/ci.yml/badge.svg)
![license](https://img.shields.io/github/license/jasserhouimli/sketch-together)

## Demo

Two people in the same room — their names sit in the room bar and their cursor
moves live on the board:

![Two collaborators on one board, showing the second participant's name and cursor](docs/images/collab.png)

Notes, the participant list, and the save indicator at a glance:

![Sticky notes with the participant list and the save indicator](docs/images/board.png)

## Features

- **Live drawing** — freehand strokes with color and width choices, from a tool
  rail that slides out of the way, synced as you draw.
- **Sticky notes** — click to place, drag to move, double-click to edit.
- **Rooms via link** — each board gets a short shareable URL. No accounts.
- **Presence with names and cursors** — everyone in the room appears in the room
  bar with a display name and a colour, and their pointer moves live on the
  board.
- **Save state** — connection status and a save indicator on every edit.
- **Undo / redo** (`Ctrl+Z` / `Ctrl+Y`) — works across the room.
- **Persistent boards** — refresh or come back later; the board reloads as left.

## Quickstart

Requirements: [.NET 10 SDK](https://dotnet.microsoft.com/download) and
[Node.js 20+](https://nodejs.org/).

```powershell
# Terminal 1 — server (http://localhost:5248)
dotnet run --project src/Server

# Terminal 2 — client (http://localhost:5173)
cd client
npm install
npm run dev
```

Click **New board**, copy the link, open it in a second window, and draw.

## Realtime model

Durable actions (strokes, notes, moves, deletes) go through the server: it
validates, applies, persists, then broadcasts to everyone else. Presence,
cursors, and drag previews are ephemeral and never stored; remote positions are
smoothed client-side so they move at frame rate instead of stepping with each
network update. See [docs/realtime.md](docs/realtime.md).

## Limits worth knowing

- Note drags stream a preview while you drag; the committed move is what gets
  saved.
- Cursors, names, and drag previews are ephemeral — a restart drops them and
  everyone rejoins.
- Offline edits stay on the device; there is no send queue yet.
- Boards are public to anyone with the link; there is no access control.

## License

MIT — see [LICENSE](LICENSE).
