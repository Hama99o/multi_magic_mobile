/**
 * SafeZone: passwords, payment cards and identity documents behind the PIN.
 * The rules are `docs/design/safezone/SECURITY.md`; read it first.
 *
 * Every call to `Api::V1::SafezoneApp::*` (read 2026-11-13, multi_magic
 * `safezone-hardening`). Request bodies use the server's field names.
 *
 * ── ASSUME NOTHING FROM THE SERVER ────────────────────────────────────────
 * The deployed server sends every secret in plaintext in every list. The
 * `?masked=1` view (PR #19) is asked for, and the rows are STILL rebuilt here
 * from the non-secret fields only (`stripSecrets`), so an old server, a
 * rollback, or a new secret field nobody told us about cannot reach the query
 * cache. A card's or document's last four is computed here when the server
 * did not send it, and the plaintext goes no further than this function.
 *
 * ── THE PIN AND THE TOKEN ─────────────────────────────────────────────────
 * The PIN is an argument to `unlock` and nothing else: it goes in the POST
 * body (the http logger prints method, path and status only), and only the
 * token comes back. The token is an argument to every other call; this file
 * keeps no copy of either. A `403 safezone_pin_locked` from ANY call runs the
 * registered lock handler, because the server is the authority on whether
 * the vault is open.
 */
import { isAxiosError } from "axios";
import { http } from "./http";
import { arr, id, obj, optStr } from "./parse";

const BASE = "/api/v1/safezone_app";
const HEADER = "X-Safezone-Unlock";

export type SafeZoneKind = "passwords" | "payment_cards" | "identities";
export const SAFEZONE_KINDS: readonly SafeZoneKind[] = ["passwords", "payment_cards", "identities"];

export const SECRET_FIELDS: Record<SafeZoneKind, readonly string[]> = {
  passwords: ["password"],
  payment_cards: ["card_number", "cvv", "code"],
  identities: ["document_number"],
};

/** The JSON root of each list, and the body key of a write. */
const ROOT: Record<SafeZoneKind, string> = {
  passwords: "passwords",
  payment_cards: "payment_cards",
  identities: "identities",
};

export interface PasswordRow {
  kind: "passwords";
  id: number;
  title: string | null;
  username: string | null;
  email: string | null;
  link: string | null;
  /** The server's `password_weak` (masked view); `null` when it did not say. */
  weak: boolean | null;
  updatedAt: string | null;
}
export interface CardRow {
  kind: "payment_cards";
  id: number;
  name: string | null;
  cardType: string | null;
  expiry: string | null;
  last4: string | null;
  updatedAt: string | null;
}
export interface IdentityRow {
  kind: "identities";
  id: number;
  type: string | null;
  last4: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
}
export type SafeZoneRow = PasswordRow | CardRow | IdentityRow;

export interface SafeZonePage {
  rows: SafeZoneRow[];
  page: number;
  pages: number;
}

export interface SecretField {
  /** The server's field name; the screen translates it (`safezone.field.<key>`). */
  key: string;
  value: string;
  secret: boolean;
  /** A web address the screen may open. */
  link?: boolean;
}
export interface SafeZoneItem {
  kind: SafeZoneKind;
  id: number;
  title: string;
  fields: SecretField[];
}

export interface PinStatus {
  enabled: boolean;
  lockedOut: boolean;
  lockedUntil: string | null;
  attemptsLeft: number;
}

export interface UnlockGrant {
  token: string;
  expiresIn: number;
}

// ── refusals ─────────────────────────────────────────────────────────────

export type SafeZoneErrorKind =
  | "locked"
  | "wrongPin"
  | "lockedOut"
  | "notEnabled"
  | "rateLimited"
  | "invalidPassword"
  | "pinMismatch"
  | "invalidFormat"
  | "invalidCode";

export class SafeZoneError extends Error {
  readonly kind: SafeZoneErrorKind;
  readonly attemptsLeft: number | null;
  readonly lockedUntil: string | null;

  constructor(kind: SafeZoneErrorKind, extra: { attemptsLeft?: number | null; lockedUntil?: string | null } = {}) {
    super(`safezone: ${kind}`);
    this.name = "SafeZoneError";
    this.kind = kind;
    this.attemptsLeft = extra.attemptsLeft ?? null;
    this.lockedUntil = extra.lockedUntil ?? null;
  }
}

let onLocked: (() => void) | null = null;

/** The lock store registers itself here (one way: this file imports no store). */
export function setSafezoneLockedHandler(fn: (() => void) | null): void {
  onLocked = fn;
}

const CODES: Record<string, SafeZoneErrorKind> = {
  safezone_pin_locked: "locked",
  wrong_pin: "wrongPin",
  pin_locked_out: "lockedOut",
  pin_not_enabled: "notEnabled",
  invalid_password: "invalidPassword",
  pin_mismatch: "pinMismatch",
  invalid_pin_format: "invalidFormat",
  invalid_code: "invalidCode",
};

/** A server refusal as a `SafeZoneError`; anything else is rethrown as it is. */
function refusal(error: unknown): unknown {
  if (!isAxiosError(error) || !error.response) return error;
  const { status, data } = error.response;
  if (status === 429) return new SafeZoneError("rateLimited");
  const body = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const kind = typeof body.error === "string" ? CODES[body.error] : undefined;
  if (!kind) return error;
  if (kind === "locked") onLocked?.();
  return new SafeZoneError(kind, {
    attemptsLeft: typeof body.attempts_left === "number" ? body.attempts_left : null,
    lockedUntil: typeof body.locked_until === "string" ? body.locked_until : null,
  });
}

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw refusal(error);
  }
}

const withToken = (token: string) => ({ headers: { [HEADER]: token } });

// ── masking ──────────────────────────────────────────────────────────────

/** The last four characters of a secret's digits/letters, or null when the
 *  secret is too short for four to be a hint rather than the whole thing. */
export function last4(secret: unknown): string | null {
  const plain = typeof secret === "string" ? secret.replace(/[\s-]/g, "") : "";
  return plain.length >= 6 ? plain.slice(-4) : null;
}

const optBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/**
 * A list row rebuilt from its NON-secret fields. Never spreads the server's
 * object: a field is in the row only because it is named here.
 */
export function stripSecrets(kind: SafeZoneKind, raw: unknown): SafeZoneRow {
  const r = obj(raw, `${kind} row`);
  const rowId = id(r.id, `${kind}.id`);
  const updatedAt = optStr(r.updated_at);
  if (kind === "passwords") {
    return {
      kind, id: rowId, title: optStr(r.title), username: optStr(r.username), email: optStr(r.email),
      link: optStr(r.link), weak: optBool(r.password_weak), updatedAt,
    };
  }
  if (kind === "payment_cards") {
    return {
      kind, id: rowId, name: optStr(r.name), cardType: optStr(r.card_type), expiry: optStr(r.expiry_date),
      last4: optStr(r.card_last4) ?? last4(r.card_number), updatedAt,
    };
  }
  return {
    kind, id: rowId, type: optStr(r.type), last4: optStr(r.document_last4) ?? last4(r.document_number),
    issuedAt: optStr(r.issued_at), expiresAt: optStr(r.expires_at), updatedAt,
  };
}

// ── the item ─────────────────────────────────────────────────────────────

/** Display order per kind; `title` is the heading, not a row. */
const ITEM_FIELDS: Record<SafeZoneKind, readonly string[]> = {
  passwords: ["username", "email", "password", "link", "note"],
  payment_cards: ["card_type", "card_number", "expiry_date", "cvv", "code", "note"],
  identities: ["type", "document_number", "issued_at", "expires_at", "note"],
};
const TITLE: Record<SafeZoneKind, string> = { passwords: "title", payment_cards: "name", identities: "type" };

function toItem(kind: SafeZoneKind, raw: unknown): SafeZoneItem {
  const r = obj(raw, kind);
  const secrets = SECRET_FIELDS[kind];
  const fields: SecretField[] = [];
  for (const key of ITEM_FIELDS[kind]) {
    const value = r[key];
    const text = typeof value === "number" ? String(value) : optStr(value);
    if (!text || !text.trim()) continue;
    const field: SecretField = { key, value: text, secret: secrets.includes(key) };
    if (key === "link") field.link = true;
    fields.push(field);
  }
  return { kind, id: id(r.id, `${kind}.id`), title: optStr(r[TITLE[kind]]) ?? "", fields };
}

// ── the calls ────────────────────────────────────────────────────────────

function pinStatusOf(raw: unknown): PinStatus {
  const r = obj(raw, "pin");
  return {
    enabled: r.enabled === true,
    lockedOut: r.locked_out === true,
    lockedUntil: optStr(r.locked_until),
    attemptsLeft: typeof r.attempts_left === "number" ? r.attempts_left : 0,
  };
}

function grantOf(raw: unknown): UnlockGrant {
  const r = obj(raw, "unlock");
  const token = optStr(r.unlock_token);
  if (!token) throw new SafeZoneError("locked");
  return { token, expiresIn: typeof r.expires_in === "number" ? r.expires_in : 120 };
}

export const safezoneApi = {
  /** Booleans and lockout facts only; never needs the token. */
  pinStatus: () => call(async () => pinStatusOf((await http.get(`${BASE}/pin`)).data)),

  unlock: (pin: string) => call(async () => grantOf((await http.post(`${BASE}/pin/unlock`, { pin })).data)),

  refresh: (token: string) => call(async () => grantOf((await http.post(`${BASE}/pin/refresh`, {}, withToken(token))).data)),

  enable: (input: { currentPassword: string; pin: string; pinConfirmation: string }) =>
    call(async () =>
      pinStatusOf(
        (
          await http.post(`${BASE}/pin/enable`, {
            current_password: input.currentPassword,
            pin: input.pin,
            pin_confirmation: input.pinConfirmation,
          })
        ).data,
      ),
    ),

  list: (kind: SafeZoneKind, opts: { token: string; page?: number; search?: string }) =>
    call(async (): Promise<SafeZonePage> => {
      const page = opts.page ?? 1;
      const params: Record<string, string | number> = { masked: 1, page };
      if (opts.search?.trim()) params.search = opts.search.trim();
      const body = obj((await http.get(`${BASE}/${kind}`, { params, ...withToken(opts.token) })).data, kind);
      const rows = arr(body[ROOT[kind]], ROOT[kind]).map((raw) => stripSecrets(kind, raw));
      const meta = (body.meta ?? {}) as { pagy?: { pages?: unknown } };
      const pages = typeof meta.pagy?.pages === "number" ? meta.pagy.pages : 1;
      return { rows, page, pages };
    }),

  /** The full record, secrets included: for the item screen's memory only. */
  show: (kind: SafeZoneKind, itemId: number, token: string) =>
    call(async () => toItem(kind, (await http.get(`${BASE}/${kind}/${itemId}`, withToken(token))).data)),

  /** A hard delete: the server keeps no trash. */
  remove: (kind: SafeZoneKind, itemId: number, token: string) =>
    call(async () => {
      await http.delete(`${BASE}/${kind}/${itemId}`, withToken(token));
    }),
};
