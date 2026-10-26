# Realtime model

The hub carries two kinds of traffic over one SignalR connection.

## Durable actions

`SendAction` takes an `actionId`, a type, and an item. The server validates the
action, applies it to the board row, saves, and then broadcasts `ReceiveAction`
to the rest of the room. A per-board lock serializes that load-apply-save-
broadcast sequence, so the server's order is the board's order. Repeated
`actionId`s are acked from the current row instead of being applied twice.

Types: `stroke.add`, `note.add`, `note.update`, `item.move`, `item.delete`,
`board.clear`.

### Offline and the outbox

The client sends durable actions through an ordered outbox (`room/outbox.ts`):
one action is in flight at a time, and anything made while the connection is
down waits in order. On reconnect the client rejoins, replays the pending
actions onto the snapshot so they do not visibly roll back, then flushes them.

Actions are idempotent on the server (upserts, moves, deletes, a clear), so a
lost ack that is replayed converges to the same board. A connection loss keeps
the queue; an action the server rejects is dropped so a bad item cannot block
everything behind it. The queue is scoped to the tab and mirrored to
sessionStorage (`sketchtogether.outbox.<roomId>`), so a refresh keeps pending
edits while closing the tab drops them. Stored actions are treated as untrusted
input: malformed entries are dropped on load, and the payload is capped. Opening
a board still needs the server, so the save indicator is what shows queued work
in the meantime.

## Ephemeral updates

Cursors and in-flight note drags are relayed to the room and never persisted:

| call | server event | payload |
|---|---|---|
| `UpdateCursor(x, y)` | `CursorMoved` | `id`, `name`, `color`, `x`, `y` |
| `DragPreview(noteId, x, y)` | `DragPreviewMoved` | `id`, `noteId`, `x`, `y` |

Both are fire-and-forget on the client, throttled to the leading edge plus one
trailing call (40 ms for cursors, 60 ms for previews). Out-of-range coordinates
are dropped rather than rejected — a lost frame is invisible, and a drag ends
with the durable `item.move`.

### Smoothing on the receiving side

Throttled updates arrive as steps, so the client does not paint each one where
it lands. Every incoming position becomes a *target*, and the drawn position
chases it exponentially (`room/smoothing.ts`), once per animation frame:

- Exponential approach, so the result is frame-rate independent: one 32 ms step
  lands where two 16 ms steps do, and it never overshoots.
- A target far from the previous one is treated as a jump, not motion — the
  pointer was warped, or a window changed — and snaps instead of gliding.
- Nothing is drawn when everything has arrived, so an idle board costs no
  frames.

Interpolation adds a fixed, bounded lag (the time constant, 55 ms) on top of the
network delay. Extrapolation would remove that lag but needs a velocity
estimate from 40 ms samples and overshoots on direction changes; a cursor that
occasionally shoots past its owner is worse than one that trails slightly. Only
remote layers are smoothed: the local player's own stroke and dragged note still
follow the pointer exactly.

## Presence

`JoinBoard(boardId, displayName, editKey)` registers the connection in an
in-memory presence table and returns the current items, the caller's connection
id, the roster, and `canEdit`. `PresenceChanged` re-broadcasts the roster on
join and disconnect.
`Rename(displayName)` replaces the caller's name in place — same connection,
colour, and roster position — and re-broadcasts. It is ephemeral like the rest of
presence: nothing is written to the board row, so a rename never costs a save.
Each participant gets a stable colour derived from the connection id (FNV-1a, so
it does not change between processes), which the client reuses for that person's
cursor.

Names are cosmetic: there are no accounts. The server trims, strips control
characters, collapses whitespace, and caps a name at 24 characters, falling back
to `Guest`. The client sanitizes again before rendering, because the roster is
still just network input.

## Editing permission

`JoinBoard` checks the optional edit key against the hash stored on the board
(`BoardAccess.CheckEditKey`):

- no stored hash (a board created before edit links) — editing stays open to
  anyone with the board id;
- a matching key — `canEdit = true`;
- no key — view-only (`canEdit = false`);
- a wrong key — the join is rejected instead of silently downgraded.

Permission is per connection and kept in the presence record, so a reconnect
re-checks it. `SendAction` refuses durable actions from a view-only connection.
Cursors, drag previews, renames, and roster broadcasts remain available to
everyone: they are presence, not board state. The server never sends the key or
its hash back to a client.

Read-only mode in the client is a convenience layered on that rule: the canvas
and toolbar stop editing, the empty hint explains why, and a queued offline edit
is replayed only when the join granted edit permission. A rejected edit key is
reported as an error rather than quietly turning the tab into a viewer.

## Client layers

- `room/sync.ts` — connection, roster, sends, and the outbox flush loop.
- `room/transient.ts` — cursor and preview state with TTLs (5 s, 3 s), so a
  peer that disappears mid-gesture leaves nothing behind.
- `room/smoothing.ts` — turns each arriving position into a target and moves the
  drawn one toward it on animation frames.
- `board/renderer.ts` — draws previewed notes as dashed ghosts and cursors last,
  on top of everything else.

Previews are dropped when the matching `item.move` arrives, when the peer
leaves, or when they expire — whichever comes first.

## What this does not claim

Ordering is per board and comes from one lock; it is not a CRDT, and concurrent
edits to the same note resolve last-writer-wins. Ephemeral updates are best
effort: nothing is queued, so a dropped cursor frame stays dropped. Boards are
readable by anyone with the view link; possession of the edit key is the only
authorization. There are no accounts, key rotation, or expiry.
