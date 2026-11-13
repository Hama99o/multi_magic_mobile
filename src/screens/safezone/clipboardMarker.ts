/**
 * The pending clipboard clear, written down so it survives a killed app
 * (`SECURITY.md` §6 and §9; device pass D12, 2026-11-13: a password copied,
 * the app force-stopped 3 s later, and the password still pasted in another
 * app, because the 30 s clear lived only in memory).
 *
 * What is stored, under `MARKER_KEY`: `{ mac, until }`.
 * - `mac` is an HMAC-SHA256 of the copied text under a random 32-byte key made
 *   once per install and kept in the secure store (`MARKER_SECRET_KEY`). Never
 *   the secret, and never a bare hash of it: a short password's SHA-256 falls
 *   to an offline guess, a keyed MAC does not without the key.
 * - `until` is the moment the clear is due.
 *
 * The guard (`clipboard.ts`) writes it on copy, drops it on every clear, and
 * reads it on launch and on return to the foreground (`sweep`). It can only
 * act when the app is opened again: until then the copy stays (§9).
 */
export const MARKER_KEY = "safezone_clipboard_pending";
export const MARKER_SECRET_KEY = "safezone_clipboard_key";
const KEY_BYTES = 32;
const BLOCK = 64;

export interface MarkerStore {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}
export type Sha256 = (bytes: Uint8Array) => Promise<Uint8Array>;
export interface Marker {
  mac: string;
  until: number;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/** HMAC-SHA256 (RFC 2104) over any SHA-256. */
export async function hmacSha256(key: Uint8Array, message: Uint8Array, sha256: Sha256): Promise<Uint8Array> {
  let k = key.length > BLOCK ? await sha256(key) : key;
  if (k.length < BLOCK) {
    const padded = new Uint8Array(BLOCK);
    padded.set(k);
    k = padded;
  }
  const ipad = k.map((x) => x ^ 0x36);
  const opad = k.map((x) => x ^ 0x5c);
  return sha256(concat(opad, await sha256(concat(ipad, message))));
}

/** Equal without an early exit, so the comparison time says nothing. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function createClipboardMarker(opts: { store: MarkerStore; digest: Sha256; randomBytes: (n: number) => Uint8Array; now?: () => number }) {
  const now = opts.now ?? (() => Date.now());
  const encode = (s: string) => new TextEncoder().encode(s);

  const key = async (): Promise<Uint8Array> => {
    const kept = await opts.store.getItemAsync(MARKER_SECRET_KEY);
    if (kept) return fromHex(kept);
    const made = opts.randomBytes(KEY_BYTES);
    await opts.store.setItemAsync(MARKER_SECRET_KEY, toHex(made));
    return made;
  };
  const macOf = async (text: string) => toHex(await hmacSha256(await key(), encode(text), opts.digest));

  return {
    /** Best effort: a store that fails must never stop the copy itself. */
    write: async (text: string, until: number) => {
      try {
        await opts.store.setItemAsync(MARKER_KEY, JSON.stringify({ mac: await macOf(text), until } satisfies Marker));
      } catch {
        // No marker: the in-memory timer still clears it if the app lives.
      }
    },
    read: async (): Promise<Marker | null> => {
      try {
        const raw = await opts.store.getItemAsync(MARKER_KEY);
        if (!raw) return null;
        const m = JSON.parse(raw) as Partial<Marker>;
        return typeof m.mac === "string" && typeof m.until === "number" ? { mac: m.mac, until: m.until } : null;
      } catch {
        return null;
      }
    },
    matches: async (text: string, marker: Marker) => {
      try {
        return same(await macOf(text), marker.mac);
      } catch {
        return false;
      }
    },
    remove: async () => {
      try {
        await opts.store.deleteItemAsync(MARKER_KEY);
      } catch {
        // Nothing more to do.
      }
    },
    now,
  };
}

export type ClipboardMarker = ReturnType<typeof createClipboardMarker>;
