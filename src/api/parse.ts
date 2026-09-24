/**
 * Runtime checks at the API boundary.
 *
 * A typed `http.get<T>()` is a CAST, not a validation: the interface is our own
 * assertion about a runtime shape, so it agrees with itself while being wrong.
 * multi_magic itself shipped a screen that blanked on first use with request
 * specs green and `tsc` green, because nothing checked what actually arrived.
 *
 * So every payload this app makes a decision on is parsed, not cast. The
 * emphasis here is different from Karwan's, which guards money: this app's
 * decisions are about IDENTITY and ORDERING — a conversation id that arrives as
 * a string breaks the cable subscription, and a message id that does breaks the
 * `before_id` cursor that history paging depends on.
 *
 * Not zod: adding a dependency is a decision to surface rather than take
 * quietly, and these guards are a few lines. If schema validation grows beyond
 * this file, that is the moment to raise zod — not now.
 */

export class ApiShapeError extends Error {
  constructor(field: string, received: unknown) {
    super(`unexpected shape at "${field}": received ${JSON.stringify(received)}`);
    this.name = "ApiShapeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function obj(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiShapeError(field, value);
  return value;
}

export function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ApiShapeError(field, value);
  return value;
}

export function str(value: unknown, field: string): string {
  if (typeof value !== "string") throw new ApiShapeError(field, value);
  return value;
}

export function optStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * An id, and it must be a NUMBER.
 *
 * Deliberately strict: this does not coerce `"7"` to `7`. Rails serialises
 * these as integers, and a string arriving here means something upstream
 * changed — which we want to hear about at the boundary, loudly, rather than
 * discover later as a cable subscription that silently matches nothing because
 * `"7" !== 7`.
 */
export function id(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiShapeError(field, value);
  }
  return value;
}

export function num(value: unknown, field: string): number {
  return id(value, field);
}

export function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new ApiShapeError(field, value);
  return value;
}

/**
 * A list of DECORATIONS, read item by item: an unreadable item is dropped,
 * not allowed to fail what it decorates. Only for parts a row can do without
 * (a reaction, a source chip, a link), never for the rows themselves.
 *
 * The parsers audit, 2026-09-24: one malformed reaction threw for its whole
 * message, the message threw for its page, and the page for the thread, so
 * a thumbs-up the server got wrong cost the person their transcript. Only
 * ApiShapeError is swallowed; anything else is a bug and still throws.
 */
export function readable<T>(items: unknown[], parse: (item: unknown) => T): T[] {
  const out: T[] = [];
  for (const item of items) {
    try {
      out.push(parse(item));
    } catch (e) {
      if (!(e instanceof ApiShapeError)) throw e;
    }
  }
  return out;
}

/**
 * A list of ROWS, read row by row, with a count of the ones that could not
 * be read, so the screen can SAY so (decided by Hamma9901, 2026-09-25).
 *
 * Until then one unreadable row failed its whole list into "could not
 * load": one bad notification cost every notification. Dropping it silently
 * would be worse in a different way, since it hides data he has, the same
 * shape as the conversation that page 1 never showed. So the rows that parse
 * are kept, and the rest are COUNTED, and every list screen shows "N items
 * could not be read" (`UnreadableNotice`). Only ApiShapeError is counted;
 * anything else is a bug and still throws.
 */
export function readableRows<T>(items: unknown[], parse: (item: unknown) => T): { rows: T[]; unreadable: number } {
  const rows: T[] = [];
  let unreadable = 0;
  for (const item of items) {
    try {
      rows.push(parse(item));
    } catch (e) {
      if (!(e instanceof ApiShapeError)) throw e;
      unreadable += 1;
    }
  }
  return { rows, unreadable };
}
