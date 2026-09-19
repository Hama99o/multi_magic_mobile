/**
 * CAN WE REACH MULTIMAGIC? — observed, never assumed.
 *
 * ── Why this is not a native reachability module ──────────────────────────
 * Two reasons, tonight and in general. Tonight: a native module absent from
 * the binary throws at import and takes the whole import chain down — the
 * exact bug `expo-speech-recognition` already caused in Expo Go — and both
 * binaries being driven this evening (the dev build on the emulator, the first
 * iOS preview) were built without one. In general: it answers the wrong
 * question. "The phone has WiFi" is not "MultiMagic answers". A server
 * restart, a captive portal, a DNS that resolves and a port that does not all
 * read as online to a reachability module and as offline to this app.
 *
 * So this store records what actually happened. Every response marks the
 * server REACHED — whatever the status; a 500 is a server that answered — and
 * every request that got no response at all marks it NOT reached. While not
 * reached, a probe asks `GET /up` (Rails' own health check, outside the API
 * namespace, no auth) every few seconds and the first answer flips it back.
 * The cable's `connected` is a third witness and usually the earliest. Nothing
 * spins while everything is fine: the probe exists only between a failure and
 * the next success.
 *
 * `reachable` starts TRUE. An app that opens saying "offline" before it has
 * asked anything is lying with a straight face; the first request tells.
 */
import { create } from "zustand";
import { AppState } from "react-native";
import { http, setReachabilityHandler } from "@/api/http";

/** Between probes while unreachable. Short enough that a banner comes down
 *  soon after a tunnel; long enough not to be a poll storm on a dead link. */
export const PROBE_MS = 5_000;

interface ReachabilityState {
  reachable: boolean;
  /** When it stopped answering, so a sentence can say how long. */
  unreachableSince: number | null;
  markReachable: () => void;
  markUnreachable: () => void;
}

let probe: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

async function ping(): Promise<void> {
  try {
    // The interceptors record the outcome either way; nothing to do with the
    // result here. A short timeout: a probe that hangs 15 s is a slow "no".
    await http.get("/up", { timeout: 4_000 });
  } catch {
    // Still down, and already recorded by the interceptor.
  }
}

function startProbe(): void {
  if (probe) return;
  probe = setInterval(() => void ping(), PROBE_MS);
  if (!appStateSub) {
    // Coming back from the background is the moment a connection has most
    // likely changed — ask at once rather than waiting out the interval.
    appStateSub = AppState.addEventListener("change", (status) => {
      if (status === "active") void ping();
    });
  }
}

function stopProbe(): void {
  if (probe) {
    clearInterval(probe);
    probe = null;
  }
  appStateSub?.remove();
  appStateSub = null;
}

export const useReachability = create<ReachabilityState>((set, get) => ({
  reachable: true,
  unreachableSince: null,

  markReachable: () => {
    stopProbe();
    if (!get().reachable) set({ reachable: true, unreachableSince: null });
  },

  markUnreachable: () => {
    if (get().reachable) set({ reachable: false, unreachableSince: Date.now() });
    startProbe();
  },
}));

/** Called once at boot, beside `wireAuthStore`. */
export function wireReachability(): void {
  setReachabilityHandler((reached) => {
    const state = useReachability.getState();
    if (reached) state.markReachable();
    else state.markUnreachable();
  });
}

/** Test seam: back to the launch state with no timer left running. */
export function __resetReachability(): void {
  stopProbe();
  useReachability.setState({ reachable: true, unreachableSince: null });
}
