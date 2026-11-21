/**
 * A CREATE, A DELETE, A SUBMIT: ONCE AT A TIME (hidden-criteria sweep, 2026-11-21).
 *
 * `disabled={mutation.isPending}` is not a double-tap guard. The second tap of
 * a double tap arrives before React has re-rendered the button as disabled,
 * so both presses run and the server gets two rows, two forms, two imports.
 * The sweep's tests press twice in the same frame (`doubleTap`) and count the
 * requests. This keeps the guard in a ref, which the second press reads at
 * once, and releases it only when the work has finished, so pass
 * `mutateAsync` (or any promise), not `mutate`. The pattern is the one
 * `app/contacts/edit.tsx` and `app/calendar/edit.tsx` already use.
 */
import { useCallback, useRef } from "react";

export function useOneAtATime() {
  const inFlight = useRef(false);
  return useCallback((work: () => Promise<unknown> | unknown) => {
    if (inFlight.current) return;
    inFlight.current = true;
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(work());
    } catch (e) {
      inFlight.current = false;
      throw e;
    }
    // The work reports its own failure (a message, a toast); the guard only needs to know it ended.
    pending.catch(() => undefined).finally(() => {
      inFlight.current = false;
    });
  }, []);
}
