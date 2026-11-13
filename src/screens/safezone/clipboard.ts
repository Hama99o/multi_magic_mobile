/**
 * Copy a secret, and take it back off the clipboard (`SECURITY.md` §6).
 *
 * - Cleared `CLIPBOARD_CLEAR_MS` after the copy, on lock (`clearNow`), and on
 *   return to the app if the timer slept in the background (`clearIfDue`).
 * - Android: cleared only if the clipboard still holds what we copied,
 *   compared by a hash, so the guard keeps no copy of the secret while it
 *   waits. Reading is silent there.
 * - iOS: reading the pasteboard shows the system "Allow paste" prompt, so it
 *   is cleared without reading. Something the person copied elsewhere in
 *   those 30 s is cleared too; that is the trade-off, written down.
 */
export const CLIPBOARD_CLEAR_MS = 30_000;

export interface ClipboardLike {
  setStringAsync: (text: string) => Promise<boolean>;
  getStringAsync: () => Promise<string>;
}

/** FNV-1a: a fingerprint to compare with, not a protection. */
function fingerprint(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

type SetTimer = (fn: () => void, ms: number) => () => void;
const defaultTimer: SetTimer = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export function createClipboardGuard(opts: {
  clipboard: ClipboardLike;
  platform: string;
  ms?: number;
  now?: () => number;
  setTimer?: SetTimer;
}) {
  const ms = opts.ms ?? CLIPBOARD_CLEAR_MS;
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? defaultTimer;
  let pending: { until: number; mark: number } | null = null;
  let cancel: (() => void) | null = null;

  const clear = async () => {
    const was = pending;
    pending = null;
    cancel?.();
    cancel = null;
    if (!was) return;
    try {
      if (opts.platform === "android") {
        const current = await opts.clipboard.getStringAsync();
        if (fingerprint(current) !== was.mark) return;
      }
      await opts.clipboard.setStringAsync("");
    } catch {
      // A clipboard that cannot be read or written: nothing more to do here.
    }
  };

  return {
    copy: async (value: string) => {
      cancel?.();
      await opts.clipboard.setStringAsync(value);
      pending = { until: now() + ms, mark: fingerprint(value) };
      cancel = setTimer(() => void clear(), ms);
    },
    clearIfDue: async () => {
      if (pending && now() >= pending.until) await clear();
    },
    clearNow: clear,
    pendingUntil: () => pending?.until ?? null,
    /** For the test that proves no secret is kept. */
    debugState: () => ({ pending }),
  };
}

export type ClipboardGuard = ReturnType<typeof createClipboardGuard>;
