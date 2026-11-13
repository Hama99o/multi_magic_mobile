/**
 * Is the SafeZone vault open? (`docs/design/safezone/SECURITY.md` §2–§4)
 *
 * MEMORY ONLY: no `persist`. A cold start asks for the PIN again. The token's
 * expiry is the server's `expires_in`, never extended here; `needsRefresh`
 * says when to ask the server to slide it. The lockout and the attempts left
 * are the server's numbers; this store counts nothing itself.
 *
 * `lock()` drops the token, increments `lockEpoch` (the item screen wipes its
 * secrets when it changes) and calls every `onSafezoneLock` listener (the
 * clipboard clear, the query cache). A `403 safezone_pin_locked` from any
 * SafeZone call locks it too (registered with the API below).
 */
import { create } from "zustand";
import { setSafezoneLockedHandler, type PinStatus, type UnlockGrant } from "@/api/safezone";

export type LockStatus =
  | { kind: "unknown" }
  | { kind: "notEnabled" }
  | { kind: "locked"; attemptsLeft: number | null }
  | { kind: "lockedOut"; until: string }
  | { kind: "unlocked" };

interface LockState {
  status: LockStatus;
  token: string | null;
  expiresAt: number | null;
  ttlMs: number;
  lockEpoch: number;
  fromPinStatus: (pin: PinStatus) => void;
  unlocked: (grant: UnlockGrant, now?: number) => void;
  wrongPin: (attemptsLeft: number | null) => void;
  lockedOut: (until: string) => void;
  lock: () => void;
  liveToken: (now?: number) => string | null;
  needsRefresh: (now?: number) => boolean;
  expireIfDue: (now?: number) => void;
  reset: () => void;
}

const listeners = new Set<() => void>();

export function onSafezoneLock(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const INITIAL = { status: { kind: "unknown" } as LockStatus, token: null, expiresAt: null, ttlMs: 0 };

export const useSafezoneLock = create<LockState>((set, get) => ({
  ...INITIAL,
  lockEpoch: 0,

  fromPinStatus: (pin) => {
    if (!pin.enabled) set({ status: { kind: "notEnabled" }, token: null, expiresAt: null });
    else if (pin.lockedOut && pin.lockedUntil) set({ status: { kind: "lockedOut", until: pin.lockedUntil }, token: null, expiresAt: null });
    else if (get().status.kind !== "unlocked") set({ status: { kind: "locked", attemptsLeft: pin.attemptsLeft } });
  },

  unlocked: (grant, now = Date.now()) =>
    set({ status: { kind: "unlocked" }, token: grant.token, ttlMs: grant.expiresIn * 1000, expiresAt: now + grant.expiresIn * 1000 }),

  wrongPin: (attemptsLeft) => set({ status: { kind: "locked", attemptsLeft } }),

  lockedOut: (until) => set({ status: { kind: "lockedOut", until }, token: null, expiresAt: null }),

  lock: () => {
    const { status, lockEpoch } = get();
    const next: LockStatus =
      status.kind === "notEnabled" || status.kind === "lockedOut" ? status : { kind: "locked", attemptsLeft: null };
    set({ status: next, token: null, expiresAt: null, lockEpoch: lockEpoch + 1 });
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        // One listener failing must not keep the others from wiping.
      }
    }
  },

  liveToken: (now = Date.now()) => {
    const { token, expiresAt } = get();
    return token && expiresAt !== null && now < expiresAt ? token : null;
  },

  needsRefresh: (now = Date.now()) => {
    const { expiresAt, ttlMs } = get();
    if (!get().liveToken(now) || expiresAt === null) return false;
    return expiresAt - now < ttlMs / 2;
  },

  expireIfDue: (now = Date.now()) => {
    if (get().token && !get().liveToken(now)) get().lock();
  },

  reset: () => set({ ...INITIAL, lockEpoch: 0 }),
}));

setSafezoneLockedHandler(() => useSafezoneLock.getState().lock());
