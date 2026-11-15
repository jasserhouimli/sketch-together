# SketchTogether

A real-time collaborative whiteboard built with a **Modular Monolith** and **Vertical Slice Architecture** on the backend (.NET 10, ASP.NET Core Minimal APIs, SignalR) and React + TypeScript + Canvas on the frontend. Create a board, share the link, and draw together — strokes and sticky notes sync live between everyone in the room.

![ci](https://github.com/jasserhouimli/sketch-together/actions/workflows/ci.yml/badge.svg)
![license](https://img.shields.io/github/license/jasserhouimli/sketch-together)

## Demo

Two people in the same room — their names sit in the room bar and their cursor moves live on the board:

![Two collaborators on one board, showing the second participant's name and cursor](docs/images/collab.png)

Notes in two colors, the participant list, and the save indicator at a glance:

![Sticky notes with the participant list and the save indicator](docs/images/board.png)

---

## Architecture Overview

The backend follows a **Modular Monolith** combined with **Vertical Slice Architecture (VSA)**, ensuring high cohesion, clear domain boundaries, and zero leaky abstractions.

```mermaid
graph TD
    Client["Client (React + TypeScript + Canvas)"] -->|Minimal API| BoardsEndpoints["Boards Slices (CreateBoard / GetBoard)"]
    Client -->|WebSocket / SignalR| BoardHub["BoardHub (Real-Time Gateway)"]
    
    subgraph "Backend Modular Monolith"
        subgraph "Common (Shared Kernel)"
            Endpoints["IEndpoint & Auto-Discovery"]
            ResultPattern["Result<T> & Error Primitives"]
        end

        subgraph "Boards Module (Vertical Slices)"
            CreateSlice["POST /api/boards (CreateBoard Slice)"]
            GetSlice["GET /api/boards/{id} (GetBoard Slice)"]
            BoardsDb[(BoardsDbContext / SQLite)]
            DomainLogic["Board Aggregate & Action Applier"]
        end

        subgraph "Collaboration Module (Real-Time Engine)"
            BoardHub
            LockManager["IBoardLockManager (Per-Board Concurrency)"]
            PresenceTracker["IBoardPresenceTracker (Ephemeral Roster)"]
            Deduplicator["IActionDeduplicator (Idempotency)"]
        end
    end

    BoardsEndpoints --> BoardsDb
    BoardHub --> LockManager
    BoardHub --> PresenceTracker
    BoardHub --> Deduplicator
    BoardHub --> DomainLogic
    BoardHub --> BoardsDb
```

### Key Architectural Highlights:
1. **Vertical Slice Architecture (VSA)**: Feature operations (`CreateBoard`, `GetBoard`) encapsulate their endpoint definition (`IEndpoint`), command/query handler, validation, and response DTO within a single slice folder.
2. **Minimal APIs**: Built entirely on ASP.NET Core Minimal APIs without bulky controllers. Endpoints are self-registering via the `IEndpoint` discovery contract.
3. **Decoupled Real-Time Concurrency**: `BoardHub` acts strictly as an event transport gateway. State management (per-board locking, presence rosters, and message deduplication) is decoupled into injected abstractions (`IBoardLockManager`, `IBoardPresenceTracker`, `IActionDeduplicator`), making the system clean and scale-out ready.
4. **Architectural Guardrails**: Backed by automated architecture tests (`ArchitectureTests.cs`) verifying endpoint contracts, handler encapsulation, and module boundary invariants.
5. **Frontend Hook Decomposition**: Frontend logic in `client/` is decomposed into dedicated hooks (`useBoardSync`, `useShortcuts`, `useTransientPresence`) and isolated components (`PeerChips`, `StatusPill`, `SaveState`), maintaining high maintainability and zero linter warnings.

---

## Features

- **Live drawing** — freehand strokes with a color palette and four widths, synced as you draw.
- **Sticky notes** — click to place, drag to move, double-click to edit, in six colors.
- **Compact tool rail** — pen, note, and eraser behind `P` / `N` / `E`, and `Ctrl+Z` / `Ctrl+Y` for undo and redo, shared with the room.
- **View and edit links** — a new board opens its edit link; the view link is what you share. Anyone with the view link can watch live, while the key in the edit link is needed to change anything. No accounts required.
- **Presence with names and cursors** — everyone in the room appears in the room bar with a display name and a color, and their pointer moves live on the board.
- **Save state** — connection status, a save indicator on every edit, and queued edits waiting to sync while offline.
- **Persistent boards** — refresh or come back later; the board reloads exactly as left.

---

## Quickstart

### Option 1: Docker Compose (1-Command Startup)

```bash
docker compose up --build
```
Open [http://localhost:5248](http://localhost:5248) in your browser.

### Option 2: Local Development

Requirements: [.NET 10 SDK](https://dotnet.microsoft.com/download) and [Node.js 20+](https://nodejs.org/).

```powershell
# Terminal 1 — Server (http://localhost:5248)
dotnet run --project src/Server

# Terminal 2 — Client (http://localhost:5173)
cd client
npm install
npm run dev
```

---

## Testing

```powershell
# Run backend unit, integration, and architecture tests (79 tests)
dotnet test

# Run frontend tests (112 tests)
cd client
npm test

# Run frontend linter
npm run lint
```

---

## License

MIT — see [LICENSE](LICENSE).
