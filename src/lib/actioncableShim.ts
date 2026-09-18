/**
 * MAKE `@rails/actioncable` SURVIVE REACT NATIVE. Imported for its side effect,
 * before the library, by `lib/cable.ts`.
 *
 * ── The actual blocker ────────────────────────────────────────────────────
 * "@rails/actioncable works in React Native" is very nearly true, and the part
 * that is not true stops the socket dead:
 *
 *   ConnectionMonitor.start()  ->  addEventListener("visibilitychange", …)
 *   ConnectionMonitor.stop()   ->  removeEventListener("visibilitychange", …)
 *
 * (`actioncable.esm.js:30` and `:38`.) Those are BARE globals — `window.` is
 * implied in a browser and simply absent in Hermes. `start()` runs on every
 * `connection.open()`, so the first connect throws `ReferenceError:
 * addEventListener is not defined` before a single frame is delivered.
 *
 * Two other browser-only paths exist and neither is reachable for us:
 *   - `createWebSocketURL` touches `document.createElement` ONLY for a URL that
 *     is not already absolute `ws:`/`wss:` (`:491`). Ours always is.
 *   - `getConfig` reads a `<meta>` tag ONLY when `createConsumer()` is called
 *     with no URL (`:506`). We always pass one.
 *
 * ── Why the shim is a NO-OP and not a real event system ───────────────────
 * The monitor's listener exists to reopen a connection that went stale while a
 * browser tab was hidden. React Native's equivalent of that signal is not
 * `visibilitychange` — it is `AppState`, which reports background/foreground
 * for the whole app and is the thing that actually fires when a phone is
 * pocketed or a call comes in.
 *
 * So rather than fake a DOM event the platform never emits, the listener is
 * accepted and dropped, and `lib/cable.ts` drives the same recovery from
 * `AppState` directly. That is the case the brief cares most about: an answer
 * that lands while the app is backgrounded has to be there on return.
 *
 * Nothing else in the app may rely on these globals — they are installed for
 * one library's benefit and do nothing.
 */
type Listener = (...args: unknown[]) => void;

const scope = globalThis as typeof globalThis & {
  addEventListener?: Listener;
  removeEventListener?: Listener;
};

let installed = false;

export function installActionCableShim(): void {
  if (installed) return;
  installed = true;

  if (typeof scope.addEventListener !== "function") {
    scope.addEventListener = () => {
      // Deliberately dropped. See the header: AppState is the real signal, and
      // cable.ts subscribes to it.
    };
  }
  if (typeof scope.removeEventListener !== "function") {
    scope.removeEventListener = () => {};
  }
}

/** Test seam — lets a suite assert the shim is required, not merely present. */
export function __shimInstalled(): boolean {
  return installed;
}
