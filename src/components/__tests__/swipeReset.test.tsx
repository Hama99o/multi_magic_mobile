/**
 * A swipe offset must never outlive the row it belongs to (owner rule,
 * 2026-11-17: no transforms on recycled cells; Hello, 2026-11-20: keep
 * swipe-to-delete only if its state is reset on scroll and on data change).
 */
import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { act, render } from "@testing-library/react-native";
import { SwipeResetScope, useSwipeReset, useSwipeResetToken } from "../swipeReset";

const seen: { dx: Animated.Value | null } = { dx: null };
const report = (dx: Animated.Value) => {
  seen.dx = dx;
};
function Row({ id }: { id: number }) {
  const dx = useRef(new Animated.Value(0)).current;
  useSwipeReset(dx, id, () => undefined);
  useEffect(() => report(dx));
  return null;
}
const valueOf = (v: Animated.Value) => (v as unknown as { __getValue: () => number }).__getValue();

describe("useSwipeReset", () => {
  it("puts a half-swiped row back to 0 when the list scrolls", () => {
    const { rerender } = render(
      <SwipeResetScope token={0}>
        <Row id={1} />
      </SwipeResetScope>,
    );
    act(() => seen.dx!.setValue(-60));
    rerender(
      <SwipeResetScope token={1}>
        <Row id={1} />
      </SwipeResetScope>,
    );
    expect(valueOf(seen.dx!)).toBe(0);
  });

  it("and when the row is handed another record", () => {
    const { rerender } = render(
      <SwipeResetScope token={0}>
        <Row id={1} />
      </SwipeResetScope>,
    );
    act(() => seen.dx!.setValue(-60));
    rerender(
      <SwipeResetScope token={0}>
        <Row id={2} />
      </SwipeResetScope>,
    );
    expect(valueOf(seen.dx!)).toBe(0);
  });

  it("leaves a row alone while nothing changes", () => {
    const { rerender } = render(
      <SwipeResetScope token={0}>
        <Row id={1} />
      </SwipeResetScope>,
    );
    act(() => seen.dx!.setValue(-60));
    rerender(
      <SwipeResetScope token={0}>
        <Row id={1} />
      </SwipeResetScope>,
    );
    expect(valueOf(seen.dx!)).toBe(-60);
  });
});

describe("useSwipeResetToken", () => {
  it("bumps when the rows change and on request, not on every render", () => {
    let out: [number, () => void] = [0, () => undefined];
    const keep = (v: [number, () => void]) => {
      out = v;
    };
    function List({ ids }: { ids: number[] }) {
      const token = useSwipeResetToken(ids.join());
      useEffect(() => keep(token));
      return null;
    }
    const { rerender } = render(<List ids={[1, 2]} />);
    const first = out[0];
    rerender(<List ids={[1, 2]} />);
    rerender(<List ids={[1, 2]} />);
    expect(out[0]).toBe(first);
    rerender(<List ids={[2]} />);
    expect(out[0]).toBe(first + 1);
    act(() => out[1]());
    expect(out[0]).toBe(first + 2);
  });
});
