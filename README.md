# SketchTogether — Collaborative Whiteboard

A real-time web app where people draw, add notes, and collaborate on a shared
board through a room link.

![ci](https://github.com/jasserhouimli/sketch-together/actions/workflows/ci.yml/badge.svg)

## Stack

- **Server:** ASP.NET Core (.NET 10), modular monolith + vertical slices,
  SignalR rooms, SQLite persistence.
- **Client:** React + TypeScript + Vite, HTML canvas rendering.
- **Tests:** xUnit (`dotnet test`), Vitest for the client (later).

## MVP milestones

1. [x] **Draw locally** — board screen, toolbar, pointer drawing, color/width, clear.
2. [x] **Editable items** — strokes + notes as items; add/move/edit/delete; eraser.
3. [x] **Board rooms** — unique board ID, load by ID, copy-link control.
4. [x] **Live collaboration** — SignalR room per board, validated action broadcast.
5. [ ] **Save boards** — persist after accepted actions (debounced), reload on open.
6. [ ] **Polish** — responsive, touch, loading/error states, docs, demo.

## Run it

```powershell
# Server (http://localhost:5248)
dotnet run --project src/Server

# Client (http://localhost:5173)
cd client
npm install
npm run dev
```

## Protocol (v1)

Server-ordered actions over SignalR (WebSocket transport). Coordinates are
relative to board size (`0..1`) so boards scale across screens.

- `stroke.add`, `note.add`, `note.update`, `item.move`, `item.delete`, `board.clear`

Every action carries `boardId`, `actionId` (idempotency), and the item.
The server validates board membership and shape before broadcasting.
