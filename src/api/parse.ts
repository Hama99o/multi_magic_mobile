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
