/**
 * The end of a session (sign-out, forced or not): modules that hold
 * per-session secrets register here, so the auth store does not import them.
 * SafeZone's lock store locks and wipes its unlock window (2026-11-15).
 */
const handlers = new Set<() => void>();

export function onSessionEnd(fn: () => void): () => void {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

export function endSession(): void {
  for (const fn of [...handlers]) {
    try {
      fn();
    } catch {
      // One handler failing must not keep the others from running.
    }
  }
}
