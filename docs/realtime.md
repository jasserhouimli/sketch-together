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

## Presence

`JoinBoard(boardId, displayName)` registers the connection in an in-memory
presence table and returns the current items, the caller's connection id, and
the roster. `PresenceChanged` re-broadcasts the roster on join and disconnect.
Each participant gets a stable colour derived from the connection id (FNV-1a, so
it does not change between processes), which the client reuses for that person's
cursor.

Names are cosmetic: there are no accounts. The server trims, strips control
characters, collapses whitespace, and caps a name at 24 characters, falling back
to `Guest`. The client sanitizes again before rendering, because the roster is
still just network input.

## Client layers

- `room/sync.ts` — connection, roster, sends; state of the durable channel.
- `room/transient.ts` — cursor and preview state with TTLs (5 s, 3 s), so a
  peer that disappears mid-gesture leaves nothing behind.
- `board/renderer.ts` — draws previewed notes as dashed ghosts and cursors last,
  on top of everything else.

Previews are dropped when the matching `item.move` arrives, when the peer
leaves, or when they expire — whichever comes first.

## What this does not claim

Ordering is per board and comes from one lock; it is not a CRDT, and concurrent
edits to the same note resolve last-writer-wins. Ephemeral updates are best
effort: nothing is queued, so a dropped cursor frame stays dropped. Boards are
public to anyone with the link.
