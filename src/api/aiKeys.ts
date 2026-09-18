/**
 * Your own AI provider key — `docs/design/profile/SPEC.md` §2.4.
 *
 * His words: *"that's great you have show how to add the key, this is great."*
 * Adding one means the assistant runs on your account and the spend is yours.
 *
 * ── THE KEY IS WRITE-ONLY, BY CONSTRUCTION ────────────────────────────────
 * `ai_keys_controller.rb`'s header: "The key is write-only over HTTP. It goes
 * in on create or update and is never returned — not on the response that
 * stored it, not afterwards." What comes back is `masked`, the provider, and
 * whether it verified.
 *
 * So there is no `apiKey` field on `AiKey` below, and the UI offers **Replace**
 * rather than an edit affordance on a field that could never be prefilled.
 *
 * ── THE VERIFICATION IS THE FEATURE ───────────────────────────────────────
 * `Ai::Keys.verify` puts the candidate key to the provider ONCE before storing
 * it, and nothing is written when the provider refuses — "a typo must fail here
 * rather than halfway through an agent run". The refusal carries **the
 * provider's own wording**, which is why `addKey` surfaces the server's message
 * instead of replacing it with "Something went wrong".
 *
 * ── AND EVERY ACTION RETURNS THE SAME SHAPE ───────────────────────────────
 * `providers` comes back on mutations too, and the controller records why that
 * had to be fixed: "adding a key replaced the cached payload with one that had
 * no provider list, and the rows it draws from that list vanished. The whole
 * section went blank on first use." So `parseKeyPayload` is used on EVERY
 * response, and a caller that caches one caches a complete one.
 */
import { http } from "./http";
import { arr, id as parseId, obj, optStr, str } from "./parse";

export interface AiKey {
  id: number;
  provider: string;
  /** e.g. `sk-…4f2a`. All a screen ever gets, and all it needs. */
  masked: string | null;
  /** At most one per user — the database enforces it with a unique index. */
  active: boolean;
  verified: boolean;
  verifiedAt: string | null;
  /** The provider's own words when it last refused. */
  verificationError: string | null;
}

/** A key somebody else lent this user. Usable, never readable — no mask, no
 *  last four. Rendered as one read-only line, because being told you are
 *  running on somebody else's key is not optional information. */
export interface BorrowedKey {
  provider: string;
  ownerName: string | null;
}

export interface AiKeyPayload {
  keys: AiKey[];
  /** From `Ai::Keys.offered` — never hardcoded here. */
  providers: string[];
  borrowed: BorrowedKey[];
}

function parseKey(payload: unknown): AiKey {
  const record = obj(payload, "ai_key");
  return {
    id: parseId(record.id, "ai_key.id"),
    provider: str(record.provider, "ai_key.provider"),
    masked: optStr(record.masked),
    active: typeof record.active === "boolean" ? record.active : false,
    verified: typeof record.verified === "boolean" ? record.verified : false,
    verifiedAt: optStr(record.verified_at),
    verificationError: optStr(record.verification_error),
  };
}

function parseBorrowed(payload: unknown): BorrowedKey {
  const record = obj(payload, "borrowed");
  return {
    provider: str(record.provider, "borrowed.provider"),
    ownerName: optStr(record.owner_name) ?? optStr(record.owner) ?? optStr(record.email),
  };
}

export function parseKeyPayload(payload: unknown): AiKeyPayload {
  const record = obj(payload, "ai_keys");
  return {
    keys: arr(record.ai_keys, "ai_keys.ai_keys").map(parseKey),
    providers: (Array.isArray(record.providers) ? record.providers : []).filter(
      (p): p is string => typeof p === "string",
    ),
    borrowed: (Array.isArray(record.borrowed) ? record.borrowed : []).map(parseBorrowed),
  };
}

/**
 * The provider refused the key, in its own words.
 *
 * Kept distinct from a transport failure because they call for opposite
 * actions: one means "check what you pasted", the other means "try again in a
 * moment". `Ai::Keys.verify` guarantees nothing was written either way.
 */
export class KeyRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyRefused";
  }
}

function refusalFrom(error: unknown): KeyRefused | null {
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (response?.status !== 422) return null;
  const body = response.data as { message?: unknown; error?: unknown } | undefined;
  // `render json: { message: [verdict.message], provider: … }` — an ARRAY.
  const message = Array.isArray(body?.message)
    ? body.message.filter((m): m is string => typeof m === "string").join(" ")
    : typeof body?.error === "string"
      ? body.error
      : null;
  return message ? new KeyRefused(message) : null;
}

export const aiKeysApi = {
  list: async (): Promise<AiKeyPayload> => {
    const res = await http.get("/api/v1/ai_keys");
    return parseKeyPayload(res.data);
  },

  /** Verified with the provider before it is stored. Nothing is written on a
   *  refusal, so a rejected paste cannot leave a dead key behind. */
  add: async (provider: string, apiKey: string): Promise<AiKeyPayload> => {
    try {
      const res = await http.post("/api/v1/ai_keys", {
        ai_key: { provider, api_key: apiKey },
      });
      return parseKeyPayload(res.data);
    } catch (error) {
      throw refusalFrom(error) ?? error;
    }
  },

  /** The same paste field, validated before it overwrites the old one. */
  replace: async (keyId: number, apiKey: string): Promise<AiKeyPayload> => {
    try {
      const res = await http.patch(`/api/v1/ai_keys/${keyId}`, {
        ai_key: { api_key: apiKey },
      });
      return parseKeyPayload(res.data);
    } catch (error) {
      throw refusalFrom(error) ?? error;
    }
  },

  /** At most one active key per user — the server promotes and demotes. */
  activate: async (keyId: number): Promise<AiKeyPayload> => {
    const res = await http.put(`/api/v1/ai_keys/${keyId}/activate`);
    return parseKeyPayload(res.data);
  },

  /**
   * Remove it. Answers with the whole list rather than `204`, because
   * "removing the active key promotes another, and the screen has to be told
   * which one without asking again".
   */
  remove: async (keyId: number): Promise<AiKeyPayload> => {
    const res = await http.delete(`/api/v1/ai_keys/${keyId}`);
    return parseKeyPayload(res.data);
  },
};

export const __parse = { parseKey, parseKeyPayload, refusalFrom };
