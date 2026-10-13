import { isValidItem, type Board, type BoardItem } from "../board/types";

export class BoardApiError extends Error {
  readonly kind: "not-found" | "bad-link" | "network" | "server";

  constructor(message: string, kind: "not-found" | "bad-link" | "network" | "server") {
    super(message);
    this.kind = kind;
  }
}

export async function createBoard(): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/boards", { method: "POST" });
  } catch {
    throw new BoardApiError("Could not reach the server.", "network");
  }
  if (!res.ok) throw new BoardApiError("Could not create a board.", "server");
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new BoardApiError("Server returned an unusable board.", "server");
  }
  return body.id;
}

export async function fetchBoard(id: string): Promise<Board> {
  let res: Response;
  try {
    res = await fetch(`/api/boards/${encodeURIComponent(id)}`);
  } catch {
    throw new BoardApiError("Could not reach the server.", "network");
  }
  if (res.status === 404) {
    throw new BoardApiError("No board with that link. Check the URL or create a new board.", "not-found");
  }
  if (res.status === 400) {
    throw new BoardApiError("That link does not look like a board URL.", "bad-link");
  }
  if (!res.ok) throw new BoardApiError("Could not open the board.", "server");
  const body = (await res.json()) as { id?: unknown; items?: unknown };
  const items = Array.isArray(body.items) ? body.items.filter(isValidItem) : [];
  return {
    id: typeof body.id === "string" ? body.id : id,
    items: items as BoardItem[],
  };
}
