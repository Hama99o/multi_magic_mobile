/**
 * SWIPE STATE NEVER OUTLIVES ITS ROW.
 *
 * The owner's list rule (2026-11-17): no transform on a recycled cell, because
 * a cell keeps a stale offset and the list shows shifted rows. Swipe-to-delete
 * is a `translateX` that a user drives, so it stays only on these terms
 * (Hello, 2026-11-20):
 *  - every list keys its rows by record id (`keyExtractor`), so a swipe
 *    belongs to one record;
 *  - the offset goes back to 0 the moment the list scrolls (`onScrollBeginDrag`)
 *    or its data changes, and whenever the row is handed another record.
 *
 * A list wraps its rows in `<SwipeResetScope token={…}>` and bumps the token
 * (`useSwipeResetToken`); a row calls `useSwipeReset(dx, id, onClose)`.
 * Proven on a device by deleting a row and scrolling fast both ways
 * (`docs/design/hygiene-step0/MANIFEST.md`, A3).
 */
import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type { Animated } from "react-native";

const Token = createContext(0);

export function SwipeResetScope({ token, children }: { token: number; children: ReactNode }) {
  return <Token.Provider value={token}>{children}</Token.Provider>;
}

/**
 * A list's token: bumped on every scroll start and whenever the rows change.
 * `rowsKey` is a string (the rows' ids, joined), never the array itself: a
 * list built afresh each render would bump the token each render, for ever.
 */
export function useSwipeResetToken(rowsKey: string): [number, () => void] {
  const [token, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    bump();
  }, [rowsKey]);
  return [token, bump];
}

/** Puts `dx` back to 0, and closes the row's swipe chrome, when the scope resets or the row changes record. */
export function useSwipeReset(dx: Animated.Value, id: number | string, onClose: () => void): void {
  const token = useContext(Token);
  useEffect(() => {
    dx.stopAnimation();
    dx.setValue(0);
    onClose();
    // `onClose` is a fresh closure each render; only the token and the record matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, dx]);
}
