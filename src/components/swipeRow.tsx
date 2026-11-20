/**
 * THE SWIPE ON A LIST ROW (tasks, expenses, incomes, loans): one rule, here.
 *
 * Hello for the owner, 2026-11-20, after a device pass saw a "half" swipe
 * delete a second expense (the old rule acted past a fixed 96 dp, about a
 * quarter of a phone): the standard pattern.
 *   - A short swipe springs back.
 *   - A partial swipe OPENS the row on its action's button (Delete, or a
 *     task's Done); a tap on the button acts, a tap on the row closes it.
 *   - Only a long swipe, 60% of the row or more, acts at once, and every
 *     delete still offers Undo (the screens do that, as before).
 *
 * An open row closes when the list scrolls or its rows change: `useSwipeReset`
 * (the owner's rule for recycled cells, no stale offset). Only `translateX` on
 * the row's own content moves, and only while the person drags.
 */
import { useCallback, useRef, useState } from "react";
import { Animated, PanResponder, type LayoutChangeEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { useSwipeReset } from "./swipeReset";

/** How far an open row slides to show its button. */
export const REVEAL = 88;
/** A swipe past this part of the row acts at once. */
export const ACT_FRACTION = 0.6;
/** Short of this, a swipe springs back. */
const OPEN_AT = 48;

export type SwipeSide = "left" | "right";

/** Where a released swipe goes: act at once, rest open on a button, or close. Pure. */
export function releaseOutcome(dx: number, width: number, opts: { right: boolean; from?: number }): { act: SwipeSide | null; rest: number } {
  const x = opts.right ? dx : Math.min(0, dx);
  if (Math.abs(x) >= ACT_FRACTION * width) return { act: x < 0 ? "left" : "right", rest: 0 };
  // Swiped back towards closed from an open row: close.
  if (opts.from && Math.sign(x) === Math.sign(opts.from) && Math.abs(x) < Math.abs(opts.from) - 24) return { act: null, rest: 0 };
  if (Math.abs(x) >= OPEN_AT) return { act: null, rest: x < 0 ? -REVEAL : REVEAL };
  return { act: null, rest: 0 };
}

export function useSwipeRow({ id, right = false, onLeft, onRight }: { id: number | string; right?: boolean; onLeft: () => void; onRight?: () => void }) {
  const dx = useRef(new Animated.Value(0)).current;
  const rest = useRef(0);
  const width = useRef(360);
  const [side, setSide] = useState<SwipeSide | null>(null);
  const [open, setOpen] = useState<SwipeSide | null>(null);
  const passed = useRef(false);
  const handlers = useRef({ onLeft, onRight });
  handlers.current = { onLeft, onRight };

  const settle = useCallback(
    (to: number) => {
      rest.current = to;
      setOpen(to < 0 ? "left" : to > 0 ? "right" : null);
      Animated.spring(dx, { toValue: to, useNativeDriver: true, bounciness: 4 }).start(() => {
        if (to === 0) setSide(null);
      });
    },
    [dx],
  );
  const close = useCallback(() => settle(0), [settle]);
  useSwipeReset(dx, id, () => {
    rest.current = 0;
    setOpen(null);
    setSide(null);
  });

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && (right || g.dx < 0 || rest.current < 0),
      onPanResponderGrant: () => {
        passed.current = false;
      },
      onPanResponderMove: (_e, g) => {
        const x = rest.current + g.dx;
        const shown = right ? x : Math.min(0, x);
        dx.setValue(shown);
        setSide(shown < 0 ? "left" : shown > 0 ? "right" : null);
        const over = Math.abs(shown) >= ACT_FRACTION * width.current;
        if (over !== passed.current) {
          passed.current = over;
          if (over) void Haptics.selectionAsync().catch(() => undefined);
        }
      },
      onPanResponderRelease: (_e, g) => {
        const out = releaseOutcome(rest.current + g.dx, width.current, { right, from: rest.current });
        settle(out.rest);
        if (out.act === "left") handlers.current.onLeft();
        if (out.act === "right") handlers.current.onRight?.();
      },
      onPanResponderTerminate: () => settle(rest.current),
    }),
  ).current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width || width.current;
  }, []);

  /** The open button's own press: act, and close. */
  const actOpen = useCallback(() => {
    const was = open;
    close();
    if (was === "left") handlers.current.onLeft();
    if (was === "right") handlers.current.onRight?.();
  }, [open, close]);

  return { dx, side, open, close, actOpen, panHandlers: pan.panHandlers, onLayout };
}
