# SketchTogether

A real-time collaborative whiteboard. Create a board, share the link, and draw
together — strokes and sticky notes sync live between everyone in the room, and
everything is saved so the board is still there when you come back.

![ci](https://github.com/jasserhouimli/sketch-together/actions/workflows/ci.yml/badge.svg)
![license](https://img.shields.io/github/license/jasserhouimli/sketch-together)

## What it does

- **Draw together in real time.** Freehand strokes with color and width choices
  appear on every connected screen as they happen.
- **Sticky notes.** Click to place a note, drag it around, double-click to edit
  the text, erase it when you're done.
- **Rooms via link.** Each board gets a short shareable URL (`#/b/…`). No
  accounts — if you have the link, you're in the room.
- **Presence and sync status.** See how many people are connected and whether
  you're live, reconnecting, or offline. Every edit shows a save state
  (`Saving…` → `Saved 14:32`), backed by the server on each accepted action.
- **Undo / redo.** Session history (`Ctrl+Z` / `Ctrl+Y`) works across the room:
  undoing broadcasts the inverse action so all clients converge.
- **Persistent boards.** Refresh the page, close the laptop, come back next
  week — the board reloads exactly as you left it.

## Quickstart

Requirements: [.NET 10 SDK](https://dotnet.microsoft.com/download) and
[Node.js 20+](https://nodejs.org/).

```powershell
# Terminal 1 — API + realtime hub (http://localhost:5248)
dotnet run --project src/Server

# Terminal 2 — web client (http://localhost:5173)
cd client
npm install
npm run dev
```

Open the client, click **New board**, then open the copied link in a second
window (or send it to a friend on the same network, swapping `localhost` for
your machine's LAN IP). Draw in one window and watch the other.

To run the checks:

```powershell
dotnet test SketchTogether.slnx   # server: validation, applier, persistence
cd client; npm test                # client: model, geometry, hit-testing, history
```

## How it works

```text
Browser ──HTTPS/WS──▶ ASP.NET Core ──▶ SQLite
   │                        │
   │  SignalR room          │  validate → apply → persist → broadcast
   │  per board             │
   └── canvas ◀── actions ──┘
```

**Client** (`client/src/`). React + TypeScript + Vite. The board is a plain
array of items rendered on `<canvas>`; all coordinates are relative to board
size (`0..1`), so a phone and a desktop see the same drawing. Pointer events
cover mouse, touch, and stylus. A sync hook owns one SignalR connection per
room: it sends local mutations, applies accepted remote actions (ignoring
duplicates by `actionId`), and reports connection + save state.

**Server** (`src/Server/`). ASP.NET Core organized as vertical slices — each
feature owns its endpoints, validation, persistence, and tests:

```text
Features/Boards/
├── Board.cs / BoardsDbContext.cs   # room rows + EF Core SQLite store
├── BoardIds.cs                     # short shareable room IDs
├── BoardActions.cs                 # action envelope + validation
├── BoardActionApplier.cs           # pure item-list transitions
└── BoardHub.cs                     # SignalR room: join, ordered broadcast, presence
```

There is deliberately no CRDT: the server orders accepted actions, so every
client converges by applying them in arrival order. Malformed actions are
rejected before broadcast; redeliveries are deduplicated by `actionId`.

**Protocol (v1).** One envelope for everything —
`{ boardId, actionId, type, item }` — with `stroke.add`, `note.add`,
`note.update`, `item.move`, `item.delete`, and `board.clear`.

## Project status

| Area | State |
|---|---|
| Local drawing, notes, eraser | Done |
| Rooms, share links | Done |
| Live sync, presence, save indicator | Done |
| Undo / redo | Done (session-scoped) |
| Live cursors, export to image, accounts, offline queue | Planned |

## Limits worth knowing

- Note drags broadcast on release, not per frame.
- Offline edits stay on the device; there is no send queue yet.
- Presence is a participant count — no names or live cursors.
- Boards are public to anyone with the link; there is no access control.

## License

MIT — see [LICENSE](LICENSE).
