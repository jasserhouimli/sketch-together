import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "../../board/types";
import { createThrottle } from "../throttle";
import {
  dropPreview,
  isCursorUpdate,
  isPreviewUpdate,
  keepPreviewsFrom,
  pruneCursors,
  prunePreviews,
  retargetPreview,
  toCursor,
  toPreview,
  upsertCursor,
  upsertPreview,
  type DragPreview,
  type RemoteCursor,
} from "../transient";
import type { Peer } from "../presence";

/** Cursor updates are cheap but frequent; ~25/s looks smooth to a peer. */
const CURSOR_SEND_MS = 40;
/** Drag previews can be coarser: the release sends the exact position. */
const PREVIEW_SEND_MS = 60;
/** How often expired cursors/previews are swept out of state. */
const PRUNE_INTERVAL_MS = 500;
/**
 * A committed note move aims the peer's ghost at the final position; this is
 * how long it is given to glide there before the preview is dropped.
 */
const MOVE_SETTLE_MS = 260;

const NO_CURSORS: ReadonlyMap<string, RemoteCursor> = new Map();
const NO_PREVIEWS: ReadonlyMap<string, DragPreview> = new Map();

interface UseTransientPresenceOptions {
  peers: Peer[];
  sendCursor: (x: number, y: number) => void;
  sendDragPreview: (noteId: string, x: number, y: number) => void;
}

export function useTransientPresence({
  peers,
  sendCursor,
  sendDragPreview,
}: UseTransientPresenceOptions) {
  const [cursors, setCursors] = useState(NO_CURSORS);
  const [previews, setPreviews] = useState(NO_PREVIEWS);

  // Ghosts that are gliding onto a committed position, keyed by note.
  const settleTimers = useRef(new Map<string, number>());

  const cancelPreviewDrop = useCallback((noteId: string) => {
    const timers = settleTimers.current;
    const pending = timers.get(noteId);
    if (pending === undefined) return;
    window.clearTimeout(pending);
    timers.delete(noteId);
  }, []);

  const schedulePreviewDrop = useCallback(
    (noteId: string) => {
      cancelPreviewDrop(noteId);
      const timers = settleTimers.current;
      timers.set(
        noteId,
        window.setTimeout(() => {
          timers.delete(noteId);
          setPreviews((prev) => dropPreview(prev, noteId));
        }, MOVE_SETTLE_MS),
      );
    },
    [cancelPreviewDrop],
  );

  useEffect(
    () => () => {
      for (const timer of settleTimers.current.values()) window.clearTimeout(timer);
      settleTimers.current.clear();
    },
    [],
  );

  const onCursor = useCallback((raw: unknown) => {
    if (!isCursorUpdate(raw)) return;
    const now = Date.now();
    setCursors((prev) => upsertCursor(prev, toCursor(raw, now)));
  }, []);

  const onPreview = useCallback(
    (raw: unknown) => {
      if (!isPreviewUpdate(raw)) return;
      const now = Date.now();
      cancelPreviewDrop(raw.noteId);
      setPreviews((prev) => upsertPreview(prev, toPreview(raw, now)));
    },
    [cancelPreviewDrop],
  );

  const handleRetargetPreview = useCallback(
    (noteId: string, point: Point) => {
      setPreviews((prev) => retargetPreview(prev, noteId, point, Date.now()));
      schedulePreviewDrop(noteId);
    },
    [schedulePreviewDrop],
  );

  // Sweep expired cursors and previews.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => pruneCursors(prev, now));
      setPreviews((prev) => prunePreviews(prev, now));
    }, PRUNE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const cursorThrottle = useMemo(
    () => createThrottle((p: Point) => sendCursor(p.x, p.y), CURSOR_SEND_MS),
    [sendCursor],
  );
  const previewThrottle = useMemo(
    () =>
      createThrottle(
        (p: { noteId: string; x: number; y: number }) => sendDragPreview(p.noteId, p.x, p.y),
        PREVIEW_SEND_MS,
      ),
    [sendDragPreview],
  );

  useEffect(
    () => () => {
      cursorThrottle.cancel();
      previewThrottle.cancel();
    },
    [cursorThrottle, previewThrottle],
  );

  // Filter previews during render to ensure departed peers do not leave orphan ghosts
  const activePreviews = useMemo(() => keepPreviewsFrom(previews, peers), [previews, peers]);

  const cursorViews = useMemo(
    () => [...cursors.values()].map((c) => ({ id: c.id, name: c.name, color: c.color, point: c.point })),
    [cursors],
  );
  const previewPositions = useMemo(
    () => new Map([...activePreviews.values()].map((p) => [p.noteId, p.point] as const)),
    [activePreviews],
  );

  return {
    cursorViews,
    previewPositions,
    cursorThrottle,
    previewThrottle,
    onCursor,
    onPreview,
    handleRetargetPreview,
  };
}
