# Features (vertical slices)

Each feature owns its endpoint(s), validation, persistence, and tests in one
folder. Shared kernel (ids, results, middleware) lives in `Common/`.

```text
Features/
└── Boards/
    ├── CreateBoard/     # POST /api/boards
    ├── GetBoard/        # GET /api/boards/{id}
    └── BoardHub.cs      # SignalR room: join + broadcast validated actions
```

Rules:

- A slice may reference `Common/` and its own folder only.
- No `Services/`, `Managers/`, or `Utils/` folders.
- The realtime hub validates every action and broadcasts accepted actions to
  the board room. Server order is the ordering (no CRDT in v1).
- Persistence details stay inside the slice (SQLite via EF Core).
